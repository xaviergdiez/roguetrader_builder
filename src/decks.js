/* The saved-deck library.

   Split out of the homebrew library, which is one blob with one budget of
   900KB: a deck is a record per square, and a big one — up to 500 x 500 — took
   a large part of that on its own. Two of them filled it, and then the hulls,
   encounters and journals it was sized for stopped saving.

   Shaped like grounds.js, because it has the same problem. Signed in, the
   index comes back with a name and a size per deck and no maps, and a deck is
   fetched when it is opened or loaded onto the map. Signed out there is no
   network to spare, so localStorage holds them whole.

   readSavedMap in battlemap.js is what reads a record; packMap is what makes
   it small. This module only moves them. */

import { packMap } from './battlemap.js';

const KEY = 'rt:decks';
const API = '/api/decks';

/* ---------------------------------- local ---------------------------------- */

export function readLocal() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((d) => d && typeof d === 'object') : [];
  } catch {
    return [];                       // unreadable storage is an empty library
  }
}

// Whole decks, maps packed. Returns false rather than throwing when the quota
// is full, so the caller can say so.
export function writeLocal(list) {
  try {
    const decks = (Array.isArray(list) ? list : []).filter((d) => d && d.map)
      .map((d) => ({ id: d.id, name: d.name, map: packMap(d.map) }));
    localStorage.setItem(KEY, JSON.stringify(decks));
    return true;
  } catch {
    return false;
  }
}

/* ---------------------------------- cloud ---------------------------------- */

async function callApi(suffix = '', opts) {
  const res = await fetch(API + suffix, {
    credentials: 'same-origin',
    headers: opts ? { 'Content-Type': 'application/json' } : undefined,
    ...opts
  });
  if (!res.ok) {
    let why = `Could not reach your decks (${res.status})`;
    try { why = (await res.json()).error || why; } catch { /* not json */ }
    throw new Error(why);
  }
  return res.json();
}

// The index: every deck's name and size, no maps.
export const cloudList = async () => (await callApi()).decks || [];

// One deck, map included.
export const cloudGet = (id) => callApi(`?d=${encodeURIComponent(id)}`);

/* Saves one. With a map it writes the deck (packed here too, so a big one is
   not sent as megabytes of per-square keys); with only a name it renames,
   without sending the map again. */
export const cloudPut = ({ id, name, map }) =>
  callApi(`?d=${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(map ? { name, map: packMap(map) } : { name })
  });

export const cloudDelete = (id) =>
  callApi(`?d=${encodeURIComponent(id)}`, { method: 'DELETE' });

/* -------------------------------- migration --------------------------------

   Decks lived in homebrew.battlemaps until now. Anything found there is moved
   here rather than left to sit in a budget it should never have shared — and
   NOT dropped: that is the failure the grounds split came out of.

   Returns the homebrew library with battlemaps emptied, so the caller writes
   it back only once the decks are safely stored. */
export function takeLegacy(homebrew) {
  const src = homebrew && typeof homebrew === 'object' ? homebrew : null;
  const legacy = Array.isArray(src && src.battlemaps)
    ? src.battlemaps.filter((d) => d && typeof d === 'object' && d.map) : [];
  return {
    legacy,
    cleaned: legacy.length ? { ...src, battlemaps: [] } : src
  };
}

/* What the picker shows for a deck whose map is not loaded: its size, if the
   index knows it. */
export const deckSize = (d) => (d && d.cols && d.rows ? `${d.cols}×${d.rows}` : '');
