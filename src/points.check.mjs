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

/* ---- the tiered cost matrix: 26-35 = 1pt, 36-40 = 2pt, 41-45 = 3pt ---- */

// entirely within the 1-point tier: cost equals the raise
let a = allocate(empty, 'int', 10);
assert.equal(allocationTotals(a).int, 35);
assert.equal(pointsSpent(a), 10, '10 points to go from 25 to 35, 1 per point');

// crossing into the 2-point tier costs more per point from there on
a = allocate(empty, 'int', 15);
assert.equal(allocationTotals(a).int, 40, 'raising by 15 reaches 40');
assert.equal(pointsSpent(a), 20, '10 (26-35) + 2x5 (36-40) = 20, not 15');
assert.equal(allocationTotals(a).ws, 25, 'only the named characteristic moves');
assert.equal(pointsRemaining(a), 80);

// the full climb to the 45 cap: 10 + 10 + 15 = 35
a = allocate(empty, 'int', 20);
assert.equal(allocationTotals(a).int, 45);
assert.equal(pointsSpent(a), 35, '10 (tier 1) + 10 (tier 2) + 15 (tier 3)');

// allocate does not mutate what it was given
assert.equal(pointsSpent(empty), 0, 'the original allocation must be untouched');

/* ---- 45 IS A HARD CEILING: a single stat cannot consume the whole pool ---- */

a = allocate(empty, 'ws', 250);
assert.equal(allocationTotals(a).ws, 45, 'point-buy cannot exceed the 45 cap, unlike a roll');
assert.equal(pointsSpent(a), 35, 'the cost of reaching the cap, not however many points were asked for');
assert.equal(pointsRemaining(a), 65, 'maxing one stat leaves most of the pool unspent');
// with 65 points still free, another characteristic can still be raised
assert.ok(grantable(a, 'bs', 1) > 0, 'the pool is not drained just because one stat is capped');
assert.equal(allocate(a, 'ws', 1), a, 'already at the cap: a further raise is a no-op');

/* ---- 25 IS THE FLOOR: points can be taken back, but not past zero allocation ---- */

let b = allocate(empty, 'fel', 10);
b = allocate(b, 'fel', -4);
assert.equal(allocationTotals(b).fel, 31);
assert.equal(pointsRemaining(b), 94, 'refunded points return to the pool');
b = allocate(b, 'fel', -99);
assert.equal(allocationTotals(b).fel, 25, 'cannot drop below the base');
assert.equal(pointsRemaining(b), 100);

// refunding out of a higher tier gives back what that tier actually cost
b = allocate(empty, 'fel', 15);        // cost 20, value 40
b = allocate(b, 'fel', -5);            // back to raise 10, value 35
assert.equal(allocationTotals(b).fel, 35);
assert.equal(pointsSpent(b), 10, 'refunding the 2-point steps leaves only the 1-point tier spent');

/* ---- grantable reports the partial amounts rather than refusing outright ---- */

assert.equal(grantable(empty, 'int', 500), 20, 'capped at MAX_RAISE, not the pool size');
assert.equal(grantable(empty, 'int', -5), 0, 'nothing allocated, nothing to take back');
assert.equal(grantable(allocate(empty, 'int', 7), 'int', -20), -7);

// a pool too small for the next tiered step grants nothing, even though
// points remain — this is the case the "+" button's disabled state relies on
let tight = allocate(empty, 'int', 10);         // spends 10, value 35
for (const k of ['ws', 'bs', 's', 't', 'ag', 'per', 'wp']) {
  tight = allocate(tight, k, 10);                // 7 more x 10 = 70 spent, 80 total
}
assert.equal(pointsRemaining(tight), 20);
// fel is still untouched; raising it into the 1-point tier costs 1,
// well within the remaining 20
assert.equal(grantable(tight, 'fel', 1), 1);
let almostEmpty = allocate(empty, 'ws', 15);    // spends 20, value 40, 80 left
almostEmpty = allocate(almostEmpty, 'bs', 20);  // spends 35, value 45, 45 left
almostEmpty = allocate(almostEmpty, 's', 20);   // spends 35, value 45, 10 left
almostEmpty = allocate(almostEmpty, 't', 10);   // spends 10, value 35, 0 left
assert.equal(pointsRemaining(almostEmpty), 0);
assert.equal(grantable(almostEmpty, 'ag', 1), 0, 'no pool left for even the cheapest step');

// unknown characteristics and no-ops are refused
assert.equal(grantable(empty, 'luck', 5), 0);
assert.equal(grantable(empty, 'int', 0), 0);
assert.equal(allocate(empty, 'luck', 5), empty);

/* ---- completeness is exactly a fully spent pool ---- */

assert.equal(isComplete(empty), false);
// 8 characteristics raised to 35 (10 each = 80) plus one raised to 40 (20)
// spends exactly the 100-point pool.
let full = CHAR_ORDER.slice(0, 8).reduce((acc, k) => allocate(acc, k, 10), empty);
full = allocate(full, CHAR_ORDER[8], 15);
assert.equal(pointsSpent(full), 100);
assert.equal(isComplete(full), true);
assert.equal(isComplete(allocate(empty, CHAR_ORDER[0], 10)), false);

const totals = allocationTotals(full);
assert.ok(CHAR_ORDER.every((k) => totals[k] >= POINT_BASE));
assert.ok(CHAR_ORDER.every((k) => totals[k] <= POINT_CAP));

/* ---- junk input degrades to the base rather than throwing ---- */

assert.deepEqual(allocationTotals(null).ws, 25);
assert.deepEqual(allocationTotals({ ws: 'abc', bs: -5, int: 3.7 }).ws, 25);
assert.equal(allocationTotals({ bs: -5 }).bs, 25, 'a negative allocation is not a discount');
assert.equal(allocationTotals({ int: 3.7 }).int, 28, 'fractions floor');
assert.equal(allocationTotals({ ws: 999 }).ws, POINT_CAP, 'an out-of-range raise clamps to the cap');
assert.equal(pointsSpent(null), 0);

console.log('points: all checks passed (base %d, pool %d, cap %d)', POINT_BASE, POINT_POOL, POINT_CAP);
