// Ship roles, and what each one is allowed to change.
//
// The bridge is the shared state; a role is the permission token that says
// which part of it a player may touch. The Master of Ordnance can take target
// locks and cannot repair the drive; the Enginseer Prime can bring a component
// back online and cannot change heading. The Lord-Captain can override
// anything, which is the one role that has to be granted deliberately.
//
// This is the authority for permissions, and it is pure so the same check runs
// in the client (to grey out a control) and on the server (to refuse a write).
// A client-side check alone is decoration: anyone can post the payload.
//
// See shiproles.check.mjs.

// Mutable fields of the shared ship state. A role names the ones it owns.
export const SHIP_FIELDS = [
  'morale', 'population', 'hullIntegrity', 'power', 'componentStatus',
  'speed', 'heading', 'evasion', 'targetLocks', 'detection', 'jamming',
  'translation', 'profitFactor', 'crewRatingBuff', 'fires',
  // Spent absorbing a hit, restored when the turn wraps. It was missing from
  // this list, which meant every dice roll in a live session published a field
  // the check refused — even for the GM, since an unknown field is refused
  // outright rather than waved through.
  'voidShields',
  // Persistent damage the critical table inflicts on stats the hull otherwise
  // supplies: Armour Cracked and Thrusters Damaged are reductions that last
  // until repaired, so they are stored as penalties rather than by rewriting
  // the hull. `conditions` holds the table's flags — shields collapsed for the
  // combat, no Extended Actions next turn, adrift.
  'armourDamage', 'manoeuvrePenalty', 'conditions',
  // What the crew's augurs have revealed. Held apart from the fleet itself,
  // which is the GM's: a scan is something the crew learns, not something they
  // may edit about the enemy.
  'scans',
  // ponytail: diceModifiers is a shared bag — several stations grant buffs
  // into it, each under its own key, and a write replaces the whole object.
  // Two buffs in the same second would see the last one win. Fine for five
  // people taking turns; if it ever matters, move to per-key writes.
  'diceModifiers',
  // GM-only: no station owns these
  'phase', 'enemies'
];

const R = (id, name, career, department, fields, action) => ({
  id, name, career, department, fields, action
});

export const SHIP_ROLES = [
  R('lordcaptain', 'Lord-Captain', 'Rogue Trader', 'The Bridge & overall command',
    // '*' is an override, not a shortcut for listing everything: it is what
    // lets the Captain countermand a department mid-action.
    ['*'],
    { name: 'Exceptional Leader', test: 'Command',
      effect: 'Grants +10 to any one player’s test this turn.',
      writes: ['diceModifiers'] }),

  R('firstofficer', 'First Officer', 'Seneschal (or any)', 'Discipline & internal security',
    ['morale', 'crewRatingBuff', 'population', 'diceModifiers'],
    { name: 'Put Your Backs Into It!', test: 'Command',
      effect: 'Modifies the NPC crew’s Base Skill by +5 per Degree of Success.',
      writes: ['crewRatingBuff'] }),

  R('enginseer', 'Enginseer Prime', 'Explorator', 'Enginarium, plasma drive, tech-shrines',
    ['hullIntegrity', 'power', 'componentStatus', 'fires', 'diceModifiers',
      'voidShields', 'armourDamage', 'manoeuvrePenalty', 'conditions'],
    { name: 'Emergency Repairs', test: 'Tech-Use',
      effect: 'Restores 1d5 Hull Integrity, or douses fires.',
      writes: ['hullIntegrity', 'fires'] }),

  R('helmsman', 'Master Helmsman', 'Void-Master', 'Helm, manoeuvre thrusters, void-augurs',
    ['speed', 'heading', 'evasion'],
    { name: 'Evasive Manoeuvres', test: 'Pilot (Space Craft)',
      effect: 'Attackers take a penalty equal to 10 × Degrees of Success.',
      writes: ['evasion'] }),

  R('ordnance', 'Master of Ordnance', 'Arch-Militant', 'Gunnery decks, macrobatteries, lances',
    ['targetLocks', 'diceModifiers'],
    { name: 'Lock on Target', test: 'Scrutiny + Detection',
      effect: 'Grants a global +5 to hit the target per Degree of Success.',
      writes: ['targetLocks', 'diceModifiers'] }),

  R('etherics', 'Master of Etherics', 'Void-Master', 'Sensorium & vox-casters',
    ['detection', 'jamming', 'scans'],
    { name: 'Focused Augury', test: 'Scrutiny + Detection',
      effect: 'Identifies vulnerable components on an enemy ship.',
      writes: ['detection', 'scans'] }),

  R('factotum', 'High Factotum', 'Seneschal', 'Vaults, logistics, press-gangs',
    ['morale', 'profitFactor', 'population'],
    { name: 'Fiske’s Share', test: 'Commerce',
      effect: 'Restores 1d5 Morale by deploying luxury supplies.',
      writes: ['morale'] }),

  R('warpguide', 'Warp Guide', 'Navigator', 'The Navigator’s spire, warp engine',
    ['translation', 'speed'],
    { name: 'Manoeuvre in the Warp', test: 'Perception + Navigation (Warp)',
      effect: 'Evades a warp storm.',
      writes: ['translation'] }),

  R('choirmaster', 'Choir-Master', 'Astropath Transcendent', 'Astropathic choir chambers',
    ['jamming', 'detection'],
    { name: 'Telepathic Jamming', test: 'Opposed Willpower',
      effect: 'Severs enemy comms, crippling coordinated strikes.',
      writes: ['jamming'] }),

  R('chirurgeon', 'Chief Chirurgeon', 'Missionary', 'Medicae decks, triage',
    ['population', 'morale', 'diceModifiers'],
    { name: 'Triage', test: 'Medicae',
      effect: 'Halves Population damage from a hull breach or macro-strike.',
      writes: ['population'] })
];

export const roleById = (id) => SHIP_ROLES.find((r) => r.id === id) || null;

/* Stations a player may not take.

   The Rogue Trader is the GM's character: they hold the Warrant, they decide
   where the ship goes, and the Lord-Captain's override exists so the GM can
   countermand a department mid-action. A player holding it would be able to
   overrule every other player, which is not a station so much as a second GM.

   The GM seats it like any other officer from their roster. */
export const GM_ONLY_ROLES = ['lordcaptain'];

export const isGmOnlyRole = (id) => GM_ONLY_ROLES.includes(id);

// The stations offered to a player.
export const playerRoles = () => SHIP_ROLES.filter((r) => !isGmOnlyRole(r.id));

// The roles a career is the obvious fit for, most apt first. A suggestion for
// the UI, not a restriction: the First Officer's career is explicitly "any",
// and a crew short of players doubles up.
export function rolesForCareer(career) {
  const want = String(career || '').split('(')[0].trim().toLowerCase();
  if (!want) return [];
  return SHIP_ROLES.filter((r) =>
    r.career.toLowerCase().split('(')[0].trim() === want);
}

/* --------------------------------- the GM ---------------------------------
   Station and GM are orthogonal on purpose.

   A station says which department you command. GM is the authority to override
   any department AND to make the things happen that no station can: a hull
   breach, a fire, a boarding party, a warp storm. The two come apart in play —
   a group where a player captains the ship still needs someone to throw the
   warp storm at them — so folding "GM" into the Lord-Captain station would
   leave that group unable to run an encounter. Where the GM also plays the
   Rogue Trader, one person simply holds both.

   The GM is the dynasty's creator. That is recorded on the dynasty, not here:
   this module only answers what a GM is allowed to do. */

// What a GM can trigger, and which fields each one writes. The fields matter
// because the same all-or-nothing rule applies: an event is applied whole.
const E = (id, name, writes, note) => ({ id, name, writes, note });

export const GM_EVENTS = [
  E('hull_breach', 'Hull breach', ['hullIntegrity', 'population'],
    'Atmosphere and crew go out through the hole.'),
  E('fire', 'Fire', ['fires'],
    'Burns until damage control reaches it.'),
  E('macro_strike', 'Macrobattery strike', ['hullIntegrity', 'population'],
    'A broadside lands.'),
  E('lance_strike', 'Lance strike', ['hullIntegrity', 'componentStatus'],
    'Ignores armour; tends to take a component with it.'),
  E('boarding', 'Boarding action', ['population', 'morale'],
    'Hand-to-hand through the decks.'),
  E('warp_storm', 'Warp storm', ['translation', 'hullIntegrity', 'morale'],
    'The Immaterium turns on the ship.'),
  E('morale_shock', 'Morale shock', ['morale'],
    'Something the crew should not have seen.'),
  E('plague', 'Plague', ['population'],
    'Attrition through the lower decks.'),
  E('component_damage', 'Component damaged', ['componentStatus', 'power'],
    'Takes a system offline until repaired.'),
  E('advance_phase', 'Advance the phase', ['phase'],
    'Command & Engineering, then Manoeuvre, then Shooting.'),
  E('enemy_update', 'Enemy ships', ['enemies'],
    'Add, damage or remove an opposing ship.')
];

export const eventById = (id) => GM_EVENTS.find((e) => e.id === id) || null;

// Only a GM triggers events. A station never does, whatever it owns —
// otherwise the Enginseer, who owns `fires`, could start one.
export const canTriggerEvent = (eventId, isGm) => Boolean(isGm) && Boolean(eventById(eventId));

/* ------------------------------ permissions ------------------------------ */

// Declared above `can` rather than below it: a const read during module
// evaluation from a position above its declaration is a TDZ error, and this
// project has already had one of those blank every screen.
export const GM_ONLY_FIELDS = ['phase', 'enemies'];

// May this actor write this field?
//
// isGm is checked before the station, so a GM needs no station at all — which
// is the normal case for a GM running NPC ships.
export function can(roleId, field, { isGm = false } = {}) {
  if (!SHIP_FIELDS.includes(field)) return false;   // unknown field, not a typo to honour
  if (isGm) return true;
  const role = roleById(roleId);
  if (!role) return false;
  // no station owns the GM-only fields, so '*' must not reach them either:
  // the Lord-Captain commands the ship, they do not author the encounter
  if (GM_ONLY_FIELDS.includes(field)) return false;
  return role.fields.includes('*') || role.fields.includes(field);
}

// Which of an action's writes this actor may not make. Empty means the whole
// payload is permitted; anything else should be refused as a unit rather than
// applied in part, or a half-executed order leaves the ship in a state no
// player chose.
export function deniedWrites(roleId, fields, opts) {
  return (fields || []).filter((f) => !can(roleId, f, opts));
}

/* --------------------------- delegating to crew ---------------------------
   A player either rolls their own skill and owns the consequence, or orders
   the department to do it and rolls against the crew's Base Skill. The
   Captain's and First Officer's buffs raise that target for the turn. */

export function crewTarget(baseRating, buff = 0) {
  const base = Number(baseRating) || 0;
  const n = base + (Number(buff) || 0);
  return Math.max(0, Math.min(100, n));
}

// The maths for the signature actions — evasion, target locks, crew buffs —
// lives in voidcombat.js, next to the to-hit calculation that consumes it.
//
// It was briefly duplicated here, and the copy was wrong: evasion was written
// as -10 per Degree of Success when the rule is -10 AND a further -10 per
// degree, capped at -50. Two copies of a formula is one copy too many.
export {
  evasionPenalty, lockBonus, backsIntoItBonus as backsIntoIt
} from './voidcombat.js';
