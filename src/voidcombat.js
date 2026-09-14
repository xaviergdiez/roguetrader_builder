// Void combat: the to-hit number, the attack resolution, criticals, and what
// a GM event does to a ship's vitals.
//
// THE ORDER OF DEFENCES IS THE WHOLE THING
//
//   turrets  -> void shields -> armour
//
// and armour comes off the COMBINED damage, not off each hit. That distinction
// decides most exchanges: four hits of 8 against Armour 16 is 32 - 16 = 16
// damage, where subtracting armour per hit would have been nothing at all.
// An earlier pass here did it per hit and made every macrobattery useless.
//
// Damage rolls arrive as RAW DICE, with the weapon's bonus added here, because
// a critical needs to see a natural 10 on a die — which a pre-totalled 12
// hides.
//
// Dice are injected rather than rolled here, so the same resolution runs for a
// player's shot, the GM's NPC ship, and a test. See voidcombat.check.mjs.

import { componentById, targetSizeModifier, evadesFreely } from './ship.js';

/* --------------------------------- the turn --------------------------------- */

export const PHASES = ['extended', 'manoeuvre', 'shooting', 'damage_control'];

export const PHASE_LABELS = {
  extended: 'Extended Actions',
  manoeuvre: 'Manoeuvre',
  shooting: 'Shooting',
  damage_control: 'Damage Control'
};

export const nextPhase = (phase) => {
  const i = PHASES.indexOf(phase);
  return i === -1 ? PHASES[0] : PHASES[(i + 1) % PHASES.length];
};

// 1d10 + Detection/10, highest first. The die is passed in.
export const initiative = (detection, d10) =>
  (Number(d10) || 0) + Math.floor((Number(detection) || 0) / 10);

// Highest first; ties keep their original order so the result is stable.
export function initiativeOrder(ships) {
  return (ships || [])
    .map((s, i) => ({ ...s, ix: i, score: initiative(s.detection, s.d10) }))
    .sort((a, b) => (b.score - a.score) || (a.ix - b.ix))
    .map(({ ix, ...rest }) => rest);
}

/* ------------------------------ extended actions ------------------------------
   Phase one: what each terminal can do. Roles are the gate; the effect is what
   the payload writes. Kept as data so a dashboard can render the buttons and
   the server can check the role in one place. */

const A = (id, name, roles, skill, effect, writes) =>
  ({ id, name, roles, skill, effect, writes });

export const EXTENDED_ACTIONS = [
  A('aid_machine_spirit', 'Aid the Machine Spirit', ['enginseer'], 'Tech-Use',
    '+5 to a ship characteristic per Degree of Success, this turn.',
    ['diceModifiers']),
  A('emergency_repairs', 'Emergency Repairs', ['enginseer'], 'Tech-Use (-10)',
    'Restores 1 + DoS Hull Integrity, or puts out one fire.',
    ['hullIntegrity', 'fires']),
  A('evasive_manoeuvres', 'Evasive Manoeuvres', ['helmsman'], 'Pilot (Space Craft)',
    'Incoming attacks suffer -10 and a further -10 per DoS, to a maximum of -50.',
    ['evasion']),
  A('lock_on_target', 'Lock on Target', ['ordnance'], 'Scrutiny + Detection',
    '+5 to hit that target per DoS.',
    ['targetLocks', 'diceModifiers']),
  A('active_augury', 'Active Augury', ['etherics'], 'Scrutiny + Detection',
    'Reveals a target’s weapons, Hull Integrity and active Void Shields.',
    ['detection']),
  A('focused_augury', 'Focused Augury', ['etherics'], 'Scrutiny + Detection (-10)',
    'The next critical against that ship is chosen by the attacker, not rolled.',
    ['detection']),
  A('backs_into_it', 'Put Your Backs Into It!', ['firstofficer', 'lordcaptain'],
    'Command / Intimidate',
    'Crew Rating +5 per DoS this turn. Failing by 3 or more costs 1 Morale.',
    ['crewRatingBuff', 'morale']),
  A('hold_fast', 'Hold Fast!', ['lordcaptain'], 'Willpower / Command',
    'Restores 1 Morale, +1 per DoS. Once per combat.',
    ['morale']),
  A('prepare_to_repel', 'Prepare to Repel!', ['firstofficer', 'ordnance'], 'Command',
    '+10 to Command tests against boarding and hit-and-run this turn.',
    ['diceModifiers']),
  A('triage', 'Triage', ['chirurgeon'], 'Medicae',
    'Reduces this turn’s Population loss by 1 + DoS, to a minimum of 0.',
    ['population'])
];

export const actionById = (id) => EXTENDED_ACTIONS.find((a) => a.id === id) || null;

// May this station take this action? The server checks this as well as the
// field permissions — an action is gated by role, its writes by field.
export function mayTakeAction(actionId, roleId, { isGm = false } = {}) {
  const a = actionById(actionId);
  if (!a) return false;
  if (isGm) return true;                    // the GM runs the NPC bridge too
  return a.roles.includes(roleId);
}

/* --------------------------- extended action maths --------------------------- */

const dos = (n) => Math.max(0, Math.floor(Number(n) || 0));

// -10, and a further -10 per Degree of Success, capped at -50.
export const EVASION_CAP = -50;
export function evasionPenalty(degreesOfSuccess) {
  const p = -(10 + 10 * dos(degreesOfSuccess));
  return Math.max(EVASION_CAP, p);
}

export const lockBonus = (degreesOfSuccess) => 5 * dos(degreesOfSuccess);
export const machineSpiritBonus = (degreesOfSuccess) => 5 * dos(degreesOfSuccess);
export const backsIntoItBonus = (degreesOfSuccess) => 5 * dos(degreesOfSuccess);
export const repairAmount = (degreesOfSuccess) => 1 + dos(degreesOfSuccess);
export const holdFastMorale = (degreesOfSuccess) => 1 + dos(degreesOfSuccess);
export const triageReduction = (degreesOfSuccess) => 1 + dos(degreesOfSuccess);

/* ----------------------------------- range ----------------------------------- */

export function rangeBand(distanceVU, weaponRange) {
  const d = Math.max(0, Number(distanceVU) || 0);
  const r = Math.max(0, Number(weaponRange) || 0);
  // No range is not point-blank. Without it, an unnamed weapon reported
  // "short" and collected the +10 for being in a range it does not have.
  if (r <= 0) return 'out';
  if (d > r) return 'out';
  return d <= r / 2 ? 'short' : 'standard';
}

export const RANGE_MODIFIERS = { short: 10, standard: 0, out: null };

export const rangeModifier = (distanceVU, weaponRange) =>
  RANGE_MODIFIERS[rangeBand(distanceVU, weaponRange)];

/* ---------------------------------- to hit ----------------------------------
   Aggregates every situational modifier onto the firer's Ballistic Skill (or
   the NPC Crew Rating when the shot is delegated). Returns the breakdown as
   well as the number, because "why did I miss" is the question a bridge crew
   asks, and a single total cannot answer it. */

export function toHit({
  ballisticSkill = 0,
  weaponId = null,
  weaponRange = null,
  distanceVU = 0,
  targetClass = '',
  lockDoS = 0,
  machineSpiritDoS = 0,
  evadingDoS = null,        // null = the target did not evade
  crippled = false,
  silhouetted = false,
  scatter = false
} = {}) {
  const weapon = componentById(weaponId);
  const range = weaponRange != null ? weaponRange
    : (weapon && Number.isFinite(weapon.range) ? weapon.range : 0);

  const band = rangeBand(distanceVU, range);
  const parts = [];
  const add = (label, value) => { if (value) parts.push({ label, value }); };

  const base = Number(ballisticSkill) || 0;

  const size = targetSizeModifier(targetClass);
  add('Target size', size);

  const rangeMod = RANGE_MODIFIERS[band];
  if (band !== 'out') add('Range', rangeMod);

  add('Lock on Target', lockBonus(lockDoS));
  add('Machine Spirit', machineSpiritBonus(machineSpiritDoS));

  // A crippled ship cannot evade, so the two never both apply.
  const evasion = crippled || evadingDoS == null ? 0 : evasionPenalty(evadingDoS);
  add('Evasive Manoeuvres', evasion);

  if (crippled) add('Crippled target', 10);
  if (silhouetted) add('Silhouetted', 10);
  // Point-blank is 0 VU, and only a Scatter weapon gains from it.
  const pointBlank = Number(distanceVU) === 0 && scatter;
  if (pointBlank) add('Point-blank broadside', 10);

  const total = parts.reduce((n, p) => n + p.value, base);

  return {
    canFire: band !== 'out',
    band,
    target: band === 'out' ? null : total,
    base,
    parts,
    pointBlank
  };
}

// 1 hit for succeeding, +1 per Degree of Success, capped at the weapon's
// Strength. Strength is the cap, not the number of dice.
export function hitsScored(degreesOfSuccess, strength) {
  const str = Math.max(0, Math.floor(Number(strength) || 0));
  return Math.min(1 + dos(degreesOfSuccess), str);
}

/* ------------------------------ attack resolution ------------------------------ */

// Turrets shoot down shells and torpedoes. They cannot touch a lance: the beam
// arrives at lightspeed.
const TURRETS_APPLY = { macro: true, lance: false, torpedo: true };

export function resolveAttack({
  weaponId = null,
  weaponClass = null,
  strength = null,
  damageBonus = null,
  degreesOfSuccess = null,
  hits = null,              // supply hits directly, or degreesOfSuccess + strength
  damageRolls = [],         // RAW dice, one per hit
  pointBlank = false,       // a Scatter weapon at 0 VU deals +2 per hit
  target = {}
} = {}) {
  const weapon = componentById(weaponId);
  const cls = weaponClass || (weapon && weapon.weaponClass) || 'macro';
  const str = strength != null ? strength : (weapon ? weapon.str : 0);
  const bonus = (damageBonus != null ? damageBonus
    : (weapon && Number.isFinite(weapon.damageBonus) ? weapon.damageBonus : 0))
    + (pointBlank ? 2 : 0);

  const scored = hits != null
    ? Math.max(0, Math.floor(Number(hits) || 0))
    : hitsScored(degreesOfSuccess, str);

  const turretRating = Math.max(0, Number(target.turretRating) || 0);
  const shields = Math.max(0, Number(target.voidShields) || 0);
  const armour = Math.max(0, Number(target.armour) || 0);
  const hi = Number(target.hullIntegrity) || 0;

  // 1. Turrets
  const turretsStop = TURRETS_APPLY[cls] ? Math.min(turretRating, scored) : 0;
  const afterTurrets = scored - turretsStop;

  // 2. Void shields — one hit each. Torpedoes ignore them entirely.
  const shieldsStop = cls === 'torpedo' ? 0 : Math.min(shields, afterTurrets);
  const afterShields = afterTurrets - shieldsStop;

  // 3. Damage, summed into one number before armour
  const rolls = Array.isArray(damageRolls) ? damageRolls : [];
  const perHit = [];
  let combined = 0;
  let naturalTen = false;
  for (let i = 0; i < afterShields; i++) {
    const die = Math.max(0, Math.floor(Number(rolls[i]) || 0));
    if (die === 10) naturalTen = true;
    const dmg = die + bonus;
    perHit.push({ die, damage: dmg });
    combined += dmg;
  }

  // 4. Armour, off the combined total. A lance ignores it.
  const ignoresArmour = cls === 'lance';
  const mitigated = ignoresArmour ? 0 : Math.min(armour, combined);
  const netDamage = Math.max(0, combined - mitigated);

  const hullIntegrity = Math.max(0, hi - netDamage);
  const crippledNow = hi > 0 && hi - netDamage <= 0;

  // A critical needs damage through the armour AND a natural 10 on a damage
  // die — or the hull reaching zero, which is a critical on its own.
  const criticalTriggered = (netDamage > 0 && naturalTen) || crippledNow;

  return {
    weapon: weapon ? weapon.name : null,
    weaponClass: cls,
    strength: str,
    hitsScored: scored,
    turretsStop,
    hitsPostTurrets: afterTurrets,
    shieldsStop,
    hitsPostShields: afterShields,
    perHit,
    combinedDamage: combined,
    armour,
    armourMitigation: mitigated,
    ignoresArmour,
    netHullDamage: netDamage,
    hullIntegrity,
    naturalTen,
    criticalTriggered,
    destroyed: crippledNow,
    shieldsRemaining: Math.max(0, shields - shieldsStop)
  };
}

// Turrets versus a torpedo salvo: opposed 1d10 + rating. Each win shoots one
// torpedo down. Dice are injected in pairs.
export function interceptTorpedoes({ turretRating = 0, torpedoRating = 0, rolls = [] } = {}) {
  let stopped = 0;
  const log = [];
  for (const pair of rolls) {
    const t = (Number(pair && pair.turret) || 0) + (Number(turretRating) || 0);
    const p = (Number(pair && pair.torpedo) || 0) + (Number(torpedoRating) || 0);
    const shotDown = t > p;                 // a tie favours the torpedo
    if (shotDown) stopped++;
    log.push({ turret: t, torpedo: p, shotDown });
  }
  return { stopped, log };
}

/* ---------------------------------- criticals ---------------------------------- */

// 1d10, or 1d10 + a modifier once Hull Integrity is gone. Effects are data so
// the dashboard can show what happened and the server can apply it.
const CR = (roll, name, effect, writes) => ({ roll, name, effect, writes });

export const CRITICALS = [
  CR(1, 'Depressurized', 'Population -1d5. A random component is damaged.',
    ['population', 'componentStatus']),
  CR(2, 'Fire!', 'Morale -1d5. The ship catches fire: 1d5 Hull Integrity a turn until doused.',
    ['morale', 'fires']),
  CR(3, 'Sensors Damaged', 'Detection -20. The Master of Etherics can take no actions.',
    ['detection']),
  CR(4, 'Thrusters Damaged', 'Speed -1d10. Manoeuvre -20.',
    ['speed']),
  CR(5, 'Armour Cracked', 'Armour -1d5 until repaired in drydock.',
    ['componentStatus']),
  CR(6, 'Shield Collapse', 'Void Shields drop to 0 and cannot be restored this combat.',
    ['componentStatus']),
  CR(7, 'Component Destroyed', 'One named component is destroyed outright.',
    ['componentStatus', 'power']),
  CR(8, 'Bridge Smashed', 'Morale -1d10. Population -1d5. No Extended Actions next turn.',
    ['morale', 'population', 'phase']),
  CR(9, 'Drive Damaged', 'The plasma drive goes offline. The ship is adrift and Power drops to 0.',
    ['power', 'componentStatus', 'speed']),
  CR(10, 'Annihilation', 'The ship explodes. Survivors take 1d100 damage.',
    ['hullIntegrity', 'population'])
];

// 10 or higher is Annihilation, so a modified roll past the table does not
// fall off the end of it.
export function criticalEffect(roll) {
  const n = Math.floor(Number(roll) || 0);
  if (n >= 10) return CRITICALS[CRITICALS.length - 1];
  return CRITICALS.find((c) => c.roll === n) || null;
}

/* ------------------------------ hit and run ------------------------------
   An opposed Command test. The winner rolls on the critical table and applies
   it straight to the enemy ship, past shields and armour entirely. */

export function hitAndRun({ attackerDoS = 0, defenderDoS = 0, d5 = 1 } = {}) {
  const margin = dos(attackerDoS) - dos(defenderDoS);
  if (margin <= 0) return { success: false, margin, criticalRoll: null, effect: null };
  const roll = Math.max(1, Math.floor(Number(d5) || 1)) + margin;
  return { success: true, margin, criticalRoll: roll, effect: criticalEffect(roll) };
}

/* ------------------------------ boarding action ------------------------------
   Opposed Command tests over several rounds. Both crews bleed every round, and
   the first side to three cumulative Degrees of Success takes the ship. */

export const BOARDING_TARGET = 3;

export function boardingRound(state, { attackerDoS = 0, defenderDoS = 0,
  attackerLosses = {}, defenderLosses = {} } = {}) {
  const prev = state || { attacker: 0, defender: 0 };
  const margin = dos(attackerDoS) - dos(defenderDoS);
  const attacker = prev.attacker + Math.max(0, margin);
  const defender = prev.defender + Math.max(0, -margin);

  const winner = attacker >= BOARDING_TARGET ? 'attacker'
    : defender >= BOARDING_TARGET ? 'defender' : null;

  return {
    attacker,
    defender,
    winner,
    // Both ships take casualties every round the action continues, win or lose.
    losses: {
      attacker: { population: Math.max(0, Number(attackerLosses.population) || 0),
        morale: Math.max(0, Number(attackerLosses.morale) || 0) },
      defender: { population: Math.max(0, Number(defenderLosses.population) || 0),
        morale: Math.max(0, Number(defenderLosses.morale) || 0) }
    }
  };
}

/* --------------------------------- GM events ---------------------------------
   An event is a patch, not a mutation: it returns the fields it changes so the
   caller can check them against the actor's permissions before committing.
   Amounts come from the GM — these are rulings at the table. */

const clamp100 = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

// Reads a vital, defaulting only when it is actually absent.
//
// `Number(s.population) ?? 100` looks right and is not: ?? tests for null and
// undefined, and Number(undefined) is NaN, which it happily passes through.
// A ship with no population recorded then took a breach down to 0 instead of
// starting from a full complement.
const vital = (v, dflt) => (v == null ? dflt : (Number(v) || 0));

export function applyEvent(state, event) {
  const s = state || {};
  const e = event || {};
  const amount = Math.max(0, Math.floor(Number(e.amount) || 0));
  const patch = {};

  switch (e.id) {
    case 'hull_breach':
    case 'macro_strike':
      patch.hullIntegrity = Math.max(0, vital(s.hullIntegrity, 0) - amount);
      // a breach takes crew with it; the GM may pass 0 for a clean hit
      patch.population = clamp100(vital(s.population, 100) - (Number(e.population) || 0));
      break;

    case 'lance_strike':
      patch.hullIntegrity = Math.max(0, vital(s.hullIntegrity, 0) - amount);
      if (e.component) {
        patch.componentStatus = { ...(s.componentStatus || {}), [e.component]: 'damaged' };
      }
      break;

    case 'fire':
      // Fires are a list, because damage control puts them out one at a time.
      patch.fires = [...(s.fires || []), { id: e.fireId || `fire-${Date.now()}`,
        location: e.location || 'unspecified' }];
      break;

    case 'boarding':
      patch.population = clamp100(vital(s.population, 100) - amount);
      patch.morale = clamp100(vital(s.morale, 100) - (Number(e.morale) || 0));
      break;

    case 'warp_storm':
      patch.translation = e.translation || 'immaterium';
      patch.hullIntegrity = Math.max(0, vital(s.hullIntegrity, 0) - amount);
      patch.morale = clamp100(vital(s.morale, 100) - (Number(e.morale) || 0));
      break;

    case 'morale_shock':
      patch.morale = clamp100(vital(s.morale, 100) - amount);
      break;

    case 'plague':
      patch.population = clamp100(vital(s.population, 100) - amount);
      break;

    case 'component_damage':
      patch.componentStatus = { ...(s.componentStatus || {}),
        [e.component]: e.status || 'damaged' };
      // an offline component stops drawing power
      if (Number.isFinite(Number(e.power))) patch.power = Number(e.power);
      break;

    case 'advance_phase':
      patch.phase = nextPhase(s.phase);
      break;

    case 'enemy_update':
      patch.enemies = Array.isArray(e.enemies) ? e.enemies : (s.enemies || []);
      break;

    default:
      return { patch: {}, fields: [], unknown: true };
  }

  return { patch, fields: Object.keys(patch), unknown: false };
}

/* ------------------------------ damage control ------------------------------
   Phase four, and the Enginseer's side of the same coin: fires that were not
   put out keep burning. */

export function applyRepair(state, { hullIntegrity = 0, douse = null, max = Infinity } = {}) {
  const s = state || {};
  const patch = {};
  const restored = Math.max(0, Math.floor(Number(hullIntegrity) || 0));
  if (restored) {
    patch.hullIntegrity = Math.min(max, vital(s.hullIntegrity, 0) + restored);
  }
  if (douse) {
    const before = s.fires || [];
    // reported even when nothing matched, so a stale id does not read as a
    // successful dousing
    patch.fires = before.filter((f) => f.id !== douse);
  }
  return { patch, fields: Object.keys(patch), doused: Boolean(douse) };
}

// Each remaining fire eats Hull Integrity at the end of the turn. The dice are
// injected — one roll per fire.
export function fireDamage(state, rolls = []) {
  const s = state || {};
  const fires = s.fires || [];
  let total = 0;
  fires.forEach((_, i) => { total += Math.max(0, Math.floor(Number(rolls[i]) || 0)); });
  return {
    burning: fires.length,
    damage: total,
    patch: fires.length
      ? { hullIntegrity: Math.max(0, vital(s.hullIntegrity, 0) - total) }
      : {}
  };
}
