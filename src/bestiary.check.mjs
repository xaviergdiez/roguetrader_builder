// Self-check for the compiled bestiary. Run: node src/bestiary.check.mjs
import assert from 'node:assert/strict';
import {
  BESTIARY, GROUPS, bestiaryEntry, byGroup, CONFLICTS, TIER_NAMES, describeTier
} from './bestiary.js';
import { bestiaryToNpc } from './npcgen.js';
import { WG_BOOK } from './wgsource.js';
import { IM_BOOK } from './imsource.js';
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
    // half-merged row. A creature converted from Wrath & Glory is the one
    // exception: its tier is the book's own Threat tier, there is no Tactica
    // sheet to take advice from, and it must say which book and page it came
    // from instead.
    if (b.converted) {
      assert.ok(b.threatTier >= 1, `${b.name}: a converted creature has a tier`);
      assert.ok(b.source && b.source.book && Number.isInteger(b.source.page), `${b.name}: a converted creature cites its page`);
    } else {
      assert.equal(Boolean(b.threatTier), Boolean(b.counterTactics),
        `${b.name}: tier and counter-tactics must both be present or both absent`);
    }
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

/* ---- one list: no creature twice, whichever book it came from ----

   The bestiary is built from three sources (the app's own Rogue Trader
   entries, Imperium Maledictum and Wrath & Glory) and the same creature turned
   up in more than one: a Plaguebearer under the Denizens of the Warp and again
   under the daemons of Nurgle. A GM choosing from two of them has nothing to say
   which is right. These hold the line. */
{
  const { SUPERSEDED, ALIASES, GROUPS: GS, pickerLabel } = await import('./bestiary.js');

  // No two entries are the same creature. The name is compared without a book's
  // tag and without a leading "the", so "Plaguebearer (W&G)" and "Plaguebearer"
  // cannot both be there.
  const plain = (n) => n.toLowerCase().replace(/\s*\((w&g|im)\)$/, '').replace(/^the /, '').trim();
  const seen = new Map();
  for (const b of BESTIARY) {
    const k = plain(b.name);
    assert.ok(!seen.has(k), `${b.name} is in twice (also ${seen.get(k)})`);
    seen.set(k, b.name);
  }
  assert.ok(!BESTIARY.some((b) => /\((W&G|IM)\)$/.test(b.name)), 'and no entry needs a book\'s tag to be told from another');

  // Every entry is in a group that exists, and every group has something in it.
  const ids = new Set(GS.map((g) => g.id));
  for (const b of BESTIARY) assert.ok(ids.has(b.group), `${b.name}: group ${b.group} does not exist`);
  for (const g of GS) assert.ok(BESTIARY.some((b) => b.group === g.id), `${g.id} is empty`);
  assert.deepEqual(GS.map((g) => g.id), ['beast', 'xenos', 'warp', 'human', 'chaos', 'tau']);

  // The daemons are one group, filed by god; the mortals and machines another.
  const warp = BESTIARY.filter((b) => b.group === 'warp');
  for (const god of ['Khorne', 'Nurgle', 'Slaanesh', 'Tzeentch']) {
    assert.ok(warp.some((b) => b.faction === god), `Denizens of the Warp has ${god} daemons`);
  }
  assert.equal(bestiaryEntry('Plaguebearer').faction, 'Nurgle');
  assert.equal(bestiaryEntry('Flesh Hound of Khorne').faction, 'Khorne');
  assert.equal(bestiaryEntry('Screamer of Tzeentch').faction, 'Tzeentch');
  assert.ok(!BESTIARY.some((b) => b.group === 'chaos' && warp.includes(b)), 'nothing in both');
  assert.ok(BESTIARY.filter((b) => b.group === 'chaos').every((b) => ['Heretics and cultists', 'Heretic Astartes', 'Chaos engines'].includes(b.faction)));
  // within the long lists, what was added reads as a ladder: by god, then by how dangerous
  const added = warp.filter((b) => b.converted);
  for (let i = 1; i < added.length; i++) {
    const g = (x) => ['Khorne', 'Nurgle', 'Slaanesh', 'Tzeentch'].indexOf(x.faction);
    const a = added[i - 1], c = added[i];
    const ga = g(a) < 0 ? 9 : g(a), gc = g(c) < 0 ? 9 : g(c);
    assert.ok(ga < gc || (ga === gc && a.threatTier <= c.threatTier), `${a.name} then ${c.name} is out of order`);
  }

  // What was superseded is gone under that book's name, and the survivor is a real entry.
  assert.equal(SUPERSEDED.length, 7);
  for (const [book, name, by, why] of SUPERSEDED) {
    assert.ok(why.length > 10, `${name}: say why`);
    assert.ok(bestiaryEntry(by), `${name} gave way to ${by}, which is not an entry`);
    assert.ok(!BESTIARY.some((b) => b.name === name && b.source && b.source.book === (book === 'wg' ? WG_BOOK : IM_BOOK)),
      `${name} (${book}) is still in the bestiary`);
  }
  // A Rogue Trader entry always outranks a converted one of the same creature.
  for (const [book, name, by] of SUPERSEDED) {
    if (name === by && !['Poxwalker'].includes(name)) assert.equal(bestiaryEntry(by).converted, undefined, `${by} stays the Rogue Trader one`);
  }
  assert.equal(bestiaryEntry('Poxwalker').source.book, IM_BOOK, 'where two books have it, the d100 one stays');

  // An old name still finds its creature, and every alias lands on a real entry.
  for (const [old, now] of Object.entries(ALIASES)) {
    assert.equal(bestiaryEntry(old).name, now, `${old} -> ${now}`);
    assert.ok(!BESTIARY.some((b) => b.name === old), `${old} is an alias, not an entry`);
  }
  assert.equal(bestiaryEntry('plaguebearer (w&g)').name, 'Plaguebearer', 'case does not matter');
  assert.equal(bestiaryEntry('nobody'), null);
  assert.equal(bestiaryEntry(undefined), null);
  assert.equal(bestiaryToNpc('Flesh Hound').max, 15, 'an old name still spawns, as the entry that kept it');

  // The picker's label says which god in the two mixed groups, and nothing extra elsewhere.
  assert.equal(pickerLabel(bestiaryEntry('Bloodletter')), 'Bloodletter \u00B7 20w \u00B7 T3 \u00B7 Khorne');
  assert.equal(pickerLabel(bestiaryEntry('Defiler')), 'Defiler \u00B7 34w \u00B7 T3 \u00B7 Chaos engines');
  assert.equal(pickerLabel(bestiaryEntry('Ork Boy')), 'Ork Boy \u00B7 16w \u00B7 T1');
  assert.equal(pickerLabel(bestiaryEntry("T'au Gun Drone")), "T'au Gun Drone \u00B7 12w \u00B7 T2", 'no repeating the species');
  assert.match(pickerLabel(bestiaryEntry('The Murmurer')), /\(adjudicate by hand\)$/);
}

console.log('bestiary.js OK (%d antagonists, %d groups, %d tiered, %d conflicts)',
  BESTIARY.length, GROUPS.length, BESTIARY.filter((b) => b.threatTier).length,
  CONFLICTS.length);
