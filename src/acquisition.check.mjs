// Self-check for the Acquisition test. Run: node src/acquisition.check.mjs
import assert from 'node:assert/strict';
import {
  AVAILABILITY, availabilityMod, rarer, SCALE, scaleFor, scaleById, YARDSTICK,
  pfCost, PF_COST, craftsmanshipMod, STANDING, acquisitionTarget, attempt, describe
} from './acquisition.js';

/* ---- the availability ladder ---- */

for (let i = 1; i < AVAILABILITY.length; i++) {
  assert.ok(AVAILABILITY[i].mod < AVAILABILITY[i - 1].mod, 'the ladder is out of order');
}
assert.equal(availabilityMod('Very Rare'), -30);
assert.equal(availabilityMod('Average'), 0);
assert.equal(availabilityMod('nonsense'), 0, 'an unknown rating must not become a bonus');

assert.equal(rarer('Rare'), 'Very Rare');
assert.equal(rarer('Rare', 2), 'Extremely Rare');
assert.equal(rarer('Unique'), 'Unique', 'the bottom of the ladder is the bottom');
assert.equal(rarer('nonsense'), 'nonsense');
assert.equal(rarer('Rare', 0), 'Rare');

/* ---- scale: the bridge from a Throne price to Profit Factor ---- */

assert.equal(YARDSTICK, 100);
for (let i = 1; i < SCALE.length; i++) {
  assert.ok(SCALE[i].mod < SCALE[i - 1].mod, 'the scale ladder is out of order');
  assert.ok(SCALE[i].upTo > SCALE[i - 1].upTo, 'the bands overlap');
}
assert.equal(scaleById('major').mod, -10);
assert.equal(scaleById('nonsense'), null);

// At Profit Factor 20 the dynasty moves 2,000 Thrones without comment.
{
  const at20 = (price) => scaleFor(price, 20).id;
  assert.equal(at20(150), 'negligible');     // 0.075
  assert.equal(at20(500), 'trivial');        // 0.25  — a Common bionic arm
  assert.equal(at20(1500), 'minor');         // 0.75  — the Good-grade arm
  assert.equal(at20(5000), 'standard');      // 2.5
  assert.equal(at20(10000), 'major');        // 5     — Light Power Armour
  assert.equal(at20(20000), 'vast');         // 10    — Ignatus plate
}

// THE WHOLE POINT: the same price is a different purchase to a different
// dynasty. Ten thousand Thrones is nothing at Profit Factor 80.
assert.equal(scaleFor(10000, 5).id, 'vast');
assert.equal(scaleFor(10000, 20).id, 'major');
assert.equal(scaleFor(10000, 50).id, 'standard');
assert.equal(scaleFor(10000, 200).id, 'trivial');

// Edges: free is free, and no Profit Factor does not divide by zero.
assert.equal(scaleFor(0, 20).id, 'negligible');
assert.equal(scaleFor(0, 20).ratio, 0);
assert.equal(scaleFor(-5, 20).id, 'negligible');
assert.equal(scaleFor(10000, 0).id, 'vast');
assert.ok(Number.isFinite(scaleFor(10000, 0).ratio), 'a ratio must never be Infinity');
assert.equal(scaleFor(10000, 'x').id, 'vast');

/* ---- what a significant purchase costs ---- */

assert.equal(pfCost('negligible'), 0);
assert.equal(pfCost('standard'), 0, 'small purchases are the noise Profit Factor exists to ignore');
assert.equal(pfCost('major'), 1);
assert.equal(pfCost('vast'), 2);
assert.equal(pfCost('nonsense'), 0);
assert.equal(pfCost(undefined), 0);
assert.deepEqual(Object.keys(PF_COST), ['major', 'vast']);

assert.equal(craftsmanshipMod('Good'), -10);
assert.equal(craftsmanshipMod('Best'), -30);
assert.equal(craftsmanshipMod('Common'), 0);
assert.equal(craftsmanshipMod(null), 0);

/* ---- the target, and the breakdown it shows ---- */

// The Sororitas Missionary's suit: Very Rare, 10,000 Thrones, at PF 20. Out
// of reach on money alone — and reachable because her Order will issue it.
{
  const cold = acquisitionTarget({ profitFactor: 20, availability: 'Very Rare', price: 10000 });
  assert.equal(cold.target, -20, '20 − 30 rarity − 10 scale');
  assert.equal(cold.scale.id, 'major');
  assert.equal(cold.pfCost, 1);

  const issued = acquisitionTarget({
    profitFactor: 20, availability: 'Very Rare', price: 10000, standing: true
  });
  assert.equal(issued.target, 10, 'standing is what opens the door');
  assert.equal(issued.target - cold.target, STANDING);
}

// And the same suit once the dynasty has grown into it.
assert.equal(acquisitionTarget({
  profitFactor: 50, availability: 'Very Rare', price: 10000
}).target, 20, 'Profit Factor is the campaign arc: 50 − 30 − 0 scale');

// A Common bionic arm is simply gettable.
assert.equal(acquisitionTarget({
  profitFactor: 20, availability: 'Rare', price: 500
}).target, 20, '20 − 20 rarity + 20 scale');

// Craftsmanship only when the caller asks for it, since some tables state the
// graded article's rarity outright and stepping it again charges twice.
assert.equal(acquisitionTarget({
  profitFactor: 40, availability: 'Average', price: 0, craftsmanship: 'Best'
}).target, 40 + 30 - 30, 'negligible scale and Best craftsmanship cancel');
assert.equal(acquisitionTarget({ profitFactor: 40, price: 0 }).target, 70);

// Circumstance is the GM's thumb on the scale.
assert.equal(acquisitionTarget({ profitFactor: 20, price: 0, modifier: -15 }).target, 35);

// Defaults: no arguments at all still produces a usable target.
{
  const t = acquisitionTarget();
  assert.equal(t.target, 30, 'Profit Factor 0, nothing to buy, negligible scale');
  assert.equal(t.parts[0].label, 'Profit Factor');
  // Zero-value parts are left out rather than shown as "+0 average".
  assert.equal(t.parts.length, 2);
}

assert.match(describe(acquisitionTarget({
  profitFactor: 20, availability: 'Very Rare', price: 10000, standing: true
})), /^20 − 30 very rare − 10 major scale \+ 30 standing$/);

/* ---- rolling it ---- */

{
  const t = acquisitionTarget({ profitFactor: 50, availability: 'Very Rare', price: 10000 });
  assert.equal(t.target, 20);

  const got = attempt(t, 11);
  assert.equal(got.success, true);
  assert.equal(got.pfCost, 0, 'Standard scale at this Profit Factor costs nothing');

  const missed = attempt(t, 61);
  assert.equal(missed.success, false);
  assert.equal(missed.pfCost, 0, 'a failed acquisition costs no Profit Factor');
}

// A Major purchase charges Profit Factor, but only when it lands.
{
  const t = acquisitionTarget({ profitFactor: 20, availability: 'Very Rare',
    price: 10000, standing: true });
  assert.equal(attempt(t, 9).pfCost, 1);
  assert.equal(attempt(t, 90).pfCost, 0);
}

// The reason a relic is ever acquired: 01-05 succeeds against any target, and
// 96-00 fails against any.
{
  const impossible = acquisitionTarget({ profitFactor: 20, availability: 'Unique', price: 50000 });
  assert.ok(impossible.target < 0);
  const luck = attempt(impossible, 3);
  assert.equal(luck.success, true);
  assert.equal(luck.automatic, true);
  assert.equal(luck.pfCost, 2, 'and a Vast purchase still costs the Profit Factor');

  const certain = acquisitionTarget({ profitFactor: 80, availability: 'Ubiquitous', price: 0 });
  assert.equal(attempt(certain, 99).success, false);
}

// Extra degrees are reported for the GM to spend, not applied.
{
  const t = acquisitionTarget({ profitFactor: 80, availability: 'Common', price: 100 });
  const r = attempt(t, 5);
  assert.ok(r.surplus >= 1);
  assert.equal(attempt(t, 99).surplus, 0);
}

// A bare number works as a target too, for a one-off the caller assembled.
assert.equal(attempt(40, 21).success, true);
assert.equal(attempt(40, 41).success, false);

console.log('acquisition.js OK');
