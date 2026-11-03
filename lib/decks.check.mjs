// Self-check for the deck store's encoding. Run: node lib/decks.check.mjs
import assert from 'node:assert/strict';
import { encodeDeck, decodeDeck, deckEntry, deckName, MAX_STORED_BYTES, MAX_DECKS } from './decks.js';
import { readMap, packMap } from '../src/battlemap.js';
import { generateDeck } from '../src/mapgen.js';

// a small deck round-trips
{
  const g = generateDeck({ cols: 60, rows: 40, style: 'decks', seed: 'D1' });
  const map = readMap({ cols: 60, rows: 40, floor: g.floor, doors: g.doors, ground: { '3,3': 'ice' } });
  const enc = encodeDeck(map);
  assert.ok(!enc.error, enc.error);
  assert.equal(enc.cols, 60); assert.equal(enc.rows, 40);
  assert.equal(enc.squares, Object.keys(map.floor).length);
  assert.equal(typeof enc.stored, 'string');
  assert.equal(enc.bytes, enc.stored.length);
  const back = readMap(decodeDeck(enc.stored));
  assert.deepEqual(back.floor, map.floor);
  assert.deepEqual(back.doors, map.doors);
  assert.deepEqual(back.ground, map.ground);
}

// it accepts a map already packed, or a bare plain one, and stores the same thing
{
  const g = generateDeck({ cols: 40, rows: 40, style: 'warren', seed: 'D2' });
  const plain = readMap({ cols: 40, rows: 40, floor: g.floor });
  const a = encodeDeck(plain).stored;
  const b = encodeDeck(packMap(plain)).stored;
  assert.equal(a, b, 'packed or not, the stored deck is the same');
  // a deck from an older build, or a hand-made request, is normalised
  const dirty = encodeDeck({ cols: 99999, rows: 'x', floor: { '1,1': true, junk: true } });
  assert.ok(!dirty.error);
  assert.equal(dirty.cols, 500, 'sizes are clamped');
  assert.equal(dirty.squares, 1, 'junk squares are dropped');
}

// not a map
assert.equal(encodeDeck(null).error, 'map_required');
assert.equal(encodeDeck('x').error, 'map_required');

// a damaged record is a missing deck, not an exception
assert.equal(decodeDeck(null), null);
assert.equal(decodeDeck(''), null);
assert.equal(decodeDeck('not base64 gzip'), null);
assert.equal(decodeDeck(42), null);

// the largest, most heavily dressed deck there is still fits a record of its own
{
  const grounds = ['ice', 'desert', 'jungle', 'hive_city'];
  const floor = {}, ground = {}, obscuring = {}, cover = {};
  let s = 7;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let x = 0; x < 500; x++) for (let y = 0; y < 500; y++) {
    floor[`${x},${y}`] = true;
    ground[`${x},${y}`] = grounds[((x >> 3) + (y >> 3)) % 4];
    if (rnd() < 0.3) obscuring[`${x},${y}`] = 'medium';
    if (rnd() < 0.05) cover[`${x},${y}`] = 'crates';
  }
  const t0 = Date.now();
  const enc = encodeDeck(readMap({ cols: 500, rows: 500, floor, ground, obscuring, cover }));
  assert.ok(!enc.error, enc.error);
  assert.ok(enc.bytes < MAX_STORED_BYTES, `${enc.bytes} bytes stored`);
  console.log(`a full 500x500 deck with 30% foliage: ${Math.round(enc.bytes / 1024)}KB stored, ${Date.now() - t0}ms`);
  const back = readMap(decodeDeck(enc.stored));
  assert.equal(Object.keys(back.floor).length, 250000);
  assert.equal(Object.keys(back.obscuring).length, Object.keys(obscuring).length);
}

// a deck over the record is refused, with its size in the message. (A real one
// cannot get there: the most heavily dressed 500 x 500 above is 81KB stored,
// so the cap is exercised with a small one.)
{
  const g = generateDeck({ cols: 120, rows: 120, style: 'warren', seed: 'big' });
  const enc = encodeDeck(readMap({ cols: 120, rows: 120, floor: g.floor, doors: g.doors }), 500);
  assert.equal(enc.tooBig, true);
  assert.match(enc.error, /KB once packed, over the \d+KB a deck may take/);
  assert.equal(enc.stored, undefined, 'nothing to write');
}

// the index entry is small and carries no map
{
  const e = deckEntry('d1', '  Hulk deck  ', { cols: 60, rows: 40, squares: 500, bytes: 1234 }, 99);
  assert.deepEqual(e, { id: 'd1', name: 'Hulk deck', cols: 60, rows: 40, squares: 500, bytes: 1234, updatedAt: 99 });
  assert.equal(deckName('', 'Fallback'), 'Fallback');
  assert.equal(deckName('x'.repeat(200)).length, 80);
  assert.ok(MAX_DECKS >= 60);
}

console.log('decks.js: all checks passed');

/* ---- the endpoint, against a map standing in for Redis ---- */
{
  const { runDecks, isDeckId } = await import('./decks.js');
  const kv = new Map();
  const redis = { get: async (k) => kv.get(k) ?? null, set: async (k, v) => { kv.set(k, v); }, del: async (k) => { kv.delete(k); } };
  const user = { email: 'gm@example.com', chars: [{ id: 'c1' }], homebrew: { hulls: [1] } };
  let saves = 0;
  const run = (method, did, body) => runDecks({ method, did, body, user, redis, key: (d) => `rt:deck:u1:${d}`, save: async () => { saves++; } });

  assert.equal((await run('GET')).status, 200);
  assert.deepEqual((await run('GET')).json, { decks: [] });
  assert.equal((await run('GET', 'nope')).status, 404);
  assert.equal((await run('GET', '../etc')).status, 400, 'an id that could escape the key is refused');
  assert.equal((await run('GET', 'a:b')).status, 400);
  assert.ok(isDeckId('bmap-lq2z-0') && !isDeckId('') && !isDeckId('x'.repeat(65)) && !isDeckId(7));

  const g = generateDeck({ cols: 80, rows: 60, style: 'decks', seed: 'E' });
  const map = readMap({ cols: 80, rows: 60, floor: g.floor, doors: g.doors });

  // create
  const put = await run('PUT', 'd1', { name: ' Hulk ', map: packMap(map) });
  assert.equal(put.status, 200);
  assert.equal(put.json.name, 'Hulk');
  assert.equal(put.json.cols, 80);
  assert.equal(put.json.squares, Object.keys(map.floor).length);
  assert.ok(kv.has('rt:deck:u1:d1'), 'the body is under its own key');
  assert.equal(user.decks.length, 1);
  assert.equal(user.homebrew.hulls[0], 1, 'the rest of the account is untouched');

  // the index carries no map; one deck comes back whole
  const list = await run('GET');
  assert.equal(list.json.decks.length, 1);
  assert.equal(list.json.decks[0].map, undefined, 'the index is small');
  const one = await run('GET', 'd1');
  assert.deepEqual(readMap(one.json.map).floor, map.floor);
  assert.equal(one.json.name, 'Hulk');

  // overwrite keeps one entry
  await run('PUT', 'd1', { name: 'Hulk', map });
  assert.equal(user.decks.length, 1);

  // rename without the map
  const before = kv.get('rt:deck:u1:d1');
  const ren = await run('PUT', 'd1', { name: 'Renamed' });
  assert.equal(ren.status, 200);
  assert.equal(ren.json.name, 'Renamed');
  assert.equal(kv.get('rt:deck:u1:d1'), before, 'a rename does not touch the stored deck');
  assert.equal((await run('PUT', 'ghost', { name: 'x' })).status, 400, 'cannot rename what is not there');

  // refusals
  assert.equal((await run('PUT', undefined, { map })).status, 400);
  assert.equal((await run('PUT', 'd2', { name: 'x', map: 'nope' })).status, 400);
  assert.equal((await run('POST', 'd1')).status, 405, 'a POST with no reindex asked for is refused');

  // the limit counts decks, not writes
  for (let i = 0; i < 99; i++) user.decks.push({ id: 'f' + i, name: 'f' });
  assert.equal((await run('PUT', 'overflow', { name: 'x', map })).status, 413);
  assert.equal((await run('PUT', 'd1', { name: 'again', map })).status, 200, 'but an existing deck can still be saved');
  user.decks = user.decks.filter((d) => d.id === 'd1');

  // a damaged record is a 404, not a crash
  kv.set('rt:deck:u1:d1', 'garbage');
  assert.equal((await run('GET', 'd1')).status, 404);

  // delete removes the entry and the body
  await run('PUT', 'd1', { name: 'Hulk', map });
  assert.equal((await run('DELETE', 'd1')).status, 200);
  assert.equal(user.decks.length, 0);
  assert.ok(!kv.has('rt:deck:u1:d1'));
  assert.equal((await run('DELETE')).status, 400);
  assert.ok(saves > 0);
}
console.log('decks.js: the endpoint checks passed');

/* ---- finding the decks an account's index has lost ---- */
{
  const { runDecks, runReindex, REINDEX_MAX } = await import('./decks.js');
  const PREFIX = 'rt:deck:u1:';
  const kv = new Map();
  // a SCAN that works as Upstash's does: a cursor, a glob prefix, a page at a time
  let scans = 0;
  const redis = {
    get: async (k) => kv.get(k) ?? null,
    set: async (k, v) => { kv.set(k, v); },
    del: async (k) => { kv.delete(k); },
    scan: async (cursor, { match = '*', count = 10 } = {}) => {
      scans++;
      const all = [...kv.keys()].filter((k) => match.endsWith('*') && k.startsWith(match.slice(0, -1))).sort();
      const at = Number(cursor) || 0;
      const page = all.slice(at, at + Math.min(count, 3));          // small pages, so the walk takes several rounds
      const nextAt = at + page.length;
      return [nextAt >= all.length ? '0' : String(nextAt), page];
    }
  };
  const make = (seed) => encodeDeck(readMap({ cols: 40, rows: 30, floor: generateDeck({ cols: 40, rows: 30, style: 'decks', seed }).floor })).stored;

  // an account whose index was wiped: three decks stored, none listed, and one it still lists
  const user = { email: 'a@b.c', chars: [{ id: 'c1' }], homebrew: { hulls: [{ id: 'h' }] }, decks: [{ id: 'kept', name: 'Kept deck', cols: 40, rows: 30 }] };
  kv.set(PREFIX + 'kept', make('K'));
  kv.set(PREFIX + 'lost-a', make('A'));
  kv.set(PREFIX + 'lost-b', make('B'));
  kv.set(PREFIX + 'lost-c', make('C'));
  kv.set(PREFIX + 'broken', 'not a deck');                           // a damaged record
  kv.set('rt:deck:u2:someone-elses', make('X'));                    // another account's
  kv.set('rt:ground:u1:g1', 'a floor');                             // not a deck at all
  const keptBody = kv.get(PREFIX + 'kept');
  let saved = 0;
  const run = (opts = {}) => runDecks({ method: 'POST', reindex: true, user, redis, key: (d) => PREFIX + d, save: async () => { saved++; }, now: 1234, ...opts });

  const out = await run();
  assert.equal(out.status, 200);
  assert.equal(out.json.recovered, 3);
  assert.deepEqual(out.json.decks.map((d) => d.id).sort(), ['lost-a', 'lost-b', 'lost-c']);
  assert.equal(out.json.unreadable, 1, 'a damaged body is counted, not listed and not a crash');
  assert.equal(out.json.remaining, 0);
  assert.ok(scans > 1, 'the walk followed the cursor across pages');
  for (const d of out.json.decks) {
    assert.match(d.name, /^Recovered deck \d+$/);
    assert.equal(d.cols, 40); assert.equal(d.rows, 30);
    assert.ok(d.squares > 0 && d.bytes > 0 && d.updatedAt === 1234);
    assert.equal(d.map, undefined, 'an entry carries no map');
  }
  assert.deepEqual(out.json.decks.map((d) => d.name), ['Recovered deck 1', 'Recovered deck 2', 'Recovered deck 3']);
  assert.equal(user.decks.length, 4, 'the kept deck and three found');
  assert.equal(saved, 1, 'saved once');

  // only what was asked: nothing else on the account, no body, no existing entry
  assert.deepEqual(user.chars, [{ id: 'c1' }]);
  assert.deepEqual(user.homebrew, { hulls: [{ id: 'h' }] });
  assert.deepEqual(user.decks[0], { id: 'kept', name: 'Kept deck', cols: 40, rows: 30 }, 'an existing entry is untouched');
  assert.equal(kv.get(PREFIX + 'kept'), keptBody, 'and so is its body');
  assert.equal(kv.get(PREFIX + 'broken'), 'not a deck', 'a body it cannot read is left where it is');
  assert.ok(!user.decks.some((d) => d.id === 'someone-elses'), 'another account\'s deck is never touched');
  assert.ok(!user.decks.some((d) => d.id === 'g1'), 'nor is something that is not a deck');

  // the recovered decks open like any other
  const opened = await runDecks({ method: 'GET', did: 'lost-a', user, redis, key: (d) => PREFIX + d, save: async () => {} });
  assert.equal(opened.status, 200);
  assert.equal(readMap(opened.json.map).cols, 40);

  // running it again finds nothing and writes nothing
  saved = 0;
  const again = await run();
  assert.equal(again.json.recovered, 0);
  assert.equal(again.json.unreadable, 1, 'the broken one is still reported');
  assert.equal(saved, 0, 'nothing to add, nothing saved');
  assert.equal(user.decks.length, 4);

  // a new recovery numbers on from the ones already named
  kv.set(PREFIX + 'lost-d', make('D'));
  const more = await run();
  assert.deepEqual(more.json.decks.map((d) => d.name), ['Recovered deck 4']);

  // a deck whose body was deleted is not found: delete removes the body
  await runDecks({ method: 'DELETE', did: 'lost-d', user, redis, key: (d) => PREFIX + d, save: async () => {} });
  assert.equal((await run()).json.recovered, 0, 'a deleted deck stays deleted');

  // the request cap, and the library's own limit, on a store of its own
  kv.clear();
  const total = REINDEX_MAX + 7;
  for (let i = 0; i < total; i++) kv.set(PREFIX + 'bulk' + String(i).padStart(3, '0'), make('Z' + (i % 3)));
  const big = { decks: [] };
  const first = await run({ user: big });
  assert.equal(first.json.recovered, REINDEX_MAX, 'one request adds at most its cap');
  assert.equal(first.json.remaining, 7, 'and says how many are still to come');
  const second = await run({ user: big });
  assert.equal(second.json.recovered, 7, 'the next request takes the rest');
  assert.equal(second.json.remaining, 0);
  assert.equal(big.decks.length, total);
  assert.equal(new Set(big.decks.map((d) => d.id)).size, total, 'no deck is listed twice');
  assert.equal(big.decks[big.decks.length - 1].name, `Recovered deck ${total}`, 'the numbering carries on across requests');
  const full = { decks: Array.from({ length: MAX_DECKS }, (_, i) => ({ id: 'f' + i, name: 'f' })) };
  const none = await run({ user: full });
  assert.equal(none.json.recovered, 0, 'a full library gets no more');
  assert.ok(none.json.remaining > 0, 'and says there are more');

  // a prefix that would widen the pattern is refused
  for (const bad of ['rt:deck:*:', 'rt:deck:u?:', 'rt:deck:[a-z]:', 'rt:deck:u\\:', '']) {
    assert.equal((await runReindex({ user: { decks: [] }, redis, prefix: bad, save: async () => {} })).status, 400, JSON.stringify(bad));
  }
  assert.equal((await runReindex({ user: { decks: [] }, redis: { get: async () => null }, prefix: PREFIX, save: async () => {} })).status, 501);
  // a user record with no decks field at all
  const bare = { email: 'x' };
  assert.equal((await run({ user: bare })).json.recovered > 0, true);
  assert.ok(Array.isArray(bare.decks));
}
console.log('decks.js: the re-index checks passed');
