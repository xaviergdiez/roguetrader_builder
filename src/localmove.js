/* Moving what a browser kept while signed out up to the account.

   Signed out, decks and the grounds they are drawn on (an uploaded floor is a
   ground) live in the browser alone. Signing in switches the app to the
   account's store and, until this existed, never looked at the browser's again:
   the decks and floors made on a phone before it was signed in were simply not
   there afterwards, and the other device never had them at all. The roster
   already moves its characters up on a first sign-in; this does the same for
   the map library, and for any browser, not only a first sign-in.

   The rule that keeps it safe is a record of what has been moved. A copy left
   behind in the browser is not a reason to put a deck back in an account that
   deleted it, so an item goes up once, and only if the account lacks it.

   Pure apart from the storage handed in: see localmove.check.mjs. */

export const MOVED_KEY = 'rt:localmoved';
const KEEP = 400;                       // ids remembered per kind, newest last

const kindKey = (kind) => (kind === 'grounds' ? 'g' : 'd');

function readAll(store) {
  try {
    const raw = store && store.getItem(MOVED_KEY);
    const all = raw ? JSON.parse(raw) : {};
    return all && typeof all === 'object' && !Array.isArray(all) ? all : {};
  } catch {
    return {};                          // unreadable storage remembers nothing
  }
}

// The ids already moved to this account from this browser.
export function movedIds(kind, uid, store = globalThis.localStorage) {
  const mine = readAll(store)[String(uid || '')];
  const list = mine && mine[kindKey(kind)];
  return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [];
}

// Remembers more. Returns false when the browser would not keep it, in which
// case the next sign-in will offer the same items again (and the account's own
// copy still wins, so nothing is duplicated).
export function markMoved(kind, uid, ids, store = globalThis.localStorage) {
  if (!store || !uid) return false;
  try {
    const all = readAll(store);
    const key = String(uid);
    const k = kindKey(kind);
    const have = movedIds(kind, uid, store);
    const merged = [...new Set([...have, ...(ids || []).filter((x) => typeof x === 'string')])].slice(-KEEP);
    all[key] = { ...(all[key] || {}), [k]: merged };
    store.setItem(MOVED_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

/* What is worth sending: items the browser holds that the account does not,
   that were not moved before, and that `usable` says are whole (a deck with its
   map, a ground with its floor). */
export function toMove(local, remote, moved = [], usable = () => true) {
  const have = new Set((remote || []).map((x) => x && x.id));
  const done = new Set(moved || []);
  const seen = new Set();
  const out = [];
  for (const x of local || []) {
    if (!x || typeof x.id !== 'string' || !x.id) continue;
    if (have.has(x.id) || done.has(x.id) || seen.has(x.id)) continue;
    if (!usable(x)) continue;
    seen.add(x.id);
    out.push(x);
  }
  return out;
}

/* One line for the person, or '' when nothing happened. `left` is what could
   not go (too big for the account, or the account refused it): said, because
   they are still only in this browser. */
export function describeMove({ decks = 0, grounds = 0, left = 0 } = {}) {
  const n = (c, one, many) => `${c} ${c === 1 ? one : many}`;
  const bits = [];
  if (decks) bits.push(n(decks, 'deck', 'decks'));
  if (grounds) bits.push(n(grounds, 'environment', 'environments'));
  const moved = bits.length ? `Moved ${bits.join(' and ')} from this browser to your account.` : '';
  const stuck = left
    ? ` ${n(left, 'item', 'items')} could not be moved and ${left === 1 ? 'is' : 'are'} still only in this browser.`
    : '';
  return (moved + stuck).trim();
}
