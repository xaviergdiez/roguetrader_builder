// Self-check for Redis env resolution. Run: node lib/storage.check.mjs
import assert from 'node:assert/strict';

// the module builds a client at load, so give it something valid first
process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'stub';

const { redisConfigFromEnv, NS, charKey, isCharId, homebrewKey, deckKey, groundKey } = await import('./storage.js');
const { newId } = await import('../src/roster.js');
const newIdShape = newId();

// the canonical names win when both pairs are set
assert.deepEqual(
  redisConfigFromEnv({
    UPSTASH_REDIS_REST_URL: 'https://a', UPSTASH_REDIS_REST_TOKEN: 'ta',
    KV_REST_API_URL: 'https://b', KV_REST_API_TOKEN: 'tb'
  }),
  { url: 'https://a', token: 'ta' }
);

// Vercel's integration only sets the KV_ names — this is the case that was
// broken: fromEnv() ignores them entirely
assert.deepEqual(
  redisConfigFromEnv({ KV_REST_API_URL: 'https://b', KV_REST_API_TOKEN: 'tb' }),
  { url: 'https://b', token: 'tb' }
);

// `vercel env pull` writes unused names as "" — an empty string must not win
// over a populated fallback, which is exactly what broke the first deploy
assert.deepEqual(
  redisConfigFromEnv({
    UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '',
    KV_REST_API_URL: 'https://b', KV_REST_API_TOKEN: 'tb'
  }),
  { url: 'https://b', token: 'tb' }
);

// whitespace-only counts as absent too, and values are trimmed
assert.deepEqual(
  redisConfigFromEnv({ UPSTASH_REDIS_REST_URL: '   ', KV_REST_API_URL: ' https://b ' }).url,
  'https://b'
);

// nothing configured resolves to nulls, so the caller can throw a clear error
assert.deepEqual(redisConfigFromEnv({}), { url: null, token: null });

// the two halves resolve independently — a mixed pair must still work
assert.deepEqual(
  redisConfigFromEnv({ UPSTASH_REDIS_REST_URL: 'https://a', KV_REST_API_TOKEN: 'tb' }),
  { url: 'https://a', token: 'tb' }
);

// the namespace guards against sharing a user record with the other two builds
assert.equal(NS, 'rt:');

/* ---- character ids reach charKey from the client, so they are validated ---- */

assert.equal(charKey('u1', 'c2'), 'rt:char:u1:c2');

assert.ok(isCharId('c2'));
assert.ok(isCharId(newIdShape));                 // what roster.js actually mints
assert.ok(isCharId('a-b_C9'));

// A separator or glob would let a caller address keys outside their own
// character — including another user's, since uid and cid share the key.
for (const bad of [':', 'a:b', '*', 'a*', 'rt:user:1', 'a b', '', '.', '..',
  'a/b', 'x'.repeat(65), null, undefined, 7, {}]) {
  assert.equal(isCharId(bad), false, `${JSON.stringify(bad)} must be refused`);
}

console.log('storage: char keys OK');

// the homebrew library has a key of its own, in this app's namespace and apart from every other kind
assert.equal(homebrewKey('u1'), `${NS}homebrew:u1`);
assert.notEqual(homebrewKey('u1'), `${NS}user:u1`, 'not the account record');
assert.ok(![charKey('u1', 'x'), deckKey('u1', 'x'), groundKey('u1', 'x')].includes(homebrewKey('u1')));

console.log('storage: all checks passed');

/* ---- a deck's key is its own, and namespaced ---- */
{
  const { deckKey, groundKey } = await import('./storage.js');
  assert.equal(deckKey('u1', 'bmap-1'), 'rt:deck:u1:bmap-1');
  assert.notEqual(deckKey('u1', 'x'), groundKey('u1', 'x'), 'decks and grounds never share a key');
  console.log('storage.js: deck key ok');
}
