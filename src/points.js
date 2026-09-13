// Point-buy characteristics.
//
// Every characteristic starts at 25, and the player distributes a pool of 100
// points across the nine. The result is a PRE-MODIFIER value, exactly like a
// 2d10+25 roll — origin modifiers still apply on top — so a point-bought
// character feeds the same downstream path as a rolled one and nothing else in
// the app needs to know which was used.
//
// The cost per +1 is tiered, not flat: cheap near the 2d10+25 average, then
// steadily pricier approaching the 45 ceiling a roll could also reach.
//   26-35: 1 point each   (10 points to reach 35)
//   36-40: 2 points each  (20 cumulative at 40)
//   41-45: 3 points each  (35 cumulative at 45)
// 45 is a hard ceiling — unlike a 2d10+25 roll, point-buy cannot land higher —
// so the full 100-point pool cannot push every stat to the top; spending it
// asymmetrically is the point of the tiers.
//
// Pure: see points.check.mjs.

export const POINT_BASE = 25;
export const POINT_POOL = 100;
export const POINT_CAP = 45;
export const MAX_RAISE = POINT_CAP - POINT_BASE;   // 20: the most a stat can be raised

export const CHAR_ORDER = ['ws', 'bs', 's', 't', 'ag', 'int', 'per', 'wp', 'fel'];

export const emptyAllocation = () =>
  CHAR_ORDER.reduce((a, k) => { a[k] = 0; return a; }, {});

const clean = (n) => {
  const v = Math.floor(Number(n) || 0);
  return v > 0 ? Math.min(v, MAX_RAISE) : 0;    // 0-20: never below base, never past 45
};

// The point cost of raising a single characteristic TO this pre-modifier
// value from the one below it — i.e. the price of one +1 step.
const stepCost = (value) => (value <= 35 ? 1 : value <= 40 ? 2 : 3);

// Cumulative point cost of a raise of this size, from the 25 base.
function costForRaise(raise) {
  let total = 0;
  for (let v = POINT_BASE + 1; v <= POINT_BASE + raise; v++) total += stepCost(v);
  return total;
}

export function pointsSpent(alloc) {
  return CHAR_ORDER.reduce((n, k) => n + costForRaise(clean(alloc && alloc[k])), 0);
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
// below the base, never past the 45 cap, and never past what is left in the
// pool once each step's own (rising) cost is accounted for.
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
  const roomToCap = MAX_RAISE - current;
  const wanted = Math.min(d, roomToCap);
  if (wanted <= 0) return 0;
  // Costs rise with each step, so afford as many as the remaining pool
  // covers rather than checking the total up front.
  let pool = pointsRemaining(alloc);
  let granted = 0;
  for (let i = 1; i <= wanted; i++) {
    const cost = stepCost(POINT_BASE + current + i);
    if (cost > pool) break;
    pool -= cost;
    granted++;
  }
  return granted;
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
