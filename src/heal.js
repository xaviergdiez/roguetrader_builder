/* Putting a browser's own copy back into an account that has lost it.

   Three things in this app keep a copy in the browser as well as in the
   account: the homebrew library (hulls, encounters, endeavours, void charts),
   and the decks and grounds drawn while signed out. Sign-in used to erase the
   account's side of all three (see signInRecord in lib/auth.js), and the
   browser's side was then no use: the library was overwritten with the
   account's empty one the moment it loaded, and decks and grounds were never
   sent again because they were already marked as moved.

   The rule here is the one a person would want:

     - the account's own version of anything always stands, and nothing it
       holds is ever removed;
     - a local entry the account lacks goes up if the account never had it
       (made in the browser, or while signed out), or if the account has lost
       EVERYTHING it used to hold of that kind, which is what a wipe looks
       like and is a case where no other device has added anything;
     - a local entry the account used to hold, while the account still holds
       other things, is left alone: another device removed it, and putting it
       back on every load would make a deletion impossible. It is reported
       instead, so the person can put it back with one click.

   "Used to hold" is a record kept in the browser of what the account last
   held, per kind: the snapshot. It is replaced, not added to, each time the
   account is read or written successfully.

   Pure apart from the storage handed in: see heal.check.mjs. */

export const SYNCED_KEY = 'rt:synced';
export const BACKUP_KEY = 'rt:homebrew:backup';
export const REINDEX_KEY = 'rt:reindexed';
const KEEP = 600;                       // ids remembered per kind

// The lists the homebrew library is made of.
export const HOMEBREW_LISTS = ['hulls', 'components', 'encounters', 'endeavours', 'battlemaps', 'mapgrounds', 'voidcharts'];

// An entry's identity: its id, or, for one that never had one, its content.
export const keyOf = (x) => (x && typeof x.id === 'string' && x.id ? x.id : JSON.stringify(x));

/* ------------------------------- the snapshot ------------------------------- */

function readAll(store) {
  try {
    const raw = store && store.getItem(SYNCED_KEY);
    const all = raw ? JSON.parse(raw) : {};
    return all && typeof all === 'object' && !Array.isArray(all) ? all : {};
  } catch {
    return {};                          // unreadable storage remembers nothing
  }
}

// What the account last held of one kind, as keys.
export function syncedIds(kind, uid, store = globalThis.localStorage) {
  const mine = readAll(store)[String(uid || '')];
  const list = mine && mine[kind];
  return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [];
}

// Replaces the record of what the account holds. False when the browser would
// not keep it; the next load then finds an older snapshot, which only makes it
// readier to put things back, never readier to remove them.
export function rememberSynced(kind, uid, ids, store = globalThis.localStorage) {
  if (!store || !uid) return false;
  try {
    const all = readAll(store);
    const key = String(uid);
    all[key] = { ...(all[key] || {}), [kind]: [...new Set((ids || []).filter((x) => typeof x === 'string'))].slice(-KEEP) };
    store.setItem(SYNCED_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

/* ---------------------- having looked for lost decks ----------------------

   The account is asked once per browser to list decks that dropped out of its
   index; after that it is the person's button. Recorded only when the ask
   went through, so a failed one is tried again. */
export function reindexTried(uid, store = globalThis.localStorage) {
  try {
    const all = JSON.parse((store && store.getItem(REINDEX_KEY)) || '{}');
    return Boolean(all && typeof all === 'object' && all[String(uid || '')]);
  } catch {
    return false;
  }
}
export function markReindexTried(uid, store = globalThis.localStorage) {
  if (!store || !uid) return false;
  try {
    let all = {};
    try { all = JSON.parse(store.getItem(REINDEX_KEY) || '{}') || {}; } catch { all = {}; }
    if (typeof all !== 'object' || Array.isArray(all)) all = {};
    all[String(uid)] = Date.now();
    store.setItem(REINDEX_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------- what to send ------------------------------- */

/* The local entries to put back. `remote` is what the account holds now,
   `known` what it held when it was last read, and `usable` says an entry is
   whole (a deck with its map, a ground with its floor). */
export function restorable(local, remote, known = [], usable = () => true) {
  const have = new Set((remote || []).map(keyOf));
  const knew = new Set(known || []);
  const wiped = (remote || []).length === 0 && knew.size > 0;
  const out = [];
  const seen = new Set();
  for (const x of local || []) {
    if (!x || typeof x !== 'object') continue;
    const k = keyOf(x);
    if (have.has(k) || seen.has(k)) continue;
    if (!usable(x)) continue;
    if (knew.has(k) && !wiped) continue;          // the account had it and someone removed it
    seen.add(k);
    out.push(x);
  }
  return out;
}

/* The local entries the account has lost to another device, for the person to
   decide on: held by the account once, absent now, and not put back above. */
export function removedElsewhere(local, remote, known = [], usable = () => true) {
  const have = new Set((remote || []).map(keyOf));
  const knew = new Set(known || []);
  const back = new Set(restorable(local, remote, known, usable).map(keyOf));
  const out = [];
  const seen = new Set();
  for (const x of local || []) {
    if (!x || typeof x !== 'object') continue;
    const k = keyOf(x);
    if (have.has(k) || back.has(k) || seen.has(k) || !knew.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

/* ----------------------------- the homebrew library ----------------------------- */

const listOf = (lib, name) => (lib && Array.isArray(lib[name]) ? lib[name] : []);

// What each list holds, as keys, for the snapshot.
export function homebrewIds(lib) {
  const out = {};
  for (const name of HOMEBREW_LISTS) out[name] = listOf(lib, name).map(keyOf);
  return out;
}

/* The account's library with this browser's missing entries added. `known` is
   { list: [keys] }, the snapshot. Returns the merged library, how many entries
   came back, and the ones left out because another device removed them
   ({ list, item }), for the person to put back if they want. */
export function mergeHomebrew(cloud, local, known) {
  const seen = known && typeof known === 'object' ? known : {};
  const merged = { ...(cloud || {}) };
  let added = 0;
  const left = [];
  for (const name of HOMEBREW_LISTS) {
    const remote = listOf(cloud, name);
    const mine = listOf(local, name);
    const back = restorable(mine, remote, seen[name] || []);
    merged[name] = [...remote, ...back];
    added += back.length;
    for (const item of removedElsewhere(mine, remote, seen[name] || [])) left.push({ list: name, item });
  }
  return { merged, added, left };
}

// Puts entries back into a library, skipping any it already holds.
export function putBack(lib, entries) {
  const out = { ...(lib || {}) };
  for (const { list, item } of entries || []) {
    if (!HOMEBREW_LISTS.includes(list)) continue;
    const have = new Set(listOf(out, list).map(keyOf));
    if (!have.has(keyOf(item))) out[list] = [...listOf(out, list), item];
  }
  return out;
}

/* One line for the person, or '' when nothing happened. */
export function describeRestore({ restored = 0, left = 0 } = {}) {
  const n = (c) => `${c} ${c === 1 ? 'entry' : 'entries'}`;
  const parts = [];
  if (restored) parts.push(`Put ${n(restored)} from this browser back into your account.`);
  if (left) parts.push(`${n(left)} in this browser's copy ${left === 1 ? 'is' : 'are'} no longer in your account, which usually means another device removed ${left === 1 ? 'it' : 'them'}.`);
  return parts.join(' ');
}
