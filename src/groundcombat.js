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
  // RT p.243. A full-auto weapon, a 45-degree kill zone. Every target in it
  // tests Pinning (Hard -20 Willpower) whether or not it is hit; the shooter
  // rolls a Hard -20 BS test for wild fire at a random target in the zone,
  // one extra hit per two Degrees, up to the weapon's full-auto rate. No +20
  // full-auto bonus.
  A('suppressing_fire', 'Suppressing Fire', 'full',
    'Kill zone (45 degrees). Targets test Hard (-20) Willpower or are Pinned. Hard (-20) BS: 1 random hit + 1 per 2 DoS.',
    { requiresMode: 'fullAuto', toHitMod: -20, hitsPerDoS: 0.5, suppresses: true, pinTestMod: -20 }),
  A('aim', 'Aim', 'half', '+10 to hit on the next attack.', { grantsNextAttack: 10 }),
  A('aim_extended', 'Aim (Extended)', 'full', '+20 to hit on the next attack.', { grantsNextAttack: 20 }),
  A('charge', 'Charge', 'full', 'Move up to 3x Agility Bonus. +10 WS (melee).', { wsMod: 10 }),
  A('all_out_attack', 'All-Out Attack', 'full',
    '+20 WS (melee). Cannot Dodge/Parry until next turn.', { wsMod: 20, locksOut: ['dodge', 'parry'] }),
  A('guarded_attack', 'Guarded Attack', 'full',
    '-10 WS. +10 Dodge/Parry until next turn.', { wsMod: -10, grantsDefense: { dodge: 10, parry: 10 } }),
  A('overwatch', 'Overwatch', 'full',
    'Set a 45-degree kill zone and name a Semi-Auto, Full-Auto or Suppressing attack. Targets in it test Hard (-20) Pinning or are Pinned.',
    { reaction: true, pinTestMod: -20 }),
  A('reload', 'Reload', 'variable', 'Refills clip. Duration depends on weapon stats.'),
  A('tactical_advance', 'Tactical Advance', 'full', 'Move cover to cover, retaining cover bonus.')
];

export const actionById = (id) => ACTIONS.find((a) => a.id === id) || null;

/* ------------------------------ ammo, jams, overheats ------------------------------
   Rogue Trader pp.116-117, 239, 242-243, 249. gear.js already stores Clip and
   the weapon qualities in the stats string and parseWeaponStats() reads them
   back; this is the pure half that spends rounds and judges the d100.
   The caller keeps the rounds counter and the jammed flag per weapon. */

export function ammoCost(weapon, actionId = 'standard_attack') {
  if (!weapon || weapon.clip == null) return 0;
  const action = actionById(actionId);
  if (action && action.requiresMode && weapon.modes) {
    const n = weapon.modes[action.requiresMode];
    if (Number.isFinite(n)) return n;
  }
  return 1;
}

// Rounds left after the attack, or null when the clip cannot pay for it.
export const spendAmmo = (rounds, cost) =>
  (Number(rounds) >= cost ? Number(rounds) - cost : null);

const hasQuality = (weapon, name) =>
  Boolean(weapon && (weapon.qualities || []).some((q) => q.toLowerCase().startsWith(name)));

// An unmodified 96-00 jams a ranged weapon; 94-00 on a Semi-Auto, Full-Auto
// or Suppressing attack. Unreliable jams on 91+ whatever the fire mode.
// Reliable: the roll still "jams", but a d10 is then rolled and only a 10
// is a real Jam — otherwise it is just a miss. Poor craftsmanship adds
// Unreliable, Good adds Reliable (the two cancel), Best never jams or
// overheats, and using a ranged weapon untrained counts as Unreliable.
//
// Overheats is a separate result: 91+ (not a Jam). The wielder takes the
// weapon's own damage, Pen 0, to an arm — avoidable by dropping the weapon
// as a Free Action — and the weapon cannot fire again until the second
// round after.
//
// `d10` is the Reliable confirmation die; `craftsmanship` is 'poor' | 'common' |
// 'good' | 'best'.
export function jamCheck(weapon, roll, actionId = 'standard_attack', { craftsmanship = 'common', untrained = false, d10 = 10 } = {}) {
  const none = { jammed: false, overheated: false, threshold: null, reliableSaved: false };
  if (!weapon || weapon.skillType !== 'bs') return none;
  if (craftsmanship === 'best') return { ...none, bestCraft: true };
  const action = actionById(actionId);
  const auto = Boolean(action && action.requiresMode);

  let unreliable = hasQuality(weapon, 'unreliable') || craftsmanship === 'poor' || untrained;
  let reliable = hasQuality(weapon, 'reliable') || craftsmanship === 'good';
  if (unreliable && reliable) { unreliable = false; reliable = false; }

  if (hasQuality(weapon, 'overheats')) {
    return { ...none, overheated: roll >= 91, threshold: 91 };
  }
  let threshold = auto ? 94 : 96;
  if (unreliable) threshold = Math.min(threshold, 91);
  const wouldJam = roll >= threshold;
  if (wouldJam && reliable) {
    const real = Number(d10) === 10;
    return { ...none, jammed: real, reliableSaved: !real, threshold };
  }
  return { ...none, jammed: wouldJam, threshold };
}

// What an overheat costs the wielder: the weapon's own damage, no
// penetration, to an arm — unless the weapon is dropped (a Free Action).
export const overheatResult = (weapon) => ({
  damage: weapon && weapon.damage ? weapon.damage : null,
  pen: 0, location: 'arm', avoidableByDropping: true,
  cooldownRounds: 1
});

// Clearing a Jam is a Full Action and a Ballistic Skill Test. On success the
// weapon is clear but needs reloading, and any ammo in it is lost.
export function clearJam({ bs = 0, roll, otherMod = 0 } = {}) {
  const t = resolveTest(Number(bs) || 0, Number(otherMod) || 0, roll);
  return { ...t, cleared: t.success, ammoLost: t.success, needsReload: t.success };
}

// Recharge weapons (plasma cannon, ...) can only fire every other round.
export const needsRecharge = (weapon) => hasQuality(weapon, 'recharge');

// Reload time is not in the parsed stats line (gear.js has no Rld column),
// so this is a house default by clip size: a belt is a Full Action, a
// magazine a Half Action. The GM overrules per weapon.
export const reloadAction = (weapon) =>
  (weapon && weapon.clip != null && weapon.clip > 30 ? 'full' : 'half');

export const reload = (weapon) => (weapon && weapon.clip != null ? weapon.clip : 0);

/* ------------------------------ pinning ------------------------------
   RT p.248. Being shot at by suppressive fire (or caught in an Overwatch
   kill zone) calls for a Hard (-20) Willpower Pinning Test, whether or not a
   shot lands. A Pinned character is Pinned until a Willpower Test at the end
   of his Turn gets him out: Easy (+30) when nobody has shot at him since. */

export const PINNING_MOD = -20;

export function pinningTest({ willpower = 0, roll, otherMod = 0 } = {}) {
  const test = resolveTest(Number(willpower) || 0, PINNING_MOD + (Number(otherMod) || 0), roll);
  return { ...test, pinned: !test.success };
}

export function pinEscapeTest({ willpower = 0, roll, underFire = true, inMelee = false, otherMod = 0 } = {}) {
  if (inMelee) return { escaped: true, automatic: true, success: true, degrees: 0, roll: null };
  const test = resolveTest(Number(willpower) || 0, (underFire ? 0 : 30) + (Number(otherMod) || 0), roll);
  return { ...test, escaped: test.success };
}

// Open-ended: pinned until the escape test is passed, not for a fixed time.
export const pinnedCondition = () => ({ id: 'pinned', rounds: null });

/* ------------------------------ between turns ------------------------------ */

// What the end of a round does to every combatant, as a report rather than
// a silent mutation: toll taken, and which conditions ran out. The bridge
// stores it on ground.between so the table sees the phase.
export function betweenTurns(combatants, d10 = () => 5) {
  return (combatants || []).map((c) => {
    const toll = conditionToll(c.conditions, d10);
    const before = c.conditions || [];
    const after = tickConditions(before);
    const expired = before.filter((x) => !after.some((y) => y.id === x.id)).map((x) => x.name || x.id);
    return { id: c.id, name: c.name, toll, expired, conditions: after };
  });
}

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
  { id: 'total_darkness', name: 'Total Darkness', mod: -30 },
  // RT p.235/249: a Surprised or Unaware target is hit at +30 (Easy).
  { id: 'target_unaware', name: 'Target Surprised or Unaware', mod: 30 },
  { id: 'bad_weather', name: 'Harsh Weather / Unnatural Conditions', mod: -20 }
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

// Damage for every hit an attack scored, chained so a burst's later hits land
// on the Wounds and crit total the earlier ones left behind. Used in both
// directions: the GM resolving a hostile against a character, and a character
// resolving their own weapon against a hostile. Before this existed only the
// first direction rolled — a player read their weapon's line off the sheet,
// did the arithmetic and typed a total in, which is the one place at the table
// where armour, Penetration and Righteous Fury were applied by hand.
//
// Dice are injected for the same reason the rest of this module injects them.
export function resolveHits({
  weapon = null, hits = 0, locationRoll = 0,
  armour = 0, toughnessBonus = 0, wounds = 0, critSoFar = 0,
  resolveHit, hitLocation, damageTypeById, furyTriggered,
  d = (n) => 1 + Math.floor(Math.random() * n)
} = {}) {
  const before = Math.max(0, Math.floor(Number(critSoFar) || 0));
  let woundsLeft = Math.max(0, Math.floor(Number(wounds) || 0));
  let critTotal = before;
  let totalTaken = 0;
  const rows = [];

  if (weapon && weapon.damage) {
    for (let i = 0; i < hits; i++) {
      const dice = Array.from({ length: weapon.damage.dice }, () => d(weapon.damage.die));
      const rolled = dice.reduce((s, x) => s + x, 0) + weapon.damage.bonus;
      const hit = resolveHit({
        damage: rolled, penetration: weapon.pen || 0,
        armour: Number(armour) || 0, toughnessBonus: Number(toughnessBonus) || 0,
        wounds: woundsLeft, critSoFar: critTotal,
        type: (damageTypeById(weapon.damage.type) || {}).id || 'impact',
        location: (hitLocation(locationRoll) || {}).id || 'body',
        fury: { confirmed: furyTriggered(dice), d5: d(5) }
      });
      totalTaken += hit.woundsLost;
      woundsLeft = hit.woundsLeft;
      critTotal = hit.critTotal;
      if (hit.rows) rows.push(...hit.rows);
    }
  }

  return { totalTaken, critGained: Math.max(0, critTotal - before), critTotal, woundsLeft, rows };
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

/* ------------------------------ conditions ------------------------------
   crits.js already decides what a critical inflicts — it has been returning
   "Stunned 1d10 rounds", "Blood Loss", "On Fire" since the tables went in —
   but nothing carried those onto the combatant, so the GM read them once in
   the log and then kept them in their head. This is the catalogue they land
   in, with the two that cost Wounds every round marked as such.

   `rounds` lives on the combatant rather than here: the same condition can
   be two rounds on one target and open-ended on another. null means "until
   something clears it". */

const C = (id, name, extra) => ({ id, name, perRound: 0, perRoundDice: 0, note: '', ...extra });

export const GROUND_CONDITIONS = [
  C('blood_loss', 'Blood Loss', { perRound: 1,
    note: '1 Wound at the start of each round until the bleeding is stopped.' }),
  C('on_fire', 'On Fire', { perRoundDice: 10,
    note: '1d10 Wounds each round, ignoring armour. An Agility Test puts it out.' }),
  // RT p.235 / p.249. Unaware: does not know the attack is coming, hit at +30,
  // and no longer Unaware once attacked, hit or miss. Surprised: the
  // opening of a fight; loses its first Turn, attackers +30, and recovers
  // when the surprise round is done (give it 1 round).
  C('unaware', 'Unaware', { note: 'Has no idea it is about to be attacked: hit at +30. Ends the moment it is attacked.' }),
  C('surprised', 'Surprised', { note: 'Loses its first Turn and can only stand dumbfounded; attackers get +30. Recovers after the surprise round.' }),
  C('stunned', 'Stunned', { note: 'No actions, and others attack at +20.' }),
  C('prone', 'Prone', { note: '-10 to melee attacks; melee attackers gain +10.' }),
  // Fear and Shock (RT table 10-4). Most last "until the end of the
  // encounter", so they carry no round count and the GM clears them.
  C('startled', 'Startled', { note: 'Only a single Half Action next Turn, then acts normally.' }),
  C('shaken', 'Shaken', { note: '-10 to all Tests for the rest of the encounter unless the character snaps out of it (Willpower Test at the start of each Turn).' }),
  C('backing_away', 'Backing Away', { note: 'Cannot willingly approach the object of fear. -10 to all Tests until the end of the encounter.' }),
  C('frozen', 'Frozen with Terror', { note: 'No Actions until the character snaps out of it (Willpower Test each Turn); then -10 to all Tests for the encounter.' }),
  C('fleeing', 'Fleeing', { note: 'Must flee the source of fear; only Half Actions if prevented; -20 to all Tests. Snap out of it once away (Willpower Test).' }),
  C('frenzied', 'Manic Frenzy', { note: 'Attacks anything nearby at random until snapped out of it or knocked unconscious.' }),
  C('sobbing', 'Overcome', { note: 'Helpless: screams and vomits, drops what is held. Afterwards only a single Half Action each Turn until rested.' }),
  C('crumpled', 'Crumpled', { note: 'On the ground sobbing; may do nothing. Afterwards -20 to all Tests until the end of the encounter.' }),
  C('catatonic', 'Catatonic', { note: 'Mind snapped; cannot be roused for 1d5 hours.' }),
  C('hallucinating', 'Acute Hallucinations', { note: 'Strange and terrible visions. Afterwards -20 to all Tests while the encounter lasts.' }),
  C('pinned', 'Pinned', { note: 'Half Actions only; -20 to all Ballistic Skill Tests. In cover: may not leave it. Willpower Test at end of turn to recover (Easy +30 if no longer under fire); melee escapes it.' }),
  C('fatigued', 'Fatigued', { note: '-10 to all tests per level of Fatigue.' }),
  C('helpless', 'Helpless', { note: 'No actions, and open to a Coup de Grace.' }),
  C('blinded', 'Blinded', { note: 'Cannot see: -30 to anything that needs sight.' }),
  C('deafened', 'Deafened', { note: 'Cannot hear.' }),
  C('unconscious', 'Unconscious', { note: 'Helpless and unaware.' })
];

// Situation modifier ids (SITUATION_MODIFIERS) that a TARGET's conditions
// hand to whoever is shooting at it.
export function situationFromConditions(conditions) {
  const ids = new Set();
  for (const c of conditions || []) {
    if (c.id === 'unaware' || c.id === 'surprised') ids.add('target_unaware');
    if (c.id === 'stunned') ids.add('target_stunned');
  }
  return [...ids];
}

export const conditionById = (id) => GROUND_CONDITIONS.find((c) => c.id === id) || null;

// One condition as it sits on a combatant. `rounds` of null lasts until
// cleared; a number counts down when the round wraps.
export function cleanCondition(input) {
  const c = conditionById(input && input.id);
  if (!c) return null;
  const n = Number(input.rounds);
  return { id: c.id, name: c.name, rounds: Number.isFinite(n) && n > 0 ? Math.floor(n) : null };
}

const withCondition = (list, input) => {
  const next = cleanCondition(input);
  if (!next) return list || [];
  const had = (list || []).filter((x) => x.id !== next.id);
  return [...had, next];
};

// What a combatant loses at the start of a round, before anyone acts.
export function conditionToll(conditions, d10 = () => 5) {
  let damage = 0;
  for (const c of conditions || []) {
    const def = conditionById(c.id);
    if (!def) continue;
    damage += def.perRound;
    if (def.perRoundDice) damage += d10();
  }
  return damage;
}

// A round has passed: durations come down and anything that expired is gone.
export const tickConditions = (conditions) => (conditions || [])
  .map((c) => (c.rounds == null ? c : { ...c, rounds: c.rounds - 1 }))
  .filter((c) => c.rounds == null || c.rounds > 0);

/* ------------------------------ initiative ------------------------------
   1d10 + Agility Bonus, highest first — the ship's own initiativeOrder is
   detection-based and belongs to voidcombat, so ground combat gets its own.
   Ties keep their input order, which makes the result reproducible. */

export const groundInitiative = (agilityBonus, d10) =>
  (Number(d10) || 0) + (Number(agilityBonus) || 0);

export function groundOrder(combatants) {
  return (combatants || [])
    .map((c, i) => ({
      id: c.id, name: c.name, kind: c.kind || 'npc', ix: i,
      score: groundInitiative(c.agilityBonus, c.d10)
    }))
    .sort((a, b) => (b.score - a.score) || (a.ix - b.ix))
    .map(({ ix, ...rest }) => rest);
}

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
  GE('npc_remove', 'GM removes an NPC combatant', { gmOnly: true, target: 'npc' }),
  // Running the fight rather than resolving one attack: the GM owns the
  // order and the clock.
  GE('ground_initiative', 'GM rolls initiative for the encounter', { gmOnly: true, target: 'npc' }),
  GE('ground_advance', 'GM advances the turn', { gmOnly: true, target: 'npc' }),
  // A condition on your own character is yours to set, the same way your own
  // Wounds are; one on a hostile is anyone's, the same way its damage is.
  GE('player_condition', 'Condition on a character', { gmOnly: false, target: 'player' }),
  GE('npc_condition', 'Condition on a hostile', { gmOnly: false, target: 'npc' }),
  // The GM asks a player for a Pinning (or Fear) test; the result goes back
  // as a player_condition or player_response. Nothing to write, only the log.
  GE('pinning_prompt', 'GM prompts a Pinning test', { gmOnly: true, target: 'player', logOnly: true }),
  GE('fear_prompt', 'GM prompts a Fear test', { gmOnly: true, target: 'player', logOnly: true }),
  // A note for the table's log that changes nothing (an NPC's break test).
  GE('gm_note', 'GM note to the log', { gmOnly: true, target: 'npc', logOnly: true })
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
export function applyGroundEvent(combat, event, { d10 = () => 5 } = {}) {
  const c = combat || {};
  const playerVitals = c.playerVitals || {};
  const ground = c.ground || { npcs: [] };
  const npcs = ground.npcs || [];
  const e = event || {};

  switch (e.id) {
    /* ---- running the fight: the order, and the clock ---- */

    case 'ground_initiative': {
      const order = groundOrder(e.combatants);
      if (!order.length) return { patch: {}, fields: [], unknown: true };
      return {
        patch: { ground: { ...ground, npcs, order, round: 1, turn: 0 } },
        fields: ['ground'], unknown: false
      };
    }

    case 'ground_advance': {
      const order = ground.order || [];
      if (!order.length) return { patch: {}, fields: [], unknown: true };
      const next = (Number(ground.turn) || 0) + 1;
      // Still inside the round: just move the marker.
      if (next < order.length) {
        return {
          patch: { ground: { ...ground, npcs, turn: next } },
          fields: ['ground'], unknown: false
        };
      }
      // The round wrapped. Durations come down and the two conditions that
      // cost Wounds every round take them now, before anyone acts.
      const round = (Number(ground.round) || 1) + 1;
      const pcs = Object.entries(playerVitals).map(([id, v]) => ({ id, name: v.name || id, ...v }));
      const pcReport = betweenTurns(pcs, d10);
      const nextVitals = {};
      for (const r of pcReport) {
        const v = playerVitals[r.id];
        nextVitals[r.id] = { ...v, damage: applyDamage(v.damage, r.toll, v.max || 0), conditions: r.conditions };
      }
      const npcReport = betweenTurns(npcs, d10);
      const nextNpcs = npcs.map((n, i) => ({
        ...n,
        damage: applyDamage(n.damage, npcReport[i].toll, n.max || 0),
        conditions: npcReport[i].conditions
      }));
      // The visible tidy-up phase: only combatants something happened to.
      const between = [...pcReport, ...npcReport]
        .filter((r) => r.toll || r.expired.length)
        .map(({ conditions, ...r }) => r);
      return {
        patch: {
          playerVitals: nextVitals,
          ground: { ...ground, npcs: nextNpcs, turn: 0, round, between }
        },
        fields: ['playerVitals', 'ground'], unknown: false
      };
    }

    /* ---- conditions ---- */

    case 'player_condition': {
      // A character who has not published a Wounds card yet can still be
      // Stunned or set on fire — the GM's picker offers every member of the
      // dynasty, not only the ones who have written vitals. patchWounds
      // defaults the same way for player_damage, and mirrorPlayerWounds
      // fills the real max in the moment they do publish.
      const v = playerVitals[e.charId] || { max: 0, damage: 0, critSoFar: 0 };
      const conditions = e.clear
        ? (v.conditions || []).filter((x) => x.id !== e.clear)
        : withCondition(v.conditions, e.condition);
      return {
        patch: { playerVitals: { ...playerVitals, [e.charId]: { ...v, conditions } } },
        fields: ['playerVitals'], unknown: false
      };
    }

    case 'npc_condition': {
      const i = npcs.findIndex((n) => n.id === e.npcId);
      if (i < 0) return { patch: {}, fields: [], unknown: true };
      const conditions = e.clear
        ? (npcs[i].conditions || []).filter((x) => x.id !== e.clear)
        : withCondition(npcs[i].conditions, e.condition);
      const nextNpcs = npcs.slice();
      nextNpcs[i] = { ...npcs[i], conditions };
      return {
        patch: { ground: { ...ground, npcs: nextNpcs } },
        fields: ['ground'], unknown: false
      };
    }
    case 'npc_attack':
    case 'player_damage': {
      const prev = playerVitals[e.charId];
      const entry = patchWounds(prev, {
        delta: Math.max(0, Math.floor(Number(e.amount) || 0)),
        crit: Math.max(0, Math.floor(Number(e.crit) || 0))
      });
      // patchWounds only carries the Wounds fields; conditions stay, minus
      // Unaware, which an attack ends whether or not it hit (RT p.241).
      if (prev && prev.conditions) {
        entry.conditions = e.id === 'npc_attack'
          ? prev.conditions.filter((c) => c.id !== 'unaware') : prev.conditions;
      }
      return { patch: { playerVitals: { ...playerVitals, [e.charId]: { ...(prev || {}), ...entry } } }, fields: ['playerVitals'], unknown: false };
    }

    case 'player_heal': {
      const prev = playerVitals[e.charId];
      const entry = patchWounds(prev, {
        delta: -Math.max(0, Math.floor(Number(e.amount) || 0)),
        // Critical Damage mends separately (downtime, with medical care).
        crit: -Math.max(0, Math.floor(Number(e.critHeal) || 0))
      });
      // Healing a wound does not clear a condition: keep what was there.
      return { patch: { playerVitals: { ...playerVitals, [e.charId]: { ...(prev || {}), ...entry } } }, fields: ['playerVitals'], unknown: false };
    }

    case 'pinning_prompt':
    case 'fear_prompt':
    case 'gm_note':
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
      // An attack ends Unaware, hit or miss: the player's miss is logged as
      // a zero-damage npc_damage, so this is where it is seen.
      nextNpcs[i] = { ...npcs[i], ...entry,
        conditions: (npcs[i].conditions || []).filter((c) => c.id !== 'unaware') };
      return { patch: { ground: { ...ground, npcs: nextNpcs } }, fields: ['ground'], unknown: false };
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
        weapon: e.weapon ? String(e.weapon).trim().slice(0, 80) : null,
        // Agility Bonus for the initiative roll. Absent means an average 3 —
        // most things the GM throws at a bridge crew are average.
        agilityBonus: Number.isFinite(Number(e.agilityBonus)) ? Math.floor(Number(e.agilityBonus)) : 3,
        // Nerve and orders, all optional: absent means no Fear to test with
        // and no written order for the break test to fall back from.
        willpower: Number.isFinite(Number(e.willpower)) && e.willpower !== null ? Math.floor(Number(e.willpower)) : null,
        fear: Math.max(0, Math.floor(Number(e.fear) || 0)),
        fearless: Boolean(e.fearless),
        combatRole: e.combatRole ? String(e.combatRole).slice(0, 20) : null,
        order: e.order ? String(e.order).slice(0, 20) : null,
        conditions: []
      };
      return { patch: { ground: { ...ground, npcs: [...npcs, npc] } }, fields: ['ground'], unknown: false };
    }

    case 'npc_remove':
      return {
        patch: { ground: { ...ground, npcs: npcs.filter((n) => n.id !== e.npcId) } },
        fields: ['ground'], unknown: false
      };

    default:
      return { patch: {}, fields: [], unknown: true };
  }
}
