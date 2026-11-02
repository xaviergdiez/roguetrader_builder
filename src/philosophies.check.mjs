// Self-check for the Inquisition philosophies. Run: node src/philosophies.check.mjs
import assert from 'node:assert/strict';
import { PHILOSOPHIES, philosophyById, philosophyForRoll, STANCES, PHILOSOPHY_BOOK } from './philosophies.js';
import { rollInquisitor, INQUISITION_FACTIONS } from './inquisition.js';

assert.equal(PHILOSOPHIES.length, 14);
assert.ok(/Imperium Maledictum/.test(PHILOSOPHY_BOOK));
assert.equal(new Set(PHILOSOPHIES.map((p) => p.id)).size, 14, 'each once');
assert.deepEqual(PHILOSOPHIES.map((p) => p.name), ['Amalathian', 'Horusian', 'Isstvanism', 'Libricar', 'Monodominant', 'Oblationist',
  'Ocularian', 'Phaenonite', 'Plutonian', 'Polypsykana', 'Recongregationism', 'Seculos Attendous', 'Thorian', 'Xanthism'], 'the book’s order');

// The book labels exactly three of them Puritan.
assert.deepEqual(PHILOSOPHIES.filter((p) => p.stance === 'Puritan').map((p) => p.id), ['amalathian', 'monodominant', 'thorian']);
for (const p of PHILOSOPHIES) {
  assert.ok(STANCES.includes(p.stance), `${p.id}: stance`);
  assert.ok(p.page >= 16 && p.page <= 29, `${p.id}: page ${p.page}`);
  assert.equal(p.tenets.length, 3, `${p.id}: three tenets`);
  for (const t of [...p.tenets, p.aim, p.play]) assert.ok(t.length > 15 && t.length < 260, `${p.id}: a line of ${t.length} characters`);
}

// The d100 table covers 1-100 exactly once, in the book’s bands.
{
  let next = 1;
  for (const p of PHILOSOPHIES) {
    assert.equal(p.from, next, `${p.id} starts where the last ended`);
    assert.ok(p.to >= p.from);
    next = p.to + 1;
  }
  assert.equal(next, 101, 'ends at 100');
  assert.equal(philosophyForRoll(1).id, 'amalathian');
  assert.equal(philosophyForRoll(7).id, 'amalathian');
  assert.equal(philosophyForRoll(8).id, 'horusian');
  assert.equal(philosophyForRoll(36).id, 'monodominant');
  assert.equal(philosophyForRoll(37).id, 'oblationist');
  assert.equal(philosophyForRoll(93).id, 'thorian');
  assert.equal(philosophyForRoll(94).id, 'xanthism');
  assert.equal(philosophyForRoll(100).id, 'xanthism', '00 is the last');
  assert.equal(philosophyForRoll(0).id, 'amalathian', 'clamped');
  assert.equal(philosophyForRoll(250).id, 'xanthism');
  for (let n = 1; n <= 100; n++) assert.ok(philosophyForRoll(n), `a philosophy for ${n}`);
}
assert.equal(philosophyById('xanthism').stance, 'Radical');
assert.equal(philosophyById('nonsense'), null);

// Rolling an Inquisitor uses them, and the old call still works.
{
  const r = rollInquisitor({ ordoId: 'malleus', philosophyId: 'xanthism', retinueSize: 2 });
  assert.equal(r.faction, 'Xanthism');
  assert.equal(r.philosophy.id, 'xanthism');
  assert.equal(r.retinue.length, 2);
  assert.match(r.inquisitor.name, /Ordo Malleus, Xanthism/);

  const old = rollInquisitor({ ordoId: 'hereticus', factionId: 'thorian', retinueSize: 0 });
  assert.equal(old.faction, 'Thorian', 'a faction id that is also a philosophy gives the fuller one');
  assert.equal(old.philosophy.id, 'thorian');

  const legacy = rollInquisitor({ ordoId: 'xenos', factionId: 'xanthite', retinueSize: 0 });
  assert.equal(legacy.faction, 'Xanthite', 'an older faction with no philosophy of that id is kept');
  assert.equal(legacy.philosophy, null);
  assert.equal(INQUISITION_FACTIONS.length, 5, 'the five are still there');

  // Rolled on the book’s table: a low roll is an Amalathian, a high one a Xanthist.
  assert.equal(rollInquisitor({ rng: () => 0, ordoId: 'xenos', retinueSize: 0 }).philosophy.id, 'amalathian');
  assert.equal(rollInquisitor({ rng: () => 0.999, ordoId: 'xenos', retinueSize: 0 }).philosophy.id, 'xanthism');
}

console.log('philosophies.check.mjs: all assertions passed');
