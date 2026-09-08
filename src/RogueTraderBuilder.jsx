import React, { useState, useEffect, useRef, useMemo } from 'react';
import { framingStyle, panFraming, DEFAULT_FRAMING } from './framing.js';
import { readRoster, writeRoster, upsert, remove as removeChar, newId } from './roster.js';
import { parseGear, gearInfo, CRAFT } from './gear.js';

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
  { id: 'endurance', name: 'Endurance', blurb: 'You welcome the storm. What does not kill you is a stairway.', wounds: 1, notes: ['+1 Wound'] },
  { id: 'fortune', name: 'Fortune', blurb: 'Everything begins and ends with the clink of Thrones.', fate: 1, notes: ['+1 Fate Point'] },
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
    blurb: 'A mutant of ancient and protected stock. Without your third eye the ship goes nowhere.',
    skills: ['Common Lore (Navis Nobilite) (Int)', 'Forbidden Lore (Navigators, Warp) (Int)', 'Literacy (Int)',
      'Navigation (Stellar, Warp) (Int)', 'Psyniscience (Per)', 'Scholastic Lore (Astromancy) (Int)',
      'Speak Language (High Gothic, Low Gothic) (Int)'],
    talents: ['Navigator', 'Pistol Weapon Training (Universal)'],
    gear: 'Best hellpistol or good hand cannon; best metal staff, best xeno-mesh armour, Emperor\u2019s tarot deck, silk headscarf, Nobilite signet, micro-bead.'
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

/* the app never set this, so the page rendered with a light 8px gutter */
html,body{margin:0;padding:0;background:#070a08;}

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

.rt-head{position:sticky;top:0;z-index:20;
  background:linear-gradient(180deg,#101a14 72%,rgba(16,26,20,.95));
  border-bottom:1px solid var(--brass-dim);
  padding:11px 14px 10px;
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
.rt-cbon{flex:none;min-width:24px;text-align:center;padding:1px 4px;
  font-family:var(--mono);font-size:10px;color:var(--brass-lit);
  border:1px solid var(--brass-dim);background:rgba(6,12,8,.6);}
.rt-reroll{flex:none;width:27px;height:27px;cursor:pointer;font-size:13px;line-height:1;
  border:1px solid var(--brass-dim);color:var(--dim);background:rgba(6,12,8,.6);
  transition:color .14s,border-color .14s;}
.rt-reroll:hover{color:var(--gold);border-color:var(--brass);}

/* the brass gauges — wounds, fate, profit factor */
.rt-derived{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0;}
.rt-der{text-align:center;padding:11px 6px 9px;
  border:1px solid var(--brass);
  background:linear-gradient(180deg,#241d0f,#0d1109);
  box-shadow:inset 0 1px 0 rgba(201,169,97,.16);}
.rt-der-v{font-family:var(--display);font-size:24px;font-weight:600;line-height:1.1;
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

.rt-idcard{display:flex;gap:14px;align-items:flex-start;margin-bottom:16px;}
.rt-idtext{flex:1;min-width:0;}

.rt-intro{margin-bottom:18px;}
.rt-portrait-wrap{flex:none;width:92px;}
.rt-portrait{position:relative;width:100%;
  padding:7px;border-radius:3px;
  background:linear-gradient(180deg,#6a5a36,#3a3120 22%,#272115 78%,#4a3f27);
  box-shadow:inset 0 0 0 1px rgba(201,169,97,.45),0 4px 14px -6px rgba(0,0,0,.9);}
.rt-port-img{position:relative;height:104px;overflow:hidden;
  display:grid;place-items:center;
  font-family:var(--display);font-size:42px;font-weight:700;
  color:var(--brass-lit);text-shadow:0 0 28px rgba(201,169,97,.45);
  background:radial-gradient(105% 85% at 50% 12%,#26402f,#0c1610 75%);
  box-shadow:inset 0 0 26px rgba(0,0,0,.8),0 0 0 1px rgba(0,0,0,.6);}
.rt-port-img img{position:absolute;inset:0;width:100%;height:100%;display:block;}

.rt-port-actions{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:9px;}
.rt-port-actions .rt-opt{flex:1;text-align:center;padding:6px 8px;font-size:11px;}

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
.rt-port-pf{position:absolute;right:-9px;top:-9px;width:38px;height:38px;
  display:grid;place-items:center;align-content:center;border-radius:50%;
  font-family:var(--display);font-size:14px;font-weight:700;line-height:1;
  color:var(--gold-lit);
  background:radial-gradient(circle at 50% 30%,#3b3120,#15110a);
  border:1px solid var(--brass-lit);
  box-shadow:0 0 14px -3px rgba(224,185,85,.6);}
.rt-port-pf span{display:block;font-family:var(--mono);font-size:6.5px;
  letter-spacing:.14em;color:var(--brass-lit);opacity:.85;margin-top:1px;}

/* one strip: wounds gauge + the brass gauges, filling the row beside the
   portrait instead of a full-width bar with a separate row underneath */
.rt-idstats{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;align-items:stretch;}
.rt-idstats .rt-der{flex:1 1 78px;min-width:78px;}
.rt-wgauge{flex:2 1 150px;min-width:150px;display:flex;flex-direction:column;
  justify-content:center;text-align:center;padding:9px 8px;
  border:1px solid var(--brass);
  background:linear-gradient(180deg,#241d0f,#0d1109);
  box-shadow:inset 0 1px 0 rgba(201,169,97,.16);}
.rt-wbar{position:relative;height:20px;
  border:1px solid var(--brass-dim);background:#0a1209;
  box-shadow:inset 0 1px 4px rgba(0,0,0,.7);}
.rt-wgauge .rt-der-k{margin-top:5px;}
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
.rt-dossier{max-width:880px;}
.rt-sects{}

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
  color:#7a6534;border:1px solid rgba(109,87,38,.45);padding:1px 4px;}
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
/* an "or" between alternatives for the same slot, indented under the group */
.rt-gear-or{font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;
  text-transform:uppercase;color:#8a6f31;padding:1px 0 1px 10px;}
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
  background:linear-gradient(180deg,rgba(11,17,13,.96),#0b110d);
  border-top:1px solid var(--brass-dim);
  backdrop-filter:blur(7px);
  padding:10px 14px;padding-bottom:calc(10px + env(safe-area-inset-bottom));}
.rt-nav::before{content:"";position:absolute;left:0;right:0;top:-1px;height:1px;
  background:linear-gradient(90deg,transparent,var(--brass) 22%,var(--brass) 78%,transparent);
  opacity:.7;}
.rt-nav-in{max-width:760px;margin:0 auto;display:flex;gap:8px;align-items:center;}
.rt-nav .rt-btn{flex:1;padding:12px;}

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

/* ============================= RESPONSIVE =============================
   Mobile-first single column. The tab rail is kept at every size — it
   just stops scrolling once the tabs fit. */

@media (max-width:399px){
  .rt-croll{display:none;}                       /* raw roll is the first to go */
  .rt-derived{grid-template-columns:repeat(2,1fr);}
  .rt-cval{font-size:21px;min-width:34px;}
}

@media (min-width:700px){
  .rt-idcard{gap:18px;}
  .rt-portrait-wrap{width:118px;}
  .rt-port-img{height:134px;font-size:54px;}
  /* a name field has no business being 1100px wide */
  .rt-intro{max-width:520px;}
}

@media (min-width:900px){
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

export default function RogueTraderBuilder() {
  const [name, setName] = useState('');
  const [sel, setSel] = useState({});          // stepId -> optionId
  const [choices, setChoices] = useState({});  // choiceId -> option label
  const [rolls, setRolls] = useState(null);    // characteristic base values
  const [woundRoll, setWoundRoll] = useState(null);
  const [fateRoll, setFateRoll] = useState(null);
  const [stepIx, setStepIx] = useState(0);     // 0..5 origin, 6 characteristics, 7 dossier
  const [avatar, setAvatar] = useState(null);  // { src, framing }
  const [roster, setRoster] = useState([]);
  const [charId, setCharId] = useState(null);  // null = unsaved sheet
  const [rosterOpen, setRosterOpen] = useState(false);
  const [rosterErr, setRosterErr] = useState('');
  const [voxOpen, setVoxOpen] = useState(false);
  const [voxText, setVoxText] = useState('');
  const [loaded, setLoaded] = useState(false);

  const vox = useVoxEngine();

  /* ---- persistence ---- */
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get('rt-builder:current');
        if (res && res.value) {
          const s = JSON.parse(res.value);
          setName(s.name || ''); setSel(s.sel || {}); setChoices(s.choices || {});
          setRolls(s.rolls || null); setWoundRoll(s.woundRoll ?? null); setFateRoll(s.fateRoll ?? null);
        }
      } catch (e) { /* nothing saved yet */ }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      try {
        const p = window.storage.set('rt-builder:current',
          JSON.stringify({ name, sel, choices, rolls, woundRoll, fateRoll }));
        if (p && p.catch) p.catch(() => {});
      } catch (e) { /* storage unavailable, build continues in memory */ }
    }, 400);
    return () => clearTimeout(t);
  }, [name, sel, choices, rolls, woundRoll, fateRoll, loaded]);

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
        push(out.skills, chosen.skills); push(out.talents, chosen.talents); push(out.notes, chosen.notes);
        out.profit += chosen.profit || 0;
        out.bonusFate += chosen.fate || 0;
      });
    });
    return out;
  }, [sel, choices]);

  const home = build.picked.home;
  const career = build.picked.career;

  const totals = useMemo(() => {
    if (!rolls) return null;
    const t = {};
    CHAR_KEYS.forEach((k) => { t[k] = (rolls[k] || 0) + (build.mods[k] || 0); });
    return t;
  }, [rolls, build.mods]);

  const tBonus = totals ? Math.floor(totals.t / 10) : null;
  const wounds = (tBonus != null && woundRoll != null)
    ? tBonus * 2 + woundRoll + build.bonusWounds : null;
  const fatePoints = (fateRoll != null && home)
    ? (home.fateTable.find(([max]) => fateRoll <= max) || [0, 3])[1] + build.bonusFate : null;
  const profitFactor = 20 + build.profit;

  /* ---- actions ---- */
  const choose = (stepId, id) => {
    setSel((p) => ({ ...p, [stepId]: id }));
    if (stepId === 'home') setWoundRoll(null);
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
    setName(''); setSel({}); setChoices({}); setRolls(null); setWoundRoll(null); setFateRoll(null);
    setAvatar(null);
    setStepIx(0);
  };

  /* ---- roster: save / open / delete / start fresh ---- */

  useEffect(() => { setRoster(readRoster()); }, []);

  const saveCharacter = () => {
    const id = charId || newId();
    const next = upsert(roster, {
      id,
      name: name || 'Unnamed adept',
      career: career ? career.name : null,
      updatedAt: Date.now(),
      state: { name, sel, choices, rolls, woundRoll, fateRoll, avatar }
    });
    if (!writeRoster(next)) {
      setRosterErr('Could not save — browser storage is full. A large portrait is the usual cause.');
      return;
    }
    setRosterErr('');
    setRoster(next);
    setCharId(id);
  };

  const openCharacter = (id) => {
    const c = roster.find((x) => x.id === id);
    if (!c) return;
    const s = c.state || {};
    setName(s.name || '');
    setSel(s.sel || {});
    setChoices(s.choices || {});
    setRolls(s.rolls || null);
    setWoundRoll(s.woundRoll ?? null);
    setFateRoll(s.fateRoll ?? null);
    setAvatar(s.avatar || null);
    setCharId(id);
    setRosterErr('');
    setStepIx(7);
  };

  const deleteCharacter = (id) => {
    const c = roster.find((x) => x.id === id);
    const label = c ? c.name : 'this character';
    if (!window.confirm(`Delete "${label}" permanently? This cannot be undone.`)) return;
    const next = removeChar(roster, id);
    writeRoster(next);
    setRoster(next);
    if (charId === id) setCharId(null);
  };

  const newCharacter = () => { clearAll(); setCharId(null); setRosterErr(''); };

  const stepDone = (i) => {
    if (i < 6) return !!sel[STEPS[i].id];
    if (i === 6) return !!rolls;
    return false;
  };

  const stepLabels = [...STEPS.map((s) => s.label), 'Characteristics', 'Dossier'];

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
            <button
              className={'rt-voxbtn' + (vox.speaking ? ' live' : '')}
              onClick={() => setVoxOpen(true)}
            >
              {vox.speaking ? '\u25CF VOX' : 'VOX'}
            </button>
          </div>
        </div>
      </header>

      <div className="rt-wrap">
        <div className="rt-steps">
          {stepLabels.map((label, i) => (
            <button
              key={label}
              className={'rt-step' + (i === stepIx ? ' on' : stepDone(i) ? ' done' : '')}
              onClick={() => setStepIx(i)}
            >
              {stepDone(i) && i !== stepIx && <span className="tick">{'\u2713'}</span>}{label}
            </button>
          ))}
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
            onPreset={loadPreset}
          />
        )}

        {stepIx === 6 && (
          <CharacteristicsPane
            rolls={rolls} totals={totals} mods={build.mods}
            rollAll={rollAll} rerollOne={rerollOne}
            home={home} wounds={wounds} fatePoints={fatePoints}
            profitFactor={profitFactor} tBonus={tBonus}
          />
        )}

        {stepIx === 7 && (
          <DossierPane
            name={name} build={build} totals={totals}
            wounds={wounds} fatePoints={fatePoints} profitFactor={profitFactor}
            avatar={avatar} setAvatar={setAvatar}
            onClear={clearAll}
          />
        )}
      </div>

      <nav className="rt-nav">
        <div className="rt-nav-in">
          <button className="rt-btn ghost" disabled={stepIx === 0}
            onClick={() => setStepIx((i) => Math.max(0, i - 1))}>Back</button>
          <button className="rt-btn" disabled={stepIx === 7}
            onClick={() => setStepIx((i) => Math.min(7, i + 1))}>
            {stepIx === 6 ? 'View dossier' : 'Next'}
          </button>
        </div>
      </nav>

      {rosterOpen && (
        <RosterDialog
          roster={roster} currentId={charId} err={rosterErr}
          onSave={saveCharacter} onOpen={openCharacter}
          onDelete={deleteCharacter} onNew={newCharacter}
          onClose={() => setRosterOpen(false)}
        />
      )}

      {voxOpen && (
        <VoxPanel
          vox={vox} text={voxText} setText={setVoxText}
          onClose={() => setVoxOpen(false)}
          careerName={career ? career.name : null}
        />
      )}
    </div>
  );
}

const MAX_AVATAR_BYTES = 8 * 1024 * 1024;

/* ============================== GLOSSARY ==============================
   Plain-language summaries of Rogue Trader (FFG, 2009) skills and talents,
   written for this builder. They are a table reference, NOT the rulebook's
   own wording — check the core book before ruling on an edge case.
   Traits are not here: the data already stores them as "Name: effect". */

const GLOSSARY = {
  /* ---- skills ---- */
  'Awareness': 'Notice what others miss — a hidden figure, a wrong sound, a detail out of place. Basic Skill, so anyone may attempt it.',
  'Barter': 'Haggle. Talk a seller down or a buyer up on the price of goods.',
  'Charm': 'Win people over with warmth, flattery and presence.',
  'Command': 'Give orders that are actually obeyed, and rally those who follow you.',
  'Commerce': 'Read markets, cargo values and trade routes — the working knowledge of a voidfaring merchant. Advanced Skill.',
  'Common Lore': 'The everyday knowledge an insider of a given group or place would have. Advanced Skill, taken once per specialisation.',
  'Concealment': 'Hide yourself or an object from sight.',
  'Deceive': 'Lie well. Pass off a falsehood as truth, or a forgery as genuine.',
  'Dodge': 'Throw yourself clear of an incoming attack or hazard, as a Reaction.',
  'Evaluate': 'Judge what a thing is worth, and whether it is what it claims to be.',
  'Forbidden Lore': 'Knowledge the Imperium would rather you did not hold — xenos, the warp, heresy. Advanced Skill; simply having it can draw the wrong attention.',
  'Inquiry': 'Gather information by asking the right people the right questions.',
  'Intimidate': 'Get compliance through threat, menace or sheer physical presence.',
  'Invocation': 'Channel psychic power through rite and prayer. Advanced Skill.',
  'Literacy': 'Read and write. Advanced Skill — and rarer than outsiders assume; most Imperial citizens are illiterate.',
  'Logic': 'Reason a problem through, run the numbers, and spot what does not add up. Advanced Skill.',
  'Medicae': 'Treat wounds, poison and disease. Advanced Skill.',
  'Navigation': 'Plot a course and hold to it — across a surface, between stars, or through the warp. Advanced Skill.',
  'One Skill of the GM’s choosing': 'A deliberate blank. Agree with your GM which skill this becomes before play.',
  'Pilot': 'Fly or drive a craft or vehicle of the relevant class.',
  'Psyniscience': 'Perceive the warp directly — psychic presences, and where reality has worn thin. Advanced Skill, for psykers.',
  'Scholastic Lore': 'Formal, schooled learning of the sort taught rather than picked up. Advanced Skill.',
  'Secret Tongue': 'A restricted cant used within one organisation, opaque to outsiders. Advanced Skill.',
  'Sleight of Hand': 'Palm, plant, pick and conceal without being seen doing it.',
  'Speak Language': 'Speak and understand a given tongue. Advanced Skill, taken once per language.',
  'Survival': 'Stay alive away from civilisation — forage, shelter, read weather and track.',
  'Tech-Use': 'Operate, repair and appease machines, with the proper rites observed. Advanced Skill.',
  'Trade': 'A practical craft or profession, learned properly. Advanced Skill, taken once per trade.',

  /* ---- talents ---- */
  'Air of Authority': 'You carry the assumption of command, and can bend far more ordinary people to your will when you give orders.',
  'Armour of Contempt': 'Practised disdain for the warp and its works hardens you against the corruption such things leave behind.',
  'Basic Weapon Training': 'You are trained with that class of basic weapon, and no longer suffer the heavy penalty for firing it untrained.',
  'Dark Soul': 'Something in you has already turned toward the dark, and it changes how further corruption takes hold.',
  'Decadence': 'A lifetime of excess — you hold your drink and your indulgences far better than you should.',
  'Die Hard': 'You do not go quietly. You resist being put down and keep acting when others would drop.',
  'Enemy': 'A faction actively holds you in contempt. Expect worse treatment and active obstruction whenever they are involved.',
  'Foresight': 'You think before you act, taking time to plan a task rather than committing to it blind.',
  'Hardy': 'You heal as though lightly wounded even when badly hurt.',
  'Heightened Senses': 'One of your senses is unusually sharp, sharpening perception through it.',
  'Jaded': 'You have seen too much. Mundane horrors — corpses, carnage, the everyday brutality of the Imperium — no longer shake you.',
  'Leap Up': 'You get back on your feet fast, standing without it costing you your action.',
  'Light Sleeper': 'You wake instantly and completely, and are never caught truly asleep.',
  'Logis Implant': 'A cogitator woven into your mind, feeding you probabilities and letting you read a situation with machine precision.',
  'Melee Weapon Training': 'You are trained with that class of melee weapon, and no longer suffer the penalty for wielding it untrained.',
  'Navigator': 'You bear the Navigator gene and its third eye, and can read the Astronomican to steer a ship through the warp.',
  'Nerves of Steel': 'You hold together under fire, resisting being pinned down and shrugging off terror that would break others.',
  'Paranoia': 'You assume threat everywhere, and are correspondingly hard to catch unready.',
  'Peer': 'A faction thinks well of you. Dealing with its members goes markedly easier.',
  'Pistol Weapon Training': 'You are trained with that class of pistol, and no longer suffer the penalty for firing it untrained.',
  'Psy Rating 2': 'Your psychic strength, rated. It sets how much power you can safely push through a psychic discipline.',
  'Pure Faith': 'Genuine, unfeigned belief in the Emperor — a shield against the warp that cynics cannot raise.',
  'Quick Draw': 'You bring a weapon to hand fast enough that drawing it costs you nothing.',
  'Resistance': 'You are unusually hard to affect by one particular kind of threat — cold, poison, psychic assault, or similar.',
  'Rival': 'Someone with standing wants you to fail, and will spend effort to see it happen.',
  'Sound Constitution': 'You are simply harder to kill. Each time you take this, you gain another Wound.',
  'Talented': 'One skill is a natural gift, and you perform it markedly better than your training alone would explain.',
  'Technical Knock': 'You can clear a jammed weapon with a well-placed strike, in the time it takes to swing.',
  'Thrown Weapon Training': 'You are trained with that class of thrown weapon, and no longer suffer the penalty for using it untrained.',
  'Unremarkable': 'Nothing about you sticks in the memory. Witnesses struggle to describe you and crowds swallow you whole.',
  'Unshakeable Faith': 'Your belief holds where reason fails, letting you face the warp and its servants without breaking.',
  'Weapon Training': 'You are trained with the named weapon class, and no longer suffer the penalty for using it untrained.',

  /* ---- appears as a bare trait with no inline text ---- */
  'Mechanicus Implants': 'The standard augmetics of the Machine Cult — the potentia coil and its attendant implants that mark you as more machine than most.'
};

function GearItem({ label }) {
  const [open, setOpen] = useState(false);
  const { entry, quality } = gearInfo(label);
  const title = label.charAt(0).toUpperCase() + label.slice(1);

  if (!entry) return <li className="rt-entry"><span className="rt-entry-t">{title}</span></li>;

  return (
    <li className={'rt-entry' + (open ? ' open' : '')}>
      <button className="rt-entry-b" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="rt-entry-t">{title}</span>
        {entry.kind && <span className="rt-entry-c">{entry.kind}</span>}
        <span className="rt-entry-x" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
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

function GearList({ gear }) {
  const groups = parseGear(gear);
  return (
    <ul className="rt-list rt-gear">
      {groups.map((alts, i) => (
        <li key={i} className="rt-gear-g">
          <ul className="rt-gear-alts">
            {alts.map((label, j) => (
              <React.Fragment key={j}>
                {j > 0 && <li className="rt-gear-or">or</li>}
                <GearItem label={label} />
              </React.Fragment>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

const CHAR_TAG = /\s*\((WS|BS|S|T|Ag|Int|Per|WP|Fel)\)\s*$/;

/* Splits a list entry into something explainable.
   "Caves of Steel: Tech-Use counts as a Basic Skill." -> title + its own body
   "Common Lore (Machine Cult, Tech) (Int)" -> Common Lore, spec, Int
   Returns body:null when nothing is known, so the caller can render it flat. */
function explainEntry(entry) {
  const colon = entry.indexOf(': ');
  if (colon > 0) {
    return { title: entry.slice(0, colon), body: entry.slice(colon + 2), char: null, spec: null };
  }
  const charMatch = entry.match(CHAR_TAG);
  const stripped = entry.replace(CHAR_TAG, '').trim();
  const paren = stripped.match(/^([^(]+)\((.*)\)$/);
  const baseName = (paren ? paren[1] : stripped).trim();
  return {
    title: stripped,
    body: GLOSSARY[baseName] || null,
    char: charMatch ? charMatch[1] : null,
    spec: paren ? paren[2].trim() : null
  };
}

/* One list row. Clickable only when there is something to say. */
function Entry({ text }) {
  const [open, setOpen] = useState(false);
  const { title, body, char, spec } = explainEntry(text);

  if (!body) {
    return (
      <li className="rt-entry">
        <span className="rt-entry-t">{title}</span>
        {char && <span className="rt-entry-c">{char}</span>}
      </li>
    );
  }
  return (
    <li className={'rt-entry' + (open ? ' open' : '')}>
      <button className="rt-entry-b" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="rt-entry-t">{title}</span>
        {char && <span className="rt-entry-c">{char}</span>}
        <span className="rt-entry-x" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
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

function RosterDialog({ roster, currentId, onSave, onOpen, onDelete, onNew, onClose, err }) {
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

      {roster.length === 0 ? (
        <p className="rt-vox-hint">
          Nothing saved yet. Save the character you are building, or start a fresh sheet.
        </p>
      ) : (
        <ul className="rt-roster-l">
          {roster.map((c) => (
            <li key={c.id} className={'rt-roster-i' + (c.id === currentId ? ' on' : '')}>
              <button className="rt-roster-n" onClick={() => { onOpen(c.id); close(); }}>
                <span className="rt-roster-nm">{c.name || 'Unnamed adept'}</span>
                <span className="rt-roster-mt">{c.career || 'No career'}</span>
              </button>
              <button className="rt-opt" onClick={() => onDelete(c.id)}>Delete</button>
            </li>
          ))}
        </ul>
      )}

      <div className="rt-btnrow">
        <button className="rt-btn ghost" onClick={() => { onNew(); close(); }}>New character</button>
        <button className="rt-btn" onClick={onSave}>Save current</button>
      </div>
    </dialog>
  );
}

/* ---------------------------- PORTRAIT PLATE ---------------------------- */

function PortraitPlate({ name, profitFactor, avatar, setAvatar }) {
  const fileRef = useRef(null);
  const [framerOpen, setFramerOpen] = useState(false);
  const [err, setErr] = useState('');

  const onFile = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';                     // let the same file be picked twice
    if (!file) return;
    if (!file.type.startsWith('image/')) return setErr('That is not an image file.');
    if (file.size > MAX_AVATAR_BYTES) return setErr('Image is over 8 MB. Pick a smaller one.');
    const reader = new FileReader();
    reader.onerror = () => setErr('Could not read that file.');
    reader.onload = () => {
      setErr('');
      setAvatar({ src: reader.result, framing: DEFAULT_FRAMING });
    };
    reader.readAsDataURL(file);
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
        <div className="rt-port-pf" title="Profit Factor">
          {profitFactor}<span>PF</span>
        </div>
      </div>

      <div className="rt-port-actions">
        <button className="rt-opt" onClick={() => fileRef.current && fileRef.current.click()}>
          {avatar && avatar.src ? 'Replace' : 'Upload'}
        </button>
        {avatar && avatar.src && (
          <button className="rt-opt" onClick={() => setFramerOpen(true)}>Frame</button>
        )}
        {/* ponytail: generation is a server call (see generate-avatar.js in
            shadow-run_builder). Upload is the whole local half of it. */}
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

/* ------------------------ CHARACTERISTIC SHEET ------------------------
   Parchment row sheet after the CRPG: code chip, full name, roll, total,
   modifier delta, bonus. onReroll is optional — the dossier renders the
   same sheet read-only rather than keeping a second copy of this markup. */

function StatSheet({ totals, mods, rolls, onReroll }) {
  return (
    <div className="rt-sheet rt-screen">
      <div className="rt-sheet-h">Characteristics</div>
      {CHAR_KEYS.map((k) => {
        const m = (mods && mods[k]) || 0;
        return (
          <div className="rt-row" key={k}>
            <span className="rt-code">{CHAR_SHORT[k]}</span>
            <span className="rt-cname">{CHAR_NAMES[k]}</span>
            {rolls && <span className="rt-croll">{rolls[k]}</span>}
            <span className="rt-cval">{totals[k]}</span>
            <span className={'rt-delta' + (m > 0 ? ' up' : m < 0 ? ' dn' : '')}>
              {m !== 0 && (m > 0 ? '▲+' : '▼') + m}
            </span>
            <span className="rt-cbon">{Math.floor(totals[k] / 10)}</span>
            {onReroll && (
              <button className="rt-reroll" onClick={() => onReroll(k)}
                aria-label={'Reroll ' + CHAR_NAMES[k]} title="Reroll">{'⟳'}</button>
            )}
          </div>
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

function StepPane({ step, selected, choices, onSelect, onChoose, showIntro, name, setName, onPreset }) {
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
          <div className="rt-btnrow">
            <button className="rt-btn ghost" onClick={onPreset}>Load Magos Linus-Theta 7</button>
          </div>
        </div>
      )}
      <h2 className="rt-h2">{step.label}</h2>
      <p className="rt-lead">{STEP_LEAD[step.id]}</p>
      <div className="rt-cards rt-screen">
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
      </div>
    </div>
  );
}

/* ----------------------- CHARACTERISTICS PANE ----------------------- */

function CharacteristicsPane({ rolls, totals, mods, rollAll, rerollOne, home, wounds, fatePoints, profitFactor, tBonus }) {
  return (
    <div>
      <h2 className="rt-h2">Characteristics</h2>
      <p className="rt-lead">
        Each characteristic is 2d10 + 25, then your Origin Path modifiers are applied on top.
        Reroll any single line if the dice have been unkind.
      </p>

      {!rolls && (
        <>
          {!home && <p className="rt-empty" style={{ marginBottom: 12 }}>
            Pick a Home World first so Wounds and Fate Points can be worked out.
          </p>}
          <button className="rt-btn wide" onClick={rollAll}>Roll characteristics</button>
        </>
      )}

      {rolls && totals && (
        <>
          <StatSheet totals={totals} mods={mods} rolls={rolls} onReroll={rerollOne} />

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

function DossierPane({ name, build, totals, wounds, fatePoints, profitFactor, avatar, setAvatar, onClear }) {
  const career = build.picked.career;
  // STEPS includes career, so build already folded its skills/talents/traits in
  // (and deduped them). Concatenating career.* again is what duplicated every
  // entry in these lists.
  const { skills: allSkills, talents: allTalents, traits: allTraits } = build;

  return (
    <div className="rt-dossier">
      <div className="rt-idcard">
        <PortraitPlate name={name} profitFactor={profitFactor}
          avatar={avatar} setAvatar={setAvatar} />
        <div className="rt-idtext">
          <h2 className="rt-h2">{name || 'Unnamed adept'}</h2>
          <p className="rt-lead">
            {career ? career.name : 'No career chosen'}
            {build.picked.home ? ' \u00B7 ' + build.picked.home.name : ''}
          </p>
          {/* The wounds bar used to run the full width with the gauges in a
              separate row below it. One strip, no dead space. */}
          <div className="rt-idstats">
            <div className="rt-wgauge">
              <div className="rt-wbar">
                <span />
                <b>{wounds ?? '\u2014'}{wounds != null ? ' / ' + wounds : ''}</b>
              </div>
              <div className="rt-der-k">WOUNDS</div>
            </div>
            <div className="rt-der"><div className="rt-der-v">{fatePoints ?? '\u2014'}</div><div className="rt-der-k">FATE</div></div>
            <div className="rt-der"><div className="rt-der-v">{profitFactor}</div><div className="rt-der-k">PROFIT</div></div>
            <div className="rt-der"><div className="rt-der-v">{allTalents.length}</div><div className="rt-der-k">TALENTS</div></div>
          </div>
        </div>
      </div>

      {totals && (
        <StatSheet totals={totals} mods={build.mods} />
      )}

      <div className="rt-sects">
      <div className="rt-sect">
        <div className="rt-sect-h">ORIGIN PATH</div>
        {STEPS.every((s) => !build.picked[s.id])
          ? <p className="rt-empty">Nothing chosen yet. Start at Home World.</p>
          : <ul className="rt-list">
            {STEPS.map((s) => build.picked[s.id] && (
              <li key={s.id}>{s.label}: {build.picked[s.id].name}</li>
            ))}
          </ul>}
      </div>

      <div className="rt-sect">
        <div className="rt-sect-h">SKILLS</div>
        {allSkills.length
          ? <ul className="rt-list">{allSkills.map((s, i) => <Entry key={i} text={s} />)}</ul>
          : <p className="rt-empty">Choose a career to fill this out.</p>}
      </div>

      <div className="rt-sect">
        <div className="rt-sect-h">TALENTS</div>
        {allTalents.length
          ? <ul className="rt-list">{allTalents.map((t, i) => <Entry key={i} text={t} />)}</ul>
          : <p className="rt-empty">Nothing yet.</p>}
      </div>

      {allTraits.length > 0 && (
        <div className="rt-sect">
          <div className="rt-sect-h">TRAITS AND QUIRKS</div>
          <ul className="rt-list">{allTraits.map((t, i) => <Entry key={i} text={t} />)}</ul>
        </div>
      )}

      {build.notes.length > 0 && (
        <div className="rt-sect">
          <div className="rt-sect-h">TO RESOLVE AT THE TABLE</div>
          <ul className="rt-list">{build.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}

      {career && (
        <div className="rt-sect">
          <div className="rt-sect-h">STARTING GEAR</div>
          <GearList gear={career.gear} />
        </div>
      )}
      </div>

      <div className="rt-btnrow">
        <button className="rt-btn ghost" onClick={onClear}>Start over</button>
      </div>
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
