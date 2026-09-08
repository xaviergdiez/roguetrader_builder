// Character roster. Mirrors the offline branch of CharacterList.jsx in the
// reference repos: a flat list in localStorage, because this app has no /api
// yet. When one exists, swap readRoster/writeRoster for fetch calls and leave
// everything below untouched.
//
// The list operations are pure so roster.check.mjs can exercise them in node.

export const ROSTER_KEY = 'rt:chars';

export function upsert(list, char) {
  const i = list.findIndex((c) => c.id === char.id);
  if (i === -1) return [...list, char];
  const next = list.slice();
  next[i] = char;
  return next;
}

export function remove(list, id) {
  return list.filter((c) => c.id !== id);
}

export function newId() {
  return globalThis.crypto && globalThis.crypto.randomUUID
    ? globalThis.crypto.randomUUID()
    : 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function readRoster() {
  try {
    const v = JSON.parse(localStorage.getItem(ROSTER_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// Returns false rather than throwing when the write fails. It really can:
// portraits are stored as data URLs and a few of them will pass the ~5MB
// localStorage quota, so the caller has to be able to say so.
export function writeRoster(list) {
  try {
    localStorage.setItem(ROSTER_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}
