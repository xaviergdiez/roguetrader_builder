/* Sharing the map library as a whole.

   A deck is a drawing, and the environment it is drawn on (a generated ground)
   is a separate record it only points at. Handing a deck to another GM, or to
   another device, without the grounds it uses leaves them a deck that quietly
   falls back to a built-in floor. So a file carries both: the decks, and the
   saved grounds those decks use.

   One format does for everything the panel can hand over: a single deck, a
   whole library, or a ground. It is plain JSON, a file anyone can keep, email,
   or put in a shared folder, and nothing about it needs this app's server.
   Reading is deliberately forgiving about SHAPE (a single saved deck, a bare
   map, a list of them all come in) and strict about CONTENT: every map goes
   through readMap and every ground through readCustomTheme, so a file from
   anywhere cannot put anything into the library the app would not have put
   there itself.

   Pure: see mapbundle.check.mjs. */

import {
  MAP_THEMES, packMap, readMap, readSavedMap, readCustomTheme, groundsUsed
} from './battlemap.js';

export const BUNDLE_KIND = 'rt-battlemap-library';
export const BUNDLE_VERSION = 1;

// A file is read whole, in memory, so it has a ceiling. Forty megabytes is
// well past a library of big decks and a dozen grounds, and well short of
// something that would stall the tab.
export const MAX_BUNDLE_BYTES = 40_000_000;
export const MAX_IMPORT_DECKS = 100;
export const MAX_IMPORT_GROUNDS = 60;

const BUILT_IN = new Set(MAP_THEMES.map((t) => t.id));

/* ------------------------------ names ------------------------------ */

/* A name that is not in `taken`: "Hulk deck" becomes "Hulk deck (2)", then
   "(3)". Compared without case or edge spaces, because two decks that differ
   only by a capital are the same deck to the person looking at the list. */
export function uniqueName(name, taken) {
  const norm = (s) => String(s || '').trim().toLowerCase();
  const have = new Set([...(taken || [])].map(norm));
  const base = String(name || '').trim().slice(0, 70) || 'Imported deck';
  if (!have.has(norm(base))) return base;
  for (let n = 2; n < 1000; n++) {
    const next = `${base} (${n})`;
    if (!have.has(norm(next))) return next;
  }
  return `${base} (${Date.now().toString(36)})`;
}

// A name fit for a file: letters, digits and dashes, and the day it was made.
export function bundleFileName(name, now = Date.now()) {
  const slug = String(name || 'library').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'library';
  const d = new Date(now);
  const day = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  return `rt-maps-${slug}-${day}.json`;
}

/* ------------------------------ what a deck uses ------------------------------ */

// The saved grounds a map is drawn on: its own theme and any it paints with,
// less the built-in ones, which every copy of the app already has.
export const customGroundIds = (map) => groundsUsed(map).filter((id) => !BUILT_IN.has(id));

/* The grounds out of `grounds` that these decks use. A deck may name a ground
   that has since been deleted; it is simply not there to hand over. */
export function groundsForDecks(decks, grounds) {
  const want = new Set();
  for (const d of decks || []) if (d && d.map) for (const id of customGroundIds(d.map)) want.add(id);
  return (grounds || []).filter((g) => want.has(g.id));
}

/* ------------------------------ making a file ------------------------------ */

/* `decks` are { id, name, map } with their maps in hand; `grounds` are whole
   records, floors included. Maps are packed, as they are in storage, so a big
   deck is a few tens of kilobytes in the file rather than a megabyte. */
export function makeBundle({ decks = [], grounds = [], name = '', now = Date.now() } = {}) {
  return {
    app: 'rogue-trader-builder',
    kind: BUNDLE_KIND,
    v: BUNDLE_VERSION,
    name: String(name || '').slice(0, 80),
    exportedAt: new Date(now).toISOString(),
    decks: (decks || []).filter((d) => d && d.map).map((d) => ({
      id: String(d.id || ''), name: String(d.name || '').slice(0, 80), map: packMap(readMap(d.map))
    })),
    grounds: (grounds || []).map(readCustomTheme).filter(Boolean)
  };
}

export const bundleText = (bundle) => JSON.stringify(bundle);

/* ------------------------------ reading a file ------------------------------ */

const fail = (error) => ({ ok: false, error, decks: [], grounds: [], dropped: 0 });

// Something that looks like a deck: a saved deck, or a bare map.
const looksLikeMap = (m) => Boolean(m) && typeof m === 'object'
  && ('floor' in m || 'cols' in m || 'rows' in m);

function asDeck(x) {
  if (!x || typeof x !== 'object') return null;
  if (x.map && typeof x.map === 'object') {
    if (!looksLikeMap(x.map)) return null;
    const s = readSavedMap({ name: x.name, map: x.map });
    return { name: s.name, map: s.map };
  }
  if (looksLikeMap(x)) {
    const s = readSavedMap({ name: x.name, map: x });
    return { name: s.name, map: s.map };
  }
  return null;
}

/* What a file holds, normalised: { ok, decks: [{name, map}], grounds: [ground],
   dropped }. `dropped` counts entries that were there and could not be used (a
   ground with no floor, something that is not a map), so the person importing
   is told rather than left to wonder where the fifth deck went. */
export function readBundle(input) {
  let src = input;
  if (typeof input === 'string') {
    if (input.length > MAX_BUNDLE_BYTES) return fail('That file is too large to import.');
    try { src = JSON.parse(input); } catch { return fail('That file is not JSON, so it is not one this app wrote.'); }
  }
  if (!src || typeof src !== 'object') return fail('That file has nothing in it this app can read.');

  const decks = [];
  const grounds = [];
  let dropped = 0;
  const sort = (x) => {
    const d = asDeck(x);
    if (d) { decks.push(d); return; }
    const g = readCustomTheme(x);
    if (g) { grounds.push(g); return; }
    dropped++;
  };

  if (Array.isArray(src)) {
    src.forEach(sort);
  } else if (src.kind === BUNDLE_KIND || Array.isArray(src.decks) || Array.isArray(src.grounds)) {
    for (const x of Array.isArray(src.decks) ? src.decks : []) {
      const d = asDeck(x);
      if (d) decks.push(d); else dropped++;
    }
    for (const x of Array.isArray(src.grounds) ? src.grounds : []) {
      const g = readCustomTheme(x);
      if (g) grounds.push(g); else dropped++;
    }
  } else {
    sort(src);
  }

  if (!decks.length && !grounds.length) {
    return { ok: false, error: 'There are no decks or environments in that file.', decks: [], grounds: [], dropped };
  }
  const overD = Math.max(0, decks.length - MAX_IMPORT_DECKS);
  const overG = Math.max(0, grounds.length - MAX_IMPORT_GROUNDS);
  return {
    ok: true, error: '',
    decks: decks.slice(0, MAX_IMPORT_DECKS),
    grounds: grounds.slice(0, MAX_IMPORT_GROUNDS),
    dropped: dropped + overD + overG
  };
}

/* ------------------------------ planning an import ------------------------------ */

/* What importing would do, worked out before anything is written so the person
   can be shown it:

     decks     each gets a NEW id (importing never overwrites a deck you have)
               and a name that does not clash with one you have
     grounds   a ground whose id you already hold is not imported again; it is
               the same ground, and replacing yours with a copy could undo a
               rename. Only the ones you lack come in.
     missing   saved grounds an imported deck is drawn on that are in neither
               your library nor the file: the deck will use a built-in floor
               until that ground is found

   `existing` is { decks: [{name}], grounds: [{id}] }. */
export function planImport(read, existing = {}) {
  const haveNames = (existing.decks || []).map((d) => d.name);
  const haveGrounds = new Set((existing.grounds || []).map((g) => g.id));
  const taken = [...haveNames];
  const decks = (read.decks || []).map((d) => {
    const name = uniqueName(d.name, taken);
    taken.push(name);
    // No id handed in: readSavedMap makes a fresh one.
    const s = readSavedMap({ name, map: d.map });
    return { id: s.id, name: s.name, map: s.map };
  });
  const grounds = [];
  let already = 0;
  const inFile = new Set();
  for (const g of read.grounds || []) {
    if (haveGrounds.has(g.id) || inFile.has(g.id)) { already++; continue; }
    inFile.add(g.id);
    grounds.push(g);
  }
  const available = new Set([...haveGrounds, ...inFile]);
  const missing = new Set();
  for (const d of decks) for (const id of customGroundIds(d.map)) if (!available.has(id)) missing.add(id);
  return { decks, grounds, alreadyHad: already, missing: [...missing], dropped: read.dropped || 0 };
}

/* One line saying what a plan will do, for the confirm. */
export function describePlan(plan) {
  const n = (c, one, many) => `${c} ${c === 1 ? one : many}`;
  const bits = [];
  if (plan.decks.length) bits.push(n(plan.decks.length, 'deck', 'decks'));
  if (plan.grounds.length) bits.push(n(plan.grounds.length, 'environment', 'environments'));
  return bits.length ? bits.join(' and ') : 'nothing new';
}
