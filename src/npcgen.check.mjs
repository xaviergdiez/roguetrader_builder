// Self-check for the antagonist generator. Run: node src/npcgen.check.mjs
import assert from 'node:assert/strict';
import {
  THREAT_TIERS, tierById, ORIGINS, originById,
  WEAPON_TABLES, ARMOUR_TABLES, COMBAT_ROLES, MOTIVATIONS, QUIRKS,
  NAME_FRAGMENTS, rollNpc, BESTIARY, bestiaryEntry, bestiaryToNpc
} from './npcgen.js';
import { weaponProfile, armourProfile } from './groundcombat.js';

/* ---- a deterministic rng: plays back a fixed sequence of [0,1) values ---- */

function scripted(values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

/* ---- every roll range in every table covers 1-10 with no gaps or overlaps ---- */

function checkCoverage(table, label) {
  for (let r = 1; r <= 10; r++) {
    const hits = table.filter((row) => r >= row.min && r <= row.max);
    assert.equal(hits.length, 1, `${label}: roll ${r} matched ${hits.length} rows`);
  }
}

checkCoverage(THREAT_TIERS, 'THREAT_TIERS');
checkCoverage(ORIGINS, 'ORIGINS');
checkCoverage(COMBAT_ROLES, 'COMBAT_ROLES');
for (const [id, cols] of Object.entries(WEAPON_TABLES)) {
  for (const [col, rows] of Object.entries(cols)) checkCoverage(rows, `WEAPON_TABLES.${id}.${col}`);
}

assert.equal(MOTIVATIONS.length, 10);
assert.equal(QUIRKS.length, 10);

/* ---- every weapon and armour label in the tables is a real gear.js entry ---- */

for (const [tableId, cols] of Object.entries(WEAPON_TABLES)) {
  for (const rows of Object.values(cols)) {
    for (const row of rows) {
      const profile = weaponProfile(row.weapon);
      assert.ok(profile, `${tableId}: "${row.weapon}" is not a resolvable gear.js weapon`);
    }
  }
}

for (const [tableId, cols] of Object.entries(ARMOUR_TABLES)) {
  for (const [tier, label] of Object.entries(cols)) {
    if (label == null) continue;   // deliberately unarmoured at this tier
    const profile = armourProfile(label);
    assert.ok(profile, `${tableId}.${tier}: "${label}" is not a resolvable gear.js armour`);
    assert.ok(Number.isFinite(profile.armour), `${tableId}.${tier}: "${label}" parsed no AP`);
  }
}

/* ---- name fragments: every origin used by ORIGINS has a fragment table ---- */

for (const o of ORIGINS) {
  if (o.gmChoice) continue;   // Xenos Hybrid borrows Eldar's fragments on purpose
  assert.ok(NAME_FRAGMENTS[o.id], `no NAME_FRAGMENTS entry for origin "${o.id}"`);
}

/* ---- rollNpc: pinned tier/origin, fully deterministic ---- */

{
  // Enough scripted rolls to cover every roll rollNpc makes for this path:
  // weapon(0.05->1), armour column lookup has no roll, combat role, motivation,
  // quirk, name column A, name column B.
  const rng = scripted([0.05, 0.25, 0.15, 0.85, 0.05, 0.15]);
  const npc = rollNpc({ rng, tierId: 'heavy', originId: 'ork' });
  assert.equal(npc.tier, 'heavy');
  assert.equal(npc.origin, 'ork');
  assert.ok(weaponProfile(npc.weapon), `rolled weapon "${npc.weapon}" does not resolve`);
  assert.ok(npc.max >= 12 && npc.max <= 16, 'Heavy Wounds range');
  assert.ok(npc.name.length > 0);
  assert.equal(npc.gmChoice, false);
}

/* ---- Chaos Space Marine is Elite/Named only: a Minor/Heavy roll re-rolls origin ---- */

{
  // First roll (0.85 -> 1d10 of 9) would pick tier=elite... force Minor
  // instead by pinning the tier and only letting origin roll land on 9.
  const rng = scripted([0.85, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
  const npc = rollNpc({ rng, tierId: 'minor' });
  assert.notEqual(npc.origin, 'chaos_marine', 'Chaos Marine should not appear at Minor tier');
}

/* ---- Kroot's weapon table has no tier split ---- */

{
  const rng = scripted([0.05, 0.05, 0.5, 0.5, 0.5, 0.5]);
  const npc = rollNpc({ rng, tierId: 'minor', originId: 'kroot' });
  assert.equal(npc.weapon, 'kroot rifle');
}

/* ---- a fuzz pass: every tier x origin combination produces a valid npc ---- */

{
  let seed = 1;
  // A small deterministic PRNG so the fuzz pass is reproducible.
  const rng = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed % 10000) / 10000;
  };
  for (const tier of THREAT_TIERS) {
    for (const origin of ORIGINS) {
      const npc = rollNpc({ rng, tierId: tier.id, originId: origin.id });
      assert.ok(npc.name.length > 0, `${tier.id}/${origin.id}: empty name`);
      assert.ok(npc.max >= 1, `${tier.id}/${origin.id}: bad max`);
      assert.ok(Number.isFinite(npc.ws) && Number.isFinite(npc.bs), `${tier.id}/${origin.id}: bad ws/bs`);
      assert.ok(npc.toughnessBonus >= 0, `${tier.id}/${origin.id}: bad toughnessBonus`);
      assert.ok(npc.armour >= 0, `${tier.id}/${origin.id}: bad armour`);
      if (npc.weapon) assert.ok(weaponProfile(npc.weapon), `${tier.id}/${origin.id}: "${npc.weapon}" unresolvable`);
    }
  }
}

/* ---- Named doubles the Quirk roll ---- */

{
  const rng = scripted([0.5, 0.99, 0.5, 0.5, 0.5, 0.5, 0.5]);
  const npc = rollNpc({ rng, tierId: 'named' });
  assert.equal(npc.quirks.length, 2);
}

/* ---- the bestiary ---- */

assert.equal(BESTIARY.length, 20);
assert.ok(bestiaryEntry('kaptin orlog mordakka'), 'lookup is case-insensitive');
assert.equal(bestiaryEntry('nobody here'), null);

{
  const npc = bestiaryToNpc('Kaptin Orlog Mordakka');
  assert.equal(npc.max, 44);
  assert.equal(npc.toughnessBonus, 6);
  assert.equal(npc.custom, false);
  // The bespoke ability string is carried through for the log/UI, but it is
  // not expected to resolve through weaponProfile() — that needs a real
  // gear.js label, which "Da 'Eadzappa (melee, ...)" is not.
  assert.equal(weaponProfile(npc.weapon), null);
}

{
  // Orden Hyort has no usable numbers at all in the source.
  const npc = bestiaryToNpc('Orden Hyort');
  assert.equal(npc.custom, true);
  assert.equal(npc.ws, null);
}

console.log('npcgen.check.mjs: all assertions passed');
