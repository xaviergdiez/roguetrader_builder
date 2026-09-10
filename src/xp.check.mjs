// Self-check for XP, rank and advance costs. Run: node src/xp.check.mjs
import assert from 'node:assert/strict';
import {
  RANKS, STARTING_XP, rankForXp, xpToNextRank, isStartingBudget, spendableXp,
  advanceCost, cumulativeAdvanceCost, advancesBetween,
  ADVANCE_LEVELS, ADVANCE_STEP, CHAR_ADVANCE_COST
} from './xp.js';

// rank boundaries — off-by-one here would misreport every sheet
assert.equal(rankForXp(0), 1);
assert.equal(rankForXp(5000), 1, 'a starting Explorer is Rank 1');
assert.equal(rankForXp(6999), 1);
assert.equal(rankForXp(7000), 2, 'the boundary belongs to the higher rank');
assert.equal(rankForXp(9999), 2);
assert.equal(rankForXp(10000), 3);
assert.equal(rankForXp(28999), 7);
assert.equal(rankForXp(29000), 8);
assert.equal(rankForXp(999999), 8, 'Rank 8 is open-ended');

// nonsense input degrades to Rank 1 rather than throwing
assert.equal(rankForXp(null), 1);
assert.equal(rankForXp(-500), 1);

// the ladder has no gaps or overlaps
for (let i = 1; i < RANKS.length; i++) {
  assert.equal(RANKS[i].min, RANKS[i - 1].max + 1,
    'gap or overlap between rank ' + RANKS[i - 1].rank + ' and ' + RANKS[i].rank);
}

// ranks display as Roman numerals, across the whole ladder
const { romanRank } = await import('./xp.js');
assert.deepEqual(RANKS.map((r) => romanRank(r.rank)),
  ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']);
// and the numeral tracks XP, so crossing a threshold changes what is shown
assert.equal(romanRank(rankForXp(5000)), 'I');
assert.equal(romanRank(rankForXp(6999)), 'I');
assert.equal(romanRank(rankForXp(7000)), 'II', 'the threshold flips the numeral');
assert.equal(romanRank(rankForXp(29000)), 'VIII');

// distance to the next rank
assert.equal(xpToNextRank(6999), 1);
assert.equal(xpToNextRank(5000), 2000);
assert.equal(xpToNextRank(29000), null, 'nothing beyond Rank 8');

// the starting allowance
assert.equal(isStartingBudget(5000), true);
assert.equal(isStartingBudget(4500), true);
assert.equal(isStartingBudget(4499), false);
assert.equal(isStartingBudget(7500), false, 'the 7,500 XP Rogue Trader is over the standard budget');

// THE DISTINCTION THAT MATTERS: the 5,000 total is not a spending budget.
// 4,500 is the value of the free creation packages; only 500 is spendable.
// An audit that compares purchases against the total instead of the spendable
// figure would clear a sheet that had overspent by a factor of ten.
assert.equal(STARTING_XP.total, 5000);
assert.equal(STARTING_XP.baseline, 4500);
assert.equal(STARTING_XP.spendable, 500);
assert.equal(STARTING_XP.baseline + STARTING_XP.spendable, STARTING_XP.total);

const { remainingXp } = await import('./xp.js');
assert.equal(remainingXp(5000, 0), 500);
assert.equal(remainingXp(5000, 200), 300);
assert.equal(remainingXp(5000, 500), 0);
assert.equal(remainingXp(5000, 700), -200,
  'overspend must surface as negative, not clamp to zero and look compliant');
assert.equal(remainingXp(7500, 400), 2600);
assert.equal(remainingXp(5000, null), 500);

assert.equal(spendableXp(5000), 500, 'a fresh Explorer has 500 to spend, not 5,000');
assert.equal(spendableXp(4500), 0, 'the bare baseline buys nothing');
assert.equal(spendableXp(7500), 3000, 'the initial 500 plus 2,500 earned in play');
assert.equal(spendableXp(4000), 0, 'never negative');
assert.equal(spendableXp(null), 0);

// advance costs by tier
assert.equal(advanceCost('primary', 'simple'), 100);
assert.equal(advanceCost('secondary', 'simple'), 250);
assert.equal(advanceCost('tertiary', 'expert'), 1500);
assert.equal(advanceCost('primary', 'nonesuch'), null);
assert.equal(advanceCost('nonesuch', 'simple'), null);

// cost rises with each successive advance in the same characteristic
const primary = ADVANCE_LEVELS.map((l) => advanceCost('primary', l));
for (let i = 1; i < primary.length; i++) {
  assert.ok(primary[i] > primary[i - 1], 'primary costs must increase');
}
// and a tertiary advance is never cheaper than a primary one
for (const l of ADVANCE_LEVELS) {
  assert.ok(advanceCost('tertiary', l) >= advanceCost('primary', l));
}

// cumulative: 100 + 250 + 500 + 750
assert.equal(cumulativeAdvanceCost('primary', 1), 100);
assert.equal(cumulativeAdvanceCost('primary', 2), 350);
assert.equal(cumulativeAdvanceCost('primary', 4), 1600);
assert.equal(cumulativeAdvanceCost('primary', 0), 0);
// past the published levels there is no cost, so say so instead of guessing
assert.equal(cumulativeAdvanceCost('primary', 5), null);

// how many +5 steps separate two values
assert.equal(ADVANCE_STEP, 5);
assert.equal(advancesBetween(30, 45), 3);
assert.equal(advancesBetween(30, 30), 0);
assert.equal(advancesBetween(40, 30), 0, 'a decrease is not an advance');
assert.equal(advancesBetween(30, 43), 3, 'a partial step still costs a whole advance');

// every tier defines every level
for (const tier of Object.keys(CHAR_ADVANCE_COST)) {
  for (const l of ADVANCE_LEVELS) {
    assert.equal(typeof advanceCost(tier, l), 'number', tier + '/' + l);
  }
}

console.log('xp: all checks passed (%d ranks, %d tiers)',
  RANKS.length, Object.keys(CHAR_ADVANCE_COST).length);
