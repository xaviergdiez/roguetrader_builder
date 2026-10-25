// Self-check for the ship's personality tables. Run: node src/shiphistory.check.mjs
import assert from 'node:assert/strict';
import {
  MACHINE_SPIRIT_ODDITIES, PAST_HISTORIES,
  oddityById, historyById, oddityForRoll, historyForRoll,
  rollShipPersonality, readHistory, describeHistory, EMPTY_HISTORY,
  MOD_KEYS, historyMods, describeMods, entriesOf, describeConditional
} from './shiphistory.js';
import { stats, newVitals, budget, powerUsed } from './ship.js';

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

/* ---- every entry states what it does ---- */

// Transcribed from Tables 8-1 and 8-2 of the Core Rulebook. An entry with no
// effect is the state this table shipped in before the pages were to hand,
// and must not come back: a named rule with no text is unusable at a table.
for (const e of [...MACHINE_SPIRIT_ODDITIES, ...PAST_HISTORIES]) {
  assert.ok(e.effect && e.effect.length > 40, e.id + ': needs its printed effect');
  // The printed tables use a true minus sign for penalties, and several of
  // these rules turn on the sign. A hyphen here would read as a dash.
  assert.equal(/[a-z] -\d/.test(e.effect), false,
    e.id + ': use \u2212 for a penalty, not a hyphen');
}

/* ---- only the flat half is applied, and it is applied correctly ---- */

{
  // A typo'd key would silently do nothing, so the keys are pinned.
  for (const e of [...MACHINE_SPIRIT_ODDITIES, ...PAST_HISTORIES]) {
    for (const [k, v] of Object.entries(e.mods || {})) {
      assert.ok(MOD_KEYS.includes(k), `${e.id}: unknown modifier "${k}"`);
      assert.ok(Number.isInteger(v) && v !== 0, `${e.id}: ${k} must be a non-zero integer`);
    }
  }

  // The seven entries that move a ship statistic, as printed.
  assert.deepEqual(oddityById('a_nose_for_trouble').mods, { detection: 5, armour: -1 });
  assert.deepEqual(oddityById('resolute').mods, { speed: -1, hullIntegrity: 3 });
  assert.deepEqual(oddityById('ancient_and_wise').mods, { hullIntegrity: -4 });
  assert.deepEqual(historyById('haunted').mods, { morale: -10, detection: 6 });
  assert.deepEqual(historyById('wolf_in_sheep_s_clothing').mods, { power: -2 });
  assert.deepEqual(historyById('death_cult').mods, { population: -8, moraleLossReduction: 2 });
  assert.deepEqual(historyById('wrested_from_a_space_hulk').mods,
    { armour: 1, speed: 1, manoeuvre: 3 });

  // The ones left to the GM carry no mods at all. Applying half of a rule
  // is worse than applying none, so an entry whose printed effect is a test
  // modifier, a conditional, or an adjudication stays text-only.
  for (const id of ['blasphemous_tendencies', 'martial_hubris', 'rebellious', 'stoic',
                    'skittish', 'wrothful', 'adventurous']) {
    assert.equal(oddityById(id).mods, null, id + ' is not a flat ship modifier');
  }
  for (const id of ['reliquary_of_mars', 'emissary_of_the_imperator', 'turbulent_past',
                    'temperamental_warp_engine', 'finances_in_arrears', 'xenophilous']) {
    assert.equal(historyById(id).mods, null, id + ' is not a flat ship modifier');
  }

  // Wrothful and Skittish change Speed only in combat, and Adventurous only
  // on an Endeavour, so none of them is a FLAT modifier — they carry a
  // `conditional` instead, and applying it unconditionally would be wrong.
  for (const id of ['wrothful', 'skittish', 'adventurous']) {
    assert.equal(oddityById(id).mods, null, id + ' must not be flat');
    assert.ok(oddityById(id).conditional, id + ' needs its conditional');
  }
  assert.match(oddityById('wrothful').effect, /During combat/);
  assert.match(oddityById('skittish').effect, /When in combat/);

  // Every conditional branch uses keys the engine knows, same as the flat
  // ones — a typo here would silently do nothing in the one state it matters.
  for (const e of [...MACHINE_SPIRIT_ODDITIES, ...PAST_HISTORIES]) {
    for (const [branch, m] of Object.entries(e.conditional || {})) {
      assert.ok(['inCombat', 'outOfCombat', 'inEndeavour', 'outOfEndeavour'].includes(branch),
        `${e.id}: unknown branch "${branch}"`);
      for (const [k, v] of Object.entries(m)) {
        assert.ok(MOD_KEYS.includes(k), `${e.id}.${branch}: unknown modifier "${k}"`);
        assert.ok(Number.isInteger(v) && v !== 0, `${e.id}.${branch}: ${k} must be non-zero`);
      }
    }
  }

  // Summing both rolled entries.
  assert.deepEqual(historyMods({ oddityId: 'a_nose_for_trouble', historyId: 'haunted' }),
    { detection: 11, armour: -1, morale: -10 }, 'two sources of Detection add up');
  assert.deepEqual(historyMods(null), {});
  assert.deepEqual(historyMods({}), {});
  // An unrolled half contributes nothing rather than throwing.
  assert.deepEqual(historyMods({ oddityId: 'resolute' }), { speed: -1, hullIntegrity: 3 });

  assert.equal(entriesOf({ oddityId: 'resolute', historyId: 'haunted' }).length, 2);
  assert.equal(entriesOf({ oddityId: 'ghost' }).length, 0);

  assert.equal(describeMods({ detection: 5, armour: -1 }),
    '+5 Detection, \u22121 Armour');
  assert.equal(describeMods({}), '');
  assert.equal(describeMods(null), '');
}

/* ---- the modifiers reach the ship itself ---- */

// The point of `mods` is that a Resolute ship really does sail with +3 Hull
// Integrity. If stats() stops reading the history this goes quiet, and the
// builder would show the printed rule beside a hull that ignores it.
{
  const base = { hullId: 'hull-jericho', crew: 'competent', essential: {}, weapons: [], supplemental: [] };
  const plain = stats(base);
  assert.ok(plain, 'the sample hull resolves');

  const resolute = stats({ ...base, history: { oddityId: 'resolute', historyId: null } });
  assert.equal(resolute.hullIntegrity, plain.hullIntegrity + 3);
  assert.equal(resolute.speed, plain.speed - 1);

  const nose = stats({ ...base, history: { oddityId: 'a_nose_for_trouble', historyId: null } });
  assert.equal(nose.detection, plain.detection + 5);
  assert.equal(nose.armour, plain.armour - 1);

  const hulk = stats({ ...base, history: { oddityId: null, historyId: 'wrested_from_a_space_hulk' } });
  assert.equal(hulk.armour, plain.armour + 1);
  assert.equal(hulk.speed, plain.speed + 1);
  assert.equal(hulk.manoeuvre, plain.manoeuvre + 3);

  // Haunted costs Morale permanently, which is the ship's maximum, not its
  // current figure — so a freshly built haunted ship starts at 90, not 100.
  const haunted = stats({ ...base, history: { oddityId: null, historyId: 'haunted' } });
  assert.equal(haunted.maxMorale, plain.maxMorale - 10);
  assert.equal(haunted.detection, plain.detection + 6);
  assert.equal(newVitals({ ...base, history: { oddityId: null, historyId: 'haunted' } }).morale,
    plain.maxMorale - 10, 'a haunted ship is launched already short of Morale');

  // A Death Cult costs 8 of the crew, permanently, and the ship launches
  // with that many fewer aboard rather than at a full complement.
  const cult = stats({ ...base, history: { oddityId: null, historyId: 'death_cult' } });
  assert.equal(cult.maxPopulation, 92);
  assert.equal(cult.moraleLossReduction, plain.moraleLossReduction + 2);
  assert.equal(newVitals({ ...base, history: { oddityId: null, historyId: 'death_cult' } }).population, 92);

  // And it is not counted as understaffed for having done so: the penalty is
  // for losing crew, not for having fewer berths.
  assert.equal(cult.understaffed, false, 'a full death-cult crew is not understaffed');
  assert.equal(stats({ ...base, history: { oddityId: null, historyId: 'death_cult' } },
    { population: 50 }).understaffed, true, 'but half a crew still is');

  /* ---- the conditional half, in each state ---- */

  // Wrothful is the whole point of the context: a berserker in a fight and
  // a sulk at rest, from one rolled result.
  {
    const wrothful = { oddityId: 'wrothful', historyId: null };
    assert.deepEqual(historyMods(wrothful),
      { speed: -1, manoeuvre: -5, detection: -5 }, 'at rest it sulks');
    assert.deepEqual(historyMods(wrothful, { inCombat: true }),
      { speed: 1, manoeuvre: 7 }, 'in a fight it rages');

    const atRest = stats({ ...base, history: wrothful });
    const fighting = stats({ ...base, history: wrothful }, null, { inCombat: true });
    assert.equal(fighting.speed, atRest.speed + 2, 'from -1 to +1 is two steps');
    assert.equal(fighting.manoeuvre, atRest.manoeuvre + 12);
    assert.equal(fighting.detection, atRest.detection + 5);
  }

  // Skittish flinches in combat and does nothing at rest — the travel-time
  // half is not modelled, and must not leak in as a bonus.
  {
    const skittish = { oddityId: 'skittish', historyId: null };
    assert.deepEqual(historyMods(skittish), {}, 'no voyage is tracked, so nothing applies');
    assert.deepEqual(historyMods(skittish, { inCombat: true }), { speed: -1 });
    assert.equal(stats({ ...base, history: skittish }).speed, plain.speed);
    assert.equal(stats({ ...base, history: skittish }, null, { inCombat: true }).speed,
      plain.speed - 1);
  }

  // Adventurous has no neutral state: it is +10 on an Endeavour and -10 off
  // one, and the penalty is the default.
  {
    const adv = { oddityId: 'adventurous', historyId: null };
    assert.deepEqual(historyMods(adv), { detection: -10 });
    assert.deepEqual(historyMods(adv, { inEndeavour: true }), { detection: 10 });
    assert.equal(stats({ ...base, history: adv }).detection, plain.detection - 10);
    assert.equal(stats({ ...base, history: adv }, null, { inEndeavour: true }).detection,
      plain.detection + 10);
  }

  // The two contexts are independent: a Wrothful ship on an Endeavour is
  // still only Wrothful, and combat does not switch the Endeavour on.
  {
    const both = { oddityId: 'wrothful', historyId: null };
    assert.deepEqual(historyMods(both, { inCombat: true, inEndeavour: true }),
      historyMods(both, { inCombat: true }));
  }

  // A flat modifier is unaffected by either state.
  for (const ctx of [{}, { inCombat: true }, { inEndeavour: true },
                     { inCombat: true, inEndeavour: true }]) {
    assert.deepEqual(historyMods({ oddityId: 'resolute' }, ctx),
      { speed: -1, hullIntegrity: 3 }, 'Resolute is Resolute whatever is happening');
  }

  // Both sides are readable, so the builder can show what a result costs at
  // rest as well as what it is worth in a fight.
  assert.match(describeConditional(oddityById('wrothful')), /in combat .*out of combat/);
  assert.match(describeConditional(oddityById('adventurous')), /on an Endeavour.*otherwise/);
  assert.equal(describeConditional(oddityById('resolute')), null);
  assert.equal(describeConditional(null), null);

  // An unrolled or absent history changes nothing at all.
  for (const h of [undefined, null, {}, EMPTY_HISTORY]) {
    assert.deepEqual(stats({ ...base, history: h }), plain, 'an unrolled ship is unmodified');
  }

  // The disguise draws Power from the same plant a component does.
  const disguised = { ...base, history: { oddityId: null, historyId: 'wolf_in_sheep_s_clothing' } };
  assert.equal(powerUsed(disguised), powerUsed(base) + 2);
  assert.equal(budget(disguised).powerRemaining, budget(base).powerRemaining - 2);
}

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
