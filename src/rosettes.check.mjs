// Self-check for rosettes.js. Run: node src/rosettes.check.mjs
import assert from 'node:assert/strict';
import {
  ROSETTE_FORMS, ROSETTE_TABLES, ROSETTE_FUNCTIONS, EMBLEMS, emblemById, ADVANTAGE, DISADVANTAGE, MEDIUM_M, ZONE_M,
  rosetteForm, rosetteFunction, readRosette, rollRosette, describeRosette, tableById
} from './rosettes.js';
import { ORDOS } from './inquisition.js';

/* ---- the book's shape: a d10 of forms, a d10 of functions per table ---- */
assert.equal(ROSETTE_FORMS.length, 10);
assert.deepEqual(ROSETTE_TABLES.map((t) => t.id), ['hereticus', 'malleus', 'xenos', 'universal']);
// Every Ordo the app knows has its own table, so an Inquisitor always has one to roll on.
for (const o of ORDOS) assert.ok(ROSETTE_FUNCTIONS[o.id], o.id + ' has no rosette table');
for (const t of ROSETTE_TABLES) {
  const rows = ROSETTE_FUNCTIONS[t.id];
  assert.equal(rows.length, 5, t.id + ': five results, two numbers each');
  // Every number 1-10 lands on exactly one result.
  for (let n = 1; n <= 10; n++) {
    assert.equal(rows.filter((f) => n >= f.from && n <= f.to).length, 1, `${t.id}: ${n} lands once`);
  }
  for (const f of rows) {
    assert.ok(f.name && f.text, `${t.id} ${f.from}: incomplete`);
    // Converted to this app: none of Imperium Maledictum's own terms survive.
    assert.doesNotMatch(f.text, /\bSL\b|Advantage|Warp Charge|Discipline|Fortitude|Psychic Mastery|\bZone\b|Medium Range|Rend/,
      `${t.id} ${f.from}: still in Imperium Maledictum's terms`);
  }
}

/* ---- the conversions are stated once and used ---- */
assert.equal(ADVANTAGE, 20);
assert.equal(DISADVANTAGE, -20);
assert.equal(MEDIUM_M, 40, 'the same 40 metres imconvert.js gives Medium range');
assert.equal(ZONE_M, 10);
assert.match(rosetteFunction('hereticus', 1).text, /\+20 to a Psyniscience Test/);
assert.match(rosetteFunction('malleus', 3).text, /Focus Power Test is at −20/);
assert.match(rosetteFunction('xenos', 7).text, /within 40 metres/);
assert.match(rosetteFunction('universal', 10).text, /within 10 metres/);
// The two that leaned on Warp Charge read in this app's psychic rules instead.
assert.match(rosetteFunction('hereticus', 5).text, /Psychic Phenomena/);
assert.match(rosetteFunction('malleus', 6).text, /Psy Rating|Daemonic/);

/* ---- lookups clamp, so a stray number still names a result ---- */
assert.equal(rosetteForm(1), ROSETTE_FORMS[0]);
assert.equal(rosetteForm(10), ROSETTE_FORMS[9]);
assert.equal(rosetteForm(0), ROSETTE_FORMS[0]);
assert.equal(rosetteForm(99), ROSETTE_FORMS[9]);
assert.equal(rosetteFunction('hereticus', 2).from, 1);
assert.equal(rosetteFunction('hereticus', 9).from, 9);
assert.equal(rosetteFunction('nobody', 3), null);
assert.equal(tableById('universal').name, 'Any Ordo');

/* ---- a stored rosette is its rolls, and only a real one reads ---- */
assert.equal(readRosette(null), null);
assert.equal(readRosette({ form: 3, table: 'nowhere', fn: 2 }), null, 'an unknown table is no rosette');
assert.deepEqual(readRosette({ form: '4', table: 'malleus', fn: 12, extra: 'x' }), { form: 4, table: 'malleus', fn: 10 });

{
  const seq = [0.0, 0.95];
  let i = 0;
  const rng = () => seq[i++ % seq.length];
  assert.deepEqual(rollRosette({ table: 'xenos', rng }), { form: 1, table: 'xenos', fn: 10 });
  assert.equal(rollRosette({ table: 'bogus', rng: () => 0.5 }).table, 'universal', 'an unknown table rolls on Any Ordo');
}

{
  const d = describeRosette({ form: 3, table: 'malleus', fn: 6 });
  assert.match(d.form, /black marble/i);
  assert.equal(d.table, 'Ordo Malleus');
  assert.equal(d.fn.name, 'Null-rod core');
  assert.equal(describeRosette({}), null);
}

/* ---- what an agent carries instead ---- */
assert.ok(EMBLEMS.length >= 5);
assert.equal(new Set(EMBLEMS.map((e) => e.id)).size, EMBLEMS.length);
assert.match(emblemById('medallion').name, /sigil/, 'the Legature’s Sigil of Question is the first');
assert.equal(emblemById('nope'), null);

console.log('rosettes.js OK (%d forms, %d tables)', ROSETTE_FORMS.length, ROSETTE_TABLES.length);
