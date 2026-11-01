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
  assert.equal((await run('POST', 'd1')).status, 405);

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
