// Nerve: Fear tests, the Shock table, and running Insanity / Corruption.
//
// All of it is Rogue Trader (FFG 2009), Chapter X: Fear and Damnation,
// pp.294-300 — the table numbers below are the printed ones. Inquisitor
// supplied the idea (a Fearsome creature stops a charge; a Terrifying one
// makes the victim flee), but RT already has the machinery, so this module
// is the missing half of it: nothing in the app asked a character to hold
// their nerve, and Insanity/Corruption were counters with no consequences.
//
// Dice are injected, same as everywhere else: callers pass the d100 they
// rolled, and `d` (n => 1..n) for the little dice inside a Shock result.

import { resolveTest } from './dice.js';

const defaultD = (n) => 1 + Math.floor(Math.random() * n);

/* ------------------------------ Fear ratings ------------------------------ */

// "Fear (3)" in bestiary ability text. 0 when absent. Fearless is its own
// flag: it ignores Fear altogether rather than being a rating.
export function parseFear(text) {
  const m = String(text || '').match(/\bFear\s*\((\d+)\)/i);
  return m ? Number(m[1]) : 0;
}

export const isFearless = (text) => /\bFearless\b/i.test(String(text || ''));

// Table 10-3: Fear (1) Disturbing 0, (2) Frightening -10, (3) Horrifying -20,
// (4) Terrifying -30.
export const FEAR_LEVELS = [
  { rating: 1, name: 'Disturbing', mod: 0 },
  { rating: 2, name: 'Frightening', mod: -10 },
  { rating: 3, name: 'Horrifying', mod: -20 },
  { rating: 4, name: 'Terrifying', mod: -30 }
];
export const fearModifier = (rating) => {
  const r = Math.max(1, Math.min(4, Math.floor(Number(rating)) || 1));
  return FEAR_LEVELS[r - 1].mod;
};

// p.297: "If the first digit of a character's Insanity total is double or
// more a thing's Fear Rating, the character is unaffected and need not test."
export const insanityImmune = (insanityPoints, rating) =>
  Number(rating) > 0 && Math.floor((Number(insanityPoints) || 0) / 10) >= 2 * Number(rating);

/* ------------------------------ the Shock table ------------------------------
   Table 10-4. Roll d100, add 10 per Degree of Failure. `conditions` are
   ground-combat condition ids (groundcombat.js GROUND_CONDITIONS); `rounds`
   null means until the end of the encounter / until cleared. `snapOut` means
   a Willpower Test at the start of each Turn ends it. IP is [dice, die, flat]. */

const S = (max, text, extra) => ({ max, text, conditions: [], ip: [0, 0, 0], snapOut: false, wpDamage: [0, 0, 0], ...extra });

export const SHOCK_TABLE = [
  S(20, 'Badly startled: a single Half Action next Turn, then normal.',
    { conditions: [{ id: 'startled', rounds: 1 }] }),
  S(40, 'Fear grips the character; he shakes and trembles (-10 to all Tests for the encounter unless he recovers his wits).',
    { conditions: [{ id: 'shaken', rounds: null }], snapOut: true }),
  S(60, 'Reeling with shock; cannot willingly approach the object of his fear, -10 to all Tests until the end of the encounter.',
    { conditions: [{ id: 'backing_away', rounds: null }], ip: [0, 0, 1] }),
  S(80, 'Frozen by terror: no Actions until he snaps out of it, then -10 to all Tests for the encounter.',
    { conditions: [{ id: 'frozen', rounds: null }], ip: [1, 5, 0], snapOut: true }),
  S(100, 'Panic: must flee the source of fear; Half Actions only if prevented; -20 to all Tests. Must snap out of it once away.',
    { conditions: [{ id: 'fleeing', rounds: null }], ip: [1, 5, 0], snapOut: true }),
  S(120, 'Fainting dead away: unconscious 1d5 Rounds, then -10 to all Tests until the end of the encounter.',
    { conditions: [{ id: 'unconscious', rounds: [1, 5, 0] }, { id: 'shaken', rounds: null }], ip: [1, 5, 0] }),
  S(130, 'Totally overcome: screams and vomits for 1d5 Rounds, helpless; then a single Half Action each Turn until he can rest.',
    { conditions: [{ id: 'sobbing', rounds: [1, 5, 0] }], ip: [1, 5, 0] }),
  S(140, 'Laughs hysterically and attacks anything near him at random until he snaps out of it or is knocked unconscious.',
    { conditions: [{ id: 'frenzied', rounds: null }], ip: [1, 5, 0], snapOut: true }),
  S(160, 'Crumples to the ground for 1d5+1 Rounds, sobbing; then -20 to all Tests until the end of the encounter.',
    { conditions: [{ id: 'crumpled', rounds: [1, 5, 1] }], ip: [1, 5, 1] }),
  S(170, 'Mind snaps: catatonic for 1d5 hours and cannot be roused.',
    { conditions: [{ id: 'catatonic', rounds: null }], ip: [1, 10, 0] }),
  S(Infinity, 'Terrible visions: acute hallucinations for 2d10 Rounds, then -20 to all Tests while the encounter lasts. 1d10 permanent Willpower damage.',
    { conditions: [{ id: 'hallucinating', rounds: [2, 10, 0] }], ip: [2, 10, 0], wpDamage: [1, 10, 0] })
];

const rollDice = ([n, die, flat], d) => {
  let t = flat || 0;
  for (let i = 0; i < (n || 0); i++) t += d(die);
  return t;
};

// Resolves one Shock roll into concrete conditions, Insanity and damage.
export function shockResult(roll, degreesOfFailure = 0, d = defaultD) {
  const score = (Number(roll) || 0) + 10 * Math.max(0, Number(degreesOfFailure) || 0);
  const row = SHOCK_TABLE.find((r) => score <= r.max);
  return {
    score, text: row.text, snapOut: row.snapOut,
    conditions: row.conditions.map((c) => ({
      id: c.id, rounds: Array.isArray(c.rounds) ? rollDice(c.rounds, d) : c.rounds
    })),
    insanity: rollDice(row.ip, d),
    willpowerDamage: rollDice(row.wpDamage, d)
  };
}

// A Willpower Test at the start of a Turn to shake off a "snap out" result.
export const snapOutTest = ({ willpower = 0, roll, otherMod = 0 } = {}) => {
  const t = resolveTest(Number(willpower) || 0, Number(otherMod) || 0, roll);
  return { ...t, snappedOut: t.success };
};

// One Fear Test (a Willpower Test modified by the Fear rating). `roll` is
// the d100; `shockRoll` the Shock-table d100, only used on a failure.
//
// In combat a failure goes to the Shock table. Out of combat it is -10 to
// concentration Tests while near the object of fear, and 1d5 Insanity if the
// test is failed by 30 or more (p.295).
export function fearTest({
  willpower = 0, rating = 1, roll, shockRoll = 0, otherMod = 0,
  fearless = false, insanityPoints = 0, combat = true, d = defaultD
} = {}) {
  const none = { passed: true, skipped: true, insanity: 0, conditions: [], shock: null };
  if (fearless || !(Number(rating) > 0) || insanityImmune(insanityPoints, rating)) return none;
  const test = resolveTest(Number(willpower) || 0, fearModifier(rating) + (Number(otherMod) || 0), roll);
  if (test.success) return { ...test, passed: true, skipped: false, insanity: 0, conditions: [], shock: null };
  if (!combat) {
    return {
      ...test, passed: false, skipped: false, shock: null,
      conditions: [{ id: 'shaken', rounds: null }],
      insanity: test.degrees >= 3 ? d(5) : 0
    };
  }
  const shock = shockResult(shockRoll, test.degrees, d);
  return { ...test, passed: false, skipped: false, shock, insanity: shock.insanity, conditions: shock.conditions };
}

// p.299 Warp Shock: Insanity from a failed Fear Test against a warp entity
// also gives Corruption Points equal to the being's Fear rating.
export const warpShockCorruption = (rating) => Math.max(0, Math.floor(Number(rating) || 0));

/* ------------------------------ Insanity track ------------------------------
   Table 10-5. Every 10 IP gained forces a Trauma Test (Willpower, modified by
   the track); Minor/Severe/Acute Disorders arrive at 40/60/80; 100 retires
   the character. */

export const INSANITY_STEP = 10;
export const DISORDER_AT = [
  { at: 40, severity: 'Minor' }, { at: 60, severity: 'Severe' }, { at: 80, severity: 'Acute' }
];

export function insanityTrack(points) {
  const p = Math.max(0, Math.floor(Number(points) || 0));
  if (p >= 100) return { degree: 'Terminally Insane', mod: null, retired: true };
  if (p >= 80) return { degree: 'Deranged', mod: -20, retired: false };
  if (p >= 60) return { degree: 'Unhinged', mod: -10, retired: false };
  if (p >= 40) return { degree: 'Disturbed', mod: 0, retired: false };
  if (p >= 10) return { degree: 'Unsettled', mod: 10, retired: false };
  return { degree: 'Stable', mod: null, retired: false };
}

const clampPoints = (n) => Math.max(0, Math.floor(Number(n) || 0));

export function addInsanity(current, gained) {
  const before = clampPoints(current);
  const total = before + clampPoints(gained);
  const traumaTests = Math.floor(total / INSANITY_STEP) - Math.floor(before / INSANITY_STEP);
  const disorders = DISORDER_AT.filter((x) => before < x.at && total >= x.at).map((x) => x.severity);
  return { total, traumaTests, disorders, track: insanityTrack(total) };
}

// The Trauma Test itself: Willpower, modified by the track at the NEW total.
// On a failure, d100 + 10 per Degree of Failure goes to Table 10-6 (text only
// here — durations are the GM's to track).
export function traumaTest({ willpower = 0, insanityPoints = 0, roll, otherMod = 0 } = {}) {
  const track = insanityTrack(insanityPoints);
  const t = resolveTest(Number(willpower) || 0, (track.mod || 0) + (Number(otherMod) || 0), roll);
  return { ...t, track, passed: t.success };
}

export const TRAUMA_TABLE = [
  { max: 40, text: 'Withdrawn and quiet: -10 to Fellowship-based Tests for 3d10 hours.' },
  { max: 70, text: 'Compulsive action (praying, cleaning a weapon...): -10 to Intelligence, Fellowship and Perception Tests for 3d10 hours.' },
  { max: 100, text: 'Constantly fearful: +10 to Perception-based Tests, -10 Willpower for 1d5 days.' },
  { max: 120, text: 'Temporary severe phobia for 1d5 days.' },
  { max: 130, text: 'Extremely agitated: -10 to Tests unless a Willpower Test is passed; -10 in combat, for 1d5 days.' },
  { max: 140, text: 'Vivid nightmares: exhausted (a level of Fatigue) for 1d10 days, effect lasts 1d5 days.' },
  { max: 150, text: 'Struck dumb for 1d5 days.' },
  { max: 160, text: 'Distressed and unfocused: -10 to all Characteristics for 1d10 days.' },
  { max: 170, text: 'Hysterically blind or deaf for 1d10 days.' },
  { max: Infinity, text: 'Completely traumatised and virtually unresponsive for 1d10 days.' }
];
export const traumaResult = (roll, degreesOfFailure = 0) => {
  const score = (Number(roll) || 0) + 10 * Math.max(0, Number(degreesOfFailure) || 0);
  return { score, ...TRAUMA_TABLE.find((r) => score <= r.max) };
};

// Buying IP back with XP: 100 xp per point (p.298), never down a Degree.
export const INSANITY_XP_COST = 100;

/* ------------------------------ Corruption track ------------------------------
   Table 10-7 and pp.299-300. A Malignancy Test (Willpower, modified by the
   track) for every 10 CP gained; a mutation test every 30. 100 CP is Damned.

   The printed example text puts the first Malignancy Test at 31 CP, which
   contradicts the "every 10" in the body text. This follows the body text;
   MALIGNANCY_STEP is the one number to change if your table reads it the
   other way. */

export const MALIGNANCY_STEP = 10;
export const MUTATION_STEP = 30;

export function corruptionTrack(points) {
  const p = Math.max(0, Math.floor(Number(points) || 0));
  if (p >= 100) return { degree: 'Damned', mod: null, damned: true };
  if (p >= 91) return { degree: 'Profane', mod: -30, damned: false };
  if (p >= 61) return { degree: 'Debased', mod: -20, damned: false };
  if (p >= 31) return { degree: 'Soiled', mod: -10, damned: false };
  return { degree: 'Tainted', mod: 0, damned: false };
}

export function addCorruption(current, gained) {
  const before = clampPoints(current);
  const total = before + clampPoints(gained);
  return {
    total,
    malignancyTests: Math.floor(total / MALIGNANCY_STEP) - Math.floor(before / MALIGNANCY_STEP),
    mutationTests: Math.floor(total / MUTATION_STEP) - Math.floor(before / MUTATION_STEP),
    track: corruptionTrack(total)
  };
}

export function malignancyTest({ willpower = 0, corruptionPoints = 0, roll, otherMod = 0 } = {}) {
  const track = corruptionTrack(corruptionPoints);
  const t = resolveTest(Number(willpower) || 0, (track.mod || 0) + (Number(otherMod) || 0), roll);
  return { ...t, track, passed: t.success };
}

// Where a total sits against the next flagged step, for the sheet.
export const nextThreshold = (total, step) => (Math.floor(clampPoints(total) / step) + 1) * step;
