// Self-check for the psychic mechanics. Run: node src/psychic.check.mjs
import assert from 'node:assert/strict';
import {
  effectivePsyRating, phenomenaModifier, risksPhenomena, phenomenaTriggered,
  isDoubles, sustainPenalty, psyRatingCost, psyRatingInfo, disciplineByName,
  thoughtSendingKm, disciplineSlots, describePower,
  phenomenaResult, perilsResult, escalatesToPerils,
  DISCIPLINES, MODES, PSY_RATINGS, PHENOMENA, PERILS, ALL_TECHNIQUES,
  MAX_PUSH, PERILS_THRESHOLD, modeInfo
} from './psychic.js';

/* --- the two rules an earlier summary had backwards --------------------- */

// EVERY mode requires a Focus Power Test. Fettered carries no risk, which is
// not the same as needing no roll — treating it as "no test" was the bug.
for (const m of MODES) {
  assert.equal(m.testRequired, true, m.label + ' must require a Focus Power Test');
}

// Unfettered triggers on DOUBLES, not on a natural 9.
assert.equal(phenomenaTriggered('unfettered', 9), false, 'a natural 9 is not a trigger');
assert.equal(phenomenaTriggered('unfettered', 11), true);
assert.equal(phenomenaTriggered('unfettered', 55), true);
assert.equal(phenomenaTriggered('unfettered', 99), true);
assert.equal(phenomenaTriggered('unfettered', 54), false);

/* --- doubles ------------------------------------------------------------ */

assert.deepEqual(
  Array.from({ length: 100 }, (_, i) => i + 1).filter(isDoubles),
  [11, 22, 33, 44, 55, 66, 77, 88, 99, 100],
  '100 reads as 00 on the dice, so it is doubles; 1-9 read as 01-09 and are not'
);
assert.equal(isDoubles(0), false);
assert.equal(isDoubles(101), false);

/* --- manifestation ----------------------------------------------------- */

// Fettered halves and rounds UP
assert.equal(effectivePsyRating(4, 'fettered'), 2);
assert.equal(effectivePsyRating(3, 'fettered'), 2, '3 halved and rounded up is 2');
assert.equal(effectivePsyRating(1, 'fettered'), 1);
assert.equal(effectivePsyRating(3, 'unfettered'), 3);
assert.equal(effectivePsyRating(3, 'push', 1), 4);
assert.equal(effectivePsyRating(3, 'push', 9), 3 + MAX_PUSH, 'push clamps');
assert.equal(effectivePsyRating(3, 'push', 0), 4, 'a push is at least 1');

// Fettered can never trigger anything; Push always does
assert.equal(risksPhenomena('fettered'), false);
assert.equal(phenomenaTriggered('fettered', 11), false, 'not even on doubles');
assert.equal(phenomenaTriggered('fettered', 100), false);
assert.equal(phenomenaTriggered('push', 1), true, 'Push is automatic regardless of the roll');
assert.equal(phenomenaTriggered('push', 54), true);

// +10 per point pushed
assert.equal(phenomenaModifier('fettered'), 0);
assert.equal(phenomenaModifier('unfettered'), 0);
assert.equal(phenomenaModifier('push', 1), 10);
assert.equal(phenomenaModifier('push', 3), 30);
assert.equal(phenomenaModifier('push', 99), 30);

/* --- sustaining -------------------------------------------------------- */

// no penalty for the first power; -10 for each one beyond it
assert.equal(sustainPenalty(0), 0);
assert.equal(sustainPenalty(1), 0, 'the first sustained power is free');
assert.equal(sustainPenalty(2), -10);
assert.equal(sustainPenalty(4), -30);

/* --- psy rating -------------------------------------------------------- */

assert.equal(psyRatingCost(1), 200);
assert.equal(psyRatingCost(3), 700);
assert.equal(psyRatingCost(5), 1500);   // 200+200+300+300+500
assert.equal(disciplineSlots(2), 1);
assert.equal(disciplineSlots(3), 2);
assert.match(psyRatingInfo(3).effect, /second Psychic Discipline/);
assert.equal(thoughtSendingKm(3), 3);
assert.deepEqual(PSY_RATINGS.map((p) => p.rating), [1, 2, 3, 4, 5, 6]);

/* --- disciplines and powers -------------------------------------------- */

assert.equal(DISCIPLINES.length, 5);
assert.deepEqual(DISCIPLINES.map((d) => d.name),
  ['Telepathy', 'Divination', 'Pyromancy', 'Biomancy', 'Telekinesis']);
assert.equal(disciplineByName('  biomancy ').id, 'biomancy');
assert.equal(disciplineByName('Nonesuch'), null);
for (const t of ALL_TECHNIQUES) {
  assert.ok(describePower(t).startsWith(t + ':'), t + ' is not described');
}
assert.equal(describePower('Warp Whispers of the Unbound'), 'Warp Whispers of the Unbound');
assert.equal(describePower(''), '');

/* --- the warp tables --------------------------------------------------- */

// both tables must cover 1..100 with no gap and no overlap
for (const [label, table, cap] of [['Phenomena', PHENOMENA, 999], ['Perils', PERILS, 100]]) {
  let expect = 1;
  for (const [lo, hi] of table) {
    assert.equal(lo, expect, label + ': gap or overlap at ' + lo);
    expect = hi + 1;
  }
  assert.equal(expect, cap + 1, label + ': table does not reach its end');
}

// named results land where the rules put them
assert.equal(phenomenaResult(1).name, 'Dark Foreboding');
assert.equal(phenomenaResult(37).name, 'Daemonic Mask');
assert.equal(phenomenaResult(74).name, 'Warp Madness');
assert.equal(phenomenaResult(75).name, 'PERILS OF THE WARP');
assert.equal(phenomenaResult(120).name, 'PERILS OF THE WARP',
  'a pushed roll can exceed 100 and must still resolve');
assert.equal(perilsResult(100).name, 'Destruction / Annihilation');
assert.equal(perilsResult(91).name, 'Lost to the Warp');

// escalation threshold
assert.equal(PERILS_THRESHOLD, 75);
assert.equal(escalatesToPerils(74), false);
assert.equal(escalatesToPerils(75), true);
// a max push turns a mid roll into Perils, which is the point of the modifier
assert.equal(escalatesToPerils(50 + phenomenaModifier('push', 3)), true);

assert.equal(modeInfo('unfettered').trigger, 'doubles');
assert.equal(modeInfo('nonesuch'), null);

/* --- a full manifestation, end to end --------------------------------- */

const { manifest } = await import('./psychic.js');
// a scripted rng: each call returns the next value, so a whole sequence of
// d100 rolls can be dictated
const scripted = (...rolls) => {
  let i = 0;
  return () => (rolls[i++] - 1) / 100 + 0.0001;   // inverse of 1 + floor(r*100)
};

// Fettered: the test happens, but nothing can follow it
let m = manifest({ psyRating: 4, mode: 'fettered', willpower: 40, rng: scripted(11) });
assert.equal(m.effective, 2, 'half of 4');
assert.equal(m.focus.roll, 11);
assert.equal(m.focus.success, true);
assert.equal(m.phenomena, null, 'doubles cannot trigger anything when Fettered');
assert.equal(m.perils, null);

// Unfettered on a non-double: test resolves, no phenomena
m = manifest({ psyRating: 3, mode: 'unfettered', willpower: 40, rng: scripted(34) });
assert.equal(m.effective, 3);
assert.equal(m.phenomena, null);

// Unfettered on doubles: phenomena rolled with no modifier
m = manifest({ psyRating: 3, mode: 'unfettered', willpower: 40, rng: scripted(33, 37) });
assert.equal(m.focus.roll, 33);
assert.ok(m.phenomena, 'doubles must trigger');
assert.equal(m.phenomena.modifier, 0);
assert.equal(m.phenomena.total, 37);
assert.equal(m.phenomena.result.name, 'Daemonic Mask');
assert.equal(m.phenomena.escalated, false);
assert.equal(m.perils, null);

// a failed test still triggers phenomena on doubles — the trigger is the dice,
// not the outcome
m = manifest({ psyRating: 3, mode: 'unfettered', willpower: 20, rng: scripted(88, 10) });
assert.equal(m.focus.success, false);
assert.ok(m.phenomena, 'phenomena do not care whether the power manifested');

// Push: automatic phenomena, +10 per point, and escalation into Perils
m = manifest({ psyRating: 3, mode: 'push', push: 3, willpower: 40, rng: scripted(50, 50, 95) });
assert.equal(m.effective, 6, '3 + 3 pushed');
assert.equal(m.push, 3);
assert.ok(m.phenomena, 'Push always triggers');
assert.equal(m.phenomena.modifier, 30);
assert.equal(m.phenomena.total, 80, '50 + 30');
assert.equal(m.phenomena.escalated, true, '80 is past the threshold of 75');
assert.ok(m.perils, 'escalation must roll Perils');
assert.equal(m.perils.roll, 95);
assert.equal(m.perils.result.name, 'Lost to the Warp');

// sustaining several powers drags the target down
m = manifest({ psyRating: 2, mode: 'unfettered', willpower: 40, sustained: 3, rng: scripted(34) });
assert.equal(m.sustainPenalty, -20, 'two powers beyond the first');
assert.equal(m.target, 20, '40 - 20');

// an explicit modifier and the sustain penalty both apply
m = manifest({ psyRating: 2, mode: 'unfettered', willpower: 40, modifier: -10, sustained: 2, rng: scripted(34) });
assert.equal(m.modifier, -20);
assert.equal(m.target, 20);

console.log('psychic: all checks passed (%d disciplines, %d techniques, %d phenomena, %d perils)',
  DISCIPLINES.length, ALL_TECHNIQUES.length, PHENOMENA.length, PERILS.length);
