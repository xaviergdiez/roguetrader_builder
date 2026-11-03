// Self-check for the ground store's shared pieces and the finding of lost grounds.
// Run: node lib/grounds.check.mjs
import assert from 'node:assert/strict';

// storage.js builds a Redis client at load; no call is made, so stub values do.
process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'stub';
const { meta, text, colour, num, runGroundsReindex, REINDEX_MAX, MAX_GROUNDS, IMAGE_URL } = await import('./grounds.js');

/* ---- the entry the endpoint writes ---- */
{
  const e = meta('g1', { name: '  Rust floor ', prompt: 'p', grid: '#112233', wash: 9, gridAlpha: 0 }, true, 77);
  assert.deepEqual(e, {
    id: 'g1', name: 'Rust floor', subtitle: '', prompt: 'p', grid: '#112233', accent: '#8a7442', fallback: '#2a2a24',
    wash: 0.5, gridAlpha: 0.11, sprites: true, updatedAt: 77
  });
  assert.equal(meta('g2', {}, false).name, 'Saved ground');
  assert.equal(meta('g2', {}, 0).sprites, false);
  assert.equal(text('x'.repeat(200)).length, 60);
  assert.equal(colour('red', '#000000'), '#000000');
  assert.equal(num('nope', 5, 0, 9), 5);
  assert.ok(IMAGE_URL.test('data:image/webp;base64,AAAA') && !IMAGE_URL.test('data:text/html;base64,AAAA'));
}

/* ---- finding the floors an account's index has lost ---- */
{
  const PREFIX = 'rt:ground:u1:';
  const FLOOR = (n) => `data:image/png;base64,${'A'.repeat(40 + n)}`;
  const kv = new Map();
  let scans = 0;
  const redis = {
    get: async (k) => kv.get(k) ?? null,
    set: async (k, v) => { kv.set(k, v); },
    del: async (k) => { kv.delete(k); },
    scan: async (cursor, { match = '*' } = {}) => {            // pages of three, as a real SCAN may
      scans++;
      const all = [...kv.keys()].filter((k) => match.endsWith('*') && k.startsWith(match.slice(0, -1))).sort();
      const at = Number(cursor) || 0;
      const page = all.slice(at, at + 3);
      return [at + page.length >= all.length ? '0' : String(at + page.length), page];
    }
  };

  // an account whose index was wiped: floors stored, one with props, one still listed
  const user = {
    email: 'a@b.c', chars: [{ id: 'c1' }], homebrew: { hulls: [{ id: 'h' }] }, decks: [{ id: 'd1' }],
    grounds: [{ id: 'kept', name: 'My own name', prompt: 'a prompt', grid: '#010203', sprites: false }]
  };
  kv.set(PREFIX + 'kept', FLOOR(0));
  kv.set(PREFIX + 'lost-a', FLOOR(1));
  kv.set(PREFIX + 'lost-b', FLOOR(2));
  kv.set(PREFIX + 'lost-b:sprites', FLOOR(9));                     // lost-b has props
  kv.set(PREFIX + 'lost-c', 'not an image');                        // a damaged floor
  kv.set(PREFIX + 'orphan-sheet:sprites', FLOOR(5));               // props with no floor: not a ground
  kv.set('rt:ground:u2:theirs', FLOOR(3));                         // another account's
  kv.set('rt:deck:u1:a-deck', 'x');                                 // not a ground at all
  const before = new Map(kv);
  let saved = 0;
  const run = (o = {}) => runGroundsReindex({ user, redis, prefix: PREFIX, save: async () => { saved++; }, now: 555, ...o });

  const out = await run();
  assert.equal(out.status, 200);
  assert.equal(out.json.recovered, 2);
  assert.deepEqual(out.json.grounds.map((g) => g.id).sort(), ['lost-a', 'lost-b']);
  assert.equal(out.json.unreadable, 1, 'a damaged floor is counted, not listed');
  assert.equal(out.json.remaining, 0);
  assert.ok(scans > 1, 'the walk followed the cursor across pages');
  const byId = Object.fromEntries(out.json.grounds.map((g) => [g.id, g]));
  assert.equal(byId['lost-a'].sprites, false);
  assert.equal(byId['lost-b'].sprites, true, 'the props sheet sets the flag');
  for (const g of out.json.grounds) {
    assert.match(g.name, /^Recovered environment \d$/);
    assert.equal(g.grid, '#8fe0a8', 'the ordinary defaults, since the originals were in the lost entry');
    assert.equal(g.updatedAt, 555);
    assert.equal(g.texture, undefined, 'an entry carries no floor');
  }
  assert.deepEqual(out.json.grounds.map((g) => g.name).sort(), ['Recovered environment 1', 'Recovered environment 2']);
  assert.equal(user.grounds.length, 3);
  assert.equal(saved, 1);

  // nothing but the index changed
  assert.deepEqual(user.grounds[0], { id: 'kept', name: 'My own name', prompt: 'a prompt', grid: '#010203', sprites: false }, 'an existing entry is untouched');
  assert.deepEqual(user.chars, [{ id: 'c1' }]);
  assert.deepEqual(user.homebrew, { hulls: [{ id: 'h' }] });
  assert.deepEqual(user.decks, [{ id: 'd1' }]);
  assert.deepEqual([...kv.entries()], [...before.entries()], 'no floor, no sheet and no other account\'s data was written');
  assert.ok(!user.grounds.some((g) => g.id === 'theirs' || g.id === 'orphan-sheet' || g.id === 'a-deck'));

  // again: nothing found, nothing saved
  saved = 0;
  const again = await run();
  assert.equal(again.json.recovered, 0);
  assert.equal(saved, 0);
  assert.equal(again.json.unreadable, 1);

  // the cap per request and the library's limit, on a store of its own
  kv.clear();
  const total = REINDEX_MAX + 5;
  for (let i = 0; i < total; i++) kv.set(PREFIX + 'bulk' + String(i).padStart(3, '0'), FLOOR(i));
  const big = { grounds: [] };
  const first = await run({ user: big });
  assert.equal(first.json.recovered, REINDEX_MAX);
  assert.equal(first.json.remaining, 5);
  const second = await run({ user: big });
  assert.equal(second.json.recovered, 5);
  assert.equal(second.json.remaining, 0);
  assert.equal(new Set(big.grounds.map((g) => g.id)).size, total, 'none listed twice');
  assert.equal(big.grounds[big.grounds.length - 1].name, `Recovered environment ${total}`, 'numbered on across requests');
  const full = { grounds: Array.from({ length: MAX_GROUNDS }, (_, i) => ({ id: 'f' + i, name: 'f' })) };
  const none = await run({ user: full });
  assert.equal(none.json.recovered, 0);
  assert.ok(none.json.remaining > 0, 'a full library says there are more');

  // refusals
  for (const bad of ['rt:ground:*:', 'rt:ground:u?:', 'rt:ground:[a]:', 'rt:ground:u\\:', '', null]) {
    assert.equal((await runGroundsReindex({ user: { grounds: [] }, redis, prefix: bad, save: async () => {} })).status, 400, JSON.stringify(bad));
  }
  assert.equal((await runGroundsReindex({ user: {}, redis: { get: async () => null }, prefix: PREFIX, save: async () => {} })).status, 501);
  const bare = { email: 'x' };
  assert.ok((await run({ user: bare })).json.recovered > 0);
  assert.ok(Array.isArray(bare.grounds), 'a record with no grounds field is given one');
}

console.log('grounds.js: all checks passed');
