// Self-check for contacts.js. Run: node src/contacts.check.mjs
import assert from 'node:assert/strict';
import {
  PROVIDES, PROVEN, TOO_MUCH, FINDING, INFLUENCE_MIN, INFLUENCE_MAX, MAX_CONTACTS,
  readContact, readContacts, effectiveInfluence, newContact
} from './contacts.js';

/* ---- the book's five things a contact can do ---- */
assert.deepEqual(PROVIDES.map((p) => p.id), ['access', 'equipment', 'information', 'protection', 'services']);
assert.ok(PROVEN.length >= 5 && TOO_MUCH.length >= 6);
// The finding test names this app's skills, not Imperium Maledictum's.
assert.match(FINDING, /Inquiry/);
assert.doesNotMatch(FINDING, /Rapport|Intuition/);

/* ---- a contact is read, never trusted ---- */
{
  const c = readContact({ id: 'c1', name: 'Hogarth Drevet', faction: 'Adeptus Ministorum',
    provides: ['information', 'bribes', 'information'], influence: 2, standing: -1, burned: 'yes' });
  assert.equal(c.id, 'c1');
  assert.deepEqual(c.provides, ['information'], 'unknown and repeated kinds dropped');
  assert.equal(c.burned, true);
  // The book's own example: +2 with him, -1 with the Ministorum, +1 together.
  assert.equal(effectiveInfluence(c), 1);
}
assert.equal(readContact({ influence: 40 }).influence, INFLUENCE_MAX);
assert.equal(readContact({ standing: -40 }).standing, INFLUENCE_MIN);
assert.equal(effectiveInfluence(readContact({ influence: 5, standing: 5 })), INFLUENCE_MAX, 'together is still on the scale');
assert.equal(effectiveInfluence(null), 0);
assert.ok(readContact({}).id.startsWith('con-'), 'a new contact gets an id to key on');
assert.equal(newContact('Agira').name, 'Agira');

assert.deepEqual(readContacts('nope'), []);
assert.equal(readContacts([{}, null, 'x', {}]).length, 2);
assert.equal(readContacts(Array.from({ length: 99 }, () => ({}))).length, MAX_CONTACTS);

console.log('contacts.js OK (%d kinds of help)', PROVIDES.length);
