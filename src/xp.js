// Experience, career rank, and the cost of characteristic advances.
//
// Source of truth: the Rogue Trader career advance tables supplied for this
// project. Pure: see xp.check.mjs.

// Cumulative XP thresholds. Rank 8 is open-ended.
export const RANKS = [
  { rank: 1, min: 0, max: 6999 },
  { rank: 2, min: 7000, max: 9999 },
  { rank: 3, min: 10000, max: 12999 },
  { rank: 4, min: 13000, max: 16999 },
  { rank: 5, min: 17000, max: 20999 },
  { rank: 6, min: 21000, max: 24999 },
  { rank: 7, min: 25000, max: 28999 },
  { rank: 8, min: 29000, max: Infinity }
];

// A starting Explorer is built on this much XP.
export const STARTING_XP = { min: 4500, max: 5000 };

export function rankForXp(xp) {
  const n = Math.max(0, Math.floor(xp || 0));
  return (RANKS.find((r) => n >= r.min && n <= r.max) || RANKS[RANKS.length - 1]).rank;
}

// XP still to earn before the next rank. null once Rank 8 is reached.
export function xpToNextRank(xp) {
  const n = Math.max(0, Math.floor(xp || 0));
  const here = RANKS.find((r) => n >= r.min && n <= r.max);
  if (!here || here.max === Infinity) return null;
  return here.max + 1 - n;
}

export const isStartingBudget = (xp) =>
  xp >= STARTING_XP.min && xp <= STARTING_XP.max;

/* --------------------------- characteristic advances ---------------------------
   Each advance raises a characteristic by +5. What it costs depends on where
   that characteristic sits in the career's scheme.                            */

export const ADVANCE_STEP = 5;
export const ADVANCE_LEVELS = ['simple', 'intermediate', 'trained', 'expert'];

export const CHAR_ADVANCE_COST = {
  primary:   { simple: 100, intermediate: 250, trained: 500,  expert: 750 },
  secondary: { simple: 250, intermediate: 500, trained: 750,  expert: 1000 },
  tertiary:  { simple: 500, intermediate: 750, trained: 1000, expert: 1500 }
};

export function advanceCost(tier, level) {
  const row = CHAR_ADVANCE_COST[tier];
  return row && row[level] != null ? row[level] : null;
}

// What N successive advances in one characteristic cost, cheapest first.
// Beyond the four defined levels there is no published cost, so this returns
// null rather than inventing one.
export function cumulativeAdvanceCost(tier, count) {
  const n = Math.floor(count || 0);
  if (n <= 0) return 0;
  if (n > ADVANCE_LEVELS.length) return null;
  let total = 0;
  for (let i = 0; i < n; i++) total += advanceCost(tier, ADVANCE_LEVELS[i]);
  return total;
}

// How many +5 advances separate a starting value from a final one.
export function advancesBetween(start, final) {
  const diff = (final || 0) - (start || 0);
  if (diff <= 0) return 0;
  return Math.ceil(diff / ADVANCE_STEP);
}
