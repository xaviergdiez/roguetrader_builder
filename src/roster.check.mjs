// Self-check for the roster list operations. Run: node src/roster.check.mjs
import assert from 'node:assert/strict';
import {
  sameNamed, upsert, remove, newId } from './roster.js';

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

/* ---- saving a name that is already in the roster ---- */

{
  const list = [
    { id: 'a', name: 'Hadriax Belisarius' },
    { id: 'b', name: 'Kell' },
    { id: 'c', name: '' }
  ];

  // THE BUG THIS PREVENTS: "Save current" overwrites the open sheet because
  // that sheet carries its id. Start a new character or import one and there
  // is no id, so saving a name already in the roster made a SECOND entry and
  // the GM had two of the same character with no way to tell them apart.
  assert.equal(sameNamed(list, 'Hadriax Belisarius', null).id, 'a');

  // Not a clash with itself: re-saving the sheet you already have open is
  // the ordinary case and must not ask anything.
  assert.equal(sameNamed(list, 'Hadriax Belisarius', 'a'), null);

  // The same person, typed by a human.
  assert.equal(sameNamed(list, '  hadriax   belisarius  ', null).id, 'a');
  assert.equal(sameNamed(list, 'HADRIAX BELISARIUS', null).id, 'a');

  // A blank name matches nothing. Comparing them equal would make every
  // unnamed sheet collide with every other unnamed sheet.
  assert.equal(sameNamed(list, '', null), null);
  assert.equal(sameNamed(list, '   ', null), null);
  assert.equal(sameNamed(list, null, null), null);

  assert.equal(sameNamed(list, 'Nobody', null), null);
  assert.equal(sameNamed(null, 'Kell', null), null);
  assert.equal(sameNamed([null, undefined, 3], 'Kell', null), null);
}

console.log('roster.js: sameNamed OK');
