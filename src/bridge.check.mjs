// Self-check for the bridge client. Run: node src/bridge.check.mjs
//
// The polling loop is the part worth checking: it has to skip rather than
// queue, stop cleanly, and not act on an answer that arrives after it stopped.
import assert from 'node:assert/strict';

const calls = [];
let nextResponse = () => ({ status: 204 });

// A fetch stand-in. Returns what nextResponse says, recording the request.
globalThis.fetch = async (url, opts) => {
  calls.push({ url, opts });
  const r = nextResponse(calls.length);
  if (r.throws) throw new Error('network');
  return {
    ok: r.status >= 200 && r.status < 300,
    status: r.status,
    headers: { get: () => r.type ?? 'application/json' },
    json: async () => r.body ?? {},
  };
};

const {
  createDynasty, joinBridge, patchShip, emitEvent, readBridge,
  pollBridge, ABSENT
} = await import('./bridge.js');

const reset = () => { calls.length = 0; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- the calls carry what the server expects ---- */

reset();
nextResponse = () => ({ status: 200, body: { dynasty: { code: 'AB3K9P' } } });
await createDynasty('Ma’Kao');
assert.equal(calls[0].opts.method, 'POST');
assert.deepEqual(JSON.parse(calls[0].opts.body), { action: 'create', name: 'Ma’Kao' });

reset();
await joinBridge({ code: 'AB3K9P', charId: 'c1', name: 'Linus', role: 'enginseer' });
assert.deepEqual(JSON.parse(calls[0].opts.body), {
  action: 'join', code: 'AB3K9P', charId: 'c1', name: 'Linus', role: 'enginseer'
});

// A patch declares the fields it writes, derived from the patch itself so the
// two cannot disagree.
reset();
await patchShip({ code: 'AB3K9P', patch: { hullIntegrity: 52, fires: [] }, log: 'repaired' });
{
  const sent = JSON.parse(calls[0].opts.body);
  assert.deepEqual(sent.fields.sort(), ['fires', 'hullIntegrity']);
  assert.equal(sent.log, 'repaired');
}
reset();
await patchShip({ code: 'X', patch: null });
assert.deepEqual(JSON.parse(calls[0].opts.body).fields, []);

reset();
await emitEvent({ code: 'AB3K9P', event: { id: 'fire' } });
assert.equal(JSON.parse(calls[0].opts.body).action, 'event');

// The rev rides along so an unchanged bridge can answer 204.
reset();
nextResponse = () => ({ status: 204 });
assert.equal(await readBridge({ code: 'AB3K9P', since: 7 }), null);
assert.match(calls[0].url, /code=AB3K9P/);
assert.match(calls[0].url, /since=7/);

reset();
await readBridge({ code: 'AB3K9P' });
assert.equal(/since=/.test(calls[0].url), false, 'no rev, no since');

/* ---- failures say something a player can act on ---- */

nextResponse = () => ({ status: 404 });
await assert.rejects(readBridge({ code: 'ZZZZZZ' }), /No dynasty with that code/);

// ...but only when the answer is actually from the API. Vite's dev server 404s
// an unknown path with HTML, and reading that as "unknown dynasty" told people
// their table code was wrong when the truth was that there was no API.
nextResponse = () => ({ status: 404, type: 'text/html' });
await assert.rejects(readBridge({ code: 'AB3K9P' }), new RegExp(ABSENT.slice(0, 30)));

nextResponse = () => ({ status: 401 });
await assert.rejects(readBridge({ code: 'AB3K9P' }), /Sign in/);

nextResponse = () => ({ status: 403, body: { error: 'gm_only' } });
await assert.rejects(emitEvent({ code: 'AB3K9P', event: { id: 'fire' } }), /Only the GM/);

nextResponse = () => ({ status: 403, body: { denied: ['heading'] } });
await assert.rejects(patchShip({ code: 'AB3K9P', patch: { heading: 90 } }),
  /station cannot change: heading/);

// A plain `npm run dev` answers /api/* with the SPA shell at 200. A 2xx is
// not proof of an API, which is the trap that made the sheet importer report
// success on failure.
nextResponse = () => ({ status: 200, type: 'text/html', body: {} });
await assert.rejects(readBridge({ code: 'AB3K9P' }), new RegExp(ABSENT.slice(0, 30)));

nextResponse = () => ({ throws: true });
await assert.rejects(readBridge({ code: 'AB3K9P' }), /Could not reach the bridge/);

/* ---- the loop ---- */

// It polls, reports state, and stops cleanly.
{
  reset();
  let rev = 1;
  const seen = [];
  nextResponse = (n) => (n === 1
    ? { status: 200, body: { ship: { rev: 2 } } }
    : { status: 204 });

  const stop = pollBridge({
    code: 'AB3K9P',
    getRev: () => rev,
    onState: (s) => { seen.push(s); rev = s.ship.rev; },
    intervalMs: 20
  });
  await wait(90);
  stop();
  const afterStop = calls.length;

  assert.equal(seen.length, 1, 'only the changed answer is reported');
  assert.equal(rev, 2, 'and the rev moves on');
  assert.ok(calls.length >= 2, 'it kept polling');
  // the rev it learned is sent on the next request
  assert.match(calls[calls.length - 1].url, /since=2/);

  await wait(60);
  assert.equal(calls.length, afterStop, 'stopping stops it');
}

// A slow answer is skipped rather than queued, so a bad connection cannot
// pile up requests against the command budget.
{
  reset();
  let release;
  const gate = new Promise((r) => { release = r; });
  globalThis.fetch = async (url) => {
    calls.push({ url });
    await gate;
    return {
      ok: true, status: 204,
      headers: { get: () => 'application/json' },
      json: async () => ({})
    };
  };

  const stop = pollBridge({ code: 'AB3K9P', getRev: () => 1, intervalMs: 10, onState: () => {} });
  await wait(70);
  assert.equal(calls.length, 1, 'one in flight, the rest skipped');
  release();
  stop();
}

// An error is reported without stopping the loop.
{
  reset();
  const errors = [];
  globalThis.fetch = async (url) => {
    calls.push({ url });
    throw new Error('network');
  };
  const stop = pollBridge({
    code: 'AB3K9P', getRev: () => 1, intervalMs: 20,
    onState: () => {}, onError: (e) => errors.push(e.message)
  });
  await wait(70);
  stop();
  assert.ok(errors.length >= 2, 'it keeps trying and keeps reporting');
  assert.match(errors[0], /Could not reach/);
}

console.log('bridge client: all checks passed');
