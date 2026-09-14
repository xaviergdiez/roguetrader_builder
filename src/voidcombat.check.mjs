// Self-check for void combat. Run: node src/voidcombat.check.mjs
import assert from 'node:assert/strict';
import {
  PHASES, nextPhase, initiative, initiativeOrder,
  EXTENDED_ACTIONS, actionById, mayTakeAction,
  evasionPenalty, EVASION_CAP, lockBonus, repairAmount, triageReduction,
  rangeBand, rangeModifier, toHit, hitsScored,
  resolveAttack, interceptTorpedoes,
  CRITICALS, criticalEffect, hitAndRun, boardingRound, BOARDING_TARGET,
  applyEvent, applyRepair, fireDamage
} from './voidcombat.js';
import { targetSizeModifier, evadesFreely } from './ship.js';

/* ---- the four-phase turn ---- */

assert.deepEqual(PHASES, ['extended', 'manoeuvre', 'shooting', 'damage_control']);
assert.equal(nextPhase('extended'), 'manoeuvre');
assert.equal(nextPhase('damage_control'), 'extended', 'wraps to the top of the turn');
assert.equal(nextPhase('nonsense'), 'extended');

/* ---- initiative: 1d10 + Detection/10 ---- */

assert.equal(initiative(20, 7), 9);
assert.equal(initiative(15, 3), 4, 'Detection 15 contributes 1, not 1.5');
assert.equal(initiative(0, 1), 1);
{
  const order = initiativeOrder([
    { id: 'lunar', detection: 10, d10: 4 },     // 5
    { id: 'sword', detection: 15, d10: 8 },     // 9
    { id: 'jericho', detection: 10, d10: 4 }    // 5, declared after lunar
  ]);
  assert.deepEqual(order.map((s) => s.id), ['sword', 'lunar', 'jericho']);
  assert.equal(order[0].score, 9);
  // a tie keeps declaration order, so the result is stable
  assert.deepEqual(initiativeOrder([]).length, 0);
}

/* ---- target size ---- */

assert.equal(targetSizeModifier('Frigate (Escort)'), 0);
assert.equal(targetSizeModifier('Transport'), 0);
assert.equal(targetSizeModifier('Raider (Escort)'), 0);
assert.equal(targetSizeModifier('Light Cruiser'), 10);
assert.equal(targetSizeModifier('Cruiser'), 10);
assert.equal(targetSizeModifier('Monitor-Cruiser'), 10);
assert.equal(targetSizeModifier('Grand Cruiser'), 20);
assert.equal(targetSizeModifier('Battleship'), 30);
assert.equal(targetSizeModifier('Starfighter'), -20);
// an unknown class reads as an escort rather than guessing something large
assert.equal(targetSizeModifier('Xenos Something'), 0);
assert.equal(targetSizeModifier(''), 0);

// only escorts and light cruisers evade freely
assert.equal(evadesFreely('Frigate (Escort)'), true);
assert.equal(evadesFreely('Light Cruiser'), true);
assert.equal(evadesFreely('Cruiser'), false);
assert.equal(evadesFreely('Grand Cruiser'), false);

/* ---- range bands ---- */

// Range 6: 0-3 is short, 4-6 standard, 7+ out of range.
assert.equal(rangeBand(0, 6), 'short');
assert.equal(rangeBand(3, 6), 'short');
assert.equal(rangeBand(4, 6), 'standard');
assert.equal(rangeBand(6, 6), 'standard');
assert.equal(rangeBand(7, 6), 'out');
assert.equal(rangeModifier(3, 6), 10);
assert.equal(rangeModifier(5, 6), 0);
assert.equal(rangeModifier(9, 6), null, 'out of range cannot fire');
// an odd range still splits cleanly: Range 5 makes 2.5 the boundary
assert.equal(rangeBand(2, 5), 'short');
assert.equal(rangeBand(3, 5), 'standard');

/* ---- evasion: -10, then -10 per DoS, capped at -50 ---- */

assert.equal(evasionPenalty(0), -10, 'succeeding at all is already -10');
assert.equal(evasionPenalty(1), -20);
assert.equal(evasionPenalty(3), -40);
assert.equal(evasionPenalty(4), -50);
assert.equal(evasionPenalty(9), EVASION_CAP, 'hard cap');
assert.equal(EVASION_CAP, -50);

/* ---- the worked example from the rules ----
   Arch-Militant BS 44 fires a Mars Macrocannon (Range 6) at a Lunar-class
   Cruiser at 3 VU. The cruiser evaded with 1 Degree of Success.
   44 + 10 (size) + 10 (short range) - 20 (evasion) = 44. */

{
  const h = toHit({
    ballisticSkill: 44,
    weaponId: 'weap-macrocannon-mars',
    distanceVU: 3,
    targetClass: 'Cruiser',
    evadingDoS: 1
  });
  assert.equal(h.canFire, true);
  assert.equal(h.band, 'short');
  assert.equal(h.target, 44, 'the worked example lands on 44');
  assert.deepEqual(h.parts, [
    { label: 'Target size', value: 10 },
    { label: 'Range', value: 10 },
    { label: 'Evasive Manoeuvres', value: -20 }
  ]);
  // rolling 21 against 44 is two degrees of success, which is three hits
  assert.equal(hitsScored(2, 3), 3, 'the example scores 3 hits');
}

/* ---- to-hit assembly ---- */

// A crippled target cannot evade, so the two never stack.
{
  const h = toHit({
    ballisticSkill: 40, weaponId: 'weap-macrocannon-mars', distanceVU: 2,
    targetClass: 'Cruiser', evadingDoS: 4, crippled: true
  });
  assert.equal(h.parts.find((p) => p.label === 'Evasive Manoeuvres'), undefined);
  assert.equal(h.parts.find((p) => p.label === 'Crippled target').value, 10);
  assert.equal(h.target, 40 + 10 + 10 + 10);
}

// Out of range cannot fire, and reports no target number to roll against.
{
  const h = toHit({ ballisticSkill: 60, weaponId: 'weap-macrocannon-mars', distanceVU: 12 });
  assert.equal(h.canFire, false);
  assert.equal(h.target, null);
  assert.equal(h.band, 'out');
}

// Bridge synergies stack, and point-blank only helps a Scatter weapon.
{
  const h = toHit({
    ballisticSkill: 30, weaponId: 'weap-macrocannon-mars', distanceVU: 0,
    targetClass: 'Frigate (Escort)', lockDoS: 2, machineSpiritDoS: 1,
    silhouetted: true, scatter: true
  });
  // 30 + 0 size + 10 short + 10 lock + 5 spirit + 10 silhouette + 10 point-blank
  assert.equal(h.target, 75);
  assert.equal(h.pointBlank, true);

  const noScatter = toHit({
    ballisticSkill: 30, weaponId: 'weap-macrocannon-mars', distanceVU: 0,
    targetClass: 'Frigate (Escort)', lockDoS: 2, machineSpiritDoS: 1,
    silhouetted: true, scatter: false
  });
  assert.equal(noScatter.target, 65, 'no Scatter, no point-blank bonus');
}

assert.equal(lockBonus(3), 15);
// A weapon with no range is not a weapon at point-blank: it cannot fire.
assert.equal(rangeBand(0, 0), 'out');
assert.equal(toHit({}).canFire, false);
assert.equal(toHit({}).target, null);

/* ---- hits are capped by Strength ---- */

assert.equal(hitsScored(0, 3), 1, 'succeeding scores one hit');
assert.equal(hitsScored(2, 3), 3);
assert.equal(hitsScored(5, 3), 3, 'Strength is the cap');
assert.equal(hitsScored(5, 1), 1, 'a lance of Strength 1 scores one hit however well it rolls');
assert.equal(hitsScored(3, 0), 0);

/* ---- ARMOUR COMES OFF THE COMBINED TOTAL ----
   The regression that matters. Four hits of 8 against Armour 16 is 16 damage.
   Subtracting armour per hit would make it nothing, which is how an earlier
   pass here made every macrobattery useless. */

{
  const r = resolveAttack({
    weaponId: 'weap-macrocannon-mars',
    hits: 4,
    damageRolls: [6, 6, 6, 6],        // raw dice; +2 each = 8 per hit
    target: { turretRating: 0, voidShields: 0, armour: 16, hullIntegrity: 60 }
  });
  assert.equal(r.combinedDamage, 32);
  assert.equal(r.armourMitigation, 16);
  assert.equal(r.netHullDamage, 16);
  assert.equal(r.hullIntegrity, 44);
}

/* ---- the sample payload from the design ----
   BS 50, 2 DoS, Strength 4 weapon. Turret 1, one shield, Armour 16, HI 30.
   3 hits -> 2 after turrets -> 1 after shields -> a raw 8 becomes 10 damage,
   which fails to beat Armour 16. */

{
  const r = resolveAttack({
    weaponClass: 'macro',
    strength: 4,
    damageBonus: 2,
    degreesOfSuccess: 2,
    damageRolls: [8],
    target: { turretRating: 1, voidShields: 1, armour: 16, hullIntegrity: 30 }
  });
  assert.equal(r.hitsScored, 3);
  assert.equal(r.hitsPostTurrets, 2);
  assert.equal(r.hitsPostShields, 1);
  assert.equal(r.combinedDamage, 10);
  assert.equal(r.netHullDamage, 0);
  assert.equal(r.hullIntegrity, 30, 'the raider is untouched');
  assert.equal(r.criticalTriggered, false);
  assert.equal(r.shieldsRemaining, 0, 'the shield was spent stopping a hit');
  // armourMitigation is what the armour actually absorbed, with the armour
  // value reported separately — 10 absorbed of 16 available
  assert.equal(r.armour, 16);
  assert.equal(r.armourMitigation, 10);
}

/* ---- turrets apply to shells and torpedoes, never to lances ---- */

{
  const lance = resolveAttack({
    weaponId: 'weap-lance-starbreaker',
    hits: 2, damageRolls: [9, 7],
    target: { turretRating: 3, voidShields: 0, armour: 20, hullIntegrity: 71 }
  });
  assert.equal(lance.turretsStop, 0, 'turrets cannot shoot down a lightspeed beam');
  assert.equal(lance.ignoresArmour, true);
  assert.equal(lance.combinedDamage, 11 + 9, 'raw dice plus the weapon bonus');
  assert.equal(lance.netHullDamage, 20, 'armour 20 is ignored entirely');
  assert.equal(lance.hullIntegrity, 51);

  // a shield still stops a lance hit: it blocks the hit, not the damage
  const shielded = resolveAttack({
    weaponId: 'weap-lance-starbreaker',
    hits: 1, damageRolls: [10],
    target: { turretRating: 0, voidShields: 1, armour: 20, hullIntegrity: 71 }
  });
  assert.equal(shielded.shieldsStop, 1);
  assert.equal(shielded.netHullDamage, 0);
}

// Torpedoes ignore void shields but armour still applies.
{
  const t = resolveAttack({
    weaponClass: 'torpedo', strength: 6, damageBonus: 0,
    hits: 3, damageRolls: [9, 9, 9],
    target: { turretRating: 1, voidShields: 4, armour: 12, hullIntegrity: 50 }
  });
  assert.equal(t.turretsStop, 1, 'turrets can shoot down torpedoes');
  assert.equal(t.shieldsStop, 0, 'void shields are ignored');
  assert.equal(t.combinedDamage, 18);
  assert.equal(t.netHullDamage, 6, 'armour still applies');
}

/* ---- torpedo interception is opposed ---- */

{
  const r = interceptTorpedoes({
    turretRating: 2, torpedoRating: 1,
    rolls: [{ turret: 8, torpedo: 3 }, { turret: 2, torpedo: 9 }, { turret: 5, torpedo: 6 }]
  });
  // 10v4 stopped, 4v10 through, 7v7 through — a tie favours the torpedo
  assert.equal(r.stopped, 1);
  assert.deepEqual(r.log.map((l) => l.shotDown), [true, false, false]);
  assert.equal(interceptTorpedoes().stopped, 0);
}

/* ---- criticals need armour beaten AND a natural 10, or a dead hull ---- */

{
  // a natural 10 that still fails to beat armour is not a critical
  const soaked = resolveAttack({
    weaponId: 'weap-macrocannon-mars', hits: 1, damageRolls: [10],
    target: { turretRating: 0, voidShields: 0, armour: 20, hullIntegrity: 40 }
  });
  assert.equal(soaked.naturalTen, true);
  assert.equal(soaked.netHullDamage, 0);
  assert.equal(soaked.criticalTriggered, false, 'no damage through, no critical');

  // damage through the armour with a natural 10 is a critical
  const crit = resolveAttack({
    weaponId: 'weap-macrocannon-mars', hits: 2, damageRolls: [10, 9],
    target: { turretRating: 0, voidShields: 0, armour: 12, hullIntegrity: 40 }
  });
  assert.equal(crit.netHullDamage, 12 + 11 - 12);
  assert.equal(crit.criticalTriggered, true);

  // damage through without a natural 10 is not
  const plain = resolveAttack({
    weaponId: 'weap-macrocannon-mars', hits: 2, damageRolls: [9, 9],
    target: { turretRating: 0, voidShields: 0, armour: 12, hullIntegrity: 40 }
  });
  assert.equal(plain.naturalTen, false);
  assert.equal(plain.criticalTriggered, false);

  // a hull reaching zero is a critical on its own, natural 10 or not
  const killed = resolveAttack({
    weaponId: 'weap-lance-starbreaker', hits: 1, damageRolls: [9],
    target: { turretRating: 0, voidShields: 0, armour: 0, hullIntegrity: 5 }
  });
  assert.equal(killed.destroyed, true);
  assert.equal(killed.criticalTriggered, true);
}

/* ---- the critical table ---- */

assert.equal(CRITICALS.length, 10);
assert.equal(criticalEffect(1).name, 'Depressurized');
assert.equal(criticalEffect(6).name, 'Shield Collapse');
assert.equal(criticalEffect(9).name, 'Drive Damaged');
assert.equal(criticalEffect(10).name, 'Annihilation');
// a modified roll past the table does not fall off the end of it
assert.equal(criticalEffect(14).name, 'Annihilation');
assert.equal(criticalEffect(0), null);
for (const c of CRITICALS) {
  assert.ok(c.name && c.effect && c.writes.length, 'critical ' + c.roll);
}

/* ---- hit and run bypasses shields and armour ---- */

{
  const won = hitAndRun({ attackerDoS: 3, defenderDoS: 1, d5: 2 });
  assert.equal(won.success, true);
  assert.equal(won.margin, 2);
  assert.equal(won.criticalRoll, 4, '1d5 plus one per Degree of Success');
  assert.equal(won.effect.name, 'Thrusters Damaged');

  const lost = hitAndRun({ attackerDoS: 1, defenderDoS: 3, d5: 5 });
  assert.equal(lost.success, false);
  assert.equal(lost.effect, null);
  // a tie is not a win for the boarders
  assert.equal(hitAndRun({ attackerDoS: 2, defenderDoS: 2, d5: 3 }).success, false);
}

/* ---- boarding runs to three cumulative degrees ---- */

{
  assert.equal(BOARDING_TARGET, 3);
  let s = boardingRound(null, { attackerDoS: 2, defenderDoS: 0,
    attackerLosses: { population: 3, morale: 2 },
    defenderLosses: { population: 4, morale: 3 } });
  assert.equal(s.attacker, 2);
  assert.equal(s.winner, null);
  // both crews bleed every round, whoever is winning
  assert.equal(s.losses.attacker.population, 3);
  assert.equal(s.losses.defender.morale, 3);

  s = boardingRound(s, { attackerDoS: 1, defenderDoS: 0 });
  assert.equal(s.attacker, 3);
  assert.equal(s.winner, 'attacker');

  // the defenders can win it instead
  let d = boardingRound(null, { attackerDoS: 0, defenderDoS: 3 });
  assert.equal(d.defender, 3);
  assert.equal(d.winner, 'defender');
}

/* ---- extended actions are gated by role ---- */

assert.equal(EXTENDED_ACTIONS.length, 10);
for (const a of EXTENDED_ACTIONS) {
  assert.ok(a.name && a.skill && a.effect, a.id);
  assert.ok(a.roles.length && a.writes.length, a.id);
}
assert.equal(mayTakeAction('emergency_repairs', 'enginseer'), true);
assert.equal(mayTakeAction('emergency_repairs', 'helmsman'), false);
assert.equal(mayTakeAction('evasive_manoeuvres', 'helmsman'), true);
assert.equal(mayTakeAction('hold_fast', 'lordcaptain'), true);
assert.equal(mayTakeAction('hold_fast', 'firstofficer'), false, 'the Captain only');
assert.equal(mayTakeAction('backs_into_it', 'firstofficer'), true);
// the GM runs the NPC bridge, so every action is open to them
assert.equal(mayTakeAction('emergency_repairs', null, { isGm: true }), true);
assert.equal(mayTakeAction('nonsense', 'enginseer', { isGm: true }), false);
assert.equal(actionById('triage').roles[0], 'chirurgeon');

assert.equal(repairAmount(0), 1, '1 + DoS');
assert.equal(repairAmount(3), 4);
assert.equal(triageReduction(2), 3);

/* ---- GM events return a patch, never a mutation ---- */

{
  const state = { hullIntegrity: 60, population: 100, morale: 98, fires: [], phase: 'extended' };
  const frozen = JSON.stringify(state);

  const breach = applyEvent(state, { id: 'hull_breach', amount: 8, population: 5 });
  assert.deepEqual(breach.patch, { hullIntegrity: 52, population: 95 });
  assert.equal(JSON.stringify(state), frozen, 'the state is not mutated');

  assert.deepEqual(applyEvent(state, { id: 'morale_shock', amount: 10 }).patch, { morale: 88 });
  assert.deepEqual(applyEvent(state, { id: 'advance_phase' }).patch, { phase: 'manoeuvre' });

  // vitals are percentages and cannot run past their ends
  assert.deepEqual(applyEvent({ morale: 5 }, { id: 'morale_shock', amount: 40 }).patch, { morale: 0 });
  // a ship with no population recorded starts from a full complement
  assert.deepEqual(applyEvent({ hullIntegrity: 3 }, { id: 'hull_breach', amount: 99 }).patch,
    { hullIntegrity: 0, population: 100 });

  const r = applyEvent({ morale: 50 }, { id: 'summon_squiggoth' });
  assert.deepEqual(r.patch, {});
  assert.equal(r.unknown, true);
}

/* ---- damage control, and fires that were not put out ---- */

{
  const r = applyRepair({ hullIntegrity: 52, fires: [{ id: 'f1' }, { id: 'f2' }] },
    { hullIntegrity: 4, douse: 'f1', max: 60 });
  assert.equal(r.patch.hullIntegrity, 56);
  assert.deepEqual(r.patch.fires, [{ id: 'f2' }]);
  assert.equal(applyRepair({ hullIntegrity: 58 }, { hullIntegrity: 5, max: 60 })
    .patch.hullIntegrity, 60, 'repairs stop at the hull maximum');
  assert.deepEqual(applyRepair().patch, {});

  // each fire still burning eats Hull Integrity at the end of the turn
  const burn = fireDamage({ hullIntegrity: 56, fires: [{ id: 'f2' }, { id: 'f3' }] }, [3, 5]);
  assert.equal(burn.burning, 2);
  assert.equal(burn.damage, 8);
  assert.equal(burn.patch.hullIntegrity, 48);
  // no fires, no patch
  assert.deepEqual(fireDamage({ hullIntegrity: 56, fires: [] }, []).patch, {});
}

console.log('voidcombat: all checks passed (%d actions, %d criticals)',
  EXTENDED_ACTIONS.length, CRITICALS.length);
