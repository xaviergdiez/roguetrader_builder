// Self-check for the compiled bestiary. Run: node src/bestiary.check.mjs
import assert from 'node:assert/strict';
import {
  BESTIARY, GROUPS, bestiaryEntry, byGroup, CONFLICTS, TIER_NAMES, describeTier
} from './bestiary.js';
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

    // Every figure is a number. A characteristic the source leaves blank is
    // 0 — the printed dash means the creature has none of that, which is
    // what 0 says. Nothing is null, so nothing downstream has to guard for
    // it, and a stray null would mean an entry was transcribed as absent
    // rather than as zero.
    for (const k of CHARS) {
      const v = b[k];
      assert.ok(Number.isInteger(v) && v >= 0 && v <= 100, `${b.name}: ${k} is ${v}`);
    }
    for (const k of ['wounds', 'toughnessBonus', 'armour']) {
      const v = b[k];
      assert.ok(Number.isInteger(v) && v >= 0, `${b.name}: ${k} is ${v}`);
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

/* ---- a beast that cannot shoot has Ballistic Skill 0 ---- */

{
  // The printed dash means "none of that", and 0 is how it is stored. A
  // creature like this can still be handed a gun by a GM who wants to; it
  // will simply never hit with it, which is the right outcome.
  const melee = BESTIARY.filter((b) => b.bs === 0);
  assert.ok(melee.length > 5, 'plenty of things in here cannot shoot');
  for (const b of melee) {
    assert.ok(b.ws > 0 || b.custom, b.name + ': cannot fight at all');
  }
  // And the mirror case: something that only ever shoots.
  const wisp = bestiaryEntry('Crystalwisp');
  assert.equal(wisp.ws, 0, 'the Crystalwisp has no Weapon Skill at all');
  assert.equal(wisp.bs, 64);

  // Nothing anywhere is null. This is the whole point of the convention:
  // one kind of "no value", so no caller has to handle two.
  for (const b of BESTIARY) {
    for (const k of [...CHARS, 'wounds', 'toughnessBonus', 'armour']) {
      assert.notEqual(b[k], null, `${b.name}.${k} is null, not 0`);
    }
  }
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
  // Its figures ARE on file now — 50 Hull Integrity and Armour 17 — but they
  // are a ship's, in a creature's columns. The flag is what stops a GM
  // dropping it onto a boarding board as a 50-Wound monster.
  assert.equal(kraken.wounds, 50);
  assert.equal(kraken.armour, 17);
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

  // The tactica sheets win every disagreement, and each conflict note says
  // so. A note that did not would mean an entry had been resolved the other
  // way without anyone deciding to.
  for (const c of CONFLICTS) {
    assert.match(c.conflict, /(sheets|Directory) (are|is) followed/,
      c.name + ': a conflict note must name which source won');
  }
  // Three entries the Master Bestiary Directory settles against the tactica
  // sheets, because the Directory is the GM's own master list. Pinned so
  // that moving one back is a deliberate act, in either direction.
  assert.equal(bestiaryEntry('The Luminary').wounds, 33, 'the Directory gives 33');
  assert.equal(bestiaryEntry('Sslyth Mercenary').ws, 35);
  assert.equal(bestiaryEntry('Sslyth Mercenary').armour, 4);
  assert.equal(bestiaryEntry('Orden Hyort').ws, 53, 'the Directory gives him a profile');
  assert.equal(bestiaryEntry('Orden Hyort').custom, false);

  // And four the tactica sheets still settle, because the Directory agrees
  // or is silent.
  assert.match(bestiaryEntry('Clawed Fiend').weapon, /Pen 2/);
  assert.match(bestiaryEntry('Ebon Geist').weapon, /1d10\+3 E; Pen 3/);
  assert.match(bestiaryEntry('Wyrd Gunslinger').abilities, /Psy Rating 1/);
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

/* ---- the tactica carried over from the Master Bestiary Directory ---- */

{
  const tiered = BESTIARY.filter((b) => b.threatTier);
  assert.ok(tiered.length > 75, 'most of the bestiary should carry a tier');
  for (const b of BESTIARY) {
    assert.ok(Number.isInteger(b.threatTier) && b.threatTier >= 0 && b.threatTier <= 4,
      `${b.name}: threatTier is ${b.threatTier}`);
    // A tier and its advice travel together; one without the other is a
    // half-merged row.
    assert.equal(Boolean(b.threatTier), Boolean(b.counterTactics),
      `${b.name}: tier and counter-tactics must both be present or both absent`);
    if (b.counterTactics) {
      // Low enough to let a terse real line through — the Mutant
      // Abomination's whole entry is "Heavy fire." — while still catching a
      // cell that came across empty or truncated.
      assert.ok(b.counterTactics.length > 5, `${b.name}: advice came across empty`);
    }
    assert.equal(describeTier(b), b.threatTier
      ? `Tier ${b.threatTier} \u00B7 ${TIER_NAMES[b.threatTier]}` : null);
  }
  assert.equal(describeTier(null), null);

  // Every tier is used, or the scale is finer than the data behind it.
  for (const t of [1, 2, 3, 4]) {
    assert.ok(tiered.some((b) => b.threatTier === t), 'no creature at tier ' + t);
  }

  // The tier is a judgement, the weight is arithmetic, and they should
  // broadly agree: a Tier 4 boss ought to outweigh the average Tier 1.
  const avg = (t) => {
    const xs = tiered.filter((b) => b.threatTier === t)
      .map((b) => hostileWeight(readHostile(bestiaryToNpc(b.name))));
    return xs.reduce((a, c) => a + c, 0) / xs.length;
  };
  assert.ok(avg(4) > avg(1), 'tier 4 should outweigh tier 1 on average');
  assert.ok(avg(3) > avg(1));

  // Page references were deliberately NOT carried over.
  for (const b of BESTIARY) {
    assert.equal(b.sources, undefined, b.name + ': page references are not wanted here');
    assert.equal(/\bp\.\s*\d/.test(b.counterTactics || ''), false,
      b.name + ': no page reference in the advice either');
  }
}

console.log('bestiary.js OK (%d antagonists, %d groups, %d tiered, %d conflicts)',
  BESTIARY.length, GROUPS.length, BESTIARY.filter((b) => b.threatTier).length,
  CONFLICTS.length);
