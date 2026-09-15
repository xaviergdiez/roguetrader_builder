// Client side of the shared bridge: the calls, and the polling loop.
//
// Polling, not sockets — see api/bridge.js for why. The loop sends the rev it
// already has, so an unchanged bridge answers 204 with no body and the loop
// does nothing.
//
// Every call goes through one place so the "is there even an API here" check
// is written once: a plain `npm run dev` has no serverless runtime and answers
// /api/* with the SPA shell at status 200, which is the trap that made the
// sheet importer report success on failure.

const API = '/api/bridge';

export const ABSENT = 'The bridge needs the serverless functions, which '
  + '`npm run dev` does not run. Use `vercel dev` or the deployed site.';

async function call(path, opts) {
  let res;
  try {
    res = await fetch(API + path, opts);
  } catch {
    throw new Error('Could not reach the bridge.');
  }

  if (res.status === 204) return null;           // nothing has changed

  const type = res.headers.get('content-type') || '';

  // Checked before the status is interpreted, not after. Vite's dev server
  // 404s an unknown path with an HTML body, which is indistinguishable from
  // the API's own "unknown dynasty" 404 — and telling someone their table
  // code is wrong when the truth is that there is no API is worse than saying
  // nothing.
  if (!type.includes('json')) throw new Error(ABSENT);

  if (!res.ok) {
    if (res.status === 404) throw new Error('No dynasty with that code.');
    if (res.status === 401) throw new Error('Sign in to reach the bridge.');
    if (res.status === 403) {
      let why = 'You are not at that table.';
      if (type.includes('json')) {
        try {
          const b = await res.json();
          if (b.error === 'gm_only') why = 'Only the GM can do that.';
          else if (b.denied) why = 'Your station cannot change: ' + b.denied.join(', ');
        } catch { /* keep the default */ }
      }
      throw new Error(why);
    }
    let msg = `The bridge returned ${res.status}.`;
    try { msg = (await res.json()).error || msg; } catch { /* keep the status */ }
    throw new Error(msg);
  }
  return res.json();
}

const post = (body) => call('', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

export const createDynasty = (name) => post({ action: 'create', name });

export const joinBridge = ({ code, charId, name, role }) =>
  post({ action: 'join', code, charId, name, role });

export const leaveBridge = (code) => post({ action: 'leave', code });

// `fields` is declared separately and checked against the patch on the server,
// so a payload cannot write more than it admits to.
export const patchShip = ({ code, patch, log }) =>
  post({ action: 'patch', code, patch, fields: Object.keys(patch || {}), log });

export const emitEvent = ({ code, event }) => post({ action: 'event', code, event });

export const readBridge = ({ code, since }) =>
  call(`?code=${encodeURIComponent(code)}`
    + (Number.isFinite(since) ? `&since=${since}` : ''));

/* -------------------------------- the loop --------------------------------
   Kept out of the component so the interval is one number in one place, and
   so a stopped loop cannot leave a timer running against an unmounted panel. */

export const DEFAULT_POLL_MS = 5000;

export function pollBridge({ code, getRev, onState, onError, intervalMs = DEFAULT_POLL_MS }) {
  let timer = null;
  let stopped = false;
  let inFlight = false;

  const tick = async () => {
    // Skip rather than queue: a slow answer on a bad connection would
    // otherwise pile up requests against a command budget.
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const state = await readBridge({ code, since: getRev() });
      if (!stopped && state) onState(state);
    } catch (e) {
      if (!stopped && onError) onError(e);
    } finally {
      inFlight = false;
    }
  };

  tick();
  timer = setInterval(tick, intervalMs);

  return () => {
    stopped = true;
    if (timer) clearInterval(timer);
  };
}
