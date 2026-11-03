/* A Weapon Skill or Ballistic Skill test made with a weapon in hand.

   The character sheet's roller used to roll a bare d100 and leave the weapon to
   the player: after a hit, the damage dice and the bonus were typed in by hand,
   nothing counted rounds, and a 97 on a lasgun was a miss like any other. The
   Bridge's ground combat already knew better (groundcombat.js has the rules for
   ammunition, jams and overheating, and the parsing of a weapon's stat line),
   but only for a player attacking a hostile on the board. This puts the same
   rules behind the sheet's own roller, so the weapon a character carries is the
   weapon the roll uses:

     - the roll is made at the skill, plus the fire mode's own bonus (a burst is
       easier to land, an all-out attack easier still);
     - it spends the rounds the mode costs, hit or miss, and will not fire an
       empty or jammed weapon;
     - an unmodified 96+ (94+ on a burst) jams it and is a miss however well the
       dice would have done; a Reliable weapon only jams on a further 10, Best
       craftsmanship never jams;
     - a weapon that Overheats does so on 91+, and still shoots;
     - a hit comes with the weapon's damage line, ready to roll, one hit for
       each the mode scored.

   Pure, with the dice passed in: see attackroll.check.mjs. The state it works
   on ({ rounds, jammed } per weapon) is kept by the caller. */

import {
  weaponProfile, ammoCost, spendAmmo, jamCheck, overheatResult, actionById, weaponAllowsAction, resolveAttack
} from './groundcombat.js';
import { damageTypeById } from './crits.js';
import { GEAR } from './gear.js';

/* The attacks a sheet can roll for itself. The rest of the action list needs
   somebody to shoot back at (Overwatch, Suppressing Fire's Pinning tests) or is
   not a test at all (Aim, Reload), and belongs to the Bridge. */
export const ATTACK_ACTION_IDS = {
  bs: ['standard_attack', 'semi_auto_burst', 'full_auto_burst'],
  ws: ['standard_attack', 'charge', 'all_out_attack', 'guarded_attack']
};

/* The weapons a character carries that roll this skill, as parsed profiles.
   `gear` is the sheet's gear list. A weapon with no damage line is left out:
   it could be rolled to hit and then nothing could be done with the hit. */
export function weaponsFor(gear, skillType) {
  const seen = new Set();
  const out = [];
  for (const label of Array.isArray(gear) ? gear : []) {
    if (typeof label !== 'string' || seen.has(label)) continue;
    seen.add(label);
    const w = weaponProfile(label);
    if (w && w.skillType === skillType && w.damage) out.push(w);
  }
  return out;
}

/* Every weapon the gear catalogue holds that rolls this skill, for adding one a
   character is carrying but has not listed. Grouped by the book's kind (Pistol,
   Basic, Melee...) and in alphabetical order inside it. The label is the
   catalogue name with its first letter raised, which gearInfo reads back. */
export function catalogueWeapons(skillType) {
  const out = [];
  for (const key of Object.keys(GEAR)) {
    const label = key.charAt(0).toUpperCase() + key.slice(1);
    const w = weaponProfile(label);
    if (w && w.skillType === skillType && w.damage) out.push({ label, kind: w.kind || 'Other' });
  }
  return out.sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label));
}

// What this weapon can do, in the order a player would reach for them.
export function actionsFor(weapon) {
  if (!weapon) return [];
  return (ATTACK_ACTION_IDS[weapon.skillType] || [])
    .filter((id) => weaponAllowsAction(weapon, id))
    // a weapon that cannot fire single shots (a heavy bolter) has no standard attack
    .filter((id) => !(id === 'standard_attack' && weapon.modes && weapon.modes.single === false))
    .map(actionById);
}

// The action's own bonus to the test: a burst's to-hit, or a melee stance's Weapon Skill.
export const actionBonus = (action, skillType) =>
  (action ? (skillType === 'ws' ? action.wsMod : action.toHitMod) : 0) || 0;

// Rounds in the weapon now: what was left, or a full clip when nothing is recorded. null when it has no clip.
export function roundsLeft(state, weapon) {
  if (!weapon || weapon.clip == null) return null;
  return state && Number.isFinite(state.rounds) ? Math.max(0, state.rounds) : weapon.clip;
}

export const isJammed = (state) => Boolean(state && state.jammed);

/* Whether a weapon can be fired as it stands: not jammed, and with a round in it
   (a weapon with no clip, a blade or a thrown grenade, is always ready). */
export function isReady(weapon, state) {
  if (!weapon || isJammed(state)) return false;
  const left = roundsLeft(state, weapon);
  return left == null || left > 0;
}

/* The weapon to reach for: the first of `weapons` that is ready, not counting
   `except` (the one that just failed), or null when none is. `states` is the
   sheet's whole weapon state, keyed by label. */
export function nextReady(weapons, states, except = null) {
  return (weapons || []).find((w) => w.label !== except && isReady(w, (states || {})[w.label])) || null;
}

/* What a weapon's chip says about it: nothing for a blade, otherwise JAMMED,
   EMPTY, or the rounds left over the clip. */
export function weaponStatus(weapon, state) {
  if (isJammed(state)) return 'JAMMED';
  const left = roundsLeft(state, weapon);
  if (left == null) return '';
  return left === 0 ? 'EMPTY' : `${left}/${weapon.clip}`;
}

/* One attack. `base` is the character's WS or BS, `modifier` what the player
   chose on the difficulty ladder and the toggles, `roll` the d100 and `d10` the
   Reliable confirmation die. Returns `blocked` (with the reason to show) when
   the weapon cannot be fired, and otherwise the whole result, including the
   `patch` to write back to the weapon's state. */
export function attack({ weapon, state = null, base = 0, modifier = 0, actionId = 'standard_attack', roll, d10 = 10 } = {}) {
  if (!weapon) return { blocked: 'none', reason: 'No weapon chosen.' };
  const label = weapon.label;
  if (isJammed(state)) {
    return { blocked: 'jammed', reason: `${label} is jammed. Clear the jam first (a Full Action and a Ballistic Skill Test).` };
  }
  const cost = ammoCost(weapon, actionId);
  const left = roundsLeft(state, weapon);
  if (left != null && spendAmmo(left, cost) == null) {
    return {
      blocked: 'empty',
      reason: `${label} has ${left} round${left === 1 ? '' : 's'}; that needs ${cost}. Reload.`
    };
  }

  const action = actionById(actionId);
  const total = Number(modifier || 0) + actionBonus(action, weapon.skillType);
  const res = resolveAttack({ target: Number(base || 0) + total, roll, actionId, weapon });
  // Craftsmanship rides on the label ("Good Lasgun" is Reliable, "Poor" Unreliable, "Best" never jams).
  const jam = jamCheck(weapon, roll, actionId, { craftsmanship: weapon.quality || 'common', d10 });
  const success = res.success && !jam.jammed;

  const patch = {};
  if (left != null) patch.rounds = left - cost;
  if (jam.jammed) patch.jammed = true;
  return {
    blocked: null,
    weapon: label,
    actionId,
    roll: res.roll,
    target: res.target,
    modifier: total,
    success,
    degrees: res.degrees,
    automatic: res.automatic,
    hits: success ? res.hits : 0,
    cost,
    rounds: left != null ? left - cost : null,
    jam,
    jammed: jam.jammed,
    overheated: jam.overheated,
    overheat: jam.overheated ? overheatResult(weapon) : null,
    patch
  };
}

/* What a hit with this weapon rolls: the dice, the bonus (a melee weapon adds
   the wielder's Strength Bonus, which its own line leaves out; a gun's line is
   complete), the damage type as the hit panel names it, and the Penetration. */
export function damageSpec(weapon, strengthBonus = 0) {
  if (!weapon || !weapon.damage) return null;
  const sb = weapon.skillType === 'ws' ? Math.max(0, Math.floor(Number(strengthBonus) || 0)) : 0;
  return {
    dice: weapon.damage.dice,
    die: weapon.damage.die,
    bonus: (weapon.damage.bonus || 0) + sb,
    strengthBonus: sb,
    type: (damageTypeById(weapon.damage.type) || {}).id || 'impact',
    pen: weapon.pen || 0
  };
}

// The damage an overheating weapon does to its wielder: its own line, rolled, no Penetration.
export function overheatDamage(weapon, d = (n) => 1 + Math.floor(Math.random() * n)) {
  if (!weapon || !weapon.damage) return null;
  const dice = Array.from({ length: weapon.damage.dice }, () => d(weapon.damage.die));
  return { dice, total: dice.reduce((a, b) => a + b, 0) + (weapon.damage.bonus || 0) };
}

/* What reloading and clearing a jam do to a weapon's state: a reload fills the
   clip; a cleared jam leaves the weapon empty, since the round that jammed it
   is lost with the rest (see clearJam in groundcombat.js). */
export const reloaded = (weapon) => (weapon && weapon.clip != null ? { rounds: weapon.clip } : {});
export const jamCleared = (weapon) => ({ jammed: false, ...(weapon && weapon.clip != null ? { rounds: 0 } : {}) });

