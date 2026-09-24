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

console.log('groundcombat.check.mjs: ground combat events all passed');
