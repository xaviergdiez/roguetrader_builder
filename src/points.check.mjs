// Self-check for point-buy characteristics. Run: node src/points.check.mjs
import assert from 'node:assert/strict';
import {
  POINT_BASE, POINT_POOL, POINT_CAP, MAX_RAISE, CHAR_ORDER, emptyAllocation, pointsSpent,
  pointsRemaining, allocationTotals, grantable, allocate, isComplete
} from './points.js';

assert.equal(POINT_BASE, 25);
assert.equal(POINT_POOL, 100);
assert.equal(POINT_CAP, 45);
assert.equal(MAX_RAISE, 20);
assert.equal(CHAR_ORDER.length, 9);

// an untouched sheet is nine 25s with the whole pool intact
const empty = emptyAllocation();
assert.equal(pointsSpent(empty), 0);
assert.equal(pointsRemaining(empty), 100);
assert.deepEqual(allocationTotals(empty),
  { ws: 25, bs: 25, s: 25, t: 25, ag: 25, int: 25, per: 25, wp: 25, fel: 25 });

/* ---- a point is a point: one spent is one added ---- */

// "may allocate a total of 100 additional points to his Characteristics,
// adding no more than 20 to any one Characteristic" — flat, not tiered. An
// earlier pass priced the steps 1/2/3 by tier, which bought only ~45 points
// of characteristics from the full pool.
let a = allocate(empty, 'int', 10);
assert.equal(allocationTotals(a).int, 35);
assert.equal(pointsSpent(a), 10);

a = allocate(empty, 'int', 15);
assert.equal(allocationTotals(a).int, 40);
assert.equal(pointsSpent(a), 15, 'fifteen points, fifteen added — no tier surcharge');
assert.equal(allocationTotals(a).ws, 25, 'only the named characteristic moves');
assert.equal(pointsRemaining(a), 85);

// the full raise any one characteristic is allowed
a = allocate(empty, 'int', 20);
assert.equal(allocationTotals(a).int, 45);
assert.equal(pointsSpent(a), 20);

// allocate does not mutate what it was given
assert.equal(pointsSpent(empty), 0, 'the original allocation must be untouched');

/* ---- NO MORE THAN 20 TO ANY ONE, which the 45 ceiling follows from ---- */

assert.equal(POINT_CAP, POINT_BASE + MAX_RAISE, 'the cap is the rule’s consequence');

a = allocate(empty, 'ws', 250);
assert.equal(allocationTotals(a).ws, 45, 'twenty is the most one characteristic may take');
assert.equal(pointsSpent(a), 20, 'and it costs exactly twenty of the hundred');
assert.equal(pointsRemaining(a), 80, 'leaving the rest of the pool to spend elsewhere');
assert.ok(grantable(a, 'bs', 1) > 0, 'the pool is not drained by one capped stat');
assert.equal(allocate(a, 'ws', 1), a, 'already at the cap: a further raise is a no-op');
assert.equal(grantable(a, 'ws', 5), 0);

/* ---- the pool spends out exactly, which tiers made impossible ---- */

// Five characteristics at the +20 ceiling is the whole hundred.
{
  const five = ['ws', 'bs', 's', 't', 'ag'].reduce((acc, k) => allocate(acc, k, 20), empty);
  assert.equal(pointsSpent(five), 100);
  assert.equal(isComplete(five), true);
  assert.equal(grantable(five, 'int', 1), 0, 'nothing left for a sixth');

  // And the book's own claim about the method holds: nine characteristics
  // totalling 325 average 36.1, against the 36 a 2d10+25 roll averages.
  const totals = allocationTotals(five);
  const sum = CHAR_ORDER.reduce((n, k) => n + totals[k], 0);
  assert.equal(sum, 9 * POINT_BASE + POINT_POOL);
  assert.equal(sum, 325, 'slightly higher than average, as the rule says');
}

/* ---- 25 IS THE FLOOR: points can be taken back, but not past zero ---- */

let b = allocate(empty, 'fel', 10);
b = allocate(b, 'fel', -4);
assert.equal(allocationTotals(b).fel, 31);
assert.equal(pointsRemaining(b), 94, 'refunded points return to the pool');
b = allocate(b, 'fel', -99);
assert.equal(allocationTotals(b).fel, 25, 'cannot drop below the base');
assert.equal(pointsRemaining(b), 100);

// a refund gives back exactly what it took
b = allocate(empty, 'fel', 15);
b = allocate(b, 'fel', -5);
assert.equal(allocationTotals(b).fel, 35);
assert.equal(pointsSpent(b), 10);

/* ---- grantable reports the partial amount rather than refusing outright ---- */

assert.equal(grantable(empty, 'int', 500), 20, 'capped at MAX_RAISE');
assert.equal(grantable(empty, 'int', -5), 0, 'nothing allocated, nothing to take back');
assert.equal(grantable(allocate(empty, 'int', 7), 'int', -20), -7);

// A pool with less left than was asked for grants what remains, and nothing
// once it is empty — the case the "+" button's disabled state relies on.
{
  let tight = ['ws', 'bs', 's', 't'].reduce((acc, k) => allocate(acc, k, 20), empty);
  assert.equal(pointsRemaining(tight), 20);
  assert.equal(grantable(tight, 'ag', 50), 20, 'only what the pool still holds');
  tight = allocate(tight, 'ag', 20);
  assert.equal(pointsRemaining(tight), 0);
  assert.equal(grantable(tight, 'int', 1), 0, 'no pool left for even one point');
  assert.equal(allocate(tight, 'int', 1), tight);
}

// unknown characteristics and no-ops are refused
assert.equal(grantable(empty, 'luck', 5), 0);
assert.equal(grantable(empty, 'int', 0), 0);
assert.equal(allocate(empty, 'luck', 5), empty);

/* ---- completeness is exactly a fully spent pool ---- */

assert.equal(isComplete(empty), false);
assert.equal(isComplete(allocate(empty, CHAR_ORDER[0], 10)), false);
{
  const spread = CHAR_ORDER.reduce((acc, k, i) => allocate(acc, k, i < 1 ? 12 : 11), empty);
  assert.equal(pointsSpent(spread), 100, '12 + eight 11s');
  assert.equal(isComplete(spread), true);
  const totals = allocationTotals(spread);
  assert.ok(CHAR_ORDER.every((k) => totals[k] >= POINT_BASE));
  assert.ok(CHAR_ORDER.every((k) => totals[k] <= POINT_CAP));
}

/* ---- junk input degrades to the base rather than throwing ---- */

assert.deepEqual(allocationTotals(null).ws, 25);
assert.deepEqual(allocationTotals({ ws: 'abc', bs: -5, int: 3.7 }).ws, 25);
assert.equal(allocationTotals({ bs: -5 }).bs, 25, 'a negative allocation is not a discount');
assert.equal(allocationTotals({ int: 3.7 }).int, 28, 'fractions floor');
assert.equal(allocationTotals({ ws: 999 }).ws, POINT_CAP, 'an out-of-range raise clamps to the cap');
assert.equal(pointsSpent(null), 0);

console.log('points: all checks passed (base %d, pool %d, cap %d)', POINT_BASE, POINT_POOL, POINT_CAP);
