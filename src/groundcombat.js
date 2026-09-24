// Ground combat: the to-hit number, action economy, and burst hit counts for
// a character-scale attack. Mirrors voidcombat.js's shape — toHit(), then
// resolveAttack() — but stops where crits.js already starts: this module
// says "hit, N Degrees of Success, here are the hits scored"; hitLocation()
// and resolveHit() in crits.js take it from there.
//
// Dice are injected, never rolled here — same reason as voidcombat.js: the
// same resolution has to run for a player's declared attack, a GM's NPC, and
// a test. resolveTest() from dice.js does the actual roll-vs-target
// arithmetic (including the 01-05/96-00 auto success/failure rule); this
// module only builds the target number and the hit count.
//
// WEAPON PROFILES AREN'T DATA YET
//
// gear.js stores a weapon's stats as one display string — "100m · S/3/– ·
// 1d10+3 E · Pen 0 · Clip 60 · Reliable" — because it's a table aid, not a
// combat engine. parseWeaponStats() below is the missing half: it reads that
// string back into {range, modes, damage, pen, clip, qualities} so an attack
// can be resolved without hand-copying numbers off the sheet. A weapon with
// no parseable stats line (e.g. "Primitive" alone) comes back with damage:
// null — the GM adjudicates those by hand, same as gear.js already expects
// for anything with no stats line at all.

import { gearInfo } from './gear.js';
import { resolveTest } from './dice.js';
import { applyDamage } from './wounds.js';

/* ------------------------------ action economy ------------------------------
   type: 'half' | 'full' | 'reaction'. A turn is one Full Action, or two Half
   Actions that are not the same half action twice (no double Aim). */

const A = (id, name, type, effect, extra) => ({ id, name, type, effect, ...extra });

export const ACTIONS = [
  A('standard_attack', 'Standard Attack', 'half',
    'One melee or ranged attack against a single target.'),
  A('semi_auto_burst', 'Semi-Auto Burst', 'half',
    '1 hit + 1 per 2 Degrees of Success.', { requiresMode: 'semiAuto', toHitMod: 10, hitsPerDoS: 0.5 }),
  A('full_auto_burst', 'Full-Auto Burst', 'full',
    '1 hit + 1 per 1 Degree of Success.', { requiresMode: 'fullAuto', toHitMod: 20, hitsPerDoS: 1 }),
  A('aim', 'Aim', 'half', '+10 to hit on the next attack.', { grantsNextAttack: 10 }),
  A('aim_extended', 'Aim (Extended)', 'full', '+20 to hit on the next attack.', { grantsNextAttack: 20 }),
  A('charge', 'Charge', 'full', 'Move up to 3x Agility Bonus. +10 WS (melee).', { wsMod: 10 }),
  A('all_out_attack', 'All-Out Attack', 'full',
    '+20 WS (melee). Cannot Dodge/Parry until next turn.', { wsMod: 20, locksOut: ['dodge', 'parry'] }),
  A('guarded_attack', 'Guarded Attack', 'full',
    '-10 WS. +10 Dodge/Parry until next turn.', { wsMod: -10, grantsDefense: { dodge: 10, parry: 10 } }),
  A('overwatch', 'Overwatch', 'full',
    'Set a 45-degree kill zone. Fire as a Reaction on entry (-20 BS).', { bsMod: -20, reaction: true }),
  A('reload', 'Reload', 'variable', 'Refills clip. Duration depends on weapon stats.'),
  A('tactical_advance', 'Tactical Advance', 'full', 'Move cover to cover, retaining cover bonus.')
];

export const actionById = (id) => ACTIONS.find((a) => a.id === id) || null;

/* ------------------------------ to-hit modifiers ------------------------------ */

export const SIZE_MODIFIERS = [
  { id: 'miniscule', name: 'Miniscule (Servo-skull)', mod: -30 },
  { id: 'puny', name: 'Puny (Gretchin)', mod: -20 },
  { id: 'scrawny', name: 'Scrawny (Teenager)', mod: -10 },
  { id: 'average', name: 'Average (Human)', mod: 0 },
  { id: 'hulking', name: 'Hulking (Space Marine, Ork)', mod: 10 },
  { id: 'enormous', name: 'Enormous (Dreadnought)', mod: 20 },
  { id: 'massive', name: 'Massive (Tank, Daemon Prince)', mod: 30 }
];

// Point-blank is an absolute distance, checked before the weapon's own range
// sets the relative bands. A weapon with no range (melee, or an unparsed
// stats line) has no long/extreme band — everything beyond point-blank
// reads as 'standard', same as gear.js treating an unrated item as "the GM
// decides" rather than silently wrong.
export const RANGE_MODIFIERS = {
  point_blank: 30, short: 10, standard: 0, long: -10, extreme: -30, out: null
};

export function rangeBand(distanceM, weaponRangeM) {
  const d = Math.max(0, Number(distanceM) || 0);
  if (d <= 2) return 'point_blank';
  const r = Number(weaponRangeM);
  if (!Number.isFinite(r) || r <= 0) return 'standard';
  if (d <= r / 2) return 'short';
  if (d <= r) return 'standard';
  if (d <= r * 2) return 'long';
  if (d <= r * 3) return 'extreme';
  return 'out';
}

// Independent and stackable — pass every id that applies.
export const SITUATION_MODIFIERS = [
  { id: 'target_stunned', name: 'Target Stunned or Helpless', mod: 20 },
  { id: 'attacker_prone', name: 'Attacker is Prone', mod: -10 },
  { id: 'target_prone', name: 'Target is Prone', mod: -10 },
  { id: 'target_running', name: 'Target Running / Moving Fast', mod: -20 },
  { id: 'firing_into_melee', name: 'Firing into Melee Combat', mod: -20 },
  { id: 'poor_visibility', name: 'Poor Visibility (Fog, Smoke)', mod: -20 },
  { id: 'total_darkness', name: 'Total Darkness', mod: -30 }
];

const findMod = (table, id) => (table.find((m) => m.id === id) || { mod: 0 }).mod;

/* ------------------------------ weapon profiles ------------------------------ */

const DAMAGE_RE = /^(\d+)d(\d+)(?:\+(\d+))?\s*([EIRX])$/;
const MODES_RE = /^([S–])\/([\d–]+)\/([\d–]+)$/;
const RANGE_RE = /^(\d+)m$/;
const PEN_RE = /^Pen\s+(\d+)$/i;
const CLIP_RE = /^Clip\s+(\d+)$/i;
const AP_RE = /^AP\s+(\d+)$/i;
const LOCATIONS_RE = /^(?:all|head|body|arms?|legs?)(?:,\s*(?:head|body|arms?|legs?))*$/i;

// Splits gear.js's " · " display string back into structured combat data.
// Handles both a weapon's line (damage/modes/range/pen/clip) and an
// armour's line (AP + covered locations, e.g. "AP 4 · body, arms, legs") —
// same string format, so one parser covers both rather than two near-copies.
// A segment that matches none of the known shapes is kept as a quality
// (Balanced, Tearing, Reliable, Overheats, ...), split again on ", " since
// some ship two to a segment ("Overheats, Recharge").
export function parseWeaponStats(stats) {
  const segments = String(stats || '').split('·').map((s) => s.trim()).filter(Boolean);
  const out = {
    range: null, modes: null, damage: null, pen: null, clip: null,
    armour: null, locations: null, qualities: []
  };

  for (const seg of segments) {
    let m;
    if ((m = seg.match(RANGE_RE))) { out.range = Number(m[1]); continue; }
    if ((m = seg.match(MODES_RE))) {
      out.modes = {
        single: m[1] === 'S',
        semiAuto: m[2] === '–' ? null : Number(m[2]),
        fullAuto: m[3] === '–' ? null : Number(m[3])
      };
      continue;
    }
    if ((m = seg.match(DAMAGE_RE))) {
      out.damage = { dice: Number(m[1]), die: Number(m[2]), bonus: Number(m[3]) || 0, type: m[4] };
      continue;
    }
    if ((m = seg.match(PEN_RE))) { out.pen = Number(m[1]); continue; }
    if ((m = seg.match(CLIP_RE))) { out.clip = Number(m[1]); continue; }
    if ((m = seg.match(AP_RE))) { out.armour = Number(m[1]); continue; }
    if (LOCATIONS_RE.test(seg)) {
      out.locations = seg.split(',').map((s) => s.trim().toLowerCase());
      continue;
    }
    out.qualities.push(...seg.split(',').map((s) => s.trim()).filter(Boolean));
  }
  return out;
}

// 'Melee' rolls Weapon Skill; everything else with a combat profile
// (Pistol, Basic, Heavy, Thrown) rolls Ballistic Skill. Gear with no `kind`
// (a medikit, a dataslate) is not a weapon at all.
export function skillTypeFor(kind) {
  if (kind === 'Melee') return 'ws';
  if (kind === 'Pistol' || kind === 'Basic' || kind === 'Heavy' || kind === 'Thrown') return 'bs';
  return null;
}

// Looks a gear label up in gear.js and returns everything an attack needs in
// one call: which characteristic it rolls, and its parsed profile.
export function weaponProfile(label) {
  const { entry, quality } = gearInfo(label);
  if (!entry || !entry.kind) return null;
  const skillType = skillTypeFor(entry.kind);
  if (!skillType) return null;
  return { label, kind: entry.kind, skillType, quality, ...parseWeaponStats(entry.stats) };
}

// The armour twin of weaponProfile() — for `kind: 'Armour'` gear, where
// there's no skill to roll but an AP number and covered locations to pull
// off the same stats string.
export function armourProfile(label) {
  const { entry, quality } = gearInfo(label);
  if (!entry || entry.kind !== 'Armour') return null;
  return { label, quality, ...parseWeaponStats(entry.stats) };
}

export const weaponAllowsAction = (weapon, actionId) => {
  const action = actionById(actionId);
  if (!action || !action.requiresMode) return true;
  return Boolean(weapon && weapon.modes && weapon.modes[action.requiresMode]);
};

/* ------------------------------ the to-hit number ------------------------------ */

// baseSkill: the character's WS or BS, whichever the weapon rolls.
// situationIds: array of SITUATION_MODIFIERS ids currently in play.
// aimBonus: banked from a prior Aim / Aim (Extended).
// actionId: the action being taken this attack, for its own to-hit/WS/BS mod.
export function toHit({
  baseSkill = 0, weapon = null, size = 'average', distanceM = 0,
  situationIds = [], aimBonus = 0, actionId = 'standard_attack', otherMod = 0
} = {}) {
  const action = actionById(actionId);
  const sizeMod = findMod(SIZE_MODIFIERS, size);
  const band = weapon && weapon.skillType === 'bs'
    ? rangeBand(distanceM, weapon.range) : null;
  const rangeMod = band ? RANGE_MODIFIERS[band] : 0;
  const situationMod = situationIds.reduce((sum, id) => sum + findMod(SITUATION_MODIFIERS, id), 0);
  const actionMod = action
    ? (action.toHitMod || 0) + (weapon && weapon.skillType === 'ws' ? (action.wsMod || 0) : (action.bsMod || 0))
    : 0;

  const parts = [
    { label: 'Target size', value: sizeMod },
    { label: 'Range', value: rangeMod },
    { label: 'Situation', value: situationMod },
    { label: 'Aim', value: Number(aimBonus) || 0 },
    { label: 'Action', value: actionMod },
    { label: 'Other', value: Number(otherMod) || 0 }
  ];
  const total = Math.max(0, parts.reduce((n, p) => n + p.value, Number(baseSkill) || 0));

  return { total, band, canFire: band !== 'out', base: Number(baseSkill) || 0, parts, action };
}

/* ------------------------------ resolving the attack ------------------------------ */

// `roll` is the d100 already rolled — this hands it straight through as
// `locationRoll`, unmodified, exactly as crits.js's own comment demands, so
// the caller can feed it directly to hitLocation() without a second roll.
export function resolveAttack({ target = 0, roll, actionId = 'standard_attack', weapon = null } = {}) {
  const test = resolveTest(target, 0, roll);
  const action = actionById(actionId);
  if (!test.success) return { ...test, hits: 0, locationRoll: roll, action };

  const cap = action && action.requiresMode && weapon && weapon.modes
    ? weapon.modes[action.requiresMode] : null;
  const hitsUncapped = 1 + (action && action.hitsPerDoS ? Math.floor(test.degrees * action.hitsPerDoS) : 0);
  const hits = cap != null ? Math.min(hitsUncapped, cap) : hitsUncapped;

  return { ...test, hits, locationRoll: roll, action };
}

// One call from an npc_add roster entry (or a player's own baseSkill/weapon)
// straight through to a resolved attack. Exists so a Named antagonist's full
// stat block — ws/bs/weapon, filled in by npcgen.js — can actually drive a
// roll instead of the GM re-deriving toHit() and resolveAttack() by hand
// every time. Not required: an NPC with no ws/bs/weapon simply can't attack
// this way, and stays a Wounds-only combatant, same as before this existed.
export function npcAttackRoll(npc, {
  size = 'average', distanceM = 0, situationIds = [], aimBonus = 0,
  actionId = 'standard_attack', otherMod = 0, roll
} = {}) {
  const weapon = weaponProfile(npc && npc.weapon);
  if (!weapon) return null;
  const baseSkill = weapon.skillType === 'ws' ? npc.ws : npc.bs;
  if (!Number.isFinite(baseSkill)) return null;

  const t = toHit({ baseSkill, weapon, size, distanceM, situationIds, aimBonus, actionId, otherMod });
  if (!t.canFire) return { ...t, weapon, hits: 0, canFire: false };
  return { ...t, weapon, ...resolveAttack({ target: t.total, roll, actionId, weapon }) };
}

/* ==============================================================================
   THE SHARED BRIDGE'S GROUND COMBAT: events, and who may fire them.

   Ship combat events (shiproles.js's GM_EVENTS) are GM-only, full stop — no
   station ever triggers one, whatever it owns. Ground combat is different on
   purpose: the GM runs the NPCs, but "players can respond" means a player has
   to be able to write *something* back. The split:

     gmOnly: true    only the GM may fire it (an NPC's attack on a player).
     gmOnly: false,
     target: 'player'  the GM may always fire it, and a non-GM may fire it
                        ONLY against their own character — never someone
                        else's. (Their own Wounds; their own declared Dodge.)
     gmOnly: false,
     target: 'npc'      any member may fire it. NPCs are the GM's roster, but
                        the players' own attacks are what damages them, and
                        gating that behind "ask the GM to type it in" defeats
                        the point of a live combat tab.

   authorizeGroundEvent() below is what actually enforces this — it is the
   ground-combat twin of authorizeEvent()/canTriggerEvent() in lib/bridge.js
   and shiproles.js, kept here instead because the event catalog and the
   thing it mutates (combat.playerVitals / combat.ground.npcs) are both
   ground-combat concepts with nothing ship-shaped about them. */

const GE = (id, name, { gmOnly, target, logOnly }) => ({ id, name, gmOnly, target, logOnly: Boolean(logOnly) });

export const GROUND_EVENTS = [
  GE('npc_attack', 'NPC attacks a player', { gmOnly: true, target: 'player' }),
  GE('player_damage', 'Player takes damage (hazard, self)', { gmOnly: false, target: 'player' }),
  GE('player_heal', 'Player heals (First Aid, rest)', { gmOnly: false, target: 'player' }),
  // Nothing to write — the value is the log entry itself, so the GM (and the
  // rest of the table, polling the same document) sees the declared Dodge,
  // Parry or other response next to the attack it answers.
  GE('player_response', 'Player declares a response', { gmOnly: false, target: 'player', logOnly: true }),
  GE('npc_damage', 'A player damages an NPC', { gmOnly: false, target: 'npc' }),
  GE('npc_add', 'GM adds an NPC combatant', { gmOnly: true, target: 'npc' }),
  GE('npc_remove', 'GM removes an NPC combatant', { gmOnly: true, target: 'npc' })
];

export const groundEventById = (id) => GROUND_EVENTS.find((e) => e.id === id) || null;

// dynasty-shaped checks (isGm, memberOf, charIdsFor) are injected rather than
// imported from lib/bridge.js, so this file stays free of a dependency on
// the server-side module — the same reason dice are injected above.
export function authorizeGroundEvent(event, { isGm = false, isMember = false, ownCharIds = [] } = {}) {
  if (!isGm && !isMember) return { ok: false, reason: 'not_a_member' };
  const def = groundEventById(event && event.id);
  if (!def) return { ok: false, reason: 'unknown_event' };
  if (def.gmOnly && !isGm) return { ok: false, reason: 'gm_only' };
  if (!isGm && def.target === 'player' && !ownCharIds.includes(event.charId)) {
    return { ok: false, reason: 'not_your_character' };
  }
  return { ok: true, event: def };
}

// One Wounds entry: { max, damage, critSoFar }. `amount` is unsigned damage
// (npc_attack, player_damage, npc_damage) or unsigned healing subtracted by
// the caller (player_heal passes it negated) — signed the same way
// voidcombat's applyEvent distinguishes damage events from corruption_surge.
function patchWounds(entry, { delta = 0, crit = 0 } = {}) {
  const max = entry && Number.isFinite(entry.max) ? entry.max : (Number.isFinite(entry) ? entry : 0);
  const damage = applyDamage(entry ? entry.damage : 0, delta, max);
  const critSoFar = Math.max(0, (entry ? entry.critSoFar || 0 : 0) + (Number(crit) || 0));
  return { max, damage, critSoFar, updatedAt: Date.now() };
}

// combat: the ship's existing `combat` doc field — { phase, order,
// playerVitals, ground }. Only the two ground-combat pieces are read or
// written here; phase/order pass through untouched, same as voidcombat's
// applyEvent leaves fields it doesn't know about alone by only patching what
// it names.
export function applyGroundEvent(combat, event) {
  const c = combat || {};
  const playerVitals = c.playerVitals || {};
  const npcs = (c.ground && c.ground.npcs) || [];
  const e = event || {};

  switch (e.id) {
    case 'npc_attack':
    case 'player_damage': {
      const entry = patchWounds(playerVitals[e.charId], {
        delta: Math.max(0, Math.floor(Number(e.amount) || 0)),
        crit: Math.max(0, Math.floor(Number(e.crit) || 0))
      });
      return { patch: { playerVitals: { ...playerVitals, [e.charId]: entry } }, fields: ['playerVitals'], unknown: false };
    }

    case 'player_heal': {
      const entry = patchWounds(playerVitals[e.charId], {
        delta: -Math.max(0, Math.floor(Number(e.amount) || 0))
      });
      return { patch: { playerVitals: { ...playerVitals, [e.charId]: entry } }, fields: ['playerVitals'], unknown: false };
    }

    case 'player_response':
      // Nothing to patch — the log entry (appended by the caller, same as
      // every other event) is the whole point of this one.
      return { patch: {}, fields: [], unknown: false };

    case 'npc_damage': {
      const i = npcs.findIndex((n) => n.id === e.npcId);
      if (i < 0) return { patch: {}, fields: [], unknown: true };
      const entry = patchWounds(npcs[i], {
        delta: Math.max(0, Math.floor(Number(e.amount) || 0)),
        crit: Math.max(0, Math.floor(Number(e.crit) || 0))
      });
      const nextNpcs = npcs.slice();
      nextNpcs[i] = { ...npcs[i], ...entry };
      return { patch: { ground: { ...c.ground, npcs: nextNpcs } }, fields: ['ground'], unknown: false };
    }

    case 'npc_add': {
      const npc = {
        id: e.npcId || `npc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        name: String(e.name || 'Hostile').trim().slice(0, 60) || 'Hostile',
        max: Math.max(1, Math.floor(Number(e.max) || 1)),
        damage: 0, critSoFar: 0,
        // Optional — a Wounds-only NPC (the old shape) still works, it just
        // can't drive toHit()/resolveAttack() until these are filled in.
        ws: Number.isFinite(Number(e.ws)) ? Math.floor(Number(e.ws)) : null,
        bs: Number.isFinite(Number(e.bs)) ? Math.floor(Number(e.bs)) : null,
        toughnessBonus: Number.isFinite(Number(e.toughnessBonus)) ? Math.floor(Number(e.toughnessBonus)) : null,
        armour: Number.isFinite(Number(e.armour)) ? Math.floor(Number(e.armour)) : null,
        weapon: e.weapon ? String(e.weapon).trim().slice(0, 80) : null
      };
      return { patch: { ground: { ...c.ground, npcs: [...npcs, npc] } }, fields: ['ground'], unknown: false };
    }

    case 'npc_remove':
      return {
        patch: { ground: { ...c.ground, npcs: npcs.filter((n) => n.id !== e.npcId) } },
        fields: ['ground'], unknown: false
      };

    default:
      return { patch: {}, fields: [], unknown: true };
  }
}
