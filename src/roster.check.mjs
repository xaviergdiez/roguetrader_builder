// Self-check for the roster list operations. Run: node src/roster.check.mjs
import assert from 'node:assert/strict';
import { upsert, remove, newId } from './roster.js';

const a = { id: '1', name: 'Magos', state: { name: 'Magos' } };
const b = { id: '2', name: 'Seneschal', state: { name: 'Seneschal' } };

// append when the id is new
const one = upsert([], a);
assert.deepEqual(one.map((c) => c.id), ['1']);
const two = upsert(one, b);
assert.deepEqual(two.map((c) => c.id), ['1', '2']);

// replace in place when the id already exists — order must hold, no duplicate
const edited = upsert(two, { ...a, name: 'Magos Linus-Theta 7' });
assert.deepEqual(edited.map((c) => c.id), ['1', '2']);
assert.equal(edited[0].name, 'Magos Linus-Theta 7');
assert.equal(edited.length, 2);

// upsert does not mutate the list it was given
assert.equal(two[0].name, 'Magos');

// remove drops only the named id, and is a no-op for an unknown one
assert.deepEqual(remove(edited, '1').map((c) => c.id), ['2']);
assert.deepEqual(remove(edited, 'nope').map((c) => c.id), ['1', '2']);

// ids are unique
assert.notEqual(newId(), newId());

console.log('roster: all checks passed');
