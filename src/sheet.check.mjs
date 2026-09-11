// Self-check for the sheet importer. Run: node src/sheet.check.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  matchOption, looksFlattened, FLATTENED_MESSAGE,
  parseCsv, parseCharacterSheet, splitEntries, sheetIdFrom
} from './sheet.js';

/* ---- slash-separated alternatives resolve to an exact option ---- */
{
  const homes = [{ id: 'imperial', name: 'Imperial World' }, { id: 'forge', name: 'Forge World' }];

  assert.equal(matchOption(homes, 'Imperial World').id, 'imperial');
  // real values off the pre-made sheets
  assert.equal(matchOption(homes, 'Mind-Cleansed/Imperial World').id, 'imperial');
  assert.equal(matchOption(homes, 'Imperial World / notes').id, 'imperial');

  // Only an EXACT match on one side counts — a near miss must stay unmatched
  // rather than be guessed at, or a character silently gets the wrong origin.
  assert.equal(matchOption(homes, 'Mind-Cleansed'), null);
  assert.equal(matchOption(homes, 'Imperial'), null);
  assert.equal(matchOption(homes, 'Hive World/Death World'), null);
  assert.equal(matchOption(homes, ''), null);
  assert.equal(matchOption([], 'Imperial World'), null);
}

/* ---- decimals from an .xlsx export are not multiplied by ten ---- */
{
  const steps = { home: [], birthright: [], lure: [], trials: [], motivation: [], career: [] };
  const rows = [
    ['# — FINAL CHARACTERISTICS —', ''],
    ['Weapon Skill', '28.0'], ['Ballistic Skill', '35.0'], ['Strength', '31.0'],
    ['Toughness', '38.0'], ['Agility', '33.0'], ['Intelligence', '38.0'],
    ['Perception', '36.0'], ['Willpower', '48.0'], ['Fellowship', '28.0'],
    ['# — DERIVED —', ''],
    ['Final wounds', '12.0'], ['Final fate points', '3.0'], ['Psy rating', '3.0'],
    ['XP total', '5,000 XP'], ['Name', 'Sanctioned Psyker']
  ];
  const { state } = parseCharacterSheet(rows, { steps });

  assert.deepEqual(state.finalTotals, {
    ws: 28, bs: 35, s: 31, t: 38, ag: 33, int: 38, per: 36, wp: 48, fel: 28
  }, 'a trailing .0 must not become a trailing zero');
  assert.equal(state.finalWounds, 12);
  assert.equal(state.finalFate, 3);
  assert.equal(state.psyRating, 3);
  assert.equal(state.xp, 5000, 'thousands separators are still dropped');
}

/* ---- a flattened tab is detected, not half-parsed ---- */
{
  const flat = [[
    'Field # — IDENTITY — Name Career Concept Role in crew XP total '
    + '# — ORIGIN PATH — Home World Birthright Lure of the Void Trials Motivation',
    'Value Inquisitorial Agent Seneschal Spymaster Imperial World Savant'
  ], ['Weapon Skill', '32']];
  assert.equal(looksFlattened(flat), true);

  // A healthy sheet must never trip it, including a long prose note.
  assert.equal(looksFlattened([['Name', 'Magos'], ['Home World', 'Forge World']]), false);
  assert.equal(looksFlattened([['Secret', 'x'.repeat(400)]]), false);
  assert.equal(looksFlattened([]), false);
  assert.equal(looksFlattened(null), false);

  const { state, warnings } = parseCharacterSheet(flat, { steps: {} });
  assert.equal(state, null, 'a flattened sheet yields no character');
  assert.deepEqual(warnings, [FLATTENED_MESSAGE]);
}
/* --- CSV parsing -------------------------------------------------------- */

assert.deepEqual(parseCsv('a,b,c'), [['a', 'b', 'c']]);
assert.deepEqual(parseCsv('a,b\r\nc,d'), [['a', 'b'], ['c', 'd']], 'CRLF, as Sheets exports');
assert.deepEqual(parseCsv('a,"b,c",d'), [['a', 'b,c', 'd']], 'a quoted comma is one field');
assert.deepEqual(parseCsv('a,"say ""hi""",c'), [['a', 'say "hi"', 'c']]);
assert.deepEqual(parseCsv('a,"line\nbreak",c'), [['a', 'line\nbreak', 'c']]);
assert.deepEqual(parseCsv('a,b\n'), [['a', 'b']], 'trailing newline is not a row');
assert.deepEqual(parseCsv(''), []);

/* --- entry splitting ---------------------------------------------------- */

assert.deepEqual(splitEntries('A; B; C'), ['A', 'B', 'C']);
assert.deepEqual(splitEntries('A, B, C'), ['A', 'B', 'C']);
// the case that breaks a naive split: a specialisation list inside parentheses
assert.deepEqual(splitEntries('Common Lore (Imperium, Underworld), Deceive'),
  ['Common Lore (Imperium, Underworld)', 'Deceive']);
assert.deepEqual(splitEntries('Speak Language (High Gothic, Low Gothic).'),
  ['Speak Language (High Gothic, Low Gothic)']);
assert.deepEqual(splitEntries(''), []);

const catalog = {
  steps: {
    home: [{ id: 'death', name: 'Death World' }, { id: 'void', name: 'Void Born' },
      { id: 'forge', name: 'Forge World' }, { id: 'hive', name: 'Hive World' },
      { id: 'imperial', name: 'Imperial World' }, { id: 'noble', name: 'Noble Born' }],
    birthright: [{ id: 'savant', name: 'Savant' }, { id: 'scavenger', name: 'Scavenger' }],
    lure: [{ id: 'renegade', name: 'Renegade' }, { id: 'zealot', name: 'Zealot' }],
    trials: [{ id: 'calamity', name: 'Calamity' }, { id: 'dv', name: 'Dark Voyage' }],
    motivation: [{ id: 'endurance', name: 'Endurance' }],
    career: [{ id: 'explorator', name: 'Explorator' }]
  }
};

/* --- TEMPLATE format: the shipped blank ---------------------------------- */

const csv = fs.readFileSync('character-template.csv', 'utf8');
const tpl = parseCharacterSheet(parseCsv(csv), catalog);

assert.equal(tpl.state.name, 'Magos Linus-Theta 7');
assert.deepEqual(tpl.state.sel, {
  home: 'forge', birthright: 'savant', lure: 'renegade',
  trials: 'calamity', motivation: 'endurance', career: 'explorator'
});
assert.equal(tpl.state.choices.fw_purpose, 'Intelligence');
assert.equal(tpl.state.choices.cl, 'Hardy');
// template characteristics are ROLLS, and must not be read as finals
assert.equal(tpl.state.rolls.int, 42);
assert.equal(tpl.state.finalTotals, null, 'a template sheet has no final characteristics');
assert.equal(tpl.state.woundRoll, 3);
assert.equal(tpl.state.fateRoll, 2);
assert.equal(tpl.state.xp, 5000);
assert.deepEqual(tpl.state.extras.skills, ['Barter (Fel)']);
assert.deepEqual(tpl.warnings, [], 'the shipped template must import cleanly');

/* --- CONVERTED format: a real premade tab -------------------------------- */

// trimmed from the live sheet, keeping every distinguishing feature
const converted = `Field,Value
# — IDENTITY —,
Name,The Heretek Tech-Acolyte
Career,Explorator (Alternate Rank: Acolyte of Abraxas)
Role in crew,Archeotech specialist who integrates alien relics.
XP total,"5,000 XP"
Portrait URL,
# — ORIGIN PATH —,blank where the character has none (xenos)
Home World,Forge World
Birthright,Savant
Lure of the Void,Renegade
Trials,Dark Voyage
Motivation,Endurance
Career (origin step),Explorator
Origin path choices,Renegade: Dark Visionary
# — FINAL CHARACTERISTICS —,already include origin modifiers and advances — do NOT reapply
Weapon Skill,32
Ballistic Skill,36
Strength,38
Toughness,42
Agility,30
Intelligence,46
Perception,35
Willpower,40
Fellowship,28
# — DERIVED —,
Final wounds,15
Final fate points,3
Psy rating,2
# — ABILITIES —,
Special ability,Unhallowed Discovery
# — SKILLS, TALENTS, WARGEAR —,semicolon separated
Skills,"Tech-Use (Int), Common Lore (Machine Cult, Tech)"
Talents,"Logis Implant, Autosanguine"
Wargear,"Boltgun, best power axe"
# — GM —,
Secret,Keeps a xenos relic hidden.
Favour owed,Owes the Navigator.
`;

const conv = parseCharacterSheet(parseCsv(converted), catalog);

// THE CRITICAL DISTINCTION: these are finals, not rolls. Routing 46 into rolls
// would make the app apply origin modifiers a second time.
assert.equal(conv.state.rolls, null, 'a converted sheet must yield no rolls');
assert.equal(conv.state.finalTotals.int, 46);
assert.equal(conv.state.finalTotals.ws, 32);
assert.equal(Object.keys(conv.state.finalTotals).length, 9);

// the origin path still resolves, so the sheet keeps its provenance
assert.deepEqual(conv.state.sel, {
  home: 'forge', birthright: 'savant', lure: 'renegade',
  trials: 'dv', motivation: 'endurance', career: 'explorator'
});
// "Career" here is a label, not the step — the step came from its own field
assert.ok(conv.state.extras.notes.some((n) => /^Career: Explorator \(Alternate Rank/.test(n)));

assert.equal(conv.state.finalWounds, 15);
assert.equal(conv.state.finalFate, 3);
assert.equal(conv.state.psyRating, 2);
assert.equal(conv.state.xp, 5000, '"5,000 XP" reads as 5000');

// comma lists with parenthesised specialisations survive intact
assert.deepEqual(conv.state.extras.skills,
  ['Tech-Use (Int)', 'Common Lore (Machine Cult, Tech)']);
assert.deepEqual(conv.state.extras.gear, ['Boltgun', 'best power axe']);

// prose with no home in state is kept as notes rather than dropped
assert.ok(conv.state.extras.notes.some((n) => /^Secret \(GM only\): /.test(n)));
assert.ok(conv.state.extras.notes.some((n) => /^Favour owed: /.test(n)));
assert.ok(conv.state.extras.notes.some((n) => /^Special ability: /.test(n)));
assert.ok(conv.state.extras.notes.some((n) => /^Origin path choices: /.test(n)));
assert.deepEqual(conv.warnings, [], 'a converted tab must import cleanly too');

/* --- failure is reported, never silent ---------------------------------- */

const bad = parseCharacterSheet(parseCsv(
  'Field,Value,Notes\nName,Test,\nHome World,Nonesuch,\nWeapon Skill,abc,\nWibble,1,\n'
), catalog);
assert.equal(bad.state.name, 'Test');
assert.ok(bad.warnings.some((w) => /not one of/.test(w)));
assert.ok(bad.warnings.some((w) => /not a number/.test(w)));
assert.ok(bad.warnings.some((w) => /Unrecognised field/.test(w)));

const partial = parseCharacterSheet(parseCsv(
  'Field,Value\nWeapon Skill,30\nToughness,35\n'
), catalog);
assert.equal(partial.state.rolls, null, 'a partial block must not be applied');
assert.ok(partial.warnings.some((w) => /Only 2 of 9/.test(w)));

// both blocks present: finals win, and the conflict is reported
const both = parseCharacterSheet(parseCsv(
  'Field,Value\n# — CHARACTERISTICS —,\n'
  + 'Weapon Skill,30\nBallistic Skill,30\nStrength,30\nToughness,30\nAgility,30\n'
  + 'Intelligence,30\nPerception,30\nWillpower,30\nFellowship,30\n'
  + '# — FINAL CHARACTERISTICS —,\n'
  + 'Weapon Skill,40\nBallistic Skill,40\nStrength,40\nToughness,40\nAgility,40\n'
  + 'Intelligence,40\nPerception,40\nWillpower,40\nFellowship,40\n'
), catalog);
assert.equal(both.state.rolls, null);
assert.equal(both.state.finalTotals.ws, 40);
assert.ok(both.warnings.some((w) => /final values win/.test(w)));

/* --- sheet ids ---------------------------------------------------------- */

const ID = '1--WboEpTvdzLeBr0b1hAnZw160oUJu_bob_V-LpEUC8';
assert.equal(sheetIdFrom(ID), ID);
assert.equal(sheetIdFrom(`https://docs.google.com/spreadsheets/d/${ID}/edit?gid=1281030354#gid=1281030354`), ID);
assert.equal(sheetIdFrom('https://evil.example.com/steal'), null);
assert.equal(sheetIdFrom('../../etc/passwd'), null);
assert.equal(sheetIdFrom('short'), null);
assert.equal(sheetIdFrom(null), null);

console.log('sheet: all checks passed');
