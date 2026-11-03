/* Inquisitorial rosettes: what one is made of and what it can do.

   From the Imperium Maledictum Inquisition GM's Guide, which gives a d10 table
   of how a rosette is made and a d10 table of what it does for each Ordo, plus
   one for any Ordo. Rolled (or chosen) when a character takes the rosette, so
   no two Inquisitors carry the same one. Written here in this app's own words.

   Imperium Maledictum and Rogue Trader are both d100 games with the same
   characteristics, so most of this carries across as it is. Where it does
   not, the rule is named here, so one number is one change:

     Advantage        +20 to the test (Disadvantage is -20)
     +1 SL            +1 Degree of Success
     Discipline       Willpower;  Fortitude: Toughness;  Tech: Tech-Use
     Psychic Mastery  the psyker's Focus Power Test
     Medium Range     40 metres, the same figure imconvert.js uses
     a Zone           everyone within 10 metres
     Warp Charge      Rogue Trader has none. The wards that halve it instead
                      take 20 off the bearer's next Psychic Phenomena roll; the
                      null-rod core that rends by it instead gains Penetration
                      equal to a psyker's Psy Rating or a daemon's Daemonic (X)
     Poisoned (Major) 1d10 damage ignoring Armour and Toughness Bonus, and
                      Stunned for 1 Round

   A character stores the rolls, { form, table, fn }, never the text, so a
   wording fixed here reaches every sheet that already has one.

   Pure: see rosettes.check.mjs. */

import { rangeMetres } from './imconvert.js';

export const ADVANTAGE = 20;
export const DISADVANTAGE = -20;
// A modifier as printed: +20, −20.
export const asModifier = (n) => (n < 0 ? `−${-n}` : `+${n}`);
export const MEDIUM_M = rangeMetres('Medium');
export const ZONE_M = 10;
export const WARD_PHENOMENA = 20;

// What it is made of. d10.
export const ROSETTE_FORMS = [
  'Silver inlaid with circuitry like an electoo, which shimmers when its Inquisitor wakes the gene sensors.',
  'Vat-grown bone cultured from the Inquisitor’s own cells, so it carries their genetic mark.',
  'Black marble cut into the sign of the Inquisition, always ice-cold, and said to burn the impure.',
  'The bone of a long-forgotten Inquisitor Lord, inlaid with silver in a script nobody can read.',
  'Layers of battered plasteel said to be a saint’s armour, taken from an ancient battlefield.',
  'A plain slab of some unknown, very dense metal. Unlocked, it throws a small hololith of the bearer’s face and credentials.',
  'An hourglass of hardened glass holding sand said to be from Terra, etched in High Gothic with the names of everyone who has carried it.',
  'Battle-worn ceramite, carved with the times it has saved its bearers’ lives.',
  'Rockcrete from a ruined cathedral where the Ordos once fought, shaped as a censer holding a little of the Inquisitor’s spinal fluid as their signature.',
  'Purity seals lacquered into one mass, whose scriptures run together into a broken hymn that stays in the mind.'
];

// Whose table to roll on. An Inquisitor rolls on their Ordo's, or on the
// table for any Ordo.
export const ROSETTE_TABLES = [
  { id: 'hereticus', name: 'Ordo Hereticus' },
  { id: 'malleus', name: 'Ordo Malleus' },
  { id: 'xenos', name: 'Ordo Xenos' },
  { id: 'universal', name: 'Any Ordo' }
];

const F = (from, to, name, text) => ({ from, to, name, text });

// What it does. d10, two numbers to a result.
export const ROSETTE_FUNCTIONS = {
  hereticus: [
    F(1, 2, 'Psychic residue', `Once-sanctioned psychic energy soaks it: it serves as a psy-focus, and once a day it gives +${ADVANTAGE} to a Psyniscience Test.`),
    F(3, 4, 'Blank’s bones', `Built around the bones of a blank. Spend a Fate Point and every psyker within ${MEDIUM_M} metres makes a Difficult (−10) Willpower Test or is Stunned for 3 Rounds.`),
    F(5, 6, 'Hexagrammic wards', `Wards that bleed off psychic energy. As a Half Action, take ${WARD_PHENOMENA} off your next roll on the Psychic Phenomena table. The wards need a week to recover.`),
    F(7, 8, 'Soulguilt sense', `Works like a soulguilt scanner: once a day, +${ADVANTAGE} to an Awareness, Scrutiny or Tracking Test made to hunt a heretic, a rogue psyker or a mutant.`),
    F(9, 10, 'Psycho-active core', `Barely felt vibrations run through it within ${MEDIUM_M} metres of a daemon or a psyker.`)
  ],
  malleus: [
    F(1, 2, 'Warding crystal', 'A psycho-active crystal that chimes whenever a warp portal opens or a daemon breaks into realspace within a kilometre.'),
    F(3, 4, 'Hidden wards', `When a psychic power targets you, present it: the psyker’s Focus Power Test is at ${asModifier(DISADVANTAGE)}. The wards burn out until you spend an hour in meditation and prayer.`),
    F(5, 6, 'Null-rod core', 'Used in a melee attack against a psyker or a daemon, the attack gains Penetration equal to the psyker’s Psy Rating or the X of the daemon’s Daemonic (X). Then it needs a week to recharge.'),
    F(7, 8, 'Aura-scrye', 'A tiny aura-scrye: it works as an auspex that finds daemons, for an hour, and then needs 12 hours to recharge.'),
    F(9, 10, 'Geller core', 'Very old, and built around a miniature Geller field. As a Full Action and a Very Hard (−30) Tech-Use Test, it shields whoever holds it from Perils of the Warp, Psychic Phenomena and psychic powers for an hour per Degree of Success (at least one), or drags a warp entity out into realspace. Only a senior Magos can recharge it.')
  ],
  xenos: [
    F(1, 2, 'Archaic translator', `Once a day, +${ADVANTAGE} to one test to read or speak a xenos tongue.`),
    F(3, 4, 'Provenance scanner', 'A Difficult (−10) Tech-Use Test tells whether a device may have been made by a xenos species.'),
    F(5, 6, 'Jokaero digi-laser', 'A last resort set into it: it fires as a laspistol, and its charge refills itself 24 hours after it is fired.'),
    F(7, 8, 'Xenos screech', `It shrieks at a pitch one kind of alien hears: choose the Eldar and their dark kin, Orks, T’au or Kroot. Each of them within ${MEDIUM_M} metres makes a Difficult (−10) Toughness Test or is Deafened and Stunned for 3 Rounds.`),
    F(9, 10, 'Bio-sample extractor', 'A Difficult (−10) Tech-Use Test identifies a sample, but only against an Ordo Xenos library centuries old: anything newer is unknown to it.')
  ],
  universal: [
    F(1, 2, 'Melta trap', 'A melta bomb inside goes off if anyone the Inquisitor has not sanctioned handles it.'),
    F(3, 4, 'Distress beacon', 'Sends a homing signal on the Inquisition’s own coded vox channels, readable anywhere on the same planet.'),
    F(5, 6, 'Emergency trigger', 'As a Free Action it works as a smoke grenade, a signal jammer and a stummer at once.'),
    F(7, 8, 'Data port', 'A hidden port into any cogitator: it works as a combi-tool, and gives +1 Degree of Success on a Tech-Use or Security Test where the Inquisitor’s credentials apply, overriding any access they need.'),
    F(9, 10, 'Neurotoxin trap', `A neurotoxin bomb inside goes off if anyone the Inquisitor has not sanctioned handles it. Everyone within ${ZONE_M} metres makes a Challenging (+0) Toughness Test or takes 1d10 damage ignoring Armour and Toughness Bonus and is Stunned for 1 Round.`)
  ]
};

// What an agent carries in place of the master's own rosette, which few
// Inquisitors lend. The Legature's Sigil of Question is the first of these.
export const EMBLEMS = [
  { id: 'medallion', name: 'A silver sigil worn as a medallion' },
  { id: 'ring', name: 'A silver sigil worn as a ring' },
  { id: 'wallet', name: 'A silver sigil carried in a wallet' },
  { id: 'pendant', name: 'A pendant' },
  { id: 'badge', name: 'A badge sewn into clothing' },
  { id: 'simulacrum', name: 'A sanctioned copy of the master’s rosette' }
];
export const emblemById = (id) => EMBLEMS.find((e) => e.id === id) || null;

const d10 = (n) => Math.max(1, Math.min(10, Math.round(Number(n) || 0)));
const roll10 = (rng) => 1 + Math.floor(rng() * 10);

export const tableById = (id) => ROSETTE_TABLES.find((t) => t.id === id) || null;
export const rosetteForm = (roll) => ROSETTE_FORMS[d10(roll) - 1];
export const rosetteFunction = (table, roll) =>
  (ROSETTE_FUNCTIONS[table] || []).find((f) => d10(roll) >= f.from && d10(roll) <= f.to) || null;

// A rosette as stored: the two rolls and the table. Anything unreadable is
// null rather than a rosette nobody rolled.
export function readRosette(v) {
  if (!v || typeof v !== 'object' || !tableById(v.table)) return null;
  return { form: d10(v.form), table: v.table, fn: d10(v.fn) };
}

export function rollRosette({ table = 'universal', rng = Math.random } = {}) {
  return readRosette({ form: roll10(rng), table: tableById(table) ? table : 'universal', fn: roll10(rng) });
}

// The words for a stored rosette.
export function describeRosette(r) {
  const x = readRosette(r);
  if (!x) return null;
  return { form: rosetteForm(x.form), table: tableById(x.table).name, fn: rosetteFunction(x.table, x.fn) };
}
