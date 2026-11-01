// Self-check for the deck library. Run: node src/decks.check.mjs
import assert from 'node:assert/strict';

const store = new Map();
let failWrites = false;
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { if (failWrites) throw new Error('QuotaExceededError'); store.set(k, v); },
  removeItem: (k) => store.delete(k)
};
const calls = [];
let nextResponse = () => ({ status: 200, body: {} });
globalThis.fetch = async (url, opts) => {
  calls.push({ url, opts });
  const { status, body } = nextResponse();
  return { ok: status >= 200 && status < 300, status, json: async () => body };
};

const { readLocal, writeLocal, cloudList, cloudGet, cloudPut, cloudDelete, takeLegacy, deckSize } =
  await import('./decks.js');
const { readMap } = await import('./battlemap.js');

const floor = {};
for (let x = 0; x < 100; x++) for (let y = 0; y < 100; y++) floor[`${x},${y}`] = true;
const map = readMap({ cols: 100, rows: 100, floor });

/* ---- local ---- */
{
  store.clear();
  assert.deepEqual(readLocal(), [], 'nothing stored is an empty library');
  assert.equal(writeLocal([{ id: 'd1', name: 'Hulk', map }]), true);
  const raw = store.get('rt:decks');
  assert.ok(raw.length < 2000, `a 10,000-square deck is ${raw.length} bytes in storage, packed`);
  const back = readLocal();
  assert.equal(back[0].name, 'Hulk');
  assert.equal(Object.keys(readMap(back[0].map).floor).length, 10000, 'and comes back whole');
  // a deck with no map loaded is not written (it would wipe the stored one)
  writeLocal([{ id: 'd2', name: 'Not loaded' }]);
  assert.deepEqual(readLocal(), [], 'only decks that have their map are written');
  store.set('rt:decks', '{not json');
  assert.deepEqual(readLocal(), []);
  store.set('rt:decks', '[null, 3, {"id":"d3"}]');
  assert.deepEqual(readLocal(), [{ id: 'd3' }], 'junk entries are dropped');
  failWrites = true;
  assert.equal(writeLocal([{ id: 'd4', name: 'x', map }]), false, 'a full quota is reported');
  failWrites = false;
}

/* ---- cloud ---- */
{
  calls.length = 0;
  nextResponse = () => ({ status: 200, body: { decks: [{ id: 'd1', name: 'Hulk', cols: 100, rows: 100, squares: 10000 }] } });
  const index = await cloudList();
  assert.equal(index[0].name, 'Hulk');
  assert.equal(calls[0].url, '/api/decks');
  assert.equal(calls[0].opts.credentials, 'same-origin');
  assert.equal(index.some((d) => d.map), false, 'THE POINT OF THE SPLIT: the index carries no maps');

  nextResponse = () => ({ status: 200, body: { decks: undefined } });
  assert.deepEqual(await cloudList(), [], 'no decks is empty, not a crash');

  calls.length = 0;
  nextResponse = () => ({ status: 200, body: { id: 'd1', map: { cols: 5 } } });
  assert.equal((await cloudGet('d1')).map.cols, 5);
  assert.equal(calls[0].url, '/api/decks?d=d1');

  calls.length = 0;
  nextResponse = () => ({ status: 200, body: { id: 'd1' } });
  await cloudPut({ id: 'd1', name: 'Hulk', map });
  assert.equal(calls[0].opts.method, 'PUT');
  assert.equal(calls[0].url, '/api/decks?d=d1');
  const sent = JSON.parse(calls[0].opts.body);
  assert.equal(sent.name, 'Hulk');
  assert.equal(sent.map.floor.rle, 1, 'sent packed, not as a key per square');
  assert.ok(calls[0].opts.body.length < 2000);

  calls.length = 0;
  await cloudPut({ id: 'd1', name: 'Renamed' });
  assert.deepEqual(JSON.parse(calls[0].opts.body), { name: 'Renamed' }, 'a rename sends no map');

  calls.length = 0;
  await cloudPut({ id: 'a/b', name: 'x', map });
  assert.equal(calls[0].url, '/api/decks?d=a%2Fb', 'ids are escaped');

  calls.length = 0;
  await cloudDelete('d1');
  assert.equal(calls[0].opts.method, 'DELETE');

  nextResponse = () => ({ status: 413, body: { error: 'That deck is 950KB once packed' } });
  await assert.rejects(cloudPut({ id: 'd1', name: 'x', map }), /950KB once packed/, 'the server\'s reason reaches the GM');
  nextResponse = () => ({ status: 500, body: null });
  await assert.rejects(cloudList(), /Could not reach your decks \(500\)/);
}

/* ---- migration ---- */
{
  const lib = { hulls: [{ id: 'h' }], battlemaps: [{ id: 'm1', name: 'A', map }, null, { id: 'm2', name: 'No map' }], mapgrounds: [] };
  const { legacy, cleaned } = takeLegacy(lib);
  assert.equal(legacy.length, 1, 'only decks that have a map are moved');
  assert.deepEqual(cleaned.battlemaps, []);
  assert.deepEqual(cleaned.hulls, [{ id: 'h' }], 'the rest of the library is untouched');
  const none = takeLegacy({ hulls: [], battlemaps: [] });
  assert.equal(none.legacy.length, 0);
  assert.equal(takeLegacy(null).legacy.length, 0);
}

assert.equal(deckSize({ cols: 120, rows: 90 }), '120×90');
assert.equal(deckSize({}), '');

console.log('decks.js (client): all checks passed');
