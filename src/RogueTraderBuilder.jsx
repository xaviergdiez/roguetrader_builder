import React, { useState, useEffect, useRef, useMemo } from 'react';
import { framingStyle, panFraming, DEFAULT_FRAMING } from './framing.js';
import { readRoster, writeRoster, upsert, remove as removeChar, newId,
  cloudList, cloudGet, cloudPut, cloudDelete } from './roster.js';
import { parseGear, gearInfo, CRAFT, GEAR } from './gear.js';
import { woundState, applyDamage, adjustMax } from './wounds.js';
import { roll1d100, resolveTest, DIFFICULTIES } from './dice.js';
import { conditionalsFor } from './effects.js';
import {
  MODES as PSY_MODES, MAX_PUSH, effectivePsyRating, phenomenaModifier,
  risksPhenomena, psyRatingInfo, disciplineSlots, thoughtSendingKm,
  describePower, manifest, sustainPenalty, DISCIPLINES, ALL_TECHNIQUES
} from './psychic.js';
import {
  rankForXp, romanRank, xpToNextRank, isStartingBudget, spendableXp, remainingXp,
  tierFor, ADVANCE_LEVELS, ADVANCE_STEP, advanceCost, cumulativeAdvanceCost
} from './xp.js';
import { allAdvances, advanceStatus, MAX_TABLED_RANK } from './advances.js';
import {
  HULLS, COMPONENTS, ESSENTIAL_CATEGORIES, ESSENTIAL_LABELS, CREW_RATINGS,
  SLOT_NAMES, WEAPON_CLASSES, allHulls, allComponents, isHomebrew, damageText,
  validateHull, validateComponent, usableCustom,
  hullById, componentById, validate, stats, newVitals
} from './ship.js';
import {
  SHIP_ROLES, GM_EVENTS, roleById, rolesForCareer, playerRoles, isGmOnlyRole
} from './shiproles.js';
import {
  PHASES, PHASE_LABELS, nextPhase, initiativeOrder, toHit, hitsScored,
  resolveAttack, criticalEffect, applyEvent,
  EXTENDED_ACTIONS, mayTakeAction, actionOutcome
} from './voidcombat.js';
import {
  createDynasty, joinBridge, leaveBridge, writeBridge, emitEvent, pollBridge,
  assignNpc, unassignNpc, sendMessage
} from './bridge.js';
import {
  EMPTY as EMPTY_HOMEBREW, normalise as readHomebrew, isEmpty as homebrewEmpty,
  readLocal as readLocalHomebrew, writeLocal as writeLocalHomebrew,
  cloudGet as homebrewGet, cloudPut as homebrewPut
} from './homebrew.js';
import { parseCsv, parseCharacterSheet, sheetIdFrom } from './sheet.js';
import {
  POINT_BASE, POINT_POOL, emptyAllocation, pointsRemaining,
  allocationTotals, allocate, isComplete, grantable
} from './points.js';
import { SKILLS, TALENTS, explainEntry, charGroup } from './glossary.js';
import { buildLore } from './lore.js';

/* ============================================================
   ROGUE TRADER : ORIGIN PATH COGITATOR
   Character builder for Rogue Trader (FFG, 2009 core rules)
   with an integrated Vox-Synthesiser (Web Speech TTS).
   ============================================================ */

const CHAR_KEYS = ['ws', 'bs', 's', 't', 'ag', 'int', 'per', 'wp', 'fel'];
const CHAR_NAMES = {
  ws: 'Weapon Skill', bs: 'Ballistic Skill', s: 'Strength', t: 'Toughness',
  ag: 'Agility', int: 'Intelligence', per: 'Perception', wp: 'Willpower', fel: 'Fellowship'
};
const CHAR_SHORT = {
  ws: 'WS', bs: 'BS', s: 'S', t: 'T', ag: 'Ag', int: 'Int', per: 'Per', wp: 'WP', fel: 'Fel'
};

const d = (n) => 1 + Math.floor(Math.random() * n);
const anyCharChoice = (idPrefix, bonus) => ({
  id: idPrefix,
  label: `Apply +${bonus} to one characteristic`,
  options: CHAR_KEYS.map((k) => ({ label: CHAR_NAMES[k], mods: { [k]: bonus } }))
});

/* ---------------------------- HOME WORLDS ---------------------------- */

const HOME_WORLDS = [
  {
    id: 'death',
    name: 'Death World',
    blurb: 'You were raised where the ground itself wants you dead. Everything since has felt survivable.',
    mods: { s: 5, t: 5, wp: 5, fel: -5 },
    skills: ['Survival'],
    talents: ['Melee Weapon Training (Primitive)'],
    traits: [
      'Paranoid: −10 to all Interaction Skill Tests in formal surroundings.',
      'Survivor: +10 to any Test to resist Pinning and Shock.'
    ],
    woundDie: () => d(5) + 2,
    woundText: '2 × Toughness Bonus + 1d5+2',
    fateTable: [[5, 2], [10, 3]],
    choices: [{
      id: 'dw_hardened',
      label: 'Hardened',
      options: [
        { label: 'Jaded', talents: ['Jaded'] },
        { label: 'Resistance (Poisons)', talents: ['Resistance (Poisons)'] }
      ]
    }]
  },
  {
    id: 'void',
    name: 'Void Born',
    blurb: 'Born between stars, on a hull that never made planetfall. Gravity is a local opinion.',
    mods: { s: -5, wp: 5 },
    skills: ['Speak Language (Ship Dialect)'],
    traits: [
      'Charmed: when you spend a Fate Point, roll 1d10. On a natural 9 it is not lost.',
      'Ill-Omened: −5 on Fellowship Tests with non-void born humans.',
      'Shipwise: Navigation (Stellar) and Pilot (Spacecraft) count as Basic Skills.',
      'Void Accustomed: immune to space travel sickness; low gravity is not Difficult Terrain.'
    ],
    woundDie: () => d(5),
    woundText: '2 × Toughness Bonus + 1d5',
    fateTable: [[5, 3], [10, 4]]
  },
  {
    id: 'forge',
    name: 'Forge World',
    blurb: 'Weighed, measured, codified and assigned a place in the great pattern before you could walk.',
    mods: { ws: -5, int: 5 },
    skills: ['Common Lore (Tech)', 'Common Lore (Machine Cult)'],
    talents: ['Technical Knock'],
    traits: [
      'Stranger to the Cult: −10 on Tests involving the Imperial Creed, −5 on Fellowship Tests with the Ecclesiarchy in formal settings.'
    ],
    woundDie: () => d(5) + 1,
    woundText: '2 × Toughness Bonus + 1d5+1',
    fateTable: [[5, 2], [9, 3], [10, 4]],
    choices: [anyCharChoice('fw_purpose', 3)]
  },
  {
    id: 'hive',
    name: 'Hive World',
    blurb: 'Raised in a city with no horizon. Quicker on the draw than anyone born under open sky.',
    mods: { t: -5, fel: 5 },
    skills: ['Speak Language (Hive Dialect)', 'Tech-Use'],
    traits: [
      'Accustomed to Crowds: crowds are not Difficult Terrain, and no penalty to keep your feet when running through them.',
      'Caves of Steel: Tech-Use counts as a Basic Skill.',
      'Hivebound: −10 to Survival Tests, and −5 to Intelligence Tests outside a proper hab.',
      'Wary: +1 to Initiative rolls.'
    ],
    woundDie: () => d(5) + 1,
    woundText: '2 × Toughness Bonus + 1d5+1',
    fateTable: [[5, 2], [8, 3], [10, 4]]
  },
  {
    id: 'imperial',
    name: 'Imperial World',
    blurb: 'One of a trillion faithful. You know the hymns, the tithes and exactly how far not to look.',
    mods: { wp: 3 },
    skills: [
      'Common Lore (Imperial Creed)', 'Common Lore (Imperium)', 'Common Lore (War)',
      'Literacy', 'Speak Language (High Gothic)'
    ],
    traits: [
      'Blessed Ignorance: −5 on Forbidden Lore Tests.',
      'Hagiography: wide, shallow knowledge of the Imperium and its martyrs.'
    ],
    woundDie: () => d(5),
    woundText: '2 × Toughness Bonus + 1d5',
    fateTable: [[8, 3], [10, 4]]
  },
  {
    id: 'noble',
    name: 'Noble Born',
    blurb: 'Bloodline first, everything else after. You have never once opened a door yourself.',
    mods: { wp: -5, fel: 5 },
    skills: ['Literacy', 'Speak Language (High Gothic)', 'Speak Language (Low Gothic)'],
    talents: ['Peer (Nobility)'],
    traits: [
      'Etiquette: +10 on Interaction Skill Tests with high authority and in formal situations.',
      'Legacy of Wealth: +1 to the group\u2019s starting Profit Factor.',
      'Vendetta: your house has enemies who want you inconvenienced, harmed or dead.'
    ],
    profit: 1,
    woundDie: () => d(5),
    woundText: '2 × Toughness Bonus + 1d5',
    fateTable: [[3, 2], [9, 3], [10, 4]],
    choices: [{
      id: 'nb_peer',
      label: 'Supremely Connected: choose a second Peer',
      options: ['Academics', 'Adeptus Mechanicus', 'Administratum', 'Astropaths', 'Ecclesiarchy',
        'Government', 'Mercantile', 'Military', 'Underworld'].map((p) => ({
          label: p, talents: [`Peer (${p})`]
        }))
    }]
  },
  {
    id: 'fortress',
    name: 'Fortress World',
    blurb: 'Raised behind guns that never cool, on a world that has been under siege '
      + 'longer than anyone can remember. Vigilance came before speech.',
    mods: { per: 5, wp: 5, fel: -5 },
    // Every fortress worlder is drilled in it from childhood. Spelled exactly
    // as the Arch-Militant package spells it, so the two dedupe into one line
    // instead of listing the same skill twice on the dossier.
    skills: ['Secret Tongue (Military) (Int)'],
    traits: [
      'Never Stop Shooting: semi-automatic burst as a Half Action, once per turn. '
        + 'Spend a Fate Point and you may do it twice in a turn.',
      'Bred for War: loyal to a fault and inflexible with it — −5 to all '
        + 'Interaction Skill Tests in civic surroundings.'
    ],
    woundDie: () => d(5) + 1,
    woundText: '2 × Toughness Bonus + 1d5+1',
    // 1-8 gives three Fate Points, 9-10 gives four.
    fateTable: [[8, 3], [10, 4]],
    choices: [{
      id: 'ftw_doctrine',
      label: 'Combat Doctrine',
      options: [
        { label: 'Nerves of Steel', talents: ['Nerves of Steel'] },
        { label: 'Sprint', talents: ['Sprint'] }
      ]
    }]
  },
  {
    id: 'aeldari',
    name: 'Aeldari',
    blurb: 'Born of the elder kin, shaped by millennial tradition and psychic evolution. Every reflex is honed; every wound more fragile.',
    xenos: true,
    mods: { t: -5, ag: 10, per: 5, fel: -5 },
    skills: [
      'Acrobatics', 'Awareness', 'Common Lore (Eldar)',
      'Dodge', 'Forbidden Lore (Xenos)',
      'Speak Language (Eldar, Low Gothic)', 'Silent Move'
    ],
    talents: [
      'Ambidextrous', 'Catfall', 'Heightened Senses (Sight, Hearing)',
      'Leap Up', 'Exotic Weapon Training (Shuriken Pistol)', 'Sprint'
    ],
    traits: [
      'Unnatural Agility (×2): Agility Bonus is doubled for movement, initiative and evasion.',
      'Waystone: a psychically attuned spirit stone absorbs the soul upon death, protecting it from She Who Thirsts.',
      'Matchless Grace: ignore movement penalties for difficult terrain when Running or Charging.',
      'Non-Imperial: −10 on all tests involving Imperial lore, customs or social interactions with non-Xenophile humans.',
      'Speak Not Unto the Alien: −10 to Fellowship tests when interacting with Imperial citizens.',
      'Cybernetic Rejection: each standard Imperial bionic implant inflicts a permanent −10 to Toughness.'
    ],
    woundMult: 1,
    woundDie: () => d(5) + 6,
    woundText: 'Toughness Bonus + 1d5+6',
    fateTable: [[7, 1], [10, 2]]
  },
  {
    id: 'ork',
    name: 'Ork',
    blurb: 'Born of fungal spores and endless war. Nigh-unkillable, terrifying up close, and happy to work for whoever pays in brawls and loot.',
    xenos: true,
    mods: { bs: -10, s: 10, t: 10, ag: -10, int: -10, fel: -10 },
    skills: [
      'Awareness', 'Common Lore (Orks)', 'Intimidate',
      'Speak Language (Ork, Low Gothic)', 'Survival'
    ],
    talents: [
      'Basic Weapon Training (Primitive, Ork)', 'Pistol Weapon Training (Primitive, Ork)',
      'Melee Weapon Training (Primitive, Ork)', 'Furious Assault',
      'Iron Jaw', 'True Grit', 'Crushing Blow'
    ],
    traits: [
      'Unnatural Toughness (×2): Toughness Bonus is doubled when reducing incoming damage.',
      'Size (Hulking): enemies gain +10 to hit the Ork, but base movement is increased by +1.',
      'Iron Jaw: pass a Routine (+10) Toughness Test to automatically shrug off Stun effects.',
      'True Grit: halve critical damage results (rounded down) when taking Critical Damage.',
      'Make Do: can jury-rig any equipment; Imperial weapons gain Unreliable or Inaccurate when handled by Orks.',
      'Non-Imperial: −10 on tests involving Imperial lore, customs or interactions with non-Xenophile humans.',
      'Speak Not Unto the Alien: −10 to Fellowship tests when interacting with Imperial citizens.',
      'Cybernetic Rejection: each Imperial bionic implant inflicts a permanent −10 to Toughness.'
    ],
    woundMult: 1,
    woundDie: () => d(5) + 12,
    woundText: 'Toughness Bonus + 1d5+12',
    fateTable: [[7, 1], [10, 2]]
  },
  {
    id: 'kroot',
    name: 'Kroot',
    blurb: 'Avian hunters shaped by millennia of consuming the genetic essence of the fallen. Their battlefield awareness and wilderness instincts are without equal.',
    xenos: true,
    mods: { s: 5, t: 5, ag: 5, int: -5, per: 10, fel: -10 },
    skills: [
      'Awareness', 'Climb', 'Concealment', 'Dodge',
      'Speak Language (Kroot, Low Gothic)', 'Shadowing', 'Silent Move', 'Survival'
    ],
    talents: [
      'Basic Weapon Training (Universal)', 'Melee Weapon Training (Universal)',
      'Heightened Senses (Sight, Hearing)', 'Fieldcraft'
    ],
    traits: [
      'Unnatural Perception (×2): Perception Bonus is doubled for sensory, tracking and wilderness survival tests.',
      'Eater of Flesh: consuming a defeated foe’s raw flesh allows the Kroot to absorb genetic traits, unlocking Kindred Advances on the career table.',
      'Fieldcraft: +10 to Concealment, Shadowing and Silent Move tests; base movement is doubled in natural wilderness terrain.',
      'Natural Weapons (Beak & Claws): counts as armed unarmed, dealing 1d10 + SB Rending damage.',
      'Non-Imperial: −10 on tests involving Imperial lore, customs or interactions with non-Xenophile humans.',
      'Speak Not Unto the Alien: −10 to Fellowship tests when interacting with Imperial citizens.',
      'Cybernetic Rejection: each Imperial bionic implant inflicts a permanent −10 to Toughness.'
    ],
    woundMult: 1,
    woundDie: () => d(5) + 11,
    woundText: 'Toughness Bonus + 1d5+11',
    fateTable: [[7, 1], [10, 2]]
  },
  {
    id: 'drukhari',
    name: 'Drukhari',
    blurb: 'Raiders from Commorragh who sustain their immortal lives through inflicted suffering. Lethal and graceful, they feed on agony as others breathe air.',
    xenos: true,
    mods: { ws: 5, bs: 5, t: -5, ag: 10, per: 5, fel: -5 },
    skills: [
      'Acrobatics', 'Awareness', 'Common Lore (Dark Eldar)', 'Dodge',
      'Intimidate', 'Speak Language (Dark Eldar, Low Gothic)', 'Pilot (Flyers)', 'Silent Move'
    ],
    talents: [
      'Ambidextrous', 'Catfall', 'Exotic Weapon Training (Splinter Pistol, Splinter Rifle)',
      'Heightened Senses (Sight, Hearing)', 'Leap Up', 'Melee Weapon Training (Universal)', 'Sprint'
    ],
    traits: [
      'Unnatural Agility (×2): Agility Bonus is doubled for movement, initiative and evasion.',
      'Soul Thirst: must regularly witness or inflict pain; doing so restores Fate Points, heals Wounds and wards off decay.',
      'Matchless Grace: ignore movement penalties for difficult terrain when Running or Charging.',
      'Keen Senses: possesses innate Darkvision and Night Vision, ignoring sight penalties in complete darkness.',
      'Non-Imperial: −10 on tests involving Imperial lore, customs or interactions with non-Xenophile humans.',
      'Speak Not Unto the Alien: −10 to Fellowship tests when interacting with Imperial citizens.',
      'Cybernetic Rejection: each Imperial bionic implant inflicts a permanent −10 to Toughness.'
    ],
    woundMult: 1,
    woundDie: () => d(5) + 7,
    woundText: 'Toughness Bonus + 1d5+7',
    fateTable: [[7, 1], [10, 2]]
  },
  {
    id: 'tau',
    name: "T'au",
    blurb: "Disciplined Fire Caste soldiers fighting for the Greater Good. Patient, precise, and deeply alien in how they understand war.",
    xenos: true,
    mods: { ws: -5, bs: 5, per: 5, wp: 5, fel: -5 },
    skills: [
      'Awareness', 'Common Lore (Tau Empire)', 'Dodge',
      'Speak Language (Tau, Low Gothic)', 'Logic', 'Scholastic Lore (Tactica Tau)', 'Tech-Use'
    ],
    talents: [
      'Exotic Weapon Training (Pulse Weapons)', 'Marksman', 'Nerves of Steel'
    ],
    traits: [
      'For the Greater Good: +10 to all tests when coordinating target fire or executing tactical commands with allies targeting the same enemy.',
      'Poor Melee Vision: permanent −10 penalty to all Weapon Skill tests, Parries and close-quarters manoeuvres.',
      'Non-Imperial: −10 on tests involving Imperial lore, customs or interactions with non-Xenophile humans.',
      'Speak Not Unto the Alien: −10 to Fellowship tests when interacting with Imperial citizens.',
      'Cybernetic Rejection: each Imperial bionic implant inflicts a permanent −10 to Toughness.'
    ],
    woundMult: 1,
    woundDie: () => d(5) + 8,
    woundText: "Toughness Bonus + 1d5+8",
    fateTable: [[7, 1], [10, 2]]
  }
];

/* ---------------------------- BIRTHRIGHT ---------------------------- */

const BIRTHRIGHTS = [
  {
    id: 'scavenger',
    name: 'Scavenger',
    blurb: 'A childhood where surviving the day counted as a win.',
    choices: [
      {
        id: 'sc_t', label: 'Talent',
        options: [
          { label: 'Unremarkable', talents: ['Unremarkable'] },
          { label: 'Resistance (Fear)', talents: ['Resistance (Fear)'] }
        ]
      },
      {
        id: 'sc_b', label: 'Bonus',
        options: [
          { label: '+3 Willpower', mods: { wp: 3 } },
          { label: '+3 Agility', mods: { ag: 3 } }
        ]
      },
      {
        id: 'sc_c', label: 'Cost',
        options: [
          { label: '1d5 Corruption', corruption: () => d(5) },
          { label: '1d5 Insanity', insanity: () => d(5) }
        ]
      }
    ]
  },
  {
    id: 'scapegrace',
    name: 'Scapegrace',
    blurb: 'You came up among entertainers, gangers and reclaimators. Survival was a game with prizes.',
    skills: ['Sleight of Hand'],
    choices: [
      {
        id: 'sg_b', label: 'Bonus',
        options: [
          { label: '+3 Intelligence', mods: { int: 3 } },
          { label: '+3 Perception', mods: { per: 3 } }
        ]
      },
      {
        id: 'sg_c', label: 'Cost',
        options: [
          { label: '1d5 Corruption', corruption: () => d(5) },
          { label: '1d5 Insanity', insanity: () => d(5) }
        ]
      }
    ]
  },
  {
    id: 'stubjack',
    name: 'Stubjack',
    blurb: 'Born to violence, paid in Thrones, and content with the arrangement.',
    skills: ['Intimidate'],
    talents: ['Quick Draw'],
    mods: { fel: -5 },
    insanityRoll: () => d(5),
    notes: ['1d5 Insanity Points'],
    choices: [{
      id: 'sj_b', label: 'Combat bonus',
      options: [
        { label: '+5 Weapon Skill', mods: { ws: 5 } },
        { label: '+5 Ballistic Skill', mods: { bs: 5 } }
      ]
    }]
  },
  {
    id: 'creed',
    name: 'Child of the Creed',
    blurb: 'Raised under the stern gaze of the God-Emperor. The clerics are still at your shoulder.',
    talents: ['Unshakeable Faith'],
    mods: { ws: -3 },
    choices: [{
      id: 'cc_b', label: 'Bonus',
      options: [
        { label: '+3 Willpower', mods: { wp: 3 } },
        { label: '+3 Fellowship', mods: { fel: 3 } }
      ]
    }]
  },
  {
    id: 'savant',
    name: 'Savant',
    blurb: 'Apprenticed young to ink, dust and lexmachinery. Learning is the only comfort you trust.',
    mods: { t: -3 },
    choices: [
      {
        id: 'sv_a', label: 'Training',
        options: [
          { label: 'Logic as a trained Basic Skill', skills: ['Logic'] },
          { label: 'Peer (Academic)', talents: ['Peer (Academic)'] }
        ]
      },
      {
        id: 'sv_b', label: 'Bonus',
        options: [
          { label: '+3 Intelligence', mods: { int: 3 } },
          { label: '+3 Fellowship', mods: { fel: 3 } }
        ]
      }
    ]
  },
  {
    id: 'vaunted',
    name: 'Vaunted',
    blurb: 'Years of exhibitions, strange drugs and carefully hidden violence, high above the toiling masses.',
    talents: ['Decadence'],
    mods: { per: -3 },
    corruptionRoll: () => d(5),
    notes: ['1d5 Corruption Points'],
    choices: [{
      id: 'vt_b', label: 'Bonus',
      options: [
        { label: '+3 Agility', mods: { ag: 3 } },
        { label: '+3 Fellowship', mods: { fel: 3 } }
      ]
    }]
  },
  {
    id: 'trooper',
    name: 'Trooper',
    blurb: 'One of the trillions who hold the line. Separated from your regiment by '
      + 'bad orders, worse luck or a bogged-down bureaucracy, and still standing.',
    // Unconditional, unlike the choice-attached rolls elsewhere: the spec
    // applies it to every Trooper.
    insanityRoll: () => d(5),
    notes: ['1d5 Insanity Points'],
    choices: [
      {
        id: 'tr_skill', label: 'Advanced training',
        options: [
          { label: 'Medicae', skills: ['Medicae'] },
          { label: 'Driver (Ground Vehicle)', skills: ['Driver (Ground Vehicle)'] }
        ]
      },
      {
        id: 'tr_bonus', label: 'Bonus',
        options: [
          { label: '+5 Weapon Skill', mods: { ws: 5 } },
          { label: '+5 Ballistic Skill', mods: { bs: 5 } }
        ]
      }
    ]
  }
];

/* ------------------------- LURE OF THE VOID ------------------------- */

const LURES = [
  {
    id: 'tainted',
    name: 'Tainted',
    blurb: 'Declared vile by the holy. The void was the only door left open.',
    choices: [{
      id: 'tn', label: 'Nature of the taint',
      options: [
        { label: 'Mutant', notes: ['Roll once on the Mutations table (Rulebook p.369).'] },
        { label: 'Insane', mods: { t: 3 }, talents: ['Peer (The Insane)'], insanity: () => d(10) + d(10), notes: ['−3 Fellowship or −1 Fate Point (your call at the table)', '2d10 Insanity Points'] },
        { label: 'Deviant Philosophy', mods: { wp: 3 }, talents: ['Enemy (Ecclesiarchy)'] }
      ]
    }]
  },
  {
    id: 'criminal',
    name: 'Criminal',
    blurb: 'The law caught up with you, or nearly did. Distance became a survival strategy.',
    choices: [{
      id: 'cr', label: 'What drove you off-world',
      options: [
        { label: 'Wanted Fugitive', talents: ['Enemy (Adeptus Arbites)', 'Peer (Underworld)'] },
        { label: 'Hunted by a Crime Baron', mods: { per: 3 }, talents: ['Enemy (Underworld)'] },
        { label: 'Judged and Found Wanting', mods: { fel: -5 }, notes: ['One poor-Craftsmanship bionic limb or implant.'] }
      ]
    }]
  },
  {
    id: 'renegade',
    name: 'Renegade',
    blurb: 'You thought something you were not supposed to think, and then said it out loud.',
    choices: [{
      id: 'rn', label: 'Kind of renegade',
      options: [
        { label: 'Recidivist', skills: ['Concealment'], talents: ['Enemy (Adeptus Arbites)', 'Resistance (Interrogation)'] },
        { label: 'Free-thinker (+3 Int)', mods: { int: 3, wp: -3 }, talents: ['Enemy (Ecclesiarchy)'] },
        { label: 'Free-thinker (+3 Per)', mods: { per: 3, wp: -3 }, talents: ['Enemy (Ecclesiarchy)'] },
        { label: 'Dark Visionary', talents: ['Dark Soul'], skills: ['Forbidden Lore (choose one)'], insanity: () => d(5) + 1, notes: ['1d5+1 Corruption or Insanity Points'] }
      ]
    }]
  },
  {
    id: 'duty',
    name: 'Duty Bound',
    blurb: 'You did not choose the void. You were pointed at it and told to go.',
    choices: [{
      id: 'db', label: 'Sworn to',
      options: [
        { label: 'Duty to the Throne', mods: { wp: 3 }, talents: ['Armour of Contempt (if WP 40+)'], notes: ['−10 to Interaction Tests outside the Imperium.'] },
        { label: 'Duty to Humanity (+3 Per)', mods: { per: 3 }, profit: -1 },
        { label: 'Duty to Humanity (+3 Int)', mods: { int: 3 }, profit: -1 },
        { label: 'Duty to Your Dynasty', mods: { t: -3 }, talents: ['Rival (Rogue Trader family)'], profit: 1 }
      ]
    }]
  },
  {
    id: 'zealot',
    name: 'Zealot',
    blurb: 'Faith took you further than reason ever could, and left marks.',
    choices: [{
      id: 'zl', label: 'Mark of faith',
      options: [
        { label: 'Blessed Scars', notes: ['+10 Intimidate, −10 Charm, one poor-Craftsmanship bionic.'] },
        { label: 'Unnerving Clarity', mods: { wp: 5 }, notes: ['−5 Fellowship or 1d10 Insanity Points.'] },
        { label: 'Favoured of the Faithful', mods: { fel: 5, t: -5 }, talents: ['Peer (Ecclesiarchy)'] }
      ]
    }]
  },
  {
    id: 'destiny',
    name: 'Chosen by Destiny',
    blurb: 'Something out there picked you. Nobody has agreed yet on what.',
    choices: [{
      id: 'cd', label: 'Shape of the calling',
      options: [
        { label: 'Seeker of Truth', mods: { wp: -3 }, talents: ['Foresight', 'Enemy (Academics or Ecclesiarchy)'] },
        { label: 'Xenophile', notes: ['+10 Fellowship with aliens, −5 Willpower against alien artefacts and powers.'] },
        { label: 'Fated for Greatness', fate: 1, insanity: () => d(10) + 1, notes: ['+1 Fate Point, 1d10+1 Insanity Points.'] }
      ]
    }]
  }
];

/* ----------------------- TRIALS AND TRAVAILS ----------------------- */

const TRIALS = [
  {
    id: 'press',
    name: 'Press-Ganged',
    blurb: 'Taken, put to work, and never willing to be somebody else\u2019s game piece again.',
    choices: [{
      id: 'pg', label: 'What the service taught you',
      options: [
        { label: 'A new Skill', skills: ['One Skill of the GM\u2019s choosing'] },
        { label: 'A Common Lore', skills: ['Common Lore (choose one)'] }
      ]
    }],
    notes: ['You react violently to being pressed into service again.']
  },
  {
    id: 'calamity',
    name: 'Calamity',
    blurb: 'Something enormous went wrong and you walked out of it.',
    talents: ['Light Sleeper'],
    choices: [{
      id: 'cl', label: 'Inured to Adversity',
      options: [
        { label: 'Hardy', talents: ['Hardy'] },
        { label: 'Nerves of Steel', talents: ['Nerves of Steel'] }
      ]
    }]
  },
  {
    id: 'shiplorn',
    name: 'Ship-Lorn',
    blurb: 'Your vessel died around you. You did not.',
    choices: [{
      id: 'sl', label: 'Against All Odds',
      options: [
        { label: 'Survival Skill', skills: ['Survival'] },
        { label: 'Dark Soul', talents: ['Dark Soul'] }
      ]
    }]
  },
  {
    id: 'darkvoyage',
    name: 'Dark Voyage',
    blurb: 'A passage through the warp that lasted longer than it should have.',
    insanityRoll: () => d(5),
    notes: ['1d5 Insanity Points'],
    choices: [{
      id: 'dv', label: 'Things Man Was Not Meant to Know',
      options: [
        { label: 'A Forbidden Lore', skills: ['Forbidden Lore (choose one)'] },
        { label: 'Resistance (Fear)', talents: ['Resistance (Fear)'] }
      ]
    }]
  },
  {
    id: 'vendetta',
    name: 'High Vendetta',
    blurb: 'A murderous feud that buried your friends and taught you what allies are worth.',
    skills: ['Inquiry'],
    notes: ['Brook No Insult: you answer serious offence with threat and violence unless you pass a Willpower Test.'],
    choices: [{
      id: 'hv', label: 'Blood Will Have Blood',
      options: [
        { label: 'Die Hard', talents: ['Die Hard'] },
        { label: 'Paranoia', talents: ['Paranoia'] }
      ]
    }]
  },
  {
    id: 'handofwar',
    name: 'The Hand of War',
    blurb: 'A campaign of burning hulks and blasted cities. The dead still have faces.',
    notes: ['The Face of the Enemy: −10 to Fellowship Tests when dealing with your sworn foe.'],
    choices: [
      {
        id: 'hw_t', label: 'The Ashes of War',
        options: [
          { label: 'A Weapon Training Talent', talents: ['Weapon Training (choose one)'] },
          { label: 'Leap Up', talents: ['Leap Up'] }
        ]
      },
      {
        id: 'hw_h', label: 'Hatred (your old foe)',
        options: ['Orks', 'Eldar', 'Mutants', 'Chaos worshippers', 'Imperial Guard', 'Imperial Navy', 'Void pirates']
          .map((f) => ({ label: f, talents: [`Hatred (${f})`] }))
      }
    ]
  }
];

/* ---------------------------- MOTIVATION ---------------------------- */

const MOTIVATIONS = [
  // No notes on these two: wounds/fate are applied to the sheet already, and
  // repeating them under "Notes" read as though they were still outstanding.
  { id: 'endurance', name: 'Endurance', blurb: 'You welcome the storm. What does not kill you is a stairway.', wounds: 1 },
  { id: 'fortune', name: 'Fortune', blurb: 'Everything begins and ends with the clink of Thrones.', fate: 1 },
  {
    id: 'vengeance', name: 'Vengeance', blurb: 'You wake from dreams of knives and go looking for the guilty.',
    choices: [{
      id: 'vg', label: 'Hatred',
      options: ['Orks', 'Eldar', 'Mutants', 'Chaos worshippers', 'Heretics', 'Void pirates', 'A rival dynasty']
        .map((f) => ({ label: f, talents: [`Hatred (${f})`] }))
    }]
  },
  {
    id: 'renown', name: 'Renown', blurb: 'The Imperium is uncaring. You intend to be remembered anyway.',
    choices: [{
      id: 'rw', label: 'Talent',
      options: [
        { label: 'Air of Authority', talents: ['Air of Authority'] },
        { label: 'Peer (choose one)', talents: ['Peer (choose one)'] }
      ]
    }]
  },
  {
    id: 'pride', name: 'Pride', blurb: 'Admiration from allies, grudging esteem from foes, and no insult left standing.',
    choices: [{
      id: 'pr', label: 'Reward',
      options: [
        { label: 'An Heirloom Item', notes: ['Roll on Table 1-2: Heirloom Items (Rulebook p.34).'] },
        { label: '+3 Toughness', mods: { t: 3 } }
      ]
    }]
  },
  {
    id: 'prestige', name: 'Prestige', blurb: 'Position, title and the right people knowing your name.',
    choices: [{
      id: 'pg2', label: 'Talent',
      options: [
        { label: 'Talented (choose one)', talents: ['Talented (choose one)'] },
        { label: 'Peer (choose one)', talents: ['Peer (choose one)'] }
      ]
    }]
  }
];

/* ------------------------------ CAREERS ------------------------------ */

const CAREERS = [
  {
    id: 'roguetrader',
    name: 'Rogue Trader',
    blurb: 'Holder of the Warrant of Trade. The dynasty, the ship and the blame are all yours.',
    skills: ['Command (Fel)', 'Commerce (Fel)', 'Charm (Fel)', 'Common Lore (Imperium) (Int)', 'Evaluate (Int)',
      'Literacy (Int)', 'Scholastic Lore (Astromancy) (Int)', 'Speak Language (High Gothic, Low Gothic) (Int)'],
    talents: ['Air of Authority', 'Pistol Weapon Training (Universal)', 'Melee Weapon Training (Universal)'],
    gear: 'Best laspistol or good hand cannon or common plasma pistol; best mono-sword or common power sword; micro-bead, void suit, fine clothing, xeno-pelt cloak, best enforcer light carapace or storm trooper carapace.'
  },
  {
    id: 'archmilitant',
    name: 'Arch-Militant',
    blurb: 'The dynasty\u2019s master of war. Every weapon in the Expanse is a language you speak.',
    skills: ['Common Lore (War) (Int)', 'Dodge (Ag)', 'Intimidate (S)', 'Scholastic Lore (Tactica Imperialis) (Int)',
      'Secret Tongue (Military) (Int)', 'Speak Language (Low Gothic) (Int)'],
    talents: ['Basic Weapon Training (Universal)', 'Pistol Weapon Training (Universal)',
      'Melee Weapon Training (Universal)', 'Thrown Weapon Training (Universal)', 'Sound Constitution (×3)'],
    gear: 'Good hellgun or best hunting rifle or two bolt pistols; a good primitive melee weapon with mono upgrade; micro-bead, void suit, enforcer light carapace, bolt shell keepsake, medikit, manacles.'
  },
  {
    id: 'astropath',
    name: 'Astropath Transcendent',
    blurb: 'Soul-bound and blind, you carry the dynasty\u2019s voice across the warp.',
    skills: ['Awareness (Per)', 'Common Lore (Adeptus Astra Telepathica) (Int)', 'Forbidden Lore (Psykers) (Int)',
      'Invocation (WP)', 'Psyniscience (Per)', 'Scholastic Lore (Cryptology) (Int)', 'Speak Language (High Gothic, Low Gothic) (Int)'],
    talents: ['Pistol Weapon Training (Universal)', 'Heightened Senses (Sound)', 'Psy Rating 2'],
    gear: 'Best laspistol or best stub automatic; best mono-sword or common shock staff; guard flak armour, charm, void suit, micro-bead, psy-focus.'
  },
  {
    id: 'explorator',
    name: 'Explorator',
    blurb: 'Part adventurer, part warrior, part emissary of Mars. The Quest for Knowledge drives you into the dark.',
    featured: true,
    skills: ['Common Lore (Machine Cult, Tech) (Int)', 'Forbidden Lore (Archeotech, Adeptus Mechanicus) (Int)',
      'Literacy (Int)', 'Logic (Int)', 'Speak Language (Explorator Binary, Low Gothic, Techna-Lingua) (Int)',
      'Tech-Use (Int)', 'Trade (Technomat) (Int)'],
    talents: ['Basic Weapon Training (Universal)', 'Melee Weapon Training (Universal)', 'Logis Implant'],
    traits: ['Mechanicus Implants'],
    gear: 'Boltgun or best lasgun or good hellgun; best shock staff or good power axe; enforcer light carapace, void suit, injector, sacred unguents, micro-bead, combi-tool, dataslate. Begins play owning one servo-skull familiar.'
  },
  {
    id: 'missionary',
    name: 'Missionary',
    blurb: 'You carry the Imperial Creed to worlds that have never heard it, whether they asked or not.',
    skills: ['Common Lore (Imperial Creed, Imperium) (Int)', 'Forbidden Lore (Heresy) (Int)', 'Medicae (Int)',
      'Scholastic Lore (Imperial Creed) (Int)', 'Speak Language (High Gothic, Low Gothic) (Int)'],
    talents: ['Basic Weapon Training (Universal)', 'Melee Weapon Training (Universal)', 'Pure Faith', 'Unshakeable Faith'],
    gear: 'Good chainsword or best staff; good flamer or best lasgun; best guard flak armour, Ecclesiarchal robes, aquila pendant, censer.'
  },
  {
    id: 'navigator',
    name: 'Navigator',
    blurb: 'A scion of the Navis Nobilite, born with the third eye. Only a Navigator can steer a ship safely through the warp.',
    skills: ['Common Lore (Navis Nobilite) (Int)', 'Forbidden Lore (Navigators, Warp) (Int)', 'Literacy (Int)',
      'Navigation (Stellar, Warp) (Int)', 'Psyniscience (Per)', 'Scholastic Lore (Astromancy) (Int)',
      'Speak Language (High Gothic, Low Gothic) (Int)'],
    talents: ['Navigator', 'Pistol Weapon Training (Universal)'],
    gear: 'Best hellpistol or good hand cannon; best metal staff, best xeno-mesh armour, Emperor\u2019s tarot deck, silk headscarf, Nobilite signet, micro-bead.',
    notes: [
      'Warp Eye: the third eye allows Warp-sight and is the source of all Navigator Powers. Keeping it concealed requires a silk headscarf or similar covering.',
      'Navigator Mutation: roll d100 at character creation. 01-10 Minor Stigmata, 11-20 Pale Skin, 21-30 Elongated Fingers, 31-40 Enlarged Eyes, 41-50 Distorted Voice, 51-60 Hairlessness, 61-70 Warp Nimbus, 71-80 Unsettling Gaze, 81-90 Unnatural Hunger, 91-00 Additional Eye.',
      'Navigation Phases: Divining the Tides (Psyniscience), Catching the Wind (Navigation +10), Steering the Vessel (Navigation +20), Leaving the Warp (Navigation).'
    ],
    choices: [{
      id: 'nav_lineage',
      label: 'House Lineage',
      options: [
        {
          label: 'Magisterial', mods: { wp: 5, fel: 5 },
          talents: ['Peer (Navis Nobilite)'],
          notes: [
            'Lineage \u2014 Magisterial House: regal bearing, formal training in court politics; +5 WP, +5 Fel.',
            'Magisterial House: starting gear upgraded to Best Craftsmanship where the option exists.',
            'Magisterial House: +10 to the Navigator Mutation roll \u2014 a life sheltered from the void\u2019s worst does not spare the bloodline\u2019s taint.'
          ]
        },
        {
          label: 'Nomad', mods: { per: 5, int: 5 },
          talents: ['Void Accustomed'],
          traits: ['Steady in the Void: +10 to Navigation (Warp) Tests made aboard a ship.'],
          notes: [
            'Lineage \u2014 Nomad House: wanderers of the void, self-sufficient navigators; +5 Per, +5 Int.',
            'Nomad House: \u221210 Fellowship when dealing with planetary nobility \u2014 a life spent in the void leaves little patience for groundling courts.'
          ]
        },
        {
          label: 'Shrouded', mods: { ag: 5, wp: 5 },
          talents: ['Resistance (Psychic Powers)'],
          skills: ['Forbidden Lore (Warp) (Int)'],
          traits: ['Rival (Magisterial Houses): the Magisterial navigator houses regard the Shrouded with open suspicion and rivalry.'],
          notes: ['Lineage \u2014 Shrouded House: secretive and reclusive, strong warp resistance; +5 Ag, +5 WP.']
        },
        {
          label: 'Renegade', mods: { t: 5, per: 5 },
          traits: ['Enemy (Navis Nobilite): the wider Navis Nobilite regards Renegade-lineage Navigators with open hostility.'],
          notes: [
            'Lineage \u2014 Renegade House: outcasts who serve where they must; +5 T, +5 Per.',
            'Renegade House: choose one \u2014 roll an additional time on the Navigator Mutation table, or raise one Novice Warp Eye Power to Adept tier at no XP cost.'
          ]
        }
      ]
    }]
  },
  {
    id: 'seneschal',
    name: 'Seneschal',
    blurb: 'You keep the ledgers, the secrets and the leverage. Especially the leverage.',
    skills: ['Barter (Fel)', 'Commerce (Fel)', 'Common Lore (Underworld) (Int)', 'Deceive (Fel)', 'Evaluate (Int)',
      'Forbidden Lore (Archeotech) (Int)', 'Inquiry (Fel)', 'Literacy (Int)', 'Speak Language (Low Gothic, Trader\u2019s Cant) (Int)'],
    talents: ['Basic Weapon Training (Universal)', 'Pistol Weapon Training (Universal)'],
    gear: 'Best hellpistol or common inferno pistol; best hellgun or common boltgun; xeno-mesh armour, autoquill, dataslate, micro-bead, multikey, two sets of robes, synskin, chrono, cameleoline cloak.'
  },
  {
    id: 'voidmaster',
    name: 'Void-Master',
    blurb: 'Helm, guns and small craft. You fly the thing everyone else merely rides in.',
    skills: ['Common Lore (Imperial Navy, War) (Int)', 'Forbidden Lore (Xenos) (Int)', 'Navigation (Stellar) (Int)',
      'Pilot (Spacecraft, Flyers) (Ag)', 'Scholastic Lore (Astromancy) (Int)', 'Speak Language (Low Gothic) (Int)'],
    talents: ['Pistol Weapon Training (Universal)', 'Melee Weapon Training (Universal)', 'Nerves of Steel'],
    gear: 'Best mono-sword or common power sword; best hand cannon or common bolt pistol; guard flak, micro-bead, void suit, blessed ship token, re-breather, Navy uniform, pict-recorder, vox-caster.'
  },
  {
    id: 'eldarcorsair',
    name: 'Eldar Corsair',
    blurb: 'A void-roaming Aeldari who traded Craftworld order for the stars. Scout, blade and void-skirmisher — xenos path from Into the Storm.',
    skills: [],
    talents: [],
    gear: 'Aeldari Mesh Armour (AP 3); Shuriken Pistol (3 spare magazines); Eldar Power Sword or Shuriken Catapult; Waystone (Spirit Stone); fine mesh robes or void suit.'
  },
  {
    id: 'orkfreebooter',
    name: 'Ork Freebooter',
    blurb: 'A mercenary Ork who fights for profit, glory and the sheer joy of it. Xenos path from Into the Storm.',
    skills: [],
    talents: [],
    gear: 'Heavy Leather Armour (AP 3 body, legs); Choppa; Slugga or Shoota (3 spare magazines); 1d5 Stikkbombs; Shiny Gubbinz.'
  },
  {
    id: 'krootmercenary',
    name: 'Kroot Mercenary',
    blurb: 'A contract hunter and tracker who sells their skills to void-farers. Invaluable in wilderness, barely understood anywhere else. Xenos path from Into the Storm.',
    skills: [],
    talents: [],
    gear: 'Kroot Rifle (with mono-blade attachment); Kroot Leather Armour (AP 2 body, arms, legs); Meat Hook; Shamanic gubbinz and trophies.'
  },
  {
    id: 'drukharibeliever',
    name: 'Drukhari Kabalite Warrior',
    blurb: "A piratical raider from Commorragh who brings the dark city's cruelty to the Koronus Expanse. Xenos path from The Soul Reaver.",
    skills: [],
    talents: [],
    gear: 'Kabalite Armour (AP 4 all); Splinter Rifle or Splinter Pistol; Agoniser or Power Blade; Combat Drug Injector; Dark Silk Void Robes.'
  },
  {
    id: 'taufirewarrior',
    name: "T'au Fire Warrior",
    blurb: "A Fire Caste soldier spreading the Greater Good beyond the Third Sphere. Exceptional at ranged combat and coordinated fire. Xenos path from the Tau Character Guide.",
    skills: [],
    talents: [],
    gear: "Tau Recon Combat Armour (AP 5 all); Pulse Rifle or Pulse Carbine; Pulse Pistol; Bonding Knife; Micro-bead; Markerlight."
  }
];

const STEPS = [
  { id: 'home', label: 'Home World', data: HOME_WORLDS },
  { id: 'birthright', label: 'Birthright', data: BIRTHRIGHTS },
  { id: 'lure', label: 'Lure of the Void', data: LURES },
  { id: 'trials', label: 'Trials', data: TRIALS },
  { id: 'motivation', label: 'Motivation', data: MOTIVATIONS },
  { id: 'career', label: 'Career', data: CAREERS }
];

// The origin catalogue the sheet importer matches names against. Derived from
// STEPS so it cannot drift from the data the builder itself offers.
// exported so scripts/audit-parse.mjs matches sheets against the same option
// names the app does, rather than a copy that can drift
export const SHEET_CATALOG = {
  steps: STEPS.reduce((out, s) => {
    // xenos rides along for the home step: a xenos species IS its whole
    // origin path, so a caller (scripts/audit-parse.mjs) needs to tell that
    // apart from a human sheet legitimately missing steps.
    out[s.id] = s.data.map(({ id, name, xenos }) => (xenos ? { id, name, xenos } : { id, name }));
    return out;
  }, {})
};

const MAGOS_PRESET = {
  name: 'Magos Linus-Theta 7',
  home: 'forge', birthright: 'savant', lure: 'renegade',
  trials: 'calamity', motivation: 'endurance', career: 'explorator',
  choices: { fw_purpose: 'Intelligence', sv_a: 'Logic as a trained Basic Skill', sv_b: '+3 Intelligence', rn: 'Free-thinker (+3 Int)', cl: 'Hardy' },
  // Drop the image at this path in public/ and the preset picks it up; until
  // then the plate falls back to the initial via the img onError handler.
  avatar: '/magos-linus-theta-7.jpg'
};

/* ======================= VOX SYNTHESISER ENGINE ======================= */

const PROFILES = {
  MAGOS: 'MAGOS',
  BANE: 'BANE',
  HAWKING: 'HAWKING'
};

const PROFILE_META = {
  MAGOS: { label: 'Magos', hint: 'Binary-cant vox-caster. Flat, cold, slightly slowed.', pitch: 0.55, rate: 0.8 },
  BANE: { label: 'Bane', hint: 'Deep and resonant behind a gas-mask filter.', pitch: 0.2, rate: 0.85 },
  HAWKING: { label: 'DECtalk', hint: 'Monotone 1980s speech synthesiser.', pitch: 1.0, rate: 0.95 }
};

function useVoxEngine() {
  const audioCtxRef = useRef(null);
  const [activeProfile, setActiveProfile] = useState(PROFILES.MAGOS);
  const [voices, setVoices] = useState([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(true);

  const [pitch, setPitch] = useState(PROFILE_META.MAGOS.pitch);
  const [rate, setRate] = useState(PROFILE_META.MAGOS.rate);

  useEffect(() => {
    const meta = PROFILE_META[activeProfile];
    if (meta) { setPitch(meta.pitch); setRate(meta.rate); }
  }, [activeProfile]);

  useEffect(() => {
    if (!('speechSynthesis' in window)) { setSupported(false); return; }
    const updateVoices = () => {
      const avail = window.speechSynthesis.getVoices();
      if (!avail.length) return;
      setVoices(avail);
      setSelectedVoiceName((prev) => {
        if (prev && avail.some((v) => v.name === prev)) return prev;
        const preferred = avail.find((v) =>
          v.lang.includes('en') &&
          ['Daniel', 'Arthur', 'Fred', 'Oliver', 'Alex'].some((n) => v.name.includes(n))
        ) || avail.find((v) => v.lang.includes('en')) || avail[0];
        return preferred ? preferred.name : '';
      });
    };
    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  const getAudioContext = () => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtxRef.current = new Ctx();
    }
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
    return audioCtxRef.current;
  };

  // Profile-specific transmission chime
  const playVoxChime = (type = 'start') => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      if (activeProfile === PROFILES.BANE) {
        const bufferSize = Math.floor(ctx.sampleRate * 0.08);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = type === 'start' ? 1800 : 1200;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.07);
        noise.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
        noise.start(now);
      } else if (activeProfile === PROFILES.HAWKING) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(type === 'start' ? 880 : 440, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now); osc.stop(now + 0.05);
      } else {
        // MAGOS: a short burst of binary cant chirps
        const steps = type === 'start' ? [1400, 2100, 1700] : [1700, 1100];
        steps.forEach((freq, i) => {
          const t = now + i * 0.055;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, t);
          const filter = ctx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.value = freq;
          filter.Q.value = 6;
          gain.gain.setValueAtTime(0.06, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
          osc.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
          osc.start(t); osc.stop(t + 0.05);
        });
      }
    } catch (e) {
      console.warn('Vox chime unavailable:', e);
    }
  };

  const speak = (text) => {
    if (!('speechSynthesis' in window) || !text || !text.trim()) return;
    window.speechSynthesis.cancel();
    playVoxChime('start');

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = voices.find((v) => v.name === selectedVoiceName);
    if (voice) utterance.voice = voice;
    utterance.pitch = pitch;
    utterance.rate = rate;
    utterance.volume = 1.0;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => { setSpeaking(false); playVoxChime('end'); };
    utterance.onerror = () => setSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  const stop = () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  };

  return {
    speak, stop, speaking, supported,
    activeProfile, setActiveProfile,
    voices, selectedVoiceName, setSelectedVoiceName,
    pitch, setPitch, rate, setRate
  };
}

/* ============================== STYLES ============================== */

const CSS = `
/* ===========================================================
   ROGUE TRADER : ORIGIN PATH COGITATOR — visual layer
   Modelled on the Owlcat CRPG chrome.
   Brass bezels frame regions. Green backlit glass is the surface.
   Rows sit ON the glass. Parchment carries anything you read at
   length. Amber is focus and selection only. Red is refusal.
   =========================================================== */

/* the html/body reset lives in index.html so it also covers the login screen */

.rt-root{
  /* ground */
  --void:#070a08; --ink:#0a0e0b;
  /* backlit glass */
  --panel:#132019; --panel2:#1b2c22; --panel-lit:#22392c; --well:#0a120d;
  --grid:rgba(143,224,168,.045);
  /* worked brass */
  --brass:#8a7442; --brass-lit:#c9a961; --brass-dim:#544728; --brass-deep:#2a2418;
  /* amber — focus and selection ONLY, never body text */
  --gold:#e0b955; --gold-lit:#f4dd94;
  /* phosphor */
  --green:#8fe0a8; --green-dim:#5f9a74;
  /* text on glass */
  --text:#cfdcd2; --bone:#eef4ec; --dim:#8fa596;
  /* parchment */
  --parch:#e7dcbe; --parch-hi:#f2e9d1; --parch-ink:#2b2418; --parch-dim:#6b6047;
  /* refusal */
  --crimson:#a52a1e; --rust:#c0552a; --bad:#e8998b;
  /* the machine speaking — plasma cyan, off the ambient green */
  --vox:#7fe8d8; --vox-deep:#08201d;
  /* the warp gets its own accent so psychic results never read as vox or gold */
  --warp:#b892e6; --warp-deep:#1b1230;

  --display:"Cinzel","Trajan Pro","EB Garamond",Palatino,Georgia,serif;
  --serif:"EB Garamond","Iowan Old Style",Palatino,Georgia,serif;
  --mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;

  --graph:repeating-linear-gradient(0deg,var(--grid) 0 1px,transparent 1px 24px),
          repeating-linear-gradient(90deg,var(--grid) 0 1px,transparent 1px 24px);

  background:
    radial-gradient(115% 70% at 50% -5%,#141b14 0%,transparent 58%),
    radial-gradient(90% 60% at 50% 105%,#0f1712 0%,transparent 60%),
    var(--void);
  background-attachment:fixed;
  color:var(--text);min-height:100vh;
  font-family:var(--serif);font-size:16px;line-height:1.5;
  -webkit-font-smoothing:antialiased;
}
.rt-root *{box-sizing:border-box;}
.rt-root ::selection{background:var(--brass);color:var(--bone);}

/* Atmosphere. Vignette only — above everything, inert to the pointer.
   ponytail: scanlines were tried here and read as screen damage, not
   atmosphere. Don't add them back. */
.rt-root::after{
  content:"";position:fixed;inset:0;z-index:100;pointer-events:none;
  background:radial-gradient(135% 90% at 50% 42%,transparent 52%,rgba(0,0,0,.5) 100%);
}

/* Focus. Amber ring; chamfered controls take an inset ring instead,
   because clip-path would shear an outline off. */
.rt-root :focus-visible{outline:2px solid var(--gold);outline-offset:2px;}
.rt-btn:focus-visible,.rt-opt:focus-visible,.rt-step:focus-visible,
.rt-speak:focus-visible,.rt-voxbtn:focus-visible,.rt-reroll:focus-visible{
  outline:none;box-shadow:inset 0 0 0 2px var(--gold);
}

.rt-wrap{max-width:760px;margin:0 auto;padding:0 14px 132px;position:relative;z-index:1;}

/* ========================= THE BEZEL SCREEN =========================
   Brass frame, gothic corner caps, rivet rail, and a pane of backlit
   green glass. Wraps a whole region — never an individual row.
   ponytail: approximated in CSS. The real frames are art assets; drop
   them in as border-image when they exist and delete ::before/::after. */

.rt-screen{position:relative;padding:20px 15px 17px;border-radius:5px;
  background:linear-gradient(180deg,#6a5a36,#3a3120 20%,#272115 80%,#4a3f27);
  box-shadow:
    inset 0 0 0 1px rgba(201,169,97,.4),
    inset 0 0 0 4px rgba(0,0,0,.42),
    0 8px 26px -10px rgba(0,0,0,.85);}
/* the glass */
.rt-screen::before{content:"";position:absolute;inset:9px;border-radius:11px;
  background:
    repeating-linear-gradient(0deg,rgba(0,0,0,.16) 0 1px,transparent 1px 4px),
    radial-gradient(125% 95% at 50% 4%,#22392b 0%,#152319 46%,#0a130e 100%);
  box-shadow:
    inset 0 0 46px rgba(0,0,0,.8),
    inset 0 1px 0 rgba(160,220,180,.12),
    0 0 0 1px rgba(0,0,0,.65);}
/* corner caps + top rivet rail */
.rt-screen::after{content:"";position:absolute;inset:0;pointer-events:none;
  border-radius:5px;
  background:
    radial-gradient(circle,rgba(201,169,97,.5) 0 1.5px,transparent 2px)
      center top 4px/22px 4px repeat-x,
    linear-gradient(135deg,var(--brass) 0 11px,transparent 11px) left top/24px 24px no-repeat,
    linear-gradient(225deg,var(--brass) 0 11px,transparent 11px) right top/24px 24px no-repeat,
    linear-gradient(45deg,var(--brass) 0 9px,transparent 9px) left bottom/20px 20px no-repeat,
    linear-gradient(315deg,var(--brass) 0 9px,transparent 9px) right bottom/20px 20px no-repeat;}
.rt-screen > *{position:relative;z-index:1;}

/* ------------------------------ HEADER ------------------------------ */

/* Fully opaque, and the top padding carries the status-bar inset: the old
   gradient ended at 95% alpha, which let the dossier show through the bar as
   it scrolled past, and without the inset the strip behind an iOS status bar
   is page content rather than header. */
.rt-head{position:sticky;top:0;z-index:20;
  background:linear-gradient(180deg,#101a14 72%,#0f1813);
  border-bottom:1px solid var(--brass-dim);
  padding:calc(11px + env(safe-area-inset-top)) 14px 10px;
  box-shadow:0 10px 26px -18px #000;}
.rt-head::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:1px;
  background:linear-gradient(90deg,transparent,var(--brass-dim) 18%,var(--brass-lit) 50%,var(--brass-dim) 82%,transparent);
  opacity:.85;}
.rt-head-in{max-width:760px;margin:0 auto;display:flex;align-items:center;gap:11px;}

.rt-sigil{width:36px;height:36px;flex:none;display:grid;place-items:center;
  color:var(--brass-lit);
  background:linear-gradient(160deg,#2a2314,#0d1109);
  border:1px solid var(--brass);
  clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);
  box-shadow:inset 0 0 12px rgba(201,169,97,.18);}

.rt-title{font-family:var(--display);font-size:15.5px;font-weight:700;
  letter-spacing:.11em;text-transform:uppercase;margin:0;line-height:1.2;
  color:var(--brass-lit);}
@supports (-webkit-background-clip:text) or (background-clip:text){
  .rt-title{background:linear-gradient(178deg,#f0dcae,var(--brass-lit) 45%,#7c6733);
    -webkit-background-clip:text;background-clip:text;color:transparent;}
}
.rt-sub{font-family:var(--mono);font-size:9.5px;color:var(--green-dim);
  letter-spacing:.2em;margin-top:3px;}

.rt-head-btns{margin-left:auto;flex:none;display:flex;gap:6px;align-items:center;}
.rt-headbtn{flex:none;font-family:var(--mono);font-size:11px;letter-spacing:.16em;
  padding:9px 13px;cursor:pointer;
  border:1px solid var(--brass);color:var(--gold-lit);
  background:linear-gradient(180deg,#2a2214,#14100a);
  clip-path:polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px);
  transition:filter .14s;}
.rt-headbtn:hover{filter:brightness(1.3);}

/* the vox is the one cyan thing in the build — it is the machine talking */
.rt-voxbtn{flex:none;font-family:var(--mono);font-size:11px;
  letter-spacing:.16em;padding:9px 13px;cursor:pointer;
  border:1px solid var(--vox);color:var(--vox);
  background:linear-gradient(180deg,#0f3630,#07201c);
  clip-path:polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px);
  transition:filter .14s;}
.rt-voxbtn:hover{filter:brightness(1.25);}
.rt-voxbtn:active{filter:brightness(.9);}
.rt-voxbtn.live{border-color:var(--gold-lit);color:#161004;
  background:linear-gradient(180deg,var(--gold-lit),var(--gold));
  animation:rt-pulse 1.5s ease-in-out infinite;}
@keyframes rt-pulse{50%{filter:brightness(1.22);}}
/* Generation takes several seconds; the disabled dimming alone reads as broken. */
.rt-picon.busy{animation:rt-pulse 1.1s ease-in-out infinite;opacity:.75;}

/* ---------------------------- STEP RAIL ----------------------------
   Inactive tabs are recessed glass; the active one lifts into a
   parchment cartouche, the way the game's tab bars read. */

.rt-steps{display:flex;gap:6px;overflow-x:auto;padding:12px 0 13px;
  scrollbar-width:none;counter-reset:rtstep;}
.rt-steps::-webkit-scrollbar{display:none;}

.rt-step{flex:none;cursor:pointer;white-space:nowrap;
  font-family:var(--mono);font-size:11.5px;letter-spacing:.05em;
  padding:8px 12px;color:var(--dim);
  border:1px solid var(--brass-dim);
  background:var(--graph),linear-gradient(180deg,var(--panel2),var(--panel));
  clip-path:polygon(7px 0,100% 0,100% calc(100% - 7px),calc(100% - 7px) 100%,0 100%,0 7px);
  transition:color .14s,border-color .14s;}
.rt-step::before{counter-increment:rtstep;content:counter(rtstep,decimal-leading-zero);
  font-size:9px;letter-spacing:.1em;color:var(--brass);margin-right:7px;}
.rt-step .tick{display:none;}          /* the counter carries this now */
.rt-step:hover{color:var(--text);border-color:var(--brass);}
.rt-step.done{color:var(--text);border-color:var(--brass);}
.rt-step.done::before{content:"✓";color:var(--green);}
.rt-step.on{color:var(--parch-ink);border-color:var(--brass-lit);
  background:linear-gradient(180deg,var(--parch-hi),#d6c8a2);
  box-shadow:0 0 18px -5px rgba(242,233,209,.45),inset 0 1px 0 rgba(255,255,255,.5);}
.rt-step.on::before{color:#7d6835;}
.rt-step.na{opacity:.35;cursor:default;pointer-events:none;}
.rt-xenos-skip{padding:32px 0 16px;text-align:center;}
.rt-xenos-skip p{color:var(--subtext);margin-bottom:14px;}
.rt-gender-row{display:flex;gap:8px;margin:8px 0 0;}
.rt-gender-btn{flex:1;padding:8px 0;background:transparent;border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--serif);font-size:14px;cursor:pointer;transition:border-color .15s,background .15s;}
.rt-gender-btn:hover{border-color:var(--gold);}
.rt-gender-btn.active{background:var(--gold);border-color:var(--gold);color:#0d1a0f;font-weight:600;}

/* --------------------------- TYPE SETTING --------------------------- */

.rt-h2{font-family:var(--display);font-size:23px;font-weight:600;
  letter-spacing:.05em;text-transform:uppercase;color:var(--brass-lit);
  margin:2px 0 0;line-height:1.2;
  text-shadow:0 0 26px rgba(201,169,97,.22);}
.rt-h2::after{content:"";display:block;height:1px;margin-top:9px;
  background:linear-gradient(90deg,var(--brass),var(--brass-dim) 45%,transparent);}
.rt-lead{font-size:15px;line-height:1.62;color:var(--dim);margin:11px 0 16px;}

/* ------------------------- OPTION CARDS ON GLASS ------------------------- */

.rt-cards{display:grid;grid-template-columns:1fr;gap:10px;align-items:start;}

/* a card is now a tile resting on the glass, not its own panel */
.rt-card{position:relative;cursor:pointer;padding:13px 14px;
  border:1px solid rgba(138,116,66,.45);
  background:linear-gradient(180deg,rgba(45,72,55,.5),rgba(18,32,24,.55));
  box-shadow:inset 0 1px 0 rgba(201,169,97,.09);
  transition:border-color .14s,background .14s,transform .14s;}
.rt-card:hover{border-color:var(--brass);background:linear-gradient(180deg,rgba(55,88,66,.55),rgba(22,40,29,.6));}
.rt-card:active{transform:translateY(1px);}
.rt-card.sel{border-color:var(--gold);
  background:linear-gradient(180deg,rgba(62,92,68,.6),rgba(26,44,32,.65));
  box-shadow:inset 0 0 0 1px rgba(224,185,85,.2),0 0 26px -10px rgba(224,185,85,.55);}
/* four amber corner ticks from one pseudo-element — eight tiny gradients,
   no extra markup */
.rt-card.sel::before{content:"";position:absolute;inset:-1px;pointer-events:none;
  background:
    linear-gradient(var(--gold),var(--gold)) left    top/15px 1px no-repeat,
    linear-gradient(var(--gold),var(--gold)) left    top/1px 15px no-repeat,
    linear-gradient(var(--gold),var(--gold)) right   top/15px 1px no-repeat,
    linear-gradient(var(--gold),var(--gold)) right   top/1px 15px no-repeat,
    linear-gradient(var(--gold),var(--gold)) left  bottom/15px 1px no-repeat,
    linear-gradient(var(--gold),var(--gold)) left  bottom/1px 15px no-repeat,
    linear-gradient(var(--gold),var(--gold)) right bottom/15px 1px no-repeat,
    linear-gradient(var(--gold),var(--gold)) right bottom/1px 15px no-repeat;}

.rt-card-h{display:flex;align-items:baseline;gap:8px;}
.rt-card-n{font-family:var(--display);font-size:16.5px;font-weight:600;
  letter-spacing:.04em;color:var(--brass-lit);}
.rt-card.sel .rt-card-n{color:var(--gold-lit);}
.rt-card-b{font-size:14.5px;line-height:1.58;color:var(--dim);margin:6px 0 0;}

.rt-mods{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px;}
.rt-mod{font-family:var(--mono);font-size:10.5px;letter-spacing:.06em;
  padding:3px 7px;border:1px solid var(--brass-dim);color:var(--text);
  background:rgba(6,12,8,.55);}
.rt-mod.up{border-color:#2f6b47;color:var(--green);background:rgba(11,28,19,.7);}
.rt-mod.dn{border-color:#6b2a20;color:var(--bad);background:rgba(28,13,10,.7);}

/* expanded detail */
.rt-detail{margin-top:13px;padding-top:13px;
  border-top:1px solid var(--brass-dim);
  box-shadow:0 -2px 0 -1px rgba(201,169,97,.16);}   /* engraved double rule */
.rt-dl{font-size:14px;color:var(--dim);line-height:1.6;margin:0 0 8px;}
.rt-dl b{color:var(--green);font-weight:400;font-family:var(--mono);
  font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;}
.rt-choice-l{font-family:var(--mono);font-size:10.5px;color:var(--gold);
  letter-spacing:.15em;text-transform:uppercase;margin:13px 0 7px;
  display:flex;align-items:center;gap:8px;}
.rt-choice-l::before{content:"//";color:var(--brass);}   /* registry tick */
.rt-choice-l::after{content:"";flex:1;height:1px;
  background:linear-gradient(90deg,var(--brass-dim),transparent);}

.rt-opts{display:flex;flex-wrap:wrap;gap:6px;}
.rt-opt{cursor:pointer;font-family:var(--mono);font-size:12px;padding:7px 11px;
  border:1px solid var(--brass-dim);color:var(--text);background:rgba(6,12,8,.6);
  clip-path:polygon(6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%,0 6px);
  transition:border-color .14s,color .14s;}
.rt-opt:hover{border-color:var(--brass);color:var(--bone);}
.rt-opt.on{color:#161004;border-color:var(--gold-lit);
  background:linear-gradient(180deg,var(--gold-lit),var(--gold));}

/* ====================== CHARACTERISTIC SHEET ======================
   Rows on glass: code chip, name, roll, total, delta, bonus, reroll.
   Flex rather than grid so the dossier's shorter row (no roll, no
   reroll) still lines up without a second column definition. */

.rt-sheet{margin-bottom:14px;}

.rt-sheet-h{display:flex;align-items:center;gap:10px;margin:0 2px 6px;
  font-family:var(--display);font-size:11.5px;font-weight:600;
  letter-spacing:.24em;text-transform:uppercase;color:var(--brass-lit);}
.rt-sheet-h::before,.rt-sheet-h::after{content:"";flex:1;height:1px;
  background:linear-gradient(90deg,transparent,var(--brass));}
.rt-sheet-h::after{background:linear-gradient(90deg,var(--brass),transparent);}

.rt-row{display:flex;align-items:center;gap:10px;padding:7px 3px;
  border-bottom:1px solid rgba(143,224,168,.09);}
.rt-row:last-child{border-bottom:0;}
.rt-code{flex:none;width:34px;text-align:center;padding:2px 0;
  font-family:var(--mono);font-size:9.5px;font-weight:500;letter-spacing:.08em;
  color:var(--gold-lit);background:linear-gradient(180deg,#3b3120,#241d11);
  border:1px solid var(--brass-dim);}
.rt-cname{flex:1;min-width:0;font-size:15px;color:var(--text);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.rt-croll{flex:none;font-family:var(--mono);font-size:10.5px;color:var(--dim);
  opacity:.8;}
.rt-cval{flex:none;min-width:40px;text-align:right;
  font-family:var(--display);font-size:24px;font-weight:600;line-height:1;
  color:var(--green);text-shadow:0 0 20px rgba(143,224,168,.35);}
.rt-delta{flex:none;min-width:40px;font-family:var(--mono);font-size:11px;}
.rt-delta.up{color:var(--green);}
.rt-delta.dn{color:var(--bad);}
/* same footprint as the dice button beside it, so the row ends on a grid */
.rt-cbon{flex:none;width:27px;height:27px;display:grid;place-items:center;
  font-family:var(--mono);font-size:11px;color:var(--brass-lit);
  border:1px solid var(--brass-dim);background:rgba(6,12,8,.6);}
.rt-reroll{flex:none;width:27px;height:27px;cursor:pointer;font-size:13px;line-height:1;
  border:1px solid var(--brass-dim);color:var(--dim);background:rgba(6,12,8,.6);
  transition:color .14s,border-color .14s;}
.rt-reroll:hover{color:var(--gold);border-color:var(--brass);}
.rt-dice{flex:none;width:27px;height:27px;display:grid;place-items:center;cursor:pointer;
  border:1px solid var(--brass-dim);color:var(--green-dim);background:rgba(6,12,8,.6);
  transition:color .14s,border-color .14s;}
.rt-dice svg{width:15px;height:15px;}
.rt-dice:hover{color:var(--green);border-color:var(--brass);}
.rt-dice.on{color:#0d1b12;border-color:var(--green);
  background:linear-gradient(180deg,var(--green),#4f9e70);}
@media (pointer:coarse){
  .rt-dice,.rt-reroll,.rt-cbon{width:38px;height:38px;}
  .rt-dice svg{width:18px;height:18px;}
}

/* ---- test roller, opening under its characteristic ---- */
.rt-roller{margin:0 0 8px;padding:11px 12px;
  border:1px solid var(--brass-dim);border-left:2px solid var(--green-dim);
  background:rgba(6,14,9,.72);}
.rt-roller-h{display:flex;align-items:baseline;gap:10px;margin-bottom:9px;}
.rt-roller-t{flex:1;font-family:var(--display);font-size:12px;font-weight:600;
  letter-spacing:.12em;text-transform:uppercase;color:var(--brass-lit);}
.rt-roller-tg{font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;color:var(--dim);}
.rt-roller-tg b{font-size:14px;color:var(--green);margin-left:5px;}

.rt-diffs{display:grid;grid-template-columns:repeat(auto-fit,minmax(84px,1fr));gap:4px;
  margin-bottom:9px;}
.rt-diff{display:flex;flex-direction:column;align-items:center;gap:1px;cursor:pointer;
  padding:5px 4px;font-family:var(--mono);font-size:9px;letter-spacing:.06em;
  color:var(--dim);border:1px solid var(--brass-dim);background:rgba(6,12,8,.6);
  transition:color .14s,border-color .14s;}
.rt-diff span{font-size:10.5px;color:var(--brass-lit);}
.rt-diff:hover{color:var(--text);border-color:var(--brass);}
.rt-diff.on{color:#161004;border-color:var(--gold-lit);
  background:linear-gradient(180deg,var(--gold-lit),var(--gold));}
.rt-diff.on span{color:#3d2c06;}

/* ---- import dialog ---- */
.rt-framer.rt-import{width:min(620px,94vw);}
.rt-import .rt-field{margin-bottom:7px;}
.rt-import-tab{font-size:14px;}
.rt-import-ta{min-height:90px;font-size:11.5px;color:var(--text);}
.rt-import-foot{margin-top:14px;padding-top:12px;border-top:1px solid var(--brass-dim);
  display:flex;justify-content:center;}
.rt-importwarn{margin-bottom:10px;padding:9px 11px;font-size:13px;line-height:1.5;
  border:1px solid var(--brass);border-left:3px solid var(--gold);
  background:rgba(224,185,85,.1);color:var(--text);}
.rt-importwarn p{margin:0 0 4px;}
.rt-importwarn p:last-child{margin-bottom:0;}
.rt-tabs-found{margin:10px 0;}
.rt-import code{font-family:var(--mono);font-size:11px;color:var(--gold-lit);}

/* ---- point-buy characteristics ---- */
.rt-points{margin-top:4px;}
.rt-pointsum{display:flex;align-items:baseline;gap:10px;margin-bottom:9px;}
.rt-pointsleft{font-family:var(--display);font-size:15px;font-weight:600;
  letter-spacing:.06em;color:var(--gold-lit);}
.rt-pointsleft.done{color:var(--green);}
.rt-pointrow{display:flex;align-items:center;gap:8px;padding:6px 3px;
  border-bottom:1px solid rgba(143,224,168,.09);}
.rt-pointrow:last-child{border-bottom:0;}
.rt-pointbase{font-family:var(--mono);font-size:10.5px;color:var(--dim);}
.rt-pointadd{font-family:var(--mono);font-size:11px;min-width:28px;text-align:right;
  color:var(--gold-lit);}
@media (pointer:coarse){.rt-pointrow{padding:9px 3px;}}

/* ---- psychic panel ---- */
/* ------------------------------ VOIDSHIP ------------------------------ */

.rt-headbtn.ship{border-color:var(--green-dim);color:var(--green);}
.rt-headbtn.gm{border-color:var(--rust);color:var(--rust);}
.rt-headbtn.bridge{border-color:var(--vox);color:var(--vox);}
.rt-headbtn.bridge.on{border-color:var(--gold);color:var(--gold-lit);}
.rt-bridgecode{letter-spacing:.22em;font-family:var(--mono);font-size:15px;}
.rt-bridgevitals{flex-basis:auto;margin-top:0;}

/* ---- GM dashboard ---- */
.rt-gmturn{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;
  padding:9px 11px;border:1px solid var(--brass-dim);background:var(--well);}
.rt-gmphase{flex:1;min-width:120px;font-family:var(--display);font-size:16px;
  color:var(--gold-lit);}
.rt-gmvitals{flex-basis:100%;display:flex;flex-wrap:wrap;gap:9px;align-items:center;
  margin-top:5px;font-family:var(--mono);font-size:9.5px;letter-spacing:.1em;
  color:var(--dim);}
.rt-gmvitals b{color:var(--green);font-size:12px;}
.rt-crewchars{font-family:var(--mono);font-size:10.5px;letter-spacing:.06em;
  color:var(--green);margin:3px 0;}
/* The two the GM reaches for, marked so they are findable at a glance in a
   list of eight officers. */
.rt-crewsecret{border-left:2px solid var(--crimson);padding-left:7px;
  color:var(--bad);}
.rt-crewfavour{border-left:2px solid var(--brass);padding-left:7px;
  color:var(--brass-lit);}
.rt-whisper .rt-entry-t{color:var(--vox);font-style:italic;}
.rt-npcseat{flex-basis:100%;display:flex;align-items:center;gap:8px;margin-top:5px;}
.rt-npcseat .rt-sel{flex:1;min-width:0;}
.rt-brewgrid{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0;}
.rt-brewfield{flex:1 1 110px;display:flex;flex-direction:column;gap:3px;}
.rt-brewfield.wide{flex:1 1 100%;}
.rt-gmsync{font-family:var(--mono);font-size:9.5px;letter-spacing:.1em;
  color:var(--dim);}
.rt-gmsync.on{color:var(--vox);}
.rt-gmdead{opacity:.5;}
.rt-gmdead .rt-entry-t{text-decoration:line-through;}
.rt-gmevade{display:flex;align-items:center;gap:4px;cursor:pointer;color:var(--brass-lit);}
.rt-gmmods{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;}
.rt-gmmods label{flex:1 1 120px;display:flex;flex-direction:column;gap:3px;}
.rt-numin{width:100%;padding:8px 9px;font-size:14px;}
.rt-gmlog{list-style:none;margin:0;padding:0;max-height:220px;overflow-y:auto;}
.rt-gmline{font-family:var(--mono);font-size:11px;line-height:1.55;
  padding:6px 8px;margin-bottom:4px;border-left:2px solid var(--brass-dim);
  background:rgba(6,12,8,.5);color:var(--text);}
.rt-gmline.hit{border-left-color:var(--rust);}
.rt-gmline.miss{border-left-color:var(--brass-dim);color:var(--dim);}
.rt-gmline.critical{border-left-color:var(--crimson);color:var(--bad);}
.rt-gmline.event{border-left-color:var(--warp);}
.rt-gmline.phase,.rt-gmline.initiative{border-left-color:var(--gold);color:var(--gold-lit);}

/* Two classes, and width rather than max-width. Both matter, and each was a
   separate bug:
     max-width cannot widen anything, so the 760 first written here never
       applied to a .rt-framer already set to width:min(430px,94vw);
     and .rt-framer is declared LATER in this stylesheet, so a single-class
       .rt-ship ties on specificity and loses on source order.
   Compound selector, so order stops mattering. */
.rt-framer.rt-ship{width:min(1040px,94vw);}
/* The GM dashboard carries rt-ship as well, and the two selectors tie on
   specificity, so this has to come after it to win. */
.rt-framer.rt-gm{width:min(1120px,94vw);}
.rt-shiprow{display:flex;gap:10px;align-items:flex-end;margin-bottom:12px;}
.rt-shipfield{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;}
.rt-shipfield.sp{flex:0 0 120px;}

/* The three budgets, always visible. Red is the whole point: an illegal ship
   should look illegal while you build it, not when you submit. */
.rt-shipbuds{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px;}
.rt-shipbud{text-align:center;padding:9px 6px;
  border:1px solid var(--brass);
  background:linear-gradient(180deg,#241d0f,#0d1109);}
.rt-shipbud.over{border-color:var(--crimson);background:linear-gradient(180deg,#2a0f09,#140705);}
.rt-shipbud.over .rt-der-v,.rt-shipbud.over .rt-shipbud-r{color:var(--bad);}
.rt-shipbud-t{font-family:var(--mono);font-size:11px;color:var(--dim);font-weight:400;}
.rt-shipbud-r{font-family:var(--mono);font-size:9.5px;letter-spacing:.1em;
  color:var(--green-dim);margin-top:3px;}

/* Two per row once there is room. Eight essential components stacked one to a
   row in a 1040px dialog is a column of very wide, very short controls. */
.rt-shipsels{display:grid;grid-template-columns:1fr;gap:0 18px;}
@media (min-width:820px){
  .rt-shipsels{grid-template-columns:1fr 1fr;}
}
.rt-shipsel{display:flex;align-items:center;gap:9px;margin-bottom:7px;}
.rt-shipsel-k{flex:0 0 122px;font-family:var(--mono);font-size:10px;
  letter-spacing:.14em;text-transform:uppercase;color:var(--brass-lit);opacity:.85;}
.rt-sel{flex:1;min-width:0;padding:9px 10px;
  font-family:var(--serif);font-size:14.5px;color:var(--bone);
  background:var(--well);border:1px solid var(--brass-dim);}
.rt-sel:focus{outline:none;border-color:var(--gold);}
@media (pointer:coarse){.rt-sel{padding:12px 10px;}}
@media (max-width:480px){
  .rt-shipsel{flex-direction:column;align-items:stretch;gap:4px;}
  .rt-shipsel-k{flex:none;}
}

.rt-headbtn.psy{border-color:var(--warp);color:var(--warp);
  background:linear-gradient(180deg,#241a3a,#120c1e);}
.rt-psypanel{width:min(520px,94vw);
  background:linear-gradient(180deg,#1b1230,#0a0713 60%);
  border-color:var(--warp);}
.rt-psypanel::backdrop{background:rgba(6,3,12,.85);}
.rt-warp-t{color:var(--warp);text-shadow:0 0 20px rgba(184,146,230,.45);}
.rt-warp-k{color:#9a7fd0;}
.rt-warp-v{color:var(--warp);}
.rt-manifest{margin-top:12px;color:var(--warp);border-color:var(--warp);
  background:linear-gradient(180deg,#2c1f4c,#150e26);
  text-shadow:0 0 16px rgba(184,146,230,.5);}

.rt-psyres{margin-top:9px;padding:8px 10px;
  border-left:2px solid var(--brass-dim);background:rgba(0,0,0,.35);opacity:.66;}
.rt-psyres.last{opacity:1;background:rgba(0,0,0,.5);}
.rt-psyres.ok{border-left-color:var(--green);}
.rt-psyres.no{border-left-color:var(--crimson);}
.rt-psyres-h{display:flex;align-items:baseline;gap:9px;}
.rt-psyres-h > b{font-family:var(--display);font-size:19px;font-weight:600;min-width:32px;
  color:var(--bone);}
.rt-psyres.ok .rt-psyres-h > b{color:var(--green);}
.rt-psyres.no .rt-psyres-h > b{color:var(--bad);}
.rt-psyres-o{flex:1;text-align:right;font-family:var(--mono);font-size:10px;
  letter-spacing:.06em;color:var(--text);}

.rt-warpres{margin-top:7px;padding:7px 9px;
  border:1px solid rgba(184,146,230,.4);background:rgba(27,18,48,.6);}
.rt-warpres.perils{border-color:var(--crimson);background:rgba(40,10,10,.55);}
.rt-warpres-k{font-family:var(--mono);font-size:9px;letter-spacing:.14em;
  text-transform:uppercase;color:#9a7fd0;margin-bottom:3px;}
.rt-warpres.perils .rt-warpres-k{color:var(--bad);}
.rt-warpres > b{font-family:var(--display);font-size:13.5px;font-weight:600;
  letter-spacing:.04em;color:var(--warp);}
.rt-warpres.perils > b{color:#f0a08e;}
.rt-warpres > p{margin:4px 0 0;font-size:13px;line-height:1.5;color:var(--text);}

/* ---- Focus Power manifestation, on the Willpower row only ---- */
.rt-psy{margin-bottom:10px;padding:9px 10px;
  border:1px solid var(--brass-dim);border-left:2px solid var(--vox);
  background:rgba(8,32,29,.5);}
.rt-modes{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;}
.rt-mode{cursor:pointer;padding:7px 4px;font-family:var(--mono);font-size:10px;
  letter-spacing:.1em;text-transform:uppercase;
  color:var(--dim);border:1px solid var(--brass-dim);background:rgba(6,12,8,.6);
  transition:color .14s,border-color .14s;}
.rt-mode:hover{color:var(--text);border-color:var(--brass);}
.rt-mode.on{color:#04140f;border-color:var(--vox);
  background:linear-gradient(180deg,var(--vox),#4fb8a6);}
.rt-pushrow{display:flex;align-items:center;gap:6px;margin-top:7px;}
.rt-pushb{width:34px;cursor:pointer;padding:4px 0;
  font-family:var(--mono);font-size:11px;
  color:var(--dim);border:1px solid var(--brass-dim);background:rgba(6,12,8,.6);}
.rt-pushb.on{color:#161004;border-color:var(--gold-lit);
  background:linear-gradient(180deg,var(--gold-lit),var(--gold));}
.rt-psyline{margin:8px 0 0;font-family:var(--mono);font-size:11px;color:var(--text);}
.rt-psyline b{color:var(--vox);font-size:13px;}
.rt-psynote{font-family:var(--mono);font-size:9.5px;letter-spacing:.06em;
  color:var(--dim);margin:4px 0 0;line-height:1.45;}

/* ---- powers tab ---- */
.rt-psyrow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;}
.rt-psyrow .rt-origin-k{margin-right:0;}
.rt-psyval{min-width:26px;text-align:center;font-family:var(--display);
  font-size:20px;font-weight:600;color:#6d5726;}
.rt-powers .rt-psynote{color:var(--parch-dim);}
.rt-discs{margin-top:14px;padding-top:12px;border-top:1px solid rgba(109,87,38,.4);}

/* ---- xp gauge: a running campaign total, stepped rather than retyped ---- */
.rt-xpgauge{padding:9px 8px;
  border:1px solid var(--brass);
  background:linear-gradient(180deg,#241d0f,#0d1109);
  box-shadow:inset 0 1px 0 rgba(201,169,97,.16);}
.rt-xpin{flex:1;min-width:0;text-align:center;padding:4px 2px;
  font-family:var(--display);font-size:19px;font-weight:600;
  color:var(--gold-lit);background:rgba(0,0,0,.4);border:1px solid var(--brass-dim);}
.rt-xpin:focus{outline:none;border-color:var(--gold);}
.rt-xpin::-webkit-outer-spin-button,.rt-xpin::-webkit-inner-spin-button{
  -webkit-appearance:none;margin:0;}
.rt-xpleft{font-family:var(--mono);font-size:9px;letter-spacing:.14em;
  color:var(--green-dim);}
.rt-xpleft.over{color:var(--bad);}
/* the distance to the next rank, so a threshold crossing is visibly coming */
.rt-nextrank{color:var(--dim);letter-spacing:.08em;opacity:.8;}

/* ---- advances tab ---- */
.rt-advsum{margin:0 0 12px;font-size:13.5px;color:var(--parch-dim);}
.rt-advsum b{color:var(--parch-ink);font-weight:600;}
.rt-over{color:var(--crimson);font-weight:600;}
.rt-advrank{margin-bottom:14px;}
.rt-advrank.locked{opacity:.5;}
.rt-advlist{list-style:none;margin:0;padding:0;}
.rt-adv{display:flex;flex-wrap:wrap;align-items:center;gap:7px;
  padding:6px 2px;border-bottom:1px solid rgba(109,87,38,.28);}
.rt-adv-n{flex:1;min-width:120px;font-size:14.5px;color:var(--parch-ink);}
.rt-adv.owned .rt-adv-n{font-weight:600;}
.rt-adv-c{font-family:var(--mono);font-size:11px;color:#6d5726;min-width:34px;text-align:right;}
.rt-adv-b{flex:none;cursor:pointer;padding:4px 11px;
  font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;
  color:#4a3f28;border:1px solid var(--brass);background:rgba(120,98,54,.14);
  transition:background .14s,color .14s;}
.rt-adv-b:hover:not(:disabled){background:rgba(120,98,54,.3);color:var(--parch-ink);}
.rt-adv-b:disabled{opacity:.35;cursor:default;}
.rt-adv.owned .rt-adv-b{border-color:var(--crimson);color:#8a2c1e;
  background:rgba(165,42,30,.12);}
.rt-adv-p{flex-basis:100%;font-family:var(--mono);font-size:9.5px;
  letter-spacing:.05em;color:#8a6f31;}
.rt-adv.blocked .rt-adv-p{color:var(--crimson);}
@media (pointer:coarse){.rt-adv-b{padding:9px 14px;}}

/* conditional modifiers from traits — off by default, applied per test */
.rt-conds{margin-bottom:9px;}
.rt-conds-h{font-family:var(--mono);font-size:9px;letter-spacing:.16em;
  text-transform:uppercase;color:var(--dim);margin-bottom:5px;}
.rt-cond{display:flex;align-items:center;gap:8px;width:100%;text-align:left;
  cursor:pointer;padding:6px 8px;margin-bottom:3px;
  border:1px solid var(--brass-dim);background:rgba(6,12,8,.5);
  transition:border-color .14s,background .14s;}
.rt-cond:hover{border-color:var(--brass);}
.rt-cond.on{border-color:var(--gold);background:rgba(224,185,85,.12);}
.rt-cond-m{flex:none;min-width:30px;text-align:center;padding:1px 4px;
  font-family:var(--mono);font-size:10.5px;
  border:1px solid var(--brass-dim);background:rgba(0,0,0,.35);}
.rt-cond-m.up{color:var(--green);border-color:#2f6b47;}
.rt-cond-m.dn{color:var(--bad);border-color:#6b2a20;}
.rt-cond-w{flex:1;min-width:0;font-size:12.5px;line-height:1.35;color:var(--dim);}
.rt-cond.on .rt-cond-w{color:var(--text);}
.rt-cond-w b{color:var(--brass-lit);font-weight:400;}
@media (pointer:coarse){.rt-cond{padding:10px 8px;}}

.rt-rollbtn{width:100%;cursor:pointer;padding:11px;
  font-family:var(--display);font-weight:700;font-size:12.5px;
  letter-spacing:.18em;text-transform:uppercase;
  color:#0d1b12;border:1px solid var(--green);
  background:linear-gradient(180deg,var(--green),#4a9268);
  clip-path:polygon(9px 0,100% 0,100% calc(100% - 9px),calc(100% - 9px) 100%,0 100%,0 9px);
  transition:filter .14s;}
.rt-rollbtn:hover{filter:brightness(1.12);}
.rt-rollbtn:active{filter:brightness(.9);}

.rt-rolllog{list-style:none;margin:9px 0 0;padding:0;}
.rt-rollr{display:flex;align-items:baseline;gap:9px;padding:5px 7px;margin-bottom:3px;
  border-left:2px solid var(--brass-dim);background:rgba(0,0,0,.3);opacity:.62;}
.rt-rollr.last{opacity:1;background:rgba(0,0,0,.5);}
.rt-rollr.ok{border-left-color:var(--green);}
.rt-rollr.no{border-left-color:var(--crimson);}
.rt-rollr-d{font-family:var(--display);font-size:17px;font-weight:600;min-width:30px;
  color:var(--bone);}
.rt-rollr.ok .rt-rollr-d{color:var(--green);}
.rt-rollr.no .rt-rollr-d{color:var(--bad);}
.rt-rollr-v{font-family:var(--mono);font-size:9.5px;color:var(--dim);}
.rt-rollr-o{flex:1;text-align:right;font-family:var(--mono);font-size:10px;
  letter-spacing:.06em;color:var(--text);}

/* the brass gauges — wounds, fate, profit factor */
.rt-derived{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0;}
/* Every gauge in the strip shares one skeleton so they line up across the row:
   label pinned to the top, value centred in the space left over, controls
   pinned to the bottom. Before this, three cells had their label on top and
   two had it underneath, and the numbers sat at whatever height their own box
   produced. The auto/1fr/auto rows are what keep the three bands aligned
   cell to cell. */
   minmax(0,1fr) for the column, because a grid column defaults to max-content
   and the widest label ("RANK I · 2,000 to II") then pushed the XP gauge's
   contents straight out of its own border. */
.rt-der,.rt-wgauge,.rt-xpgauge{display:grid;
  grid-template-columns:minmax(0,1fr);grid-template-rows:auto 1fr auto;}
.rt-der{text-align:center;padding:11px 6px 9px;
  border:1px solid var(--brass);
  background:linear-gradient(180deg,#241d0f,#0d1109);
  box-shadow:inset 0 1px 0 rgba(201,169,97,.16);}

/* label above the number, steppers below it — the label used to sit between
   the buttons, which pushed them past the edge of a 78px gauge */
.rt-der-k.top{margin-top:0;margin-bottom:3px;}
.rt-adjrow{display:flex;align-items:center;justify-content:center;gap:4px;margin-top:4px;}
.rt-adjb{flex:none;width:20px;height:20px;line-height:1;cursor:pointer;font-size:12px;
  border:1px solid var(--brass-dim);color:var(--gold-lit);background:rgba(6,12,8,.55);
  transition:border-color .14s,color .14s;}
.rt-adjb:hover:not(:disabled){border-color:var(--brass-lit);color:var(--bone);}
.rt-adjb:disabled{opacity:.3;cursor:default;}
@media (pointer:coarse){.rt-adjb{width:30px;height:30px;font-size:15px;}}
.rt-der-v{font-family:var(--display);font-size:24px;font-weight:600;line-height:1.1;
  align-self:center;                     /* centre in the 1fr band, see .rt-der */
  color:var(--gold-lit);text-shadow:0 0 18px rgba(224,185,85,.35);}
.rt-der-k{font-family:var(--mono);font-size:9px;color:var(--brass-lit);
  letter-spacing:.16em;margin-top:3px;opacity:.8;}

/* ------------------------------ BUTTONS ------------------------------ */

.rt-btn{cursor:pointer;font-family:var(--display);font-weight:600;
  font-size:12.5px;letter-spacing:.13em;text-transform:uppercase;
  padding:12px 15px;color:var(--gold-lit);
  border:1px solid var(--brass);
  background:linear-gradient(180deg,var(--panel-lit),var(--panel));
  box-shadow:inset 0 1px 0 rgba(201,169,97,.15);
  clip-path:polygon(9px 0,100% 0,100% calc(100% - 9px),calc(100% - 9px) 100%,0 100%,0 9px);
  transition:color .14s,border-color .14s,filter .14s;}
.rt-btn:hover{border-color:var(--brass-lit);color:var(--bone);filter:brightness(1.2);}
.rt-btn:active{filter:brightness(.88);}
.rt-btn.ghost{border-color:var(--brass-dim);color:var(--dim);
  background:linear-gradient(180deg,var(--panel2),var(--panel));box-shadow:none;}
.rt-btn.ghost:hover{color:var(--text);border-color:var(--brass);}
.rt-btn.wide{width:100%;}
.rt-btn:disabled{opacity:.3;cursor:default;filter:none;}
.rt-btnrow{display:flex;gap:8px;margin:16px 0;}
.rt-btnrow .rt-btn{flex:1;}

/* ------------------------- DOSSIER IDENTITY CARD ------------------------- */

/* stretch, so the portrait column runs the full height of the block beside
   it instead of leaving a gap under the icons on narrow screens */
/* flex-start, so a portrait taller than the identity block beside it does not
   drag the gauges into a stretched column. */
.rt-idcard{display:flex;gap:14px;align-items:flex-start;margin-bottom:16px;}
.rt-idtext{flex:1;min-width:0;}

.rt-lore{margin-bottom:18px;padding-top:14px;border-top:1px solid var(--brass-dim);}
.rt-lore-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;}
.rt-lore-l{font-family:var(--mono);font-size:10px;letter-spacing:.16em;color:var(--brass);}
.rt-lore-regen{flex:none;background:transparent;border:1px solid var(--brass-dim);
  color:var(--dim);font-family:var(--serif);font-size:12px;padding:4px 10px;
  border-radius:3px;cursor:pointer;transition:border-color .15s,color .15s;}
.rt-lore-regen:hover{border-color:var(--gold);color:var(--gold-lit);}
.rt-lore-ta{width:100%;min-height:96px;resize:vertical;padding:10px 12px;
  font-family:var(--serif);font-size:14.5px;line-height:1.62;color:var(--text);
  background:transparent;border:1px solid var(--brass-dim);border-radius:3px;}
.rt-lore-ta::placeholder{color:var(--dim);}
.rt-lore-ta:focus{outline:none;border-color:var(--gold);}

.rt-intro{margin-bottom:18px;}
.rt-portrait-wrap{flex:none;width:126px;display:flex;flex-direction:column;}
.rt-portrait{position:relative;width:100%;flex:1;display:flex;flex-direction:column;
  padding:7px;border-radius:3px;
  background:linear-gradient(180deg,#6a5a36,#3a3120 22%,#272115 78%,#4a3f27);
  box-shadow:inset 0 0 0 1px rgba(201,169,97,.45),0 4px 14px -6px rgba(0,0,0,.9);}
.rt-port-img{position:relative;flex:1;min-height:148px;overflow:hidden;
  display:grid;place-items:center;
  font-family:var(--display);font-size:42px;font-weight:700;
  color:var(--brass-lit);text-shadow:0 0 28px rgba(201,169,97,.45);
  background:radial-gradient(105% 85% at 50% 12%,#26402f,#0c1610 75%);
  box-shadow:inset 0 0 26px rgba(0,0,0,.8),0 0 0 1px rgba(0,0,0,.6);}
.rt-port-img img{position:absolute;inset:0;width:100%;height:100%;display:block;}

.rt-port-actions{display:flex;gap:6px;justify-content:center;margin-top:8px;}
.rt-picon{flex:1;height:34px;display:grid;place-items:center;cursor:pointer;
  border:1px solid var(--brass-dim);color:var(--gold-lit);background:rgba(6,12,8,.6);
  transition:border-color .14s,color .14s;}
.rt-picon svg{width:17px;height:17px;}
.rt-picon:hover:not(:disabled){border-color:var(--brass-lit);color:var(--bone);}
.rt-picon:disabled{opacity:.3;cursor:default;}
@media (pointer:coarse){.rt-picon{height:44px;}}

/* ---- portrait framer dialog ----
   A real <dialog> opened with showModal(): the top layer sits above every
   stacking context, so .rt-wrap's z-index cannot bury it under the nav. */
.rt-framer{width:min(430px,94vw);max-height:88vh;overflow-y:auto;
  padding:16px;border:1px solid var(--brass);border-radius:4px;
  color:var(--text);
  background:linear-gradient(180deg,#16211a,#0a110d 60%);
  box-shadow:0 20px 64px -22px #000;}
.rt-framer::backdrop{background:rgba(3,6,4,.82);}
.rt-framer-in{max-width:100%;}

/* ---- roster list ---- */
.rt-roster-l{list-style:none;margin:0 0 4px;padding:0;}
.rt-roster-i{display:flex;align-items:stretch;gap:6px;margin-bottom:6px;}
.rt-roster-i.on .rt-roster-n{border-color:var(--gold);}
.rt-roster-n{flex:1;min-width:0;text-align:left;cursor:pointer;padding:9px 11px;
  font:inherit;color:var(--text);
  border:1px solid var(--brass-dim);background:rgba(6,12,8,.6);
  transition:border-color .14s;}
.rt-roster-n:hover{border-color:var(--brass);}
.rt-roster-nm{display:block;font-family:var(--display);font-size:14px;font-weight:600;
  letter-spacing:.03em;color:var(--brass-lit);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.rt-roster-mt{display:block;font-family:var(--mono);font-size:10px;
  letter-spacing:.1em;color:var(--dim);margin-top:3px;}
.rt-signed{display:flex;align-items:center;gap:9px;margin-top:14px;padding-top:12px;
  border-top:1px solid var(--brass-dim);}
.rt-signed-e{flex:1;min-width:0;font-family:var(--mono);font-size:10.5px;
  letter-spacing:.06em;color:var(--dim);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.rt-framer-h{display:flex;align-items:center;gap:9px;margin-bottom:6px;}
.rt-framer-t{font-family:var(--display);font-size:15px;font-weight:600;
  letter-spacing:.14em;text-transform:uppercase;color:var(--gold-lit);
  text-shadow:0 0 20px rgba(224,185,85,.35);}
.rt-framer-stage{position:relative;width:100%;aspect-ratio:3 / 4;overflow:hidden;
  cursor:grab;touch-action:none;   /* let pointer drags pan instead of scrolling */
  background:#0a110d;border:1px solid var(--brass-dim);
  box-shadow:inset 0 0 30px rgba(0,0,0,.8);}
.rt-framer-stage:active{cursor:grabbing;}
.rt-framer-stage img{position:absolute;inset:0;width:100%;height:100%;display:block;
  user-select:none;-webkit-user-drag:none;}
/* ponytail: the PF badge that used to hang off the portrait corner is gone —
   Profit Factor has its own gauge in the strip, and the badge overlapped the
   name. Don't reintroduce it. */

/* one strip: wounds gauge + the brass gauges, filling the row beside the
   portrait instead of a full-width bar with a separate row underneath */
/* Tiles that wrap, with a ceiling on each: uncapped flex-grow stretched a
   five-cell row across the full width and turned the XP gauge into a banner.
   The bases add up past the space available at every width the dossier uses,
   so the row fills and wraps rather than leaving a ragged tail. */
/* Three rows, every row the same total width:
     WOUNDS
     FATE | PROFIT | TALENTS
     XP
   The three middle tiles are one column each, so together with the two gaps
   they come to exactly the width of the full-width rows above and below.
   A wrapping flex row could not hold that shape — the tiles kept landing
   wherever they fit. */
.rt-idstats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px;
  align-items:stretch;}
.rt-idstats > .rt-wgauge,.rt-idstats > .rt-xpgauge,.rt-idstats > .rt-der.wide{
  grid-column:1 / -1;}
.rt-idstats .rt-der{min-width:0;}
/* wounds and XP share the strip, so wounds gives up the width it used to take
   for itself — both are two-row controls now */
.rt-wgauge{padding:9px 8px;
  border:1px solid var(--brass);
  background:linear-gradient(180deg,#241d0f,#0d1109);
  box-shadow:inset 0 1px 0 rgba(201,169,97,.16);}
.rt-wrow{display:flex;align-items:stretch;gap:6px;align-self:center;width:100%;}
.rt-wbtn{flex:none;width:32px;cursor:pointer;font-size:17px;line-height:1;
  border:1px solid var(--brass-dim);color:var(--gold-lit);background:rgba(6,12,8,.6);
  transition:border-color .14s,color .14s;}
.rt-wbtn:hover:not(:disabled){border-color:var(--brass-lit);color:var(--bone);}
.rt-wbtn:disabled{opacity:.28;cursor:default;}
.rt-wbar{flex:1;position:relative;height:30px;overflow:hidden;
  border:1px solid var(--brass-dim);background:#0a1209;
  box-shadow:inset 0 1px 4px rgba(0,0,0,.7);}
.rt-wbar > span{position:absolute;left:0;top:0;bottom:0;
  background:linear-gradient(180deg,#3f9a63,#1d5c38);
  box-shadow:inset 0 1px 0 rgba(160,230,185,.35);
  transition:width .18s;}
.rt-wgauge.low .rt-wbar > span{background:linear-gradient(180deg,#c08a2a,#7a5312);}
.rt-wgauge.down .rt-wbar > span{background:linear-gradient(180deg,#a5321e,#5e1a0e);}
.rt-wbar > b{position:absolute;inset:0;display:grid;place-items:center;
  font-family:var(--mono);font-size:11px;font-weight:500;letter-spacing:.12em;
  color:#eaf6ee;text-shadow:0 1px 3px rgba(0,0,0,.9);}
/* Above its bar, not below: these two used to carry their label underneath
   while the other gauges carried it on top, so no two labels in the strip sat
   on the same line. */
.rt-whead{display:flex;align-items:center;justify-content:space-between;
  gap:8px;margin-bottom:6px;min-height:14px;}
.rt-wgauge.down .rt-der-k{color:var(--bad);opacity:1;}
.rt-wmax{display:flex;align-items:center;gap:5px;
  font-family:var(--mono);font-size:9px;letter-spacing:.16em;color:var(--brass-lit);}
.rt-wmaxb{width:20px;height:20px;line-height:1;cursor:pointer;font-size:12px;
  border:1px solid var(--brass-dim);color:var(--gold-lit);background:rgba(6,12,8,.6);}
.rt-wmaxb:hover:not(:disabled){border-color:var(--brass-lit);}
.rt-wmaxb:disabled{opacity:.28;cursor:default;}
@media (pointer:coarse){
  .rt-wbtn{width:44px;}
  .rt-wbar{height:44px;}
  .rt-wmaxb{width:32px;height:32px;font-size:15px;}
}
.rt-wbar > span{position:absolute;inset:0;
  background:linear-gradient(180deg,#3f9a63,#1d5c38);
  box-shadow:inset 0 1px 0 rgba(160,230,185,.35);}
.rt-wbar > b{position:absolute;inset:0;display:grid;place-items:center;
  font-family:var(--mono);font-size:9.5px;font-weight:500;letter-spacing:.14em;
  color:#eaf6ee;text-shadow:0 1px 2px rgba(0,0,0,.8);}

/* -------------------------- DOSSIER PARCHMENT --------------------------
   The dossier is the one thing here you actually read at length, so it
   gets the game's parchment treatment: ink on paper, brass rule. */

/* One column, capped to a readable measure. Grid left dead voids under the
   short section; multi-column fixed the voids but broke top alignment and
   scrambled reading order. A sheet reads better as a single document column. */
/* Was capped at 880px inside a wrap that reaches 1200, which left the whole
   dossier hugging the left edge with a 320px void beside it while the step rail
   and header above ran the full width. It shares their edges now. */
.rt-dossier{width:100%;}

/* ---- dossier tabs: raised parchment cartouches over one panel ---- */
.rt-dtabs{display:flex;flex-wrap:wrap;gap:4px;position:relative;z-index:2;
  margin-bottom:-1px;padding-left:2px;}
.rt-dtab{flex:1 1 auto;display:flex;align-items:center;justify-content:center;
  gap:7px;cursor:pointer;
  padding:9px 14px;font-family:var(--display);font-weight:600;font-size:11.5px;
  letter-spacing:.14em;text-transform:uppercase;color:#6f6047;
  border:1px solid var(--brass);border-bottom-color:transparent;
  border-radius:3px 3px 0 0;
  background:linear-gradient(180deg,#c4b48c,#ab9b74);
  transition:color .14s,background .14s;}
.rt-dtab:hover{color:var(--parch-ink);}
.rt-dtab.on{color:var(--parch-ink);
  background:linear-gradient(180deg,var(--parch-hi),var(--parch));
  box-shadow:0 -3px 10px -3px rgba(0,0,0,.35);}
.rt-dtab-n{font-family:var(--mono);font-size:9px;letter-spacing:.06em;
  padding:1px 5px;border-radius:2px;
  background:rgba(58,47,24,.22);color:#5d4f2e;}
.rt-dtab.on .rt-dtab-n{background:rgba(58,47,24,.3);}
.rt-dpanel{border-radius:0 3px 3px 3px;min-height:190px;}

/* two columns on wider screens, mirroring the sheet's skill list */
.rt-2col{display:grid;grid-template-columns:1fr;gap:0 22px;align-items:start;}
.rt-origin-k{font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;
  text-transform:uppercase;color:#7a6534;margin-right:8px;}

/* ---- add / remove on the sheet ---- */
.rt-addbtn{width:100%;margin-top:12px;cursor:pointer;padding:10px;
  font-family:var(--mono);font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;
  color:#6d5726;border:1px dashed rgba(109,87,38,.6);background:rgba(120,98,54,.08);
  transition:color .14s,border-color .14s,background .14s;}
.rt-addbtn:hover{color:var(--parch-ink);border-color:#6d5726;background:rgba(120,98,54,.16);}
@media (pointer:coarse){.rt-addbtn{padding:14px;}}

.rt-rm{flex:none;width:22px;height:22px;line-height:1;cursor:pointer;font-size:15px;
  color:#8a6f31;background:none;border:1px solid transparent;border-radius:2px;
  transition:color .14s,border-color .14s;}
.rt-rm:hover{color:var(--crimson);border-color:rgba(165,42,30,.5);}
/* wrap is load-bearing: without it the expanded detail has no line to drop to
   and overlaps the title */
.rt-entry{display:flex;flex-wrap:wrap;align-items:center;gap:6px;}
.rt-entry .rt-entry-b{flex:1;min-width:0;}
.rt-entry-d{flex-basis:100%;width:100%;}
@media (pointer:coarse){.rt-rm{width:34px;height:34px;font-size:18px;}}

.rt-addl{list-style:none;margin:12px 0 0;padding:0;max-height:46vh;overflow-y:auto;}
.rt-addl > li{margin-bottom:4px;}
.rt-addi{width:100%;text-align:left;cursor:pointer;padding:9px 11px;
  font:inherit;font-size:14px;color:var(--text);
  border:1px solid var(--brass-dim);background:rgba(6,12,8,.6);
  transition:border-color .14s,color .14s;}
.rt-addi:hover{border-color:var(--brass);color:var(--bone);}
.rt-addi.custom{color:var(--gold-lit);border-color:var(--brass);border-style:dashed;}
.rt-addnone{font-size:13.5px;color:var(--dim);font-style:italic;padding:8px 2px;}

/* clickable glossary rows */
.rt-entry{margin-bottom:3px;}
.rt-entry-b{display:flex;align-items:center;gap:7px;width:100%;min-height:32px;
  text-align:left;font:inherit;color:inherit;
  background:none;border:0;padding:5px 0;cursor:pointer;}
/* touch input needs a real target — dense on a mouse, comfortable on a finger */
@media (pointer:coarse){
  .rt-entry-b{min-height:44px;padding:9px 0;}
  .rt-entry-x{font-size:17px;width:22px;}
}
.rt-entry-b:hover .rt-entry-t{color:#000;text-decoration:underline dotted;}
.rt-entry-t{flex:1;min-width:0;}
.rt-entry-c{flex:none;font-family:var(--mono);font-size:9.5px;letter-spacing:.1em;
  color:#7a6534;border:1px solid rgba(109,87,38,.45);padding:1px 4px;
  text-transform:uppercase;}
/* characteristic tint, shared by the stat rows and the skill list. Solid
   backgrounds so the chips read on dark glass and on parchment alike. */
.rt-code[data-g="phys"],.rt-entry-c[data-g="phys"]{
  background:#2c5a40;border-color:#417f5b;color:#bdecd0;}
.rt-code[data-g="mind"],.rt-entry-c[data-g="mind"]{
  background:#2a4763;border-color:#3f6689;color:#bcdcf2;}
.rt-entry-x{flex:none;font-family:var(--mono);font-size:13px;color:#8a6f31;width:12px;}
.rt-entry-d{margin:5px 0 9px;padding:8px 11px;font-size:13.5px;line-height:1.55;
  color:#3a3122;background:rgba(120,98,54,.12);border-left:2px solid #8a6f31;}
.rt-entry-d > p{margin:0;}
.rt-entry-d > p + p{margin-top:6px;}
.rt-entry-s{font-family:var(--mono);font-size:10.5px;letter-spacing:.06em;color:#6d5726;}

/* ---- starting gear ---- */
.rt-gear{padding-left:0;list-style:none;}
.rt-gear-g{margin-bottom:2px;}
.rt-gear-alts{list-style:none;margin:0;padding:0;}
.rt-gear-s{font-family:var(--mono);font-size:11px;line-height:1.5;
  color:#4a3f28;letter-spacing:.02em;}
.rt-sect{position:relative;padding:15px 16px;margin-bottom:10px;break-inside:avoid;
  color:var(--parch-ink);
  border:1px solid var(--brass);
  background:
    repeating-linear-gradient(94deg,rgba(120,100,60,.05) 0 2px,transparent 2px 5px),
    linear-gradient(172deg,var(--parch-hi),var(--parch) 55%,#d8cba7);
  box-shadow:inset 0 0 34px rgba(120,98,54,.2),0 3px 12px -4px rgba(0,0,0,.6);}
.rt-sect-h{display:flex;align-items:center;gap:9px;margin-bottom:10px;
  font-family:var(--mono);font-size:10.5px;color:#6d5726;
  letter-spacing:.18em;text-transform:uppercase;}
.rt-sect-h::before{content:"◆";font-size:7px;color:#8a6f31;}
.rt-sect-h::after{content:"";flex:1;height:1px;
  background:linear-gradient(90deg,rgba(109,87,38,.55),transparent);}
.rt-sect .rt-list,.rt-sect .rt-para{color:var(--parch-ink);}
.rt-sect .rt-empty{color:var(--parch-dim);}
.rt-list{margin:0;padding-left:18px;font-size:14.5px;line-height:1.7;}
.rt-list li{margin-bottom:3px;}
.rt-list li::marker{color:#8a6f31;}
.rt-para{font-size:14.5px;line-height:1.65;margin:0;}
.rt-empty{font-size:14.5px;color:var(--dim);font-style:italic;}

/* ------------------------------- INPUTS ------------------------------- */

.rt-field{width:100%;padding:12px 13px;font-family:var(--serif);font-size:17px;
  color:var(--bone);background:var(--well);border:1px solid var(--brass-dim);
  box-shadow:inset 0 2px 7px rgba(0,0,0,.55);}
.rt-field::placeholder{color:#5d6f63;font-style:italic;}
.rt-field:focus{outline:none;border-color:var(--gold);
  box-shadow:inset 0 2px 7px rgba(0,0,0,.55),0 0 0 1px var(--gold);}

/* ------------------------------ BOTTOM NAV ------------------------------ */

.rt-nav{position:fixed;left:0;right:0;bottom:0;z-index:25;
  /* opaque for the same reason as the header — see .rt-head */
  background:linear-gradient(180deg,#0d130f,#0b110d);
  border-top:1px solid var(--brass-dim);
  backdrop-filter:blur(7px);
  padding:10px 14px;padding-bottom:calc(10px + env(safe-area-inset-bottom));}
.rt-nav::before{content:"";position:absolute;left:0;right:0;top:-1px;height:1px;
  background:linear-gradient(90deg,transparent,var(--brass) 22%,var(--brass) 78%,transparent);
  opacity:.7;}
.rt-nav-in{max-width:760px;margin:0 auto;display:flex;gap:8px;align-items:center;}
.rt-nav .rt-btn{flex:1;padding:12px;}
.rt-nav.slim .rt-nav-in{justify-content:flex-end;}
.rt-editbtn{display:flex;align-items:center;gap:8px;cursor:pointer;padding:11px 18px;
  font-family:var(--display);font-weight:600;font-size:12px;
  letter-spacing:.14em;text-transform:uppercase;
  color:var(--gold-lit);border:1px solid var(--brass);
  background:linear-gradient(180deg,var(--panel-lit),var(--panel));
  box-shadow:inset 0 1px 0 rgba(201,169,97,.15);
  clip-path:polygon(9px 0,100% 0,100% calc(100% - 9px),calc(100% - 9px) 100%,0 100%,0 9px);
  transition:color .14s,border-color .14s,filter .14s;}
.rt-editbtn:hover{border-color:var(--brass-lit);color:var(--bone);filter:brightness(1.2);}

/* ---------------------------- VOX DRAWER ----------------------------
   Plasma cyan, picked off the concept art's reactor glow so the machine
   voice never blends into the ambient green. */

.rt-scrim{position:fixed;inset:0;z-index:40;background:rgba(3,6,4,.8);
  backdrop-filter:blur(2px);}
.rt-vox{position:fixed;left:0;right:0;bottom:0;z-index:41;
  max-height:88vh;overflow-y:auto;
  background:linear-gradient(180deg,#08201d,#050d0c 60%);
  border-top:1px solid var(--vox);
  box-shadow:0 -12px 44px -16px rgba(127,232,216,.32);
  padding:16px 14px calc(20px + env(safe-area-inset-bottom));}
.rt-vox-in{max-width:760px;margin:0 auto;}
.rt-vox-h{display:flex;align-items:center;gap:9px;margin-bottom:6px;}
.rt-vox-t{font-family:var(--display);font-size:15px;font-weight:600;
  letter-spacing:.14em;text-transform:uppercase;color:var(--vox);
  text-shadow:0 0 20px rgba(127,232,216,.45);}
.rt-close{margin-left:auto;width:32px;height:32px;line-height:1;font-size:17px;
  cursor:pointer;background:none;border:1px solid var(--brass-dim);color:var(--dim);
  transition:color .14s,border-color .14s;}
.rt-close:hover{color:var(--vox);border-color:var(--vox);}
.rt-vox-hint{font-size:13.5px;color:var(--dim);margin:0 0 12px;line-height:1.55;}

.rt-ta{width:100%;min-height:108px;resize:vertical;padding:12px;
  font-family:var(--mono);font-size:13.5px;line-height:1.55;
  color:var(--vox);background:#030a09;border:1px solid #1d4a44;
  text-shadow:0 0 12px rgba(127,232,216,.35);
  box-shadow:inset 0 2px 10px rgba(0,0,0,.6);}
.rt-ta::placeholder{color:#3e6f68;}
.rt-ta:focus{outline:none;border-color:var(--vox);
  box-shadow:inset 0 2px 10px rgba(0,0,0,.6),0 0 0 1px var(--vox);}

.rt-quick{display:flex;flex-wrap:wrap;gap:6px;margin:11px 0 4px;}
.rt-slider{width:100%;accent-color:#c9a961;margin:4px 0 10px;}
.rt-sl-l{display:flex;justify-content:space-between;
  font-family:var(--mono);font-size:10px;color:var(--dim);letter-spacing:.16em;}
.rt-select{width:100%;padding:10px;margin-bottom:11px;
  font-family:var(--mono);font-size:12.5px;
  color:var(--text);background:var(--well);border:1px solid var(--brass-dim);}
.rt-select:focus{outline:none;border-color:var(--vox);}

.rt-speak{width:100%;cursor:pointer;padding:14px;
  font-family:var(--display);font-weight:700;font-size:13px;
  letter-spacing:.2em;text-transform:uppercase;
  color:var(--vox);border:1px solid var(--vox);
  background:linear-gradient(180deg,#0e3b35,#061a17);
  text-shadow:0 0 16px rgba(127,232,216,.5);
  clip-path:polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px);
  transition:filter .14s;}
.rt-speak:hover{filter:brightness(1.2);}
.rt-speak:disabled{opacity:.4;cursor:default;filter:none;}
.rt-speak.stop{border-color:var(--rust);color:#f0b09a;
  background:linear-gradient(180deg,#3c1409,#1f0a05);
  text-shadow:0 0 16px rgba(192,85,42,.5);}

.rt-warn{padding:11px 12px;margin-bottom:12px;font-size:13.5px;line-height:1.55;
  color:#f0b09a;border:1px solid var(--crimson);
  border-left:3px solid var(--rust);background:#1e0c07;}

/* Same shape as rt-warn, brass instead of crimson: a confirmation dressed as a
   warning reads as a failure. */
.rt-note{padding:11px 12px;margin-bottom:12px;font-size:13.5px;line-height:1.55;
  color:var(--bone);border:1px solid var(--brass);
  border-left:3px solid var(--gold);background:#0b1512;}

/* ============================= RESPONSIVE =============================
   Mobile-first single column. The tab rail is kept at every size — it
   just stops scrolling once the tabs fit. */

/* Phone: the portrait leads, centred, and everything else wraps underneath.
   Beside the stats it was a 126px column stretched by align-items:stretch to
   whatever height the gauges came to — measured 112x307, a strip. An earlier
   pass asked for that full-height column; stacking replaces it. */
@media (max-width:699px){
  .rt-idcard{flex-direction:column;align-items:center;gap:13px;}
  .rt-portrait-wrap{width:min(236px,64vw);}
  /* flex:none so the frame follows the image instead of the row height, and a
     portrait aspect so it cannot be stretched into a strip again */
  .rt-port-img{flex:none;aspect-ratio:3 / 4;min-height:0;font-size:56px;}
  .rt-idtext{width:100%;}
  .rt-h2{text-align:center;font-size:25px;}
  .rt-h2::after{background:linear-gradient(90deg,transparent,var(--brass) 50%,transparent);}
  .rt-lead{text-align:center;margin-bottom:14px;}
}

@media (max-width:399px){
  .rt-croll{display:none;}                       /* raw roll is the first to go */
  .rt-derived{grid-template-columns:repeat(2,1fr);}
  .rt-cval{font-size:21px;min-width:34px;}
}

@media (min-width:700px){
  .rt-2col{grid-template-columns:repeat(2,1fr);}
  .rt-idcard{gap:18px;}
  /* the portrait is the character, so it leads the dossier at every size */
  .rt-portrait-wrap{width:212px;}
  .rt-port-img{min-height:250px;font-size:64px;}
  /* a name field has no business being 1100px wide */
  .rt-intro{max-width:520px;}
}

@media (min-width:900px){
  .rt-portrait-wrap{width:264px;}
  .rt-port-img{min-height:320px;font-size:78px;}
  .rt-wrap{max-width:1040px;padding-bottom:120px;}
  .rt-head-in,.rt-nav-in{max-width:1040px;}
  .rt-steps{justify-content:flex-start;flex-wrap:wrap;overflow-x:visible;}
  .rt-cards{grid-template-columns:repeat(2,1fr);padding:24px 20px 21px;}
  .rt-sheet{padding:24px 22px 19px;}
  .rt-row{padding:9px 5px;}
  .rt-cname{font-size:16px;}
  .rt-cval{font-size:27px;min-width:46px;}
  .rt-nav .rt-btn{flex:0 1 220px;}
  .rt-nav-in{justify-content:flex-end;}
}

@media (min-width:1280px){
  .rt-wrap{max-width:1200px;}
  .rt-head-in,.rt-nav-in{max-width:1200px;}
  .rt-cards{grid-template-columns:repeat(3,1fr);}
}

@media (prefers-reduced-motion:reduce){
  .rt-root *,.rt-root *::before,.rt-root *::after{
    transition:none!important;animation:none!important;}
}

/* ============================== PRINT ==============================
   A dossier to hand across the table, not a screenshot of the app.
   The interactive sheet is hidden and .rt-print draws every section at once,
   because the screen dossier is tabbed — printing it directly would emit
   whichever single tab happened to be open.
   ponytail: no PDF library. The browser's own dialog saves to PDF, and does it
   better than rasterising the DOM to a canvas would; jsPDF/html2canvas would
   add a megabyte to produce blurrier output with worse text. */

.rt-print{display:none;}

@media print{
  /* The root element's background covers the whole canvas, page margins
     included, so the sheet still bleeds dark to every edge while each page
     keeps a real margin. Padding on the content instead would only inset the
     first page — anything flowing onto page two would start against the edge. */
  @page{margin:12mm;}

  /* Every rule below would be dropped as "background graphics" without this.
     It is what makes the printed sheet the app's sheet rather than a
     black-on-white transcript of it. */
  html,body,.rt-root,.rt-print,.rt-print *{
    -webkit-print-color-adjust:exact;print-color-adjust:exact;}

  .rt-head,.rt-nav,.rt-steps,dialog,.no-print{display:none!important;}
  /* one rule for the id card, stat sheet, tab rail and tab panel */
  .rt-dossier > *:not(.rt-print){display:none!important;}
  .rt-root::after{display:none;}     /* the vignette darkens the lower corners */

  /* The literal, not var(--void): the custom properties are declared on
     .rt-root, so html and body cannot see them. Same value as index.html. */
  html,body{background:#070a08;}
  .rt-root{min-height:0;font-size:10.5pt;color:var(--text);
    /* fixed attachment paints the gradient on the first page only */
    background:var(--void);background-attachment:scroll;}
  .rt-wrap{max-width:none;padding:0;}

  /* Glows read as smudges on paper; the colour they were carrying stays. */
  *,*::before,*::after{text-shadow:none!important;box-shadow:none!important;}

  .rt-print{display:block;}

  /* ---- identity: brass-bezelled glass, as on the dossier ---- */
  .rt-pr-head{display:flex;gap:6mm;align-items:flex-start;
    padding:5mm;margin-bottom:5mm;
    border:1px solid var(--brass);
    background:linear-gradient(180deg,var(--panel2),var(--panel) 60%,var(--well));}
  .rt-pr-portrait{width:34mm;height:45mm;object-fit:cover;flex:none;
    border:1px solid var(--brass-lit);}
  .rt-pr-id{flex:1;min-width:0;}
  .rt-print h1{font-family:var(--display);font-size:19pt;margin:0;
    letter-spacing:.04em;text-transform:uppercase;color:var(--brass-lit);}
  .rt-pr-sub{font-family:var(--mono);font-size:8.5pt;letter-spacing:.1em;
    margin:2mm 0 4mm;color:var(--green-dim);}

  /* ---- the gauge tiles ---- */
  .rt-pr-stamps{display:flex;flex-wrap:wrap;gap:3mm;margin:0;}
  .rt-pr-stamps > div{border:1px solid var(--brass);padding:2mm 3mm;min-width:20mm;
    text-align:center;
    background:linear-gradient(180deg,#241d0f,#0d1109);}
  .rt-pr-stamps dt{font-family:var(--mono);font-size:7pt;letter-spacing:.16em;
    text-transform:uppercase;color:var(--brass-lit);opacity:.85;}
  .rt-pr-stamps dd{margin:1.5mm 0 0;font-family:var(--display);font-size:15pt;
    font-weight:700;line-height:1;color:var(--gold-lit);}

  /* Ticked with a pen at the table, so a taken box is filled and the rest are
     left as empty brass outlines to write into. */
  .rt-pr-boxes{display:flex;flex-wrap:wrap;gap:1.2mm;margin-top:3mm;}
  .rt-pr-box{width:4.5mm;height:4.5mm;border:1px solid var(--brass);
    background:var(--well);}
  .rt-pr-box.taken{background:var(--crimson);border-color:var(--rust);}

  /* ---- parchment sections, the same inserts the dossier uses ---- */
  .rt-pr-sect{margin-bottom:4mm;padding:4mm;
    break-inside:avoid;page-break-inside:avoid;
    color:var(--parch-ink);
    border:1px solid var(--brass-dim);
    background:
      repeating-linear-gradient(94deg,rgba(120,100,60,.05) 0 2px,transparent 2px 5px),
      linear-gradient(172deg,var(--parch-hi),var(--parch) 55%,#d8cba7);}
  .rt-pr-sect > h2{display:flex;align-items:center;gap:2mm;
    font-family:var(--mono);font-size:8pt;letter-spacing:.18em;
    text-transform:uppercase;margin:0 0 3mm;color:#6d5726;}
  .rt-pr-sect > h2::after{content:"";flex:1;height:1px;
    background:linear-gradient(90deg,rgba(109,87,38,.55),transparent);}
  .rt-pr-cols{columns:2;column-gap:8mm;}
  .rt-pr-cols.three{columns:3;}
  .rt-pr-list{margin:0;padding-left:4.5mm;font-size:9.5pt;line-height:1.55;
    orphans:2;widows:2;}
  .rt-pr-list li{break-inside:avoid;page-break-inside:avoid;}
  .rt-pr-list li::marker{color:#8a6f31;}
  .rt-pr-none{margin:0;font-size:9.5pt;font-style:italic;color:var(--parch-dim);}

  /* ---- characteristics: the backlit stat panel, not a parchment table ---- */
  .rt-pr-chars{width:100%;border-collapse:collapse;font-size:9.5pt;
    color:var(--text);
    background:linear-gradient(180deg,var(--panel),var(--well));}
  .rt-pr-chars th,.rt-pr-chars td{border:1px solid var(--brass-dim);
    padding:1.8mm 2.5mm;text-align:left;}
  .rt-pr-chars th{font-family:var(--mono);font-size:7.5pt;letter-spacing:.14em;
    text-transform:uppercase;color:var(--brass-lit);
    border-color:var(--brass);}
  .rt-pr-chars td.n{text-align:center;font-family:var(--display);font-size:13pt;
    font-weight:700;width:16mm;color:var(--green);}
  /* left empty on purpose: the value a test actually uses, written in by hand */
  .rt-pr-chars td.blank{width:24mm;background:var(--well);}
  /* the characteristics block is glass, so it keeps the dark frame */
  .rt-pr-sect.rt-pr-dark{background:none;border-color:var(--brass);
    padding:0;color:var(--text);}
  .rt-pr-sect.rt-pr-dark > h2{color:var(--brass-lit);
    padding:3mm 3mm 0;margin-bottom:2mm;}
  .rt-pr-sect.rt-pr-dark > h2::after{
    background:linear-gradient(90deg,var(--brass-dim),transparent);}

  .rt-pr-kv{margin:0;font-size:9.5pt;line-height:1.6;}
  .rt-pr-kv dt{font-family:var(--mono);font-size:7.5pt;letter-spacing:.14em;
    text-transform:uppercase;float:left;clear:left;width:34mm;color:#6d5726;}
  .rt-pr-kv dd{margin:0 0 1mm 34mm;}

  .rt-pr-foot{margin-top:5mm;padding-top:2mm;
    border-top:1px solid var(--brass-dim);
    font-family:var(--mono);font-size:7pt;letter-spacing:.12em;
    color:var(--dim);display:flex;justify-content:space-between;}
}
`;

/* ============================ COMPONENTS ============================ */

function ModTags({ mods }) {
  const entries = Object.entries(mods || {});
  if (!entries.length) return null;
  return (
    <div className="rt-mods">
      {entries.map(([k, v]) => (
        <span key={k} className={'rt-mod ' + (v > 0 ? 'up' : 'dn')}>
          {CHAR_SHORT[k]} {v > 0 ? '+' : ''}{v}
        </span>
      ))}
    </div>
  );
}

function OptionCard({ item, selected, onSelect, choices, onChoose }) {
  return (
    <div className={'rt-card' + (selected ? ' sel' : '')} onClick={onSelect}>
      <div className="rt-card-h">
        <span className="rt-card-n">{item.name}</span>
      </div>
      <p className="rt-card-b">{item.blurb}</p>
      <ModTags mods={item.mods} />

      {selected && (
        <div className="rt-detail" onClick={(e) => e.stopPropagation()}>
          {item.skills && <p className="rt-dl"><b>Skills</b> — {item.skills.join(', ')}</p>}
          {item.talents && <p className="rt-dl"><b>Talents</b> — {item.talents.join(', ')}</p>}
          {item.traits && item.traits.map((t, i) => <p className="rt-dl" key={i}>{t}</p>)}
          {item.notes && item.notes.map((n, i) => <p className="rt-dl" key={'n' + i}>{n}</p>)}
          {item.gear && <p className="rt-dl"><b>Gear</b> — {item.gear}</p>}
          {item.woundText && <p className="rt-dl"><b>Wounds</b> — {item.woundText}</p>}

          {(item.choices || []).map((c) => (
            <div key={c.id}>
              <div className="rt-choice-l">{c.label}</div>
              <div className="rt-opts">
                {c.options.map((o) => (
                  <button
                    key={o.label}
                    className={'rt-opt' + (choices[c.id] === o.label ? ' on' : '')}
                    onClick={() => onChoose(c.id, o.label)}
                  >{o.label}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================== THE APP ============================== */

export default function RogueTraderBuilder({ me, cloud }) {
  const [name, setName] = useState('');
  const [gender, setGender] = useState(''); // 'Male' | 'Female' | 'Other' | ''
  // A free-text background the player can overwrite. Blank means "show the
  // auto-generated placeholder" rather than "no background" — see lore.js.
  const [background, setBackground] = useState('');
  const [sel, setSel] = useState({});          // stepId -> optionId
  const [choices, setChoices] = useState({});  // choiceId -> option label
  const [rolls, setRolls] = useState(null);    // characteristic base values
  const [woundRoll, setWoundRoll] = useState(null);
  const [damage, setDamage] = useState(0);       // wounds taken in play
  const [woundBonus, setWoundBonus] = useState(0); // level-ups, Sound Constitution
  // Fate is spent and regained in play; Profit Factor shifts with the
  // dynasty's fortunes. Stored as deltas on the derived values rather than
  // absolutes, so changing the origin path still flows through.
  const [fateAdj, setFateAdj] = useState(0);
  const [profitAdj, setProfitAdj] = useState(0);
  // XP spent before this sheet existed. The app only knows about advances
  // bought through its own Advances tab, so a character created elsewhere —
  // every premade, and any starting Explorer who used their 500 at creation —
  // would otherwise show that allowance as still available.
  const [spentAdj, setSpentAdj] = useState(0);
  // Imported sheets: characteristics/wounds/fate stated outright rather than
  // derived. Null means this character was built here and derives normally.
  const [finalTotals, setFinalTotals] = useState(null);
  const [finalWounds, setFinalWounds] = useState(null);
  const [finalFate, setFinalFate] = useState(null);
  // Point-buy: 25 base plus an allocation from a pool of 100. Feeds `rolls`,
  // since the result is a pre-modifier value exactly like a 2d10+25 roll.
  const [pointAlloc, setPointAlloc] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [psyRating, setPsyRating] = useState(0);   // 0 = not a psyker
  const [blueprint, setBlueprint] = useState(EMPTY_BLUEPRINT);
  // The table's homebrew hulls and components. Held here rather than in the
  // blueprint so several ships can share them, and copied INTO the blueprint
  // whenever it is edited so a ship pushed to the bridge arrives complete.
  const [homebrew, setHomebrew] = useState(EMPTY_HOMEBREW);
  // Saving must not start before the library has been loaded, or an empty
  // initial state would be written straight over the stored one.
  const [homebrewLoaded, setHomebrewLoaded] = useState(false);
  const [homebrewErr, setHomebrewErr] = useState('');
  const [shipRole, setShipRole] = useState('');    // '' = no station
  const [shipOpen, setShipOpen] = useState(false);
  const [gmOpen, setGmOpen] = useState(false);
  const [brewOpen, setBrewOpen] = useState(false);
  const [bridgeOpen, setBridgeOpen] = useState(false);
  const [bridgeCode, setBridgeCode] = useState('');
  const [fleet, setFleet] = useState([]);          // the GM's NPC ships
  const [combat, setCombat] = useState(EMPTY_COMBAT);
  const [xp, setXp] = useState(5000);              // a starting Explorer's budget
  const [fateRoll, setFateRoll] = useState(null);
  const [stepIx, setStepIx] = useState(0);     // 0..5 origin, 6 characteristics, 7 dossier
  const [avatar, setAvatar] = useState(null);  // { src, framing }
  // Anything gained after character creation — advances, loot, table rulings.
  // Kept apart from `build` so the origin path stays the derived source of truth.
  const [extras, setExtras] = useState(EMPTY_EXTRAS);
  const [roster, setRoster] = useState([]);
  const [charId, setCharId] = useState(null);  // null = unsaved sheet
  const [rosterOpen, setRosterOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [psyOpen, setPsyOpen] = useState(false);
  const [rosterErr, setRosterErr] = useState('');
  const [rosterNote, setRosterNote] = useState('');   // success, not a failure
  const [rosterBusy, setRosterBusy] = useState(false);
  const [voxOpen, setVoxOpen] = useState(false);
  const [voxText, setVoxText] = useState('');
  const [loaded, setLoaded] = useState(false);

  const vox = useVoxEngine();

  /* ---- autosave of the in-progress sheet ----
     Distinct from the roster: this is the unnamed sheet you are working on, so
     a refresh does not lose it. Was written against window.storage, which does
     not exist in a browser — every read and write threw into an empty catch,
     so nothing was ever saved. */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        setName(s.name || ''); setGender(s.gender || ''); setBackground(s.background || '');
        setSel(s.sel || {}); setChoices(s.choices || {});
        setRolls(s.rolls || null); setWoundRoll(s.woundRoll ?? null); setFateRoll(s.fateRoll ?? null);
        setDamage(s.damage || 0); setWoundBonus(s.woundBonus || 0);
        setFateAdj(s.fateAdj || 0); setProfitAdj(s.profitAdj || 0);
        setSpentAdj(s.spentAdj || 0);
        setFinalTotals(s.finalTotals || null);
        setFinalWounds(s.finalWounds ?? null); setFinalFate(s.finalFate ?? null);
        setPointAlloc(s.pointAlloc || null);
        setAvatar(s.avatar || null); setExtras(readExtras(s.extras));
        setPsyRating(s.psyRating || 0);
        setBlueprint(readBlueprint(s.blueprint));
        setShipRole(s.shipRole || '');
        setFleet(Array.isArray(s.fleet) ? s.fleet : []);
        setBridgeCode(s.bridgeCode || '');
        // Older sheets carried the library inside this blob. It has its own
        // home now, so it is adopted once rather than lost — see the load
        // effect below, which only adopts when nothing else is stored.
        if (s.homebrew) legacyHomebrew.current = readHomebrew(s.homebrew);
        setCombat({ ...EMPTY_COMBAT, ...(s.combat || null) });
        if (typeof s.xp === 'number') setXp(s.xp);
        if (typeof s.stepIx === 'number') setStepIx(s.stepIx);
      }
    } catch { /* nothing saved, or storage unavailable */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({
          name, gender, background, sel, choices, rolls, woundRoll, fateRoll, damage, woundBonus, avatar, extras,
          fateAdj, profitAdj, spentAdj, psyRating, xp, stepIx,
          finalTotals, finalWounds, finalFate, pointAlloc, blueprint, shipRole, fleet, combat, bridgeCode
        }));
      } catch { /* quota, most likely a large portrait — the build continues in memory */ }
    }, 400);
    return () => clearTimeout(t);
  }, [name, gender, background, sel, choices, rolls, woundRoll, fateRoll, damage, woundBonus, avatar, extras,
      fateAdj, profitAdj, spentAdj, psyRating, xp, stepIx,
      finalTotals, finalWounds, finalFate, pointAlloc, blueprint, shipRole, fleet, combat, bridgeCode, loaded]);

  /* ---- aggregation ---- */
  const build = useMemo(() => {
    const out = {
      mods: {}, skills: [], talents: [], traits: [], notes: [],
      profit: 0, bonusWounds: 0, bonusFate: 0, picked: {}
    };
    const addMods = (m) => { Object.entries(m || {}).forEach(([k, v]) => { out.mods[k] = (out.mods[k] || 0) + v; }); };
    const push = (arr, vals) => (vals || []).forEach((v) => { if (!arr.includes(v)) arr.push(v); });

    STEPS.forEach((step) => {
      const item = step.data.find((x) => x.id === sel[step.id]);
      if (!item) return;
      out.picked[step.id] = item;
      addMods(item.mods);
      push(out.skills, item.skills); push(out.talents, item.talents);
      push(out.traits, item.traits); push(out.notes, item.notes);
      out.profit += item.profit || 0;
      out.bonusWounds += item.wounds || 0;
      out.bonusFate += item.fate || 0;
      (item.choices || []).forEach((c) => {
        const chosen = c.options.find((o) => o.label === choices[c.id]);
        if (!chosen) return;
        addMods(chosen.mods);
        push(out.skills, chosen.skills); push(out.talents, chosen.talents);
        push(out.traits, chosen.traits); push(out.notes, chosen.notes);
        out.profit += chosen.profit || 0;
        out.bonusFate += chosen.fate || 0;
      });
    });
    return out;
  }, [sel, choices]);

  const home = build.picked.home;
  const career = build.picked.career;

  // An imported sheet may carry FINAL characteristics, which already include
  // origin modifiers and advances. Those are used verbatim — applying mods on
  // top would count the origin path twice.
  const totals = useMemo(() => {
    if (finalTotals) return finalTotals;
    if (!rolls) return null;
    const t = {};
    CHAR_KEYS.forEach((k) => {
      t[k] = (rolls[k] || 0) + (build.mods[k] || 0) + (extras.charAdvances[k] || 0) * ADVANCE_STEP;
    });
    return t;
  }, [finalTotals, rolls, build.mods, extras.charAdvances]);

  const tBonus = totals ? Math.floor(totals.t / 10) : null;
  // An imported sheet states its wounds outright; a built one derives them.
  // woundMult is 1 for Aeldari (TB + die) and 2 for all standard human home worlds.
  const wounds = finalWounds != null
    ? finalWounds
    : (tBonus != null && woundRoll != null
      ? tBonus * (home ? (home.woundMult ?? 2) : 2) + woundRoll + build.bonusWounds : null);

  // wounds is the origin-path maximum; ws carries the playable state on top
  const ws = woundState(wounds, woundBonus, damage);
  const takeDamage = (n) => setDamage((d) => applyDamage(d, n, ws ? ws.max : 0));
  const changeMax = (n) => setWoundBonus((b) => adjustMax(wounds, b, n));
  const fatePoints = (fateRoll != null && home)
    ? (home.fateTable.find(([max]) => fateRoll <= max) || [0, 3])[1] + build.bonusFate : null;
  const profitFactor = 20 + build.profit;

  // Fate and Profit Factor as actually played: the origin-path derivation plus
  // whatever has been spent, burned or earned since. Both panes read these
  // rather than the raw derived values, or the steppers move state that
  // nothing displays.
  //
  // These MUST stay below fatePoints and profitFactor. Declared above them
  // they still build clean, then throw "Cannot access before initialization"
  // at runtime on every render — const has no hoisted value to read.
  // An imported sheet states its Fate outright, exactly as it does its wounds.
  // Without this the parsed value was stored, persisted and then ignored, and
  // the sheet showed the origin-path derivation instead.
  const fateBase = finalFate != null ? finalFate : fatePoints;
  const fateShown = fateBase == null ? null : Math.max(0, fateBase + fateAdj);
  const profitShown = Math.max(0, profitFactor + profitAdj);

  /* ---- actions ---- */
  const choose = (stepId, id) => {
    setSel((p) => ({ ...p, [stepId]: id }));
    if (stepId === 'home') {
      setWoundRoll(null);
      const hw = HOME_WORLDS.find((x) => x.id === id);
      if (hw?.xenos) setStepIx(5);  // skip Birthright → Motivation for xenos
    }
  };
  const setChoice = (cid, label) => setChoices((p) => ({ ...p, [cid]: label }));

  const rollAll = () => {
    const r = {};
    CHAR_KEYS.forEach((k) => { r[k] = 25 + d(10) + d(10); });
    setRolls(r);
    setWoundRoll(home ? home.woundDie() : d(5));
    setFateRoll(d(10));
  };
  const rerollOne = (k) => setRolls((p) => ({ ...p, [k]: 25 + d(10) + d(10) }));

  /* ---- point-buy: 25 base, a pool of 100 ---- */

  const startPointBuy = () => {
    const alloc = emptyAllocation();
    setPointAlloc(alloc);
    setFinalTotals(null);
    setRolls(allocationTotals(alloc));
    if (woundRoll == null) setWoundRoll(home ? home.woundDie() : d(5));
    if (fateRoll == null) setFateRoll(d(10));
  };

  const spendPoint = (k, n) => setPointAlloc((prev) => {
    const next = allocate(prev || emptyAllocation(), k, n);
    if (next !== prev) setRolls(allocationTotals(next));
    return next;
  });

  /* ---- importing a character from a sheet ---- */

  const applySheet = (s) => {
    setName(s.name || '');
    setGender(s.gender || '');
    setBackground(s.background || '');
    setSel(s.sel || {});
    setChoices(s.choices || {});
    setRolls(s.rolls || null);
    setFinalTotals(s.finalTotals || null);
    setPointAlloc(null);
    setWoundRoll(s.woundRoll ?? null);
    setFateRoll(s.fateRoll ?? null);
    setFinalWounds(s.finalWounds ?? null);
    setFinalFate(s.finalFate ?? null);
    setDamage(s.damage || 0);
    setWoundBonus(s.woundBonus || 0);
    setPsyRating(s.psyRating || 0);
    if (typeof s.xp === 'number') setXp(s.xp);
    setAvatar(s.avatar && s.avatar.src ? { src: s.avatar.src, framing: DEFAULT_FRAMING } : null);
    setExtras(readExtras(s.extras));
    setFateAdj(0); setProfitAdj(0); setSpentAdj(0);
    setCharId(null);
    setStepIx(7);
  };

  const loadPreset = () => {
    setName(MAGOS_PRESET.name);
    setSel({
      home: MAGOS_PRESET.home, birthright: MAGOS_PRESET.birthright, lure: MAGOS_PRESET.lure,
      trials: MAGOS_PRESET.trials, motivation: MAGOS_PRESET.motivation, career: MAGOS_PRESET.career
    });
    setChoices(MAGOS_PRESET.choices);
    // Falls back to the initial if the file is not there — see MAGOS_PRESET.
    setAvatar({ src: MAGOS_PRESET.avatar, framing: DEFAULT_FRAMING });
    setStepIx(6);
  };

  const clearAll = () => {
    setName(''); setGender(''); setBackground(''); setSel({}); setChoices({}); setRolls(null); setWoundRoll(null); setFateRoll(null);
    setDamage(0); setWoundBonus(0);
    setFateAdj(0); setProfitAdj(0); setSpentAdj(0);
    setFinalTotals(null); setFinalWounds(null); setFinalFate(null); setPointAlloc(null);
    setPsyRating(0); setXp(STARTING_XP_DEFAULT);
    setAvatar(null); setExtras(EMPTY_EXTRAS);
    setStepIx(0);
  };

  /* ---- homebrew library: per account when signed in, per browser otherwise ---- */

  const legacyHomebrew = useRef(null);

  useEffect(() => {
    let live = true;
    (async () => {
      let lib = EMPTY_HOMEBREW;
      try {
        lib = cloud ? await homebrewGet() : readLocalHomebrew();
      } catch (e) {
        // Fall back to whatever this browser has rather than showing none.
        lib = readLocalHomebrew();
        if (live) setHomebrewErr(e.message);
      }
      // First run on an account, or a browser whose library predates its own
      // storage key: adopt what the sheet was carrying rather than lose it.
      if (homebrewEmpty(lib) && legacyHomebrew.current
        && !homebrewEmpty(legacyHomebrew.current)) {
        lib = legacyHomebrew.current;
      }
      if (live) { setHomebrew(lib); setHomebrewLoaded(true); }
    })();
    return () => { live = false; };
  }, [cloud]);

  useEffect(() => {
    if (!homebrewLoaded) return undefined;
    const t = setTimeout(() => {
      // Written to this browser either way, so a library survives being
      // signed out and is there to fall back on.
      writeLocalHomebrew(homebrew);
      if (!cloud) return;
      homebrewPut(homebrew)
        .then(() => setHomebrewErr(''))
        .catch((e) => setHomebrewErr(e.message));
    }, 600);
    return () => clearTimeout(t);
  }, [homebrew, homebrewLoaded, cloud]);

  /* ---- roster: save / open / delete / start fresh ---- */

  useEffect(() => {
    if (!cloud) { setRoster(readRoster()); return; }
    let live = true;
    (async () => {
      try {
        let list = await cloudList();
        // First sign-in from a browser that already holds a roster: move it up,
        // so the characters do not look lost. The local copy is left in place
        // as a fallback rather than deleted.
        const local = readRoster();
        if (list.length === 0 && local.length > 0) {
          let moved = 0;
          for (const c of local) {
            try { await cloudPut(c); moved++; } catch { /* reported by the count */ }
          }
          list = await cloudList();
          if (live && moved) {
            setRosterNote(`Moved ${moved} character${moved === 1 ? '' : 's'} `
              + 'from this browser to your account.');
          }
        }
        if (live) setRoster(list);
      } catch (e) {
        // Fall back to whatever this browser has rather than showing nothing.
        if (live) { setRoster(readRoster()); setRosterErr(e.message); }
      }
    })();
    return () => { live = false; };
  }, [cloud]);

  // Writes one character to whichever backend is live, returning the entry to
  // keep in state (cloud mode returns metadata only — the body stays on the
  // server) or throwing a message worth showing. Local mode re-reads storage
  // instead of trusting `roster`, so a loop of imports cannot clobber the
  // entries written earlier in the same tick.
  const persist = async (entry) => {
    if (cloud) return cloudPut(entry);
    const next = upsert(readRoster(), entry);
    if (!writeRoster(next)) {
      throw new Error('Could not save — browser storage is full. '
        + 'A large portrait is the usual cause.');
    }
    return entry;
  };

  const saveCharacter = async () => {
    const id = charId || newId();
    setRosterBusy(true);
    try {
      const meta = await persist({
        id,
        name: name || 'Unnamed adept',
        career: career ? career.name : null,
        updatedAt: Date.now(),
        state: { name, gender, background, blueprint, shipRole,
                 sel, choices, rolls, woundRoll, fateRoll, damage, woundBonus, avatar, extras,
                 fateAdj, profitAdj, spentAdj, psyRating, xp,
                 finalTotals, finalWounds, finalFate, pointAlloc }
      });
      setRoster((prev) => upsert(prev, meta));
      setCharId(id);
      setRosterErr('');
      setRosterNote(cloud ? 'Saved to your account.' : 'Saved in this browser.');
    } catch (e) {
      setRosterErr(e.message);
    } finally {
      setRosterBusy(false);
    }
  };

  const openCharacter = async (id) => {
    let c = roster.find((x) => x.id === id);
    if (!c) return;
    // Cloud entries are metadata; the body is fetched on demand because the
    // index holds every character and a portrait each would be megabytes.
    if (!c.state && cloud) {
      setRosterBusy(true);
      try {
        c = await cloudGet(id);
      } catch (e) {
        setRosterErr(e.message);
        return false;                 // the dialog stays open on the message
      } finally {
        setRosterBusy(false);
      }
    }
    const s = c.state || {};
    setName(s.name || '');
    setGender(s.gender || '');
    setBackground(s.background || '');
    setSel(s.sel || {});
    setChoices(s.choices || {});
    setRolls(s.rolls || null);
    setWoundRoll(s.woundRoll ?? null);
    setFateRoll(s.fateRoll ?? null);
    setDamage(s.damage || 0);
    setWoundBonus(s.woundBonus || 0);
    setFateAdj(s.fateAdj || 0);
    setProfitAdj(s.profitAdj || 0);
    setSpentAdj(s.spentAdj || 0);
    setFinalTotals(s.finalTotals || null);
    setFinalWounds(s.finalWounds ?? null);
    setFinalFate(s.finalFate ?? null);
    setPointAlloc(s.pointAlloc || null);
    setAvatar(s.avatar || null);
    setExtras(readExtras(s.extras));
    setPsyRating(s.psyRating || 0);
    setBlueprint(readBlueprint(s.blueprint));
    setShipRole(s.shipRole || '');
    setXp(typeof s.xp === 'number' ? s.xp : STARTING_XP_DEFAULT);
    setCharId(id);
    setRosterErr('');
    setRosterNote('');
    setStepIx(7);
    return true;
  };

  const deleteCharacter = async (id) => {
    const c = roster.find((x) => x.id === id);
    const label = c ? c.name : 'this character';
    if (!window.confirm(`Delete "${label}" permanently? This cannot be undone.`)) return;
    if (cloud) {
      setRosterBusy(true);
      try {
        await cloudDelete(id);
      } catch (e) {
        setRosterErr(e.message);
        return;
      } finally {
        setRosterBusy(false);
      }
      setRoster((prev) => removeChar(prev, id));
    } else {
      const next = removeChar(readRoster(), id);
      writeRoster(next);
      setRoster(next);
    }
    setRosterNote('');
    if (charId === id) setCharId(null);
  };

  const newCharacter = () => {
    clearAll(); setCharId(null); setRosterErr(''); setRosterNote('');
  };

  const addExtra = (kind, value) =>
    setExtras((p) => (p[kind].includes(value) ? p : { ...p, [kind]: [...p[kind], value] }));
  const removeExtra = (kind, value) =>
    setExtras((p) => ({ ...p, [kind]: p[kind].filter((v) => v !== value) }));

  const buyAdvance = (a) => setExtras((p) => (
    p.advances.some((x) => x.name === a.name) ? p
      : { ...p, advances: [...p.advances, { name: a.name, type: a.type, cost: a.cost, rank: a.rank }] }
  ));
  const refundAdvance = (name) =>
    setExtras((p) => ({ ...p, advances: p.advances.filter((x) => x.name !== name) }));

  // A GM-approved Elite Advance: a Skill/Talent/Trait the career's own table
  // does not offer, bought outright at a cost the GM sets (typically 200-500
  // XP) rather than looked up from CAREER_ADVANCES. Rank-gating does not
  // apply to these — that gate only exists to pace what a career table
  // offers, and an Elite Advance was never on that table to begin with.
  const addEliteAdvance = (a) => setExtras((p) => (
    p.eliteAdvances.some((x) => x.name === a.name) ? p
      : { ...p, eliteAdvances: [...p.eliteAdvances, { name: a.name, type: a.type, cost: a.cost }] }
  ));
  const removeEliteAdvance = (name) =>
    setExtras((p) => ({ ...p, eliteAdvances: p.eliteAdvances.filter((x) => x.name !== name) }));

  // One +5 characteristic advance per call, cheapest (unbought) tier first —
  // the count IS the tier index into ADVANCE_LEVELS, so there is nothing to
  // pick: buying always takes the next rung, refunding always gives back the
  // last one bought.
  const buyCharAdvance = (charKey) => setExtras((p) => {
    const count = (p.charAdvances && p.charAdvances[charKey]) || 0;
    if (count >= ADVANCE_LEVELS.length) return p;
    return { ...p, charAdvances: { ...p.charAdvances, [charKey]: count + 1 } };
  });
  const refundCharAdvance = (charKey) => setExtras((p) => {
    const count = (p.charAdvances && p.charAdvances[charKey]) || 0;
    if (count <= 0) return p;
    return { ...p, charAdvances: { ...p.charAdvances, [charKey]: count - 1 } };
  });

  const stepDone = (i) => {
    if (i < 6) return !!sel[STEPS[i].id];
    if (i === 6) return !!rolls;
    return false;
  };

  const stepLabels = [...STEPS.map((s) => s.label), 'Characteristics', 'Dossier'];

  const onDossier = stepIx === 7;
  // leaving the dossier re-arms the collapsed control bar for next time
  /* The reference card this character publishes to the bridge.

     Assembled here because the GM cannot read it: a character lives under a
     key only its owner can reach, so the sheet has to volunteer a summary.
     Secret and Favour are pulled out of the notes, where the sheet importer
     puts them, because they are the two the GM reaches for at the table. */
  const noteStartingWith = (re) => {
    const hit = [...build.notes, ...extras.notes].find((x) => re.test(x));
    return hit ? hit.replace(/^[^:]*:\s*/, '') : '';
  };

  const crewCard = useMemo(() => ({
    career: career ? career.name : '',
    homeWorld: home ? home.name : '',
    characteristics: totals || {},
    wounds: ws ? `${ws.current} / ${ws.max}` : '',
    fate: fateShown,
    skills: [...build.skills, ...extras.skills],
    talents: [...build.talents, ...extras.talents],
    traits: [...build.traits, ...extras.traits],
    secret: noteStartingWith(/^Secret/i),
    favour: noteStartingWith(/^Favour/i)
  }), [career, home, totals, ws, fateShown, build, extras]);

  useEffect(() => { if (!onDossier) setNavOpen(false); }, [onDossier]);

  // Vox-Synthesiser is Explorator flavour (a Magos' binary-cant vox-caster);
  // Psy is the Focus Power / Phenomena / Perils reference, of no use to a
  // character with no psychic powers to manifest. Closing the panel when its
  // condition goes false covers a career or Psy Rating change made while open.
  const voxAvailable = career?.id === 'explorator';
  const psyAvailable = psyRating > 0;
  useEffect(() => { if (!voxAvailable) setVoxOpen(false); }, [voxAvailable]);
  useEffect(() => { if (!psyAvailable) setPsyOpen(false); }, [psyAvailable]);

  /* ---------------------------- render ---------------------------- */
  return (
    <div className="rt-root">
      <style>{CSS}</style>

      <header className="rt-head">
        <div className="rt-head-in">
          <div className="rt-sigil">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.3" strokeLinecap="round">
              <circle cx="12" cy="12" r="2.9" />
              <circle cx="12" cy="12" r="7.4" opacity=".5" />
              <path d="M12 1.6v3M12 19.4v3M1.6 12h3M19.4 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M19.4 4.6l-2.1 2.1M6.7 17.3l-2.1 2.1" />
            </svg>
          </div>
          <div>
            <h1 className="rt-title">Origin Path Cogitator</h1>
            <div className="rt-sub">ROGUE TRADER / KORONUS EXPANSE</div>
          </div>
          <div className="rt-head-btns">
            <button className="rt-headbtn" onClick={() => setRosterOpen(true)}>ROSTER</button>
            <button className="rt-headbtn ship" onClick={() => setShipOpen(true)}
              title="Voidship blueprint: hull, components, and your station">SHIP</button>
            {/* The door they signed in through, reported by /api/auth/me.
                A player never sees the GM dashboard at all. */}
            {me?.gm && (
              <button className="rt-headbtn gm" onClick={() => setGmOpen(true)}
                title="GM dashboard: the fleet, the turn, attacks and events">GM</button>
            )}
            <button className={'rt-headbtn bridge' + (bridgeCode ? ' on' : '')}
              onClick={() => setBridgeOpen(true)}
              title="The shared bridge: join a table or run one">
              {bridgeCode || 'BRIDGE'}
            </button>
            {psyAvailable && (
              <button className="rt-headbtn psy" onClick={() => setPsyOpen(true)}
                title="Focus Power, Psychic Phenomena and Perils of the Warp">PSY</button>
            )}
            {voxAvailable && (
              <button
                className={'rt-voxbtn' + (vox.speaking ? ' live' : '')}
                onClick={() => setVoxOpen(true)}
                title="Vox-Synthesiser: an Explorator's binary-cant vox-caster"
              >
                {vox.speaking ? '\u25CF VOX' : 'VOX'}
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="rt-wrap">
        <div className="rt-steps">
          {stepLabels.map((label, i) => {
            const xenosSkip = home?.xenos && i >= 1 && i <= 4;
            const cls = 'rt-step'
              + (xenosSkip ? ' na' : '')
              + (i === stepIx ? ' on' : stepDone(i) ? ' done' : '');
            return (
              <button key={label} className={cls} onClick={() => setStepIx(i)}>
                {stepDone(i) && i !== stepIx && <span className="tick">{'\u2713'}</span>}{label}
              </button>
            );
          })}
        </div>

        {stepIx < 6 && (
          <StepPane
            step={STEPS[stepIx]}
            selected={sel[STEPS[stepIx].id]}
            choices={choices}
            onSelect={choose}
            onChoose={setChoice}
            showIntro={stepIx === 0}
            name={name}
            setName={setName}
            gender={gender}
            setGender={setGender}
            onImport={() => setImportOpen(true)}
            xenosHome={!!(home?.xenos && stepIx >= 1 && stepIx <= 4)}
            onSkipToCareer={() => setStepIx(5)}
          />
        )}

        {stepIx === 6 && (
          <CharacteristicsPane
            rolls={rolls} totals={totals} mods={build.mods}
            rollAll={rollAll} rerollOne={rerollOne} picked={build.picked}
            pointAlloc={pointAlloc} onStartPoints={startPointBuy} onSpendPoint={spendPoint}
            finalTotals={finalTotals}
            home={home} wounds={ws ? ws.max : null} fatePoints={fateShown}
            profitFactor={profitShown} tBonus={tBonus}
          />
        )}

        {stepIx === 7 && (
          <DossierPane
            name={name} gender={gender} background={background} setBackground={setBackground}
            build={build} totals={totals}
            ws={ws} onDamage={takeDamage} onAdjustMax={changeMax}
            fatePoints={fateShown} profitFactor={profitShown}
            avatar={avatar} setAvatar={setAvatar}
            extras={extras} onAddExtra={addExtra} onRemoveExtra={removeExtra}
            psyRating={psyRating} onPsyRating={setPsyRating} xp={xp} onXp={setXp}
            onBuyAdvance={buyAdvance} onRefundAdvance={refundAdvance}
            onBuyCharAdvance={buyCharAdvance} onRefundCharAdvance={refundCharAdvance}
            onAddEliteAdvance={addEliteAdvance} onRemoveEliteAdvance={removeEliteAdvance}
            onFate={(n) => setFateAdj((a) => a + n)}
            onProfit={(n) => setProfitAdj((a) => a + n)}
            spentAdj={spentAdj} onSpentAdj={(n) => setSpentAdj((a) => Math.max(0, a + n))}
          />
        )}
      </div>

      {/* On the dossier the controls collapse to a single Edit affordance so
          the sheet reads clean; tapping it reveals Start over / Back / Save. */}
      <nav className={'rt-nav' + (onDossier && !navOpen ? ' slim' : '')}>
        <div className="rt-nav-in">
          {onDossier && !navOpen ? (
            <>
              {/* Print lives beside Edit because it only means anything on the
                  dossier — the print sheet is rendered by DossierPane. */}
              <button className="rt-editbtn" onClick={() => window.print()}
                title="Print or save the dossier as a PDF" aria-label="Print dossier">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9V3h12v6" />
                  <path d="M6 18H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2" />
                  <path d="M6 14h12v7H6z" />
                </svg>
                Print
              </button>
              <button className="rt-editbtn" onClick={() => setNavOpen(true)}
                aria-expanded="false" aria-label="Show sheet controls">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
                Edit
              </button>
            </>
          ) : (
            <>
              {onDossier && (
                <button className="rt-btn ghost" onClick={clearAll}>Start over</button>
              )}
              <button className="rt-btn ghost" disabled={stepIx === 0}
                onClick={() => setStepIx((i) => Math.max(0, i - 1))}>Back</button>
              <button className="rt-btn"
                onClick={() => (onDossier ? saveCharacter() : setStepIx((i) => Math.min(7, i + 1)))}>
                {onDossier ? 'Save' : stepIx === 6 ? 'View dossier' : 'Next'}
              </button>
            </>
          )}
        </div>
      </nav>

      {rosterOpen && (
        <RosterDialog
          roster={roster} currentId={charId} err={rosterErr} me={me}
          cloud={cloud} note={rosterNote} busy={rosterBusy}
          onSave={saveCharacter} onOpen={openCharacter}
          onDelete={deleteCharacter} onNew={newCharacter}
          onClose={() => setRosterOpen(false)}
        />
      )}

      {importOpen && (
        <ImportDialog
          onApply={applySheet}
          onImportMany={async (s) => {
            const meta = await persist({
              id: newId(), name: s.name, career: null, updatedAt: Date.now(), state: s
            });
            setRoster((prev) => upsert(prev, meta));
          }}
          onPreset={loadPreset}
          onClose={() => setImportOpen(false)}
        />
      )}

      {psyOpen && (
        <PsychicPanel
          psyRating={psyRating} onPsyRating={setPsyRating}
          willpower={totals ? totals.wp : 0}
          onClose={() => setPsyOpen(false)}
        />
      )}

      {voxOpen && (
        <VoxPanel
          vox={vox} text={voxText} setText={setVoxText}
          onClose={() => setVoxOpen(false)}
          careerName={career ? career.name : null}
        />
      )}

      {shipOpen && (
        <ShipPanel
          blueprint={blueprint} setBlueprint={setBlueprint}
          homebrew={homebrew} onEditHomebrew={() => setBrewOpen(true)}
          shipRole={shipRole} setShipRole={setShipRole}
          careerName={career ? career.name : ''}
          onClose={() => setShipOpen(false)}
        />
      )}

      {bridgeOpen && (
        <BridgePanel
          code={bridgeCode} setCode={setBridgeCode}
          characterName={name} charId={charId} shipRole={shipRole}
          blueprint={blueprint} fleet={fleet} combat={combat} roster={roster}
          card={crewCard}
          onClose={() => setBridgeOpen(false)}
        />
      )}

      {brewOpen && (
        <HomebrewEditor homebrew={homebrew} setHomebrew={setHomebrew}
          err={homebrewErr} cloud={cloud}
          onClose={() => setBrewOpen(false)} />
      )}

      {gmOpen && (
        <GmPanel
          fleet={fleet} setFleet={setFleet}
          combat={combat} setCombat={setCombat}
          blueprint={blueprint} bridgeCode={bridgeCode} homebrew={homebrew}
          onClose={() => setGmOpen(false)}
        />
      )}
    </div>
  );
}

const MAX_AVATAR_BYTES = 8 * 1024 * 1024;
const AUTOSAVE_KEY = 'rt:current';

/* A blueprint belongs to the dynasty rather than the character, but until
   there is a shared dynasty to hang it on it rides along with the sheet — one
   fewer moving part, and it survives a refresh either way. */
const EMPTY_BLUEPRINT = {
  shipName: '', hullId: null, dynastySP: 60, crew: 'competent',
  essential: {}, weapons: [], supplemental: []
};

// The GM's running battle: the phase, the initiative order, and the player
// ship's live vitals. Kept apart from the blueprint, which is the ship as
// built rather than the ship as it currently stands.
const EMPTY_COMBAT = { phase: 'extended', order: [], playerVitals: null };


// Anything absent is defaulted rather than trusted: a blueprint saved before a
// field existed would otherwise arrive as undefined and break the editor.
const readBlueprint = (b) => ({
  ...EMPTY_BLUEPRINT,
  ...(b && typeof b === 'object' ? b : null),
  essential: (b && b.essential) || {},
  weapons: Array.isArray(b && b.weapons) ? b.weapons : [],
  supplemental: Array.isArray(b && b.supplemental) ? b.supplemental : []
});
const STARTING_XP_DEFAULT = 5000;   // a starting Explorer, per the rank table
// advances are objects ({name, type, cost, rank}), not names — the cost has to
// travel with them so spent XP can be summed and refunded
// charAdvances: how many +5 characteristic advances have been bought per
// stat (0-4, one per ADVANCE_LEVELS tier) — see tierFor/CHAR_ADVANCE_COST.
const EMPTY_EXTRAS = {
  skills: [], talents: [], traits: [], gear: [], notes: [], gearDropped: [], powers: [], advances: [],
  charAdvances: {}, eliteAdvances: []
};
// merges a stored extras object over the empty shape, so an older save that
// predates a category still loads
const readExtras = (v) => ({ ...EMPTY_EXTRAS, ...(v || {}) });

/* --------------------------- EQUIPMENT ROWS ---------------------------
   Data and parsing live in gear.js; these are just the rows. */

function GearItem({ label, onRemove }) {
  const [open, setOpen] = useState(false);
  const { entry, quality } = gearInfo(label);
  const title = label.charAt(0).toUpperCase() + label.slice(1);

  if (!entry) {
    return (
      <li className="rt-entry">
        <span className="rt-entry-t">{title}</span>
        {onRemove && <RemoveBtn label={title} onRemove={onRemove} />}
      </li>
    );
  }

  return (
    <li className={'rt-entry' + (open ? ' open' : '')}>
      <button className="rt-entry-b" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="rt-entry-t">{title}</span>
        {entry.kind && <span className="rt-entry-c">{entry.kind}</span>}
        <span className="rt-entry-x" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {onRemove && <RemoveBtn label={title} onRemove={onRemove} />}
      {open && (
        <div className="rt-entry-d">
          {entry.stats && <p className="rt-gear-s">{entry.stats}</p>}
          <p>{entry.desc}</p>
          {quality && <p className="rt-entry-s">{CRAFT[quality]}</p>}
        </div>
      )}
    </li>
  );
}

function GearList({ gear, extra = [], hidden = [], onRemove, onDrop }) {
  // issued kit can be lost, sold or spent, so it is removable too — dropped
  // labels are remembered rather than mutating the career's gear string
  const groups = parseGear(gear)
    .map((alts) => alts.filter((l) => !hidden.includes(l)))
    .filter((alts) => alts.length);

  return (
    <ul className="rt-list rt-gear">
      {groups.map((alts, i) => (
        <li key={i} className="rt-gear-g">
          <ul className="rt-gear-alts">
            {alts.map((label, j) => (
              <GearItem key={j} label={label} onRemove={() => onDrop(label)} />
            ))}
          </ul>
        </li>
      ))}
      {extra.map((label) => (
        <li key={'x' + label} className="rt-gear-g">
          <ul className="rt-gear-alts">
            <GearItem label={label} onRemove={() => onRemove(label)} />
          </ul>
        </li>
      ))}
    </ul>
  );
}

/* One list row. Clickable only when there is something to say. */
function RemoveBtn({ label, onRemove }) {
  return (
    <button className="rt-rm" onClick={onRemove} title={'Remove ' + label}
      aria-label={'Remove ' + label}>&times;</button>
  );
}

function Entry({ text, onRemove }) {
  const [open, setOpen] = useState(false);
  const { title, body, char, spec } = explainEntry(text);

  if (!body) {
    return (
      <li className="rt-entry">
        <span className="rt-entry-t">{title}</span>
        {char && <span className="rt-entry-c" data-g={charGroup(char)}>{char}</span>}
        {onRemove && <RemoveBtn label={title} onRemove={onRemove} />}
      </li>
    );
  }
  return (
    <li className={'rt-entry' + (open ? ' open' : '')}>
      <button className="rt-entry-b" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="rt-entry-t">{title}</span>
        {char && <span className="rt-entry-c" data-g={charGroup(char)}>{char}</span>}
        <span className="rt-entry-x" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {onRemove && <RemoveBtn label={title} onRemove={onRemove} />}
      {open && (
        <div className="rt-entry-d">
          {spec && <p className="rt-entry-s">{spec}</p>}
          <p>{body}</p>
        </div>
      )}
    </li>
  );
}

/* ---------------------------- AVATAR FRAMER ----------------------------
   Drag to pan, slider to zoom. One crop target here (the dossier plate),
   so unlike the dnd_multi-user original there is no per-view tab strip. */

function AvatarFramer({ src, framing, setFraming, onClose }) {
  const dialogRef = useRef(null);
  const dragRef = useRef(null);
  const f = framing ?? DEFAULT_FRAMING;

  // showModal puts the dialog in the top layer, which ignores z-index and
  // stacking contexts — .rt-wrap has z-index:1 and would otherwise trap it
  // under the fixed bottom nav. Esc closes it and fires onClose for free.
  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) el.showModal();
  }, []);

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX, startY: e.clientY, start: f,
      box: e.currentTarget.getBoundingClientRect()
    };
  };
  const onPointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag) return;
    setFraming({
      ...drag.start,
      ...panFraming(drag.start, e.clientX - drag.startX, e.clientY - drag.startY, drag.box)
    });
  };
  const onPointerUp = () => { dragRef.current = null; };

  const close = () => dialogRef.current && dialogRef.current.close();

  return (
    <dialog ref={dialogRef} className="rt-framer" onClose={onClose} aria-label="Frame portrait">
        <div className="rt-framer-in">
          <div className="rt-framer-h">
            <span className="rt-framer-t">Frame portrait</span>
            <button className="rt-close" onClick={close} aria-label="Close">&times;</button>
          </div>
          <p className="rt-vox-hint">Drag the image to reposition it, then set the zoom.</p>

          <div
            className="rt-framer-stage"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <img src={src} alt="" draggable="false" style={framingStyle(f)} />
          </div>

          <div className="rt-sl-l"><span>ZOOM</span><span>{f.zoom.toFixed(2)}×</span></div>
          <input
            className="rt-slider" type="range" min="1" max="3" step="0.05"
            value={f.zoom}
            onChange={(e) => setFraming({ ...f, zoom: Number(e.target.value) })}
          />

          <div className="rt-btnrow">
            <button className="rt-btn ghost" onClick={() => setFraming(DEFAULT_FRAMING)}>Reset</button>
            <button className="rt-btn" onClick={close}>Done</button>
          </div>
        </div>
    </dialog>
  );
}

/* ------------------------------- ROSTER -------------------------------
   Save, reopen, delete, or start fresh. Same shape as CharacterList in the
   reference repos with the API half removed — see roster.js. */

async function signOut() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // no /api under plain `vite dev` — reloading re-stubs the dev user
  }
  window.location.reload();
}

function RosterDialog({ roster, currentId, onSave, onOpen, onDelete, onNew, onClose,
  err, me, cloud, note, busy }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) el.showModal();
  }, []);
  const close = () => dialogRef.current && dialogRef.current.close();

  return (
    <dialog ref={dialogRef} className="rt-framer" onClose={onClose} aria-label="Crew roster">
      <div className="rt-framer-h">
        <span className="rt-framer-t">Crew roster</span>
        <button className="rt-close" onClick={close} aria-label="Close">&times;</button>
      </div>

      {err && <div className="rt-warn">{err}</div>}
      {note && <div className="rt-note">{note}</div>}

      {/* Where the roster lives is worth stating plainly: the localStorage-only
          version looked broken across devices without explaining why. */}
      <p className="rt-vox-hint">
        {cloud
          ? 'Saved to your account — these follow you to any device you sign in on.'
          : 'Saved in this browser only. Sign in to reach them from another device.'}
      </p>

      {roster.length === 0 ? (
        <p className="rt-vox-hint">
          Nothing saved yet. Save the character you are building, or start a fresh sheet.
        </p>
      ) : (
        <ul className="rt-roster-l">
          {roster.map((c) => (
            <li key={c.id} className={'rt-roster-i' + (c.id === currentId ? ' on' : '')}>
              <button className="rt-roster-n" disabled={busy}
                onClick={async () => { if (await onOpen(c.id)) close(); }}>
                <span className="rt-roster-nm">{c.name || 'Unnamed adept'}</span>
                <span className="rt-roster-mt">{c.career || 'No career'}</span>
              </button>
              <button className="rt-opt" disabled={busy}
                onClick={() => onDelete(c.id)}>Delete</button>
            </li>
          ))}
        </ul>
      )}

      <div className="rt-btnrow">
        <button className="rt-btn ghost" onClick={() => { onNew(); close(); }}>New character</button>
        <button className="rt-btn" onClick={onSave} disabled={busy}>
          {busy ? 'Working…' : 'Save current'}
        </button>
      </div>

      {me && (
        <div className="rt-signed">
          <span className="rt-signed-e">{me.email}</span>
          <button className="rt-opt" onClick={signOut}>Sign out</button>
        </div>
      )}
    </dialog>
  );
}

/* ---------------------------- IMPORT DIALOG ----------------------------
   Loads a character from a Google Sheet. The fetch goes through /api/sheet
   because Google sends no CORS headers, so `npm run dev` — which has no /api
   — falls back to pasting the CSV, and that path always works. */

function ImportDialog({ onApply, onImportMany, onPreset, onClose }) {
  const dialogRef = useRef(null);
  const [source, setSource] = useState('');
  const [tab, setTab] = useState('');
  const [paste, setPaste] = useState('');
  const [tabs, setTabs] = useState(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [warnings, setWarnings] = useState([]);

  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) el.showModal();
  }, []);
  const close = () => dialogRef.current && dialogRef.current.close();

  const id = sheetIdFrom(source);

  // Vite's dev server has no serverless runtime: it answers /api/sheet with
  // the FILE ITSELF, as text/javascript with a 200. Checking only res.ok lets
  // that JavaScript source reach the CSV parser, which then fails in a way
  // that says nothing useful — so the content type is checked too.
  const API_MISSING = 'The /api/sheet helper is not running here — a plain '
    + '`npm run dev` has no serverless functions. Use `vercel dev`, or the '
    + 'deployed site, or paste the CSV below.';

  const callApi = async (params, expect) => {
    const res = await fetch(`/api/sheet?${new URLSearchParams(params)}`);
    if (!res.ok) {
      throw new Error(res.status === 404
        ? 'Sheet or tab not found. Is it shared with "anyone with the link"?'
        : `Could not reach the sheet (${res.status}).`);
    }
    const type = res.headers.get('content-type') || '';
    if (!type.includes(expect === 'json' ? 'json' : 'csv')) throw new Error(API_MISSING);
    return expect === 'json' ? res.json() : res.text();
  };

  const fetchCsv = (tabName) =>
    callApi(tabName ? { id, tab: tabName } : { id }, 'csv');

  const applyCsv = (text, label) => {
    const { state, warnings: w } = parseCharacterSheet(parseCsv(text), SHEET_CATALOG);
    // A flattened tab parses to nothing on purpose — the parser refuses it
    // rather than handing back a hollow character. Report why.
    if (!state) {
      setErr(w[0]);
      return false;
    }
    if (!state.name && !state.finalTotals && !state.rolls) {
      setErr(`${label || 'That sheet'} did not look like a character sheet.`);
      return false;
    }
    setWarnings(w);
    onApply(state);
    return true;
  };

  const loadOne = async () => {
    setErr(''); setWarnings([]); setBusy('one');
    try {
      if (applyCsv(await fetchCsv(tab.trim()), 'That tab')) close();
    } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };

  const listTabs = async () => {
    setErr(''); setBusy('tabs');
    try {
      setTabs((await callApi({ id, tabs: '1' }, 'json')).tabs || []);
    } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };

  const importAll = async () => {
    setErr(''); setBusy('all');
    const done = [], failed = [];
    try {
      for (const name of tabs) {
        try {
          const { state } = parseCharacterSheet(parseCsv(await fetchCsv(name)), SHEET_CATALOG);
          // Awaited: saving is a network call in cloud mode, and an unawaited
          // rejection would be counted as a success and reported as one.
          if (state && state.name) { await onImportMany(state); done.push(state.name); }
          else failed.push(name);
        } catch { failed.push(name); }
      }
      setWarnings([
        `Saved ${done.length} character${done.length === 1 ? '' : 's'} to the roster.`,
        ...(failed.length ? [`Skipped: ${failed.join(', ')}`] : [])
      ]);
    } finally { setBusy(''); }
  };

  return (
    <dialog ref={dialogRef} className="rt-framer rt-import" onClose={onClose}
      aria-label="Load character">
      <div className="rt-framer-h">
        <span className="rt-framer-t">Load character</span>
        <button className="rt-close" onClick={close} aria-label="Close">&times;</button>
      </div>

      {err && <div className="rt-warn">{err}</div>}
      {warnings.length > 0 && (
        <div className="rt-importwarn">
          {warnings.map((w, i) => <p key={i}>{w}</p>)}
        </div>
      )}

      <div className="rt-conds-h">Google Sheet</div>
      <input className="rt-field" value={source} onChange={(e) => setSource(e.target.value)}
        placeholder="Paste the sheet link, or just its id" />
      {source && !id && <p className="rt-psynote">That is not a Google Sheets link or id.</p>}

      <input className="rt-field rt-import-tab" value={tab} onChange={(e) => setTab(e.target.value)}
        placeholder="Tab name — leave blank for the first tab" />

      <div className="rt-btnrow">
        <button className="rt-btn" disabled={!id || busy} onClick={loadOne}>
          {busy === 'one' ? 'Loading…' : 'Load this tab'}
        </button>
        <button className="rt-btn ghost" disabled={!id || busy} onClick={listTabs}>
          {busy === 'tabs' ? 'Listing…' : 'List tabs'}
        </button>
      </div>

      {tabs && (
        <div className="rt-tabs-found">
          <div className="rt-conds-h">{tabs.length} tab{tabs.length === 1 ? '' : 's'}</div>
          <ul className="rt-addl">
            {tabs.map((t) => (
              <li key={t}>
                <button className="rt-addi" disabled={!!busy}
                  onClick={() => { setTab(t); }}>{t}</button>
              </li>
            ))}
          </ul>
          <button className="rt-btn wide" disabled={!!busy} onClick={importAll}>
            {busy === 'all' ? 'Importing…' : `Import all ${tabs.length} to the roster`}
          </button>
        </div>
      )}

      <div className="rt-conds-h">Or paste the sheet as CSV</div>
      <p className="rt-psynote">
        File → Download → CSV, then paste it here. This needs no server, so it
        works under <code>npm run dev</code> where /api is not available.
      </p>
      <textarea className="rt-ta rt-import-ta" value={paste}
        onChange={(e) => setPaste(e.target.value)}
        placeholder="Field,Value…" />
      <button className="rt-btn wide" disabled={!paste.trim()}
        onClick={() => { setErr(''); setWarnings([]); if (applyCsv(paste, 'That CSV')) close(); }}>
        Load from pasted CSV
      </button>

      <div className="rt-import-foot">
        <button className="rt-opt" onClick={() => { onPreset(); close(); }}>
          Load the example character
        </button>
      </div>
    </dialog>
  );
}

/* ---------------------------- PSYCHIC PANEL ----------------------------
   The psyker's counterpart to the vox: choose a strength mode, make the Focus
   Power test, and read whatever the warp sends back. Every rule lives in
   psychic.js — this gathers the inputs and renders the outcome, nothing more. */

const PSY_LOG_MAX = 5;

function PsychicPanel({ psyRating, onPsyRating, willpower, onClose }) {
  const dialogRef = useRef(null);
  const [mode, setMode] = useState('unfettered');
  const [push, setPush] = useState(1);
  const [sustained, setSustained] = useState(0);
  const [mod, setMod] = useState(0);
  const [log, setLog] = useState([]);

  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) el.showModal();
  }, []);
  const close = () => dialogRef.current && dialogRef.current.close();

  const info = PSY_MODES.find((m) => m.id === mode) || PSY_MODES[1];
  const effective = effectivePsyRating(psyRating, mode, push);
  const sustainMod = sustainPenalty(sustained);
  const target = (willpower || 0) + mod + sustainMod;
  const pushMod = phenomenaModifier(mode, push);

  const go = () => setLog((p) => [
    { ...manifest({ psyRating, mode, push, willpower: willpower || 0, modifier: mod, sustained }),
      id: newId() },
    ...p
  ].slice(0, PSY_LOG_MAX));

  return (
    <dialog ref={dialogRef} className="rt-framer rt-psypanel" onClose={onClose}
      aria-label="Psychic manifestation">
      <div className="rt-framer-h">
        <span className="rt-framer-t rt-warp-t">Psychic Manifestation</span>
        <button className="rt-close" onClick={close} aria-label="Close">&times;</button>
      </div>

      <div className="rt-psyrow">
        <span className="rt-origin-k rt-warp-k">Psy Rating</span>
        <button className="rt-wmaxb" disabled={psyRating <= 0}
          onClick={() => onPsyRating(Math.max(0, psyRating - 1))}
          aria-label="Lower Psy Rating">{'−'}</button>
        <b className="rt-psyval rt-warp-v">{psyRating}</b>
        <button className="rt-wmaxb" onClick={() => onPsyRating(psyRating + 1)}
          aria-label="Raise Psy Rating">+</button>
        {psyRating > 0 && (
          <span className="rt-psynote">
            {disciplineSlots(psyRating)} discipline{disciplineSlots(psyRating) > 1 ? 's' : ''}
            {' · '}Thought Sending {thoughtSendingKm(psyRating)} km
          </span>
        )}
      </div>

      {psyRating <= 0 ? (
        <p className="rt-vox-hint">
          Not a psyker. Raise the Psy Rating above zero to manifest powers.
        </p>
      ) : (
        <>
          <div className="rt-conds-h">Strength mode</div>
          <div className="rt-modes">
            {PSY_MODES.map((m) => (
              <button key={m.id} className={'rt-mode' + (mode === m.id ? ' on' : '')}
                onClick={() => setMode(m.id)} aria-pressed={mode === m.id}>{m.label}</button>
            ))}
          </div>
          {mode === 'push' && (
            <div className="rt-pushrow">
              <span className="rt-origin-k">Push by</span>
              {Array.from({ length: MAX_PUSH }, (_, i) => i + 1).map((p) => (
                <button key={p} className={'rt-pushb' + (push === p ? ' on' : '')}
                  onClick={() => setPush(p)} aria-pressed={push === p}>+{p}</button>
              ))}
            </div>
          )}
          <p className="rt-psynote">{info.note}</p>

          <div className="rt-conds-h">Power difficulty</div>
          <div className="rt-diffs">
            {DIFFICULTIES.map((d) => (
              <button key={d.label} className={'rt-diff' + (mod === d.mod ? ' on' : '')}
                onClick={() => setMod(d.mod)} aria-pressed={mod === d.mod}>
                {d.label}<span>{d.mod > 0 ? '+' : ''}{d.mod}</span>
              </button>
            ))}
          </div>

          <div className="rt-pushrow">
            <span className="rt-origin-k">Sustaining</span>
            <button className="rt-wmaxb" disabled={sustained <= 0}
              onClick={() => setSustained(Math.max(0, sustained - 1))}
              aria-label="Fewer sustained powers">{'−'}</button>
            <b className="rt-psyval">{sustained}</b>
            <button className="rt-wmaxb" onClick={() => setSustained(sustained + 1)}
              aria-label="More sustained powers">+</button>
            {sustainMod < 0 && <span className="rt-psynote">{sustainMod} to all tests</span>}
          </div>

          <p className="rt-psyline">
            Channelling at <b>{effective}</b> of {psyRating}
            {' · '}Focus Power target <b>{target}</b>
            {pushMod > 0
              ? <> · Phenomena at <b>+{pushMod}</b></>
              : !risksPhenomena(mode) && <> · no Phenomena risk</>}
          </p>

          <button className="rt-speak rt-manifest" onClick={go}>Focus Power</button>

          {log.map((r, i) => (
            <div key={r.id} className={'rt-psyres' + (r.focus.success ? ' ok' : ' no') + (i === 0 ? ' last' : '')}>
              <div className="rt-psyres-h">
                <b>{r.focus.roll}</b>
                <span className="rt-rollr-v">vs {r.target}</span>
                <span className="rt-psyres-o">
                  {r.focus.success ? 'Manifested' : 'Failed'}
                  {r.focus.degrees > 0 && ` · ${r.focus.degrees} ${r.focus.success ? 'DoS' : 'DoF'}`}
                  {' · PR '}{r.effective}
                </span>
              </div>

              {r.phenomena ? (
                <div className="rt-warpres">
                  <div className="rt-warpres-k">
                    Psychic Phenomena — d100 {r.phenomena.roll}
                    {r.phenomena.modifier > 0 && ` + ${r.phenomena.modifier} = ${r.phenomena.total}`}
                  </div>
                  <b>{r.phenomena.result.name}</b>
                  <p>{r.phenomena.result.effect}</p>
                </div>
              ) : (
                <p className="rt-psynote">No Psychic Phenomena.</p>
              )}

              {r.perils && (
                <div className="rt-warpres perils">
                  <div className="rt-warpres-k">Perils of the Warp — d100 {r.perils.roll}</div>
                  <b>{r.perils.result.name}</b>
                  <p>{r.perils.result.effect}</p>
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </dialog>
  );
}

/* ---------------------------- PORTRAIT PLATE ---------------------------- */

// Gemini hands back roughly a 900KB portrait, which as a data URL is about
// 1.2MB of localStorage — enough that a few saved characters trip the roster's
// quota guard. Re-encoding to a 768px JPEG in the browser costs nothing and
// avoids a server-side image dependency: measured around 200KB.
// A plain `npm run dev` 404s /api/*, and when it answers it answers with the
// SPA shell, so both shapes mean the same thing to the player.
const API_ABSENT = 'Portrait generation needs the serverless functions, which '
  + '`npm run dev` does not run. Use `vercel dev` or the deployed site.';

async function shrinkToDataUrl(blob, max = 768, quality = 0.82) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  if (bitmap.close) bitmap.close();
  return canvas.toDataURL('image/jpeg', quality);
}

function PortraitPlate({ name, profitFactor, avatar, setAvatar, identity }) {
  const fileRef = useRef(null);
  const [framerOpen, setFramerOpen] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setErr(''); setBusy(true);
    try {
      const res = await fetch('/api/generate-avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(identity || {})
      });
      // A plain `npm run dev` has no serverless runtime and answers with the
      // FILE as text/javascript and a 200, so the type is checked as well.
      const type = res.headers.get('content-type') || '';
      if (!res.ok) {
        let why = `Generation failed (${res.status}).`;
        if (type.includes('json')) {
          try { why = (await res.json()).error || why; } catch { /* keep the status */ }
        }
        if (res.status === 401) why = 'Sign in first — portrait generation is behind sign-in.';
        if (res.status === 404) why = API_ABSENT;
        throw new Error(why);
      }
      if (!type.startsWith('image/')) throw new Error(API_ABSENT);
      setAvatar({ src: await shrinkToDataUrl(await res.blob()), framing: DEFAULT_FRAMING });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';                     // let the same file be picked twice
    if (!file) return;
    if (!file.type.startsWith('image/')) return setErr('That is not an image file.');
    if (file.size > MAX_AVATAR_BYTES) return setErr('Image is over 8 MB. Pick a smaller one.');
    try {
      // Shrunk like a generated portrait rather than stored as-is: an 8MB
      // upload is ~10.6MB as a data URL, which overflows both the localStorage
      // quota and the roster service's per-character limit.
      setAvatar({ src: await shrinkToDataUrl(file), framing: DEFAULT_FRAMING });
      setErr('');
    } catch {
      setErr('Could not read that image.');
    }
  };

  return (
    <div className="rt-portrait-wrap">
      <div className="rt-portrait">
        <div className="rt-port-img">
          {avatar && avatar.src
            ? <img src={avatar.src} alt="" style={framingStyle(avatar.framing)}
                onError={() => setAvatar(null)} />
            : <span aria-hidden="true">{(name || '').trim().charAt(0).toUpperCase() || '?'}</span>}
        </div>
      </div>

      <div className="rt-port-actions">
        <button className="rt-picon" title={avatar && avatar.src ? 'Replace image' : 'Upload image'}
          aria-label={avatar && avatar.src ? 'Replace image' : 'Upload image'}
          onClick={() => fileRef.current && fileRef.current.click()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
          </svg>
        </button>
        <button className="rt-picon" title="Frame image" aria-label="Frame image"
          disabled={!avatar || !avatar.src} onClick={() => setFramerOpen(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 2v14a1 1 0 0 0 1 1h14" /><path d="M2 7h14a1 1 0 0 1 1 1v14" />
          </svg>
        </button>
        <button className={'rt-picon' + (busy ? ' busy' : '')} onClick={generate} disabled={busy}
          title={busy ? 'Generating…' : 'Generate a portrait from this character'}
          aria-label="Generate portrait">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9Z" />
            <path d="M18.5 3v3M20 4.5h-3" />
          </svg>
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
      </div>
      {err && <div className="rt-warn" style={{ marginTop: 8 }}>{err}</div>}

      {framerOpen && (
        <AvatarFramer
          src={avatar.src}
          framing={avatar.framing}
          setFraming={(fr) => setAvatar({ ...avatar, framing: fr })}
          onClose={() => setFramerOpen(false)}
        />
      )}
    </div>
  );
}

/* ------------------------------ ADD DIALOG ------------------------------
   Pick from the catalogue for this tab, or type an entry of your own. Tabs
   with no catalogue (traits, notes) are free text only. */

function AddDialog({ title, options, existing, onAdd, onClose }) {
  const dialogRef = useRef(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) el.showModal();
  }, []);
  const close = () => dialogRef.current && dialogRef.current.close();

  const held = new Set(existing.map((s) => String(s).toLowerCase()));
  const needle = q.trim().toLowerCase();
  const matches = options
    .filter((o) => !held.has(o.toLowerCase()))
    .filter((o) => !needle || o.toLowerCase().includes(needle))
    .slice(0, 80);
  const custom = q.trim();
  const exact = options.some((o) => o.toLowerCase() === custom.toLowerCase());

  const add = (v) => { onAdd(v); close(); };

  return (
    <dialog ref={dialogRef} className="rt-framer" onClose={onClose} aria-label={title}>
      <div className="rt-framer-h">
        <span className="rt-framer-t">{title}</span>
        <button className="rt-close" onClick={close} aria-label="Close">&times;</button>
      </div>

      <input className="rt-field" autoFocus value={q} onChange={(e) => setQ(e.target.value)}
        placeholder={options.length ? 'Search, or type your own' : 'Type the entry'} />

      <ul className="rt-addl">
        {custom && !exact && (
          <li>
            <button className="rt-addi custom" onClick={() => add(custom)}>
              Add “{custom}” as written
            </button>
          </li>
        )}
        {matches.map((o) => (
          <li key={o}><button className="rt-addi" onClick={() => add(o)}>{o}</button></li>
        ))}
        {!matches.length && !custom && (
          <li className="rt-addnone">
            {options.length ? 'Everything in the catalogue is already on the sheet.'
              : 'Type above to add an entry.'}
          </li>
        )}
      </ul>
    </dialog>
  );
}

/* A Skill/Talent/Trait off the career's own table, priced by the GM rather
   than looked up — see addEliteAdvance. Distinct from AddDialog because it
   needs a type and a cost, not just a name. */
function EliteAdvanceDialog({ onAdd, onClose }) {
  const dialogRef = useRef(null);
  const [name, setName] = useState('');
  const [type, setType] = useState('Talent');
  const [cost, setCost] = useState(200);

  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) el.showModal();
  }, []);
  const close = () => dialogRef.current && dialogRef.current.close();

  const cleanCost = Math.max(0, Math.floor(Number(cost) || 0));
  const trimmed = name.trim();
  const add = () => {
    if (!trimmed) return;
    onAdd({ name: trimmed, type, cost: cleanCost });
    close();
  };

  return (
    <dialog ref={dialogRef} className="rt-framer" onClose={onClose} aria-label="Add an Elite Advance">
      <div className="rt-framer-h">
        <span className="rt-framer-t">Add an Elite Advance</span>
        <button className="rt-close" onClick={close} aria-label="Close">&times;</button>
      </div>
      <p className="rt-vox-hint">
        A Skill, Talent or Trait off this career's own table, granted by the GM
        for whatever cost they set — typically 200-500 XP, for an origin-path
        twist the tables don't cover, a xenos weapon picked up before session
        one, or a defining quirk like being Untouchable. Rank-gating does not
        apply: it was never on the table to begin with.
      </p>
      <input className="rt-field" autoFocus value={name} onChange={(e) => setName(e.target.value)}
        placeholder="Name, e.g. Untouchable (1)" />
      <div className="rt-choice-l">TYPE</div>
      <div className="rt-opts" style={{ marginBottom: 10 }}>
        {['Skill', 'Talent', 'Trait'].map((t) => (
          <button key={t} className={'rt-opt' + (type === t ? ' on' : '')}
            onClick={() => setType(t)} aria-pressed={type === t}>{t}</button>
        ))}
      </div>
      <div className="rt-choice-l">XP COST (GM SETS THIS)</div>
      <input className="rt-field" type="number" min="0" step="50" value={cost}
        onChange={(e) => setCost(e.target.value)} style={{ marginBottom: 10 }} />
      <button className="rt-btn" onClick={add} disabled={!trimmed}>
        Add for {cleanCost.toLocaleString()} XP
      </button>
    </dialog>
  );
}

/* ------------------------------ TEST ROLLER ------------------------------
   Opens under the characteristic it belongs to. Difficulty sets the modifier,
   the target updates live, and the log keeps the last few rolls so a run of
   tests stays on screen. */

const ROLL_LOG_MAX = 6;

function TestRoller({ charName, base, history, onRoll, conditionals = [] }) {
  const [mod, setMod] = useState(0);
  const [on, setOn] = useState([]);   // indexes of applied conditionals

  const toggle = (i) => setOn((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  const condMod = on.reduce((n, i) => n + (conditionals[i] ? conditionals[i].mod : 0), 0);
  const total = mod + condMod;
  const target = base + total;

  return (
    <div className="rt-roller">
      <div className="rt-roller-h">
        <span className="rt-roller-t">{charName} test</span>
        <span className="rt-roller-tg">TARGET <b>{target}</b></span>
      </div>

      <div className="rt-diffs">
        {DIFFICULTIES.map((d) => (
          <button key={d.label} className={'rt-diff' + (mod === d.mod ? ' on' : '')}
            onClick={() => setMod(d.mod)} aria-pressed={mod === d.mod}>
            {d.label}
            <span>{d.mod > 0 ? '+' : ''}{d.mod}</span>
          </button>
        ))}
      </div>

      {conditionals.length > 0 && (
        <div className="rt-conds">
          <div className="rt-conds-h">Applies to this test?</div>
          {conditionals.map((c, i) => (
            <button key={i} className={'rt-cond' + (on.includes(i) ? ' on' : '')}
              onClick={() => toggle(i)} aria-pressed={on.includes(i)}>
              <span className={'rt-cond-m' + (c.mod > 0 ? ' up' : ' dn')}>
                {c.mod > 0 ? '+' : ''}{c.mod}
              </span>
              <span className="rt-cond-w"><b>{c.from}</b> — {c.when}</span>
            </button>
          ))}
        </div>
      )}

      <button className="rt-rollbtn" onClick={() => onRoll(resolveTest(base, total, roll1d100()))}>
        Roll d100
      </button>

      {history.length > 0 && (
        <ul className="rt-rolllog">
          {history.map((r, i) => (
            <li key={r.id} className={'rt-rollr' + (r.success ? ' ok' : ' no') + (i === 0 ? ' last' : '')}>
              <b className="rt-rollr-d">{r.roll}</b>
              <span className="rt-rollr-v">vs {r.target}</span>
              <span className="rt-rollr-o">
                {r.success ? 'Success' : 'Failure'}
                {r.degrees > 0 && ` · ${r.degrees} ${r.success ? 'DoS' : 'DoF'}`}
                {r.automatic && ' · automatic'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------ CHARACTERISTIC SHEET ------------------------
   Parchment row sheet after the CRPG: code chip, full name, roll, total,
   modifier delta, bonus. onReroll is optional — the dossier renders the
   same sheet read-only rather than keeping a second copy of this markup. */

function StatSheet({ totals, mods, rolls, onReroll, picked }) {
  const [rollFor, setRollFor] = useState(null);  // characteristic key, or null
  const [log, setLog] = useState({});            // key -> most recent results

  const record = (k, result) => setLog((prev) => ({
    ...prev,
    [k]: [{ ...result, id: newId() }, ...(prev[k] || [])].slice(0, ROLL_LOG_MAX)
  }));

  return (
    <div className="rt-sheet rt-screen">
      <div className="rt-sheet-h">Characteristics</div>
      {CHAR_KEYS.map((k) => {
        const m = (mods && mods[k]) || 0;
        return (
          <React.Fragment key={k}>
          <div className="rt-row">
            <span className="rt-code" data-g={charGroup(k)}>{CHAR_SHORT[k]}</span>
            <span className="rt-cname">{CHAR_NAMES[k]}</span>
            {rolls && <span className="rt-croll">{rolls[k]}</span>}
            <span className="rt-cval">{totals[k]}</span>
            <span className={'rt-delta' + (m > 0 ? ' up' : m < 0 ? ' dn' : '')}>
              {m !== 0 && (m > 0 ? '▲+' : '▼') + m}
            </span>
            <span className="rt-cbon">{Math.floor(totals[k] / 10)}</span>
            <button className={'rt-dice' + (rollFor === k ? ' on' : '')}
              onClick={() => setRollFor(rollFor === k ? null : k)}
              aria-expanded={rollFor === k}
              aria-label={'Roll a ' + CHAR_NAMES[k] + ' test'} title="Roll a test">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
                strokeLinecap="round" strokeLinejoin="round">
                <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
                <circle cx="8.6" cy="8.6" r="1.35" fill="currentColor" stroke="none" />
                <circle cx="15.4" cy="15.4" r="1.35" fill="currentColor" stroke="none" />
                <circle cx="12" cy="12" r="1.35" fill="currentColor" stroke="none" />
              </svg>
            </button>
            {onReroll && (
              <button className="rt-reroll" onClick={() => onReroll(k)}
                aria-label={'Reroll ' + CHAR_NAMES[k]} title="Reroll">{'⟳'}</button>
            )}
          </div>
          {rollFor === k && (
            <TestRoller
              charName={CHAR_NAMES[k]}
              base={totals[k]}
              history={log[k] || []}
              onRoll={(r) => record(k, r)}
              conditionals={conditionalsFor(picked, k)}
            />
          )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ---------------------------- STEP PANE ---------------------------- */

const STEP_LEAD = {
  home: 'Where you were raised. This sets your first characteristic modifiers, your starting Wounds formula and how many Fate Points the Emperor is willing to spare you.',
  birthright: 'What you were doing before the void called. Most birthrights cost you something.',
  lure: 'Why you left. Nobody boards a Rogue Trader vessel without a reason worth the risk.',
  trials: 'What happened on the way. You survived it, which is the point.',
  motivation: 'What you are actually after, now that you are out here.',
  career: 'Your role aboard the ship. This decides your starting Skills, Talents and gear.'
};

function StepPane({ step, selected, choices, onSelect, onChoose, showIntro, name, setName, gender, setGender, onImport, xenosHome, onSkipToCareer }) {
  return (
    <div>
      {showIntro && (
        <div className="rt-intro">
          <input
            className="rt-field"
            placeholder="Name your character"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="rt-gender-row">
            {['Male', 'Female', 'Other'].map((g) => (
              <button
                key={g}
                className={'rt-gender-btn' + (gender === g ? ' active' : '')}
                onClick={() => setGender((prev) => (prev === g ? '' : g))}
              >{g}</button>
            ))}
          </div>
          <div className="rt-btnrow">
            <button className="rt-btn ghost" onClick={onImport}>Load character</button>
          </div>
        </div>
      )}
      {xenosHome && (
        <div className="rt-xenos-skip">
          <p>Aeldari characters skip this step.</p>
          <button className="rt-btn" onClick={onSkipToCareer}>Proceed to Career →</button>
        </div>
      )}
      {!xenosHome && <h2 className="rt-h2">{step.label}</h2>}
      {!xenosHome && <p className="rt-lead">{STEP_LEAD[step.id]}</p>}
      {!xenosHome && <div className="rt-cards rt-screen">
        {step.data.map((item) => (
          <OptionCard
            key={item.id}
            item={item}
            selected={selected === item.id}
            onSelect={() => onSelect(step.id, item.id)}
            choices={choices}
            onChoose={onChoose}
          />
        ))}
      </div>}
    </div>
  );
}

/* ----------------------- CHARACTERISTICS PANE ----------------------- */

function CharacteristicsPane({ rolls, totals, mods, rollAll, rerollOne, home, wounds, fatePoints,
  profitFactor, tBonus, picked, pointAlloc, onStartPoints, onSpendPoint, finalTotals }) {
  const remaining = pointAlloc ? pointsRemaining(pointAlloc) : POINT_POOL;
  return (
    <div>
      <h2 className="rt-h2">Characteristics</h2>
      <p className="rt-lead">
        {finalTotals
          ? 'These characteristics came from an imported sheet and already include Origin Path modifiers and advances, so nothing further is applied on top.'
          : pointAlloc
            ? `Every characteristic starts at ${POINT_BASE}. Distribute ${POINT_POOL} points across the nine, then your Origin Path modifiers are applied on top.`
            : 'Each characteristic is 2d10 + 25, then your Origin Path modifiers are applied on top. Reroll any single line if the dice have been unkind.'}
      </p>

      {!rolls && !finalTotals && (
        <>
          {!home && <p className="rt-empty" style={{ marginBottom: 12 }}>
            Pick a Home World first so Wounds and Fate Points can be worked out.
          </p>}
          <div className="rt-btnrow">
            <button className="rt-btn" onClick={rollAll}>Roll 2d10+25</button>
            <button className="rt-btn ghost" onClick={onStartPoints}>Spend {POINT_POOL} points</button>
          </div>
        </>
      )}

      {pointAlloc && totals && (
        <div className="rt-points">
          <div className="rt-pointsum">
            <span className={'rt-pointsleft' + (remaining === 0 ? ' done' : '')}>
              {remaining} of {POINT_POOL} points left
            </span>
            {isComplete(pointAlloc) && <span className="rt-psynote">Pool fully spent.</span>}
          </div>
          {CHAR_KEYS.map((k) => (
            <div className="rt-pointrow" key={k}>
              <span className="rt-code" data-g={charGroup(k)}>{CHAR_SHORT[k]}</span>
              <span className="rt-cname">{CHAR_NAMES[k]}</span>
              <span className="rt-pointbase">{POINT_BASE}</span>
              <span className="rt-pointadd">+{pointAlloc[k] || 0}</span>
              <button className="rt-adjb" onClick={() => onSpendPoint(k, -1)}
                disabled={!(pointAlloc[k] > 0)} aria-label={'Take a point back from ' + CHAR_NAMES[k]}>{'−'}</button>
              <button className="rt-adjb" onClick={() => onSpendPoint(k, 1)}
                disabled={!grantable(pointAlloc, k, 1)}
                aria-label={'Spend a point on ' + CHAR_NAMES[k]}>+</button>
              <span className="rt-cval">{totals[k]}</span>
            </div>
          ))}
        </div>
      )}

      {rolls && totals && (
        <>
          <StatSheet totals={totals} mods={mods} rolls={rolls} onReroll={rerollOne} picked={picked} />

          <div className="rt-derived">
            <div className="rt-der"><div className="rt-der-v">{wounds ?? '\u2014'}</div><div className="rt-der-k">WOUNDS</div></div>
            <div className="rt-der"><div className="rt-der-v">{fatePoints ?? '\u2014'}</div><div className="rt-der-k">FATE</div></div>
            <div className="rt-der"><div className="rt-der-v">{tBonus ?? '\u2014'}</div><div className="rt-der-k">T BONUS</div></div>
            <div className="rt-der"><div className="rt-der-v">{profitFactor}</div><div className="rt-der-k">PROFIT</div></div>
          </div>

          {home && (
            <p className="rt-lead" style={{ marginTop: 4 }}>
              {home.name}: Wounds are {home.woundText}. Profit Factor starts at 20 for a new dynasty and shifts
              with what your Origin Path brings to the table.
            </p>
          )}

          <button className="rt-btn ghost wide" onClick={rollAll}>Roll everything again</button>
        </>
      )}
    </div>
  );
}

/* ---------------------------- DOSSIER PANE ---------------------------- */

/* ---------------------------- PRINT DOSSIER ----------------------------
   Hidden on screen, the only thing visible when printing. Every section at
   once, because the screen sheet is tabbed and a plain window.print() would
   emit one tab. Interactive affordances are left out rather than styled away:
   nothing on paper can be stepped, rolled or removed.
   Takes the lists the dossier has already derived, so the two cannot disagree. */

function PrintSheet({ name, career, picked, totals, mods, ws, fate, profit, xp, rank,
  psyRating, skills, talents, traits, gear, powers, notes, advances, avatar }) {
  // A characteristic bonus is its tens digit, and every test at the table needs
  // it, so it is printed rather than left to be worked out.
  const bonus = (v) => (typeof v === 'number' ? Math.floor(v / 10) : '—');

  const Section = ({ title, items, cols = 2, empty }) => (
    <section className="rt-pr-sect">
      <h2>{title}{items.length ? ` (${items.length})` : ''}</h2>
      {items.length
        ? <div className={'rt-pr-cols' + (cols === 3 ? ' three' : '')}>
          <ul className="rt-pr-list">
            {items.map((v, i) => <li key={i}>{v}</li>)}
          </ul>
        </div>
        : <p className="rt-pr-none">{empty}</p>}
    </section>
  );

  return (
    <div className="rt-print">
      <header className="rt-pr-head">
        {avatar && avatar.src && (
          <img className="rt-pr-portrait" src={avatar.src} alt=""
            style={framingStyle(avatar.framing)} />
        )}
        <div className="rt-pr-id">
          <h1>{name || 'Unnamed adept'}</h1>
          <p className="rt-pr-sub">
            {career ? career.name : 'No career'}
            {picked.home ? ' · ' + picked.home.name : ''}
            {' · Rank '}{romanRank(rank)}
            {' · '}{xp.toLocaleString()} XP
          </p>
          <dl className="rt-pr-stamps">
            <div>
              <dt>Wounds</dt>
              <dd>{ws ? ws.max : '—'}</dd>
            </div>
            <div><dt>Fate</dt><dd>{fate ?? '—'}</dd></div>
            <div><dt>Profit</dt><dd>{profit}</dd></div>
            {totals && <div><dt>T Bonus</dt><dd>{bonus(totals.t)}</dd></div>}
            {psyRating > 0 && <div><dt>Psy Rating</dt><dd>{psyRating}</dd></div>}
          </dl>
          {ws && (
            <div className="rt-pr-boxes" aria-hidden="true">
              {Array.from({ length: ws.max }, (_, i) => (
                <span key={i} className={'rt-pr-box' + (i < ws.taken ? ' taken' : '')} />
              ))}
            </div>
          )}
        </div>
      </header>

      {/* glass rather than parchment: the stat panel reads as the cogitator
          screen it is on the dossier */}
      <section className="rt-pr-sect rt-pr-dark">
        <h2>Characteristics</h2>
        <table className="rt-pr-chars">
          <thead>
            <tr>
              <th>Characteristic</th><th>Value</th><th>Bonus</th><th>In play</th>
            </tr>
          </thead>
          <tbody>
            {CHAR_KEYS.map((k) => (
              <tr key={k}>
                <td>{CHAR_NAMES[k]} ({CHAR_SHORT[k]})</td>
                <td className="n">{totals ? totals[k] : '—'}</td>
                <td className="n">{totals ? bonus(totals[k]) : '—'}</td>
                {/* left blank on purpose: modifiers change per test */}
                <td className="blank" />
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rt-pr-sect">
        <h2>Origin path</h2>
        <dl className="rt-pr-kv">
          {STEPS.map((s) => picked[s.id] && (
            <React.Fragment key={s.id}>
              <dt>{s.label}</dt>
              <dd>{picked[s.id].name}</dd>
            </React.Fragment>
          ))}
        </dl>
      </section>

      <Section title="Skills" items={skills} cols={3}
        empty="No skills recorded." />
      <Section title="Talents" items={talents}
        empty="No talents recorded." />
      <Section title="Traits" items={traits}
        empty="No traits from this origin path." />
      <Section title="Gear" items={gear}
        empty="No equipment recorded." />
      {psyRating > 0 && (
        <Section title="Psychic powers" items={powers.map(describePower)}
          empty="No powers recorded." />
      )}
      <Section title="Advances taken"
        items={advances.map((a) => `${a.name} — ${a.type}, ${a.cost} XP`)}
        empty="No advances purchased." />
      <Section title="Notes" items={notes} cols={1}
        empty="No notes." />

      <div className="rt-pr-foot">
        <span>Rogue Trader {'·'} Koronus Expanse</span>
        <span>{new Date().toLocaleDateString()}</span>
      </div>
    </div>
  );
}

const DOSSIER_TABS = [
  { id: 'origin', label: 'Origin' },
  { id: 'skills', label: 'Skills' },
  { id: 'talents', label: 'Talents' },
  { id: 'traits', label: 'Traits' },
  { id: 'gear', label: 'Gear' },
  { id: 'powers', label: 'Powers' },
  { id: 'advances', label: 'Advances' },
  { id: 'notes', label: 'Notes' }
];

const ADD_SOURCES = {
  skills:  { title: 'Add a skill',    options: Object.keys(SKILLS) },
  talents: { title: 'Add a talent',   options: Object.keys(TALENTS) },
  traits:  { title: 'Add a trait',    options: [] },
  gear:    { title: 'Add equipment',  options: Object.keys(GEAR) },
  powers:  { title: 'Add a psychic power', options: ALL_TECHNIQUES },
  notes:   { title: 'Add a note',     options: [] }
};

function DossierPane({ name, gender, background, setBackground, build, totals, ws, onDamage, onAdjustMax, fatePoints, profitFactor,
  avatar, setAvatar, extras, onAddExtra, onRemoveExtra,
  psyRating, onPsyRating, xp, onXp, onBuyAdvance, onRefundAdvance,
  onBuyCharAdvance, onRefundCharAdvance, onAddEliteAdvance, onRemoveEliteAdvance,
  onFate, onProfit, spentAdj = 0, onSpentAdj }) {
  const [tab, setTab] = useState('skills');
  const [adding, setAdding] = useState(null);
  const [addingElite, setAddingElite] = useState(false);
  const career = build.picked.career;
  // Navigators buy Warp Eye Powers (Lidless Stare, Seek the Path, etc.) as
  // Power-type advances, but they are not sanctioned psykers and never touch
  // Psy Rating — the Navis Primer's third eye is a wholly separate mechanic.
  // Gating their own powers behind "raise your Psy Rating" would just hide
  // them, so the Powers tab treats this career as an exception below.
  const isNavigator = career?.id === 'navigator';
  const pickedName = (id) => (build.picked[id] ? build.picked[id].name : '');
  // STEPS includes career, so build already folded its skills/talents/traits in
  // (and deduped them). Concatenating career.* again is what duplicated every
  // entry in these lists.
  // Purchased advances land in whichever list matches their type, so the sheet
  // reads as one thing rather than making you cross-reference the Advances tab.
  const ofType = (...types) =>
    extras.advances.filter((a) => types.includes(a.type)).map((a) => a.name);
  const advSkills = ofType('Skill');
  const advTalents = ofType('Talent');
  const advPowers = ofType('Technique', 'Power');

  // Elite Advances: a GM-approved Skill/Talent/Trait off the career's own
  // table, priced by the GM rather than looked up — see addEliteAdvance.
  const ofEliteType = (...types) =>
    extras.eliteAdvances.filter((a) => types.includes(a.type)).map((a) => a.name);
  const eliteSkills = ofEliteType('Skill');
  const eliteTalents = ofEliteType('Talent');
  const eliteTraits = ofEliteType('Trait');
  const eliteSpent = extras.eliteAdvances.reduce((n, a) => n + (a.cost || 0), 0);

  const charRank = rankForXp(xp);
  const careerAdvances = allAdvances(career ? career.name : '');
  // Each characteristic's tier (and so cost) depends on the career, so a sold
  // or swapped career re-prices whatever was already bought rather than
  // grandfathering the old cost in.
  const charAdvSpent = CHAR_KEYS.reduce((n, k) => {
    const tier = career ? tierFor(career.name, k) : null;
    const count = extras.charAdvances[k] || 0;
    return n + (tier ? cumulativeAdvanceCost(tier, count) || 0 : 0);
  }, 0);
  const spentXp = extras.advances.reduce((n, a) => n + (a.cost || 0), 0)
    + charAdvSpent + eliteSpent + spentAdj;
  const remaining = remainingXp(xp, spentXp);

  // origin-path entries first, then free additions, then purchased advances,
  // then GM-approved Elite Advances
  const allSkills = [...build.skills, ...extras.skills, ...advSkills, ...eliteSkills];
  const allTalents = [...build.talents, ...extras.talents, ...advTalents, ...eliteTalents];
  const allTraits = [...build.traits, ...extras.traits, ...eliteTraits];
  const allPowers = [...extras.powers, ...advPowers];
  const allNotes = [...build.notes, ...extras.notes];
  const allGear = [
    ...(career ? parseGear(career.gear).flat().filter((l) => !extras.gearDropped.includes(l)) : []),
    ...extras.gear
  ];
  const gearCount = allGear.length;

  const listFor = (kind) => ({
    skills: allSkills, talents: allTalents, traits: allTraits,
    gear: extras.gear, powers: allPowers, notes: allNotes
  }[kind] || []);

  const counts = {
    origin: STEPS.filter((s) => build.picked[s.id]).length,
    skills: allSkills.length,
    talents: allTalents.length,
    traits: allTraits.length,
    gear: gearCount,
    powers: allPowers.length,
    advances: extras.advances.length,
    notes: allNotes.length
  };

  // Shared by the portrait generator (lib/prompt.js, an image prompt) and the
  // background placeholder below (src/lore.js, prose) — same origin path, two
  // different renderings of it.
  const identity = {
    name,
    gender,
    homeWorld: pickedName('home'),
    birthright: pickedName('birthright'),
    lure: pickedName('lure'),
    trials: pickedName('trials'),
    motivation: pickedName('motivation'),
    career: pickedName('career'),
    gear: allGear,
    concept: (allNotes.find((n) => /^(Concept|Role in crew):/.test(n)) || '')
      .replace(/^[^:]+:\s*/, '')
  };
  // Blank means "still following the origin path" — the moment the player
  // types anything, that text sticks even if the origin path changes later.
  const bio = background || buildLore(identity);

  return (
    <div className="rt-dossier">
      <div className="rt-idcard">
        <PortraitPlate name={name} profitFactor={profitFactor}
          avatar={avatar} setAvatar={setAvatar}
          /* The whole origin path goes to the portrait generator, which turns
             each choice into art direction — see lib/prompt.js. Imported sheets
             keep Concept and Role in crew as notes; either gives it more. */
          identity={identity} />
        <div className="rt-idtext">
          <h2 className="rt-h2">{name || 'Unnamed adept'}</h2>
          <p className="rt-lead">
            {career ? career.name : 'No career chosen'}
            {build.picked.home ? ' \u00B7 ' + build.picked.home.name : ''}
            {gender ? ' \u00B7 ' + gender : ''}
          </p>
          {/* The wounds bar used to run the full width with the gauges in a
              separate row below it. One strip, no dead space. */}
          <div className="rt-idstats">
            <div className={'rt-wgauge' + (ws && ws.down ? ' down' : ws && ws.current / ws.max <= 0.34 ? ' low' : '')}>
              <div className="rt-whead">
                <span className="rt-der-k">{ws && ws.down ? 'DOWN' : 'WOUNDS'}</span>
                <span className="rt-wmax">
                  <button className="rt-wmaxb" onClick={() => onAdjustMax(-1)}
                    disabled={!ws} aria-label="Lower maximum wounds">{'\u2212'}</button>
                  MAX
                  <button className="rt-wmaxb" onClick={() => onAdjustMax(1)}
                    disabled={!ws} aria-label="Raise maximum wounds">+</button>
                </span>
              </div>
              <div className="rt-wrow">
                <button className="rt-wbtn" onClick={() => onDamage(1)}
                  disabled={!ws || ws.down} aria-label="Take one wound">{'\u2212'}</button>
                <div className="rt-wbar">
                  <span style={{ width: ws ? (ws.current / ws.max) * 100 + '%' : '0%' }} />
                  <b>{ws ? ws.current + ' / ' + ws.max : '\u2014'}</b>
                </div>
                <button className="rt-wbtn" onClick={() => onDamage(-1)}
                  disabled={!ws || ws.taken === 0} aria-label="Heal one wound">+</button>
              </div>
            </div>
            <div className="rt-der">
              <div className="rt-der-k top">FATE</div>
              <div className="rt-der-v">{fatePoints ?? '\u2014'}</div>
              <div className="rt-adjrow">
                <button className="rt-adjb" onClick={() => onFate(-1)}
                  disabled={fatePoints == null || fatePoints <= 0}
                  aria-label="Spend a Fate Point">{'\u2212'}</button>
                <button className="rt-adjb" onClick={() => onFate(1)}
                  disabled={fatePoints == null} aria-label="Regain a Fate Point">+</button>
              </div>
            </div>
            <div className="rt-der">
              <div className="rt-der-k top">PROFIT</div>
              <div className="rt-der-v">{profitFactor}</div>
              <div className="rt-adjrow">
                <button className="rt-adjb" onClick={() => onProfit(-1)}
                  disabled={profitFactor <= 0} aria-label="Lower Profit Factor">{'\u2212'}</button>
                <button className="rt-adjb" onClick={() => onProfit(1)}
                  aria-label="Raise Profit Factor">+</button>
              </div>
            </div>
            <div className="rt-der">
              <div className="rt-der-k top">TALENTS</div>
              <div className="rt-der-v">{allTalents.length}</div>
            </div>
            {/* XP is a running campaign total, so it gets steppers rather than
                a field you have to select and retype. */}
            <div className="rt-xpgauge">
              <div className="rt-whead">
                <span className="rt-der-k" title={xpToNextRank(xp) != null
                  ? xpToNextRank(xp).toLocaleString() + ' XP to Rank ' + romanRank(charRank + 1)
                  : 'Rank VIII — no further thresholds'}>
                  RANK {romanRank(charRank)}
                  {xpToNextRank(xp) != null && (
                    <span className="rt-nextrank"> · {xpToNextRank(xp).toLocaleString()} to {romanRank(charRank + 1)}</span>
                  )}
                </span>
                <span className={'rt-xpleft' + (remaining < 0 ? ' over' : '')}>
                  {remaining < 0
                    ? (-remaining).toLocaleString() + ' OVER'
                    : remaining.toLocaleString() + ' LEFT'}
                </span>
              </div>
              <div className="rt-wrow">
                <button className="rt-wbtn" disabled={xp <= 0}
                  onClick={() => onXp(Math.max(0, xp - 100))}
                  aria-label="Remove 100 XP">{'−'}</button>
                <input className="rt-xpin" type="number" min="0" step="100" value={xp}
                  onChange={(e) => onXp(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  aria-label="Experience points"
                  title={isStartingBudget(xp)
                    ? 'Within the 4,500-5,000 XP starting allowance'
                    : (xpToNextRank(xp) != null
                      ? xpToNextRank(xp).toLocaleString() + ' XP to the next rank'
                      : 'Rank 8 — no further thresholds')} />
                <button className="rt-wbtn" onClick={() => onXp(xp + 100)}
                  aria-label="Award 100 XP">+</button>
              </div>
            </div>
            {psyRating > 0 && (
              /* its own full-width row, so every row of the strip lines up */
              <div className="rt-der wide">
                <div className="rt-der-k top">PSY RATING</div>
                <div className="rt-der-v">{psyRating}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Auto-drafted from the origin path (src/lore.js) the same way the
          portrait prompt is, but in prose rather than art direction. Typing
          here overrides the draft for good; clearing it back to empty hands
          drafting back to the origin path. */}
      <div className="rt-lore">
        <div className="rt-lore-h">
          <span className="rt-lore-l">BACKGROUND</span>
          {background && (
            <button className="rt-lore-regen" onClick={() => setBackground('')}
              title="Discard your edits and redraft from the origin path">
              Redraft from origin path
            </button>
          )}
        </div>
        <textarea
          className="rt-lore-ta"
          value={bio}
          onChange={(e) => setBackground(e.target.value)}
          placeholder="A drafted background will appear here once an origin path is chosen."
          aria-label="Character background"
        />
      </div>

      {totals && (
        <StatSheet totals={totals} mods={build.mods} picked={build.picked} />
      )}

      {/* Tabbed lower panel, after the CRPG sheet: one parchment panel with
          raised cartouche tabs, rather than six stacked sections. */}
      <div className="rt-dtabs" role="tablist">
        {DOSSIER_TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={'rt-dtab' + (tab === t.id ? ' on' : '')}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            <span className="rt-dtab-n">{counts[t.id]}</span>
          </button>
        ))}
      </div>

      <div className="rt-sect rt-dpanel" role="tabpanel">
        {tab === 'origin' && (
          STEPS.every((s) => !build.picked[s.id])
            ? <p className="rt-empty">Nothing chosen yet. Start at Home World.</p>
            : <ul className="rt-list rt-2col">
              {STEPS.map((s) => build.picked[s.id] && (
                <li key={s.id} className="rt-entry">
                  <span className="rt-origin-k">{s.label}</span>
                  <span className="rt-entry-t">{build.picked[s.id].name}</span>
                </li>
              ))}
            </ul>
        )}

        {tab === 'skills' && (
          allSkills.length
            ? <ul className="rt-list rt-2col">
              {allSkills.map((v, i) => (
                <Entry key={i} text={v}
                  onRemove={extras.skills.includes(v) ? () => onRemoveExtra('skills', v) : undefined} />
              ))}
            </ul>
            : <p className="rt-empty">Choose a career, or add skills gained in play.</p>
        )}

        {tab === 'talents' && (
          allTalents.length
            ? <ul className="rt-list rt-2col">
              {allTalents.map((v, i) => (
                <Entry key={i} text={v}
                  onRemove={extras.talents.includes(v) ? () => onRemoveExtra('talents', v) : undefined} />
              ))}
            </ul>
            : <p className="rt-empty">Nothing yet. Advances go here as you take them.</p>
        )}

        {tab === 'traits' && (
          allTraits.length
            ? <ul className="rt-list">
              {allTraits.map((v, i) => (
                <Entry key={i} text={v}
                  onRemove={extras.traits.includes(v) ? () => onRemoveExtra('traits', v) : undefined} />
              ))}
            </ul>
            : <p className="rt-empty">No traits or quirks from this origin path.</p>
        )}

        {tab === 'gear' && (
          career || extras.gear.length
            ? <GearList gear={career ? career.gear : ''} extra={extras.gear}
                hidden={extras.gearDropped}
                onRemove={(v) => onRemoveExtra('gear', v)}
                onDrop={(v) => onAddExtra('gearDropped', v)} />
            : <p className="rt-empty">Choose a career to be issued equipment, or add your own.</p>
        )}

        {tab === 'powers' && (
          <div className="rt-powers">
            {isNavigator ? (
              <div className="rt-psyrow">
                <span className="rt-origin-k">Warp Eye</span>
                <span className="rt-psynote">
                  Not a sanctioned psyker — the third eye works outside the Psy Rating system.
                </span>
              </div>
            ) : (
              <div className="rt-psyrow">
                <span className="rt-origin-k">Psy Rating</span>
                <button className="rt-wmaxb" disabled={psyRating <= 0}
                  onClick={() => onPsyRating(Math.max(0, psyRating - 1))}
                  aria-label="Lower Psy Rating">{'−'}</button>
                <b className="rt-psyval">{psyRating}</b>
                <button className="rt-wmaxb" onClick={() => onPsyRating(psyRating + 1)}
                  aria-label="Raise Psy Rating">+</button>
                {psyRating > 0 && (
                  <span className="rt-psynote">
                    {disciplineSlots(psyRating)} discipline{disciplineSlots(psyRating) > 1 ? 's' : ''}
                    {' · '}Thought Sending {thoughtSendingKm(psyRating)} km
                  </span>
                )}
              </div>
            )}

            {!isNavigator && psyRating > 0 && psyRatingInfo(psyRating) && (
              <div className="rt-entry-d">
                <p>{psyRatingInfo(psyRating).effect}</p>
                <p className="rt-entry-s">{psyRatingInfo(psyRating).risk}</p>
              </div>
            )}

            {psyRating <= 0 && !isNavigator
              ? <p className="rt-empty">Not a psyker. Raise the Psy Rating to record disciplines and powers.</p>
              : allPowers.length
                ? <ul className="rt-list rt-2col">
                  {allPowers.map((p, i) => (
                    <Entry key={i} text={describePower(p)}
                      /* advance-bought powers are refunded from the Advances
                         tab, so only hand-added ones get a remove button */
                      onRemove={extras.powers.includes(p)
                        ? () => onRemoveExtra('powers', p) : undefined} />
                  ))}
                </ul>
                : <p className="rt-empty">
                  {isNavigator ? 'No Warp Eye Powers purchased yet.' : 'No powers recorded yet.'}
                </p>}

            {!isNavigator && psyRating > 0 && (
              <div className="rt-discs">
                <div className="rt-sect-h">Disciplines</div>
                <ul className="rt-list rt-2col">
                  {DISCIPLINES.map((d) => (
                    <Entry key={d.id} text={`${d.name}: ${d.focus} Basic Technique — ${d.basic}: ${d.basicEffect}`} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {tab === 'advances' && (
          careerAdvances ? (
            <div className="rt-advances">
              <p className="rt-advsum">
                <b>{spentXp.toLocaleString()}</b> spent of {spendableXp(xp).toLocaleString()} spendable
                {' · '}
                <span className={remaining < 0 ? 'rt-over' : ''}>
                  {remaining < 0
                    ? (-remaining).toLocaleString() + ' over budget'
                    : remaining.toLocaleString() + ' remaining'}
                </span>
                {' · Rank '}{romanRank(charRank)}
              </p>

              <div className="rt-psyrow">
                <span className="rt-origin-k">Spent before this sheet</span>
                <button className="rt-wmaxb" disabled={spentAdj <= 0}
                  onClick={() => onSpentAdj(-50)} aria-label="Reduce XP already spent">{'−'}</button>
                <b className="rt-psyval">{spentAdj.toLocaleString()}</b>
                <button className="rt-wmaxb" onClick={() => onSpentAdj(50)}
                  aria-label="Increase XP already spent">+</button>
                <span className="rt-psynote">
                  XP spent at creation or outside the app. A starting Explorer who
                  already used their allowance records 500 here, leaving nothing.
                </span>
              </div>

              <div className="rt-advrank">
                <div className="rt-sect-h">Characteristic Advances</div>
                <ul className="rt-advlist">
                  {CHAR_KEYS.map((k) => {
                    const tier = tierFor(career.name, k);
                    if (!tier) return null;
                    const count = extras.charAdvances[k] || 0;
                    const maxed = count >= ADVANCE_LEVELS.length;
                    const nextCost = maxed ? null : advanceCost(tier, ADVANCE_LEVELS[count]);
                    const unaffordable = !maxed && nextCost > remaining;
                    return (
                      <li key={k} className={'rt-adv' + (count > 0 ? ' owned' : '') + (unaffordable ? ' blocked' : '')}>
                        <span className="rt-adv-n">{CHAR_NAMES[k]}</span>
                        <span className="rt-entry-c" data-g={charGroup(k)}>{tier}</span>
                        <span className="rt-adv-c">+{count * ADVANCE_STEP}</span>
                        <button className="rt-wmaxb" disabled={count <= 0}
                          onClick={() => onRefundCharAdvance(k)}
                          aria-label={'Refund a ' + CHAR_NAMES[k] + ' advance'}>{'−'}</button>
                        <button className="rt-adv-b" disabled={maxed || unaffordable}
                          onClick={() => onBuyCharAdvance(k)}>
                          {maxed ? 'Maxed' : `+5 (${nextCost})`}
                        </button>
                        {unaffordable && <span className="rt-adv-p">Not enough XP</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="rt-advrank">
                <div className="rt-sect-h">Elite Advances (GM-Approved)</div>
                {extras.eliteAdvances.length
                  ? <ul className="rt-advlist">
                    {extras.eliteAdvances.map((a) => (
                      <li key={a.name} className="rt-adv owned">
                        <span className="rt-adv-n">{a.name}</span>
                        <span className="rt-entry-c">{a.type}</span>
                        <span className="rt-adv-c">{a.cost}</span>
                        <button className="rt-adv-b" onClick={() => onRemoveEliteAdvance(a.name)}>
                          Refund
                        </button>
                      </li>
                    ))}
                  </ul>
                  : <p className="rt-empty">
                    Nothing off-table yet. A GM-approved Skill, Talent or Trait costs whatever the GM sets.
                  </p>}
                <button className="rt-addbtn" onClick={() => setAddingElite(true)}>
                  + Add an Elite Advance
                </button>
              </div>

              {Array.from({ length: MAX_TABLED_RANK }, (_, i) => i + 1).map((r) => {
                const rows = careerAdvances.filter((a) => a.rank === r);
                if (!rows.length) return null;
                const rankLocked = r > charRank;
                return (
                  <div key={r} className={'rt-advrank' + (rankLocked ? ' locked' : '')}>
                    <div className="rt-sect-h">
                      Rank {romanRank(r)}{rankLocked ? ' — not yet reached' : ''}
                    </div>
                    <ul className="rt-advlist">
                      {rows.map((a) => {
                        const st = advanceStatus(a, {
                          rank: charRank, remaining, totals, owned: extras.advances
                        });
                        const why = st.owned ? null
                          : st.lockedByRank ? `Rank ${romanRank(a.rank)} required`
                            : st.unmetChars.length
                              ? 'Needs ' + st.unmetChars.map((c) => c.key.toUpperCase() + ' ' + c.min).join(', ')
                              : st.unaffordable ? 'Not enough XP' : null;
                        return (
                          <li key={a.name}
                            className={'rt-adv' + (st.owned ? ' owned' : '') + (st.blocked ? ' blocked' : '')}>
                            <span className="rt-adv-n">{a.name}</span>
                            <span className="rt-entry-c">{a.type}</span>
                            <span className="rt-adv-c">{a.cost}</span>
                            <button className="rt-adv-b" disabled={st.blocked}
                              onClick={() => (st.owned ? onRefundAdvance(a.name) : onBuyAdvance(a))}>
                              {st.owned ? 'Refund' : 'Buy'}
                            </button>
                            {(why || st.namedPrereqs.length > 0) && (
                              <span className="rt-adv-p">
                                {why || 'Requires ' + st.namedPrereqs.join(', ')}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="rt-empty">
              {career
                ? 'No advance table for this career. The eight core careers are covered; alternate and xenos paths are not.'
                : 'Choose a career to see its advance tables.'}
            </p>
          )
        )}

        {tab === 'notes' && (
          allNotes.length
            ? <ul className="rt-list">
              {allNotes.map((v, i) => (
                <li key={i} className="rt-entry">
                  <span className="rt-entry-t">{v}</span>
                  {extras.notes.includes(v) && (
                    <RemoveBtn label={v} onRemove={() => onRemoveExtra('notes', v)} />
                  )}
                </li>
              ))}
            </ul>
            : <p className="rt-empty">Nothing outstanding. Everything resolved on the sheet.</p>
        )}

        {ADD_SOURCES[tab] && (
          <button className="rt-addbtn" onClick={() => setAdding(tab)}>
            + {ADD_SOURCES[tab].title}
          </button>
        )}
      </div>

      {adding && (
        <AddDialog
          title={ADD_SOURCES[adding].title}
          options={ADD_SOURCES[adding].options}
          existing={listFor(adding)}
          onAdd={(v) => onAddExtra(adding, v)}
          onClose={() => setAdding(null)}
        />
      )}

      {addingElite && (
        <EliteAdvanceDialog
          onAdd={onAddEliteAdvance}
          onClose={() => setAddingElite(false)}
        />
      )}

      {/* Last child of .rt-dossier on purpose: the print rule hides every
          sibling, so anything added after this would print too. */}
      <PrintSheet
        name={name} career={career} picked={build.picked}
        totals={totals} mods={build.mods} ws={ws}
        fate={fatePoints} profit={profitFactor} xp={xp} rank={charRank}
        psyRating={psyRating} avatar={avatar}
        skills={allSkills} talents={allTalents} traits={allTraits}
        gear={allGear} powers={allPowers} notes={allNotes}
        advances={[...extras.advances, ...extras.eliteAdvances]}
      />
    </div>
  );
}

/* ----------------------------- VOX PANEL ----------------------------- */

const QUICK_LINES = [
  'Praise the Omnissiah. The flesh is weak.',
  'Machine spirit appeased. Systems nominal.',
  'Archeotech signature detected. Do not touch it.',
  'Warp anomaly. All hands, brace.',
  'Your request is noted and denied.'
];

/* ---------------------------- VOIDSHIP PANEL ----------------------------
   The blueprint editor. Hull first, because the hull decides how much Space
   there is and which mounts exist — picking weapons before a hull would mean
   validating against nothing.

   All three budgets are shown at all times and go red the moment they go
   negative, which is the one thing the rules text asks for explicitly: an
   illegal ship should be visibly illegal while you are building it, not on a
   submit. Nothing here blocks an over-budget blueprint — a GM may well allow
   one — but validate() lists every reason it is illegal. */

/* ------------------------------- THE BRIDGE -------------------------------
   Create a table as GM, or join one with the code. Once connected, the shared
   ship is polled and shown live: this is the panel that proves the loop, since
   a GM's event lands on every other screen within one poll.

   The GM pushes their blueprint and running battle up; players read. Writing
   from a station goes through the same patch call, which the server checks
   against the station's fields. */

function BridgePanel({ code, setCode, characterName, charId, shipRole,
  blueprint, fleet, combat, roster, card, onClose }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) el.showModal();
  }, []);
  const close = () => dialogRef.current && dialogRef.current.close();

  const [state, setState] = useState(null);
  const [err, setErr] = useState('');
  // The poll's own trouble, kept apart from an action's. A good poll used to
  // clear `err`, which meant a refused order vanished from the screen within
  // five seconds — the player saw nothing and assumed it had worked.
  const [linkErr, setLinkErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [entry, setEntry] = useState('');
  const [dynastyName, setDynastyName] = useState('');
  const [skill, setSkill] = useState(40);
  const [aimed, setAimed] = useState('');
  const [tab, setTab] = useState('bridge');
  const [msgTo, setMsgTo] = useState('');
  const [msgText, setMsgText] = useState('');
  const revRef = useRef(0);

  // The poll reads the rev through a ref so changing it does not restart the
  // loop — a new interval on every answer would defeat the point of polling.
  useEffect(() => {
    if (!code) return undefined;
    setLinkErr('');
    return pollBridge({
      code,
      getRev: () => revRef.current,
      onState: (s) => {
        if (s.ship) revRef.current = Number(s.ship.rev) || 0;
        setState(s);
        setLinkErr('');
      },
      onError: (e) => setLinkErr(e.message)
    });
  }, [code]);

  const run = async (fn, ok) => {
    setBusy(true); setErr(''); setNote('');
    try {
      const r = await fn();
      if (ok) setNote(ok);
      return r;
    } catch (e) {
      setErr(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const create = () => run(async () => {
    const r = await createDynasty(dynastyName || 'An unnamed dynasty');
    revRef.current = Number(r.ship?.rev) || 0;
    setState(r);
    setCode(r.dynasty.code);
    return r;
  }, 'Table created. Read the code out to your players.');

  const join = () => run(async () => {
    const r = await joinBridge({
      code: entry.trim().toUpperCase(),
      charId, name: characterName, role: shipRole,
      // Published by its owner: the GM has no way to read the sheet.
      card
    });
    revRef.current = Number(r.ship?.rev) || 0;
    setState(r);
    setCode(r.dynasty.code);
    return r;
  }, 'Joined.');

  const leave = () => run(async () => {
    await leaveBridge(code);
    setState(null);
    setCode('');
  }, 'Left the table.');

  // The GM's copy is authoritative for the ship as built and the battle in
  // progress, so pushing is one call rather than a merge.
  const push = () => run(async () => {
    const r = await writeBridge({
      code,
      doc: { blueprint, fleet, combat },
      vitals: combat.playerVitals || newVitals(blueprint),
      log: 'The GM updated the bridge.'
    });
    revRef.current = Number(r.rev) || revRef.current;
    return r;
  }, 'Pushed to the bridge.');

  // Take one of your station's extended actions: roll, work out what it
  // writes, and send that. The server checks the fields against the station
  // again — this call only decides what to ask for.
  const act = (action) => run(async () => {
    const roll = roll1d100();
    const test = resolveTest(skill, 0, roll);
    if (!test.success) {
      await writeBridge({ code, vitals: {},
        log: `${action.name}: failed on ${roll} against ${skill}.` })
        .catch(() => null);
      setNote(`${action.name}: failed — rolled ${roll} against ${skill}.`);
      return null;
    }
    const outcome = actionOutcome(action.id, test.degrees, ship, {
      targetId: aimed || undefined,
      maxHull: hullById(blueprint.hullId)?.hullIntegrity
    });
    if (outcome.needsTarget) {
      setErr(`${action.name} needs a target. Pick one under "Aimed at".`);
      return null;
    }
    if (!outcome.vitals) {
      setErr(`${action.name} has no effect to apply.`);
      return null;
    }
    const r = await writeBridge({
      code, vitals: outcome.vitals,
      log: `${outcome.log} (rolled ${roll} against ${skill}).`
    });
    revRef.current = Number(r.rev) || revRef.current;
    setNote(outcome.log);
    return r;
  });

  // A GM seats characters from their own roster, one station each. Player
  // seats are one per account; these are one per character, so several from
  // the GM's roster can be aboard at once — and the rest of the roster stays
  // off this bridge.
  const seat = (c, role) => run(async () => {
    const r = await assignNpc({ code, charId: c.id, name: c.name, role });
    setState((prev) => ({ ...(prev || null), dynasty: r.dynasty }));
    return r;
  }, `${c.name} took a station.`);

  const unseat = (c) => run(async () => {
    const r = await unassignNpc({ code, charId: c.id });
    setState((prev) => ({ ...(prev || null), dynasty: r.dynasty }));
    return r;
  }, `${c.name} stood down.`);

  const whisper = () => run(async () => {
    const r = await sendMessage({ code, to: msgTo, text: msgText });
    revRef.current = Number(r.rev) || revRef.current;
    setMsgText('');
    return r;
  }, 'Sent, to that character alone.');

  const isGmHere = Boolean(state && state.isGm);
  const ship = state && state.ship;
  const dynasty = state && state.dynasty;

  return (
    <dialog ref={dialogRef} className="rt-framer rt-ship" onClose={onClose}
      aria-label="The bridge">
      <div className="rt-framer-h">
        <span className="rt-framer-t">The bridge</span>
        <button className="rt-close" onClick={close} aria-label="Close">&times;</button>
      </div>

      {err && <div className="rt-warn"><p>{err}</p></div>}
      {linkErr && <div className="rt-warn"><p>{linkErr}</p></div>}
      {note && <div className="rt-note">{note}</div>}

      {!code ? (
        <>
          <p className="rt-vox-hint">
            One table has one ship and one GM: whoever creates it. Everyone else
            joins with the code and takes a station.
          </p>

          <div className="rt-conds-h">Join a table</div>
          <div className="rt-shiprow">
            <label className="rt-shipfield">
              <span className="rt-der-k">Code</span>
              <input className="rt-field" value={entry} maxLength={8}
                onChange={(e) => setEntry(e.target.value.toUpperCase())}
                placeholder="AB3K9P" />
            </label>
            <button className="rt-btn" disabled={busy || entry.trim().length < 6}
              onClick={join}>Join</button>
          </div>
          {!shipRole && (
            <p className="rt-vox-hint">
              You have no station yet {'—'} pick one under SHIP and your
              terminal will know what you may change.
            </p>
          )}

          <div className="rt-conds-h">Or run one as GM</div>
          <div className="rt-shiprow">
            <label className="rt-shipfield">
              <span className="rt-der-k">Dynasty name</span>
              <input className="rt-field" value={dynastyName}
                onChange={(e) => setDynastyName(e.target.value)}
                placeholder="The Ma’Kao Dynasty" />
            </label>
            <button className="rt-btn ghost" disabled={busy} onClick={create}>Create</button>
          </div>
        </>
      ) : (
        <>
          {isGmHere && (
            <div className="rt-dtabs" role="tablist">
              {[['bridge', 'Bridge'], ['crew', 'Crew']].map(([id, label]) => (
                <button key={id} role="tab" aria-selected={tab === id}
                  className={'rt-dtab' + (tab === id ? ' on' : '')}
                  onClick={() => setTab(id)}>
                  {label}
                  {id === 'crew' && (
                    <span className="rt-dtab-n">
                      {((dynasty && dynasty.members) || []).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="rt-gmturn">
            <span className="rt-der-k">Code</span>
            <b className="rt-gmphase rt-bridgecode">{code}</b>
            <span className="rt-der-k">{isGmHere ? 'You are the GM' : 'Crew'}</span>
            {isGmHere && (
              <button className="rt-opt" disabled={busy} onClick={push}>Push my ship</button>
            )}
            {!isGmHere && (
              <button className="rt-opt" disabled={busy} onClick={leave}>Leave</button>
            )}
          </div>

          {!state && <p className="rt-vox-hint">Connecting{'…'}</p>}

          {dynasty && (
            <>
              <div className="rt-conds-h">{dynasty.name} {'·'} {(dynasty.members || []).length} aboard</div>
              <ul className="rt-list">
                {(dynasty.members || []).map((m, i) => {
                  const r = roleById(m.role);
                  return (
                    <li key={i} className="rt-entry">
                      <span className="rt-entry-t">
                        {m.name}{m.npc ? ' \u00B7 NPC' : ''}
                      </span>
                      <span className="rt-entry-c">{r ? r.name : 'no station'}</span>
                      {r && <div className="rt-entry-d"><p>{r.department}</p></div>}
                    </li>
                  );
                })}
                {(dynasty.members || []).length === 0 && (
                  <li className="rt-entry"><span className="rt-entry-t">
                    Nobody has joined yet.
                  </span></li>
                )}
              </ul>
            </>
          )}

          {/* ---- the GM's crew reference ----
              Every character aboard, with the Secret and Favour the sheet
              volunteered, and a private word to one of them. Cards arrive
              GM-only: redactDynasty strips them for everyone else, so this
              view has no player equivalent. */}
          {isGmHere && tab === 'crew' && (
            <>
              <div className="rt-conds-h">
                The crew {'·'} {((dynasty && dynasty.members) || []).length} aboard
              </div>
              {((dynasty && dynasty.members) || []).length === 0 ? (
                <p className="rt-vox-hint">
                  Nobody aboard yet. Read the code out, or seat an officer from
                  your roster under Bridge.
                </p>
              ) : (
                <ul className="rt-list">
                  {(dynasty.members || []).map((m, i) => {
                    const r = roleById(m.role);
                    const c = m.card;
                    return (
                      <li key={m.charId || i} className="rt-entry">
                        <span className="rt-entry-t">
                          {m.name}{m.npc ? ' \u00B7 NPC' : ''}
                        </span>
                        <span className="rt-entry-c">
                          {r ? r.name : 'no station'}
                        </span>
                        {c ? (
                          <div className="rt-entry-d">
                            <p className="rt-entry-s">
                              {[c.career, c.homeWorld].filter(Boolean).join(' \u00B7 ')}
                              {c.wounds ? ` \u00B7 ${c.wounds} wounds` : ''}
                              {c.fate != null ? ` \u00B7 ${c.fate} fate` : ''}
                            </p>
                            {Object.keys(c.characteristics || {}).length > 0 && (
                              <p className="rt-crewchars">
                                {CHAR_KEYS.filter((k) => c.characteristics[k] != null)
                                  .map((k) => `${CHAR_SHORT[k]} ${c.characteristics[k]}`)
                                  .join('   ')}
                              </p>
                            )}
                            {c.talents && c.talents.length > 0 && (
                              <p><b>Talents</b> {'\u2014'} {c.talents.join(', ')}</p>
                            )}
                            {c.traits && c.traits.length > 0 && (
                              <p><b>Traits</b> {'\u2014'} {c.traits.join(' ')}</p>
                            )}
                            {c.secret && (
                              <p className="rt-crewsecret">
                                <b>Secret</b> {'\u2014'} {c.secret}
                              </p>
                            )}
                            {c.favour && (
                              <p className="rt-crewfavour">
                                <b>Favour</b> {'\u2014'} {c.favour}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="rt-entry-d">
                            <p className="rt-entry-s">
                              No card published. They joined before this existed,
                              or from an older build {'\u2014'} rejoining the
                              bridge sends one.
                            </p>
                          </div>
                        )}
                        {m.charId && (
                          <button className="rt-opt" disabled={busy}
                            onClick={() => { setMsgTo(m.charId); setTab('crew'); }}>
                            Whisper
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="rt-conds-h">A private word</div>
              <p className="rt-vox-hint">
                Reaches that character alone. The others cannot read it {'\u2014'}
                the server filters every copy by who it is addressed to.
              </p>
              <label className="rt-shipsel">
                <span className="rt-shipsel-k">To</span>
                <select className="rt-sel" value={msgTo}
                  onChange={(e) => setMsgTo(e.target.value)}>
                  <option value="">{'\u2014 choose a character \u2014'}</option>
                  {(dynasty.members || []).filter((m) => m.charId).map((m) => (
                    <option key={m.charId} value={m.charId}>
                      {m.name}{m.npc ? ' (NPC)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <textarea className="rt-ta" value={msgText} rows={3}
                onChange={(e) => setMsgText(e.target.value)}
                placeholder="The Navigator has been lying to you about the route." />
              <div className="rt-btnrow">
                <button className="rt-btn" disabled={busy || !msgTo || !msgText.trim()}
                  onClick={whisper}>Send</button>
              </div>
            </>
          )}

          {isGmHere && tab === 'bridge' && (
            <>
              <div className="rt-conds-h">Your officers</div>
              <p className="rt-vox-hint">
                Characters from your roster, each at its own station. Assign as
                many as the bridge needs {'—'} the rest of your roster stays
                off it.
              </p>
              {(roster || []).length === 0 ? (
                <p className="rt-vox-hint">
                  Nothing in your roster yet. Save a character and it can take
                  a station here.
                </p>
              ) : (
                <ul className="rt-list">
                  {(roster || []).map((c) => {
                    const seated = ((dynasty && dynasty.members) || [])
                      .find((m) => m.npc && m.charId === c.id);
                    return (
                      <li key={c.id} className="rt-entry">
                        <span className="rt-entry-t">{c.name || 'Unnamed adept'}</span>
                        <span className="rt-entry-c">{c.career || 'No career'}</span>
                        <div className="rt-npcseat">
                          <select className="rt-sel" value={seated ? seated.role : ''}
                            disabled={busy}
                            onChange={(e) => (e.target.value
                              ? seat(c, e.target.value)
                              : (seated ? unseat(c) : null))}>
                            <option value="">{'— not aboard —'}</option>
                            {SHIP_ROLES.map((r) => (
                              <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                          </select>
                          {seated && (
                            <button className="rt-rm" disabled={busy}
                              onClick={() => unseat(c)}
                              aria-label={'Stand ' + (c.name || 'this officer') + ' down'}>
                              &times;
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}

          {ship && ship.vitals && (
            <>
              <div className="rt-conds-h">The ship {'·'} rev {ship.rev}</div>
              <div className="rt-gmvitals rt-bridgevitals">
                <span>HULL <b>{ship.vitals.hullIntegrity ?? '—'}</b></span>
                <span>MORALE <b>{ship.vitals.morale ?? '—'}</b></span>
                <span>POP <b>{ship.vitals.population ?? '—'}</b></span>
                <span>PHASE <b>{PHASE_LABELS[ship.combat?.phase] || '—'}</b></span>
              </div>
            </>
          )}

          {ship && (ship.fleet || []).length > 0 && (
            <>
              <div className="rt-conds-h">Contacts</div>
              <ul className="rt-list">
                {ship.fleet.map((e, i) => (
                  <li key={e.id || i} className="rt-entry">
                    <span className="rt-entry-t">{e.name || 'Unknown contact'}</span>
                    <span className="rt-entry-c">
                      {e.unscanned ? 'unscanned' : `HULL ${e.vitals?.hullIntegrity ?? '?'}`}
                    </span>
                    {e.unscanned && (
                      <div className="rt-entry-d">
                        <p className="rt-entry-s">
                          No augur reading. An Active Augury reveals its hull,
                          shields and weapons.
                        </p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* ---- a private word from the GM ----
              Only what is addressed to a character this account holds ever
              reaches here: the server filters every copy. */}
          {!isGmHere && ship && (ship.messages || []).length > 0 && (
            <>
              <div className="rt-conds-h">
                From the GM {'·'} for you alone
              </div>
              <ul className="rt-list">
                {ship.messages.map((m) => (
                  <li key={m.id} className="rt-entry rt-whisper">
                    <span className="rt-entry-t">{m.text}</span>
                    <span className="rt-entry-c">
                      {new Date(m.at).toLocaleTimeString()}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* ---- the player's own station ---- */}
          {!isGmHere && shipRole && ship && (
            <>
              <div className="rt-conds-h">
                Your station {'·'} {roleById(shipRole)?.name}
              </div>
              <div className="rt-gmmods">
                <label><span className="rt-der-k">Your skill</span>
                  <input className="rt-field rt-numin" type="number" min="0" max="100"
                    value={skill}
                    onChange={(e) => setSkill(parseInt(e.target.value, 10) || 0)} />
                </label>
                <label><span className="rt-der-k">Aimed at</span>
                  <select className="rt-sel" value={aimed}
                    onChange={(e) => setAimed(e.target.value)}>
                    <option value="">{'— no target —'}</option>
                    {(ship.fleet || []).map((e, i) => (
                      <option key={e.id || i} value={e.id}>
                        {e.name || 'Contact'}{e.unscanned ? ' (unscanned)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <ul className="rt-list">
                {EXTENDED_ACTIONS.filter((a) => mayTakeAction(a.id, shipRole)).map((a) => (
                  <li key={a.id} className="rt-entry">
                    <button className="rt-opt" disabled={busy}
                      onClick={() => act(a)}>Roll</button>
                    <span className="rt-entry-t">{a.name}</span>
                    <span className="rt-entry-c">{a.skill}</span>
                    <div className="rt-entry-d"><p>{a.effect}</p></div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {ship && (ship.log || []).length > 0 && (
            <>
              <div className="rt-conds-h">Bridge log</div>
              <ul className="rt-gmlog">
                {ship.log.map((l, i) => (
                  <li key={i} className={'rt-gmline ' + (l.event ? 'event' : '')}>
                    {l.text}
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="rt-vox-hint">
            Updating every {Math.round((state?.pollSeconds || 5))} seconds while
            this panel is open.
          </p>
        </>
      )}
    </dialog>
  );
}

/* ------------------------------ GM DASHBOARD ------------------------------
   The GM's side of the bridge: the fleet, the turn, the attack resolver and
   the event emitter.

   NPC ships are hull-backed rather than blueprint-backed. A GM throwing a
   raider at the crew needs it to have Armour, Hull Integrity and a gun, not a
   legal eight-category blueprint — forcing one would make every encounter a
   ship-building exercise. The player's ship is the real blueprint, so the two
   are read through one profile function and everything downstream sees the
   same shape.

   Rolls happen here and the resolution is delegated to voidcombat.js, so what
   the dashboard shows and what a server would compute cannot diverge. */

// The combat-relevant numbers for either kind of ship.
function shipProfile(ship, blueprint, custom) {
  if (ship.player) {
    const hull = hullById(blueprint.hullId, blueprint);
    const s = stats(blueprint, ship.vitals);
    if (!hull || !s) return null;
    return {
      name: blueprint.shipName || 'Your ship',
      cls: hull.cls,
      armour: s.armour,
      turretRating: s.turrets,
      voidShields: s.voidShields,
      detection: s.detection,
      maxHull: hull.hullIntegrity,
      weapons: (blueprint.weapons || []).map((w) => w.componentId)
    };
  }
  // An NPC ship is hull-backed and has no blueprint to carry definitions, so
  // the catalogue is passed in.
  const hull = hullById(ship.hullId, custom);
  if (!hull) return null;
  return {
    name: ship.name || hull.name,
    cls: hull.cls,
    armour: hull.armour,
    turretRating: Number.isFinite(ship.turretRating) ? ship.turretRating : hull.turrets,
    voidShields: Number.isFinite(ship.voidShields) ? ship.voidShields : 1,
    detection: hull.detection,
    maxHull: hull.hullIntegrity,
    weapons: ship.weapons || []
  };
}

function GmPanel({ fleet, setFleet, combat, setCombat, blueprint, bridgeCode,
  homebrew, onClose }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) el.showModal();
  }, []);
  const close = () => dialogRef.current && dialogRef.current.close();

  const [attackerId, setAttackerId] = useState('player');
  const [targetId, setTargetId] = useState('');
  const [weaponId, setWeaponId] = useState('weap-macrocannon-mars');
  const [distance, setDistance] = useState(3);
  const [lockDoS, setLockDoS] = useState(0);
  const [spiritDoS, setSpiritDoS] = useState(0);
  const [bs, setBs] = useState(40);
  const [log, setLog] = useState([]);
  const [eventId, setEventId] = useState('macro_strike');
  const [eventAmount, setEventAmount] = useState(5);
  const [eventShip, setEventShip] = useState('player');

  // The player's ship is always in the fleet, derived rather than stored, so
  // it cannot drift from the blueprint the player is editing.
  const playerShip = {
    id: 'player', player: true,
    vitals: combat.playerVitals || newVitals(blueprint)
  };
  const ships = [playerShip, ...fleet];
  const usable = usableCustom(homebrew);
  const bpWithCustom = { ...blueprint, custom: usable };
  const profileOf = (s) => shipProfile(s, bpWithCustom, usable);
  const byId = (id) => ships.find((s) => s.id === id);

  const say = (entry) => setLog((p) => [{ ...entry, key: newId() }, ...p].slice(0, 30));

  /* ---- publishing ----
     Driven by an effect watching the shared state rather than a call in each
     handler. Every action here mutates fleet or combat, so watching those two
     cannot miss one — where a call per handler is a list to keep in step, and
     the one that gets forgotten is invisible until a player asks why their
     screen is stale.

     Debounced, because a burst of clicks would otherwise be a burst of writes
     against the command budget, and the players only need the settled state. */
  const [pushed, setPushed] = useState(null);
  // The last state actually sent. Guarding on content rather than on "is this
  // the first run" because a first-run flag does not survive StrictMode, which
  // mounts, tears down and mounts again: the ref was already true on the
  // second pass, so opening the panel pushed — the very clobber the guard was
  // there to prevent.
  const lastSent = useRef(null);

  // The newest log line, so the bridge log reads as what the GM just did
  // rather than "the GM updated the bridge". Declared above the effect that
  // closes over it: reading a const from above its declaration is only safe
  // while the read is deferred, and this project has already had one TDZ
  // error blank every screen.
  const logRef = useRef(null);

  useEffect(() => {
    if (!bridgeCode) return undefined;

    const snapshot = JSON.stringify({ fleet, combat });
    // Opening the panel is not a change. Remember what was there and send
    // nothing until it differs.
    if (lastSent.current === null) { lastSent.current = snapshot; return undefined; }
    if (lastSent.current === snapshot) return undefined;

    const t = setTimeout(() => {
      writeBridge({
        code: bridgeCode,
        doc: { fleet, combat },
        vitals: combat.playerVitals || newVitals(blueprint),
        log: logRef.current
      }).then((r) => {
        lastSent.current = snapshot;
        setPushed({ rev: r.rev, at: Date.now() });
      }).catch((e) => say({ kind: 'miss', text: 'Bridge: ' + e.message }));
    }, 700);
    return () => clearTimeout(t);
  }, [fleet, combat, bridgeCode]);

  logRef.current = log.length ? log[0].text : null;

  const setVitals = (id, patch) => {
    if (id === 'player') {
      setCombat({ ...combat, playerVitals: { ...playerShip.vitals, ...patch } });
    } else {
      setFleet(fleet.map((s) => (s.id === id ? { ...s, vitals: { ...s.vitals, ...patch } } : s)));
    }
  };

  /* ---- fleet ---- */

  const addNpc = (hullId) => {
    const hull = hullById(hullId, usable);
    if (!hull) return;
    const n = fleet.filter((s) => s.hullId === hullId).length;
    setFleet([...fleet, {
      id: newId(),
      hullId,
      name: n ? `${hull.name} ${n + 1}` : hull.name,
      weapons: ['weap-macrocannon-mars'],
      turretRating: hull.turrets,
      voidShields: 1,
      vitals: { hullIntegrity: hull.hullIntegrity, morale: 100, population: 100 },
      evadingDoS: null
    }]);
  };

  const dropNpc = (id) => {
    setFleet(fleet.filter((s) => s.id !== id));
    if (targetId === id) setTargetId('');
    if (attackerId === id) setAttackerId('player');
  };

  /* ---- the turn ---- */

  const rollInitiative = () => {
    const order = initiativeOrder(ships.map((s) => {
      const p = profileOf(s);
      return { id: s.id, name: p ? p.name : '?', detection: p ? p.detection : 0, d10: d(10) };
    }));
    setCombat({ ...combat, order: order.map((o) => ({ id: o.id, name: o.name, score: o.score })) });
    say({ kind: 'initiative', text: 'Initiative: ' + order.map((o) => `${o.name} ${o.score}`).join(', ') });
  };

  const advance = () => {
    const next = nextPhase(combat.phase);
    // Void shields absorb one hit PER ROUND, so they come back when the turn
    // wraps. Without this a shield was spent once and gone for the battle,
    // which quietly made every escort far easier to kill than the rules allow.
    const newTurn = next === PHASES[0];
    if (newTurn) {
      setFleet(fleet.map((s) => {
        const p = profileOf(s);
        return p ? { ...s, vitals: { ...s.vitals, voidShields: p.voidShields } } : s;
      }));
      const pp = profileOf(playerShip);
      setCombat({
        ...combat,
        phase: next,
        playerVitals: pp
          ? { ...playerShip.vitals, voidShields: pp.voidShields }
          : combat.playerVitals
      });
    } else {
      setCombat({ ...combat, phase: next });
    }
    say({ kind: 'phase',
      text: `Phase: ${PHASE_LABELS[next]}${newTurn ? ' — new turn, void shields restored' : ''}` });
  };

  /* ---- firing ---- */

  const attacker = byId(attackerId);
  const targetShip = byId(targetId);
  const attackerP = attacker ? profileOf(attacker) : null;
  const targetP = targetShip ? profileOf(targetShip) : null;
  const weapon = componentById(weaponId, usable);

  const hit = targetP && weapon ? toHit({
    ballisticSkill: bs,
    weaponId,
    // passed explicitly so a homebrew weapon's range is honoured: toHit
    // resolves ids against the built-ins only
    weaponRange: weapon.range,
    distanceVU: distance,
    targetClass: targetP.cls,
    lockDoS,
    machineSpiritDoS: spiritDoS,
    evadingDoS: targetShip.evadingDoS,
    crippled: (targetShip.vitals.hullIntegrity || 0) <= 0
  }) : null;

  const fire = () => {
    if (!hit || !hit.canFire || !weapon || !targetP) return;
    const roll = roll1d100();
    const test = resolveTest(hit.target, 0, roll);
    if (!test.success) {
      say({ kind: 'miss', text: `${attackerP.name} missed ${targetP.name} — rolled ${roll} against ${hit.target}.` });
      return;
    }
    const hits = hitsScored(test.degrees, weapon.str);
    const rolls = Array.from({ length: hits }, () => d(10));
    const res = resolveAttack({
      weaponId,
      // likewise: the stats travel with the call so homebrew resolves
      weaponClass: weapon.weaponClass,
      strength: weapon.str,
      damageBonus: weapon.damageBonus,
      hits,
      damageRolls: rolls,
      pointBlank: hit.pointBlank,
      target: {
        turretRating: targetP.turretRating,
        voidShields: targetShip.vitals.voidShields ?? targetP.voidShields,
        armour: targetP.armour,
        hullIntegrity: targetShip.vitals.hullIntegrity
      }
    });
    setVitals(targetId, {
      hullIntegrity: res.hullIntegrity,
      voidShields: res.shieldsRemaining
    });
    say({ kind: res.netHullDamage > 0 ? 'hit' : 'soak', roll, test, res, rolls,
      text: `${attackerP.name} → ${targetP.name}: rolled ${roll} against ${hit.target}`
        + ` (${test.degrees} DoS), ${res.hitsScored} hits`
        + (res.turretsStop ? `, ${res.turretsStop} shot down` : '')
        + (res.shieldsStop ? `, ${res.shieldsStop} on the shields` : '')
        + `, ${res.combinedDamage} damage less ${res.armourMitigation} armour`
        + ` = ${res.netHullDamage} to the hull.`
        + (res.criticalTriggered ? ' CRITICAL.' : '')
        + (res.destroyed ? ' The ship is crippled.' : '') });
  };

  const rollCritical = () => {
    const roll = d(10);
    const effect = criticalEffect(roll);
    say({ kind: 'critical', text: `Critical ${roll}: ${effect.name} — ${effect.effect}` });
  };

  /* ---- events ---- */

  const emit = () => {
    const ship = byId(eventShip);
    if (!ship) return;
    const p = profileOf(ship);
    const { patch, unknown } = applyEvent(ship.vitals, { id: eventId, amount: eventAmount });
    if (unknown) return;
    setVitals(eventShip, patch);
    const ev = GM_EVENTS.find((e) => e.id === eventId);
    say({ kind: 'event',
      text: `${ev.name} on ${p ? p.name : ship.id}: `
        + Object.entries(patch).map(([k, v]) =>
          `${k} ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ') });
  };

  const num = (value, onChange, opts = {}) => (
    <input className="rt-field rt-numin" type="number" value={value}
      min={opts.min ?? 0} max={opts.max} step={opts.step ?? 1}
      onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)} />
  );

  return (
    <dialog ref={dialogRef} className="rt-framer rt-ship rt-gm" onClose={onClose}
      aria-label="GM dashboard">
      <div className="rt-framer-h">
        <span className="rt-framer-t">GM dashboard</span>
        <button className="rt-close" onClick={close} aria-label="Close">&times;</button>
      </div>

      {/* ---- turn ---- */}
      <div className="rt-gmturn">
        <span className="rt-der-k">Phase</span>
        <b className="rt-gmphase">{PHASE_LABELS[combat.phase] || PHASE_LABELS.extended}</b>
        <button className="rt-opt" onClick={advance}>Advance</button>
        <button className="rt-opt" onClick={rollInitiative}>Roll initiative</button>
        <span className={'rt-gmsync' + (bridgeCode ? ' on' : '')}>
          {bridgeCode
            ? `live to ${bridgeCode}${pushed ? ` \u00B7 rev ${pushed.rev}` : '\u2026'}`
            : 'local only'}
        </span>
      </div>
      {combat.order && combat.order.length > 0 && (
        <p className="rt-vox-hint">
          Order: {combat.order.map((o) => `${o.name} (${o.score})`).join(' › ')}
        </p>
      )}

      {/* ---- fleet ---- */}
      <div className="rt-conds-h">Fleet</div>
      <ul className="rt-list">
        {ships.map((s) => {
          const p = profileOf(s);
          if (!p) {
            return (
              <li key={s.id} className="rt-entry">
                <span className="rt-entry-t">
                  {s.player ? 'Your ship — no hull chosen yet' : s.name}
                </span>
              </li>
            );
          }
          const v = s.vitals || {};
          const dead = (v.hullIntegrity || 0) <= 0;
          return (
            <li key={s.id} className={'rt-entry' + (dead ? ' rt-gmdead' : '')}>
              <span className="rt-entry-t">
                {p.name}{s.player ? ' (crew)' : ''}
              </span>
              <span className="rt-entry-c">{p.cls}</span>
              <div className="rt-gmvitals">
                <span>HULL <b>{v.hullIntegrity ?? p.maxHull}</b>/{p.maxHull}</span>
                <span>ARM <b>{p.armour}</b></span>
                <span>SHD <b>{v.voidShields ?? p.voidShields}</b></span>
                <span>TUR <b>{p.turretRating}</b></span>
                <span>MOR <b>{v.morale ?? 100}</b></span>
                <span>POP <b>{v.population ?? 100}</b></span>
                {!s.player && (
                  <label className="rt-gmevade">
                    <input type="checkbox" checked={s.evadingDoS != null}
                      onChange={(e) => setFleet(fleet.map((x) => (x.id === s.id
                        ? { ...x, evadingDoS: e.target.checked ? 1 : null } : x)))} />
                    evading
                  </label>
                )}
                {!s.player && (
                  <button className="rt-rm" onClick={() => dropNpc(s.id)}
                    aria-label={'Remove ' + p.name}>&times;</button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <label className="rt-shipsel">
        <span className="rt-shipsel-k">Add enemy</span>
        <select className="rt-sel" value="" onChange={(e) => addNpc(e.target.value)}>
          <option value="">{'— pick a hull —'}</option>
          {allHulls(usable).map((h) => (
            <option key={h.id} value={h.id}>{h.name} ({h.cls})</option>
          ))}
        </select>
      </label>

      {/* ---- attack ---- */}
      <div className="rt-conds-h">Attack</div>
      <label className="rt-shipsel">
        <span className="rt-shipsel-k">Attacker</span>
        <select className="rt-sel" value={attackerId} onChange={(e) => setAttackerId(e.target.value)}>
          {ships.map((s) => {
            const p = profileOf(s);
            return <option key={s.id} value={s.id}>{p ? p.name : s.id}</option>;
          })}
        </select>
      </label>
      <label className="rt-shipsel">
        <span className="rt-shipsel-k">Target</span>
        <select className="rt-sel" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
          <option value="">{'— pick a target —'}</option>
          {ships.filter((s) => s.id !== attackerId).map((s) => {
            const p = profileOf(s);
            return <option key={s.id} value={s.id}>{p ? p.name : s.id}</option>;
          })}
        </select>
      </label>
      <label className="rt-shipsel">
        <span className="rt-shipsel-k">Weapon</span>
        <select className="rt-sel" value={weaponId} onChange={(e) => setWeaponId(e.target.value)}>
          {allComponents(usable).filter((c) => c.category === 'weapon').map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} (Str {c.str}, {damageText(c)}, rng {c.range})
            </option>
          ))}
        </select>
      </label>

      <div className="rt-gmmods">
        <label><span className="rt-der-k">Distance VU</span>{num(distance, setDistance)}</label>
        <label><span className="rt-der-k">BS / crew</span>{num(bs, setBs, { max: 100 })}</label>
        <label><span className="rt-der-k">Lock DoS</span>{num(lockDoS, setLockDoS)}</label>
        <label><span className="rt-der-k">Spirit DoS</span>{num(spiritDoS, setSpiritDoS)}</label>
      </div>

      {hit && (
        hit.canFire ? (
          <div className="rt-note">
            <b>Target {hit.target}</b>{' — '}
            {hit.base} base
            {hit.parts.map((p) => ` ${p.value > 0 ? '+' : '−'}${Math.abs(p.value)} ${p.label.toLowerCase()}`).join('')}
            {' · '}{hit.band} range
          </div>
        ) : (
          <div className="rt-warn"><p>Out of range: {weapon.name} reaches {weapon.range} VU.</p></div>
        )
      )}

      <div className="rt-btnrow">
        <button className="rt-btn" disabled={!hit || !hit.canFire} onClick={fire}>Fire</button>
        <button className="rt-btn ghost" onClick={rollCritical}>Roll critical</button>
      </div>

      {/* ---- events ---- */}
      <div className="rt-conds-h">Emit an event</div>
      <p className="rt-vox-hint">
        Applied to the ship's vitals here. Once the bridge is shared, this is
        the call that reaches the crew's terminals.
      </p>
      <label className="rt-shipsel">
        <span className="rt-shipsel-k">Event</span>
        <select className="rt-sel" value={eventId} onChange={(e) => setEventId(e.target.value)}>
          {GM_EVENTS.filter((e) => !['advance_phase', 'enemy_update'].includes(e.id)).map((e) => (
            <option key={e.id} value={e.id}>{e.name} — {e.note}</option>
          ))}
        </select>
      </label>
      <div className="rt-gmmods">
        <label><span className="rt-der-k">On ship</span>
          <select className="rt-sel" value={eventShip} onChange={(e) => setEventShip(e.target.value)}>
            {ships.map((s) => {
              const p = profileOf(s);
              return <option key={s.id} value={s.id}>{p ? p.name : s.id}</option>;
            })}
          </select>
        </label>
        <label><span className="rt-der-k">Amount</span>{num(eventAmount, setEventAmount)}</label>
      </div>
      <div className="rt-btnrow">
        <button className="rt-btn" onClick={emit}>Emit</button>
      </div>

      {/* ---- log ---- */}
      {log.length > 0 && (
        <>
          <div className="rt-conds-h">Log</div>
          <ul className="rt-gmlog">
            {log.map((l) => <li key={l.key} className={'rt-gmline ' + l.kind}>{l.text}</li>)}
          </ul>
        </>
      )}
    </dialog>
  );
}


/* ------------------------------ HOMEBREW EDITOR ------------------------------
   Define a hull or a component for the table. Validated as you type and
   refused while it is wrong, because an unvalidated definition does not fail
   loudly — it quietly makes every ship that uses it wrong.

   Kept deliberately plain: number fields and a mount picker, no wizard. */

const BLANK_HULL = {
  id: '', name: '', cls: 'Light Cruiser', speed: 6, manoeuvre: 10, detection: 15,
  armour: 18, hullIntegrity: 50, turrets: 1, space: 50, sp: 45,
  slots: ['prow', 'port', 'starboard'], source: 'Homebrew'
};

const BLANK_COMPONENT = {
  id: '', name: '', category: 'weapon', power: -4, space: 2, sp: 1,
  weaponClass: 'macro', str: 3, damageDice: 1, damageBonus: 2, crit: 5, range: 6,
  note: ''
};

function HomebrewEditor({ homebrew, setHomebrew, err, cloud, onClose }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) el.showModal();
  }, []);
  const close = () => dialogRef.current && dialogRef.current.close();

  const [kind, setKind] = useState('hull');
  const [hull, setHull] = useState(BLANK_HULL);
  const [comp, setComp] = useState(BLANK_COMPONENT);

  const draft = kind === 'hull' ? hull : comp;
  const setDraft = kind === 'hull' ? setHull : setComp;
  const errors = kind === 'hull' ? validateHull(hull) : validateComponent(comp);

  const add = () => {
    if (errors.length) return;
    const key = kind === 'hull' ? 'hulls' : 'components';
    setHomebrew({ ...homebrew, [key]: [...(homebrew[key] || []), draft] });
    setDraft(kind === 'hull' ? BLANK_HULL : BLANK_COMPONENT);
  };

  const drop = (key, id) => setHomebrew({
    ...homebrew, [key]: (homebrew[key] || []).filter((x) => x.id !== id)
  });

  const num = (field, label, opts = {}) => (
    <label className="rt-brewfield">
      <span className="rt-der-k">{label}</span>
      <input className="rt-field rt-numin" type="number" value={draft[field] ?? 0}
        min={opts.min} step={opts.step ?? 1}
        onChange={(e) => setDraft({ ...draft, [field]: parseInt(e.target.value, 10) || 0 })} />
    </label>
  );

  const text = (field, label, placeholder) => (
    <label className="rt-brewfield wide">
      <span className="rt-der-k">{label}</span>
      <input className="rt-field" value={draft[field] ?? ''} placeholder={placeholder}
        onChange={(e) => setDraft({ ...draft, [field]: e.target.value })} />
    </label>
  );

  const toggleSlot = (slot) => {
    const slots = hull.slots || [];
    // Clicking a mount adds one; clicking it again removes one. A hull may
    // carry several of the same mount, which is why this counts rather than
    // toggles a set.
    setHull({ ...hull, slots: slots.includes(slot)
      ? slots.filter((s, i) => i !== slots.indexOf(slot))
      : [...slots, slot] });
  };

  return (
    <dialog ref={dialogRef} className="rt-framer rt-ship" onClose={onClose}
      aria-label="Homebrew">
      <div className="rt-framer-h">
        <span className="rt-framer-t">Homebrew</span>
        <button className="rt-close" onClick={close} aria-label="Close">&times;</button>
      </div>

      {err && <div className="rt-warn"><p>{err}</p></div>}

      <p className="rt-vox-hint">
        Hulls and components of your own. They appear alongside the built-ins
        everywhere, and travel with any ship that uses them {'\u2014'} a
        homebrew ship pushed to the bridge arrives complete.
        {' '}
        {cloud
          ? 'Saved to your account, so they follow you to any device.'
          : 'Saved in this browser only. Sign in to reach them elsewhere.'}
      </p>

      <div className="rt-opts">
        <button className={'rt-opt' + (kind === 'hull' ? ' on' : '')}
          onClick={() => setKind('hull')}>Hull</button>
        <button className={'rt-opt' + (kind === 'component' ? ' on' : '')}
          onClick={() => setKind('component')}>Component</button>
      </div>

      <div className="rt-brewgrid">
        {text('id', 'Id', kind === 'hull' ? 'hull-maekao' : 'weap-maekao-battery')}
        {text('name', 'Name', kind === 'hull' ? 'Ma\u2019Kao Pattern' : 'Ma\u2019Kao Battery')}

        {kind === 'hull' ? (
          <>
            <label className="rt-brewfield wide">
              <span className="rt-der-k">Class (sets target size)</span>
              <input className="rt-field" value={hull.cls}
                onChange={(e) => setHull({ ...hull, cls: e.target.value })}
                placeholder="Light Cruiser" />
            </label>
            {num('speed', 'Speed')}
            {num('manoeuvre', 'Manoeuvre')}
            {num('detection', 'Detection')}
            {num('armour', 'Armour', { min: 1 })}
            {num('hullIntegrity', 'Hull Integrity', { min: 1 })}
            {num('turrets', 'Turrets', { min: 0 })}
            {num('space', 'Space', { min: 1 })}
            {num('sp', 'Ship Points', { min: 1 })}
          </>
        ) : (
          <>
            <label className="rt-brewfield wide">
              <span className="rt-der-k">Category</span>
              <select className="rt-sel" value={comp.category}
                onChange={(e) => setComp({ ...comp, category: e.target.value })}>
                {ESSENTIAL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{ESSENTIAL_LABELS[c]}</option>
                ))}
                <option value="weapon">Weapon</option>
                <option value="supplemental">Supplemental</option>
              </select>
            </label>
            {num('power', 'Power (negative draws)')}
            {num('space', 'Space', { min: 0 })}
            {num('sp', 'Ship Points', { min: 0 })}
            {comp.category === 'weapon' && (
              <>
                <label className="rt-brewfield wide">
                  <span className="rt-der-k">Weapon class</span>
                  <select className="rt-sel" value={comp.weaponClass}
                    onChange={(e) => setComp({ ...comp, weaponClass: e.target.value })}>
                    {WEAPON_CLASSES.map((w) => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </select>
                </label>
                {num('str', 'Strength (caps hits)', { min: 1 })}
                {num('damageBonus', 'Damage bonus', { min: 0 })}
                {num('crit', 'Crit rating', { min: 1 })}
                {num('range', 'Range VU', { min: 1 })}
              </>
            )}
          </>
        )}
      </div>

      {errors.length > 0 ? (
        <div className="rt-warn">{errors.map((e, i) => <p key={i}>{e}</p>)}</div>
      ) : (
        <div className="rt-note">Ready to add.</div>
      )}

      <div className="rt-btnrow">
        <button className="rt-btn" disabled={errors.length > 0} onClick={add}>
          Add {kind}
        </button>
      </div>

      {['hulls', 'components'].map((key) => (
        (homebrew[key] || []).length > 0 && (
          <div key={key}>
            <div className="rt-conds-h">
              Your {key} ({homebrew[key].length})
            </div>
            <ul className="rt-list">
              {homebrew[key].map((x) => {
                const bad = key === 'hulls' ? validateHull(x) : validateComponent(x);
                return (
                  <li key={x.id || Math.random()} className="rt-entry">
                    <span className="rt-entry-t">{x.name || '(unnamed)'}</span>
                    <span className="rt-entry-c">{x.id}</span>
                    <button className="rt-rm" onClick={() => drop(key, x.id)}
                      aria-label={'Remove ' + (x.name || x.id)}>&times;</button>
                    {bad.length > 0 && (
                      <div className="rt-entry-d">
                        <p className="rt-entry-s">
                          Not usable: {bad.join(' ')}
                        </p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )
      ))}
    </dialog>
  );
}

function ShipPanel({ blueprint, setBlueprint, homebrew, onEditHomebrew,
  shipRole, setShipRole, careerName, onClose }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) el.showModal();
  }, []);
  const close = () => dialogRef.current && dialogRef.current.close();

  // Only the entries that validate are attached, so one half-finished
  // definition cannot make every ship using the others illegal. They are
  // attached to the blueprint itself so a ship pushed to the bridge carries
  // its own definitions and needs no catalogue on the other end.
  const usable = usableCustom(homebrew);
  const bp = { ...blueprint, custom: usable };
  const hull = hullById(bp.hullId, bp);
  const { errors, budget: b } = validate(bp);
  const derived = stats(bp);

  // `custom` is derived on every render from the library, so it is stripped
  // before saving: persisting it would freeze a stale copy into the blueprint
  // and later edits to the library would not reach it.
  const set = (patch) => {
    const { custom, ...rest } = { ...bp, ...patch };
    setBlueprint(rest);
  };

  // Changing hull clears the weapons: the mounts it had may not exist on the
  // new one, and silently keeping an unmountable weapon is how a blueprint
  // ends up illegal for a reason nobody can see.
  const pickHull = (hullId) => set({ hullId, weapons: [] });

  const setEssential = (category, id) =>
    set({ essential: { ...bp.essential, [category]: id || undefined } });

  const setWeapon = (slotIx, id) => {
    const weapons = (hull ? hull.slots : []).map((slot, i) => {
      const existing = bp.weapons.find((w) => w.slotIx === i);
      return i === slotIx
        ? (id ? { slotIx: i, slot, componentId: id } : null)
        : (existing || null);
    }).filter(Boolean);
    set({ weapons });
  };

  const toggleSupplemental = (id) => set({
    supplemental: bp.supplemental.includes(id)
      ? bp.supplemental.filter((x) => x !== id)
      : [...bp.supplemental, id]
  });

  const catalogue = allComponents(bp);
  const inCategory = (category) => catalogue.filter((c) => c.category === category);
  const weaponOptions = catalogue.filter((c) => c.category === 'weapon');
  const supplementals = catalogue.filter((c) => c.category === 'supplemental');

  // A station is a suggestion from the career, but any role can be taken:
  // a crew short of players doubles up, and the First Officer is open to all.
  const suggested = rolesForCareer(careerName).map((r) => r.id);
  const role = roleById(shipRole);

  const gauge = (label, used, total, remaining) => (
    <div className={'rt-shipbud' + (remaining < 0 ? ' over' : '')}>
      <div className="rt-der-k top">{label}</div>
      <div className="rt-der-v">{used}<span className="rt-shipbud-t">/{total}</span></div>
      <div className="rt-shipbud-r">
        {remaining < 0 ? `${-remaining} over` : `${remaining} left`}
      </div>
    </div>
  );

  return (
    <dialog ref={dialogRef} className="rt-framer rt-ship" onClose={onClose}
      aria-label="Voidship blueprint">
      <div className="rt-framer-h">
        <span className="rt-framer-t">Voidship blueprint</span>
        <button className="rt-close" onClick={close} aria-label="Close">&times;</button>
      </div>

      <div className="rt-shiprow">
        <label className="rt-shipfield">
          <span className="rt-der-k">Ship name</span>
          <input className="rt-field" value={bp.shipName}
            onChange={(e) => set({ shipName: e.target.value })}
            placeholder="The Apex Predator" />
        </label>
        <label className="rt-shipfield sp">
          <span className="rt-der-k">Dynasty SP</span>
          <input className="rt-field" type="number" min="0" step="5" value={bp.dynastySP}
            onChange={(e) => set({ dynastySP: Math.max(0, parseInt(e.target.value, 10) || 0) })} />
        </label>
      </div>

      <div className="rt-shipbuds">
        {gauge('Ship Points', b.spentSP, b.dynastySP, b.spRemaining)}
        {gauge('Space', b.usedSpace, b.totalSpace, b.spaceRemaining)}
        {gauge('Power', b.usedPower, b.totalPower, b.powerRemaining)}
      </div>

      {errors.length > 0 && (
        <div className="rt-warn">
          {errors.map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}
      {hull && errors.length === 0 && (
        <div className="rt-note">A legal blueprint. {hull.name} {hull.cls}.</div>
      )}

      {/* Opened from here, rendered at the app root: a <dialog> nested inside
          another one closed BOTH when the inner was dismissed. */}
      <div className="rt-btnrow">
        <button className="rt-btn ghost" onClick={onEditHomebrew}>
          Homebrew{(usable.hulls.length + usable.components.length) > 0
            ? ` (${usable.hulls.length + usable.components.length})` : ''}
        </button>
      </div>

      <div className="rt-conds-h">Hull</div>
      <div className="rt-cards">
        {allHulls(bp).map((h) => (
          <div key={h.id} className={'rt-card' + (bp.hullId === h.id ? ' sel' : '')}
            onClick={() => pickHull(h.id)}>
            <div className="rt-card-h">
              <span className="rt-card-n">{h.name}</span>
              <span className="rt-entry-c">{h.sp} SP</span>
            </div>
            <p className="rt-card-b">{h.cls} {'·'} {h.source}</p>
            <div className="rt-mods">
              <span className="rt-mod up">Spd {h.speed}</span>
              <span className={'rt-mod ' + (h.manoeuvre >= 0 ? 'up' : 'dn')}>
                Man {h.manoeuvre > 0 ? '+' : ''}{h.manoeuvre}
              </span>
              <span className="rt-mod up">Det +{h.detection}</span>
              <span className="rt-mod up">Arm {h.armour}</span>
              <span className="rt-mod up">HI {h.hullIntegrity}</span>
              <span className="rt-mod up">Turr {h.turrets}</span>
              <span className="rt-mod up">Space {h.space}</span>
            </div>
            {bp.hullId === h.id && (
              <div className="rt-detail" onClick={(e) => e.stopPropagation()}>
                <p className="rt-dl"><b>Mounts</b> {'—'} {h.slots.join(', ')}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {hull && (
        <>
          <div className="rt-conds-h">Crew rating</div>
          <div className="rt-opts">
            {CREW_RATINGS.map((c) => (
              <button key={c.id}
                className={'rt-opt' + (bp.crew === c.id ? ' on' : '')}
                onClick={() => set({ crew: c.id })}>
                {c.name} {c.rating}{c.sp ? ` (${c.sp} SP)` : ''}
              </button>
            ))}
          </div>

          <div className="rt-conds-h">Essential components</div>
          <p className="rt-vox-hint">
            Exactly one of each. A ship missing any of the eight is not
            spaceworthy, whatever its budget says.
          </p>
          <div className="rt-shipsels">
          {ESSENTIAL_CATEGORIES.map((cat) => (
            <label key={cat} className="rt-shipsel">
              <span className="rt-shipsel-k">{ESSENTIAL_LABELS[cat]}</span>
              <select className="rt-sel" value={bp.essential[cat] || ''}
                onChange={(e) => setEssential(cat, e.target.value)}>
                <option value="">{'— none —'}</option>
                {inCategory(cat).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.power > 0 ? `+${c.power}` : c.power} pwr,
                    {' '}{c.space} spc{c.sp ? `, ${c.sp} SP` : ''})
                  </option>
                ))}
              </select>
            </label>
          ))}
          </div>

          <div className="rt-conds-h">Weapons</div>
          <p className="rt-vox-hint">
            One per mount. The {hull.name} has {hull.slots.length}:
            {' '}{hull.slots.join(', ')}.
          </p>
          <div className="rt-shipsels">
          {hull.slots.map((slot, i) => {
            const mounted = bp.weapons.find((w) => w.slotIx === i);
            return (
              <label key={i} className="rt-shipsel">
                <span className="rt-shipsel-k">{slot}</span>
                <select className="rt-sel" value={mounted ? mounted.componentId : ''}
                  onChange={(e) => setWeapon(i, e.target.value)}>
                  <option value="">{'— empty —'}</option>
                  {weaponOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} (Str {c.str}, {damageText(c)}, crit {c.crit}, rng {c.range})
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
          </div>

          <div className="rt-conds-h">Supplemental components</div>
          <ul className="rt-list">
            {supplementals.map((c) => (
              <li key={c.id} className="rt-entry">
                <button className={'rt-opt' + (bp.supplemental.includes(c.id) ? ' on' : '')}
                  onClick={() => toggleSupplemental(c.id)}>
                  {bp.supplemental.includes(c.id) ? '✓' : '+'}
                </button>
                <span className="rt-entry-t">{c.name}</span>
                <span className="rt-entry-c">
                  {c.power} pwr {'·'} {c.space} spc {'·'} {c.sp} SP
                </span>
                <div className="rt-entry-d"><p>{c.note}</p></div>
              </li>
            ))}
          </ul>

          {derived && (
            <>
              <div className="rt-conds-h">Final vitals</div>
              <div className="rt-derived">
                <div className="rt-der"><div className="rt-der-v">{derived.speed}</div>
                  <div className="rt-der-k">SPEED</div></div>
                <div className="rt-der"><div className="rt-der-v">
                  {derived.manoeuvre > 0 ? '+' : ''}{derived.manoeuvre}</div>
                  <div className="rt-der-k">MANOEUVRE</div></div>
                <div className="rt-der"><div className="rt-der-v">+{derived.detection}</div>
                  <div className="rt-der-k">DETECTION</div></div>
                <div className="rt-der"><div className="rt-der-v">{derived.armour}</div>
                  <div className="rt-der-k">ARMOUR</div></div>
                <div className="rt-der"><div className="rt-der-v">{derived.hullIntegrity}</div>
                  <div className="rt-der-k">HULL</div></div>
                <div className="rt-der"><div className="rt-der-v">{derived.turrets}</div>
                  <div className="rt-der-k">TURRETS</div></div>
                <div className="rt-der"><div className="rt-der-v">{derived.voidShields}</div>
                  <div className="rt-der-k">SHIELDS</div></div>
                <div className="rt-der"><div className="rt-der-v">{derived.maxMorale}</div>
                  <div className="rt-der-k">MORALE</div></div>
              </div>
              {derived.moraleLossReduction > 0 && (
                <p className="rt-vox-hint">
                  Morale loss reduced by {derived.moraleLossReduction}.
                </p>
              )}
            </>
          )}
        </>
      )}

      <div className="rt-conds-h">Your station</div>
      <p className="rt-vox-hint">
        Which department this character commands. It decides what they may
        change on a shared ship{careerName ? `; a ${careerName} usually takes the highlighted one` : ''}.
      </p>
      <label className="rt-shipsel">
        <span className="rt-shipsel-k">Role</span>
        <select className="rt-sel" value={shipRole || ''}
          onChange={(e) => setShipRole(e.target.value)}>
          <option value="">{'— no station —'}</option>
          {/* The Lord-Captain is absent on purpose: the Rogue Trader is the
              GM's character, and the server refuses that station from a
              player. The GM seats it like any other officer. */}
          {playerRoles().map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}{suggested.includes(r.id) ? '  ★' : ''}
            </option>
          ))}
        </select>
      </label>
      {isGmOnlyRole(shipRole) && (
        <div className="rt-warn">
          <p>
            The Lord-Captain is the GM's station {'—'} the Rogue Trader is
            their character. Choose another and rejoin the bridge.
          </p>
        </div>
      )}
      {role && (
        <div className="rt-entry-d">
          <p><b>{role.department}</b></p>
          <p><b>{role.action.name}</b> {'—'} {role.action.test}. {role.action.effect}</p>
          <p className="rt-entry-s">
            May change: {role.fields.includes('*')
              ? 'anything — the Lord-Captain overrides every department'
              : role.fields.join(', ')}
          </p>
        </div>
      )}
    </dialog>
  );
}

function VoxPanel({ vox, text, setText, onClose, careerName }) {
  const meta = PROFILE_META[vox.activeProfile];
  return (
    <>
      <div className="rt-scrim" onClick={onClose} />
      <div className="rt-vox" role="dialog" aria-label="Vox synthesiser">
        <div className="rt-vox-in">
          <div className="rt-vox-h">
            <span className="rt-vox-t">Vox-Synthesiser</span>
            <button className="rt-close" onClick={onClose} aria-label="Close">&times;</button>
          </div>
          <p className="rt-vox-hint">
            Type anything and it plays back through the chosen voice profile.
            {careerName ? ` Currently speaking for your ${careerName}.` : ''}
          </p>

          {!vox.supported && (
            <div className="rt-warn">
              This browser has no speech synthesis. Safari, Chrome and Edge all support it;
              the rest of the builder works regardless.
            </div>
          )}

          <textarea
            className="rt-ta"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter transmission text..."
          />

          <div className="rt-quick">
            {QUICK_LINES.map((l) => (
              <button key={l} className="rt-opt" onClick={() => setText(l)}>
                {l.length > 26 ? l.slice(0, 24) + '\u2026' : l}
              </button>
            ))}
          </div>

          <div className="rt-choice-l">VOICE PROFILE</div>
          <div className="rt-opts" style={{ marginBottom: 6 }}>
            {Object.keys(PROFILES).map((p) => (
              <button
                key={p}
                className={'rt-opt' + (vox.activeProfile === p ? ' on' : '')}
                onClick={() => vox.setActiveProfile(p)}
              >{PROFILE_META[p].label}</button>
            ))}
          </div>
          <p className="rt-vox-hint">{meta.hint}</p>

          <div className="rt-sl-l"><span>PITCH</span><span>{vox.pitch.toFixed(2)}</span></div>
          <input className="rt-slider" type="range" min="0" max="2" step="0.05"
            value={vox.pitch} onChange={(e) => vox.setPitch(parseFloat(e.target.value))} />

          <div className="rt-sl-l"><span>RATE</span><span>{vox.rate.toFixed(2)}</span></div>
          <input className="rt-slider" type="range" min="0.4" max="1.6" step="0.05"
            value={vox.rate} onChange={(e) => vox.setRate(parseFloat(e.target.value))} />

          {vox.voices.length > 0 && (
            <select
              className="rt-select"
              value={vox.selectedVoiceName}
              onChange={(e) => vox.setSelectedVoiceName(e.target.value)}
            >
              {vox.voices.map((v) => (
                <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
              ))}
            </select>
          )}

          {vox.speaking
            ? <button className="rt-speak stop" onClick={vox.stop}>CEASE TRANSMISSION</button>
            : <button className="rt-speak" disabled={!vox.supported || !text.trim()}
              onClick={() => vox.speak(text)}>TRANSMIT</button>}
        </div>
      </div>
    </>
  );
}
