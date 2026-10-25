import assert from 'node:assert/strict';
import {
  parseFear, isFearless, fearModifier, insanityImmune, shockResult, fearTest, snapOutTest, warpShockCorruption,
  insanityTrack, addInsanity, traumaTest, traumaResult, corruptionTrack, addCorruption, malignancyTest, nextThreshold
} from './sanity.js';
import { breakTest, oracle, fourTraits, defaultOrder, orderById, bestiaryToNpc } from './npcgen.js';

assert.equal(parseFear('Claws. Fear (3). Size (Enormous).'), 3);
assert.equal(parseFear('Claws.'), 0);
assert.equal(isFearless('Frenzy. Fearless. Die Hard.'), true);

// Table 10-3
assert.equal(fearModifier(1), 0);
assert.equal(fearModifier(2), -10);
assert.equal(fearModifier(3), -20);
assert.equal(fearModifier(4), -30);
// p.297: IP tens digit >= 2x Fear rating means no test
assert.equal(insanityImmune(20, 1), true);
assert.equal(insanityImmune(19, 1), false);
assert.equal(insanityImmune(40, 2), true);
assert.equal(insanityImmune(40, 3), false);
assert.equal(fearTest({ willpower: 5, rating: 1, roll: 99, insanityPoints: 25 }).skipped, true);

// Table 10-4 bands, with 10 per Degree of Failure
const fixed = () => 3;                   // every die rolls a 3
assert.equal(shockResult(10, 0, fixed).conditions[0].id, 'startled');
assert.equal(shockResult(20, 0, fixed).conditions[0].id, 'startled');
assert.equal(shockResult(21, 0, fixed).conditions[0].id, 'shaken');
assert.equal(shockResult(10, 5, fixed).score, 60);
assert.equal(shockResult(10, 5, fixed).conditions[0].id, 'backing_away');
assert.equal(shockResult(10, 5, fixed).insanity, 1);
assert.equal(shockResult(70, 0, fixed).conditions[0].id, 'frozen');
assert.equal(shockResult(70, 0, fixed).insanity, 3, '1d5 IP');
assert.equal(shockResult(85, 0, fixed).conditions[0].id, 'fleeing');
assert.equal(shockResult(85, 0, fixed).snapOut, true);
assert.deepEqual(shockResult(110, 0, fixed).conditions.map((c) => [c.id, c.rounds]), [['unconscious', 3], ['shaken', null]]);
assert.equal(shockResult(150, 0, fixed).insanity, 4, '1d5+1 IP');
assert.equal(shockResult(165, 0, fixed).conditions[0].id, 'catatonic');
assert.equal(shockResult(165, 0, fixed).insanity, 3, '1d10 IP');
const worst = shockResult(171, 0, fixed);
assert.equal(worst.insanity, 6, '2d10 IP');
assert.equal(worst.willpowerDamage, 3, '1d10 permanent Willpower damage');
assert.equal(worst.conditions[0].rounds, 6, '2d10 Rounds');

assert.equal(fearTest({ willpower: 40, rating: 2, roll: 30 }).passed, true, '30 vs 40-10');
const failed = fearTest({ willpower: 40, rating: 3, roll: 60, shockRoll: 50, d: fixed });
assert.equal(failed.passed, false);
assert.equal(failed.degrees, 4);
assert.equal(failed.shock.score, 90, 'Degrees of Failure add 10 each to the shock roll');
assert.equal(failed.conditions[0].id, 'fleeing');
assert.equal(failed.insanity, 3);
assert.equal(fearTest({ willpower: 5, rating: 4, roll: 99, fearless: true }).passed, true);
assert.equal(fearTest({ willpower: 5, rating: 0, roll: 99 }).skipped, true);
// non-combat (p.295): -10 and IP only if failed by 30+
const calm = fearTest({ willpower: 40, rating: 1, roll: 60, combat: false, d: fixed });
assert.equal(calm.degrees, 2);
assert.equal(calm.insanity, 0);
assert.equal(calm.shock, null);
assert.equal(fearTest({ willpower: 40, rating: 1, roll: 75, combat: false, d: fixed }).insanity, 3, 'failed by 35');
assert.equal(warpShockCorruption(2), 2, 'Frightening (2) = 2 CP');

// Insanity track (Table 10-5, pp.296-297)
assert.equal(insanityTrack(9).degree, 'Stable');
assert.equal(insanityTrack(10).mod, 10);
assert.equal(insanityTrack(39).mod, 10);
assert.equal(insanityTrack(40).degree, 'Disturbed');
assert.equal(insanityTrack(60).mod, -10);
assert.equal(insanityTrack(80).mod, -20);
assert.equal(insanityTrack(100).retired, true);
assert.deepEqual(addInsanity(8, 3).traumaTests, 1, 'crossing 10 forces a Trauma Test');
assert.equal(addInsanity(1, 2).traumaTests, 0);
assert.equal(addInsanity(8, 25).traumaTests, 3, 'a jump of 25 crosses 10, 20 and 30');
assert.deepEqual(addInsanity(35, 10).disorders, ['Minor'], 'a Minor Disorder at 40');
assert.deepEqual(addInsanity(35, 30).disorders, ['Minor', 'Severe'], '40 and 60');
assert.deepEqual(addInsanity(79, 1).disorders, ['Acute']);
assert.equal(traumaTest({ willpower: 40, insanityPoints: 10, roll: 50 }).passed, true, '40+10');
assert.equal(traumaTest({ willpower: 40, insanityPoints: 60, roll: 31 }).passed, false, '40-10');
assert.match(traumaResult(10, 0).text, /Withdrawn/);
assert.match(traumaResult(10, 6).text, /Compulsive/);

// Corruption track (Table 10-7, pp.298-300)
assert.equal(corruptionTrack(30).degree, 'Tainted');
assert.equal(corruptionTrack(31).mod, -10);
assert.equal(corruptionTrack(61).mod, -20);
assert.equal(corruptionTrack(91).mod, -30);
assert.equal(corruptionTrack(100).damned, true);
assert.equal(addCorruption(8, 3).malignancyTests, 1, 'a test per 10 CP');
assert.equal(addCorruption(28, 5).mutationTests, 1, 'a mutation test per 30 CP');
assert.equal(addCorruption(28, 5).malignancyTests, 1);
assert.equal(malignancyTest({ willpower: 50, corruptionPoints: 45, roll: 40 }).passed, true, '40 vs 50-10');
assert.equal(malignancyTest({ willpower: 50, corruptionPoints: 45, roll: 41 }).passed, false);
assert.equal(nextThreshold(33, 30), 60);

// snapping out of it (p.295): a plain Willpower test
assert.equal(snapOutTest({ willpower: 40, roll: 40 }).snappedOut, true);
assert.equal(snapOutTest({ willpower: 40, roll: 41 }).snappedOut, false);

// break tests
const grunt = { combatRole: 'gunline', willpower: 40 };
const held = breakTest({ npc: grunt, trigger: 'pinned', roll: 30 });
assert.equal(held.holds, true);
const broke = breakTest({ npc: grunt, trigger: 'wounded', roll: 60 });
assert.equal(broke.holds, false);
assert.match(broke.fallback, /HoldAndShoot/);
assert.equal(breakTest({ npc: grunt, trigger: 'pinned', roll: 36, strikes: 1 }).holds, false, 'strikes pile on');
assert.equal(breakTest({ npc: { combatRole: 'fanatic' }, trigger: 'pinned', roll: 99 }).holds, true);
assert.equal(breakTest({ npc: grunt, trigger: 'bored', roll: 1 }), null);
assert.equal(defaultOrder('berserker'), 'advance');
assert.equal(orderById('guard').name, 'Guard');

// oracle and traits: even is yes
assert.deepEqual(oracle(() => 0.99), { die: 6, answer: true });
assert.deepEqual(oracle(() => 0), { die: 1, answer: false });
const traits = fourTraits(() => 0.5);
assert.deepEqual(Object.keys(traits), ['fitness', 'intelligence', 'morals', 'bravery']);
assert.equal(traits.bravery.die, 4);

// bestiary entries arm the fear test
const fearsome = bestiaryToNpc('Kaptin Orlog Mordakka');
assert.equal(typeof fearsome.fear, 'number');

console.log('sanity.check.mjs: all assertions passed');
