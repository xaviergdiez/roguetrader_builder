// Self-check for ground combat. Run: node src/groundcombat.check.mjs
import assert from 'node:assert/strict';
import {
  ACTIONS, actionById, SIZE_MODIFIERS, rangeBand, RANGE_MODIFIERS,
  parseWeaponStats, skillTypeFor, weaponProfile, weaponAllowsAction,
  toHit, resolveAttack
} from './groundcombat.js';

/* ---- action economy table is well-formed ---- */

for (const a of ACTIONS) {
  assert.ok(['half', 'full', 'variable'].includes(a.type), `${a.id} has a bad type`);
}
assert.equal(actionById('semi_auto_burst').hitsPerDoS, 0.5);
assert.equal(actionById('nope'), null);

/* ---- range bands ---- */

assert.equal(rangeBand(2, 100), 'point_blank');
assert.equal(rangeBand(3, 100), 'short');     // <= half of 100
assert.equal(rangeBand(50, 100), 'short');
assert.equal(rangeBand(51, 100), 'standard');
assert.equal(rangeBand(100, 100), 'standard');
assert.equal(rangeBand(101, 100), 'long');
assert.equal(rangeBand(200, 100), 'long');
assert.equal(rangeBand(201, 100), 'extreme');
assert.equal(rangeBand(300, 100), 'extreme');
assert.equal(rangeBand(301, 100), 'out');
assert.equal(rangeBand(50, null), 'standard', 'no weapon range: no long/extreme band');
assert.equal(RANGE_MODIFIERS.out, null);

/* ---- weapon stats parse back into structured data ---- */

{
  const lasgun = parseWeaponStats('100m · S/3/– · 1d10+3 E · Pen 0 · Clip 60 · Reliable');
  assert.equal(lasgun.range, 100);
  assert.deepEqual(lasgun.modes, { single: true, semiAuto: 3, fullAuto: null });
  assert.deepEqual(lasgun.damage, { dice: 1, die: 10, bonus: 3, type: 'E' });
  assert.equal(lasgun.pen, 0);
  assert.equal(lasgun.clip, 60);
  assert.deepEqual(lasgun.qualities, ['Reliable']);
}

{
  const stubber = parseWeaponStats('120m · –/–/10 · 1d10+4 I · Pen 3 · Clip 75');
  assert.deepEqual(stubber.modes, { single: false, semiAuto: null, fullAuto: 10 });
}

{
  const monosword = parseWeaponStats('1d10+2 R · Pen 2 · Balanced');
  assert.equal(monosword.range, null);
  assert.equal(monosword.modes, null);
  assert.deepEqual(monosword.damage, { dice: 1, die: 10, bonus: 2, type: 'R' });
  assert.deepEqual(monosword.qualities, ['Balanced']);
}

{
  const plasmaPistol = parseWeaponStats('30m · S/2/– · 1d10+6 E · Pen 6 · Clip 10 · Overheats, Recharge');
  assert.deepEqual(plasmaPistol.qualities, ['Overheats', 'Recharge']);
}

{
  // No parseable line: damage stays null rather than a guessed number.
  const primitive = parseWeaponStats('Primitive');
  assert.equal(primitive.damage, null);
  assert.deepEqual(primitive.qualities, ['Primitive']);
}

/* ---- skill selection ---- */

assert.equal(skillTypeFor('Melee'), 'ws');
assert.equal(skillTypeFor('Pistol'), 'bs');
assert.equal(skillTypeFor('Basic'), 'bs');
assert.equal(skillTypeFor('Heavy'), 'bs');
assert.equal(skillTypeFor('Thrown'), 'bs');
assert.equal(skillTypeFor('Armour'), null);
assert.equal(skillTypeFor(undefined), null);

{
  const lasgun = weaponProfile('good lasgun');
  assert.equal(lasgun.skillType, 'bs');
  assert.equal(lasgun.quality, 'good');
  assert.equal(lasgun.range, 100);

  const monosword = weaponProfile('mono-sword');
  assert.equal(monosword.skillType, 'ws');

  assert.equal(weaponProfile('medikit'), null, 'gear with no kind is not a weapon');
  assert.equal(weaponProfile('nonexistent item'), null);
}

{
  const lasgun = weaponProfile('lasgun');            // S/3/–
  assert.equal(weaponAllowsAction(lasgun, 'standard_attack'), true);
  assert.equal(weaponAllowsAction(lasgun, 'semi_auto_burst'), true);
  assert.equal(weaponAllowsAction(lasgun, 'full_auto_burst'), false);
}

/* ---- to-hit aggregation ---- */

{
  const lasgun = weaponProfile('lasgun');
  const t = toHit({
    baseSkill: 35, weapon: lasgun, size: 'hulking', distanceM: 30,
    situationIds: ['poor_visibility'], aimBonus: 10
  });
  // 35 base, +10 size (hulking), range 30 of 100 -> short (<=50) +10,
  // -20 poor visibility, +10 aim = 45
  assert.equal(t.total, 45);
  assert.equal(t.band, 'short');
}

{
  // A melee weapon never takes a range band.
  const sword = weaponProfile('mono-sword');
  const t = toHit({ baseSkill: 40, weapon: sword, distanceM: 200 });
  assert.equal(t.band, null);
  assert.equal(t.total, 40);
}

{
  // Semi-Auto Burst adds its own +10 to-hit. Distance is standard range
  // (not the default 0, which is point-blank) so only the action's own
  // modifier is in play.
  const lasgun = weaponProfile('lasgun');
  const t = toHit({ baseSkill: 35, weapon: lasgun, distanceM: 60, actionId: 'semi_auto_burst' });
  assert.equal(t.band, 'standard');
  assert.equal(t.total, 45);
}

{
  // distanceM defaults to 0, which is point-blank (2m or less) — not a bug,
  // a firer with no declared distance is assumed to be right on top of the
  // target.
  const lasgun = weaponProfile('lasgun');
  const t = toHit({ baseSkill: 35, weapon: lasgun });
  assert.equal(t.band, 'point_blank');
  assert.equal(t.total, 65);
}

/* ---- resolving the attack: hits scored, capped by burst rate ---- */

{
  const lasgun = weaponProfile('lasgun');            // semiAuto: 3
  // target 45, roll 15 -> 3 degrees of success (tens-digit margin)
  const r = resolveAttack({ target: 45, roll: 15, actionId: 'semi_auto_burst', weapon: lasgun });
  assert.equal(r.success, true);
  assert.equal(r.degrees, 3);
  assert.equal(r.hits, Math.min(1 + Math.floor(3 * 0.5), 3));   // 2, under the cap of 3
  assert.equal(r.locationRoll, 15, 'the d100 passes through unmodified for hitLocation()');
}

{
  const stubber = weaponProfile('heavy stubber');    // fullAuto: 10
  const r = resolveAttack({ target: 60, roll: 5, actionId: 'full_auto_burst', weapon: stubber });
  // 1 + floor(degrees * 1), heavily capped at fullAuto rate of 10
  assert.ok(r.hits <= 10);
}

{
  const sword = weaponProfile('mono-sword');
  const miss = resolveAttack({ target: 40, roll: 97, actionId: 'standard_attack', weapon: sword });
  assert.equal(miss.success, false);
  assert.equal(miss.hits, 0);
}

console.log('groundcombat.check.mjs: all assertions passed');

/* ==============================================================================
   Ground combat events: authorization and state mutation. */

import { authorizeGroundEvent, applyGroundEvent, groundEventById } from './groundcombat.js';

/* ---- authorization ---- */

// The GM may fire anything in the catalogue.
assert.equal(authorizeGroundEvent({ id: 'npc_attack', charId: 'pc1' }, { isGm: true }).ok, true);
assert.equal(authorizeGroundEvent({ id: 'npc_add' }, { isGm: true }).ok, true);

// A non-member is refused outright.
assert.equal(authorizeGroundEvent({ id: 'player_damage', charId: 'pc1' }, {}).reason, 'not_a_member');

// A GM-only event refuses a player even against their own character.
assert.equal(
  authorizeGroundEvent({ id: 'npc_attack', charId: 'pc1' }, { isMember: true, ownCharIds: ['pc1'] }).reason,
  'gm_only'
);

// A player may fire a player-target event against their OWN character...
assert.equal(
  authorizeGroundEvent({ id: 'player_damage', charId: 'pc1' }, { isMember: true, ownCharIds: ['pc1'] }).ok,
  true
);
// ...and never against someone else's.
assert.equal(
  authorizeGroundEvent({ id: 'player_damage', charId: 'pc2' }, { isMember: true, ownCharIds: ['pc1'] }).reason,
  'not_your_character'
);

// npc-target events need no character ownership — any member may fire one.
assert.equal(
  authorizeGroundEvent({ id: 'npc_damage', npcId: 'npc-1' }, { isMember: true, ownCharIds: ['pc1'] }).ok,
  true
);

assert.equal(authorizeGroundEvent({ id: 'nonsense' }, { isGm: true }).reason, 'unknown_event');
assert.equal(groundEventById('player_response').logOnly, true);

/* ---- applying wounds ---- */

{
  // A character with no established max (never joined with wounds mirrored
  // in) cannot take damage — max: 0 clamps it, same rule wounds.js already
  // applies. This is why mirrorPlayerWounds() has to run on join, before any
  // attack lands, not lazily on first hit.
  const combat = { phase: 'extended', order: [], playerVitals: {}, ground: { npcs: [] } };
  const { patch } = applyGroundEvent(combat, { id: 'npc_attack', charId: 'pc1', amount: 4 });
  assert.deepEqual(patch.playerVitals.pc1, { max: 0, damage: 0, critSoFar: 0, updatedAt: patch.playerVitals.pc1.updatedAt });
}

{
  // Damage accumulates against the character's established max.
  const combat = { playerVitals: { pc1: { max: 13, damage: 5, critSoFar: 0 } }, ground: { npcs: [] } };
  const { patch } = applyGroundEvent(combat, { id: 'npc_attack', charId: 'pc1', amount: 4, crit: 2 });
  assert.equal(patch.playerVitals.pc1.damage, 9);
  assert.equal(patch.playerVitals.pc1.critSoFar, 2);
  // Damage taken is clamped to max, same rule as wounds.js's own clamp.
  const overkill = applyGroundEvent(combat, { id: 'npc_attack', charId: 'pc1', amount: 50 });
  assert.equal(overkill.patch.playerVitals.pc1.damage, 13);
}

{
  // Healing subtracts from damage taken, never below 0.
  const combat = { playerVitals: { pc1: { max: 13, damage: 5, critSoFar: 0 } }, ground: { npcs: [] } };
  const { patch } = applyGroundEvent(combat, { id: 'player_heal', charId: 'pc1', amount: 20 });
  assert.equal(patch.playerVitals.pc1.damage, 0);
}

{
  // player_response writes nothing — the log entry is the whole effect.
  const combat = { playerVitals: {}, ground: { npcs: [] } };
  const { patch, fields } = applyGroundEvent(combat, { id: 'player_response', charId: 'pc1' });
  assert.deepEqual(patch, {});
  assert.deepEqual(fields, []);
}

{
  // NPC roster: add, damage, remove.
  let combat = { playerVitals: {}, ground: { npcs: [] } };
  let r = applyGroundEvent(combat, { id: 'npc_add', name: 'Chaos Space Marine', max: 20 });
  combat = { ...combat, ...r.patch };
  const npcId = combat.ground.npcs[0].id;
  assert.equal(combat.ground.npcs[0].name, 'Chaos Space Marine');
  assert.equal(combat.ground.npcs[0].max, 20);

  r = applyGroundEvent(combat, { id: 'npc_damage', npcId, amount: 7 });
  combat = { ...combat, ...r.patch };
  assert.equal(combat.ground.npcs[0].damage, 7);

  r = applyGroundEvent(combat, { id: 'npc_remove', npcId });
  combat = { ...combat, ...r.patch };
  assert.equal(combat.ground.npcs.length, 0);
}

// An unknown npcId is reported rather than silently doing nothing.
{
  const combat = { playerVitals: {}, ground: { npcs: [] } };
  const { unknown } = applyGroundEvent(combat, { id: 'npc_damage', npcId: 'ghost', amount: 5 });
  assert.equal(unknown, true);
}

/* ---- the encounter clock: order, round, and conditions that tick ---- */

import {
  GROUND_CONDITIONS, conditionById, cleanCondition, conditionToll,
  tickConditions, groundInitiative, groundOrder
} from './groundcombat.js';

// 1d10 + Agility Bonus, highest first, ties stable.
assert.equal(groundInitiative(4, 8), 12);
assert.equal(groundInitiative(undefined, 8), 8, 'no bonus is a bonus of nothing');
{
  const order = groundOrder([
    { id: 'a', name: 'Kell', kind: 'pc', agilityBonus: 4, d10: 6 },
    { id: 'b', name: 'Ork', agilityBonus: 3, d10: 7 },
    { id: 'c', name: 'Sniper', agilityBonus: 5, d10: 9 }
  ]);
  assert.deepEqual(order.map((o) => o.name), ['Sniper', 'Kell', 'Ork']);
  assert.equal(order[0].score, 14);
  assert.equal(order[1].kind, 'pc', 'the kind rides along so the strip can mark the party');
  assert.equal(order[2].kind, 'npc', 'and defaults to a hostile');
  // ties keep input order, so the same rolls always produce the same strip
  const tied = groundOrder([
    { id: 'x', name: 'First', agilityBonus: 3, d10: 5 },
    { id: 'y', name: 'Second', agilityBonus: 3, d10: 5 }
  ]);
  assert.deepEqual(tied.map((o) => o.name), ['First', 'Second']);
  assert.deepEqual(groundOrder([]), []);
}

/* ---- conditions ---- */

for (const c of GROUND_CONDITIONS) {
  assert.ok(c.id && c.name && c.note, c.id + ' is incomplete');
}
assert.equal(conditionById('on_fire').perRoundDice, 10);
assert.equal(conditionById('nonsense'), null);

// A condition is clamped the same way everything else off a client is.
assert.deepEqual(cleanCondition({ id: 'prone' }), { id: 'prone', name: 'Prone', rounds: null });
assert.equal(cleanCondition({ id: 'stunned', rounds: '3' }).rounds, 3);
assert.equal(cleanCondition({ id: 'stunned', rounds: -2 }).rounds, null, 'a bad duration lasts until cleared');
assert.equal(cleanCondition({ id: 'not-a-condition' }), null);
assert.equal(cleanCondition(null), null);

// The two that cost Wounds every round, and the rest that do not.
assert.equal(conditionToll([{ id: 'blood_loss' }], () => 7), 1);
assert.equal(conditionToll([{ id: 'on_fire' }], () => 7), 7, 'burning rolls its die');
assert.equal(conditionToll([{ id: 'blood_loss' }, { id: 'on_fire' }], () => 7), 8);
assert.equal(conditionToll([{ id: 'prone' }, { id: 'stunned' }], () => 7), 0);
assert.equal(conditionToll(null), 0);

// Durations come down; open-ended ones do not.
{
  const after = tickConditions([
    { id: 'stunned', rounds: 1 }, { id: 'blinded', rounds: 3 }, { id: 'prone', rounds: null }
  ]);
  assert.deepEqual(after.map((c) => c.id), ['blinded', 'prone'], 'the expired one is gone');
  assert.equal(after[0].rounds, 2);
  assert.deepEqual(tickConditions(null), []);
}

/* ---- running a round end to end ---- */

{
  let combat = {
    playerVitals: { pc1: { max: 12, damage: 0, critSoFar: 0, conditions: [] } },
    ground: { npcs: [], order: [], round: 0, turn: 0 }
  };
  const fixed = { d10: () => 4 };
  const apply = (e) => {
    const r = applyGroundEvent(combat, e, fixed);
    assert.equal(r.unknown, false, e.id + ' was refused');
    combat = { ...combat, ...r.patch };
    return r;
  };

  // Nothing to advance before initiative is rolled.
  assert.equal(applyGroundEvent(combat, { id: 'ground_advance' }, fixed).unknown, true);
  assert.equal(applyGroundEvent(combat, { id: 'ground_initiative', combatants: [] }, fixed).unknown, true);

  apply({ id: 'npc_add', name: 'Ork', max: 15, agilityBonus: 3 });
  const npcId = combat.ground.npcs[0].id;
  assert.deepEqual(combat.ground.npcs[0].conditions, [], 'a hostile arrives clean');
  assert.equal(combat.ground.npcs[0].agilityBonus, 3);

  apply({ id: 'ground_initiative', combatants: [
    { id: 'pc1', name: 'Kell', kind: 'pc', agilityBonus: 4, d10: 8 },
    { id: npcId, name: 'Ork', kind: 'npc', agilityBonus: 3, d10: 2 }
  ] });
  assert.equal(combat.ground.round, 1, 'initiative starts the clock');
  assert.equal(combat.ground.turn, 0);
  assert.deepEqual(combat.ground.order.map((o) => o.name), ['Kell', 'Ork']);

  apply({ id: 'player_condition', charId: 'pc1', condition: { id: 'blood_loss' } });
  apply({ id: 'player_condition', charId: 'pc1', condition: { id: 'stunned', rounds: 1 } });
  apply({ id: 'npc_condition', npcId, condition: { id: 'on_fire' } });

  // Inside the round, nothing ticks.
  apply({ id: 'ground_advance' });
  assert.equal(combat.ground.turn, 1);
  assert.equal(combat.ground.round, 1);
  assert.equal(combat.playerVitals.pc1.damage, 0, 'the toll is charged at the wrap, not per turn');

  // The wrap charges the toll and ages the durations.
  apply({ id: 'ground_advance' });
  assert.equal(combat.ground.round, 2);
  assert.equal(combat.ground.turn, 0);
  assert.equal(combat.playerVitals.pc1.damage, 1, 'Blood Loss costs its Wound');
  assert.deepEqual(combat.playerVitals.pc1.conditions.map((c) => c.id), ['blood_loss'],
    'and Stunned has run out');
  assert.equal(combat.ground.npcs[0].damage, 4, 'the hostile burns for its 1d10');

  // Clearing one leaves the rest.
  apply({ id: 'player_condition', charId: 'pc1', clear: 'blood_loss' });
  assert.deepEqual(combat.playerVitals.pc1.conditions, []);

  // The same condition twice replaces rather than stacking.
  apply({ id: 'npc_condition', npcId, condition: { id: 'on_fire' } });
  assert.equal(combat.ground.npcs[0].conditions.length, 1);

  // A hostile who is not on the board is refused: the id came from the
  // roster, so a miss means the roster moved under the GM.
  assert.equal(applyGroundEvent(combat, { id: 'npc_condition', npcId: 'ghost',
    condition: { id: 'prone' } }, fixed).unknown, true);

  // A character who has not published a Wounds card yet is not refused.
  // The GM's picker offers every member of the dynasty, and refusing here
  // surfaced as "unknown_event" against a name the panel had just listed.
  {
    const r = applyGroundEvent(combat, { id: 'player_condition', charId: 'unwritten',
      condition: { id: 'prone' } }, fixed);
    assert.equal(r.unknown, false);
    assert.deepEqual(r.patch.playerVitals.unwritten.conditions.map((c) => c.id), ['prone']);
    assert.equal(r.patch.playerVitals.unwritten.max, 0, 'no card means no Wounds yet');
  }
}

/* ---- the new events are gated like the rest ---- */

assert.equal(authorizeGroundEvent({ id: 'ground_advance' }, { isGm: true }).ok, true);
assert.equal(authorizeGroundEvent({ id: 'ground_advance' },
  { isMember: true, ownCharIds: ['pc1'] }).reason, 'gm_only', 'the clock is the GM\u2019s');
assert.equal(authorizeGroundEvent({ id: 'ground_initiative' },
  { isMember: true, ownCharIds: ['pc1'] }).reason, 'gm_only');
assert.equal(authorizeGroundEvent({ id: 'player_condition', charId: 'pc1' },
  { isMember: true, ownCharIds: ['pc1'] }).ok, true, 'your own character is yours to mark');
assert.equal(authorizeGroundEvent({ id: 'player_condition', charId: 'pc2' },
  { isMember: true, ownCharIds: ['pc1'] }).reason, 'not_your_character');
assert.equal(authorizeGroundEvent({ id: 'npc_condition', npcId: 'n1' },
  { isMember: true, ownCharIds: ['pc1'] }).ok, true, 'a hostile is anyone\u2019s to mark');

console.log('groundcombat.check.mjs: ground combat events all passed');

/* ---- damage, in both directions, off one resolver ---- */

// The GM's side has always rolled a hostile's damage against a character.
// A character's own attack on a hostile used to be a number typed in by
// hand, which is the one place at the table where armour, Penetration and
// Righteous Fury were applied by a person. Both call it now, so the
// arithmetic has to hold whichever way it is pointed.
{
  const { resolveHits, weaponProfile } = await import('./groundcombat.js');
  const { resolveHit, hitLocation, damageTypeById, furyTriggered } = await import('./crits.js');
  const kit = { resolveHit, hitLocation, damageTypeById, furyTriggered };

  // Every die shows its maximum, so the figures below are exact.
  const maxed = (n) => n;
  const weapon = weaponProfile('chainsword');       // 1d10+2 R, Pen 2
  assert.ok(weapon && weapon.damage, 'the roster weapon resolves to a damage line');

  // A label with no gear.js entry resolves to nothing at all, which is why
  // WeaponLine prints "adjudicate by hand" rather than an empty stat line.
  assert.equal(weaponProfile('big choppa'), null);

  // One hit, soak subtracted once: damage - max(0, armour - pen) - TB.
  {
    const dmg = weapon.damage.dice * weapon.damage.die + weapon.damage.bonus;
    const soak = Math.max(0, 4 - (weapon.pen || 0)) + 3;
    const r = resolveHits({ weapon, hits: 1, locationRoll: 50, armour: 4, toughnessBonus: 3,
      wounds: 99, critSoFar: 0, ...kit, d: maxed });
    assert.equal(r.totalTaken, Math.max(0, dmg - soak), 'armour and TB both come off, once');
    assert.equal(r.critGained, 0, 'nothing overflows while Wounds remain');
  }

  // Armour that outclasses the weapon stops it dead rather than healing.
  {
    const r = resolveHits({ weapon, hits: 3, locationRoll: 50, armour: 200, toughnessBonus: 0,
      wounds: 10, critSoFar: 0, ...kit, d: maxed });
    assert.equal(r.totalTaken, 0);
    assert.equal(r.woundsLeft, 10, 'and the target is untouched');
  }

  // A miss resolves to nothing: the caller passes hits 0 rather than branching.
  assert.deepEqual(
    (({ totalTaken, critGained }) => ({ totalTaken, critGained }))(
      resolveHits({ weapon, hits: 0, armour: 0, toughnessBonus: 0, wounds: 10, ...kit, d: maxed })),
    { totalTaken: 0, critGained: 0 });

  // A weapon with no parseable stats line costs nothing automatically — that
  // is what the by-hand field beside the resolver is for.
  assert.equal(resolveHits({ weapon: { label: 'relic', damage: null }, hits: 2,
    armour: 0, toughnessBonus: 0, wounds: 10, ...kit, d: maxed }).totalTaken, 0);

  // Past zero Wounds the excess becomes Critical damage, and a burst's later
  // hits land on what the earlier ones left: the whole point of chaining.
  {
    const r = resolveHits({ weapon, hits: 2, locationRoll: 50, armour: 0, toughnessBonus: 0,
      wounds: 1, critSoFar: 0, ...kit, d: maxed });
    assert.equal(r.woundsLeft, 0);
    assert.ok(r.critGained > 0, 'the overflow is Critical damage');
    assert.equal(r.critTotal, r.critGained, 'counted from a clean start');
    assert.ok(r.rows.length > 0, 'and it names the crit rows it caused');
  }

  // critSoFar carries in: a target already on 5 does not re-suffer rows 1-5.
  {
    const fresh = resolveHits({ weapon, hits: 1, locationRoll: 50, armour: 0, toughnessBonus: 0,
      wounds: 0, critSoFar: 0, ...kit, d: maxed });
    const hurt = resolveHits({ weapon, hits: 1, locationRoll: 50, armour: 0, toughnessBonus: 0,
      wounds: 0, critSoFar: 5, ...kit, d: maxed });
    assert.equal(hurt.critTotal, hurt.critGained + 5, 'the total counts from where it was');
    assert.notDeepEqual(fresh.rows.map((x) => x.level), hurt.rows.map((x) => x.level));
  }

  // The dice are injected: the same call with the same dice gives the same
  // answer, which is what makes any of the above reproducible at all.
  {
    const once = () => resolveHits({ weapon, hits: 2, locationRoll: 50, armour: 2,
      toughnessBonus: 2, wounds: 50, critSoFar: 0, ...kit, d: () => 4 });
    assert.deepEqual(once(), once());
  }

  // A character's attack resolves through npcAttackRoll with their own sheet
  // in the NPC's shape — the reason no second roller exists for the player.
  {
    const { npcAttackRoll } = await import('./groundcombat.js');
    const atk = npcAttackRoll({ ws: 45, bs: 30, weapon: 'chainsword' },
      { size: 'average', distanceM: 0, roll: 5 });
    assert.ok(atk && atk.success, 'a 5 against a WS of 45 or better hits');
    assert.equal(atk.weapon.skillType, 'ws', 'a chainsword reads Weapon Skill');
    assert.equal(npcAttackRoll({ bs: 30, weapon: 'chainsword' }, { roll: 5 }), null,
      'no Weapon Skill on the sheet, no melee attack');
  }
}

console.log('groundcombat.check.mjs: damage resolver passed');

/* ---- Inquisitor mechanics: ammo, jams, pinning, between turns ---- */
{
  const { ammoCost, spendAmmo, jamCheck, reload, pinningTest, betweenTurns, actionById } =
    await import('./groundcombat.js');
  const rifle = { skillType: 'bs', clip: 60, modes: { single: true, semiAuto: 3, fullAuto: 10 }, qualities: [] };
  assert.equal(ammoCost(rifle, 'standard_attack'), 1);
  assert.equal(ammoCost(rifle, 'semi_auto_burst'), 3);
  assert.equal(ammoCost(rifle, 'full_auto_burst'), 10);
  assert.equal(ammoCost({ skillType: 'ws', clip: null }, 'standard_attack'), 0, 'melee spends nothing');
  assert.equal(spendAmmo(5, 3), 2);
  assert.equal(spendAmmo(2, 3), null, 'a short clip cannot pay');
  assert.equal(reload(rifle), 60);

  assert.equal(jamCheck(rifle, 95).jammed, false);
  assert.equal(jamCheck(rifle, 96).jammed, true);
  assert.equal(jamCheck(rifle, 94, 'full_auto_burst').jammed, true, 'bursts jam on 94+');
  assert.equal(jamCheck({ ...rifle, qualities: ['Reliable'] }, 99).jammed, false);
  assert.equal(jamCheck({ ...rifle, qualities: ['Reliable'] }, 100).jammed, true);
  assert.equal(jamCheck({ ...rifle, qualities: ['Unreliable'] }, 91).jammed, true);
  const plasma = { ...rifle, qualities: ['Overheats'] };
  assert.equal(jamCheck(plasma, 91).overheated, true);
  assert.equal(jamCheck(plasma, 91).jammed, false);
  assert.equal(jamCheck(plasma, 90).overheated, false);

  assert.ok(actionById('suppressing_fire'), 'Suppressing Fire is a listed action');
  assert.equal(actionById('suppressing_fire').suppresses, true);
  assert.equal(pinningTest({ willpower: 40, roll: 30 }).pinned, false);
  assert.equal(pinningTest({ willpower: 40, roll: 70 }).pinned, true);
  assert.equal(pinningTest({ blast: true }).pinned, true, 'a blast pins without a test');

  const report = betweenTurns([
    { id: 'a', name: 'A', conditions: [{ id: 'blood_loss', name: 'Blood Loss', rounds: 1 }] },
    { id: 'b', name: 'B', conditions: [] }
  ]);
  assert.equal(report[0].toll, 1);
  assert.deepEqual(report[0].expired, ['Blood Loss']);
  assert.equal(report[1].toll, 0);

  // the round wrap publishes the report on ground.between
  const combat = {
    playerVitals: { pc1: { max: 12, damage: 0, critSoFar: 0, conditions: [{ id: 'blood_loss', rounds: 1 }] } },
    ground: { npcs: [], order: [{ id: 'pc1', name: 'P' }], round: 1, turn: 0 }
  };
  const wrapped = applyGroundEvent(combat, { id: 'ground_advance' }, { d10: () => 5 });
  assert.equal(wrapped.patch.ground.between.length, 1);
  assert.equal(wrapped.patch.playerVitals.pc1.damage, 1);
  assert.equal(applyGroundEvent(combat, { id: 'pinning_prompt' }, {}).unknown, false);
}
console.log('groundcombat.check.mjs: inquisitor mechanics passed');
