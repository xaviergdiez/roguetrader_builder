// Self-check for void combat. Run: node src/voidcombat.check.mjs
import assert from 'node:assert/strict';
import {
  PHASES, nextPhase, initiative, initiativeOrder,
  EXTENDED_ACTIONS, actionById, mayTakeAction,
  evasionPenalty, EVASION_CAP, lockBonus, repairAmount, triageReduction,
  rangeBand, rangeModifier, toHit, hitsScored,
  resolveAttack, interceptTorpedoes,
  CRITICALS, criticalEffect, applyCritical, shieldsRestorable, CONDITIONS,
  hitAndRun, boardingRound, BOARDING_TARGET,
  applyEvent, applyRepair, fireDamage, actionOutcome
} from './voidcombat.js';
import { deniedWrites } from './shiproles.js';
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

/* ---- what each action actually writes ---- */

{
  const ship = { vitals: { hullIntegrity: 50, morale: 90, fires: [{ id: 'f1' }], scans: [] } };

  // Repairs stop at the hull's maximum.
  const rep = actionOutcome('emergency_repairs', 2, ship, { maxHull: 60 });
  assert.equal(rep.vitals.hullIntegrity, 53, '1 + 2 degrees');
  assert.match(rep.log, /3 Hull Integrity restored/);
  assert.equal(actionOutcome('emergency_repairs', 9, ship, { maxHull: 52 })
    .vitals.hullIntegrity, 52, 'and no further');

  // Or it douses a fire instead of repairing.
  const douse = actionOutcome('emergency_repairs', 1, ship, { douse: 'f1' });
  assert.deepEqual(douse.vitals.fires, []);
  assert.equal(douse.vitals.hullIntegrity, undefined, 'one or the other, not both');

  // Evasion writes the penalty attackers will suffer.
  assert.equal(actionOutcome('evasive_manoeuvres', 2, ship).vitals.evasion, -30);

  // A lock is per target, and does not wipe another target's lock.
  const lock = actionOutcome('lock_on_target', 3,
    { vitals: { targetLocks: { e1: 5 } } }, { targetId: 'e2' });
  assert.deepEqual(lock.vitals.targetLocks, { e1: 5, e2: 15 });

  // An augury records the scan, which is what makes the enemy readable.
  const scan = actionOutcome('active_augury', 1, ship, { targetId: 'e1' });
  assert.deepEqual(scan.vitals.scans, ['e1']);
  // scanning twice does not duplicate
  assert.deepEqual(
    actionOutcome('active_augury', 1, { vitals: { scans: ['e1'] } }, { targetId: 'e1' })
      .vitals.scans, ['e1']);
  // and it needs something to aim at
  const noTarget = actionOutcome('active_augury', 2, ship, {});
  assert.equal(noTarget.needsTarget, true);
  assert.equal(noTarget.vitals, null);

  assert.equal(actionOutcome('backs_into_it', 2, ship).vitals.crewRatingBuff, 10);

  // Hold Fast restores morale and cannot push it past 100.
  assert.equal(actionOutcome('hold_fast', 2, ship).vitals.morale, 93);
  assert.equal(actionOutcome('hold_fast', 9, { vitals: { morale: 99 } }).vitals.morale, 100);

  assert.equal(actionOutcome('prepare_to_repel', 0, ship).vitals.diceModifiers.boarding, 10);

  // Triage mitigates damage that has not happened yet, so it is recorded for
  // the next Population loss rather than applied now.
  const triage = actionOutcome('triage', 2, ship);
  assert.equal(triage.vitals.diceModifiers.triage, 3);
  assert.equal(triage.vitals.population, undefined);

  // Machine Spirit buffs a named system without clobbering another buff.
  const spirit = actionOutcome('aid_machine_spirit', 2,
    { vitals: { diceModifiers: { boarding: 10 } } }, { system: 'port1' });
  assert.deepEqual(spirit.vitals.diceModifiers, { boarding: 10, port1: 10 });

  // An unknown action writes nothing.
  const bad = actionOutcome('summon_squiggoth', 3, ship);
  assert.equal(bad.unknown, true);
  assert.equal(bad.vitals, null);
}

// Every action in the table produces an outcome, so none is a dead button.
for (const a of EXTENDED_ACTIONS) {
  const r = actionOutcome(a.id, 1, { vitals: { hullIntegrity: 10, morale: 50 } },
    { targetId: 'e1', maxHull: 60, system: 'ship' });
  assert.equal(r.unknown, false, a.id + ' has an outcome');
  assert.ok(r.vitals && Object.keys(r.vitals).length, a.id + ' writes something');
  // ...and only fields EVERY role permitted to take it owns. Checking just
  // the first role hid that Aid the Machine Spirit writes diceModifiers,
  // which the Enginseer did not own.
  for (const role of a.roles) {
    assert.deepEqual(deniedWrites(role, Object.keys(r.vitals)), [],
      `${a.id}: ${role} cannot write what the action produces`);
  }
}

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

/* ---- a critical applies its row, it does not just name it ---- */

// Every entry has to produce a patch, or the table is decoration again. The
// two that need a component to aim at are the exceptions, and they say so.
{
  const ship = {
    hullIntegrity: 40, population: 80, morale: 75, speed: 7, detection: 30,
    power: 45, voidShields: 2
  };
  const dice = { d5: () => 3, d10: () => 4, d100: () => 62, component: 'weap-lance' };
  for (const c of CRITICALS) {
    const r = applyCritical(ship, c.roll, dice);
    assert.equal(r.unknown, false, 'critical ' + c.roll + ' is unhandled');
    assert.ok(r.vitals && Object.keys(r.vitals).length,
      'critical ' + c.roll + ' changes nothing');
  }
  // Without a component, the rows that need one say what the GM must pick
  // rather than silently doing nothing.
  const noTarget = applyCritical(ship, 7, { ...dice, component: null });
  assert.deepEqual(noTarget.vitals, {});
  assert.match(noTarget.notes.join(' '), /component/i);
}

// The individual rows, since each one is a different kind of patch.
{
  const ship = {
    hullIntegrity: 40, population: 80, morale: 75, speed: 7, detection: 30,
    power: 45, voidShields: 2, armour: 18
  };
  const dice = { d5: () => 3, d10: () => 4, d100: () => 62, component: 'weap-lance' };
  const at = (roll) => applyCritical(ship, roll, dice);

  assert.equal(at(1).vitals.population, 77);                  // Depressurized
  assert.equal(at(1).vitals.componentStatus['weap-lance'], 'damaged');

  assert.equal(at(2).vitals.morale, 72);                      // Fire!
  assert.equal(at(2).vitals.fires.length, 1, 'and a fire starts burning');

  assert.equal(at(3).vitals.detection, 10);                   // Sensors Damaged
  assert.ok(at(3).vitals.conditions.includes(CONDITIONS.ethericsDown));

  assert.equal(at(4).vitals.speed, 3);                        // Thrusters Damaged
  assert.equal(at(4).vitals.manoeuvrePenalty, 20);

  // Armour Cracked is stored as a penalty, not by rewriting the hull's armour,
  // because the hull is shared data and the damage belongs to this ship.
  assert.equal(at(5).vitals.armourDamage, 3);
  assert.equal(at(5).vitals.armour, undefined);

  assert.equal(at(6).vitals.voidShields, 0);                  // Shield Collapse
  assert.ok(at(6).vitals.conditions.includes(CONDITIONS.shieldsCollapsed));

  assert.equal(at(7).vitals.componentStatus['weap-lance'], 'destroyed');

  assert.equal(at(8).vitals.morale, 71);                      // Bridge Smashed
  assert.equal(at(8).vitals.population, 77);
  assert.ok(at(8).vitals.conditions.includes(CONDITIONS.noExtendedActions));

  assert.equal(at(9).vitals.power, 0);                        // Drive Damaged
  assert.equal(at(9).vitals.speed, 0);
  assert.ok(at(9).vitals.conditions.includes(CONDITIONS.adrift));

  assert.equal(at(10).vitals.hullIntegrity, 0);               // Annihilation
  assert.match(at(10).notes.join(' '), /62 damage/, 'survivors take the 1d100');

  // Population and Morale are percentages and cannot run past their ends.
  const dying = applyCritical({ population: 2, morale: 1 }, 8,
    { d5: () => 5, d10: () => 9 });
  assert.equal(dying.vitals.population, 0);
  assert.equal(dying.vitals.morale, 0);

  // Speed cannot go negative either.
  assert.equal(applyCritical({ speed: 2 }, 4, { d10: () => 9 }).vitals.speed, 0);

  // A stat the crew has not published falls back to the hull's figure, or
  // Sensors Damaged reads a Detection of -20 on a hull that has 47.
  assert.equal(applyCritical({}, 3, { base: { detection: 47 } }).vitals.detection, 27);
  assert.equal(applyCritical({}, 3, {}).vitals.detection, -20,
    'with no hull figure there is nothing to fall back to');
  assert.equal(applyCritical({}, 4, { d10: () => 3, base: { speed: 8 } }).vitals.speed, 5);
  assert.equal(applyCritical({ detection: 30 }, 3, { base: { detection: 47 } }).vitals.detection, 10,
    'a published value wins over the hull');

  // Conditions accumulate rather than replacing what is already there.
  const twice = applyCritical({ conditions: [CONDITIONS.adrift] }, 6, dice);
  assert.deepEqual(twice.vitals.conditions,
    [CONDITIONS.adrift, CONDITIONS.shieldsCollapsed]);

  // A roll off the table is reported, not applied.
  assert.equal(applyCritical(ship, 0, dice).unknown, true);
}

// Shields come back every round, unless a collapse took them for the combat.
assert.equal(shieldsRestorable({ conditions: [] }), true);
assert.equal(shieldsRestorable({}), true);
assert.equal(shieldsRestorable({ conditions: [CONDITIONS.shieldsCollapsed] }), false);

// Every field a critical writes has to be a field the bridge accepts, or the
// GM's own patch comes back refused — which is how voidShields was caught
// crossing the wire as an unwritable field during a live session.
{
  const ship = { hullIntegrity: 40, population: 80, morale: 75, speed: 7,
    detection: 30, power: 45, voidShields: 2 };
  const dice = { d5: () => 3, d10: () => 4, d100: () => 62, component: 'weap-lance' };
  for (const c of CRITICALS) {
    const keys = Object.keys(applyCritical(ship, c.roll, dice).vitals || {});
    assert.deepEqual(deniedWrites('lordcaptain', keys, { isGm: true }), [],
      'critical ' + c.roll + ' writes a field the bridge refuses: ' + keys.join(', '));
  }
  // And the persistent damage lands on the station that repairs it.
  assert.deepEqual(
    deniedWrites('enginseer', ['armourDamage', 'manoeuvrePenalty', 'conditions', 'voidShields']),
    []);
}

console.log('voidcombat: all checks passed (%d actions, %d criticals)',
  EXTENDED_ACTIONS.length, CRITICALS.length);
