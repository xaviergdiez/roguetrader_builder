// Self-check for the Wrath & Glory conversion. Run: node src/wgconvert.check.mjs
import assert from 'node:assert/strict';
import { WG_THREATS, WG_BOOK } from './wgsource.js';
import {
  RULES, charOf, skillPct, damageBonus, rangeMetres, fearRating, threatScore, tierOf, tierIdOf, engineTier,
  damageType, qualitiesOf, weaponString, primaryWeapon, convertThreat, CHAOS_THREATS, FACTIONS
} from './wgconvert.js';
import { THREAT_TIERS } from './npcgen.js';
import { BESTIARY, bestiaryEntry, byGroup, GROUPS } from './bestiary.js';
import { bestiaryToNpc } from './npcgen.js';

/* ---- every creature the book prints is here, once ---- */
const EXPECTED = [
  'Heimleia von Mettler', 'Onoros the Siren',
  'Cultist', 'Demagogue', 'Mindwitch', 'Iconarch', 'Blessed Blade', 'Mutant', 'Torment', 'Chaos Spawn',
  'Legionary', 'Chosen', 'Warp Talon', 'Raptor', 'Obliterator', 'Sorcerer', 'Dark Apostle', 'Warpsmith',
  'Master of Possession', 'Possessed', 'Master of Executions',
  'Lord of Change', 'Changeling', 'Fateskimmer', 'Fluxmaster', 'Changecaster', 'Blue Scribes', 'Horrors', 'Flamer', 'Rubric Marine',
  'Great Unclean One', 'Plaguebearer', 'Poxbringer', 'Spoilpox Scrivener', 'Sloppity Bilepiper', 'Nurgling', 'Beast of Nurgle',
  'Rot Fly', 'Poxwalker', 'Plague Marine',
  'Bloodthirster', 'Bloodmaster', 'Bloodletter', 'Skulltaker', 'Rendmaster', 'Flesh Hound', 'Lord of Skulls', 'Khorne Berzerker',
  'Bloodcrusher', 'Skullmaster',
  'Keeper of Secrets', 'Tranceweaver', 'Contorted Epitome', 'Masque of Slaanesh', 'Tormentbringer', 'Daemonette',
  'Infernal Enrapturess', 'Fiend', 'Seeker', 'Noise Marine',
  'Venomcrawler', 'Defiler', 'Forgefiend', 'Maulerfiend', 'Helbrute', 'Heldrake', 'Noise Marine'
].filter((n, i, a) => a.indexOf(n) === i);
{
  assert.equal(WG_THREATS.length, 66);
  assert.deepEqual(WG_THREATS.map((t) => t.name).sort(), [...EXPECTED].sort(), 'the set the book prints, no more and no fewer');
  assert.equal(new Set(WG_THREATS.map((t) => t.name)).size, 66, 'each once');
  assert.ok(/Wrath & Glory/.test(WG_BOOK));
}

/* ---- the book's own figures, read back ---- */
{
  const by = Object.fromEntries(WG_THREATS.map((t) => [t.name, t]));
  // Spot checks against the printed stat blocks, the ones most likely to be mis-read.
  assert.deepEqual(by.Cultist.attr, [2, 3, 2, 3, 3, 2, 2]);
  assert.deepEqual([by.Cultist.def.defence, by.Cultist.def.wounds, by.Cultist.def.shock, by.Cultist.def.resilience, by.Cultist.def.ar], [2, 5, 4, 5, 1]);
  assert.equal(by.Cultist.threat, 'T|T|T|T|T');
  assert.deepEqual(by.Bloodletter.attr, [7, 6, 3, 4, 3, 3, 3]);
  assert.deepEqual([by.Bloodletter.def.defence, by.Bloodletter.def.wounds, by.Bloodletter.def.resilience], [3, 10, 7]);
  assert.equal(by.Bloodletter.skills.ws, 10);
  assert.equal(by.Bloodletter.weps[0].n, 'Hellblade');
  assert.deepEqual([by.Bloodletter.weps[0].d, by.Bloodletter.weps[0].e, by.Bloodletter.weps[0].ap], [13, 2, 3]);
  assert.equal(by['Great Unclean One'].def.wounds, 40);
  assert.equal(by.Bloodthirster.def.wounds, 50);
  assert.equal(by['Lord of Skulls'].def.resilience, 23);
  assert.equal(by.Legionary.def.ar, 5);
  assert.deepEqual(by.Helbrute.threat, 'A|A|A|A|E');
  assert.equal(by.Heldrake.cv.speed, 120);
  assert.equal(by.Heldrake.cv.fly, true);
  assert.equal(by.Defiler.def.resilience, 14);

  // Resilience is Toughness + 1 + Armour Rating in the book, for nearly every
  // creature; a handful (the greater daemons, a few mutants) carry more or
  // less. A mass mis-read of the attribute row would break it for all of them.
  const creatures = WG_THREATS.filter((t) => t.kind === 'creature');
  const obey = creatures.filter((t) => t.def.resilience === t.attr[1] + 1 + t.def.ar);
  assert.ok(obey.length >= 50, `Resilience = Toughness + 1 + AR for ${obey.length} of ${creatures.length}`);

  for (const t of WG_THREATS) {
    assert.ok(t.page >= 14 && t.page <= 111, `${t.name}: page ${t.page}`);
    assert.ok(t.role && t.role.length > 20 && t.role.length < 200, `${t.name}: a role line`);
    assert.ok(Number.isInteger(t.def.wounds) && t.def.wounds >= 3 && t.def.wounds <= 60, `${t.name}: wounds ${t.def.wounds}`);
    if (t.kind === 'creature') {
      assert.equal(t.attr.length, 7, `${t.name}: seven attributes`);
      for (const a of t.attr) assert.ok(Number.isInteger(a) && a >= 1 && a <= 14, `${t.name}: attribute ${a}`);
      assert.ok(/^[ATE](\|[ATE]){0,4}$/.test(t.threat), `${t.name}: threat ${t.threat}`);
      assert.ok(Number.isInteger(t.skills.def), `${t.name}: a default dice pool`);
      assert.ok(Number.isInteger(t.cv.conviction) && Number.isInteger(t.cv.resolve), `${t.name}: Conviction and Resolve`);
    } else {
      assert.equal(t.attr, null);
      assert.equal(t.threat, null, 'an engine has no Threat tier in the book');
    }
    assert.ok(Number.isInteger(t.cv.speed) && t.cv.speed >= 4, `${t.name}: speed`);
    assert.ok(t.weps.length > 0 || t.weaponNote, `${t.name}: weapons`);
    for (const w of t.weps) {
      assert.ok(w.n && !/^[A-Z]{1,4}\s/.test(w.n), `${t.name}: weapon name "${w.n}"`);
      assert.ok(w.d >= 1 && w.d <= 30 && w.e >= 0 && w.e <= 10 && w.ap >= 0 && w.ap <= 6, `${t.name}: ${w.n} ${w.d} +${w.e} ED AP${w.ap}`);
      if (w.r) {
        assert.ok(w.r.length === 1 || w.r.length === 3, `${t.name}: ${w.n} range ${w.r}`);
        assert.deepEqual([...w.r].sort((a, b) => a - b), w.r, `${t.name}: ${w.n} ranges ascend`);
      }
    }
  }
}

/* ---- the rules, each one ---- */
{
  assert.equal(charOf(3), 35, 'an average human is 35');
  assert.equal(charOf(1), 15);
  assert.equal(charOf(10), 95, 'capped');
  assert.equal(charOf(14), 95);
  assert.equal(skillPct(5), 38);
  assert.equal(skillPct(3), 29);
  assert.equal(skillPct(15), 83);
  assert.equal(skillPct(0), 15);
  assert.equal(skillPct(40), RULES.SKILL_MAX, 'capped');
  assert.equal(damageBonus(7, 1), 4, 'an autopistol');
  assert.equal(damageBonus(13, 2), 11, 'a hellblade');
  assert.equal(damageBonus(13, 4), 12);
  assert.equal(damageBonus(1, 1), 0, 'never negative');
  assert.equal(rangeMetres(18), 45);
  assert.equal(rangeMetres(36), 90);
  assert.equal(rangeMetres(1), 5, 'not nothing');
  assert.equal(fearRating(0), 0);
  assert.equal(fearRating(3), 3);
  assert.equal(fearRating(9), 4, 'capped at Terrifying');
  assert.equal(RULES.WOUND_FACTOR, 2);

  assert.equal(threatScore('T|T|T|T|T'), 1);
  assert.equal(threatScore('A|A|A|A|A'), 3);
  assert.equal(threatScore('A|E|T|T|T'), 1.6);
  assert.equal(threatScore(''), 0);
  assert.equal(tierOf(1), 1);
  assert.equal(tierOf(1.4), 2, 'the band edge belongs to the band above');
  assert.equal(tierOf(2.2), 3);
  assert.equal(tierOf(2.8), 4);
  assert.equal(tierOf(3), 4);
  assert.deepEqual([1, 2, 3, 4].map((n) => tierIdOf({ 1: 1, 2: 1.6, 3: 2.4, 4: 3 }[n])), ['minor', 'heavy', 'elite', 'named']);
  assert.equal(engineTier(17), 3);
  assert.equal(engineTier(8), 2);
  assert.equal(engineTier(50), 4);

  assert.equal(damageType('Hellblade', false), 'R');
  assert.equal(damageType('Axe of Khorne', false), 'R', '"Khorne" is not a horn');
  assert.equal(damageType('Bladed Horn', false), 'I');
  assert.equal(damageType('Power Fist', false), 'I');
  assert.equal(damageType('Boltgun', true), 'X');
  assert.equal(damageType('Plasma Pistol', true), 'E');
  assert.equal(damageType('Autopistol', true), 'I');
  assert.equal(damageType('Warpflame', true), 'E');

  assert.deepEqual(qualitiesOf(['Brutal', 'Parry', 'Rending (3)']), ['Balanced'], 'only what has a plain Rogue Trader name');
  assert.deepEqual(qualitiesOf(['Flamer', 'Blast (4)']), ['Flame', 'Blast (4)']);
  assert.deepEqual(qualitiesOf(['Inflict (Poison, 6)']), ['Toxic']);
  assert.deepEqual(qualitiesOf(null), []);

  assert.equal(weaponString({ n: 'Autopistol', d: 7, e: 1, ap: 0, r: [6, 12, 18], t: ['Pistol'] }), 'Autopistol (45m; 1d10+4 I)');
  assert.equal(weaponString({ n: 'Hellblade', d: 13, e: 2, ap: 3, r: [1], t: ['Brutal', 'Parry'] }), 'Hellblade (1d10+11 R; Pen 3; Balanced)');
  assert.equal(weaponString({ n: 'Claws', d: 1, e: 1, ap: 0, r: null, t: [] }), 'Claws (1d10 R)', 'no "+0"');
  assert.equal(primaryWeapon([{ n: 'a', d: 7, e: 1 }, { n: 'b', d: 13, e: 4 }]).n, 'b', 'the hardest hitter');
  assert.equal(primaryWeapon([{ n: 'gun', d: 20, e: 3, t: ['Mounted (Large)'] }, { n: 'claw', d: 10, e: 4 }]).n, 'claw', 'a mounted gun is not carried');
  assert.equal(primaryWeapon([]), null);
}

/* ---- the conversion lands where the app's own tiers already are ---- */
{
  const by = Object.fromEntries(CHAOS_THREATS.map((c) => [c.name, c]));
  const band = (id) => THREAT_TIERS.find((t) => t.id === id);
  const within = (n, [lo, hi]) => n >= lo && n <= hi;

  // The three the rule was set against.
  assert.ok(within(by.Cultist.wounds, band('minor').wounds), 'a Cultist has a Minor’s Wounds');
  assert.ok(within(by.Cultist.armour, band('minor').armour));
  assert.equal(by.Cultist.tierId, 'minor');
  assert.ok(within(by.Demagogue.wounds, band('heavy').wounds), 'a Demagogue a Heavy’s');
  assert.equal(by.Demagogue.tierId, 'heavy');
  assert.ok(within(by.Bloodletter.wounds, band('elite').wounds), 'a Bloodletter an Elite’s');
  assert.equal(by.Bloodletter.tierId, 'elite');

  assert.equal(by.Cultist.wounds, 10);
  assert.equal(by.Cultist.toughnessBonus, 3);
  assert.equal(by.Cultist.armour, 1);
  assert.equal(by.Cultist.ws, 38);
  assert.equal(by.Cultist.bs, 29);
  assert.equal(by.Cultist.weapon, 'Autopistol (45m; 1d10+4 I)');
  assert.equal(by.Bloodletter.wounds, 20);
  assert.equal(by.Bloodletter.toughnessBonus, 6);
  assert.equal(by.Bloodletter.ws, 60);
  assert.equal(by.Bloodletter.bs, 0, 'no gun, no Ballistic Skill');
  assert.match(by.Bloodletter.abilities, /Fear \(3\)/, 'the DN 3 Fear test, as a Fear rating');
  assert.match(by.Bloodletter.abilities, /Daemon/);
  assert.equal(by['Great Unclean One'].wounds, 80);
  assert.equal(by['Great Unclean One'].toughnessBonus, 10);
  assert.equal(by['Great Unclean One'].tierId, 'named');
  assert.equal(by.Legionary.armour, 5);
  assert.equal(by.Bloodthirster.threatTier, 4);
  assert.equal(by.Cultist.threatTier, 1);

  // Heavier things are tougher: the tiers are in order of Wounds, on average.
  const mean = (t) => { const l = CHAOS_THREATS.filter((c) => c.threatTier === t && c.group !== 'chaos_engine'); return l.reduce((s, c) => s + c.wounds, 0) / l.length; };
  assert.ok(mean(1) < mean(2) && mean(2) < mean(3) && mean(3) < mean(4), 'each tier is tougher than the one below');

  // An engine.
  const d = by.Defiler;
  assert.equal(d.toughnessBonus, RULES.ENGINE_TB);
  assert.equal(d.armour, 14 - RULES.ENGINE_TB, 'Resilience above the body is armour');
  assert.equal(d.wounds, 34);
  assert.equal(d.ws, 40);
  assert.equal(d.bs, 40);
  assert.equal(d.threatTier, 3);
  assert.match(d.note, /40 is assumed/);
  assert.equal(by.Forgefiend.ws, 0, 'a gun with no blade');
  assert.equal(by.Maulerfiend.bs, 0, 'a blade with no gun');
  assert.equal(by.Heldrake.armour, 4);
  assert.match(by.Heldrake.abilities, /Flies/);

  // The Changeling copies whatever it has seen, and says so.
  assert.match(by.Changeling.weapon, /copies the profile of any weapon/);
  assert.ok(by.Changeling.ws > 0 && by.Changeling.bs > 0);

  // Nothing is left blank.
  for (const c of CHAOS_THREATS) {
    assert.ok(c.weapon, `${c.name}: a weapon`);
    assert.ok(Number.isInteger(c.wounds) && c.wounds % 2 === 0 && c.wounds >= 6, `${c.name}: wounds ${c.wounds}`);
    assert.ok(Number.isInteger(c.toughnessBonus) && c.toughnessBonus >= 1 && c.toughnessBonus <= 13, `${c.name}: TB ${c.toughnessBonus}`);
    assert.ok(c.armour >= 0 && c.armour <= 9, `${c.name}: armour ${c.armour}`);
    for (const k of ['ws', 'bs']) assert.ok(c[k] >= 0 && c[k] <= 95, `${c.name}: ${k} ${c[k]}`);
    assert.ok(c.ws > 0 || c.bs > 0, `${c.name}: it can hurt someone`);
    assert.match(c.weapon, /\(.*\)$/, `${c.name}: weapon line ${c.weapon}`);
    if (!/copies/.test(c.weapon)) assert.match(c.weapon, /1d10(\+\d+)? [IERX]/, `${c.name}: damage in ${c.weapon}`);
    assert.ok(/^chaos_/.test(c.group) === false && FACTIONS.some((f) => f.id === c.faction), `${c.name}: faction ${c.faction}`);
    assert.ok(c.note.includes(WG_BOOK) && /p\.\d+/.test(c.note), `${c.name}: cites its page`);
    assert.ok(c.threatTier >= 1 && c.threatTier <= 4, `${c.name}: tier ${c.threatTier}`);
    assert.ok(!/undefined|NaN|null/.test(`${c.weapon} ${c.abilities || ''} ${c.note}`), `${c.name}: nothing half-built showed through`);
    assert.ok(c.abilities === null || c.abilities.length < 700, `${c.name}: abilities stay readable`);
  }
  // Deterministic: the same input, the same output.
  assert.deepEqual(convertThreat(WG_THREATS[2]), convertThreat(WG_THREATS[2]));
}

/* ---- and in the bestiary ---- */
{
  const groups = GROUPS.filter((g) => /^chaos_/.test(g.id));
  assert.equal(groups.length, FACTIONS.length, 'one group a faction');
  assert.equal(groups.reduce((s, g) => s + byGroup(g.id).length, 0), 66, 'every entry is in one');
  for (const g of groups) assert.ok(byGroup(g.id).length > 0, `${g.id} is not empty`);
  assert.equal(byGroup('chaos_khorne').length, 9);
  assert.equal(byGroup('chaos_engine').length, 6);

  // The Rogue Trader entries of the same name keep their names; the converted ones are told apart.
  assert.equal(bestiaryEntry('Plaguebearer').converted, undefined);
  assert.equal(bestiaryEntry('Plaguebearer (W&G)').converted, true);
  assert.equal(bestiaryEntry('Beast of Nurgle (W&G)').group, 'chaos_nurgle');
  assert.equal(bestiaryEntry('Bloodletter').group, 'chaos_khorne');
  assert.equal(bestiaryEntry('Bloodletter').source.page, 81);

  // And it spawns on the board.
  const npc = bestiaryToNpc('Bloodletter');
  assert.equal(npc.max, 20);
  assert.equal(npc.ws, 60);
  assert.equal(npc.toughnessBonus, 6);
  assert.equal(npc.fear, 3, 'the Fear test arms itself from the ability text');
  assert.match(npc.note, /Converted from Wrath & Glory/);
  assert.equal(bestiaryToNpc('Defiler').max, 34);
  assert.equal(BESTIARY.filter((x) => x.source && x.source.book === WG_BOOK).length, 66, 'all 66 reach the bestiary');

  // The note that reaches the board is stored whole (encounters.js keeps 480
  // characters), so the book page at the end of it must always fit.
  for (const b of BESTIARY.filter((x) => x.source && x.source.book === WG_BOOK)) {
    const name = b.name;
    const note = bestiaryToNpc(name).note;
    assert.ok(note.length <= 480, `${name}: the board note is ${note.length} characters`);
    assert.match(note, /p\.\d+/, `${name}: and still has its page`);
  }
}

console.log('wgconvert checks passed (%d threats, %d groups)', CHAOS_THREATS.length, FACTIONS.length);
