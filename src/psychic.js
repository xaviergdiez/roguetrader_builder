// Psy Rating, manifestation, the psychic disciplines, and the two warp tables.
//
// Source of truth: the Rogue Trader psychic mechanics supplied for this
// project. Two rules here contradict an earlier, shorter summary and the fuller
// text wins — both are called out at MODES, because getting either backwards
// changes play:
//   * Fettered DOES require a Focus Power Test. It carries zero risk, which is
//     not the same as needing no roll.
//   * Unfettered triggers Phenomena on DOUBLES, not on a natural 9.
//
// Pure: see psychic.check.mjs.

import { roll1d100, resolveTest } from './dice.js';

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/* ------------------------------ manifestation ------------------------------ */

export const MODES = [
  {
    id: 'fettered',
    label: 'Fettered',
    ratingNote: 'Half base Psy Rating, rounded up.',
    note: 'Focus Power Test required. Cannot trigger Psychic Phenomena or Perils at all.',
    testRequired: true,
    trigger: 'never'
  },
  {
    id: 'unfettered',
    label: 'Unfettered',
    ratingNote: 'Full base Psy Rating.',
    note: 'Focus Power Test with full Willpower and Psy Rating. Doubles on the d100 trigger Table 6-2.',
    testRequired: true,
    trigger: 'doubles'
  },
  {
    id: 'push',
    label: 'Push',
    ratingNote: 'Base Psy Rating +1 to +3.',
    note: 'Extra power for severe instability: Table 6-2 is rolled automatically, at +10 per point pushed.',
    testRequired: true,
    trigger: 'always'
  }
];

export const MAX_PUSH = 3;
export const modeInfo = (id) => MODES.find((m) => m.id === id) || null;

// The rating actually channelled — sets range, area, duration and damage.
export function effectivePsyRating(psyRating, mode, push = 0) {
  const base = Math.max(0, Math.floor(psyRating || 0));
  if (mode === 'fettered') return Math.ceil(base / 2);
  if (mode === 'push') return base + clamp(Math.floor(push || 0), 1, MAX_PUSH);
  return base;
}

// Table 6-2 is rolled at +10 per point pushed.
export function phenomenaModifier(mode, push = 0) {
  return mode === 'push' ? 10 * clamp(Math.floor(push || 0), 1, MAX_PUSH) : 0;
}

// Doubles on a d100. A roll of 100 reads as "00" on the dice, so both digits
// match and it counts; 1-9 read as "01".."09" and do not.
export function isDoubles(roll) {
  const n = Math.floor(roll || 0);
  if (n < 1 || n > 100) return false;
  const two = n === 100 ? 0 : n;
  return Math.floor(two / 10) === two % 10;
}

// Did this manifestation actually trigger Psychic Phenomena?
export function phenomenaTriggered(mode, roll) {
  const info = modeInfo(mode);
  if (!info || info.trigger === 'never') return false;
  if (info.trigger === 'always') return true;
  return isDoubles(roll);
}

// Whether the mode can trigger anything at all, before dice are thrown.
export const risksPhenomena = (mode) => {
  const info = modeInfo(mode);
  return !!info && info.trigger !== 'never';
};

// Sustaining costs -10 to ALL tests for each power held beyond the first.
export function sustainPenalty(sustained) {
  const n = Math.max(0, Math.floor(sustained || 0));
  return n <= 1 ? 0 : -10 * (n - 1);
}

/* -------------------------------- psy rating -------------------------------- */

export const PSY_RATINGS = [
  { rating: 1, xp: 200, effect: 'Access to Minor Powers and Basic Techniques.' },
  { rating: 2, xp: 200, effect: '+1 Focus Power bonus die; increased range.' },
  { rating: 3, xp: 300, effect: 'Unlocks access to a second Psychic Discipline.' },
  { rating: 4, xp: 300, effect: 'Increased damage and range multipliers.' },
  { rating: 5, xp: 500, effect: 'Master-level techniques unlocked.' },
  { rating: 6, xp: 500, effect: 'High-level warp manipulation.', andAbove: true }
];

export const psyRatingInfo = (r) => PSY_RATINGS.find((p) => p.rating === r) || null;

export function psyRatingCost(rating) {
  let total = 0;
  for (const p of PSY_RATINGS) {
    if (p.rating > rating) break;
    total += p.xp;
  }
  return total;
}

/* ------------------------------- disciplines -------------------------------
   The Psychic Discipline talent grants that discipline's Basic Technique
   automatically, at no further cost.                                        */

export const DISCIPLINES = [
  {
    id: 'telepathy', name: 'Telepathy',
    focus: 'Mental communication, coercion and psychic assault.',
    basic: 'Thought Sending',
    basicEffect: 'Silent mental broadcast to targets within 1 km per Psy Rating.',
    techniques: ['Mind Link', 'Mind Probe', 'Psychic Scream', 'Compel', 'Telepathic Jamming']
  },
  {
    id: 'divination', name: 'Divination',
    focus: 'Sensing warp currents, reading auras and foreseeing events.',
    basic: 'Aura Reading',
    basicEffect: "Reveals a target's health, emotional state or corruption level.",
    techniques: ['Prescience', 'Invocations of the Warp', 'Scrying', 'Psychic Sight']
  },
  {
    id: 'pyromancy', name: 'Pyromancy',
    focus: 'Generating and directing extreme heat, fire and plasma-like energy.',
    basic: 'Holocaust / Incinerate',
    basicEffect: 'Channels warp flame at a single target or an area.',
    techniques: ['Spontaneous Combustion', 'Fire Shield', 'Wall of Fire']
  },
  {
    id: 'biomancy', name: 'Biomancy',
    focus: "Biological manipulation of the psyker's own body, or an ally's or foe's.",
    basic: 'Invigorate',
    basicEffect: 'Heals wounds, or removes fatigue and status ailments.',
    techniques: ['Iron Arm', 'Warp Speed', 'Regeneration', 'Enfeeble']
  },
  {
    id: 'telekinesis', name: 'Telekinesis',
    focus: 'Translating mental strength into physical kinetic force.',
    basic: 'Telekinetic Force',
    basicEffect: 'Moves objects, or exerts force at range.',
    techniques: ['Psychic Crush', 'Force Bolt', 'Deflect Missiles']
  }
];

export const disciplineByName = (name) =>
  DISCIPLINES.find((d) => d.name.toLowerCase() === String(name || '').trim().toLowerCase()) || null;

export const thoughtSendingKm = (psyRating) => Math.max(0, Math.floor(psyRating || 0));
export const disciplineSlots = (psyRating) => (Math.floor(psyRating || 0) >= 3 ? 2 : 1);
export const ALL_TECHNIQUES = DISCIPLINES.flatMap((d) => [d.basic, ...d.techniques]);

export function describePower(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  for (const d of DISCIPLINES) {
    if (d.basic.toLowerCase() === n.toLowerCase()) {
      return `${d.basic}: ${d.basicEffect} The Basic Technique of ${d.name}, granted free with the discipline.`;
    }
  }
  for (const d of DISCIPLINES) {
    const hit = d.techniques.find((t) => t.toLowerCase() === n.toLowerCase());
    if (hit) return `${hit}: A ${d.name} technique. ${d.focus}`;
  }
  return n;
}

/* ----------------------- Table 6-2: Psychic Phenomena -----------------------
   A result of 75 or more sends you straight to Table 6-3.                   */

export const PERILS_THRESHOLD = 75;

export const PHENOMENA = [
  [1, 3, 'Dark Foreboding', 'A chilling breeze blows; all nearby feel a tragic cosmic event occur.'],
  [4, 5, 'Warp Echo', 'All local sounds cause distinct, eerie echoes for 1d5 rounds.'],
  [6, 8, 'Unholy Stench', 'A sickening smell of ozone and sulfur permeates a 3d10 m radius.'],
  [9, 11, 'Mind Warp', 'The psyker suffers -5 to Willpower tests for 1 round from the internal noise.'],
  [12, 14, 'Clockwise Flicker', 'Clocks and timepieces within 5d10 m run backward for several seconds.'],
  [15, 17, 'Memory Worm', 'Everyone in line of sight instantly forgets a trivial memory.'],
  [18, 20, 'Static Discharge', 'Harmless static sparks pop from hair, metal and clothing within 2d10 m.'],
  [21, 23, 'Spoilage', 'Food, water and organic rations spoil instantly within 5d10 m.'],
  [24, 26, 'Haunting Breeze', 'Gale-force winds whip around the psyker, extinguishing open flames within 3d10 m.'],
  [27, 29, 'Breath Leech', 'Everyone within 3d10 m loses breath and cannot Run or Charge for 1 round.'],
  [30, 32, 'Shadow Flit', 'Shadows detach from physical objects and dance wildly for 1d5 rounds.'],
  [33, 35, 'Technopathy', 'Unwarded screens and hololiths within 3d10 m flash static and gibberish code.'],
  [36, 38, 'Daemonic Mask', 'The psyker takes on a demonic visage, gaining Fear (1) until their next turn.'],
  [39, 41, 'Chill Spot', 'Temperature plummets to freezing within 4d10 m; frost coats every surface.'],
  [42, 44, 'Spectral Gale', 'Howling winds knock down the psyker and everyone within 4d10 m unless they pass an Easy (+30) Agility or Strength test.'],
  [45, 47, 'Bloody Tears', 'Blood weeps from wood, metal and stone within a 3d10 m radius.'],
  [48, 50, 'Gravity Flit', 'Gravity briefly cuts out; objects float, then crash down.'],
  [51, 53, 'Warp Ghosts', 'Phantasms howl through a 3d10 m radius, forcing a Fear (1) test on everyone but the psyker.'],
  [54, 56, 'Whispering Shadows', 'Low daemon whispers emanate from the shadows: -10 to Perception tests for 1 round.'],
  [57, 59, 'Falling Upwards', 'Everything within 2d10 m rises 1d10 m, then drops, taking normal falling damage.'],
  [60, 62, 'Impact Wave', 'The psyker is slammed down for 1d5 Impact damage ignoring AP, and tests Fear (2).'],
  [63, 65, 'Psychic Tremor', 'The ground shakes within 5d10 m; all must pass an Ordinary (+10) Agility test or fall Prone.'],
  [66, 68, 'Shadow of the Warp', 'A vision of the Warp flashes across reality; all within 1d100 m catch a terrifying glimpse.'],
  [69, 71, 'Circuit Breaker', 'Technology within 5d10 m malfunctions; ranged weapons jam and cybernetics take 1d5 damage unless a Routine (+10) Toughness test is passed.'],
  [72, 74, 'Warp Madness', 'All creatures within 2d10 m are Frenzied for 1 round and take 1d5 Corruption unless they pass a Difficult (-10) Willpower test.'],
  [75, 999, 'PERILS OF THE WARP', 'Reality snaps open. Roll immediately on Table 6-3: Perils of the Warp.']
];

/* ------------------------ Table 6-3: Perils of the Warp ------------------------ */

export const PERILS = [
  [1, 5, 'The Gibbering', 'The psyker screams in pain: pass a Challenging (+0) Willpower test or be Stunned for 1d5 rounds.'],
  [6, 9, 'Warp Burn', 'A blast of violent energy: 1d5 Wounds (or 2d5 Energy) ignoring AP and Toughness Bonus, and Stunned 1d5 rounds.'],
  [10, 14, 'Psychic Concussion', 'The psyker is knocked Unconscious for 1d5 rounds; everyone within 3d10 m must pass an Ordinary (+10) Willpower test or be Stunned 1 round.'],
  [15, 19, 'Psy Blast', 'An explosion throws the psyker 3d10 metres into the air, taking falling damage on landing.'],
  [20, 24, 'Soul Sear', 'The soul is scorched: no psychic powers for 1 hour, and 2d5 Corruption.'],
  [25, 29, 'Locked In', 'Caged in a warp prison, the psyker falls Prone and Unconscious, spending a Full Action each turn on a Difficult (-10) Willpower test to break free.'],
  [30, 38, 'Chronological Incontinence', 'The psyker vanishes for 1d10 rounds and reappears in the same spot, suffering 1d5 Insanity and 1d5 permanent Toughness damage.'],
  [39, 46, 'Psychic Mirror', 'The power reflects back; beneficial powers instead deal 1d10+5 Energy damage to the Body, ignoring AP.'],
  [47, 55, 'Warp Whispers', 'Daemonic voices fill 4d10 m: everyone must pass a Hard (-20) Willpower test or take 1d10 Corruption. The psyker loses 1d5+5 Willpower.'],
  [56, 58, 'Vice Versa', 'The psyker swaps minds with a random living non-daemon within 50 m for 1d10 rounds. Both take 1d5 Insanity.'],
  [59, 67, 'Dark Summoning', 'A warp predator tears into reality within 3d10 m for 1d10 rounds, and attacks only the psyker.'],
  [68, 72, 'Rending the Veil', 'Reality rips open: all sentient creatures within 1d100 m must pass a Fear (3) Warp Shock test for 1d5 rounds.'],
  [73, 78, 'Blood Rain', 'A psychic storm covers 5d10 m: a Strength test or be knocked Prone, and any power cast in the area automatically causes a Perils check for 1d5 rounds.'],
  [79, 86, 'Cataclysmic Blast', 'Power arcs outward: everyone within 1d10 m takes 2d10 + Psy Rating Energy damage, ignoring armour.'],
  [87, 90, 'Reality Quake', 'Reality buckles within 3d10 m; solid objects burn, rot or freeze, and everyone takes 2d10 Rending damage.'],
  [91, 99, 'Lost to the Warp', 'Pass a Very Hard (-30) Willpower test or be dragged into the Warp, reappearing 1d10 weeks later with 4d10 Corruption and a permanent +10 Perils penalty.'],
  [100, 100, 'Destruction / Annihilation', 'The psyker is instantly annihilated. There is a 50% chance a daemon manifests in their place.']
];

const lookup = (table, roll) => {
  const n = Math.floor(roll || 0);
  const row = table.find(([lo, hi]) => n >= lo && n <= hi);
  return row ? { min: row[0], max: row[1], name: row[2], effect: row[3] } : null;
};

export const phenomenaResult = (roll) => lookup(PHENOMENA, roll);
export const perilsResult = (roll) => lookup(PERILS, roll);

// A phenomena roll of 75+ (after the push modifier) escalates to Perils.
export const escalatesToPerils = (roll) => Math.floor(roll || 0) >= PERILS_THRESHOLD;

/* ------------------------------ manifestation ------------------------------
   One complete attempt, resolved end to end: the Focus Power test, then any
   Psychic Phenomena it provoked, then Perils if that escalated.

   Note the phenomena trigger does NOT depend on passing the test — Unfettered
   triggers on doubles and Push triggers always, whether the power manifested
   or not. rng is injectable so the whole sequence is testable.              */

export function manifest({
  psyRating, mode, push = 0, willpower, modifier = 0, sustained = 0, rng = Math.random
}) {
  const effective = effectivePsyRating(psyRating, mode, push);
  const sustain = sustainPenalty(sustained);
  const totalMod = (modifier || 0) + sustain;

  // Every mode requires the test, Fettered included.
  const focusRoll = roll1d100(rng);
  const focus = resolveTest(willpower || 0, totalMod, focusRoll);

  let phenomena = null;
  let perils = null;

  if (phenomenaTriggered(mode, focusRoll)) {
    const pushMod = phenomenaModifier(mode, push);
    const raw = roll1d100(rng);
    const total = raw + pushMod;
    phenomena = {
      roll: raw,
      modifier: pushMod,
      total,
      result: phenomenaResult(total),
      escalated: escalatesToPerils(total)
    };
    if (phenomena.escalated) {
      const pRoll = roll1d100(rng);
      perils = { roll: pRoll, result: perilsResult(pRoll) };
    }
  }

  return {
    mode,
    push: mode === 'push' ? clamp(Math.floor(push || 0), 1, MAX_PUSH) : 0,
    effective,
    sustainPenalty: sustain,
    modifier: totalMod,
    target: focus.target,
    focus,
    phenomena,
    perils
  };
}
