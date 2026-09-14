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
  'translation', 'profitFactor', 'crewRatingBuff', 'diceModifiers', 'fires'
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
    ['morale', 'crewRatingBuff', 'population'],
    { name: 'Put Your Backs Into It!', test: 'Command',
      effect: 'Modifies the NPC crew’s Base Skill by +5 per Degree of Success.',
      writes: ['crewRatingBuff'] }),

  R('enginseer', 'Enginseer Prime', 'Explorator', 'Enginarium, plasma drive, tech-shrines',
    ['hullIntegrity', 'power', 'componentStatus', 'fires'],
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
    ['detection', 'jamming'],
    { name: 'Focused Augury', test: 'Scrutiny + Detection',
      effect: 'Identifies vulnerable components on an enemy ship.',
      writes: ['detection'] }),

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
    ['population', 'morale'],
    { name: 'Triage', test: 'Medicae',
      effect: 'Halves Population damage from a hull breach or macro-strike.',
      writes: ['population'] })
];

export const roleById = (id) => SHIP_ROLES.find((r) => r.id === id) || null;

// The roles a career is the obvious fit for, most apt first. A suggestion for
// the UI, not a restriction: the First Officer's career is explicitly "any",
// and a crew short of players doubles up.
export function rolesForCareer(career) {
  const want = String(career || '').split('(')[0].trim().toLowerCase();
  if (!want) return [];
  return SHIP_ROLES.filter((r) =>
    r.career.toLowerCase().split('(')[0].trim() === want);
}

/* ------------------------------ permissions ------------------------------ */

// May this role write this field?
export function can(roleId, field) {
  const role = roleById(roleId);
  if (!role) return false;
  if (!SHIP_FIELDS.includes(field)) return false;   // unknown field, not a typo to honour
  return role.fields.includes('*') || role.fields.includes(field);
}

// Which of an action's writes this role may not make. Empty means the whole
// payload is permitted; anything else should be refused as a unit rather than
// applied in part, or a half-executed order leaves the ship in a state no
// player chose.
export function deniedWrites(roleId, fields) {
  return (fields || []).filter((f) => !can(roleId, f));
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

// +5 per Degree of Success, which is the First Officer's signature action.
export const backsIntoIt = (degreesOfSuccess) =>
  Math.max(0, Math.floor(Number(degreesOfSuccess) || 0)) * 5;

// Evasive Manoeuvres: attackers take 10 × DoS as a penalty, so the value is
// returned negative — it is applied to someone else's test.
//
// Negating zero yields -0, which is falsy and equal to 0 but is a distinct
// value to Object.is and survives a JSON round trip as -0. This goes over the
// wire in an action payload, so it returns a plain zero instead.
export const evasionPenalty = (degreesOfSuccess) => {
  const dos = Math.max(0, Math.floor(Number(degreesOfSuccess) || 0));
  return dos === 0 ? 0 : -dos * 10;
};

// Lock on Target: +5 per Degree of Success to everyone shooting at it.
export const lockBonus = (degreesOfSuccess) =>
  Math.max(0, Math.floor(Number(degreesOfSuccess) || 0)) * 5;
