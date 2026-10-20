// Self-check for the homebrew library store. Run: node src/homebrew.check.mjs
import assert from 'node:assert/strict';

/* ---- a localStorage stand-in, so the local half can be exercised ---- */

const store = new Map();
let failWrites = false;
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => {
    if (failWrites) throw new Error('QuotaExceededError');
    store.set(k, v);
  },
  removeItem: (k) => store.delete(k)
};

const calls = [];
let nextResponse = () => ({ status: 200, body: { homebrew: { hulls: [], components: [] } } });
globalThis.fetch = async (url, opts) => {
  calls.push({ url, opts });
  const r = nextResponse(calls.length);
  return {
    ok: r.status >= 200 && r.status < 300,
    status: r.status,
    headers: { get: () => r.type ?? 'application/json' },
    json: async () => r.body ?? {}
  };
};

const {
  HOMEBREW_KEY, EMPTY, normalise, isEmpty,
  readLocal, writeLocal, cloudGet, cloudPut
} = await import('./homebrew.js');

/* ---- normalise tolerates anything storage can hand back ---- */

assert.deepEqual(normalise(null), EMPTY);
assert.deepEqual(normalise(undefined), EMPTY);
assert.deepEqual(normalise('nonsense'), EMPTY);
assert.deepEqual(normalise({}), EMPTY);
assert.deepEqual(normalise({ hulls: 'no', components: 7 }), EMPTY);
// non-objects inside the arrays are dropped rather than carried through to
// code that will read .id off them
assert.deepEqual(normalise({ hulls: [null, 'x', 3, { id: 'h1' }] }).hulls, [{ id: 'h1' }]);
assert.deepEqual(normalise({ components: [{ id: 'c1' }, undefined] }).components, [{ id: 'c1' }]);
// and an unexpected key is not carried either
assert.deepEqual(Object.keys(normalise({ hulls: [], components: [], junk: 1 })).sort(),
  ['components', 'encounters', 'endeavours', 'hulls']);

// Encounters ride in this same library rather than on a route of their own,
// so they get the same treatment as the other two keys.
assert.deepEqual(normalise({ encounters: 'no' }).encounters, []);
assert.deepEqual(normalise({ encounters: [null, 2, { id: 'e1' }] }).encounters, [{ id: 'e1' }]);

assert.equal(isEmpty(null), true);
assert.equal(isEmpty({ hulls: [], components: [] }), true);
assert.equal(isEmpty({ hulls: [{ id: 'h1' }], components: [] }), false);
assert.equal(isEmpty({ hulls: [], components: [{ id: 'c1' }] }), false);
assert.equal(isEmpty({ hulls: [], components: [], encounters: [{ id: 'e1' }] }), false,
  'a library holding only encounters is not empty');
assert.equal(isEmpty({ hulls: [], components: [], endeavours: [{ id: 'd1' }] }), false,
  'nor one holding only endeavours');
assert.deepEqual(normalise({ endeavours: [null, { id: 'd1' }] }).endeavours, [{ id: 'd1' }]);

/* ---- local round trip ---- */

{
  store.clear();
  assert.deepEqual(readLocal(), EMPTY, 'nothing stored reads as empty');

  const lib = {
    hulls: [{ id: 'hull-x', name: 'X' }],
    components: [{ id: 'comp-y' }],
    encounters: [{ id: 'enc-z', name: 'Ambush' }],
    endeavours: [{ id: 'end-w', name: 'The Cloud-Fane' }]
  };
  assert.equal(writeLocal(lib), true);
  assert.equal(store.has(HOMEBREW_KEY), true);
  assert.deepEqual(readLocal(), lib);

  // A library written before encounters existed still reads, with an empty
  // encounter list rather than an absent key the UI would have to guard.
  store.set(HOMEBREW_KEY, JSON.stringify({ hulls: [{ id: 'old' }], components: [] }));
  assert.deepEqual(readLocal(),
    { hulls: [{ id: 'old' }], components: [], encounters: [], endeavours: [] });

  // a corrupt blob reads as empty rather than throwing
  store.set(HOMEBREW_KEY, '{not json');
  assert.deepEqual(readLocal(), EMPTY);

  // a full quota is reported, not thrown
  failWrites = true;
  assert.equal(writeLocal(lib), false);
  failWrites = false;
}

/* ---- cloud round trip ---- */

{
  calls.length = 0;
  nextResponse = () => ({ status: 200,
    body: { homebrew: { hulls: [{ id: 'hull-a' }], components: [] } } });
  const got = await cloudGet();
  // Normalised on the way in, so a server that predates encounters still
  // hands the editor a library with every key present.
  assert.deepEqual(got,
    { hulls: [{ id: 'hull-a' }], components: [], encounters: [], endeavours: [] });
  assert.equal(calls[0].opts, undefined, 'a GET sends no body');

  calls.length = 0;
  await cloudPut({ hulls: [{ id: 'hull-b' }], components: [{ id: 'comp-b' }] });
  assert.equal(calls[0].opts.method, 'PUT');
  const sent = JSON.parse(calls[0].opts.body);
  assert.deepEqual(sent.homebrew.hulls, [{ id: 'hull-b' }]);

  // the payload is normalised on the way out, so junk never reaches the server
  calls.length = 0;
  await cloudPut({ hulls: [null, { id: 'ok' }], components: 'no', encounters: [{ id: 'e' }] });
  const sent2 = JSON.parse(calls[0].opts.body);
  assert.deepEqual(sent2.homebrew,
    { hulls: [{ id: 'ok' }], components: [], encounters: [{ id: 'e' }], endeavours: [] });

  // ...and on the way back, so a bad answer cannot poison the editor
  nextResponse = () => ({ status: 200, body: { homebrew: { hulls: 'broken' } } });
  assert.deepEqual(await cloudGet(), EMPTY);
  nextResponse = () => ({ status: 200, body: {} });
  assert.deepEqual(await cloudGet(), EMPTY);
}

/* ---- failures say something a player can act on ---- */

nextResponse = () => ({ status: 401 });
await assert.rejects(cloudGet(), /Signed out/);

nextResponse = () => ({ status: 413, body: { error: 'That library is 140KB, over the 98KB limit.' } });
await assert.rejects(cloudPut({ hulls: [] }), /over the 98KB limit/);

// A plain `npm run dev` answers /api/* with the SPA shell at 200. A 2xx is not
// proof of an API — the same trap that made the sheet importer report success
// on failure.
nextResponse = () => ({ status: 200, type: 'text/html', body: {} });
await assert.rejects(cloudGet(), /not running here/);

nextResponse = () => ({ status: 500 });
await assert.rejects(cloudGet(), /returned 500/);

console.log('homebrew store: all checks passed');
