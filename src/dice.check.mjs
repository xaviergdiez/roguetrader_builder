// Self-check for d100 test resolution. Run: node src/dice.check.mjs
import assert from 'node:assert/strict';
import { roll1d100, resolveTest, DIFFICULTIES } from './dice.js';

// rolling under the target succeeds; over it fails
assert.equal(resolveTest(40, 0, 12).success, true);
assert.equal(resolveTest(40, 0, 55).success, false);

// the boundary: rolling exactly the target is a success, one over is not
assert.equal(resolveTest(40, 0, 40).success, true);
assert.equal(resolveTest(40, 0, 41).success, false);

// one degree per full 10 points of margin, so a bare success is 0 degrees
assert.equal(resolveTest(40, 0, 40).degrees, 0);
assert.equal(resolveTest(40, 0, 39).degrees, 0, '1 point of margin is not a degree');
assert.equal(resolveTest(40, 0, 30).degrees, 1);
assert.equal(resolveTest(45, 0, 12).degrees, 3);

// degrees of failure count from the other side
const failed = resolveTest(30, 0, 65);
assert.equal(failed.success, false);
assert.equal(failed.degrees, 3);

// modifiers move the target, not the roll
assert.equal(resolveTest(30, 20, 45).target, 50);
assert.equal(resolveTest(30, 20, 45).success, true);
assert.equal(resolveTest(30, -20, 45).target, 10);
assert.equal(resolveTest(30, -20, 45).success, false);

// 01-05 always succeeds even against a target it could never beat
const impossible = resolveTest(30, -60, 3);
assert.equal(impossible.target, -30);
assert.equal(impossible.success, true);
assert.equal(impossible.automatic, true);
assert.equal(impossible.degrees, 0, 'a negative margin must not yield negative degrees');

// 96-00 always fails even against a target it could never miss
const certain = resolveTest(90, 60, 99);
assert.equal(certain.target, 150);
assert.equal(certain.success, false);
assert.equal(certain.automatic, true);
assert.equal(certain.degrees, 0);

// an ordinary result is not flagged automatic
assert.equal(resolveTest(40, 0, 40).automatic, false);

// the die is 1..100 inclusive at both ends, never 0 or 101
assert.equal(roll1d100(() => 0), 1);
assert.equal(roll1d100(() => 0.999999), 100);
for (let i = 0; i < 400; i++) {
  const r = roll1d100();
  assert.ok(r >= 1 && r <= 100 && Number.isInteger(r), 'out of range: ' + r);
}

// Challenging is the unmodified test — the ladder is centred on it
assert.equal(DIFFICULTIES.find((d) => d.label === 'Challenging').mod, 0);

console.log('dice: all checks passed');
