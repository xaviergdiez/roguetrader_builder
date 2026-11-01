// Self-check for the Lore tab's catalogue. Run: node src/codex.check.mjs
import assert from 'node:assert/strict';
import { buildCodex, searchCodex, sectionCounts, SECTIONS, CODEX_NOTE } from './codex.js';
import { DIFFICULTIES } from './dice.js';
import { movementFor } from './movement.js';
import { hitLocation, DAMAGE_TYPES, LOCATIONS, critRow } from './crits.js';
import { SHOCK_TABLE, TRAUMA_TABLE, insanityTrack, corruptionTrack } from './sanity.js';
import { ACTIONS, GROUND_CONDITIONS } from './groundcombat.js';
import { EXTENDED_ACTIONS, PHASES } from './voidcombat.js';
import { SKILLS, TALENTS, POWERS } from './glossary.js';

const codex = buildCodex();
const byId = (id) => codex.find((e) => e.id === id);

/* ---- shape ---- */
assert.ok(codex.length > 120, 'a real catalogue, not a stub');
assert.equal(new Set(codex.map((e) => e.id)).size, codex.length, 'every entry has an id of its own');
const sections = new Set(SECTIONS.map((s) => s.id));
for (const e of codex) {
  assert.ok(sections.has(e.section), `${e.id}: its section is listed`);
  assert.ok(e.title && e.tag, `${e.id}: a title and a tag`);
  assert.ok(e.body || e.rows.length, `${e.id}: says something`);
  assert.ok(e.id.startsWith(e.section + ':'), `${e.id}: id carries its section`);
  for (const r of e.rows) assert.ok(Array.isArray(r) && r.length === 2 && r.every((x) => typeof x === 'string' && x), `${e.id}: rows are [label, text]`);
  assert.ok(!/undefined|NaN|\[object/.test(JSON.stringify(e)), `${e.id}: nothing half-built showed through`);
}
const counts = sectionCounts(codex);
for (const s of SECTIONS) assert.ok(counts[s.id] > 0, `${s.id} is not empty`);
assert.ok(/not the rulebook/.test(CODEX_NOTE), 'the page says it is a summary');

/* ---- every figure is the code's own ---- */
assert.deepEqual(byId('tests:difficulty').rows.map((r) => r[0]), DIFFICULTIES.map((d) => d.label));
assert.deepEqual(byId('tests:difficulty').rows.map((r) => Number(r[1].replace('−', '-'))), DIFFICULTIES.map((d) => d.mod));

// Movement: the multipliers on the page are the ones movementFor applies.
{
  const m = movementFor(7);
  const mult = { 'Half Move': 1, 'Full Move': 2, Charge: 3, Run: 6 };
  const rows = Object.fromEntries(byId('combat:movement').rows);
  assert.equal(rows['Half Move'], 'AB');
  assert.equal(m.halfMove, 7 * mult['Half Move']);
  assert.equal(m.fullMove, 7 * mult['Full Move']);
  assert.equal(m.charge, 7 * mult.Charge);
  assert.equal(m.run, 7 * mult.Run);
  assert.equal(m.jump, Math.floor(7 / 2));
  assert.equal(m.leap, 7);
  assert.equal(rows['Full Move'], '2 × AB');
  assert.equal(rows.Charge, '3 × AB');
  assert.equal(rows.Run, '6 × AB');
}

// Hit location: the bands on the page are the ones hitLocation reads, for every roll.
{
  const bands = byId('combat:hit-location').rows.map(([range, name]) => {
    const [lo, hi] = range.split('–').map(Number);
    return { lo, hi: hi === 0 ? 100 : hi, name };
  });
  assert.equal(bands.length, LOCATIONS.length);
  for (let roll = 1; roll <= 100; roll++) {
    const where = hitLocation(roll);                       // reads the REVERSED roll
    const reversed = where.roll;
    const band = bands.find((b) => reversed >= b.lo && reversed <= b.hi);
    assert.ok(band, `reversed roll ${reversed} has a band`);
    assert.equal(band.name, where.name, `roll ${roll}`);
  }
}

// Critical damage: ten rows for each of 4 types x 4 places, each the table's own row.
{
  const tables = codex.filter((e) => e.section === 'crits');
  assert.equal(tables.length, DAMAGE_TYPES.length * 4);
  for (const t of tables) assert.equal(t.rows.length, 10, `${t.id} has ten rows`);
  const head = byId('crits:energy-head');
  assert.ok(head.rows[0][1].startsWith(critRow('energy', 'head', 1).effect));
  assert.ok(head.rows[9][1].includes('dead') || /gone|vaporised/i.test(head.rows[9][1]), 'row 10 is death');
  assert.ok(byId('crits:impact-leg').body.startsWith('Either leg'), 'a leg is either leg');
  assert.ok(byId('crits:impact-body').body.startsWith('A hit to the body'));
}

// The Shock and Trauma tables: contiguous bands, the table's own text.
for (const [id, table] of [['mind:shock', SHOCK_TABLE], ['mind:trauma', TRAUMA_TABLE]]) {
  const rows = byId(id).rows;
  assert.equal(rows.length, table.length, `${id}: a row each`);
  rows.forEach((r, i) => assert.equal(r[1], table[i].text, `${id} row ${i}`));
  assert.ok(/^01–/.test(rows[0][0]), `${id} starts at 01`);
  assert.ok(/^\d+\+$/.test(rows[rows.length - 1][0]), `${id} ends open`);
  for (let i = 1; i < rows.length - 1; i++) {
    const prevHi = Number(rows[i - 1][0].split('–')[1]);
    assert.equal(Number(rows[i][0].split('–')[0]), prevHi + 1, `${id}: no gap before row ${i}`);
  }
}

// Insanity and Corruption tracks quote the degrees the sheet shows.
for (const r of byId('mind:insanity').rows) {
  const pts = parseInt(r[0], 10);
  assert.ok(r[1].startsWith(insanityTrack(pts).degree), `insanity at ${pts}`);
}
for (const r of byId('mind:corruption').rows) {
  const pts = parseInt(r[0], 10);
  assert.ok(r[1].startsWith(corruptionTrack(pts).degree), `corruption at ${pts}`);
}
assert.ok(byId('mind:insanity').rows.some((r) => /no modifier/.test(r[1])), 'a zero modifier is said as none');

// Actions, conditions, ship actions and the glossary come across whole.
assert.equal(codex.filter((e) => e.section === 'combat' && e.tag !== 'Table' && e.tag !== 'Core rule').length, ACTIONS.length);
for (const a of ACTIONS) assert.ok(codex.some((e) => e.title === a.name && e.body === a.effect), `${a.name}`);
assert.equal(counts.conditions, GROUND_CONDITIONS.length);
assert.ok(byId('conditions:on-fire').rows[0][1].startsWith('1d10'), 'On Fire carries its damage per round');
assert.ok(byId('conditions:blood-loss').rows[0][1].startsWith('1 Wound'), 'and Blood Loss its own');
assert.equal(counts.void, EXTENDED_ACTIONS.length + 2, 'every ship action, the turn, and evasion');
assert.deepEqual(byId('void:turn').rows.length, PHASES.length);
assert.equal(counts.skills, Object.keys(SKILLS).length);
assert.ok(counts.talents >= Object.keys(TALENTS).length + Object.keys(POWERS).length, 'talents and powers');
assert.ok(byId('void:hold-fast').rows.some((r) => r[0] === 'Station' && /Captain/i.test(r[1])), 'stations are named, not ids');
assert.ok(!codex.some((e) => /lordcaptain|firstofficer/.test(JSON.stringify(e))), 'no raw role ids on the page');

/* ---- finding things ---- */
assert.equal(searchCodex(codex, '').length, codex.length, 'no query is everything, in order');
assert.equal(searchCodex(codex, '   ').length, codex.length);
assert.equal(searchCodex(codex, 'zzzzqq').length, 0, 'nothing is nothing');
assert.equal(searchCodex(codex, 'pinned')[0].id, 'conditions:pinned', 'the thing itself before things that mention it');
assert.ok(searchCodex(codex, 'pinned').length > 3, 'and those that mention it after');
assert.equal(searchCodex(codex, 'on fire')[0].id, 'conditions:on-fire', 'two words, one title');
assert.ok(searchCodex(codex, 'blood loss').every((e) => /blood/i.test(JSON.stringify(e)) && /loss/i.test(JSON.stringify(e))), 'every word has to be there');
assert.equal(searchCodex(codex, 'PINNED')[0].id, 'conditions:pinned', 'case does not matter');
assert.ok(searchCodex(codex, 'pin', 'combat').every((e) => e.section === 'combat'), 'a section narrows it');
assert.equal(searchCodex(codex, '', 'skills').length, counts.skills, 'a section alone lists it');
assert.equal(searchCodex(codex, 'dodge', 'void').length, 0);
assert.equal(searchCodex(codex, 'willpower')[0] != null, true);
assert.ok(searchCodex(codex, 'fear')[0].title === 'Fear' || searchCodex(codex, 'fear')[0].title.startsWith('Fear'), 'Fear leads');

console.log('codex checks passed');
