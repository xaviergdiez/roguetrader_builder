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

// A starting Rank 1 Explorer enters play at 5,000 XP total, but that total is
// not a spending budget. 4,500 of it is the *value* of the free creation
// packages — the Origin Path nodes and the starting career package hand over
// every skill, talent, trait and gear item at no cost. Only the remaining 500
// is actually spendable, on characteristic advances or Rank 1 table advances,
// before session one.
//
// Conflating the two is the easy mistake: an audit that compares purchases
// against 5,000 will clear a sheet that has overspent tenfold.
export const STARTING_XP = { baseline: 4500, spendable: 500, total: 5000 };

// Ranks are written as Roman numerals. The ladder stops at 8, so a lookup is
// simpler and safer than a general numeral converter.
const ROMAN_RANKS = [null, 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
export function romanRank(n) {
  const i = Math.floor(n || 0);
  return ROMAN_RANKS[i] || String(i);
}

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
  xp >= STARTING_XP.baseline && xp <= STARTING_XP.total;

// How much of a stated total was ever available to spend. A fresh Explorer on
// 5,000 has 500; the 7,500 XP Rogue Trader has 3,000 — its initial 500 plus
// 2,500 earned in play.
export const spendableXp = (total) =>
  Math.max(0, Math.floor(total || 0) - STARTING_XP.baseline);

// What is left after purchases. Deliberately allowed to go negative: a sheet
// that has overspent should say so rather than clamp to zero and look fine.
export const remainingXp = (total, spent) =>
  spendableXp(total) - Math.max(0, Math.floor(spent || 0));

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
