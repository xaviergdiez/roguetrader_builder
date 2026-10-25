import assert from 'node:assert/strict';
import { parseFear, isFearless, fearModifier, shockResult, fearTest, addInsanity, addCorruption, nextThreshold }
  from './sanity.js';
import { breakTest, oracle, fourTraits, defaultOrder, orderById, bestiaryToNpc } from './npcgen.js';

assert.equal(parseFear('Claws. Fear (3). Size (Enormous).'), 3);
assert.equal(parseFear('Claws.'), 0);
assert.equal(isFearless('Frenzy. Fearless. Die Hard.'), true);
assert.equal(fearModifier(1), 0);
assert.equal(fearModifier(3), -20);

assert.equal(shockResult(10, 0).condition.id, 'shaken');
assert.equal(shockResult(10, 5).score, 60);
assert.equal(shockResult(95, 3).condition.id, 'fleeing');

assert.equal(fearTest({ willpower: 40, rating: 2, roll: 30 }).passed, true, '30 vs 40-10');
const failed = fearTest({ willpower: 40, rating: 3, roll: 60, shockRoll: 50 });
assert.equal(failed.passed, false);
assert.equal(failed.shock.score, 90, 'Degrees of Failure add 10 each to the shock roll');
assert.equal(failed.condition.id, 'fleeing');
assert.equal(failed.insanity, 2);
assert.equal(fearTest({ willpower: 5, rating: 4, roll: 99, fearless: true }).passed, true);
assert.equal(fearTest({ willpower: 5, rating: 0, roll: 99 }).skipped, true);

assert.deepEqual(addInsanity(8, 3), { total: 11, disorderChecks: 1 });
assert.deepEqual(addInsanity(1, 2), { total: 3, disorderChecks: 0 });
assert.deepEqual(addCorruption(28, 5), { total: 33, malignancyChecks: 1 });
assert.equal(nextThreshold(33, 30), 60);

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
