/* What a crash must not cost: the work the browser holds.

   Everything this app keeps locally is under "rt:" in localStorage (the
   character being built, the roster, saved decks and grounds, the homebrew
   library, the markers that say what has been synced). When a screen fails to
   draw, the error screen offers all of it as one file to keep, so a bug in
   drawing never strands the work it was drawing. Pure, with the storage passed
   in: see recovery.check.mjs. */

export const SAVED_PREFIX = 'rt:';

export function savedWork(storage, now = Date.now()) {
  const keys = {};
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (typeof k !== 'string' || !k.startsWith(SAVED_PREFIX)) continue;
      try { keys[k] = storage.getItem(k); } catch { /* one unreadable key does not cost the rest */ }
    }
  } catch { /* storage blocked: an empty file says so */ }
  return { app: 'roguetrader-builder', savedAt: new Date(now).toISOString(), keys };
}

export const savedWorkName = (now = Date.now()) =>
  `roguetrader-saved-work-${new Date(now).toISOString().slice(0, 10)}.json`;

// What the error screen says about the error itself: short, and never a stack in the person's face.
export function errorLine(error) {
  const text = error && (error.message || String(error));
  return String(text || 'unknown error').replace(/\s+/g, ' ').slice(0, 200);
}
