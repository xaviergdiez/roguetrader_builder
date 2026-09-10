// Self-check for point-buy characteristics. Run: node src/points.check.mjs
import assert from 'node:assert/strict';
import {
  POINT_BASE, POINT_POOL, CHAR_ORDER, emptyAllocation, pointsSpent,
  pointsRemaining, allocationTotals, grantable, allocate, isComplete
} from './points.js';

assert.equal(POINT_BASE, 25);
assert.equal(POINT_POOL, 100);
assert.equal(CHAR_ORDER.length, 9);

// an untouched sheet is nine 25s with the whole pool intact
const empty = emptyAllocation();
assert.equal(pointsSpent(empty), 0);
assert.equal(pointsRemaining(empty), 100);
assert.deepEqual(allocationTotals(empty),
  { ws: 25, bs: 25, s: 25, t: 25, ag: 25, int: 25, per: 25, wp: 25, fel: 25 });

// spending raises that characteristic and nothing else
let a = allocate(empty, 'int', 15);
assert.equal(allocationTotals(a).int, 40);
assert.equal(allocationTotals(a).ws, 25, 'only the named characteristic moves');
assert.equal(pointsSpent(a), 15);
assert.equal(pointsRemaining(a), 85);

// allocate does not mutate what it was given
assert.equal(pointsSpent(empty), 0, 'the original allocation must be untouched');

// THE POOL IS A CEILING: a request past what is left is granted only in part
a = allocate(empty, 'ws', 250);
assert.equal(pointsSpent(a), 100, 'cannot spend more than the pool holds');
assert.equal(allocationTotals(a).ws, 125);
assert.equal(pointsRemaining(a), 0);
assert.equal(grantable(a, 'bs', 1), 0, 'nothing left to grant');
assert.equal(allocate(a, 'bs', 1), a, 'a no-op returns the same object');

// 25 IS THE FLOOR: points can be taken back, but not past zero allocation
let b = allocate(empty, 'fel', 10);
b = allocate(b, 'fel', -4);
assert.equal(allocationTotals(b).fel, 31);
assert.equal(pointsRemaining(b), 94, 'refunded points return to the pool');
b = allocate(b, 'fel', -99);
assert.equal(allocationTotals(b).fel, 25, 'cannot drop below the base');
assert.equal(pointsRemaining(b), 100);

// grantable reports the partial amounts rather than refusing outright
assert.equal(grantable(empty, 'int', 500), 100);
assert.equal(grantable(empty, 'int', -5), 0, 'nothing allocated, nothing to take back');
assert.equal(grantable(allocate(empty, 'int', 7), 'int', -20), -7);

// unknown characteristics and no-ops are refused
assert.equal(grantable(empty, 'luck', 5), 0);
assert.equal(grantable(empty, 'int', 0), 0);
assert.equal(allocate(empty, 'luck', 5), empty);

// completeness is exactly a fully spent pool
assert.equal(isComplete(empty), false);
assert.equal(isComplete(allocate(empty, 'ws', 100)), true);
assert.equal(isComplete(allocate(empty, 'ws', 99)), false);

// a spread across all nine adds up, and every value clears the base
const spread = CHAR_ORDER.reduce((acc, k, i) => allocate(acc, k, i < 1 ? 12 : 11), empty);
assert.equal(pointsSpent(spread), 100, '12 + 11 x 8');
assert.equal(isComplete(spread), true);
const totals = allocationTotals(spread);
assert.ok(CHAR_ORDER.every((k) => totals[k] >= POINT_BASE));
// and an even spread lands where 2d10+25 averages, which is the design intent
assert.equal(totals.bs, 36);

// junk input degrades to the base rather than throwing
assert.deepEqual(allocationTotals(null).ws, 25);
assert.deepEqual(allocationTotals({ ws: 'abc', bs: -5, int: 3.7 }).ws, 25);
assert.equal(allocationTotals({ bs: -5 }).bs, 25, 'a negative allocation is not a discount');
assert.equal(allocationTotals({ int: 3.7 }).int, 28, 'fractions floor');
assert.equal(pointsSpent(null), 0);

console.log('points: all checks passed (base %d, pool %d)', POINT_BASE, POINT_POOL);
