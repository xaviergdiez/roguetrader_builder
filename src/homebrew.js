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

import { packMapLibrary } from './battlemap.js';

export const HOMEBREW_KEY = 'rt:homebrew';

// `encounters` rides here rather than on a route of its own. The Hobby plan
// allows twelve serverless functions and six are spent; an encounter library
// is the same kind of thing as a homebrew one — a few hundred bytes an entry,
// authored by one account, wanted on every device — and the route's own
// entry-count and byte guards cover it unchanged. See encounters.js.
// `battlemaps` are saved decks and `mapgrounds` are generated floors (see
// src/battlemap.js). Both are the GM's own library in the same sense, and
// both were being DROPPED here: normalise rebuilds the object from a fixed
// list of keys, so anything not named was silently discarded on every read
// and every write. A ground saved from the map survived in React state until
// the next round trip and then vanished.
export const EMPTY = {
  hulls: [], components: [], encounters: [], endeavours: [],
  battlemaps: [], mapgrounds: []
};

// Anything absent or the wrong shape reads as "no homebrew" rather than
// throwing: this comes from storage, another device, or a hand-edited blob.
export function normalise(h) {
  const src = h && typeof h === 'object' ? h : null;
  const entries = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
  return {
    hulls: entries(src && src.hulls),
    components: entries(src && src.components),
    encounters: entries(src && src.encounters),
    endeavours: entries(src && src.endeavours),
    battlemaps: entries(src && src.battlemaps),
    mapgrounds: entries(src && src.mapgrounds)
  };
}

/* What goes to storage and over the wire: saved decks with their dense layers
   packed (see battlemap.js packMap). Kept out of normalise() on purpose —
   that runs on every read, and a deck that was just unpacked should not be
   packed again before anyone has looked at it. */
export const forStorage = (h) => {
  const n = normalise(h);
  return { ...n, battlemaps: packMapLibrary(n.battlemaps) };
};

export const isEmpty = (h) => {
  const n = normalise(h);
  return n.hulls.length === 0 && n.components.length === 0
    && n.encounters.length === 0 && n.endeavours.length === 0
    && n.battlemaps.length === 0 && n.mapgrounds.length === 0;
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
    localStorage.setItem(HOMEBREW_KEY, JSON.stringify(forStorage(homebrew)));
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
  body: JSON.stringify({ homebrew: forStorage(homebrew) })
})).homebrew);
