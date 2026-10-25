// Nerve: Fear tests, Shock, and running Insanity / Corruption totals.
//
// The origin path rolls Insanity and Corruption once and the Dossier keeps a
// running counter, but nothing asked a character to hold their nerve in the
// first place. This is that missing flow, borrowed in spirit from
// Inquisitor's Nerve tests (Fearsome stops a charge, Terrifying makes the
// victim flee) and expressed in Rogue Trader's own terms: a Willpower test
// against a Fear rating, Degrees of Failure feeding a Shock result.
//
// The Shock table and the point thresholds below are house tables, kept as
// plain data so the GM can swap numbers without touching the logic. Dice are
// injected, same as everywhere else: callers pass the d100 they rolled.

import { resolveTest } from './dice.js';

/* ------------------------------ Fear ratings ------------------------------ */

// "Fear (3)" in bestiary ability text. 0 when absent; Fearless is its own
// flag because it ignores Fear entirely rather than being a rating.
export function parseFear(text) {
  const m = String(text || '').match(/\bFear\s*\((\d+)\)/i);
  return m ? Number(m[1]) : 0;
}

export const isFearless = (text) => /\bFearless\b/i.test(String(text || ''));

// Fear 1 is an unmodified test; each further rating costs 10.
export const fearModifier = (rating) => 10 * Math.min(0, 1 - (Number(rating) || 1));

/* ------------------------------ Shock ------------------------------ */

// Rolled d100 + 10 per Degree of Failure. Each band lands as a ground-combat
// condition (see GROUND_CONDITIONS), so the result shows on the board.
export const SHOCK_TABLE = [
  { max: 20, text: 'Rattled', condition: { id: 'shaken', rounds: 1 }, insanity: 0 },
  { max: 40, text: 'Shaken', condition: { id: 'shaken', rounds: 3 }, insanity: 0 },
  { max: 60, text: 'Frozen with fear', condition: { id: 'stunned', rounds: 1 }, insanity: 1 },
  { max: 80, text: 'Flees in terror', condition: { id: 'fleeing', rounds: 3 }, insanity: 1 },
  { max: Infinity, text: 'Breaks entirely', condition: { id: 'fleeing', rounds: 5 }, insanity: 2 }
];

export const shockResult = (roll, degreesOfFailure = 0) => {
  const score = (Number(roll) || 0) + 10 * Math.max(0, Number(degreesOfFailure) || 0);
  return { score, ...SHOCK_TABLE.find((r) => score <= r.max) };
};

// One Fear test. `roll` is the Willpower d100, `shockRoll` the d100 for the
// Shock table, only used on a failure. Fearless and a rating of 0 pass
// without a roll.
export function fearTest({ willpower = 0, rating = 1, roll, shockRoll = 0, otherMod = 0, fearless = false } = {}) {
  if (fearless || !(Number(rating) > 0)) return { passed: true, skipped: true, insanity: 0, condition: null };
  const test = resolveTest(Number(willpower) || 0, fearModifier(rating) + (Number(otherMod) || 0), roll);
  if (test.success) return { ...test, passed: true, skipped: false, insanity: 0, condition: null };
  const shock = shockResult(shockRoll, test.degrees);
  return {
    ...test, passed: false, skipped: false,
    shock, insanity: shock.insanity, condition: shock.condition
  };
}

/* ------------------------------ running totals ------------------------------ */

export const INSANITY_STEP = 10;     // a Disorder check each time this is crossed
export const CORRUPTION_STEP = 30;   // a Malignancy check each time this is crossed

const clampPoints = (n) => Math.max(0, Math.floor(Number(n) || 0));

// How many thresholds were crossed going from `before` to `after`.
const crossed = (before, after, step) => Math.floor(after / step) - Math.floor(before / step);

export function addInsanity(current, gained) {
  const before = clampPoints(current);
  const total = before + clampPoints(gained);
  return { total, disorderChecks: Math.max(0, crossed(before, total, INSANITY_STEP)) };
}

export function addCorruption(current, gained) {
  const before = clampPoints(current);
  const total = before + clampPoints(gained);
  return { total, malignancyChecks: Math.max(0, crossed(before, total, CORRUPTION_STEP)) };
}

// For the sheet: where a total sits against the next flagged threshold.
export const nextThreshold = (total, step) => (Math.floor(clampPoints(total) / step) + 1) * step;
