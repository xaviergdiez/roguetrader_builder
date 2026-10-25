// Self-check for the bestiary lookup. Run: node src/bestiaryindex.check.mjs
import assert from 'node:assert/strict';
import {
  BESTIARY_INDEX, TYPES, indexEntry, citation, searchBestiary, indexToNpc
} from './bestiaryindex.js';
import { BESTIARY, bestiaryToNpc } from './npcgen.js';

/* ---- the data is well formed ---- */

assert.ok(BESTIARY_INDEX.length > 250, 'the index should carry hundreds of creatures');

{
  const names = BESTIARY_INDEX.map((e) => e.name);
  assert.equal(new Set(names).size, names.length,
    'a creature printed in two books is ONE entry with two sources');

  for (const e of BESTIARY_INDEX) {
    assert.ok(e.name && e.type && e.affiliation, 'incomplete entry: ' + JSON.stringify(e));
    assert.ok(Array.isArray(e.sources) && e.sources.length > 0, e.name + ': no source');
    for (const s of e.sources) {
      assert.ok(s.book, e.name + ': a source with no book');
      if ('page' in s) {
        assert.ok(Number.isInteger(s.page) && s.page > 0, e.name + ': bad page ' + s.page);
      }
    }
    // The generator unescapes HTML entities; a stray one means it regressed.
    assert.equal(/&(amp|#\d+|quot|lt|gt);/.test(e.name + e.affiliation), false,
      e.name + ': unescaped HTML entity');
  }
}

/* ---- starships and vehicles are deliberately absent ---- */

// The app builds voidships from hulls and components, and a tank is not a
// boarding-action combatant. Letting either in would put something in the
// hostile picker that the ground-combat engine cannot resolve at all.
for (const e of BESTIARY_INDEX) {
  assert.notEqual(e.type, 'Starship', e.name + ' is a ship, not a combatant');
  assert.notEqual(e.type, 'Vehicle', e.name + ' is a vehicle, not a combatant');
}
assert.ok(TYPES.includes('Xenos') && TYPES.includes('Human') && TYPES.includes('Daemon'));

/* ---- lookup ---- */

{
  const a = indexEntry('Abomination');
  assert.ok(a, 'a known creature resolves');
  assert.equal(a.type, 'Xenos');
  assert.match(citation(a), /Koronus Bestiary p\. \d+/);

  // Case-insensitive, like the stat-carrying bestiary next door.
  assert.equal(indexEntry('ABOMINATION').name, 'Abomination');
  assert.equal(indexEntry('  nothing here  '), null);
  assert.equal(indexEntry(null), null);
  assert.equal(indexEntry(undefined), null);

  assert.equal(citation(null), '');
  assert.equal(citation({ sources: [] }), '');
  assert.equal(citation({ sources: [{ book: 'A', page: 1 }, { book: 'B', page: 2 }] }),
    'A p. 1; B p. 2', 'a creature in two books cites both');
  assert.equal(citation({ sources: [{ book: 'Only a book' }] }), 'Only a book');
}

/* ---- search ---- */

{
  // An empty query with no filter returns nothing rather than all 294 —
  // the caller renders every hit.
  assert.deepEqual(searchBestiary(''), []);
  assert.deepEqual(searchBestiary(null), []);

  const rak = searchBestiary('rak');
  assert.ok(rak.length > 0, 'searching an affiliation finds its creatures');
  assert.ok(rak.length <= 40, 'results are capped');

  // Name and affiliation are both searchable.
  assert.ok(searchBestiary('abomination').some((e) => e.name === 'Abomination'));

  // The type filter works on its own, and narrows a query.
  const daemons = searchBestiary('', { type: 'Daemon' });
  assert.ok(daemons.length > 0 && daemons.every((e) => e.type === 'Daemon'));
  assert.ok(searchBestiary('a', { type: 'Beast' }).every((e) => e.type === 'Beast'));

  // The cap is honoured whichever way it is reached.
  assert.ok(searchBestiary('a', { limit: 5 }).length <= 5);
  assert.ok(searchBestiary('', { type: 'Xenos', limit: 3 }).length <= 3);

  // A type nobody has does not throw.
  assert.deepEqual(searchBestiary('', { type: 'Starship' }), []);
}

/* ---- what reaches the board ---- */

{
  const npc = indexToNpc('Abomination');
  assert.equal(npc.name, 'Abomination');
  // THE POINT: the index has no numbers, so neither does this. An entry
  // that arrived with invented characteristics would be worse than one that
  // arrives blank — a GM would have no way to tell it was made up. Absent
  // is 0 here, the same convention bestiary.js uses for a printed dash.
  assert.equal(npc.ws, 0);
  assert.equal(npc.bs, 0);
  assert.equal(npc.armour, 0);
  assert.equal(npc.toughnessBonus, 0);
  assert.equal(npc.custom, true, 'it must declare itself as needing the book');
  assert.match(npc.note, /p\. \d+/, 'and it must say which page');
  assert.equal(indexToNpc('nothing here'), null);

  // One spelling of "nothing on file" across both halves of the app, so
  // the board and the difficulty reckoning treat them alike.
  for (const b of BESTIARY) {
    for (const k of ['ws', 'bs', 'armour', 'toughnessBonus']) {
      assert.notEqual(b[k], null,
        `${b.name}.${k} is null; the index spells absent as 0 and so should this`);
    }
  }
  const adjudicated = BESTIARY.find((b) => b.custom && !b.ws && !b.bs);
  if (adjudicated) {
    const handRolled = bestiaryToNpc(adjudicated.name);
    for (const k of ['ws', 'bs', 'armour', 'toughnessBonus', 'custom']) {
      assert.deepEqual(npc[k], handRolled[k],
        `index and bestiary disagree on ${k} (compared against ${adjudicated.name})`);
    }
  }
}

/* ---- the two bestiaries are different things, and say so ---- */

{
  // npcgen's BESTIARY carries numbers and can be spawned ready to fight.
  // This index cannot. A name in both is fine — they answer different
  // questions — but the stat-carrying one must win where they overlap, or a
  // GM would get a blank placeholder for a creature the app can roll.
  const statted = BESTIARY.filter((b) => !b.custom).map((b) => b.name);
  assert.ok(statted.length > 0);
  for (const name of statted) {
    if (!indexEntry(name)) continue;
    const npc2 = bestiaryToNpc(name);
    // "Has numbers" is not "has a Weapon Skill": the Crystalwisp has no WS
    // at all because it only ever shoots, and a creature like that is still
    // perfectly spawnable. What matters is that SOMETHING is on file.
    const usable = npc2.max > 1
      || [npc2.ws, npc2.bs, npc2.armour, npc2.toughnessBonus].some((v) => v !== null);
    assert.ok(usable, name + ': prefer the entry that has numbers');
  }
}

console.log('bestiaryindex.js OK (%d creatures, %d types, %d books)',
  BESTIARY_INDEX.length, TYPES.length,
  new Set(BESTIARY_INDEX.flatMap((e) => e.sources.map((s) => s.book))).size);
