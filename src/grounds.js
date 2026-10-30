/* The generated-ground library.

   Split out of the homebrew library, which is one blob with one budget: a
   ground carries its floor as a data URL, so a handful of them crowded out
   the hulls, encounters and journals that library was sized for.

   Shaped like roster.js, because it has the same problem — many records, each
   carrying an image. Signed in, the index comes back without floors and a
   floor is fetched when a deck actually needs it. Signed out, there is no
   network to spare, so localStorage holds them whole.

   readCustomTheme in battlemap.js is what validates a record; this module
   only moves them. */

const KEY = 'rt:grounds';
const API = '/api/grounds';

/* ---------------------------------- local ---------------------------------- */

export function readLocal() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((g) => g && typeof g === 'object') : [];
  } catch {
    return [];                       // unreadable storage is an empty library
  }
}

export function writeLocal(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(Array.isArray(list) ? list : []));
    return true;
  } catch {
    return false;                    // quota: the caller reports it
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
    let why = `Could not reach your grounds (${res.status})`;
    try { why = (await res.json()).error || why; } catch { /* not json */ }
    throw new Error(why);
  }
  return res.json();
}

/* Everything out of this store is one of the GM's own grounds, so it is
   marked as such on the way in.

   The server has no reason to say so — it only ever holds the GM's grounds —
   but the renderer tells a saved ground from a built-in one by this flag, and
   without it a ground came back from the index as neither: it appeared in the
   picker and was then never asked for its floor or its props, because the
   code that fetches those skips anything that is not custom. It only showed
   after a reload, since a ground saved in THIS session still had its floor in
   memory. */
const mine = (g) => ({ ...g, custom: true });

// The index: every ground's name and numbers, no floors.
export const cloudList = async () => ((await callApi()).grounds || []).map(mine);

// One ground, floor included.
export const cloudGet = async (id) => mine(await callApi(`?g=${encodeURIComponent(id)}`));

export const cloudPut = async (ground) =>
  mine(await callApi(`?g=${encodeURIComponent(ground.id)}`, {
    method: 'PUT',
    body: JSON.stringify(ground)
  }));

export const cloudDelete = (id) =>
  callApi(`?g=${encodeURIComponent(id)}`, { method: 'DELETE' });

/* -------------------------------- migration --------------------------------

   Grounds lived in homebrew.mapgrounds for one release. Anything found there
   is moved here rather than left to sit in a budget it should never have
   shared — and crucially, NOT dropped: that is the failure this whole split
   came out of.

   Returns the homebrew library with mapgrounds emptied, so the caller writes
   it back only once the grounds are safely stored. */
export function takeLegacy(homebrew) {
  const src = homebrew && typeof homebrew === 'object' ? homebrew : null;
  const legacy = Array.isArray(src && src.mapgrounds)
    ? src.mapgrounds.filter((g) => g && typeof g === 'object') : [];
  return {
    legacy,
    cleaned: legacy.length ? { ...src, mapgrounds: [] } : src
  };
}
