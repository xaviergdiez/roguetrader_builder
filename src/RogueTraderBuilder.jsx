import React, { useState, useEffect, useRef, useMemo } from 'react';

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
  choices: { fw_purpose: 'Intelligence', sv_a: 'Logic as a trained Basic Skill', sv_b: '+3 Intelligence', rn: 'Free-thinker (+3 Int)', cl: 'Hardy' }
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
.rt-root{--void:#080b10;--panel:#101620;--panel2:#161d29;--rim:#2c3646;
  --gold:#c59b27;--gold-lit:#e8cf7a;--parch:#d9d0bd;--dim:#8b8577;
  --rust:#8c3a1f;--sig:#5fd8c4;
  background:var(--void);color:var(--parch);min-height:100vh;
  font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
  -webkit-font-smoothing:antialiased;}
.rt-root *{box-sizing:border-box;}
.rt-wrap{max-width:760px;margin:0 auto;padding:0 14px 130px;}

.rt-head{position:sticky;top:0;z-index:20;background:linear-gradient(180deg,#0d121a 60%,rgba(13,18,26,.92));
  border-bottom:1px solid var(--rim);padding:10px 14px 9px;}
.rt-head-in{max-width:760px;margin:0 auto;display:flex;align-items:center;gap:10px;}
.rt-sigil{width:34px;height:34px;flex:none;border:1px solid var(--gold);background:#0b1017;
  display:grid;place-items:center;color:var(--gold);}
.rt-title{font-size:15px;letter-spacing:.06em;color:var(--gold-lit);margin:0;line-height:1.15;}
.rt-sub{font-size:10.5px;color:var(--dim);letter-spacing:.14em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}
.rt-voxbtn{margin-left:auto;flex:none;border:1px solid var(--sig);color:var(--sig);background:#08201d;
  padding:8px 12px;font-size:12px;letter-spacing:.1em;cursor:pointer;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}
.rt-voxbtn:active{background:#0c2f2a;}
.rt-voxbtn.live{border-color:var(--gold);color:#0b0f14;background:var(--gold-lit);}

.rt-steps{display:flex;gap:6px;overflow-x:auto;padding:10px 0 12px;scrollbar-width:none;}
.rt-steps::-webkit-scrollbar{display:none;}
.rt-step{flex:none;border:1px solid var(--rim);background:var(--panel);color:var(--dim);
  padding:7px 11px;font-size:12px;white-space:nowrap;cursor:pointer;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.04em;}
.rt-step.done{color:var(--parch);border-color:#3f4c60;}
.rt-step.on{background:var(--gold);border-color:var(--gold);color:#0b0f14;}
.rt-step .tick{color:var(--sig);margin-right:5px;}
.rt-step.on .tick{color:#0b0f14;}

.rt-lead{font-size:13.5px;line-height:1.55;color:var(--dim);margin:2px 0 14px;}
.rt-h2{font-size:19px;color:var(--gold-lit);margin:0 0 2px;letter-spacing:.02em;}

.rt-card{border:1px solid var(--rim);background:var(--panel);padding:13px 14px;margin-bottom:9px;
  cursor:pointer;transition:border-color .12s,background .12s;}
.rt-card:active{background:var(--panel2);}
.rt-card.sel{border-color:var(--gold);background:#1a1c17;box-shadow:inset 0 0 0 1px rgba(197,155,39,.25);}
.rt-card-h{display:flex;align-items:baseline;gap:8px;}
.rt-card-n{font-size:16px;color:var(--gold-lit);}
.rt-card.sel .rt-card-n{color:var(--gold-lit);}
.rt-card-b{font-size:13px;line-height:1.5;color:var(--dim);margin-top:5px;}
.rt-mods{display:flex;flex-wrap:wrap;gap:5px;margin-top:9px;}
.rt-mod{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;padding:2px 6px;
  border:1px solid #3a4454;color:var(--parch);}
.rt-mod.up{border-color:#3f6b4f;color:#8fd6a5;}
.rt-mod.dn{border-color:#6b3535;color:#e08e8e;}

.rt-detail{margin-top:11px;padding-top:11px;border-top:1px dashed var(--rim);}
.rt-dl{font-size:12px;color:var(--dim);line-height:1.55;margin:0 0 7px;}
.rt-dl b{color:var(--parch);font-weight:400;}
.rt-choice-l{font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  color:var(--gold);letter-spacing:.06em;margin:11px 0 6px;}
.rt-opts{display:flex;flex-wrap:wrap;gap:6px;}
.rt-opt{border:1px solid var(--rim);background:#0d1219;color:var(--parch);font-size:12.5px;
  padding:6px 10px;cursor:pointer;font-family:inherit;}
.rt-opt.on{background:var(--gold);border-color:var(--gold);color:#0b0f14;}

.rt-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;}
.rt-stat{border:1px solid var(--rim);background:var(--panel);padding:9px 8px;text-align:center;}
.rt-stat-k{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10.5px;
  color:var(--gold);letter-spacing:.1em;}
.rt-stat-v{font-size:26px;line-height:1.15;color:var(--parch);}
.rt-stat-m{font-size:10.5px;color:var(--dim);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}
.rt-stat-m .plus{color:#8fd6a5;}
.rt-stat-m .minus{color:#e08e8e;}
.rt-reroll{margin-top:6px;width:100%;border:1px solid var(--rim);background:#0d1219;color:var(--dim);
  font-size:10.5px;padding:3px;cursor:pointer;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}

.rt-btn{border:1px solid var(--gold);background:#1a1509;color:var(--gold-lit);padding:11px 14px;
  font-size:13.5px;cursor:pointer;font-family:inherit;letter-spacing:.03em;}
.rt-btn:active{background:#251e0c;}
.rt-btn.ghost{border-color:var(--rim);background:var(--panel);color:var(--dim);}
.rt-btn.wide{width:100%;}
.rt-btn:disabled{opacity:.35;cursor:default;}
.rt-btnrow{display:flex;gap:8px;margin:14px 0;}
.rt-btnrow .rt-btn{flex:1;}

.rt-derived{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:12px 0;}
.rt-der{border:1px solid var(--rim);background:var(--panel);padding:9px 6px;text-align:center;}
.rt-der-v{font-size:22px;color:var(--gold-lit);}
.rt-der-k{font-size:9.5px;color:var(--dim);letter-spacing:.09em;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}

.rt-sect{border:1px solid var(--rim);background:var(--panel);padding:13px 14px;margin-bottom:9px;}
.rt-sect-h{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:var(--gold);
  letter-spacing:.12em;margin-bottom:8px;}
.rt-list{margin:0;padding-left:17px;font-size:13px;line-height:1.65;}
.rt-list li{margin-bottom:2px;}
.rt-para{font-size:13px;line-height:1.6;margin:0;}
.rt-empty{font-size:13px;color:var(--dim);font-style:italic;}

.rt-field{width:100%;background:#0b1017;border:1px solid var(--rim);color:var(--parch);
  padding:10px 11px;font-size:15px;font-family:inherit;}
.rt-field:focus{outline:2px solid var(--gold);outline-offset:-1px;}

.rt-nav{position:fixed;left:0;right:0;bottom:0;z-index:25;background:#0b0f16;
  border-top:1px solid var(--rim);padding:9px 14px;padding-bottom:calc(9px + env(safe-area-inset-bottom));}
.rt-nav-in{max-width:760px;margin:0 auto;display:flex;gap:8px;align-items:center;}
.rt-nav .rt-btn{flex:1;padding:10px;}

/* ---- vox drawer ---- */
.rt-scrim{position:fixed;inset:0;background:rgba(4,6,9,.72);z-index:40;}
.rt-vox{position:fixed;left:0;right:0;bottom:0;z-index:41;background:#0b1218;
  border-top:1px solid var(--sig);max-height:88vh;overflow-y:auto;
  padding:14px 14px calc(18px + env(safe-area-inset-bottom));}
.rt-vox-in{max-width:760px;margin:0 auto;}
.rt-vox-h{display:flex;align-items:center;gap:9px;margin-bottom:4px;}
.rt-vox-t{font-size:15px;color:var(--sig);letter-spacing:.05em;}
.rt-close{margin-left:auto;background:none;border:1px solid var(--rim);color:var(--dim);
  width:30px;height:30px;font-size:16px;cursor:pointer;line-height:1;}
.rt-vox-hint{font-size:11.5px;color:var(--dim);margin:0 0 11px;line-height:1.5;}
.rt-ta{width:100%;min-height:104px;background:#070c11;border:1px solid var(--rim);color:var(--sig);
  padding:11px;font-size:14px;line-height:1.5;resize:vertical;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}
.rt-ta:focus{outline:2px solid var(--sig);outline-offset:-1px;}
.rt-slider{width:100%;accent-color:#c59b27;margin:3px 0 9px;}
.rt-sl-l{display:flex;justify-content:space-between;font-size:11px;color:var(--dim);
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.05em;}
.rt-select{width:100%;background:#0b1017;border:1px solid var(--rim);color:var(--parch);
  padding:9px;font-size:13px;font-family:inherit;margin-bottom:10px;}
.rt-quick{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 4px;}
.rt-speak{border:1px solid var(--sig);background:#0a2a26;color:var(--sig);padding:13px;
  font-size:14px;letter-spacing:.09em;cursor:pointer;width:100%;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}
.rt-speak:disabled{opacity:.45;cursor:default;}
.rt-speak.stop{border-color:var(--rust);background:#2a1109;color:#e5a086;}
.rt-warn{border:1px solid var(--rust);background:#1c0f0a;color:#e5a086;padding:10px;
  font-size:12.5px;line-height:1.5;margin-bottom:11px;}
@media (prefers-reduced-motion:reduce){.rt-root *{transition:none!important;}}
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
    setStepIx(6);
  };

  const clearAll = () => {
    setName(''); setSel({}); setChoices({}); setRolls(null); setWoundRoll(null); setFateRoll(null);
    setStepIx(0);
  };

  /* ---- dossier text for the vox ---- */
  const dossierText = () => {
    const who = name || 'Unnamed adept';
    const lines = [`${who}. ${career ? career.name : 'Career unassigned'}.`];
    if (home) lines.push(`Origin: ${home.name}.`);
    const path = ['birthright', 'lure', 'trials', 'motivation']
      .map((k) => build.picked[k] && build.picked[k].name).filter(Boolean);
    if (path.length) lines.push(`Path: ${path.join(', ')}.`);
    if (totals) {
      lines.push('Characteristics. ' + CHAR_KEYS.map((k) => `${CHAR_NAMES[k]} ${totals[k]}`).join('. ') + '.');
    }
    if (wounds != null) lines.push(`Wounds ${wounds}. Fate points ${fatePoints}. Profit factor ${profitFactor}.`);
    lines.push('Praise the Omnissiah. The flesh is weak.');
    return lines.join(' ');
  };

  const openVox = (preset) => {
    if (preset) setVoxText(preset);
    else if (!voxText.trim()) setVoxText(dossierText());
    setVoxOpen(true);
  };

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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="12" cy="12" r="4" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M19.1 4.9l-2.8 2.8M7.7 16.3l-2.8 2.8" />
            </svg>
          </div>
          <div>
            <h1 className="rt-title">Origin Path Cogitator</h1>
            <div className="rt-sub">ROGUE TRADER / KORONUS EXPANSE</div>
          </div>
          <button
            className={'rt-voxbtn' + (vox.speaking ? ' live' : '')}
            onClick={() => openVox()}
          >
            {vox.speaking ? '\u25CF VOX' : 'VOX'}
          </button>
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
            onSpeak={() => openVox(dossierText())}
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

      {voxOpen && (
        <VoxPanel
          vox={vox} text={voxText} setText={setVoxText}
          onClose={() => setVoxOpen(false)}
          onDossier={() => setVoxText(dossierText())}
          careerName={career ? career.name : null}
        />
      )}
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
        <div style={{ marginBottom: 18 }}>
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
          <div className="rt-grid">
            {CHAR_KEYS.map((k) => {
              const m = mods[k] || 0;
              return (
                <div className="rt-stat" key={k}>
                  <div className="rt-stat-k">{CHAR_SHORT[k]}</div>
                  <div className="rt-stat-v">{totals[k]}</div>
                  <div className="rt-stat-m">
                    {rolls[k]}
                    {m !== 0 && <span className={m > 0 ? 'plus' : 'minus'}> {m > 0 ? '+' : ''}{m}</span>}
                    {' \u00B7 '}bonus {Math.floor(totals[k] / 10)}
                  </div>
                  <button className="rt-reroll" onClick={() => rerollOne(k)}>reroll</button>
                </div>
              );
            })}
          </div>

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

function DossierPane({ name, build, totals, wounds, fatePoints, profitFactor, onSpeak, onClear }) {
  const career = build.picked.career;
  const allSkills = [...(career ? career.skills : []), ...build.skills];
  const allTalents = [...(career ? career.talents : []), ...build.talents];
  const allTraits = [...(career && career.traits ? career.traits : []), ...build.traits];

  return (
    <div>
      <h2 className="rt-h2">{name || 'Unnamed adept'}</h2>
      <p className="rt-lead">
        {career ? career.name : 'No career chosen'}
        {build.picked.home ? ' \u00B7 ' + build.picked.home.name : ''}
      </p>

      {totals && (
        <div className="rt-grid" style={{ marginBottom: 12 }}>
          {CHAR_KEYS.map((k) => (
            <div className="rt-stat" key={k}>
              <div className="rt-stat-k">{CHAR_SHORT[k]}</div>
              <div className="rt-stat-v">{totals[k]}</div>
              <div className="rt-stat-m">bonus {Math.floor(totals[k] / 10)}</div>
            </div>
          ))}
        </div>
      )}

      {totals && (
        <div className="rt-derived">
          <div className="rt-der"><div className="rt-der-v">{wounds ?? '\u2014'}</div><div className="rt-der-k">WOUNDS</div></div>
          <div className="rt-der"><div className="rt-der-v">{fatePoints ?? '\u2014'}</div><div className="rt-der-k">FATE</div></div>
          <div className="rt-der"><div className="rt-der-v">{profitFactor}</div><div className="rt-der-k">PROFIT</div></div>
          <div className="rt-der"><div className="rt-der-v">{allTalents.length}</div><div className="rt-der-k">TALENTS</div></div>
        </div>
      )}

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
          ? <ul className="rt-list">{allSkills.map((s, i) => <li key={i}>{s}</li>)}</ul>
          : <p className="rt-empty">Choose a career to fill this out.</p>}
      </div>

      <div className="rt-sect">
        <div className="rt-sect-h">TALENTS</div>
        {allTalents.length
          ? <ul className="rt-list">{allTalents.map((t, i) => <li key={i}>{t}</li>)}</ul>
          : <p className="rt-empty">Nothing yet.</p>}
      </div>

      {allTraits.length > 0 && (
        <div className="rt-sect">
          <div className="rt-sect-h">TRAITS AND QUIRKS</div>
          <ul className="rt-list">{allTraits.map((t, i) => <li key={i}>{t}</li>)}</ul>
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
          <p className="rt-para">{career.gear}</p>
        </div>
      )}

      <div className="rt-btnrow">
        <button className="rt-btn" onClick={onSpeak}>Read this aloud</button>
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

function VoxPanel({ vox, text, setText, onClose, onDossier, careerName }) {
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
            <button className="rt-opt" onClick={onDossier}>Insert dossier</button>
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
