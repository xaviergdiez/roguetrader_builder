// Self-check for the Imperium Maledictum conversion. Run: node src/imconvert.check.mjs
import assert from 'node:assert/strict';
import { IM_THREATS, IM_BOOK } from './imsource.js';
import {
  IM_RULES, charOf, toughnessBonusOf, armourOf, damageBonus, rangeMetres, tierOf, tierIdOf, damageType,
  qualitiesOf, penOf, isWeapon, weaponString, primaryWeapon, convertThreat, IM_CONVERTED
} from './imconvert.js';
import { BESTIARY, bestiaryEntry, byGroup } from './bestiary.js';
import { bestiaryToNpc } from './npcgen.js';

/* ---- the book's creatures, each once ---- */
const EXPECTED = [
  'Poxwalker', 'Gaazrek Weavemaster', 'Mizrax Tallian', 'Mizrax’s Faithful', 'Nar’itor, Flesh Shaper', 'The Murmurer',
  'Gantus Black, Biophagus', 'The Reaper', 'Hernkyn Yaegir', 'Valastra', 'Varon Vipersong', 'Mandrake',
  'Daemonhost', 'Acolyte Hybrid', 'Disc of Tzeentch', 'Kroot Carnivore', 'Kroot Hound', 'Traitor Enforcer',
  'Traitor Guardsman', 'Wraithguard'
];
{
  assert.equal(IM_THREATS.length, 20);
  assert.deepEqual(IM_THREATS.map((t) => t.name).sort(), [...EXPECTED].sort(), 'the twenty the book prints, no more and no fewer');
  assert.ok(/Imperium Maledictum/.test(IM_BOOK));
}

/* ---- the book's own figures, read back ---- */
{
  const by = Object.fromEntries(IM_THREATS.map((t) => [t.name, t]));
  assert.deepEqual(by['Mizrax Tallian'].chars, [70, 30, 80, 60, 50, 50, 50, 50, 50]);
  assert.equal(by['Mizrax Tallian'].wounds, 25);
  assert.equal(by['Mizrax Tallian'].crit, 6);
  assert.equal(by['Mizrax Tallian'].attacks[0].v, 75, 'the chainaxe is Melee (One-handed) 75');
  assert.deepEqual(by.Daemonhost.chars, [30, 30, 30, 60, 30, 60, 60, 40, 50]);
  assert.deepEqual(by.Daemonhost.armour, { base: 1, die: 5 });
  assert.equal(by.Wraithguard.attacks[0].d, 19);
  assert.equal(by['Kroot Carnivore'].chars.join(), '30,30,40,30,40,30,30,30,30');
  assert.deepEqual(by['The Reaper'].armour, { base: 3, die: 5 });
  assert.deepEqual(by['Varon Vipersong'].chars, [50, 50, 40, 40, 40, 35, 35, 40, 50]);
  assert.deepEqual(by.Mandrake.chars, [60, 40, 50, 40, 50, 30, 30, 50, 30]);

  for (const t of IM_THREATS) {
    assert.equal(t.chars.length, 9, `${t.name}: nine characteristics`);
    for (const c of t.chars) assert.ok(Number.isInteger(c) && c >= 5 && c <= 100 && c % 5 === 0, `${t.name}: characteristic ${c}`);
    assert.ok(['Troop', 'Elite', 'Leader'].includes(t.cls), `${t.name}: class ${t.cls}`);
    assert.ok(t.wounds >= 9 && t.wounds <= 30, `${t.name}: wounds ${t.wounds}`);
    assert.ok(Number.isInteger(t.crit) && t.crit >= 0 && t.crit <= 8, `${t.name}: critical wounds ${t.crit}`);
    assert.ok(Number.isInteger(t.init) && t.init >= 2 && t.init <= 15, `${t.name}: initiative`);
    assert.ok(/^(Slow|Normal|Fast)(, Fly)?$/.test(t.speed), `${t.name}: speed ${t.speed}`);
    assert.ok(t.resolve >= 2 && t.resolve <= 5, `${t.name}: resolve`);
    assert.ok(t.page >= 136 && t.page <= 174, `${t.name}: page ${t.page}`);
    assert.ok(t.role && t.role.length > 20 && t.role.length < 220, `${t.name}: a role line`);
    assert.ok(t.attacks.length > 0, `${t.name}: attacks`);
    for (const a of t.attacks) {
      assert.ok(a.n && Number.isInteger(a.v) && a.v >= 30 && a.v <= 100, `${t.name}: ${a.n} skill ${a.v}`);
      assert.ok(Number.isInteger(a.d) && a.d >= 0 && a.d <= 25, `${t.name}: ${a.n} damage ${a.d}`);
    }
    for (const [sk, v] of Object.entries(t.skills)) assert.ok(Number.isInteger(v) && v >= 25 && v <= 100, `${t.name}: skill ${sk} ${v}`);
    assert.ok(t.traits.length > 0, `${t.name}: trait titles`);
  }
}

/* ---- the rules, each one ---- */
{
  assert.equal(charOf(60), 60);
  assert.equal(charOf(2), 5, 'never below 5');
  assert.equal(charOf(130), 95);
  assert.equal(toughnessBonusOf(60), 6);
  assert.equal(toughnessBonusOf(35), 3);
  assert.equal(armourOf({ base: 2, die: 0 }), 2);
  assert.equal(armourOf({ base: 2, die: 5 }), 5, '1d5+2 is 2 and the die’s average, 3');
  assert.equal(armourOf({ base: 0, die: 5 }), 3);
  assert.equal(armourOf(undefined), 0);
  assert.equal(damageBonus(6), 3, 'a printed lasgun lands near 1d10+3');
  assert.equal(damageBonus(2), 0);
  assert.equal(damageBonus(19), 16);
  assert.equal(rangeMetres('Short'), 20);
  assert.equal(rangeMetres('Medium'), 40);
  assert.equal(rangeMetres('Long'), 80);
  assert.equal(rangeMetres(undefined), IM_RULES.DEFAULT_RANGE_M);
  assert.equal(tierOf('Troop', 12), 1);
  assert.equal(tierOf('Elite', 18), 2);
  assert.equal(tierOf('Leader', 16, 3), 3);
  assert.equal(tierOf('Leader', 24, 1), 4, '24 Wounds is Lethal');
  assert.equal(tierOf('Leader', 20, 6), 4, 'so is 6 Critical Wounds');
  assert.equal(tierOf('Elite', 40, 9), 2, 'only a Leader is promoted');
  assert.deepEqual([1, 2, 3, 4].map(tierIdOf), ['minor', 'heavy', 'elite', 'named']);
  assert.equal(damageType('Lasgun', 'bs'), 'E');
  assert.equal(damageType('Bolt Revolver', 'bs'), 'X');
  assert.equal(damageType('Autopistol', 'bs'), 'I');
  assert.equal(damageType('Rending Claw', 'ws'), 'R');
  assert.equal(damageType('Injector Goad', 'ws'), 'I');
  assert.deepEqual(qualitiesOf(['Reliable', 'Loud', 'Defensive', 'Spread']), ['Reliable', 'Balanced', 'Scatter']);
  assert.equal(penOf(['Rend (2)', 'Penetrating (4)']), 4);
  assert.equal(penOf(['Loud']), 0);
  assert.equal(isWeapon({ d: 0, fixed: true }), false, 'Smite is not a gun');
  assert.equal(isWeapon({ d: 4, fixed: true }), true, 'a fixed 4 is');
  assert.equal(weaponString({ n: 'Lasgun', skill: 'Ranged (Long Guns)', v: 40, d: 6, rng: 'Long', t: ['Reliable', 'Loud'] }), 'Lasgun (80m; 1d10+3 E; Reliable)');
  assert.equal(weaponString({ n: 'Power Sword', skill: 'Melee (One-handed)', v: 50, d: 8, t: ['Penetrating (4)'] }), 'Power Sword (1d10+5 R; Pen 4)');
  assert.equal(weaponString({ n: 'Fangs', skill: 'Melee (Brawling)', v: 45, d: 3, t: [] }), 'Fangs (1d10 R)', 'no "+0"');
  assert.equal(primaryWeapon([{ d: 6, t: [] }, { d: 8, t: ['Penetrating (4)'] }]).d, 8);
  assert.equal(primaryWeapon([{ d: 0, fixed: true }]), null);
}

/* ---- what they become ---- */
{
  const by = Object.fromEntries(IM_CONVERTED.map((c) => [c.name, c]));
  assert.equal(by['Traitor Guardsman'].wounds, 14);
  assert.equal(by['Traitor Guardsman'].armour, 4);
  assert.equal(by['Traitor Guardsman'].toughnessBonus, 4);
  assert.equal(by['Traitor Guardsman'].ws, 40);
  assert.equal(by['Traitor Guardsman'].bs, 40);
  assert.equal(by['Traitor Guardsman'].weapon, 'Lasgun (80m; 1d10+3 E; Reliable)');
  assert.equal(by['Traitor Guardsman'].tierId, 'minor');
  assert.equal(by['Traitor Enforcer'].tierId, 'elite');
  assert.equal(by['Mizrax Tallian'].tierId, 'named');
  assert.equal(by['Mizrax Tallian'].ws, 75, 'the skill he attacks with');
  assert.equal(by['Mizrax Tallian'].bs, 0, 'no gun, no Ballistic Skill');
  assert.equal(by['Mizrax Tallian'].toughnessBonus, 6);
  assert.equal(by.Wraithguard.weapon, 'Wraithcannon (80m; 1d10+16 E; Pen 4; Reliable)');
  assert.equal(by['The Reaper'].armour, 6, '3 and the average of 1d5');
  assert.match(by.Valastra.abilities, /Fear \(2\)/, 'a daemon is Frightening');
  assert.match(by.Valastra.abilities, /Daemon/);
  assert.match(by.Poxwalker.abilities, /Fear \(1\)/, 'a plain Source of Corruption is Disturbing');
  assert.doesNotMatch(by.Poxwalker.abilities, /Daemon/);
  assert.match(by['Disc of Tzeentch'].abilities, /Flies/);
  assert.match(by['Gaazrek Weavemaster'].abilities, /Psychic: Smite/, 'a power with no damage is named, not armed');
  assert.equal(by['Gaazrek Weavemaster'].ws, 0);
  assert.equal(by['The Murmurer'].custom, true, 'no damaging attack: the GM adjudicates it');
  assert.equal(by['The Murmurer'].weapon, null);
  assert.equal(by['Wraithguard'].note.includes('never both'), true);

  for (const c of IM_CONVERTED) {
    assert.ok(Number.isInteger(c.wounds) && c.wounds >= 9, `${c.name}: wounds`);
    assert.ok(c.toughnessBonus >= 1 && c.toughnessBonus <= 9, `${c.name}: TB`);
    assert.ok(c.armour >= 0 && c.armour <= 9, `${c.name}: armour ${c.armour}`);
    for (const k of ['ws', 'bs', 's', 't', 'ag', 'int', 'per', 'wp', 'fel']) assert.ok(c[k] >= 0 && c[k] <= 95, `${c.name}: ${k} ${c[k]}`);
    assert.ok(c.weapon || c.custom, `${c.name}: a weapon or a reason`);
    if (c.weapon) assert.match(c.weapon, /1d10(\+\d+)? [IERX]/, `${c.name}: ${c.weapon}`);
    assert.ok(c.note.includes(IM_BOOK) && /p\.\d+/.test(c.note), `${c.name}: cites its page`);
    assert.ok(!/undefined|NaN|null/.test(`${c.weapon || ''} ${c.abilities || ''} ${c.note}`), `${c.name}: nothing half-built showed through`);
  }
  assert.deepEqual(convertThreat(IM_THREATS[3]), convertThreat(IM_THREATS[3]), 'deterministic');
}

/* ---- in the bestiary, and on the board ---- */
{
  assert.equal(byGroup('im_inq').length, 20);
  assert.equal(BESTIARY.filter((b) => b.source && b.source.book === IM_BOOK).length, 20);
  const g = bestiaryToNpc('Traitor Enforcer');
  assert.equal(g.max, 15);
  assert.equal(g.toughnessBonus, 4);
  assert.match(g.note, /Converted from Imperium Maledictum/);
  assert.equal(bestiaryEntry('Mizrax Tallian').group, 'im_inq');
  for (const b of BESTIARY.filter((x) => x.group === 'im_inq')) {
    const note = bestiaryToNpc(b.name).note;
    assert.ok(note.length <= 480, `${b.name}: the board note is ${note.length} characters`);
    assert.match(note, /p\.\d+/, `${b.name}: and still has its page`);
  }
}

console.log('imconvert checks passed (%d creatures)', IM_CONVERTED.length);
