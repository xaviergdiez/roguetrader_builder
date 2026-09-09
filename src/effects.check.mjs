// Self-check for conditional test modifiers. Run: node src/effects.check.mjs
import assert from 'node:assert/strict';
import { CONDITIONALS, conditionalsOf, conditionalsFor } from './effects.js';

// a character built from Hive World + Zealot carries both sets
const picked = { home: { id: 'hive' }, lure: { id: 'zealot' } };

const all = conditionalsOf(picked);
assert.equal(all.length, CONDITIONALS.hive.length + CONDITIONALS.zealot.length);

// the roller only offers what bears on the characteristic being tested
const int = conditionalsFor(picked, 'int');
assert.equal(int.length, 2, 'both Hivebound clauses are Intelligence-based');
assert.ok(int.every((c) => c.from === 'Hivebound'));

const fel = conditionalsFor(picked, 'fel');
assert.deepEqual(fel.map((c) => c.mod), [-10], 'only the Zealot Charm penalty');

const s = conditionalsFor(picked, 's');
assert.deepEqual(s.map((c) => c.mod), [10], 'Intimidate is Strength-based');

// Wary is Agility-only, so it must not show up on a Willpower test
assert.equal(conditionalsFor(picked, 'ag').length, 1);
assert.equal(conditionalsFor(picked, 'wp').length, 0);

// an origin with no conditionals contributes nothing, and empties are safe
assert.deepEqual(conditionalsOf({ home: { id: 'forgeworld-nonexistent' } }), []);
assert.deepEqual(conditionalsOf({}), []);
assert.deepEqual(conditionalsOf(null), []);
assert.deepEqual(conditionalsOf({ home: null }), []);

// every entry is well formed — a typo here would silently drop a modifier
for (const [id, list] of Object.entries(CONDITIONALS)) {
  assert.ok(Array.isArray(list) && list.length, id + ' must have modifiers');
  for (const c of list) {
    assert.equal(typeof c.from, 'string', id + ': from');
    assert.equal(typeof c.when, 'string', id + ': when');
    assert.ok(Number.isInteger(c.mod) && c.mod !== 0, id + ': mod must be a non-zero integer');
    assert.ok(Array.isArray(c.chars) && c.chars.length, id + ': chars');
    for (const k of c.chars) {
      assert.ok(['ws', 'bs', 's', 't', 'ag', 'int', 'per', 'wp', 'fel'].includes(k),
        id + ': unknown characteristic ' + k);
    }
  }
}

console.log('effects: all checks passed (%d origins, %d modifiers)',
  Object.keys(CONDITIONALS).length,
  Object.values(CONDITIONALS).reduce((n, l) => n + l.length, 0));
