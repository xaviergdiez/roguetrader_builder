// Point-buy characteristics.
//
// Every characteristic starts at 25, and the player distributes a pool of 100
// points across the nine. The result is a PRE-MODIFIER value, exactly like a
// 2d10+25 roll — origin modifiers still apply on top — so a point-bought
// character feeds the same downstream path as a rolled one and nothing else in
// the app needs to know which was used.
//
// For reference on the ranges: 2d10+25 yields 27-45 and averages 36; 100
// points spread evenly over nine stats is 25 + 11.1, so the two methods land
// in the same place.
//
// Pure: see points.check.mjs.

export const POINT_BASE = 25;
export const POINT_POOL = 100;

export const CHAR_ORDER = ['ws', 'bs', 's', 't', 'ag', 'int', 'per', 'wp', 'fel'];

export const emptyAllocation = () =>
  CHAR_ORDER.reduce((a, k) => { a[k] = 0; return a; }, {});

const clean = (n) => {
  const v = Math.floor(Number(n) || 0);
  return v > 0 ? v : 0;          // no negative allocations, so 25 is the floor
};

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
// below the base, never past what is left in the pool.
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
  return Math.min(d, Math.max(0, pointsRemaining(alloc)));
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
