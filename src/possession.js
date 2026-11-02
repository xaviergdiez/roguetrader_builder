/* Daemonic possession, from the Imperium Maledictum Inquisition GM’s Guide
   (Possession & Exorcism), on this app’s Corruption.

   A possessed character’s Corruption says how far the daemon has got:

     1-30    the Puppet   the daemon works through a channel, encouraging
                          what it likes; resisting it is a Difficult (-10) test
     31-60   the Gateway  the victim knows, and loses time to it; Hard (-20)
     61-99   the Vessel   Very Hard (-30)
     100     the Chosen   Impossible: the daemon is in charge

   The book’s test is Discipline (Composure); here it is Willpower, which is
   what this app tests everything of the kind with. Its Success Levels are this
   app’s Degrees: a failure by 1 degree is -1 SL. Every figure here is the
   book’s, as far as the two systems line up; where they do not (the book’s
   "decimal number of Corruption", which this reads as the tens digit) it is
   said, and it is one line to change.

   Whether to put a player’s character through any of this is the GM’s call
   and, the book is firm, the player’s: ask first, foreshadow it, and let them
   burn Fate to escape. This only does the arithmetic.

   Pure: see possession.check.mjs. */

import { resolveTest } from './dice.js';

export const POSSESSION_BOOK = 'Imperium Maledictum: Inquisition GM’s Guide, Possession & Exorcism';

export const POSSESSION_STAGES = [
  { id: 'puppet', name: 'The Puppet', from: 1, to: 30, mod: -10, difficulty: 'Difficult (−10)',
    summary: 'The daemon is still in the warp and reaches the victim through a channel. The victim is usually unaware.' },
  { id: 'gateway', name: 'The Gateway', from: 31, to: 60, mod: -20, difficulty: 'Hard (−20)',
    summary: 'The victim knows. The daemon takes full control in violent or chaotic blackouts.' },
  { id: 'vessel', name: 'The Vessel', from: 61, to: 99, mod: -30, difficulty: 'Very Hard (−30)',
    summary: 'The daemon is deep in the host and acts through them.' },
  { id: 'chosen', name: 'The Chosen', from: 100, to: 100, mod: null, difficulty: 'Impossible',
    summary: 'The daemon is in charge and the character is its.' }
];

// The stage a possessed character’s Corruption puts them in; null for none.
export function stageFor(corruption) {
  const c = Math.max(0, Math.floor(Number(corruption) || 0));
  if (c < 1) return null;
  return POSSESSION_STAGES.find((s) => c >= s.from && c <= s.to) || POSSESSION_STAGES[POSSESSION_STAGES.length - 1];
}

// Taking hold costs 2d10 Corruption at once, which can bring Malignancies.
export const TAKING_HOLD = { dice: 2, die: 10 };
export const takingHold = (d10a, d10b) => (Number(d10a) || 0) + (Number(d10b) || 0);

// Puppet: the daemon adds to a skill it favours, and the victim pays for it.
export const PUPPET_BONUS = 20;          // the book’s +2 SL
export const PUPPET_CORRUPTION = 2;

/* The Puppet\u2019s daemon adds +20 to a skill test it favours and the victim pays
   2 Corruption for it. The victim may resist with a plain Willpower test (no
   modifier), and every degree of success takes 1 Corruption off the price. */
export function puppetPush({ willpower = 0, roll } = {}) {
  const t = resolveTest(Number(willpower) || 0, 0, roll);
  const gained = t.success ? Math.max(0, PUPPET_CORRUPTION - t.degrees) : PUPPET_CORRUPTION;
  return { roll: t.roll, target: t.target, resisted: t.success, degrees: t.degrees, bonus: PUPPET_BONUS, corruptionGained: gained };
}

/* The daemon tries to take the wheel: at a moment of strong feeling, or when
   Corruption is about to be gained, or when the GM says so. The character
   resists with Willpower at the stage’s difficulty. Failing, the daemon has
   control for 1d5 rounds and one more for every degree of failure, and the
   character takes one Corruption for every degree of failure. `d5` is the die.

   The Chosen cannot resist at all. */
export function assertControl({ willpower = 0, corruption = 0, roll, d5 = 3, otherMod = 0 } = {}) {
  const stage = stageFor(corruption);
  if (!stage) return null;
  if (stage.mod === null) {
    return { stage, auto: true, resisted: false, roll: null, target: null, degrees: 0, rounds: null, corruptionGained: 0 };
  }
  const t = resolveTest(Number(willpower) || 0, stage.mod + (Number(otherMod) || 0), roll);
  if (t.success) {
    return { stage, auto: false, resisted: true, roll: t.roll, target: t.target, degrees: t.degrees, rounds: 0, corruptionGained: 0 };
  }
  return {
    stage, auto: false, resisted: false, roll: t.roll, target: t.target, degrees: t.degrees,
    rounds: Math.max(1, Number(d5) || 1) + t.degrees, corruptionGained: t.degrees
  };
}

/* Drawing on the daemon in a fight or a test. The same test, and what the
   character may take if it goes their way: */
export const BOONS = [
  { id: 'skill', name: 'A bonus to a skill test the daemon’s kind favours', text: '+20 to one test that matches the daemon (Tzeentch: Awareness or Lore; Slaanesh: Rapport or Reflexes; Nurgle: Fortitude or Medicae; Khorne: Athletics).' },
  { id: 'talent', name: 'A talent of the daemon’s', text: 'Use a talent the daemon is associated with, or the GM picks, for a number of hours.' },
  { id: 'vitality', name: 'A surge of vitality', text: 'Recover Wounds.' }
];
export const boonById = (id) => BOONS.find((b) => b.id === id) || null;
// "The decimal number of their current Corruption": read as the tens digit.
export const tensOf = (corruption) => Math.floor(Math.max(0, Number(corruption) || 0) / 10);

export function unleash({ willpower = 0, corruption = 0, roll, d5 = 3, boon = 'skill' } = {}) {
  const stage = stageFor(corruption);
  if (!stage) return null;
  const wilB = Math.floor((Number(willpower) || 0) / 10);
  const amount = boon === 'vitality' ? wilB + tensOf(corruption) : boon === 'talent' ? wilB + tensOf(corruption) : PUPPET_BONUS;
  const unit = boon === 'vitality' ? 'Wounds' : boon === 'talent' ? 'hours' : 'to the test';
  if (stage.mod === null) {
    return { stage, boon, amount, unit, success: false, auto: true, roll: null, target: null, degrees: 0, corruptionGained: 0, takeover: { rounds: null, corruptionGained: 0 } };
  }
  const t = resolveTest(Number(willpower) || 0, stage.mod, roll);
  if (t.success) {
    // The daemon is paid for it: 1d5 Corruption, which the caller rolls.
    return { stage, boon, amount, unit, success: true, auto: false, roll: t.roll, target: t.target, degrees: t.degrees, corruptionDie: 5, corruptionGained: null, takeover: null };
  }
  // A failure still gives the boon, for a single action, and then the daemon
  // takes control as if the character had failed to resist.
  return {
    stage, boon, amount, unit, success: false, auto: false, roll: t.roll, target: t.target, degrees: t.degrees, corruptionGained: 0,
    takeover: { rounds: Math.max(1, Number(d5) || 1) + t.degrees, corruptionGained: t.degrees }
  };
}

export const describeStage = (corruption) => {
  const s = stageFor(corruption);
  return s ? `${s.name}, resisted at ${s.difficulty}` : 'not possessed';
};
