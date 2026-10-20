// Self-check for the compiled bestiary. Run: node src/bestiary.check.mjs
import assert from 'node:assert/strict';
import { BESTIARY, GROUPS, bestiaryEntry, byGroup, CONFLICTS } from './bestiary.js';
import { bestiaryToNpc } from './npcgen.js';
import { threatWeight, readHostile, hostileWeight } from './encounters.js';

/* ---- every entry is complete and usable ---- */

assert.ok(BESTIARY.length >= 90, 'the compiled bestiary should hold around ninety');

const CHARS = ['ws', 'bs', 's', 't', 'ag', 'int', 'per', 'wp', 'fel'];

{
  const names = BESTIARY.map((b) => b.name);
  assert.equal(new Set(names).size, names.length, 'duplicate name in the bestiary');

  const groupIds = GROUPS.map((g) => g.id);
  for (const b of BESTIARY) {
    assert.ok(b.name, 'an entry with no name');
    assert.ok(groupIds.includes(b.group), `${b.name}: unknown group "${b.group}"`);
    assert.ok(b.weapon || b.custom, `${b.name}: needs a weapon or a reason not to have one`);

    // A characteristic is a d100 score or absent. A 0 would read as a real
    // score of zero and be rolled against; absent means "the source gives
    // none", which is a different thing.
    for (const k of CHARS) {
      const v = b[k];
      assert.ok(v === null || (Number.isInteger(v) && v > 0 && v <= 100),
        `${b.name}: ${k} is ${v}`);
    }
    for (const k of ['wounds', 'toughnessBonus', 'armour']) {
      const v = b[k];
      assert.ok(v === null || (Number.isInteger(v) && v >= 0),
        `${b.name}: ${k} is ${v}`);
    }
    // Armour given per location stores the body figure and keeps the spread.
    if (b.armourNote) assert.ok(b.armour !== null, `${b.name}: an armour note with no figure`);
  }

  // Every group has something in it, or the picker shows an empty heading.
  for (const g of GROUPS) {
    assert.ok(byGroup(g.id).length > 0, g.id + ' is empty');
  }
  assert.equal(byGroup('nonsense').length, 0);
}

/* ---- lookup ---- */

assert.equal(bestiaryEntry('kaptin orlog mordakka').name, 'Kaptin Orlog Mordakka');
assert.equal(bestiaryEntry("RAK'GOL RENDER").wounds, 33);
assert.equal(bestiaryEntry('nobody here'), null);
assert.equal(bestiaryEntry(null), null);

/* ---- the figures that were transcribed by hand ---- */

// Spot-checks against the compiled master. These are the ones most likely
// to be fat-fingered: the big numbers, and the ones with brackets.
{
  const avatar = bestiaryEntry('Avatar of Khaine');
  assert.equal(avatar.wounds, 145);
  assert.equal(avatar.ws, 86);
  assert.equal(avatar.toughnessBonus, 12);

  const render = bestiaryEntry("Rak'Gol Render");
  assert.equal(render.ws, 58);
  assert.equal(render.armour, 9, 'the BODY figure is what the engine subtracts');
  assert.match(render.armourNote, /Head 6/, 'and the spread is kept for the GM');

  const guardian = bestiaryEntry('Guardian of the Inner Sanctum');
  assert.equal(guardian.wounds, 45);
  assert.equal(guardian.armour, 8);
  assert.match(guardian.armourNote, /Head 2/);

  // Toughness Bonus comes from the source's own column, which already
  // accounts for Unnatural Toughness — deriving it from the tens digit of
  // Toughness would halve it on every daemon and beast in the book.
  const fiend = bestiaryEntry('Clawed Fiend');
  assert.equal(fiend.t, 53);
  assert.equal(fiend.toughnessBonus, 10, 'Unnatural Toughness, not floor(53/10)');
  const plague = bestiaryEntry('Plaguebearer');
  assert.equal(plague.t, 55);
  assert.equal(plague.toughnessBonus, 15);
}

/* ---- a beast has no Ballistic Skill, and that is not a zero ---- */

{
  // Several creatures only ever claw. Storing 0 would make them rollable
  // ranged attackers who always miss, rather than melee-only.
  const melee = BESTIARY.filter((b) => b.bs === null);
  assert.ok(melee.length > 5, 'plenty of things in here cannot shoot');
  for (const b of melee) {
    assert.ok(b.ws !== null || b.custom, b.name + ': cannot fight at all');
  }
  // And one that only shoots.
  const wisp = bestiaryEntry('Crystalwisp');
  assert.equal(wisp.ws, null, 'the Crystalwisp has no Weapon Skill at all');
  assert.equal(wisp.bs, 64);
}

/* ---- everything reaches the board ---- */

{
  for (const b of BESTIARY) {
    const npc = bestiaryToNpc(b.name);
    assert.ok(npc, b.name + ' does not convert');
    assert.ok(npc.max >= 1, b.name + ': a combatant needs at least one Wound');
    assert.equal(typeof npc.name, 'string');
    // The abilities, the armour spread and any source conflict are carried
    // through for the GM to read on the board.
    if (b.abilities) assert.ok(npc.note.includes(b.abilities.slice(0, 20)), b.name);
    // Nothing comes through weighing a negative or a NaN.
    const w = hostileWeight(readHostile(npc));
    assert.ok(Number.isFinite(w) && w >= 0, `${b.name} weighed ${w}`);
  }
}

/* ---- the one that is out of scale says so ---- */

{
  // The Void Kraken has a full profile and is still marked custom, because
  // it is a starship: Hull Integrity, turrets and macrobatteries. Dropping
  // it on a boarding-action board as a 35-Wound creature would be wrong in
  // a way nothing else would catch.
  const kraken = bestiaryEntry('Void Kraken');
  assert.equal(kraken.custom, true);
  assert.match(kraken.note, /STARSHIP SCALE/);
  assert.equal(kraken.wounds, null, 'it has Hull Integrity, not Wounds');
}

/* ---- where the sources disagree, it is written down ---- */

{
  assert.ok(CONFLICTS.length > 0, 'the sources did disagree in places');
  for (const c of CONFLICTS) {
    assert.ok(bestiaryEntry(c.name), c.name + ' is not in the bestiary');
    assert.ok(c.conflict.length > 20, c.name + ': say what the disagreement is');
  }
  // The ones found while transcribing. Pinned so that silently "tidying"
  // one of these to match a tactica sheet is a deliberate act.
  const named = CONFLICTS.map((c) => c.name);
  for (const n of ['The Luminary', 'Sslyth Mercenary', 'Wyrd Gunslinger', 'Orden Hyort']) {
    assert.ok(named.includes(n), n + ': the recorded conflict went missing');
  }
  assert.match(bestiaryEntry('The Luminary').conflict, /Wounds 18/);
}

/* ---- the weight formula ranks them the way a GM would expect ---- */

{
  const w = (n) => hostileWeight(readHostile(bestiaryToNpc(n)));
  assert.ok(w('Avatar of Khaine') > w('Eldar Autarch'), 'a god outweighs a captain');
  assert.ok(w('Eldar Autarch') > w('Eldar Guardian'));
  assert.ok(w('Ork Kaptin') > w('Ork Nob'));
  assert.ok(w('Ork Nob') > w('Ork Boy'));
  assert.ok(w('Ork Boy') > w('Gretchin'));
  assert.ok(w("Rak'Gol Abomination") > w('Shadowkith'));
  assert.ok(threatWeight({ wounds: 1 }) >= 0);
}

console.log('bestiary.js OK (%d antagonists across %d groups, %d source conflicts)',
  BESTIARY.length, GROUPS.length, CONFLICTS.length);
