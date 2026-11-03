// Self-check for legature.js and the Legate Investigator alternate rank.
// Run: node src/legature.check.mjs
import assert from 'node:assert/strict';
import { readLegature, EMPTY_LEGATURE, masterName, onTheInquisitionPath, legatureParts, LEGATE } from './legature.js';
import { alternateRanksFor, alternateRankByName, alternateAdvances, parsePrereq } from './advances.js';
import { heldNames } from './elite.js';

/* ---- the Legate Investigator, as the Inquisitor's Handbook prints it ---- */
{
  const r = alternateRankByName(LEGATE);
  assert.ok(r);
  assert.equal(r.minRank, 4);
  assert.equal(r.xp, 13000, 'where this app’s Rank IV begins');
  assert.match(r.requires, /Literacy/);
  assert.match(r.requires, /Inquisitor/, 'only if an Inquisitor offers it');
  assert.equal(r.missed, 'the printed cost plus 50 XP', 'the Handbook’s price for a missed rank');
  assert.match(r.grants, /Sigil of Question/);

  // Adept, Arbitrator, Cleric, Guardsman and Imperial Psyker, rendered as this app's careers.
  for (const c of ['Seneschal', 'Arch-Militant', 'Missionary', 'Astropath Transcendent']) {
    assert.ok(alternateRanksFor(c).some((x) => x.name === LEGATE), c + ' may take it');
  }
  for (const c of ['Explorator', 'Rogue Trader', 'Navigator', 'Void-Master']) {
    assert.equal(alternateRanksFor(c).some((x) => x.name === LEGATE), false, c + ' may not');
  }
  // A career name carrying a parenthetical still matches its base.
  assert.ok(alternateRanksFor('Seneschal (Alternate Rank: Legate Investigator)').length);

  // The table: 23 advances, 100 and 200 XP, as printed.
  const rows = alternateAdvances(LEGATE);
  assert.equal(rows.length, 23);
  assert.equal(rows.filter((a) => a.cost === 100).length, 11);
  assert.equal(rows.filter((a) => a.cost === 200).length, 12);
  assert.ok(rows.every((a) => a.rank === 4 && a.alt === LEGATE));
  assert.equal(new Set(rows.map((a) => a.name)).size, rows.length, 'no row twice');
  const names = rows.map((a) => a.name);
  for (const n of ['Ciphers (Inquisition)', 'Talented (Interrogation)', 'Air of Authority', 'Scholastic Lore (Judgement)', 'Interrogation +20']) {
    assert.ok(names.includes(n), n);
  }
  // The book prints "Interrogate" in its table; the skill is Interrogation.
  assert.equal(names.some((n) => /Interrogate/.test(n)), false);
  // Every named prerequisite is another row of the same table, so the ladder within it holds.
  for (const a of rows) {
    for (const p of parsePrereq(a.prereq).others) assert.ok(names.includes(p), `${a.name}: needs ${p}, not on the table`);
  }
  assert.equal(rows.find((a) => a.name === 'Air of Authority').prereq, 'Fel 30');
}

/* ---- the record ---- */
assert.deepEqual(EMPTY_LEGATURE, {
  ordo: '', master: '', masterName: '', learned: '', locale: '', focus: '', emblem: '',
  rosette: null, philosophy: '', forbidden: [], contacts: []
});
{
  const l = readLegature({
    ordo: 'malleus', master: 'raud', learned: 'xanthism', locale: 'Hive Valios', focus: 'The Iron Sprawl',
    emblem: 'ring', rosette: { form: 2, table: 'malleus', fn: 4 }, philosophy: 'thorian',
    forbidden: [{ ordo: 'malleus', severity: 'minor' }, { ordo: 'malleus', severity: 'minor' }, { ordo: 'eldar', severity: 'minor' }, { ordo: 'xenos', severity: 'vast' }],
    contacts: [{ name: 'Agira Chernov', faction: 'Administratum' }]
  });
  assert.equal(l.ordo, 'malleus');
  assert.equal(l.master, 'raud');
  assert.equal(l.learned, 'xanthism');
  assert.deepEqual(l.rosette, { form: 2, table: 'malleus', fn: 4 });
  assert.deepEqual(l.forbidden, [{ ordo: 'malleus', severity: 'minor' }], 'held once; unknown Ordos and weights dropped');
  assert.equal(l.contacts.length, 1);
  assert.equal(masterName(l), 'Inquisitor Alis Raud');
}
{
  const l = readLegature({ ordo: 'astartes', master: 'drake', masterName: 'Inquisitor Vespasian Kell', learned: 'nope', emblem: 'crown', rosette: 'x' });
  assert.equal(l.ordo, '');
  assert.equal(l.master, '', 'not one of the six');
  assert.equal(masterName(l), 'Inquisitor Vespasian Kell', 'the table’s own is kept as typed');
  assert.equal(l.learned, '');
  assert.equal(l.emblem, '');
  assert.equal(l.rosette, null);
}
assert.equal(readLegature(null).contacts.length, 0);
// Typing is not trimmed away mid-word: a read on every keystroke must keep the space.
assert.equal(readLegature({ locale: 'Hive ' }).locale, 'Hive ');

/* ---- when the panel shows, and which parts ---- */
assert.equal(onTheInquisitionPath([]), false);
assert.equal(onTheInquisitionPath(['Executioner', 'Command']), false);
assert.equal(onTheInquisitionPath(heldNames({ altRank: LEGATE })), true, 'the alternate rank');
assert.equal(onTheInquisitionPath(['Legate Investigator']), true, 'an older sheet’s Elite Advance');
assert.equal(onTheInquisitionPath(['Forbidden Knowledge']), true, 'the Radical’s rung alone');
assert.equal(onTheInquisitionPath(['Canvass the Locale']), true, 'the craft');
assert.deepEqual(legatureParts(['Legate Investigator', 'Cell Handler']),
  { legate: true, interrogator: false, rosette: false, handler: true, forbidden: false });
assert.deepEqual(legatureParts(['Interrogator', 'Inquisitorial Rosette']),
  { legate: false, interrogator: true, rosette: true, handler: false, forbidden: false });

console.log('legature.js OK');
