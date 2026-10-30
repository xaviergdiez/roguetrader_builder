// Self-check for the ground library. Run: node src/grounds.check.mjs
import assert from 'node:assert/strict';

/* ---- stand-ins, so both halves can be exercised ---- */

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
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
};

const {
  readLocal, writeLocal, cloudList, cloudGet, cloudPut, cloudDelete, takeLegacy
} = await import('./grounds.js');

const IMG = 'data:image/jpeg;base64,' + 'A'.repeat(200);

/* ---- local ---- */

{
  store.clear();
  assert.deepEqual(readLocal(), [], 'nothing stored is an empty library');

  assert.equal(writeLocal([{ id: 'env-1', name: 'Refinery floor', texture: IMG }]), true);
  assert.deepEqual(readLocal(), [{ id: 'env-1', name: 'Refinery floor', texture: IMG }]);

  // Signed out there is no network to spare, so the floor is kept whole.
  assert.equal(readLocal()[0].texture, IMG, 'the floor has to be there offline');

  // Storage that cannot be read is an empty library, not a crash: this is a
  // GM's browser, and a half-written blob should not take the map with it.
  store.set('rt:grounds', '{not json');
  assert.deepEqual(readLocal(), []);
  store.set('rt:grounds', '{"not":"an array"}');
  assert.deepEqual(readLocal(), []);
  store.set('rt:grounds', '[null, 3, {"id":"env-2"}]');
  assert.deepEqual(readLocal(), [{ id: 'env-2' }], 'junk entries are dropped, not kept');

  // A full quota is reported rather than thrown, so the caller can say so.
  failWrites = true;
  assert.equal(writeLocal([{ id: 'env-3' }]), false);
  failWrites = false;
  assert.equal(writeLocal('not a list'), true);
  assert.deepEqual(readLocal(), []);
}

/* ---- cloud ---- */

{
  calls.length = 0;
  nextResponse = () => ({ status: 200, body: { grounds: [{ id: 'env-1', name: 'Fen' }] } });
  const index = await cloudList();
  /* Marked as the GM's own on the way in. The server has no reason to say so
     — it only ever holds their grounds — but the renderer tells a saved
     ground from a built-in one by this flag, and without it a ground came
     back from the index as neither: in the picker, but never asked for its
     floor or its props, because the code that fetches those skips anything
     not custom. */
  assert.deepEqual(index, [{ id: 'env-1', name: 'Fen', custom: true }]);
  assert.equal(calls[0].url, '/api/grounds');
  assert.equal(calls[0].opts.method, undefined, 'a list is a plain GET');
  assert.equal(calls[0].opts.body, undefined, 'and sends no body');
  assert.equal(calls[0].opts.credentials, 'same-origin', 'the session cookie has to ride along');

  // THE POINT OF THE SPLIT: the index carries no floors. It is fetched on
  // every load, and a library of floors would be megabytes of it.
  assert.equal(index.some((g) => g.texture), false);

  calls.length = 0;
  nextResponse = () => ({ status: 200, body: { grounds: undefined } });
  assert.deepEqual(await cloudList(), [], 'an answer with no grounds is empty, not a crash');

  calls.length = 0;
  nextResponse = () => ({ status: 200, body: { id: 'env-1', texture: IMG } });
  const one = await cloudGet('env-1');
  assert.equal(one.texture, IMG, 'a floor is fetched when a deck needs it');
  assert.equal(calls[0].url, '/api/grounds?g=env-1');

  calls.length = 0;
  nextResponse = () => ({ status: 200, body: { id: 'env-1' } });
  await cloudPut({ id: 'env-1', name: 'Fen', texture: IMG });
  assert.equal(calls[0].url, '/api/grounds?g=env-1');
  assert.equal(calls[0].opts.method, 'PUT');
  assert.equal(JSON.parse(calls[0].opts.body).texture, IMG, 'the floor has to be sent');

  calls.length = 0;
  nextResponse = () => ({ status: 200, body: { ok: true } });
  await cloudDelete('env-1');
  assert.equal(calls[0].opts.method, 'DELETE');

  // An id is escaped rather than concatenated, or one with a & in it would
  // split into a second query parameter.
  calls.length = 0;
  nextResponse = () => ({ status: 200, body: {} });
  await cloudGet('a&b=c');
  assert.equal(calls[0].url, '/api/grounds?g=a%26b%3Dc');

  // The server's own message reaches the GM, since it says WHY — over the
  // limit, too large, not signed in.
  nextResponse = () => ({ status: 413, body: { error: 'That is 60 grounds, which is the limit.' } });
  await assert.rejects(() => cloudList(), /60 grounds/);
  nextResponse = () => ({ status: 500, body: {} });
  await assert.rejects(() => cloudList(), /500/, 'a bodiless failure still says something');
}

/* ---- the move out of the homebrew library ---- */

{
  // Grounds lived in homebrew.mapgrounds for one release. They are MOVED,
  // never dropped — losing them at the store layer is the exact failure this
  // split came out of.
  const { legacy, cleaned } = takeLegacy({
    hulls: [{ id: 'h' }],
    mapgrounds: [{ id: 'env-old', name: 'Old fen', texture: IMG }]
  });
  assert.equal(legacy.length, 1);
  assert.equal(legacy[0].texture, IMG, 'the floor comes with it');
  assert.deepEqual(cleaned.mapgrounds, [], 'and the old home is emptied');
  assert.deepEqual(cleaned.hulls, [{ id: 'h' }], 'the rest of the library is untouched');

  // Nothing to move leaves the library alone entirely, so a GM with no
  // legacy grounds is not made to write their library back for nothing.
  const none = takeLegacy({ hulls: [] });
  assert.equal(none.legacy.length, 0);
  assert.equal(none.cleaned.mapgrounds, undefined);
  const already = takeLegacy({ mapgrounds: [] });
  assert.equal(already.legacy.length, 0);

  assert.deepEqual(takeLegacy(null), { legacy: [], cleaned: null });
  assert.deepEqual(takeLegacy({ mapgrounds: 'no' }).legacy, []);
  assert.deepEqual(takeLegacy({ mapgrounds: [null, 7, { id: 'ok' }] }).legacy, [{ id: 'ok' }]);
}

console.log('grounds.js: all checks passed');
