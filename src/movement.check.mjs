// Self-check for movement distances. Run: node src/movement.check.mjs
import assert from 'node:assert/strict';
import { movementFor } from './movement.js';

// Agility Bonus 4 (Agility 40-49): the textbook row from the core rulebook's
// own Movement table example.
assert.deepEqual(movementFor(4), { halfMove: 4, fullMove: 8, charge: 12, run: 24, jump: 2, leap: 4 });

assert.deepEqual(movementFor(0), { halfMove: 0, fullMove: 0, charge: 0, run: 0, jump: 0, leap: 0 });
assert.deepEqual(movementFor(3), { halfMove: 3, fullMove: 6, charge: 9, run: 18, jump: 1, leap: 3 });

// an odd Agility Bonus rounds the jump distance down, not the others
assert.equal(movementFor(5).jump, 2);
assert.equal(movementFor(5).leap, 5);

// junk input degrades to 0 rather than throwing or going negative
assert.deepEqual(movementFor(null), { halfMove: 0, fullMove: 0, charge: 0, run: 0, jump: 0, leap: 0 });
assert.deepEqual(movementFor(-3), { halfMove: 0, fullMove: 0, charge: 0, run: 0, jump: 0, leap: 0 });
assert.equal(movementFor(2.9).halfMove, 2, 'fractions floor before anything is multiplied');

console.log('movement: all checks passed');
