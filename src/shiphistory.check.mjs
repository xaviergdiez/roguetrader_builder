// Self-check for the ship's personality tables. Run: node src/shiphistory.check.mjs
import assert from 'node:assert/strict';
import {
  MACHINE_SPIRIT_ODDITIES, PAST_HISTORIES,
  oddityById, historyById, oddityForRoll, historyForRoll,
  rollShipPersonality, readHistory, describeHistory, EMPTY_HISTORY
} from './shiphistory.js';

/* ---- both tables are complete 1d10 tables ---- */

// A gap would mean a roll that produces nothing at the table, and an
// overlap would mean two results for one roll. Either is a silent bug the
// GM only finds mid-session.
for (const [label, table] of [['oddities', MACHINE_SPIRIT_ODDITIES],
                              ['histories', PAST_HISTORIES]]) {
  assert.equal(table.length, 10, label + ': 1d10 needs ten entries');
  for (let r = 1; r <= 10; r++) {
    const hits = table.filter((e) => e.roll === r);
    assert.equal(hits.length, 1, `${label}: roll ${r} matched ${hits.length} entries`);
  }
  const ids = table.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, label + ': duplicate id');
  for (const e of table) {
    assert.ok(e.name && e.id, label + ': incomplete entry');
    assert.ok(Number.isInteger(e.page), e.id + ': needs a page reference');
  }
}

/* ---- the names are the printed ones ---- */

// Quoted from Fantasy Flight's own Drydock supplement, which prints both
// tables' entries in roll order. Pinned here so a later edit that "tidies"
// a name — "Wrothful" into "Wrathful", say, which is how half the fan
// transcriptions spell it — fails rather than quietly diverging from the book.
assert.deepEqual(MACHINE_SPIRIT_ODDITIES.map((e) => e.name), [
  'A Nose for Trouble', 'Blasphemous Tendencies', 'Martial Hubris',
  'Rebellious', 'Stoic', 'Skittish', 'Wrothful', 'Resolute',
  'Adventurous', 'Ancient and Wise'
]);
assert.deepEqual(PAST_HISTORIES.map((e) => e.name), [
  'Reliquary of Mars', 'Haunted', 'Emissary of the Imperator',
  'Wolf in Sheep’s Clothing', 'Turbulent Past', 'Death Cult',
  'Wrested from a Space Hulk', 'Temperamental Warp Engine',
  'Finances in Arrears', 'Xenophilous'
]);

// The page references are the two the book prints these tables on.
assert.ok(MACHINE_SPIRIT_ODDITIES.every((e) => e.page === 197));
assert.ok(PAST_HISTORIES.every((e) => e.page === 198));

/* ---- effects are deliberately empty, not forgotten ---- */

// This is the one place in the app that names a rule without stating what it
// does. The gap is deliberate: the effects are not in any source worth
// trusting, and inventing them would put fan numbers on screen in an app
// that quotes the book everywhere else. The assertion is here so that
// filling them in is a conscious act — whoever types the first effect in
// from pp. 197-198 updates this check and says where it came from.
assert.ok(MACHINE_SPIRIT_ODDITIES.every((e) => e.effect === ''),
  'effects are unsourced: fill them from the Core Rulebook, then update this check');
assert.ok(PAST_HISTORIES.every((e) => e.effect === ''),
  'effects are unsourced: fill them from the Core Rulebook, then update this check');

/* ---- lookup ---- */

assert.equal(oddityById('stoic').name, 'Stoic');
assert.equal(historyById('haunted').name, 'Haunted');
assert.equal(oddityById('nonsense'), null);
assert.equal(historyById(null), null);

assert.equal(oddityForRoll(7).name, 'Wrothful');
assert.equal(historyForRoll(1).name, 'Reliquary of Mars');
// Off the table is a caller bug, not a near miss.
assert.equal(oddityForRoll(0), null);
assert.equal(oddityForRoll(11), null);

/* ---- rolling ---- */

{
  // Scripted dice: first call the oddity, second the history.
  const scripted = (xs) => { let i = 0; return () => xs[i++]; };
  assert.deepEqual(rollShipPersonality(scripted([5, 2])),
    { oddityId: 'stoic', historyId: 'haunted' });

  // Every pairing is reachable and well formed.
  for (let a = 1; a <= 10; a++) {
    for (let b = 1; b <= 10; b++) {
      const r = rollShipPersonality(scripted([a, b]));
      assert.ok(oddityById(r.oddityId), `oddity roll ${a} produced nothing`);
      assert.ok(historyById(r.historyId), `history roll ${b} produced nothing`);
    }
  }

  // The default dice stay on the tables.
  for (let i = 0; i < 200; i++) {
    const r = rollShipPersonality();
    assert.ok(oddityById(r.oddityId) && historyById(r.historyId));
  }
}

/* ---- a blueprint saved before this existed still opens ---- */

// Same rule readBlueprint already follows: absent is defaulted, never
// trusted. A stored id that no longer exists is dropped rather than kept as
// a dangling reference the UI would render as blank.
assert.deepEqual(readHistory(undefined), EMPTY_HISTORY);
assert.deepEqual(readHistory(null), EMPTY_HISTORY);
assert.deepEqual(readHistory({}), EMPTY_HISTORY);
assert.deepEqual(readHistory({ oddityId: 'ghost', historyId: 'haunted' }),
  { oddityId: null, historyId: 'haunted' });
assert.deepEqual(readHistory({ oddityId: 'stoic', historyId: 'haunted' }),
  { oddityId: 'stoic', historyId: 'haunted' });

/* ---- what the sheet prints ---- */

assert.equal(describeHistory(null), null, 'an unrolled ship says nothing');
assert.equal(describeHistory({}), null);
assert.equal(describeHistory({ oddityId: 'stoic', historyId: 'haunted' }).line,
  'Stoic · Haunted');
// Half-rolled still reads, rather than printing a stray separator.
assert.equal(describeHistory({ oddityId: 'stoic' }).line, 'Stoic');
assert.equal(describeHistory({ historyId: 'haunted' }).line, 'Haunted');

console.log('shiphistory.js OK (%d oddities, %d histories)',
  MACHINE_SPIRIT_ODDITIES.length, PAST_HISTORIES.length);
