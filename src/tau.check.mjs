// Self-checks for the T'au Explorer: the numbers of the Tau Character Guide
// against what the app carries. Run: node src/tau.check.mjs
import assert from 'node:assert/strict';
import {
  TAU_BASE, TAU_WOUND_DIE, TAU_WOUND_MULT, TAU_FATE, tauWounds, TAU_STARTING, TAU_TRAITS,
  COMPETENCES, competenceById, HEIGHTENED_SIGNIFICANCE, TAU_TALENT_TEXT, TAU_TALENTS, TAU_CAREER, TAU_NPCS
} from './tau.js';
import { GLOSSARY, TALENTS } from './glossary.js';
import { allAdvances, alternateRanksFor, alternateAdvances, alternateRankByName, advancesFor, baseCareer } from './advances.js';
import { tierFor, advanceCost, CHAR_TIER_CAREERS } from './xp.js';
import { gearInfo, parseGear } from './gear.js';
import { parseWeaponStats } from './groundcombat.js';
import { parseArmour } from './armour.js';
import { ARMOUR_TABLES } from './npcgen.js';
import { BESTIARY, bestiaryEntry } from './bestiary.js';

/* ---- Table 1-1: the bases ---- */
assert.deepEqual(TAU_BASE, { ws: 20, bs: 25, s: 20, t: 25, ag: 30, int: 30, per: 25, wp: 25, fel: 25 });
assert.equal(Object.keys(TAU_BASE).length, 9);

/* ---- wounds and Fate: 1d5+2 plus twice the Toughness Bonus; one Fate Point ---- */
assert.deepEqual(TAU_WOUND_DIE, { dice: 1, die: 5, flat: 2 });
assert.equal(TAU_WOUND_MULT, 2);
assert.equal(TAU_FATE, 1);
assert.equal(tauWounds(1, 2), 1 + 2 + 4);
assert.equal(tauWounds(5, 3), 5 + 2 + 6);
assert.equal(tauWounds(), 2, 'no input still gives the flat 2, never NaN');

/* ---- starting kit ---- */
assert.equal(TAU_STARTING.skills.length, 6);
assert.equal(TAU_STARTING.talents.length, 5);
for (const t of ['Fire Caste Weapon Training', 'Marksman', 'Rapid Reload', 'Supporting Fire', 'Unshakeable Faith']) {
  assert.ok(TAU_STARTING.talents.includes(t), t);
}
assert.equal(TAU_TRAITS.length, 3);
assert.ok(TAU_TRAITS.some((t) => /^For the Greater Good!/.test(t)));
assert.ok(TAU_TRAITS.some((t) => /^Non-Imperial/.test(t)));
assert.ok(TAU_TRAITS.some((t) => /^Speak Not Unto the Alien/.test(t)));

/* ---- Classified Competence: six, each with words ---- */
assert.equal(COMPETENCES.length, 6);
assert.equal(new Set(COMPETENCES.map((c) => c.id)).size, 6);
for (const c of COMPETENCES) {
  assert.ok(c.text.length > 40, c.id);
  assert.equal(competenceById(c.id), c);
}
assert.equal(competenceById('nope'), null);
assert.equal(HEIGHTENED_SIGNIFICANCE.length, 4);

/* ---- every talent the guide adds can be looked up at the table ---- */
assert.ok(TAU_TALENTS.length >= 24);
for (const t of TAU_TALENTS) {
  assert.ok(TAU_TALENT_TEXT[t].length > 20, t + ' came across empty');
  assert.equal(GLOSSARY[t], TAU_TALENT_TEXT[t], t + ' is not in the glossary');
  assert.ok(TALENTS[t], t + ' is not offered by the talent picker');
}

/* ---- the advance tables ---- */
assert.equal(baseCareer(TAU_CAREER), TAU_CAREER);
const all = allAdvances(TAU_CAREER);
assert.ok(all && all.length > 100);
for (let r = 1; r <= 8; r++) assert.ok(advancesFor(TAU_CAREER, r).length > 0, 'rank ' + r + ' is empty');
for (const a of all) {
  assert.ok(Number.isInteger(a.cost) && a.cost > 0, `${a.name}: cost`);
  assert.ok(['Skill', 'Talent', 'Trait'].includes(a.type), `${a.name}: type ${a.type}`);
}
// T'au characteristic costs
for (const k of ['ws', 'bs', 's', 't', 'ag', 'int', 'per', 'wp', 'fel']) {
  assert.ok(tierFor(TAU_CAREER, k), k + ' has a cost tier for a T’au');
}
assert.ok(CHAR_TIER_CAREERS.includes(TAU_CAREER), 'the T’au have their own characteristic tiers');
assert.ok(advanceCost(tierFor(TAU_CAREER, 'bs'), 'simple') > 0);

/* ---- alternate ranks ---- */
const alts = alternateRanksFor(TAU_CAREER);
assert.deepEqual(alts.map((r) => r.name), ['Pathfinder', 'Drone Handler', 'Battlesuit Pilot']);
assert.deepEqual(alts.map((r) => r.minRank), [2, 3, 5]);
assert.deepEqual(alts.map((r) => r.xp), [7000, 10000, 17000]);
assert.deepEqual(alternateRanksFor('Rogue Trader'), [], 'other careers have none');
for (const r of alts) {
  const rows = alternateAdvances(r.name);
  assert.equal(rows.length, r.advances.length);
  for (const a of rows) {
    assert.equal(a.rank, r.minRank, `${a.name}: opens at the rank`);
    assert.equal(a.alt, r.name);
  }
}
assert.equal(alternateRankByName('Pathfinder').name, 'Pathfinder');
assert.equal(alternateRankByName('nobody'), null);
assert.deepEqual(alternateAdvances('nobody'), []);

/* ---- gear: the guide's catalogue, in the app's format ---- */
const statsOf = (n) => (gearInfo(n).entry || {}).stats;
const gcWeaponProfile = (n) => { const w = parseWeaponStats(statsOf(n)); return w && w.damage ? w : null; };
const gcArmourProfile = (n) => parseArmour(statsOf(n));
const rifle = gcWeaponProfile('pulse rifle');
assert.ok(rifle, 'pulse rifle parses as a weapon');
assert.equal(rifle.pen, 4);
assert.deepEqual(rifle.damage, { dice: 2, die: 10, bonus: 3, type: 'E' });
assert.equal(rifle.range, 150);
assert.equal(rifle.clip, 36);
assert.equal(gearInfo('Good Pulse Rifle').quality, 'good');
assert.equal(gearInfo('Best Pulse Pistol').entry.kind, 'Pistol');
assert.equal(gearInfo('3 Tau Photon Grenades').entry.kind, 'Thrown');
for (const n of ['pulse carbine', 'longshot pulse rifle', 'ion rifle', 'kroot hunting rifle', 'rail rifle', 'pulse pistol']) {
  assert.ok(gcWeaponProfile(n), n + ' has a weapon profile');
}
assert.equal(gcArmourProfile('tau combat armour').ap, 6);
assert.equal(gcArmourProfile('tau recon armour').ap, 4);
assert.equal(gcArmourProfile('tau recon combat armour').ap, 6, 'the old key on saved sheets still resolves');
assert.equal(gcArmourProfile('xv8 crisis battlesuit').ap, 10);
assert.equal(gcArmourProfile('xv104 riptide').ap, 14);
for (const n of ['blacksun filter', 'drone controller', 'gravity wave projector', 'markerlight', 'target lock', 'translator unit', 'gun drone', 'shield drone', 'markerlight drone']) {
  assert.ok(gearInfo(n).entry, n + ' is not in the catalogue');
}
for (const n of ['burst cannon', 'fusion blaster', 'heavy rail rifle', 'smart missile system', 'plasma rifle', 'ion accelerator']) {
  assert.ok(gearInfo(n).entry, n + ' (a battlesuit weapon) is not in the catalogue');
}
// the starting gear string the career carries splits into things the catalogue knows
const START = 'Good Pulse Rifle or Good Pulse Carbine; Best Pulse Pistol; 3 Tau Photon Grenades; Tau Combat Armour (AP 6 all); Micro-bead; Translator Unit; Blacksun Filter.';
const parsed = parseGear(START);
assert.equal(parsed.length, 7, 'seven lines, the first of them a choice');
assert.deepEqual(parsed[0], ['Good Pulse Rifle', 'Good Pulse Carbine']);
for (const opts of parsed) for (const g of opts) assert.ok(gearInfo(g).entry, g + ' has no catalogue entry');

/* ---- the Fire caste detachment now wears the guide's armour ---- */
assert.equal(ARMOUR_TABLES['4e'].heavy, 'tau combat armour');
assert.ok(gearInfo(ARMOUR_TABLES['4e'].elite).entry);

/* ---- the NPCs ---- */
assert.equal(TAU_NPCS.length, 6);
const fw = bestiaryEntry("T'au Fire Warrior (Honour Guard)");
assert.ok(fw);
assert.deepEqual([fw.ws, fw.bs, fw.s, fw.t, fw.ag, fw.int, fw.per, fw.wp, fw.fel], [25, 35, 30, 30, 20, 30, 35, 30, 25]);
assert.equal(fw.wounds, 13);
assert.equal(fw.armour, 6);
assert.equal(fw.toughnessBonus, 3);
const drone = bestiaryEntry("T'au Gun Drone");
assert.deepEqual([drone.ws, drone.bs, drone.s, drone.t, drone.ag, drone.int, drone.per, drone.wp, drone.fel], [22, 22, 30, 45, 40, 15, 35, 30, 8]);
assert.equal(drone.wounds, 12);
assert.equal(drone.armour, 4);
assert.equal(drone.toughnessBonus, 4);
// a pilot is the Fire Warrior with the suit's Strength and armour
const SUITS = { "T'au Stealth Suit Pilot": [45, 8], "T'au Crisis Suit Pilot": [55, 10], "T'au Broadside Pilot": [65, 15], "T'au Riptide Pilot": [80, 14] };
for (const [name, [str, ap]] of Object.entries(SUITS)) {
  const b = bestiaryEntry(name);
  assert.ok(b, name);
  assert.equal(b.s, str, name + ' Strength');
  assert.equal(b.armour, ap, name + ' armour');
  assert.equal(b.wounds, 13);
  assert.equal(b.t, 30);
  assert.match(b.note, /Built, not printed/, name + ' must say it is built');
}
for (const b of BESTIARY.filter((x) => x.group === 'tau')) {
  assert.equal(b.faction, "T'au");
  assert.ok(b.source.page > 0 && /Tau Character Guide/.test(b.source.book), b.name);
  assert.ok(b.weapon, b.name + ' carries a weapon');
}
assert.ok(Math.max(...BESTIARY.filter((x) => x.group === 'tau').map((b) => b.threatTier)) === 4, 'a Riptide is a Tier 4 threat');

console.log('tau.js OK (%d talents, %d competences, %d alternate ranks, %d NPCs)',
  TAU_TALENTS.length, COMPETENCES.length, alts.length, TAU_NPCS.length);
