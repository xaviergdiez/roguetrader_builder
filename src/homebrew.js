// Where the homebrew library lives.
//
//   cloud  /api/homebrew, keyed to the signed-in account, so a library follows
//          the player between devices. Authoritative when available.
//   local  localStorage, for `vite dev` and a signed-out browser.
//
// Mirrors roster.js deliberately: same two backends, same reason, same guard
// against a dev server that answers /api/* with the SPA shell at status 200.
//
// The list operations are pure so homebrew.check.mjs can exercise them in node.

export const HOMEBREW_KEY = 'rt:homebrew';

export const EMPTY = { hulls: [], components: [] };

// Anything absent or the wrong shape reads as "no homebrew" rather than
// throwing: this comes from storage, another device, or a hand-edited blob.
export function normalise(h) {
  const src = h && typeof h === 'object' ? h : null;
  const entries = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
  return { hulls: entries(src && src.hulls), components: entries(src && src.components) };
}

export const isEmpty = (h) => {
  const n = normalise(h);
  return n.hulls.length === 0 && n.components.length === 0;
};

/* --------------------------------- local --------------------------------- */

export function readLocal() {
  try {
    return normalise(JSON.parse(localStorage.getItem(HOMEBREW_KEY) || 'null'));
  } catch {
    return { ...EMPTY };
  }
}

// Returns false rather than throwing when the write fails, so the caller can
// say so. Far smaller than a portrait, but the quota is shared.
export function writeLocal(homebrew) {
  try {
    localStorage.setItem(HOMEBREW_KEY, JSON.stringify(normalise(homebrew)));
    return true;
  } catch {
    return false;
  }
}

/* --------------------------------- cloud --------------------------------- */

async function callApi(opts) {
  const res = await fetch('/api/homebrew', opts);
  if (!res.ok) {
    let why = `The homebrew service returned ${res.status}.`;
    if (res.status === 401) why = 'Signed out — sign in again to reach your homebrew.';
    else if ((res.headers.get('content-type') || '').includes('json')) {
      try { why = (await res.json()).error || why; } catch { /* keep the status */ }
    }
    throw new Error(why);
  }
  if (!(res.headers.get('content-type') || '').includes('json')) {
    throw new Error('The homebrew service is not running here.');
  }
  return res.json();
}

export const cloudGet = async () => normalise((await callApi()).homebrew);

export const cloudPut = async (homebrew) => normalise((await callApi({
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ homebrew: normalise(homebrew) })
})).homebrew);
