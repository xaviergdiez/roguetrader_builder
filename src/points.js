// Point-buy characteristics.
//
// The rulebook's alternate method, verbatim: every characteristic starts at
// 25 and the player allocates a total of 100 additional points, ADDING NO
// MORE THAN 20 TO ANY ONE. A point is a point — one spent is one added.
//
// An earlier pass here priced the steps on a rising tier (1 point to 35, 2
// to 40, 3 to 45). That is not the printed rule, and it quietly broke the
// book's own promise that this method "will generate characters with
// slightly higher than average scores": under tiers the full pool buys only
// about 45 points of characteristics, landing a point-bought character well
// BELOW the 36 a 2d10+25 roll averages. Flat, the nine total 325 — an
// average of 36.1, which is the "slightly higher" the book describes.
//
// The 20-point cap is the rule; the 45 ceiling is its consequence, so it is
// derived in that direction rather than the other way round.
//
// The result is a PRE-MODIFIER value, exactly like a 2d10+25 roll — origin
// modifiers still apply on top — so a point-bought character feeds the same
// downstream path as a rolled one and nothing else in the app needs to know
// which was used.
//
// Pure: see points.check.mjs.

export const POINT_BASE = 25;
export const POINT_POOL = 100;
export const MAX_RAISE = 20;                       // "no more than 20 to any one"
export const POINT_CAP = POINT_BASE + MAX_RAISE;   // 45, as a consequence

export const CHAR_ORDER = ['ws', 'bs', 's', 't', 'ag', 'int', 'per', 'wp', 'fel'];

export const emptyAllocation = () =>
  CHAR_ORDER.reduce((a, k) => { a[k] = 0; return a; }, {});

const clean = (n) => {
  const v = Math.floor(Number(n) || 0);
  return v > 0 ? Math.min(v, MAX_RAISE) : 0;    // 0-20: never below base, never past 45
};

// One point, one step. The whole cost model.
export function pointsSpent(alloc) {
  return CHAR_ORDER.reduce((n, k) => n + clean(alloc && alloc[k]), 0);
}

export const pointsRemaining = (alloc) => POINT_POOL - pointsSpent(alloc);

// The pre-modifier characteristics an allocation produces.
export function allocationTotals(alloc) {
  return CHAR_ORDER.reduce((out, k) => {
    out[k] = POINT_BASE + clean(alloc && alloc[k]);
    return out;
  }, {});
}

// How much of `delta` can actually be applied to one characteristic: never
// below the base, never more than 20 above it, and never more than the pool
// has left.
export function grantable(alloc, charKey, delta) {
  const d = Math.floor(Number(delta) || 0);
  if (!CHAR_ORDER.includes(charKey) || d === 0) return 0;
  const current = clean(alloc && alloc[charKey]);
  if (d < 0) {
    // Negating a zero yields -0, which is falsy and compares equal to 0 but is
    // a distinct value to Object.is and to strict assertions, and survives a
    // JSON round trip as -0. Return a plain zero instead.
    const take = Math.min(-d, current);
    return take === 0 ? 0 : -take;
  }
  const room = Math.min(MAX_RAISE - current, pointsRemaining(alloc));
  return Math.max(0, Math.min(d, room));
}

// Applies what it can and returns a new allocation, leaving the original
// untouched. Returns the same object identity when nothing moved, so a caller
// can skip a re-render.
export function allocate(alloc, charKey, delta) {
  const granted = grantable(alloc, charKey, delta);
  if (!granted) return alloc;
  const next = { ...emptyAllocation(), ...alloc };
  next[charKey] = clean(next[charKey]) + granted;
  return next;
}

// A pool that is fully spent and nowhere over it.
export const isComplete = (alloc) => pointsRemaining(alloc) === 0;
