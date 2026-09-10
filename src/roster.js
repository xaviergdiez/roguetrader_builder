// Character roster, with two backends.
//
//   cloud — /api/characters, keyed to the signed-in Google account, so the
//           roster follows the player between devices. Authoritative when
//           available; entries arrive WITHOUT their state and the body is
//           fetched on open, because the index carries every character and a
//           portrait each would be megabytes of response.
//   local — localStorage, for `vite dev` and for a signed-out browser. Entries
//           carry their state inline.
//
// Not dual-written: mirroring every cloud save into localStorage would
// reintroduce the quota failure the cloud path exists to escape.
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

/* ------------------------------- cloud backend ------------------------------ */

// A plain `vite dev` has no serverless runtime and answers /api/* with the SPA
// fallback at status 200, so a 2xx proves nothing — the body has to be JSON.
// This is the same trap that made the sheet importer report success on failure.
async function callApi(path, opts) {
  const res = await fetch(`/api/characters${path}`, opts);
  if (!res.ok) {
    let why = `The roster service returned ${res.status}.`;
    if (res.status === 401) why = 'Signed out — sign in again to reach your roster.';
    else if ((res.headers.get('content-type') || '').includes('json')) {
      try { why = (await res.json()).error || why; } catch { /* keep the status */ }
    }
    throw new Error(why);
  }
  if (!(res.headers.get('content-type') || '').includes('json')) {
    throw new Error('The roster service is not running here.');
  }
  return res.json();
}

// Metadata only; each entry has no `state` until cloudGet fetches it.
export async function cloudList() {
  const d = await callApi('');
  return Array.isArray(d.chars) ? d.chars : [];
}

export const cloudGet = (id) => callApi(`?c=${encodeURIComponent(id)}`);

export const cloudPut = (char) =>
  callApi(`?c=${encodeURIComponent(char.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: char.name, career: char.career, state: char.state })
  });

export const cloudDelete = (id) =>
  callApi(`?c=${encodeURIComponent(id)}`, { method: 'DELETE' });
