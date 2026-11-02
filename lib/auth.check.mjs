// Self-check for the session cookie flags — the security-relevant pure part of
// lib/auth.js. Run: node lib/auth.check.mjs
import assert from 'node:assert/strict';

// Redis.fromEnv() runs at module load and throws without these. No network call
// is made by constructing the client, so stub values are enough.
process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'stub';
delete process.env.VERCEL;

const { setCookie, clearCookie, randomToken, readSessionRecord, signInRecord } = await import('./auth.js');

/* ---- session records carry which door they came in through ---- */

assert.deepEqual(readSessionRecord({ uid: 'u1', gm: true }), { uid: 'u1', gm: true });
assert.deepEqual(readSessionRecord({ uid: 'u1' }), { uid: 'u1', gm: false });
// Sessions minted before the GM door existed stored a bare uid string. They
// read as player sessions rather than crashing or logging everyone out.
assert.deepEqual(readSessionRecord('u-legacy'), { uid: 'u-legacy', gm: false });
assert.equal(readSessionRecord(null), null);
assert.equal(readSessionRecord(undefined), null);
// anything truthy but odd still cannot claim GM
assert.deepEqual(readSessionRecord({ uid: 'u1', gm: 'yes' }), { uid: 'u1', gm: true });
assert.deepEqual(readSessionRecord({ uid: 'u1', gm: 0 }), { uid: 'u1', gm: false });

// minimal stand-in for the Vercel response object
const fakeRes = () => {
  const headers = {};
  return {
    headers,
    getHeader: (k) => headers[k],
    setHeader: (k, v) => { headers[k] = v; }
  };
};

// a session cookie must not be readable by script, must be path-wide, and must
// survive the cross-site redirect back from Google (Lax, not Strict)
let res = fakeRes();
setCookie(res, 'sid', 'abc', 100);
const cookie = res.getHeader('Set-Cookie');
assert.ok(cookie.includes('sid=abc'));
assert.ok(cookie.includes('HttpOnly'), 'session cookie must be HttpOnly');
assert.ok(cookie.includes('Path=/'));
assert.ok(cookie.includes('SameSite=Lax'), 'Strict would break the OAuth return');
assert.ok(cookie.includes('Max-Age=100'));

// off Vercel (`vercel dev` serves plain http) Secure would drop the cookie
assert.ok(!cookie.includes('Secure'), 'no Secure off-platform');

// on Vercel it must be there
process.env.VERCEL = '1';
res = fakeRes();
setCookie(res, 'sid', 'abc', 100);
assert.ok(res.getHeader('Set-Cookie').includes('Secure'), 'Secure required on Vercel');
delete process.env.VERCEL;

// two cookies in one response accumulate instead of overwriting — the callback
// clears gstate and sets sid in the same response
res = fakeRes();
setCookie(res, 'gstate', '', 0);
setCookie(res, 'sid', 'xyz', 100);
const both = res.getHeader('Set-Cookie');
assert.ok(Array.isArray(both) && both.length === 2, 'both cookies must survive');
assert.ok(both.some((c) => c.startsWith('gstate=')));
assert.ok(both.some((c) => c.startsWith('sid=xyz')));

// clearing expires immediately
res = fakeRes();
clearCookie(res, 'sid');
assert.ok(res.getHeader('Set-Cookie').includes('Max-Age=0'));

// session tokens are 32 bytes of hex and not repeated
assert.match(randomToken(), /^[0-9a-f]{64}$/);
assert.notEqual(randomToken(), randomToken());

/* ---- signing in must not erase what the account already holds ----
   The callback used to write { email, name, chars } as the whole record, so a
   sign-in on a second device dropped the deck and ground indexes, the homebrew
   library and the tables, and the first device's maps were gone. */
{
  const account = {
    email: 'old@example.com', name: 'Old Name',
    chars: [{ id: 'c1', name: 'Zed' }],
    decks: [{ id: 'd1', name: 'Hulk deck', cols: 40, rows: 30 }],
    grounds: [{ id: 'g1', name: 'Rust floor' }],
    homebrew: { hulls: [{ id: 'h1' }], encounters: [{ id: 'e1' }], voidcharts: [{ id: 'v1' }] },
    dynasties: ['ABCD12', 'WXYZ34']
  };
  const after = signInRecord(account, { email: 'new@example.com', name: 'New Name' });
  assert.equal(after.email, 'new@example.com', 'identity is refreshed');
  assert.equal(after.name, 'New Name');
  assert.deepEqual(after.chars, account.chars);
  assert.deepEqual(after.decks, account.decks, 'the deck index survives a sign-in');
  assert.deepEqual(after.grounds, account.grounds, 'and the ground index');
  assert.deepEqual(after.homebrew, account.homebrew, 'and the homebrew library');
  assert.deepEqual(after.dynasties, account.dynasties, 'and the tables it belongs to');
  assert.deepEqual(account.email, 'old@example.com', 'the stored record is not mutated');
  // a field this code has never heard of is kept too
  assert.equal(signInRecord({ chars: [], futureThing: { a: 1 } }, { email: 'e', name: 'n' }).futureThing.a, 1);
  // a first sign-in, and a damaged record, still give a usable one
  assert.deepEqual(signInRecord(null, { email: 'e', name: 'n' }), { email: 'e', name: 'n', chars: [] });
  assert.deepEqual(signInRecord(undefined, { email: 'e', name: 'n' }), { email: 'e', name: 'n', chars: [] });
  assert.deepEqual(signInRecord('junk', { email: 'e', name: 'n' }), { email: 'e', name: 'n', chars: [] });
  assert.deepEqual(signInRecord([1, 2], { email: 'e', name: 'n' }), { email: 'e', name: 'n', chars: [] });
  assert.deepEqual(signInRecord({ chars: 'broken' }, { email: 'e', name: 'n' }).chars, [], 'a non-list chars becomes one');
}

console.log('auth: all checks passed');
