// The antagonist generator: Sections 1-8 of the antagonist-generator-tables
// reference as data and a rollNpc() function, plus Section 9's fixed
// bestiary. Both produce the same shape — ready for the npc_add ground
// combat event (see groundcombat.js) — so "roll a hostile" and "spawn
// Kaptin Orlog Mordakka" are the same button with a different source.
//
// Dice are injected, same reason as everywhere else in this app: rng is a
// () => [0,1) function, defaulting to Math.random, so a test can hand in a
// deterministic sequence.
//
// gear.js is the source of truth for every weapon and armour label used
// below — none of these tables invent a stat line; they point at an entry
// gear.js already has, and armourProfile()/weaponProfile() read the real
// AP and damage numbers off it rather than this file guessing at them.

import { armourProfile, weaponProfile } from './groundcombat.js';

const roll1d10 = (rng) => 1 + Math.floor(rng() * 10);
const inRange = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

// Table rows keyed by an inclusive roll range, matching the reference doc's
// "1-5 / 6-8 / 9 / 10" columns exactly.
const inTable = (table, roll) => table.find((row) => roll >= row.min && roll <= row.max) || null;

/* ================================ Section 1 ================================
   Threat Tier. wsBs/t/wounds/armour are [min,max] ranges rolled with inRange;
   a Named result also doubles the Quirk roll (see rollNpc). */

export const THREAT_TIERS = [
  { min: 1, max: 5, id: 'minor', name: 'Minor', wsBs: [25, 30], t: [30, 30], wounds: [8, 10], armour: [0, 2] },
  { min: 6, max: 8, id: 'heavy', name: 'Heavy', wsBs: [35, 40], t: [35, 40], wounds: [12, 16], armour: [3, 4] },
  { min: 9, max: 9, id: 'elite', name: 'Elite', wsBs: [40, 50], t: [40, 45], wounds: [16, 20], armour: [5, 6] },
  { min: 10, max: 10, id: 'named', name: 'Named', wsBs: [50, 60], t: [45, 50], wounds: [20, 28], armour: [6, 8] }
];

export const tierById = (id) => THREAT_TIERS.find((t) => t.id === id) || null;

// Elite and Named share a weapon/armour column in the reference tables —
// there's no separate "Named" row, a Named antagonist just rolls on Elite's.
const weaponArmourColumn = (tierId) => (tierId === 'named' ? 'elite' : tierId);

/* ================================ Section 2 ================================
   Origin. weaponTable/armourTable point into Sections 3/4 below; `any`
   means the weapon table has no tier split (Kroot); `gmChoice: true` means
   the reference explicitly leaves it to the GM (Xenos Hybrid). */

export const ORIGINS = [
  { min: 1, max: 2, id: 'renegade', name: 'Renegade Guard / Cultist', weaponTable: '3a', armourTable: '4a' },
  { min: 3, max: 3, id: 'heretek', name: 'Heretek / Corrupted Adeptus Mechanicus', weaponTable: '3a', armourTable: '4a' },
  { min: 4, max: 4, id: 'ork', name: 'Ork Raiding Party', weaponTable: '3b', armourTable: '4b' },
  { min: 5, max: 5, id: 'eldar', name: 'Eldar Corsair', weaponTable: '3c', armourTable: '4c' },
  { min: 6, max: 6, id: 'drukhari', name: 'Drukhari Raiding Cabal', weaponTable: '3c', armourTable: '4c' },
  { min: 7, max: 7, id: 'kroot', name: 'Kroot Mercenary Band', weaponTable: '3d', armourTable: '4d' },
  { min: 8, max: 8, id: 'tau', name: "T'au Fire Caste Detachment", weaponTable: '3e', armourTable: '4e' },
  { min: 9, max: 9, id: 'chaos_marine', name: 'Chaos Space Marine', weaponTable: '3a', armourTable: '4a', eliteOnly: true },
  { min: 10, max: 10, id: 'xenos_hybrid', name: 'Xenos Hybrid / Unclassified Horror', weaponTable: null, armourTable: '4a', gmChoice: true }
];

export const originById = (id) => ORIGINS.find((o) => o.id === id) || null;

/* ================================ Section 3 ================================
   Signature Weapon, by origin's weaponTable and the tier's column. `any`
   applies whatever the tier (Kroot has no Minor/Heavy/Elite split). */

export const WEAPON_TABLES = {
  '3a': {
    minor: [
      { min: 1, max: 2, weapon: 'laspistol' }, { min: 3, max: 4, weapon: 'autopistol' },
      { min: 5, max: 6, weapon: 'stub automatic' }, { min: 7, max: 8, weapon: 'knife' },
      { min: 9, max: 9, weapon: 'primitive melee weapon' }, { min: 10, max: 10, weapon: 'hand cannon' }
    ],
    heavy: [
      { min: 1, max: 2, weapon: 'lasgun' }, { min: 3, max: 4, weapon: 'autogun' },
      { min: 5, max: 6, weapon: 'shotgun' }, { min: 7, max: 8, weapon: 'chainsword' },
      { min: 9, max: 9, weapon: 'chainaxe' }, { min: 10, max: 10, weapon: 'heavy stubber' }
    ],
    elite: [
      { min: 1, max: 2, weapon: 'hellgun' }, { min: 3, max: 4, weapon: 'boltgun' },
      { min: 5, max: 6, weapon: 'plasma gun' }, { min: 7, max: 8, weapon: 'power sword' },
      { min: 9, max: 9, weapon: 'power axe' }, { min: 10, max: 10, weapon: 'power fist' }
    ]
  },
  '3b': {
    minor: [{ min: 1, max: 4, weapon: 'slugga' }, { min: 5, max: 8, weapon: 'choppa' },
      { min: 9, max: 10, weapon: 'primitive melee weapon' }],
    heavy: [{ min: 1, max: 4, weapon: 'shoota' }, { min: 5, max: 8, weapon: 'choppa' },
      { min: 9, max: 10, weapon: 'stikkbomb' }],
    elite: [{ min: 1, max: 4, weapon: 'shoota' }, { min: 5, max: 8, weapon: 'power fist' },
      { min: 9, max: 10, weapon: 'thunder hammer' }]
  },
  '3c': {
    minor: [{ min: 1, max: 3, weapon: 'shuriken pistol' }, { min: 4, max: 6, weapon: 'splinter pistol' },
      { min: 7, max: 10, weapon: 'knife' }],
    heavy: [{ min: 1, max: 3, weapon: 'shuriken catapult' }, { min: 4, max: 6, weapon: 'splinter rifle' },
      { min: 7, max: 10, weapon: 'agoniser' }],
    elite: [{ min: 1, max: 3, weapon: 'shuriken catapult' }, { min: 4, max: 6, weapon: 'splinter rifle' },
      { min: 7, max: 9, weapon: 'agoniser' }, { min: 10, max: 10, weapon: 'eldar power sword' }]
  },
  '3d': {
    any: [{ min: 1, max: 7, weapon: 'kroot rifle' }, { min: 8, max: 10, weapon: 'kroot rifle' }]
  },
  '3e': {
    minor: [{ min: 1, max: 4, weapon: 'pulse pistol' }, { min: 5, max: 8, weapon: 'pulse pistol' },
      { min: 9, max: 10, weapon: 'bonding knife' }],
    heavy: [{ min: 1, max: 4, weapon: 'pulse rifle' }, { min: 5, max: 8, weapon: 'pulse carbine' },
      { min: 9, max: 10, weapon: 'bonding knife' }],
    elite: [{ min: 1, max: 4, weapon: 'pulse rifle' }, { min: 5, max: 8, weapon: 'pulse carbine' },
      { min: 9, max: 10, weapon: 'bonding knife' }]
  }
};

/* ================================ Section 4 ================================
   Armour, by origin's armourTable and the tier's column. `null` is
   deliberate — Minor Eldar/Drukhari/Kroot/T'au go unarmoured. */

export const ARMOUR_TABLES = {
  '4a': { minor: 'heavy leathers', heavy: 'guard flak armour', elite: 'storm trooper carapace' },
  '4b': { minor: 'heavy leather armour', heavy: 'heavy leather armour', elite: 'squig-hide armour' },
  '4c': { minor: null, heavy: 'aeldari mesh armour', elite: 'kabalite armour' },
  '4d': { minor: null, heavy: 'kroot leather armour', elite: 'kroot leather armour' },
  '4e': { minor: null, heavy: 'tau recon combat armour', elite: 'tau recon combat armour' }
};

/* ================================ Section 5 ================================
   Combat Role — the same behaviour categories the Hostile AI Brain uses. */

export const COMBAT_ROLES = [
  { min: 1, max: 2, id: 'ambusher', name: 'Ambusher',
    behaviour: 'Holds out of sight until a target is adjacent or isolated, then AdvanceAndMelee.' },
  { min: 3, max: 4, id: 'gunline', name: 'Gunline',
    behaviour: 'HoldAndShoot every round it has line of sight; retreats to cover otherwise.' },
  { min: 5, max: 6, id: 'berserker', name: 'Berserker',
    behaviour: 'AdvanceAndMelee unconditionally, ignoring cover and its own Wounds until Heavily Wounded.' },
  { min: 7, max: 7, id: 'skirmisher', name: 'Skirmisher',
    behaviour: 'Flanks, fires once, repositions — never stands still two rounds running.' },
  { min: 8, max: 8, id: 'coward', name: 'Coward',
    behaviour: 'FallBack the moment it takes any damage; fights only when cornered.' },
  { min: 9, max: 9, id: 'support', name: 'Support',
    behaviour: 'BuffSelf or an ally if able; otherwise HoldAndShoot.' },
  { min: 10, max: 10, id: 'fanatic', name: 'Fanatic',
    behaviour: 'Fights to the death, never checks Fear, spends Fate Points rather than flee.' }
];

/* ================================ Section 6 ================================ */

export const MOTIVATIONS = [
  "Following orders it doesn't fully understand or agree with.",
  'Protecting something specific in the room (a cache, a captive, a machine).',
  "Personal grudge against one PC's Career or House — singles them out.",
  'Desperate — cornered, starving, or fleeing something worse deeper in the hulk.',
  'True believer — Chaos, the Greater Good, the Emperor’s light, whichever fits the Origin.',
  'Paid or press-ganged, and will deal if the price or the threat is right.',
  "Curious about the party's tech/xenotech and wants a sample more than a kill.",
  'Territorial — this is its patch, and it fights harder the deeper in the party pushes.',
  'Being watched or judged by a superior it fears more than the party.',
  'Insane, corrupted, or Warp-touched — motivation makes sense only to it.'
];

/* ================================ Section 7 ================================ */

export const QUIRKS = [
  'Wears a trophy from a previous kill, visibly.',
  'Talks constantly — to itself, its weapon, or an imagined audience.',
  'Missing a limb or eye, replaced with something crude or xenos.',
  'Unnervingly calm; never raises its voice even under fire.',
  'Superstitious — carries a charm, refuses to enter a specific kind of room.',
  'Physically enormous or tiny for its type — reflavour Size for one attack roll.',
  "Marked by the Warp or its patron in a small, visible way (not yet a Crit-table effect).",
  'Fiercely loyal to one other NPC in the group; breaks and flees if that one dies.',
  'Collects something specific from victims (dog tags, dataslates, teeth).',
  'Recognises something about a PC — a Secret, a House sigil, a face from before.'
];

/* ================================ Section 8 ================================
   Name Fragments. T'au has no Column B — the reference leaves that to the
   Sept name — so nameFor() only appends a suffix when one exists. */

export const NAME_FRAGMENTS = {
  renegade: {
    a: ['Vashko', 'Drennik', 'Cole', 'Aleyna', 'Thessaly', 'Korvain', 'Petra', 'Ulrich', 'Sable', 'Marrow'],
    b: ['-grim', '-vek', '-tha', '-ossa', '-kane', '-ruth', '-vald', '-esh', '-corr', '-ain']
  },
  heretek: {
    a: ['Vashko', 'Drennik', 'Cole', 'Aleyna', 'Thessaly', 'Korvain', 'Petra', 'Ulrich', 'Sable', 'Marrow'],
    b: ['-grim', '-vek', '-tha', '-ossa', '-kane', '-ruth', '-vald', '-esh', '-corr', '-ain']
  },
  chaos_marine: {
    a: ['Vashko', 'Drennik', 'Cole', 'Aleyna', 'Thessaly', 'Korvain', 'Petra', 'Ulrich', 'Sable', 'Marrow'],
    b: ['-grim', '-vek', '-tha', '-ossa', '-kane', '-ruth', '-vald', '-esh', '-corr', '-ain']
  },
  ork: {
    a: ['Grot', 'Skarg', 'Nazdakka', 'Ugrud', 'Zoggit', 'Big', 'Krump', 'Snagga', 'Ratbag', 'Warlord'],
    b: ['-boss', '-face', '-stomp', '-teef', '-gob', '-smasha', '-runt', '-killa', '-eye', '-nut']
  },
  eldar: {
    a: ['Ael', 'Ysh', 'Vaen', 'Cael', 'Sylan', 'Ithri', 'Morrivane', 'Zeth', 'Ai', 'Kharael'],
    b: ['-driel', '-esh', '-ithya', '-van', '-oura', '-reth', '-ael', '-isse', '-orath', '-ianne']
  },
  drukhari: {
    a: ['Ael', 'Ysh', 'Vaen', 'Cael', 'Sylan', 'Ithri', 'Morrivane', 'Zeth', 'Ai', 'Kharael'],
    b: ['-driel', '-esh', '-ithya', '-van', '-oura', '-reth', '-ael', '-isse', '-orath', '-ianne']
  },
  kroot: {
    a: ['Sharp-', 'Long-', 'Grey-', 'Bone-', 'Ash-', 'Salt-', 'Storm-', 'Deep-', 'Wind-', 'Old-'],
    b: ['Talon', 'Crest', 'Feather', 'Shale', 'Marsh', 'Beak', 'Claw', 'Hollow', 'Tooth', 'Roost']
  },
  tau: {
    a: ["Shas'la", "Shas'ui", "Shas'vre", "Shas'saal", 'Fio', 'Por', 'Kais', "El'Lusha", "Ves'la", "Ta'ro"],
    b: null
  },
  xenos_hybrid: {
    a: ['Ael', 'Ysh', 'Vaen', 'Cael', 'Sylan', 'Ithri', 'Morrivane', 'Zeth', 'Ai', 'Kharael'],
    b: ['-driel', '-esh', '-ithya', '-van', '-oura', '-reth', '-ael', '-isse', '-orath', '-ianne']
  }
};

function nameFor(originId, rng) {
  const frag = NAME_FRAGMENTS[originId] || NAME_FRAGMENTS.renegade;
  const a = pick(frag.a, rng);
  if (!frag.b) return a;
  // Every column B already carries its own join character — a leading "-"
  // for a bound suffix, or none at all for Kroot's "Sharp-" + "Talon" — so
  // straight concatenation covers both without a special case.
  return a + pick(frag.b, rng);
}

/* ================================ rollNpc ================================
   One full antagonist, ready for npc_add. Any of tier/origin/weapon/armour
   can be pinned (pass its id/label) rather than rolled, for "I want a Heavy
   Ork with a choppa, roll everything else". */

export function rollNpc({
  rng = Math.random, tierId = null, originId = null
} = {}) {
  let tier = tierId ? tierById(tierId) : inTable(THREAT_TIERS, roll1d10(rng));
  let origin = originId ? originById(originId) : inTable(ORIGINS, roll1d10(rng));

  // Chaos Space Marine is Elite/Named only — a Minor/Heavy roll re-rolls
  // origin once rather than producing a Chaos Marine with cultist stats.
  if (origin && origin.eliteOnly && tier && !['elite', 'named'].includes(tier.id)) {
    origin = inTable(ORIGINS.filter((o) => !o.eliteOnly), roll1d10(rng));
  }

  const column = weaponArmourColumn(tier.id);
  const weaponTable = origin.weaponTable ? WEAPON_TABLES[origin.weaponTable] : null;
  const weaponRows = weaponTable ? (weaponTable[column] || weaponTable.any) : null;
  const weaponLabel = weaponRows ? inTable(weaponRows, roll1d10(rng)).weapon : null;

  const armourLabel = origin.armourTable ? ARMOUR_TABLES[origin.armourTable][column] : null;

  const role = inTable(COMBAT_ROLES, roll1d10(rng));
  const motivation = pick(MOTIVATIONS, rng);
  const quirks = [pick(QUIRKS, rng)];
  if (tier.id === 'named') quirks.push(pick(QUIRKS, rng));

  const t = inRange(rng, tier.t[0], tier.t[1]);
  const armourItem = armourLabel ? armourProfile(armourLabel) : null;
  const weaponItem = weaponLabel ? weaponProfile(weaponLabel) : null;

  // One roll for the stat the weapon actually uses; the other characteristic
  // trails it at 70% rather than getting its own independent roll — an Ork
  // with a shoota should be a mediocre brawler, not a coin-flip on both.
  const primary = inRange(rng, tier.wsBs[0], tier.wsBs[1]);
  const secondary = Math.floor(primary * 0.7);
  const usesWs = weaponItem ? weaponItem.skillType === 'ws' : true;

  return {
    name: nameFor(origin.id, rng),
    max: inRange(rng, tier.wounds[0], tier.wounds[1]),
    ws: usesWs ? primary : secondary,
    bs: usesWs ? secondary : primary,
    toughnessBonus: Math.floor(t / 10),
    armour: armourItem ? armourItem.armour : 0,
    weapon: weaponLabel,
    tier: tier.id, origin: origin.id, originName: origin.name,
    combatRole: role.id, combatRoleName: role.name, behaviour: role.behaviour,
    motivation, quirks,
    gmChoice: Boolean(origin.gmChoice)
  };
}

/* ================================ Section 9 ================================
   The fixed bestiary. Numbers are copied as given; a `null` means the
   source gives no usable number (Orden Hyort has none at all; Sslyth's are
   qualitative "High/Mid/Low" placeholders) — bestiaryToNpc() carries that
   through as `custom: true` rather than inventing a figure. */

const B = (name, stats, weapon, custom) => ({ name, ...stats, weapon: weapon || null, custom: Boolean(custom) });

export const BESTIARY = [
  B('Orden Hyort', { ws: null, bs: null, s: null, t: null, ag: null, int: null, per: null, wp: null, fel: null,
    wounds: null, toughnessBonus: null, armour: null },
    null, true),
  B('Kaptin Orlog Mordakka', { ws: 55, bs: 35, s: 64, t: 65, ag: 31, int: 28, per: 32, wp: 42, fel: 40,
    wounds: 44, toughnessBonus: 6, armour: null }, "Da 'Eadzappa (melee, 2d10+11 E, Pen 2, Shocking, Tearing)"),
  B('Guardian of the Inner Sanctum', { ws: 46, bs: 18, s: 48, t: 46, ag: 30, int: 20, per: 33, wp: 25, fel: 6,
    wounds: 45, toughnessBonus: 8, armour: 8 }, 'Chain Axe / Heavy Flamer / Stomp'),
  B('Inquisitor Havelock Blackheel', { ws: 55, bs: 50, s: 45, t: 55, ag: 45, int: 60, per: 60, wp: 65, fel: 50,
    wounds: 21, toughnessBonus: 5, armour: 5 }, 'Baleflame Incinerator / Burning Blade'),
  B("T'Zar the Broker", { ws: 27, bs: 36, s: 36, t: 27, ag: 45, int: 63, per: 54, wp: 63, fel: 36,
    wounds: 18, toughnessBonus: 8, armour: 3 }, 'Blessings of Tzeentch (spawns 2 Blue Horrors on death)'),
  B('The Luminary', { ws: 51, bs: 42, s: 42, t: 33, ag: 51, int: 51, per: 42, wp: 51, fel: 60,
    wounds: 18, toughnessBonus: 6, armour: 2 }, 'Pincer Claw / Soporific Musk'),
  B('Clawed Fiend', { ws: 43, bs: null, s: 59, t: 53, ag: 47, int: 16, per: 54, wp: 23, fel: 4,
    wounds: 48, toughnessBonus: 10, armour: 4 }, 'Claws & Barbed Tail'),
  B('Creeping Stalker', { ws: 30, bs: null, s: 33, t: 48, ag: 8, int: 8, per: 43, wp: 15, fel: 1,
    wounds: 12, toughnessBonus: 4, armour: 2 }, 'Lashing Tentacles & Acidic Mouth'),
  B('Khymera', { ws: 45, bs: null, s: 40, t: 35, ag: 54, int: 15, per: 40, wp: 35, fel: null,
    wounds: 21, toughnessBonus: 6, armour: 0 }, 'Teeth & Claws / Raptorial Arms'),
  B("Killian's Bane", { ws: 43, bs: null, s: 46, t: 53, ag: 47, int: 22, per: 36, wp: 33, fel: null,
    wounds: 41, toughnessBonus: 8, armour: 5 }, 'Extendable Jaws / Gulp Attack'),
  B('Terrorax', { ws: 43, bs: null, s: 47, t: 38, ag: 49, int: 18, per: 38, wp: 23, fel: null,
    wounds: 28, toughnessBonus: 6, armour: 6 }, 'Fore-Claws & Serrated Fangs'),
  B("Rak'Gol Render", { ws: 58, bs: 24, s: 50, t: 50, ag: 20, int: 24, per: 39, wp: 15, fel: 3,
    wounds: 33, toughnessBonus: 10, armour: 9 }, 'Implanted Mono-Blades'),
  B('Sslyth', { ws: null, bs: null, s: null, t: null, ag: null, int: null, per: null, wp: null, fel: null,
    wounds: null, toughnessBonus: null, armour: null },
    'Shard Carbine / Splinter Pistols & Xenos Blade', true),
  B('Ebon Geist', { ws: 36, bs: null, s: 36, t: 40, ag: 45, int: 14, per: 45, wp: 42, fel: null,
    wounds: 18, toughnessBonus: 8, armour: 0 }, 'Chill Talons'),
  B('Screamer of Tzeentch', { ws: 35, bs: 35, s: 40, t: 40, ag: 50, int: 15, per: 35, wp: 40, fel: 10,
    wounds: 15, toughnessBonus: 8, armour: 0 }, 'Warp Jaws / Force Bolt'),
  B('Veiled Deceit', { ws: 25, bs: null, s: 20, t: 35, ag: 25, int: 50, per: 45, wp: 50, fel: 35,
    wounds: 10, toughnessBonus: 6, armour: 0 }, 'Psychic Manipulation (Psy Rating 6)'),
  B('Children of the Sacred Flesh', { ws: 40, bs: 19, s: 48, t: 46, ag: 30, int: 24, per: 30, wp: 25, fel: 19,
    wounds: 20, toughnessBonus: 4, armour: 3 }, 'Savage Metal Spear'),
  B('Warp Puppets', { ws: 33, bs: 13, s: 64, t: 21, ag: 11, int: null, per: 12, wp: 13, fel: null,
    wounds: 6, toughnessBonus: 2, armour: 0 }, 'Jagged Debris / laspistol'),
  B('Wyrd Gunslinger', { ws: 35, bs: 50, s: 35, t: 41, ag: 51, int: 34, per: 39, wp: 45, fel: 40,
    wounds: 18, toughnessBonus: 4, armour: 2 }, 'Dual Pistols'),
  B('Void Pirate Captain', { ws: 44, bs: 38, s: 34, t: 42, ag: 34, int: 34, per: 38, wp: 42, fel: 36,
    wounds: 15, toughnessBonus: 4, armour: 5 }, 'bolt pistol / chainsword')
];

export const bestiaryEntry = (name) =>
  BESTIARY.find((b) => b.name.toLowerCase() === String(name || '').toLowerCase()) || null;

// Shapes a bestiary entry into the npc_add payload shape. `weapon` here is
// almost always a bespoke ability string, not a gear.js label — pass it to
// npc_add's `weapon` field for the log/UI to show, but it will not resolve
// through weaponProfile()/npcAttackRoll() unless it happens to match a real
// catalogue item (Void Pirate Captain's "bolt pistol / chainsword" doesn't,
// as written; split and re-add it under gear.js's exact labels if you want
// this specific one to roll automatically).
export function bestiaryToNpc(name) {
  const b = bestiaryEntry(name);
  if (!b) return null;
  return {
    name: b.name,
    max: b.wounds ?? 1,
    ws: b.ws, bs: b.bs, toughnessBonus: b.toughnessBonus, armour: b.armour,
    weapon: b.weapon,
    custom: b.custom
  };
}
