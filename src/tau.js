/* The T'au Explorer: how one is made, from the Rogue Trader Tau Character Guide
   (Fantasy Flight Games, 2014).

   The guide replaces the core rules for making a character, so this is not a
   home world and an origin path with the T'au painted on. A T'au Explorer
   chooses a Classified Competence, rolls characteristics from the T'au's own
   bases, takes a fixed set of starting skills, talents, traits and gear, and
   spends starting XP on the Fire Warrior advance tables. That is what this
   file holds: the numbers and the short plain-language summaries (the guide has
   the full rules text; these are for the table, not the rulebook).

   The advance tables themselves are in advances.js with every other career's;
   the guide's weapons and armour are in gear.js.

   Pure: see tau.check.mjs. */

export const TAU_BOOK = 'Rogue Trader: Tau Character Guide';

/* ------------------------------ characteristics ------------------------------ */

// 2d10 on top of these, not on top of 25.
export const TAU_BASE = { ws: 20, bs: 25, s: 20, t: 25, ag: 30, int: 30, per: 25, wp: 25, fel: 25 };

// Starting Wounds: 1d5+2, and twice the Toughness Bonus. Starting Fate: 1, always.
export const TAU_WOUND_DIE = { dice: 1, die: 5, flat: 2 };
export const TAU_WOUND_MULT = 2;
export const TAU_FATE = 1;
export const tauWounds = (d5, toughnessBonus) => (Number(d5) || 0) + TAU_WOUND_DIE.flat + TAU_WOUND_MULT * (Number(toughnessBonus) || 0);

/* ------------------------------ what a Fire Warrior starts with ------------------------------ */

export const TAU_STARTING = {
  skills: ['Common Lore (Tau Empire)', 'Dodge', 'Logic', 'Literacy', 'Speak Language (Tau)', 'Tech-Use'],
  talents: ['Fire Caste Weapon Training', 'Marksman', 'Rapid Reload', 'Supporting Fire', 'Unshakeable Faith'],
  gear: 'Good pulse rifle or good pulse carbine; best pulse pistol; three Tau photon grenades; Tau combat armour with an inbuilt micro-bead; translator unit; blacksun filter.'
};

// The three every T'au Explorer has. (The fourth starting trait, Classified
// Competence, is the one they choose.)
export const TAU_TRAITS = [
  'For the Greater Good!: once per encounter, +10 to a Test made while following another T’au’s order, or +30 if the order puts them in real danger for the group (the GM decides).',
  'Non-Imperial: −10 to Common, Forbidden and Scholastic Lore Tests about the Imperium of Man.',
  'Speak Not Unto the Alien: −20 to Fellowship-based Tests with humans, and theirs with you, until they know you. A xenos aboard a human ship costs it 2 Morale.'
];

/* ------------------------------ Classified Competence ------------------------------ */

// What the Explorer is for in the Fire caste. Choose one at creation.
export const COMPETENCES = [
  { id: 'adept-machinist', name: 'Adept Machinist',
    text: 'When you assist an allied T’au with a Tech-Use Test, you give +20 instead of +10.' },
  { id: 'dauntless-bulwark', name: 'Dauntless Bulwark',
    text: 'When you Charge and hit, each allied T’au already in melee with your target may Disengage as a Free Action.' },
  { id: 'exemplar-of-unity', name: 'Exemplar of Unity',
    text: 'You may take Follow My Lead, a Half Action: allied T’au within 10 m who take the same Half Action you take next get +10 to the Tests it needs, until your next Turn.' },
  { id: 'finder-of-ways', name: 'Finder of Ways',
    text: 'When you pass a Stealth Test, each allied T’au within 20 m gets +10 to their next Stealth Test this encounter.' },
  { id: 'precise-hunter', name: 'Precise Hunter',
    text: 'You may take Expose Weakness, a Full Action: pass a Challenging Ballistic Skill Test and name a hit location on your target; allied T’au skip rolling it, and hits there gain +2 Penetration, and +1 more for each Degree you scored.' },
  { id: 'windstrider', name: 'Windstrider',
    text: 'Once per encounter, spend a Reaction to Half Move in a vehicle or battlesuit. If you end within 3 m of a friendly T’au, the next attack that would hit them hits you instead.' }
];
export const competenceById = (id) => COMPETENCES.find((c) => c.id === id) || null;

// Awarded by the GM for valour; not chosen at creation.
export const HEIGHTENED_SIGNIFICANCE = [
  { id: 'autonomous-safeguard', name: 'Autonomous Safeguard', text: 'A drone controller and a shield drone follow and protect you.' },
  { id: 'special-issue-prototypes', name: 'Special-Issue Prototypes', text: 'You are issued a rare or powerful piece of weaponry.' },
  { id: 'mantle-of-heroes', name: 'Mantle of Heroes', text: 'You may buy Pilot (Personal) for 100 XP, are given a battlesuit, and may take the Battlesuit Pilot rank when you reach its Rank.' },
  { id: 'honour-guard', name: 'Honour Guard', text: 'One or more Fire Warriors follow your every command to the death, and are replaced if they fall.' }
];

/* ------------------------------ the new talents ------------------------------ */

// Written for the table, in the app’s own words; the guide has each one in full.
export const TAU_TALENT_TEXT = {
  'Blessing of the Ethereals': 'An Ethereal once blessed you for a worthy deed. While you are suffering Critical Damage you are immune to Fear and Pinning, but backing out of a fight without a direct order needs a Willpower Test.',
  'Bonding Ritual': 'You have undergone the Ta’lissera rite with other warriors. The first time each encounter you take Critical Damage, if another with this talent is within 20 m you pass the Critical Effect’s Tests and ignore its non-permanent effects.',
  'Disciple of Kauyon': 'You are skilled at being the bait in the Patient Hunter’s trap. Your Perfect Lure Action draws an enemy to you and away from your allies, with a penalty when it shoots at them.',
  'Disciple of Mont’ka': 'You are skilled at the Killing Blow: when you hit an Unaware target you do extra Damage equal to your Degrees of Success.',
  'Envoy of the Greater Good': 'You lose Speak Not Unto the Alien, and when you meet a people who have never met the T’au a Fate Point and a Charm Test gives +10 to Interaction with them and a useful piece of information.',
  'Exemplar of the Selfless Cause': 'You lead by example. You gain Follow My Lead, or if you have it already its bonus becomes +20.',
  'Fire Caste Weapon Training': 'You are trained with every T’au weapon and suffer no untrained penalty with them.',
  'Fire Support': 'Once per encounter, with a markerlight and the means to call it in, you may paint a target as a Full Action; a few Rounds later a Seeker missile strikes it.',
  'Furious Fusillade': 'When you pass the Ballistic Skill Test for a Semi-Auto or Full Auto attack while Aiming, you automatically score an extra Degree.',
  'Greater than the Sum': 'Once per session, spend a Fate Point to gain a talent an ally has, or lend one of yours to an ally, until the end of the encounter.',
  'Master of Technology': 'You know the machines your people make. You may spend a Fate Point to pass a Tech-Use Test with Degrees equal to your Intelligence Bonus.',
  'New Allies': 'You are used to fighting beside xenos and humans. Your For the Greater Good!, Supporting Fire and Classified Competence, and talents that name other T’au, work for any trusted ally.',
  'Strength through Unity': 'In melee you get +5 Weapon Skill and +1 Damage for each ally with Bonding Ritual engaged with the same target.',
  'Superior Supply Chain': '+20 to Acquisition Tests for T’au weapons, wargear and equipment.',
  'Supporting Fire': 'When an enemy Charges an allied T’au within 20 m, you may spend your Reaction on a Standard Ranged Attack against it at −20, before it arrives.',
  'Tactical Flexibility': 'Once per encounter, a Half Action and a Scholastic Lore (Tau Empire) Test lets you and each other T’au within 20 m Disengage as a Free Action.',
  'Technological Insight': 'A Tech-Use Test as a Half Action lets you use a weapon you have no training for, without penalty, for a Round and one more per Degree.',
  'Technology Triumphant': 'Once per session, a Hard Tech-Use Test improves an item’s Craftsmanship by one step.',
  'Through Unity, Devastation': 'With a Fate Point and a Ballistic Skill Test you Mark one target for a few Rounds; allied T’au who hit it roll Damage twice and take the better.',
  'Guided Precision': 'When you hit a target with a markerlight, others attacking it get +10 to hit and ignore cover Armour Points up to your Perception Bonus.',
  'Opportunist’s Evasion': 'When you pass a Dodge or Parry against an enemy within 20 m, your allies get +20 to Weapon and Ballistic Skill Tests against it until your next Turn.',
  'Priority Fire': 'Once per Round, as a Half Action or Reaction, one of your drones makes an attack at once, as a Free Action.',
  'Swarm Protocols': 'When you give a drone an order, it can go to a number of drones up to your Intelligence Bonus.',
  'Advanced Battlesuit Training': 'A battlesuit’s Size no longer makes you easier to hit.',
  'Veteran’s Reflexes': 'In a battlesuit you may use Pilot (Personal) in place of Acrobatics, Dodge and Parry.',
  'Unshakeable Faith': 'Your faith in the Greater Good holds you steady against terror and doubt.'
};
export const TAU_TALENTS = Object.keys(TAU_TALENT_TEXT);

/* ------------------------------ the T'au in other things ------------------------------ */

export const TAU_CAREER = "T'au Fire Warrior";

/* ------------------------------ T'au for the GM to run ------------------------------ */

/* The guide prints two profiles (a Fire Warrior of an Explorer's honour guard,
   p.8, and a drone, p.29). Those are given as printed. The guide prints no
   profile for a pilot in a battlesuit, so each of the four below is built the
   one way the guide says to: the Fire Warrior, with the suit's Strength and
   Armour Points in place of the pilot's own (Enhanced Motive Systems, p.31;
   the suit profiles are on pp.39-43) and the suit's Recommended Loadout. Which
   are printed and which are built is said on the entry. */

const FW = { ws: 25, bs: 35, s: 30, t: 30, ag: 20, int: 30, per: 35, wp: 30, fel: 25 };
const FW_TALENTS = 'Talents: Bonding Ritual, Combat Formation, Fire Caste Weapon Training, Greater than the Sum, Supporting Fire. For the Greater Good!';
const PULSE_RIFLE = 'Pulse Rifle (150m; S/2/4; 2d10+3 E; Pen 4; Clip 36; Gyro-Stabilised)';
const BUILT = (suit, page) => `Built, not printed: the guide gives no pilot profile, so this is the Honour Guard Fire Warrior (p.8) with the ${suit}'s Strength and Armour Points and its Recommended Loadout (p.${page}).`;

export const TAU_NPCS = [
  { name: "T'au Fire Warrior (Honour Guard)", page: 8, tier: 1,
    stats: { ...FW, wounds: 13, toughnessBonus: 3, armour: 6 }, armourNote: 'Tau combat armour 6 all',
    weapon: PULSE_RIFLE,
    abilities: `${FW_TALENTS}. Skills: Awareness, Command, Common Lore (Tau Empire), Dodge, Medicae, Scholastic Lore (Tau War Doctrine) +10. Or a Pulse Carbine (60m; S/\u2013/3; 2d10+2 E; Pen 4; Clip 24; Gyro-Stabilised). 2 Tau photon grenades, a micro-bead.`,
    note: "Printed. The guide's own rail rifle line differs from its weapons table (2d10+3, Pen 4 against 3d10+2, Pen 12); the table is used for the gear." },
  { name: "T'au Gun Drone", page: 29, tier: 2,
    stats: { ws: 22, bs: 22, s: 30, t: 45, ag: 40, int: 15, per: 35, wp: 30, fel: 8, wounds: 12, toughnessBonus: 4, armour: 4 },
    armourNote: 'Machine 4 all',
    weapon: 'Twin-linked Pulse Carbine (60m; S/\u2013/3; 2d10+2 E; Pen 4; Clip 24; Gyro-Stabilised, Twin-linked)',
    abilities: 'Or a Longshot Pulse Rifle (200m; S/2/\u2013; 2d10+3 E; Pen 4; Clip 12; Accurate, Tearing), or a markerlight or a shield generator in place of a gun. Hoverer (6). Machine (4). Size (Scrawny). Dark Sight. Fearless. Guardian. Dodge +10. Programmed Intelligence: beyond 50 m of a friendly drone controller it takes only one Half Action a Turn and no Reactions.',
    note: 'Printed. The guide prints its twin-linked damage as "2d0+2"; 2d10+2 is read, as for the pulse carbine.' },
  { name: "T'au Stealth Suit Pilot", page: 39, tier: 3,
    stats: { ...FW, s: 45, wounds: 13, toughnessBonus: 3, armour: 8 }, armourNote: 'XV25 Stealth battlesuit 8 all',
    weapon: 'Burst Cannon (60m; \u2013/3/6; 2d10+3 E; Pen 4; Clip 40)',
    abilities: `Or a Fusion Blaster (20m; S/\u2013/\u2013; 2d10+8 E; Pen 12; Clip 8). Pilot (Personal). Size (Hulking). Jet pack, multi-tracker, blacksun filters. Stealth field: no Size penalty to Concealment, and two extra Degrees of Success on Concealment, Dodge, Shadowing and Stealth Tests. ${FW_TALENTS}.`,
    note: BUILT('XV25 Stealth battlesuit', 39) },
  { name: "T'au Crisis Suit Pilot", page: 40, tier: 3,
    stats: { ...FW, s: 55, wounds: 13, toughnessBonus: 3, armour: 10 }, armourNote: 'XV8 Crisis battlesuit 10 all',
    weapon: 'Fusion Blaster (20m; S/\u2013/\u2013; 2d10+8 E; Pen 12; Clip 8)',
    abilities: `Also a Burst Cannon (60m; \u2013/3/6; 2d10+3 E; Pen 4; Clip 40), and a target lock. Pilot (Personal). Size (Enormous). Jet pack, multi-tracker, blacksun filters. ${FW_TALENTS}.`,
    note: BUILT('XV8 Crisis battlesuit', 40) },
  { name: "T'au Broadside Pilot", page: 42, tier: 3,
    stats: { ...FW, s: 65, wounds: 13, toughnessBonus: 3, armour: 15 }, armourNote: 'XV88 Broadside battlesuit 15 all',
    weapon: 'Heavy Rail Rifle (300m; S/\u2013/\u2013; 4d10+8 I; Pen 12; Clip 12; Felling, Proven (3), Tearing)',
    abilities: `Also a Smart Missile System (150m; S/\u2013/6; 2d10+4 X; Pen 4; Clip 48), and a target lock. Pilot (Personal). Size (Enormous). No jet pack. ${FW_TALENTS}.`,
    note: BUILT('XV88 Broadside battlesuit', 42) },
  { name: "T'au Riptide Pilot", page: 42, tier: 4,
    stats: { ...FW, s: 80, wounds: 13, toughnessBonus: 3, armour: 14 }, armourNote: 'XV104 Riptide 14 all',
    weapon: 'Heavy Burst Cannon (80m; \u2013/6/12; 2d10+7 E; Pen 6; Clip 120; Tearing)',
    abilities: `Also a Smart Missile System (150m; S/\u2013/6; 2d10+4 X; Pen 4; Clip 48), and a shield generator. Pilot (Personal). Size (Massive). Once a Round it can be overloaded with a Difficult Tech-Use Test (force field, nova-charged weapon, or more flight), and the pilot is hurt if it fails. ${FW_TALENTS}.`,
    note: BUILT('XV104 Riptide', 42) }
];
