// Career advance tables, Ranks 1-4.
//
// Source of truth: the Rogue Trader career advance tables supplied for this
// project. All eight careers in CAREERS are covered for Ranks 1-4. A career
// outside that set — an Into the Storm xenos path, say — returns null rather
// than an empty list, so the caller can tell "no table" from "nothing at
// this rank".
//
// Pure: see advances.check.mjs.

// [name, type, prerequisite, cost]. null prerequisite means none.
const A = (name, type, prereq, cost) => ({ name, type, prereq, cost });

export const CAREER_ADVANCES = {
  'Rogue Trader': {
    1: [
      A('Awareness', 'Skill', null, 100),
      A('Charm', 'Skill', null, 100),
      A('Command', 'Skill', null, 100),
      A('Commerce', 'Skill', null, 100),
      A('Common Lore (Imperium)', 'Skill', null, 100),
      A('Evaluate', 'Skill', null, 100),
      A('Literacy', 'Skill', null, 100),
      A('Scholastic Lore (Astromancy)', 'Skill', null, 100),
      A('Scrutiny', 'Skill', null, 100),
      A('Secret Tongue (Rogue Trader)', 'Skill', null, 200),
      A('Dodge', 'Skill', null, 100),
      A('Air of Authority', 'Talent', 'Fel 30', 200),
      A('Quick Draw', 'Talent', null, 200),
      A('Renowned Warrant', 'Talent', null, 200),
      A('Melee Weapon Training (Universal)', 'Talent', null, 500),
      A('Pistol Weapon Training (Universal)', 'Talent', null, 500)
    ],
    2: [
      A('Awareness +10', 'Skill', 'Awareness', 200),
      A('Charm +10', 'Skill', 'Charm', 200),
      A('Command +10', 'Skill', 'Command', 200),
      A('Commerce +10', 'Skill', 'Commerce', 200),
      A('Evaluate +10', 'Skill', 'Evaluate', 200),
      A('Inquiry', 'Skill', null, 100),
      A('Scrutiny +10', 'Skill', 'Scrutiny', 200),
      A('Decadence', 'Talent', 'T 30', 200),
      A('Iron Discipline', 'Talent', 'WP 30, Command', 500),
      A('Peer (Nobility)', 'Talent', 'Fel 30', 300),
      A('Sound Constitution (x2)', 'Talent', null, 200)
    ],
    3: [
      A('Awareness +20', 'Skill', 'Awareness +10', 200),
      A('Charm +20', 'Skill', 'Charm +10', 200),
      A('Command +20', 'Skill', 'Command +10', 200),
      A('Dodge +10', 'Skill', 'Dodge', 200),
      A('Inquiry +10', 'Skill', 'Inquiry', 200),
      A('Scrutiny +20', 'Skill', 'Scrutiny +10', 200),
      A('Inspirational Leader', 'Talent', 'Fel 35', 500),
      A('Master & Commander', 'Talent', 'Command +10', 500),
      A('Peer (Military)', 'Talent', 'Fel 30', 300),
      A('Sound Constitution (x2)', 'Talent', null, 200)
    ],
    4: [
      A('Commerce +20', 'Skill', 'Commerce +10', 200),
      A('Dodge +20', 'Skill', 'Dodge +10', 200),
      A('Evaluate +20', 'Skill', 'Evaluate +10', 200),
      A('Inquiry +20', 'Skill', 'Inquiry +10', 200),
      A('Eye of Vengeance', 'Talent', 'BS 50', 500),
      A('Infused Knowledge', 'Talent', 'Int 40', 500),
      A('Polyglot', 'Talent', 'Int 30, Fel 30', 500),
      A('Sound Constitution (x2)', 'Talent', null, 200)
    ],
    5: [
      A('Deceive +20', 'Skill', 'Deceive +10', 200),
      A('Intimidate +20', 'Skill', 'Intimidate +10', 200),
      A('Scholastic Lore (Imperial Warrants) +20', 'Skill', null, 200),
      A('Into the Jaws of Hell', 'Talent', 'Iron Discipline', 500),
      A('Lightning Attack', 'Talent', 'Swift Attack', 500)
    ],
    6: [
      A('Call of Iron', 'Talent', 'Command +20, Fel 40', 500),
      A('Lead from the Front', 'Talent', 'Command +20, Fel 40', 500),
      A('Master Orator', 'Talent', 'Fel 30', 500),
      A('Peer (Rogue Traders)', 'Talent', 'Fel 30', 300)
    ],
    7: [
      A('Legendary Warrant', 'Talent', 'Renowned Warrant', 500),
      A('Supreme Command', 'Talent', 'Master & Commander', 500),
      A('Sound Constitution (×3)', 'Talent', null, 200)
    ],
    8: [
      A('Arch-Commander of the Void', 'Trait', 'Supreme Command, Fel 50', 1000),
      A('Untouchable Reputation', 'Talent', 'Fel 50', 500)
    ]
  },

  'Explorator': {
    1: [
      A('Awareness', 'Skill', null, 100),
      A('Common Lore (Machine Cult)', 'Skill', null, 100),
      A('Common Lore (Tech)', 'Skill', null, 100),
      A('Forbidden Lore (Adeptus Mechanicus)', 'Skill', null, 100),
      A('Forbidden Lore (Archeotech)', 'Skill', null, 100),
      A('Logic', 'Skill', null, 100),
      A('Tech-Use', 'Skill', null, 100),
      A('Trade (Technomat)', 'Skill', null, 100),
      A('Security', 'Skill', null, 200),
      A('Autosanguine', 'Talent', 'Mechanicus Implants', 200),
      A('Logis Implant', 'Talent', 'Mechanicus Implants', 200),
      A('Technical Knock', 'Talent', 'Int 30', 200),
      A('Basic Weapon Training (Universal)', 'Talent', null, 500),
      A('Melee Weapon Training (Universal)', 'Talent', null, 500)
    ],
    2: [
      A('Awareness +10', 'Skill', 'Awareness', 200),
      A('Dodge', 'Skill', null, 100),
      A('Forbidden Lore (Archeotech) +10', 'Skill', 'Forbidden Lore (Archeotech)', 200),
      A('Medicae', 'Skill', null, 100),
      A('Scrutiny', 'Skill', null, 100),
      A('Security +10', 'Skill', 'Security', 200),
      A('Tech-Use +10', 'Skill', 'Tech-Use', 200),
      A('Binary Chatter', 'Talent', 'Mechanicus Implants', 200),
      A('Electro-Graft Use', 'Talent', 'Mechanicus Implants', 200),
      A('Luminen Charge', 'Talent', 'Mechanicus Implants', 200),
      A('Mechadendrite Use (Universal)', 'Talent', 'Mechanicus Implants', 500),
      A('Sound Constitution (x2)', 'Talent', null, 200)
    ],
    3: [
      A('Awareness +20', 'Skill', 'Awareness +10', 200),
      A('Logic +10', 'Skill', 'Logic', 200),
      A('Medicae +10', 'Skill', 'Medicae', 200),
      A('Scrutiny +10', 'Skill', 'Scrutiny', 200),
      A('Security +20', 'Skill', 'Security +10', 200),
      A('Tech-Use +20', 'Skill', 'Tech-Use +10', 200),
      A('Ferric Lure', 'Talent', 'Mechanicus Implants', 200),
      A('Maglev Grace', 'Talent', 'Mechanicus Implants', 200),
      A('Rite of Fear', 'Talent', 'Mechanicus Implants', 500),
      A('Utility Mechadendrite', 'Talent', 'Mechadendrite Use', 500),
      A('Sound Constitution (x2)', 'Talent', null, 200)
    ],
    4: [
      A('Dodge +10', 'Skill', 'Dodge', 200),
      A('Forbidden Lore (Archeotech) +20', 'Skill', 'Forbidden Lore (Archeotech) +10', 200),
      A('Logic +20', 'Skill', 'Logic +10', 200),
      A('Scrutiny +20', 'Skill', 'Scrutiny +10', 200),
      A('Cyber-Terminal Interface', 'Talent', 'Tech-Use +10', 500),
      A('Master Engineer', 'Talent', 'Tech-Use +20', 500),
      A('Optical Mechadendrite', 'Talent', 'Mechadendrite Use', 500),
      A('Total Recall', 'Talent', 'Int 30', 200)
    ],
    5: [
      A('Medicae +20', 'Skill', 'Medicae +10', 200),
      A('Ballistic Mechadendrite', 'Talent', 'Mechadendrite Use', 500),
      A('Electro-Graft Surge', 'Talent', 'Electro-Graft Use', 500),
      A('Luminen Shock', 'Talent', 'Luminen Charge', 500)
    ],
    6: [
      A('Armour of Contempt', 'Talent', 'WP 40', 500),
      A('Infused Knowledge', 'Talent', 'Int 40', 500),
      A('Maglev Boost', 'Talent', 'Maglev Grace', 500)
    ],
    7: [
      A('Master of Archeotech', 'Talent', 'Forbidden Lore (Archeotech) +20', 500),
      A('Rite of Awe', 'Talent', 'Rite of Fear', 500)
    ],
    8: [
      A('Avatar of the Omnissiah', 'Trait', 'Mechanicus Implants, T 50, Int 50', 1000),
      A('Graviton Anchor', 'Talent', 'Ferric Lure', 500)
    ]
  },

  'Arch-Militant': {
    1: [
      A('Awareness +10', 'Skill', 'Awareness', 200),
      A('Common Lore (War)', 'Skill', null, 100),
      A('Drive (Ground Vehicle)', 'Skill', null, 100),
      A('Intimidate', 'Skill', null, 100),
      A('Secret Tongue (Military)', 'Skill', null, 200),
      A('Quick Draw', 'Talent', null, 200),
      A('Weapon Master', 'Talent', 'BS 30 or WS 30', 500),
      A('Basic Weapon Training (Universal)', 'Talent', null, 500),
      A('Melee Weapon Training (Universal)', 'Talent', null, 500),
      A('Pistol Weapon Training (Universal)', 'Talent', null, 500)
    ],
    2: [
      A('Awareness +20', 'Skill', 'Awareness +10', 200),
      A('Common Lore (War) +10', 'Skill', 'Common Lore (War)', 200),
      A('Dodge +10', 'Skill', 'Dodge', 200),
      A('Intimidate +10', 'Skill', 'Intimidate', 200),
      A('Scrutiny', 'Skill', null, 100),
      A('Survival', 'Skill', null, 100),
      A('Bulging Biceps', 'Talent', 'S 45', 200),
      A('Crushing Blow', 'Talent', 'S 40', 200),
      A('Hatred (choose one)', 'Talent', null, 300),
      A('Sound Constitution (x3)', 'Talent', null, 200)
    ],
    3: [
      A('Dodge +20', 'Skill', 'Dodge +10', 200),
      A('Intimidate +20', 'Skill', 'Intimidate +10', 200),
      A('Scrutiny +10', 'Skill', 'Scrutiny', 200),
      A('Survival +10', 'Skill', 'Survival', 200),
      A('Mighty Blow', 'Talent', 'Crushing Blow', 500),
      A('Swift Attack', 'Talent', 'WS 35', 500),
      A('Target Selection', 'Talent', 'BS 50', 500),
      A('Sound Constitution (x3)', 'Talent', null, 200)
    ],
    4: [
      A('Scrutiny +20', 'Skill', 'Scrutiny +10', 200),
      A('Survival +20', 'Skill', 'Survival +10', 200),
      A('Lightning Attack', 'Talent', 'Swift Attack', 500),
      A('Sharpshooter', 'Talent', 'BS 40', 500),
      A('Step Aside', 'Talent', 'Ag 40, Dodge', 500),
      A('True Grit', 'Talent', 'T 40', 500)
    ],
    5: [
      A('Common Lore (War) +20', 'Skill', 'Common Lore (War) +10', 200),
      A('Last Man Standing', 'Talent', 'Nerves of Steel', 500),
      A('Master at Arms', 'Talent', 'Weapon Master', 500),
      A('Sound Constitution (×4)', 'Talent', null, 200)
    ],
    6: [
      A('Eye of Vengeance', 'Talent', 'BS 50', 500),
      A('Wall of Steel', 'Talent', 'Ag 35', 500),
      A('Whirling Death', 'Talent', 'WS 45, Swift Attack', 500)
    ],
    7: [
      A('Deathdealer', 'Talent', 'Weapon Master', 500),
      A('Invulnerable Defense', 'Talent', 'Step Aside', 500)
    ],
    8: [
      A('One-Man War Machine', 'Trait', 'S 50, T 50, BS 50 or WS 50', 1000)
    ]
  },

  'Astropath Transcendent': {
    1: [
      A('Awareness', 'Skill', null, 100),
      A('Ciphers (Astropath Code)', 'Skill', null, 200),
      A('Forbidden Lore (Psykers)', 'Skill', null, 100),
      A('Forbidden Lore (Warp)', 'Skill', null, 100),
      A('Invocation', 'Skill', null, 100),
      A('Psyniscience', 'Skill', null, 100),
      A('Scholastic Lore (Cryptology)', 'Skill', null, 100),
      A('Psy Rating 1', 'Talent', null, 200),
      A('Psy Rating 2', 'Talent', 'Psy Rating 1', 200),
      A('Telepathic Jamming', 'Technique', 'Telepathy', 200),
      A('Pistol Weapon Training (Universal)', 'Talent', null, 500)
    ],
    2: [
      A('Awareness +10', 'Skill', 'Awareness', 200),
      A('Dodge', 'Skill', null, 100),
      A('Invocation +10', 'Skill', 'Invocation', 200),
      A('Psyniscience +10', 'Skill', 'Psyniscience', 200),
      A('Scrutiny', 'Skill', null, 100),
      A('Mind Link', 'Technique', 'Telepathy', 200),
      A('Psy Rating 3', 'Talent', 'Psy Rating 2', 300),
      A('Psychic Discipline (Divination or Telepathy)', 'Talent', null, 500),
      A('Sound Constitution (x2)', 'Talent', null, 200)
    ],
    3: [
      A('Awareness +20', 'Skill', 'Awareness +10', 200),
      A('Invocation +20', 'Skill', 'Invocation +10', 200),
      A('Psyniscience +20', 'Skill', 'Psyniscience +10', 200),
      A('Scrutiny +10', 'Skill', 'Scrutiny', 200),
      A('Psy Rating 4', 'Talent', 'Psy Rating 3', 300),
      A('Psychic Scream', 'Technique', 'Telepathy', 300),
      A('Strong Minded', 'Talent', 'WP 30', 500),
      A('Warp Sense', 'Talent', 'Psyniscience, WP 30', 500)
    ],
    4: [
      A('Dodge +10', 'Skill', 'Dodge', 200),
      A('Scrutiny +20', 'Skill', 'Scrutiny +10', 200),
      A('Compel', 'Technique', 'Telepathy', 500),
      A('Master Telepath', 'Talent', 'Telepathy', 500),
      A('Psy Rating 5', 'Talent', 'Psy Rating 4', 500),
      A('Rite of Sanctioning', 'Talent', 'Psy Rating 3', 500)
    ],
    5: [
      A('Forbidden Lore (Warp) +20', 'Skill', 'Forbidden Lore (Warp) +10', 200),
      A('Astral Telepathy', 'Power', 'Psy Rating 4', 500),
      A('Psy Rating 6', 'Talent', 'Psy Rating 5', 500)
    ],
    6: [
      A('Psy Rating 7', 'Talent', 'Psy Rating 6', 500),
      A('Warp Conduit', 'Talent', 'Psy Rating 5', 500)
    ],
    7: [
      A('Psy Rating 8', 'Talent', 'Psy Rating 7', 500),
      A('Soul Sentinel', 'Talent', 'WP 50', 500)
    ],
    8: [
      A('Voice of the Emperor', 'Trait', 'Psy Rating 8, WP 55', 1000)
    ]
  },

  'Seneschal': {
    1: [
      A('Awareness', 'Skill', null, 100),
      A('Barter', 'Skill', null, 100),
      A('Commerce', 'Skill', null, 100),
      A('Common Lore (Imperium)', 'Skill', null, 100),
      A('Deceive', 'Skill', null, 100),
      A('Evaluate', 'Skill', null, 100),
      A('Inquiry', 'Skill', null, 100),
      A('Literacy', 'Skill', null, 100),
      A('Secret Tongue (Rogue Trader)', 'Skill', null, 200),
      A('Seeker of Lore', 'Talent', null, 200),
      A('Unremarkable', 'Talent', null, 200),
      A('Basic Weapon Training (Universal)', 'Talent', null, 500),
      A('Pistol Weapon Training (Universal)', 'Talent', null, 500)
    ],
    2: [
      A('Awareness +10', 'Skill', 'Awareness', 200),
      A('Commerce +10', 'Skill', 'Commerce', 200),
      A('Dodge', 'Skill', null, 100),
      A('Evaluate +10', 'Skill', 'Evaluate', 200),
      A('Forbidden Lore (Inquisition)', 'Skill', null, 200),
      A('Inquiry +10', 'Skill', 'Inquiry', 200),
      A('Logic', 'Skill', null, 100),
      A('Scrutiny +10', 'Skill', 'Scrutiny', 200),
      A('Infused Knowledge', 'Talent', 'Int 40', 500),
      A('Peer (Academic)', 'Talent', 'Fel 30', 300),
      A('Sound Constitution (x2)', 'Talent', null, 200)
    ],
    3: [
      A('Awareness +20', 'Skill', 'Awareness +10', 200),
      A('Commerce +20', 'Skill', 'Commerce +10', 200),
      A('Dodge +10', 'Skill', 'Dodge', 200),
      A('Evaluate +20', 'Skill', 'Evaluate +10', 200),
      A('Inquiry +20', 'Skill', 'Inquiry +10', 200),
      A('Scrutiny +20', 'Skill', 'Scrutiny +10', 200),
      A('Polyglot', 'Talent', 'Int 30, Fel 30', 500),
      A('Whispers', 'Talent', 'Inquiry +10', 500),
      A('Sound Constitution (x2)', 'Talent', null, 200)
    ],
    4: [
      A('Barter +20', 'Skill', 'Barter +10', 200),
      A('Deceive +20', 'Skill', 'Deceive +10', 200),
      A('Logic +10', 'Skill', 'Logic', 200),
      A('Mastery (Commerce)', 'Talent', 'Commerce +20', 500),
      A('Talent for Deception', 'Talent', 'Deceive +10', 500)
    ],
    5: [
      A('Logic +20', 'Skill', 'Logic +10', 200),
      A('Cold Reader', 'Talent', 'Scrutiny +10', 500),
      A('Master of Shadow', 'Talent', 'Inquiry +20', 500)
    ],
    6: [
      A('Eyes Everywhere', 'Talent', 'Per 40', 500),
      A('Master Broker', 'Talent', 'Commerce +20', 500)
    ],
    7: [
      A('Spymaster of the Expanse', 'Talent', 'Master of Shadow', 500),
      A('Uncontested Trade', 'Talent', 'Master Broker', 500)
    ],
    8: [
      A('Invisible Hand', 'Trait', 'Int 50, Fel 50', 1000)
    ]
  },

  'Navigator': {
    // Powers: Novice = Lidless Stare, Seek the Path, In Touch with the Stream
    //         Adept  = Gaze into the Abyss, Held in the Gaze, Steer Through the Madness
    //         Master = Tears of the Emperor + mastered forms
    1: [
      A('Awareness', 'Skill', null, 100),
      A('Forbidden Lore (Mutants)', 'Skill', null, 100),
      A('Forbidden Lore (Warp)', 'Skill', null, 100),
      A('Navigation (Stellar)', 'Skill', null, 100),
      A('Navigation (Warp)', 'Skill', null, 100),
      A('Psyniscience', 'Skill', null, 100),
      A('Scholastic Lore (Astromancy)', 'Skill', null, 100),
      A('Secret Tongue (Navis Nobilite)', 'Skill', null, 200),
      A('Navigator', 'Talent', null, 200),
      A('Warp Sense', 'Talent', 'Psyniscience, WP 30', 200),
      A('Pistol Weapon Training (Universal)', 'Talent', null, 500),
      A('Lidless Stare (Novice)', 'Power', null, 200),
      A('Seek the Path (Novice)', 'Power', null, 200),
      A('In Touch with the Stream (Novice)', 'Power', null, 200)
    ],
    2: [
      A('Awareness +10', 'Skill', 'Awareness', 200),
      A('Dodge', 'Skill', null, 100),
      A('Forbidden Lore (Warp) +10', 'Skill', 'Forbidden Lore (Warp)', 200),
      A('Navigation (Warp) +10', 'Skill', 'Navigation (Warp)', 200),
      A('Psyniscience +10', 'Skill', 'Psyniscience', 200),
      A('Scrutiny', 'Skill', null, 100),
      A('Foresight', 'Talent', 'Int 30', 300),
      A('Resistance (Fear)', 'Talent', null, 200),
      A('Sound Constitution (x2)', 'Talent', null, 200),
      A('Gaze into the Abyss (Novice)', 'Power', 'Navigator, WP 30', 200),
      A('Held in the Gaze (Novice)', 'Power', 'Lidless Stare (Novice)', 200),
      A('Steer Through the Madness (Novice)', 'Power', 'Navigator, WP 30', 200)
    ],
    3: [
      A('Awareness +20', 'Skill', 'Awareness +10', 200),
      A('Dodge +10', 'Skill', 'Dodge', 200),
      A('Navigation (Warp) +20', 'Skill', 'Navigation (Warp) +10', 200),
      A('Psyniscience +20', 'Skill', 'Psyniscience +10', 200),
      A('Scrutiny +10', 'Skill', 'Scrutiny', 200),
      A('Inured to the Warp', 'Talent', 'WP 40', 500),
      A('Lidless Stare (Adept)', 'Power', 'Lidless Stare (Novice)', 300),
      A('Seek the Path (Adept)', 'Power', 'Seek the Path (Novice)', 300),
      A('Gaze into the Abyss (Adept)', 'Power', 'Gaze into the Abyss (Novice)', 300),
      A('Held in the Gaze (Adept)', 'Power', 'Held in the Gaze (Novice)', 300),
      A('Steer Through the Madness (Adept)', 'Power', 'Steer Through the Madness (Novice)', 300)
    ],
    4: [
      A('Scholastic Lore (Astromancy) +20', 'Skill', 'Scholastic Lore (Astromancy) +10', 200),
      A('Scrutiny +20', 'Skill', 'Scrutiny +10', 200),
      A('Master Navigator', 'Talent', 'Navigation (Warp) +20', 500),
      A('Unshakeable Faith', 'Talent', null, 500),
      A('In Touch with the Stream (Adept)', 'Power', 'In Touch with the Stream (Novice)', 300),
      A('Lidless Stare (Master)', 'Power', 'Lidless Stare (Adept)', 500),
      A('Steer Through the Madness (Master)', 'Power', 'Steer Through the Madness (Adept)', 500),
      A('Tears of the Emperor (Novice)', 'Power', 'WP 40, Navigator', 200)
    ],
    5: [
      A('Third Eye Unveiled', 'Power', 'Lidless Stare (Master)', 500)
    ],
    6: [
      A('Eye of the Eye', 'Power', 'Per 45', 500),
      A('Warp Storm Mastery', 'Power', 'Master Navigator', 500)
    ],
    7: [
      A('Eye of the Abyss', 'Power', 'Third Eye Unveiled', 500)
    ],
    8: [
      A('Lord of the Warp Currents', 'Trait', 'Per 55, WP 50', 1000)
    ]
  },

  'Missionary': {
    1: [
      A('Awareness', 'Skill', null, 100),
      A('Common Lore (Imperial Creed)', 'Skill', null, 100),
      A('Common Lore (Imperium)', 'Skill', null, 100),
      A('Forbidden Lore (Heresy)', 'Skill', null, 100),
      A('Medicae', 'Skill', null, 100),
      A('Scholastic Lore (Imperial Creed)', 'Skill', null, 100),
      A('Basic Weapon Training (Universal)', 'Talent', null, 500),
      A('Flame Weapon Training', 'Talent', null, 500),
      A('Melee Weapon Training (Universal)', 'Talent', null, 500),
      A('Pure Faith', 'Talent', null, 500),
      A('Unshakeable Faith', 'Talent', null, 200)
    ],
    2: [
      A('Awareness +10', 'Skill', 'Awareness', 200),
      A('Charm', 'Skill', null, 100),
      A('Common Lore (Imperial Creed) +10', 'Skill', 'Common Lore (Imperial Creed)', 200),
      A('Dodge', 'Skill', null, 100),
      A('Intimidate', 'Skill', null, 100),
      A('Medicae +10', 'Skill', 'Medicae', 200),
      A('Scrutiny', 'Skill', null, 100),
      A('Hatred (Psykers)', 'Talent', null, 300),
      A('Inspired Rhetoric', 'Talent', 'Charm', 300),
      A('Sound Constitution (x2)', 'Talent', null, 200)
    ],
    3: [
      A('Awareness +20', 'Skill', 'Awareness +10', 200),
      A('Charm +10', 'Skill', 'Charm', 200),
      A('Common Lore (Imperial Creed) +20', 'Skill', 'Common Lore (Imperial Creed) +10', 200),
      A('Dodge +10', 'Skill', 'Dodge', 200),
      A('Medicae +20', 'Skill', 'Medicae +10', 200),
      A('Scrutiny +10', 'Skill', 'Scrutiny', 200),
      A('Divine Ministration', 'Talent', 'Medicae +10', 500),
      A('Litany of Hate', 'Talent', 'Hatred', 500),
      A('Master Orator', 'Talent', 'Fel 30', 500)
    ],
    4: [
      A('Charm +20', 'Skill', 'Charm +10', 200),
      A('Dodge +20', 'Skill', 'Dodge +10', 200),
      A('Intimidate +20', 'Skill', 'Intimidate +10', 200),
      A('Flagellant', 'Talent', null, 500),
      A('Wrath of the Righteous', 'Talent', 'Pure Faith', 500)
    ],
    5: [
      A('Divine Cleansing', 'Talent', 'Flame Weapon Training', 500),
      A('Martyrdom', 'Talent', 'Pure Faith', 500)
    ],
    6: [
      A('Cleanse with Fire', 'Talent', 'Divine Cleansing', 500),
      A('Shield of Faith', 'Talent', 'Pure Faith', 500)
    ],
    7: [
      A('Saintly Touch', 'Talent', 'Pure Faith, Fel 50', 500)
    ],
    8: [
      A('Living Saint of the Expanse', 'Trait', 'Pure Faith, WP 50, Fel 50', 1000)
    ]
  },

  'Void-Master': {
    1: [
      A('Awareness', 'Skill', null, 100),
      A('Common Lore (Imperial Navy)', 'Skill', null, 100),
      A('Common Lore (War)', 'Skill', null, 100),
      A('Navigation (Stellar)', 'Skill', null, 100),
      A('Pilot (Flyers)', 'Skill', null, 100),
      A('Pilot (Space Craft)', 'Skill', null, 100),
      A('Scholastic Lore (Astromancy)', 'Skill', null, 100),
      A('Mastery of Small Craft', 'Talent', null, 200),
      A('Nerves of Steel', 'Talent', null, 200),
      A('Basic Weapon Training (Universal)', 'Talent', null, 500),
      A('Pistol Weapon Training (Universal)', 'Talent', null, 500)
    ],
    2: [
      A('Awareness +10', 'Skill', 'Awareness', 200),
      A('Dodge', 'Skill', null, 100),
      A('Navigation (Stellar) +10', 'Skill', 'Navigation (Stellar)', 200),
      A('Pilot (Flyers) +10', 'Skill', 'Pilot (Flyers)', 200),
      A('Pilot (Space Craft) +10', 'Skill', 'Pilot (Space Craft)', 200),
      A('Scrutiny', 'Skill', null, 100),
      A('Quick Draw', 'Talent', null, 200),
      A('Void Accustomed', 'Talent', null, 200),
      A('Sound Constitution (x2)', 'Talent', null, 200)
    ],
    3: [
      A('Awareness +20', 'Skill', 'Awareness +10', 200),
      A('Dodge +10', 'Skill', 'Dodge', 200),
      A('Gunnery', 'Skill', null, 100),
      A('Pilot (Flyers) +20', 'Skill', 'Pilot (Flyers) +10', 200),
      A('Pilot (Space Craft) +20', 'Skill', 'Pilot (Space Craft) +10', 200),
      A('Scrutiny +10', 'Skill', 'Scrutiny', 200),
      A('Ace Pilot', 'Talent', 'Ag 40, Pilot', 500),
      A('Hotfoot Pilot', 'Talent', 'Ag 35', 500)
    ],
    4: [
      A('Dodge +20', 'Skill', 'Dodge +10', 200),
      A('Gunnery +10', 'Skill', 'Gunnery', 200),
      A('Navigation (Stellar) +20', 'Skill', 'Navigation (Stellar) +10', 200),
      A('Scrutiny +20', 'Skill', 'Scrutiny +10', 200),
      A('Master Gunner', 'Talent', 'Gunnery +10', 500),
      A('Target Selection', 'Talent', 'BS 50', 500)
    ],
    5: [
      A('Gunnery +20', 'Skill', 'Gunnery +10', 200),
      A('True Grit', 'Talent', 'T 40', 200),
      A('Void-Tactician', 'Talent', 'Int 35, Pilot', 500)
    ],
    6: [
      A('Master of Ships', 'Talent', 'Pilot (Space Craft) +20', 500),
      A('Two-Weapon Wielder (Ballistic)', 'Talent', 'Ag 40, BS 35', 500)
    ],
    7: [
      A('Ambidextrous', 'Talent', 'Ag 30', 200),
      A('Uncontested Pilot', 'Talent', 'Ace Pilot', 500)
    ],
    8: [
      A('Legend of the Helm', 'Trait', 'Ag 50, BS 50', 1000)
    ]
  },

  // The CRPG archetype's own talent list, translated: where it names a real
  // tabletop talent (Swift Attack, Step Aside) that is what it buys, and
  // where it names something only the CRPG has (Veil of Blades, Guillotine)
  // the name is kept and the effect converted. See the note on the career.
  'Bladedancer': {
    1: [
      A('Acrobatics', 'Skill', null, 100),
      A('Awareness', 'Skill', null, 100),
      A('Carouse', 'Skill', null, 100),
      A('Demolition', 'Skill', null, 100),
      A('Dodge', 'Skill', null, 100),
      A('Medicae', 'Skill', null, 100),
      A('Melee Weapon Training (Universal)', 'Talent', null, 500),
      A('Pistol Weapon Training (Universal)', 'Talent', null, 500),
      A('Quick Draw', 'Talent', null, 200),
      A('Sure Strike', 'Talent', 'WS 30', 200)
    ],
    2: [
      A('Acrobatics +10', 'Skill', 'Acrobatics', 200),
      A('Awareness +10', 'Skill', 'Awareness', 200),
      A('Dodge +10', 'Skill', 'Dodge', 200),
      A('Ambidextrous', 'Talent', 'Ag 30', 200),
      A('Catfall', 'Talent', 'Ag 30', 200),
      A('Blade in His Hand', 'Talent', 'WS 35', 300),
      A('Sound Constitution (x3)', 'Talent', null, 200)
    ],
    3: [
      A('Carouse +10', 'Skill', 'Carouse', 200),
      A('Medicae +10', 'Skill', 'Medicae', 200),
      A('Swift Attack', 'Talent', 'WS 35', 500),
      A('Two-Weapon Wielder (Melee)', 'Talent', 'Ag 35, WS 35', 500),
      A('Step Aside', 'Talent', 'Ag 35, Dodge', 500),
      A('Dance Partners', 'Talent', 'Two-Weapon Wielder (Melee)', 300)
    ],
    4: [
      A('Acrobatics +20', 'Skill', 'Acrobatics +10', 200),
      A('Dodge +20', 'Skill', 'Dodge +10', 200),
      A('Acrobatic Artistry', 'Talent', 'Acrobatics +10', 300),
      A('Duellist', 'Talent', 'WS 40', 300),
      A('Lightning Reflexes', 'Talent', 'Ag 40', 500),
      A('Sound Constitution (x3)', 'Talent', null, 200)
    ],
    5: [
      A('Demolition +10', 'Skill', 'Demolition', 200),
      A('Lightning Attack', 'Talent', 'Swift Attack', 500),
      A('Veil of Blades', 'Talent', 'Step Aside', 500),
      A('Oath of Vengeance', 'Talent', 'WP 40', 300)
    ],
    6: [
      A('Wall of Steel', 'Talent', 'Ag 35', 500),
      A('Rising Tempo', 'Talent', 'WS 45', 500),
      A('Spinning Blades', 'Talent', 'Veil of Blades', 500),
      A('Guillotine', 'Talent', 'WS 45', 500)
    ],
    7: [
      A('Counter Attack', 'Talent', 'WS 50, Swift Attack', 500),
      A('Captive Audience', 'Talent', 'Duellist', 500),
      A('Blood Oath', 'Talent', 'WP 45', 500)
    ],
    8: [
      A('Death Waltz', 'Trait', 'WS 50, Ag 50, Lightning Attack', 1000)
    ]
  },

  'Eldar Corsair': {
    1: [
      A('Acrobatics +10', 'Skill', 'Acrobatics', 200),
      A('Awareness +10', 'Skill', 'Awareness', 200),
      A('Dodge +10', 'Skill', 'Dodge', 200),
      A('Navigation (Stellar)', 'Skill', null, 200),
      A('Pilot (Jump Pack)', 'Skill', null, 200),
      A('Silent Move +10', 'Skill', 'Silent Move', 200),
      A('Swift Attack', 'Talent', 'WS 35', 500),
      A('Two-Weapon Wielder (Ballistic)', 'Talent', 'Ag 35, BS 35', 500),
      A('Two-Weapon Wielder (Melee)', 'Talent', 'Ag 35, WS 35', 500),
      A('Exotic Weapon Training (Eldar Weaponry)', 'Talent', null, 500),
      A('Sound Constitution (×2)', 'Talent', null, 200)
    ],
    2: [
      A('Acrobatics +20', 'Skill', 'Acrobatics +10', 200),
      A('Awareness +20', 'Skill', 'Awareness +10', 200),
      A('Dodge +20', 'Skill', 'Dodge +10', 200),
      A('Navigation (Stellar) +10', 'Skill', 'Navigation (Stellar)', 200),
      A('Pilot (Jump Pack) +10', 'Skill', 'Pilot (Jump Pack)', 200),
      A('Silent Move +20', 'Skill', 'Silent Move +10', 200),
      A('Bladestorm', 'Talent', 'WS 40', 500),
      A('Counter-Attack', 'Talent', 'WS 40', 500),
      A('Hard Target', 'Talent', 'Ag 40', 500),
      A('Sound Constitution (×2)', 'Talent', null, 200)
    ],
    3: [
      A('Navigation (Stellar) +20', 'Skill', 'Navigation (Stellar) +10', 200),
      A('Pilot (Jump Pack) +20', 'Skill', 'Pilot (Jump Pack) +10', 200),
      A('Scrutiny', 'Skill', null, 100),
      A('Lightning Attack', 'Talent', 'Swift Attack', 500),
      A('Preternatural Speed', 'Talent', 'WS 40, Ag 50', 500),
      A('Step Aside', 'Talent', 'Ag 40, Dodge', 500),
      A('Sound Constitution (×2)', 'Talent', null, 200)
    ],
    4: [
      A('Concealment', 'Skill', null, 100),
      A('Scrutiny +10', 'Skill', 'Scrutiny', 200),
      A('Infused Knowledge', 'Talent', 'Int 40', 500),
      A('Master at Arms', 'Talent', 'WS 50', 500),
      A('Wall of Steel', 'Talent', 'Ag 35', 500),
      A('Sound Constitution (×2)', 'Talent', null, 200)
    ],
    5: [
      A('Concealment +10', 'Skill', 'Concealment', 200),
      A('Shadowing +10', 'Skill', 'Shadowing', 200),
      A('Dance of Death', 'Talent', 'Acrobatics +20, Ag 45', 500),
      A('Eye of Vengeance', 'Talent', 'BS 50', 500),
      A('Sound Constitution (×2)', 'Talent', null, 200)
    ],
    6: [
      A('Concealment +20', 'Skill', 'Concealment +10', 200),
      A('Ghost-Walker', 'Talent', 'Silent Move +20', 500),
      A('Target Selection', 'Talent', 'BS 50', 500),
      A('Sound Constitution (×2)', 'Talent', null, 200)
    ],
    7: [
      A('Path of the Corsair Captain', 'Talent', 'Fel 40, Command +10', 500),
      A("Assassin's Strike", 'Talent', 'Ag 40, Acrobatics', 500),
      A('Sound Constitution (×2)', 'Talent', null, 200)
    ],
    8: [
      A('Avatar of Finesse', 'Trait', 'Ag 55, WS 50', 1000),
      A('Void Predator', 'Talent', 'Navigation (Stellar) +20', 500),
      A('Sound Constitution (×2)', 'Talent', null, 200)
    ]
  },

  'Ork Freebooter': {
    1: [
      A('Awareness +10', 'Skill', 'Awareness', 200),
      A('Intimidate +20', 'Skill', 'Intimidate +10', 200),
      A('Survival +10', 'Skill', 'Survival', 200),
      A('Wrangling', 'Skill', null, 100),
      A('Bulging Biceps', 'Talent', 'S 45', 200),
      A('Hardy', 'Talent', 'T 40', 200),
      A('Tearing Assault', 'Talent', 'WS 40', 500),
      A('Xenos Weapon Training (Ork)', 'Talent', null, 500),
      A('Sound Constitution (×3)', 'Talent', null, 200)
    ],
    2: [
      A('Awareness +20', 'Skill', 'Awareness +10', 200),
      A('Dodge', 'Skill', null, 100),
      A('Drive (Ground Vehicle)', 'Skill', null, 200),
      A('Survival +20', 'Skill', 'Survival +10', 200),
      A('Wrangling +10', 'Skill', 'Wrangling', 200),
      A('Mighty Blow', 'Talent', 'Crushing Blow', 500),
      A('Street Fighting', 'Talent', 'WS 30', 200),
      A('Thunder Charge', 'Talent', 'S 45', 500),
      A('Sound Constitution (×3)', 'Talent', null, 200)
    ],
    3: [
      A('Dodge +10', 'Skill', 'Dodge', 200),
      A('Drive (Ground Vehicle) +10', 'Skill', 'Drive (Ground Vehicle)', 200),
      A('Scrutiny', 'Skill', null, 100),
      A('Wrangling +20', 'Skill', 'Wrangling +10', 200),
      A('Frenzy', 'Talent', null, 500),
      A('Iron Hide', 'Talent', 'T 45', 500),
      A('Waaagh! Stomp', 'Talent', 'S 50', 500),
      A('Sound Constitution (×3)', 'Talent', null, 200)
    ],
    4: [
      A('Drive (Ground Vehicle) +20', 'Skill', 'Drive (Ground Vehicle) +10', 200),
      A('Scrutiny +10', 'Skill', 'Scrutiny', 200),
      A('Berserk Charge', 'Talent', null, 500),
      A('Die Hard', 'Talent', 'WP 40', 500),
      A('Lightning Attack', 'Talent', 'Swift Attack', 500),
      A('Unstoppable Force', 'Talent', 'Thunder Charge', 500),
      A('Sound Constitution (×3)', 'Talent', null, 200)
    ],
    5: [
      A('Common Lore (Orks) +20', 'Skill', 'Common Lore (Orks) +10', 200),
      A("Kaptin's Command", 'Talent', 'Intimidate +20', 500),
      A('Crushing Strife', 'Talent', 'S 50', 500),
      A('Sound Constitution (×3)', 'Talent', null, 200)
    ],
    6: [
      A('Bigger is Better', 'Talent', 'T 50', 500),
      A('Overwhelming Power', 'Talent', 'Mighty Blow', 500),
      A('Sound Constitution (×3)', 'Talent', null, 200)
    ],
    7: [
      A('Da Real Waaagh! Boss', 'Talent', 'S 50, T 50', 500),
      A('Brutal Charge', 'Talent', 'S 45', 500),
      A('Sound Constitution (×3)', 'Talent', null, 200)
    ],
    8: [
      A('Green Tide Incarnate', 'Trait', 'S 55, T 55', 1000),
      A('Sound Constitution (×3)', 'Talent', null, 200)
    ]
  },

  'Kroot Mercenary': {
    1: [
      A('Awareness +10', 'Skill', 'Awareness', 200),
      A('Climb +10', 'Skill', 'Climb', 200),
      A('Concealment +10', 'Skill', 'Concealment', 200),
      A('Dodge +10', 'Skill', 'Dodge', 200),
      A('Shadowing +10', 'Skill', 'Shadowing', 200),
      A('Silent Move +10', 'Skill', 'Silent Move', 200),
      A('Survival +10', 'Skill', 'Survival', 200),
      A('Hyper-Evolved Kindred', 'Trait', 'Eater of Flesh', 500),
      A('Stalker Kindred', 'Trait', 'Eater of Flesh', 500),
      A('Swift Attack', 'Talent', 'WS 35', 500),
      A('Sound Constitution (×3)', 'Talent', null, 200)
    ],
    2: [
      A('Awareness +20', 'Skill', 'Awareness +10', 200),
      A('Climb +20', 'Skill', 'Climb +10', 200),
      A('Shadowing +20', 'Skill', 'Shadowing +10', 200),
      A('Survival +20', 'Skill', 'Survival +10', 200),
      A('Scrutiny', 'Skill', null, 100),
      A('Boldhead Kindred', 'Trait', 'Eater of Flesh', 500),
      A('Lightning Reflexes', 'Talent', 'Ag 30', 500),
      A('Sound Constitution (×3)', 'Talent', null, 200)
    ],
    3: [
      A('Concealment +20', 'Skill', 'Concealment +10', 200),
      A('Dodge +20', 'Skill', 'Dodge +10', 200),
      A('Scrutiny +10', 'Skill', 'Scrutiny', 200),
      A('Silent Move +20', 'Skill', 'Silent Move +10', 200),
      A("Assassin's Strike", 'Talent', 'Ag 40', 500),
      A('Ork-Eater Kindred', 'Trait', 'Eater of Flesh', 500),
      A('Preternatural Speed', 'Talent', 'Ag 50', 500),
      A('Sound Constitution (×3)', 'Talent', null, 200)
    ],
    4: [
      A('Scrutiny +20', 'Skill', 'Scrutiny +10', 200),
      A('Tracking +20', 'Skill', 'Tracking +10', 200),
      A('Hard Target', 'Talent', 'Ag 40', 500),
      A('Leap Up', 'Talent', null, 500),
      A('Vicious Leap', 'Talent', 'Ag 40', 500),
      A('Sound Constitution (×3)', 'Talent', null, 200)
    ],
    5: [
      A("Hunter's Eye", 'Talent', 'Per 40, Tracking +10', 500),
      A('Master Tracker', 'Talent', 'Survival +20', 500),
      A('Sound Constitution (×3)', 'Talent', null, 200)
    ],
    6: [
      A('Apex Predator Kindred', 'Trait', 'Eater of Flesh', 500),
      A('Silent Death', 'Talent', 'Silent Move +20', 500),
      A('Sound Constitution (×3)', 'Talent', null, 200)
    ],
    7: [
      A('Shamanic Calling', 'Talent', 'WP 45, Boldhead Kindred', 500),
      A('Death from Above', 'Talent', 'Ag 45, Climb +20', 500),
      A('Sound Constitution (×3)', 'Talent', null, 200)
    ],
    8: [
      A('Chroot-Shaper Legend', 'Trait', 'Per 55, S 50, T 50', 1000),
      A('Sound Constitution (×3)', 'Talent', null, 200)
    ]
  },

  'Drukhari Kabalite Warrior': {
    1: [
      A('Acrobatics +10', 'Skill', 'Acrobatics', 200),
      A('Awareness +10', 'Skill', 'Awareness', 200),
      A('Dodge +10', 'Skill', 'Dodge', 200),
      A('Intimidate +10', 'Skill', 'Intimidate', 200),
      A('Silent Move +10', 'Skill', 'Silent Move', 200),
      A('Combat Drug User', 'Talent', 'Int 35', 200),
      A('Poisoner', 'Talent', 'Int 35', 200),
      A('Swift Attack', 'Talent', 'WS 35', 500),
      A('Two-Weapon Wielder (Ballistic)', 'Talent', 'Ag 35, BS 35', 500),
      A('Two-Weapon Wielder (Melee)', 'Talent', 'Ag 35, WS 35', 500),
      A('Sound Constitution (×2)', 'Talent', null, 200)
    ],
    2: [
      A('Acrobatics +20', 'Skill', 'Acrobatics +10', 200),
      A('Awareness +20', 'Skill', 'Awareness +10', 200),
      A('Dodge +20', 'Skill', 'Dodge +10', 200),
      A('Intimidate +20', 'Skill', 'Intimidate +10', 200),
      A('Scrutiny', 'Skill', null, 100),
      A('Bladestorm', 'Talent', 'WS 40', 500),
      A('Combat Sense', 'Talent', 'Per 30', 500),
      A('Hard Target', 'Talent', 'Ag 40', 500),
      A('Sharpshooter', 'Talent', 'BS 40', 500),
      A('Sound Constitution (×2)', 'Talent', null, 200)
    ],
    3: [
      A('Scrutiny +10', 'Skill', 'Scrutiny', 200),
      A('Security +10', 'Skill', 'Security', 200),
      A('Tech-Use (Xenos) +10', 'Skill', 'Tech-Use', 200),
      A('Agony Mastery', 'Trait', 'Soul Thirst', 500),
      A('Lightning Attack', 'Talent', 'Swift Attack', 500),
      A('Preternatural Speed', 'Talent', 'Ag 50', 500),
      A('Sound Constitution (×2)', 'Talent', null, 200)
    ],
    4: [
      A('Command (Terror) +10', 'Skill', 'Command', 200),
      A('Scrutiny +20', 'Skill', 'Scrutiny +10', 200),
      A('Master at Arms', 'Talent', 'WS 50', 500),
      A('Step Aside', 'Talent', 'Ag 40, Dodge', 500),
      A('Sound Constitution (×2)', 'Talent', null, 200)
    ],
    5: [
      A('Splinter Volley Master', 'Talent', 'BS 50', 500),
      A('Torture Archon', 'Talent', 'Intimidate +20', 500),
      A('Sound Constitution (×2)', 'Talent', null, 200)
    ],
    6: [
      A('Shadow-Weaver', 'Talent', 'Ag 50, Silent Move +20', 500),
      A('Succubus Champion', 'Talent', 'WS 50 or BS 50', 500),
      A('Sybarite', 'Talent', 'WS 50', 500),
      A('Sound Constitution (×2)', 'Talent', null, 200)
    ],
    7: [
      A('Kabal Lord', 'Talent', 'Fel 45 or WS 55', 500),
      A('Crucible Maiden', 'Talent', 'Agony Mastery', 500),
      A('Soul Harvester', 'Trait', 'Agony Mastery', 500),
      A('Sound Constitution (×2)', 'Talent', null, 200)
    ],
    8: [
      A('True Kin Nightmare', 'Trait', 'Ag 55, WS 50 or BS 50', 1000),
      A('Sound Constitution (×2)', 'Talent', null, 200)
    ]
  },

  /* The Tau Character Guide's Fire Warrior Career Path, ranks 1-8, as printed
     (Rogue Trader: Tau Character Guide, pp.14-18). Where the guide's own tables
     contradict themselves the correction is small and is kept here so it can be
     undone:
       - Navigate and Demolition are written as the core book writes them
         (Navigation, Demolitions), and Drive (Skimmers) as Drive (Skimmer);
       - Rank 3 prints "Drive (Skimmers) +10" a second time; it is +20, which is
         what the +10 in Rank 2 is the prerequisite for;
       - Rank 4's Literacy +20 and Rank 5's Rapid Reaction repeat advances
         already on Rank 2's table, at the same price, and are left off;
       - "Exotic Weapons Training (Choose One) x2" on Rank 8 is the two picks the
         app writes as (x2). */
  "T'au Fire Warrior": {
    1: [
      A('Awareness', 'Skill', null, 100),
      A('Ciphers', 'Skill', null, 100),
      A('Common Lore (War)', 'Skill', null, 100),
      A('Literacy +10', 'Skill', 'Literacy', 100),
      A('Scholastic Lore (Tau Empire)', 'Skill', null, 100),
      A('Speak Language (Kroot)', 'Skill', null, 100),
      A('Speak Language (Low Gothic)', 'Skill', null, 100),
      A('Charm', 'Skill', null, 200),
      A('Command', 'Skill', null, 200),
      A('Concealment', 'Skill', null, 200),
      A('Drive (Skimmer)', 'Skill', null, 200),
      A('Logic +10', 'Skill', 'Logic', 200),
      A('Medicae', 'Skill', null, 200),
      A('Navigation (Surface)', 'Skill', null, 200),
      A('Silent Move', 'Skill', null, 200),
      A('Tech-Use +10', 'Skill', 'Tech-Use', 300),
      A('New Allies', 'Talent', 'Fel 30', 300),
      A('Nerves of Steel', 'Talent', null, 300),
      A('Sprint', 'Talent', null, 300),
      A('Ambidextrous', 'Talent', null, 500),
      A('Melee Weapon Training (Primitive)', 'Talent', null, 500),
      A('Bonding Ritual', 'Talent', 'WP 35', 500)
    ],
    2: [
      A('Common Lore (Tau Empire) +10', 'Skill', 'Common Lore (Tau Empire)', 100),
      A('Literacy +20', 'Skill', 'Literacy +10', 100),
      A('Scholastic Lore (Tau Empire) +10', 'Skill', 'Scholastic Lore (Tau Empire)', 100),
      A('Scrutiny', 'Skill', null, 100),
      A('Swim', 'Skill', null, 100),
      A('Command +10', 'Skill', 'Command', 200),
      A('Deceive', 'Skill', null, 200),
      A('Drive (Skimmer) +10', 'Skill', 'Drive (Skimmer)', 200),
      A('Intimidate', 'Skill', null, 200),
      A('Inquiry', 'Skill', null, 200),
      A('Logic +20', 'Skill', 'Logic +10', 200),
      A('Navigation (Stellar)', 'Skill', null, 200),
      A('Deadeye Shot', 'Talent', 'BS 30', 200),
      A('Hard Target', 'Talent', 'Ag 40', 200),
      A('Meditation', 'Talent', null, 200),
      A('Rapid Reaction', 'Talent', 'Ag 40', 200),
      A('Sound Constitution', 'Talent', null, 200),
      A('Technological Insight', 'Talent', 'Scholastic Lore (Tau Empire), Tech-Use +10', 300),
      A('Flame Weapon Training (Universal)', 'Talent', null, 500),
      A('Heavy Weapon Training (Choose One)', 'Talent', null, 500),
      A('Melee Weapon Training (Universal)', 'Talent', null, 500),
      A('Superior Supply Chain', 'Talent', null, 500)
    ],
    3: [
      A('Common Lore (War) +10', 'Skill', 'Common Lore (War)', 100),
      A('Common Lore (Tau Empire) +20', 'Skill', 'Common Lore (Tau Empire) +10', 100),
      A('Scholastic Lore (Tau Empire) +20', 'Skill', 'Scholastic Lore (Tau Empire) +10', 100),
      A('Awareness +10', 'Skill', 'Awareness', 200),
      A('Drive (Skimmer) +20', 'Skill', 'Drive (Skimmer) +10', 200),
      A('Medicae +10', 'Skill', 'Medicae', 200),
      A('Charm +10', 'Skill', 'Charm', 300),
      A('Demolitions', 'Skill', null, 300),
      A('Pilot (Flyers)', 'Skill', null, 300),
      A('Survival', 'Skill', null, 300),
      A('Tracking', 'Skill', null, 300),
      A('Air of Authority', 'Talent', 'Fel 30', 300),
      A('Crack Shot', 'Talent', 'BS 40', 300),
      A('Double Team', 'Talent', null, 300),
      A('Foresight', 'Talent', 'Int 30', 300),
      A('Fire Support', 'Talent', 'BS 40, Fel 35', 400),
      A('Heavy Weapon Training (Choose One)', 'Talent', null, 500),
      A('Hip Shooting', 'Talent', 'BS 40, Ag 40', 500),
      A('Infused Knowledge', 'Talent', 'Int 40', 500),
      A('Master of Technology', 'Talent', 'Scholastic Lore (Tau Empire), Common Lore (War)', 500),
      A('Polyglot', 'Talent', 'Int 30, Fel 30', 500),
      A('Two-Weapon Wielder', 'Talent', 'WS 35 or BS 35, Ag 35', 500)
    ],
    4: [
      A('Scrutiny +10', 'Skill', 'Scrutiny', 100),
      A('Peer (Kroot or other Tau Empire race)', 'Talent', 'Fel 30', 100),
      A('Command +20', 'Skill', 'Command +10', 200),
      A('Deceive +10', 'Skill', 'Deceive', 200),
      A('Navigation (Surface) +10', 'Skill', 'Navigation (Surface)', 200),
      A('Navigation (Stellar) +10', 'Skill', 'Navigation (Stellar)', 200),
      A('Pilot (Flyers) +10', 'Skill', 'Pilot (Flyers)', 200),
      A('Tech-Use +20', 'Skill', 'Tech-Use +10', 200),
      A('Tracking +10', 'Skill', 'Tracking', 200),
      A('Blind Fighting', 'Talent', 'Per 30', 200),
      A('Sound Constitution', 'Talent', null, 200),
      A('Armour of Contempt', 'Talent', 'WP 40', 300),
      A('Fearless', 'Talent', null, 300),
      A('Pilot (Personal)', 'Skill', null, 500),
      A('Envoy of the Greater Good', 'Talent', 'Fel 45, Charm +10', 500),
      A('Furious Fusillade', 'Talent', 'BS 40, Crack Shot', 500),
      A('Guardian', 'Talent', 'Ag 40', 500),
      A('Mighty Shot', 'Talent', 'BS 40', 500),
      A('Tactical Flexibility', 'Talent', 'Sprint, Scholastic Lore (Tau Empire) +10', 500)
    ],
    5: [
      A('Catfall', 'Talent', 'Ag 30', 100),
      A('Leap Up', 'Talent', 'Ag 30', 100),
      A('Charm +20', 'Skill', 'Charm +10', 200),
      A('Concealment +10', 'Skill', 'Concealment', 200),
      A('Silent Move +20', 'Skill', 'Silent Move +10', 200),
      A('Survival +10', 'Skill', 'Survival', 200),
      A('Swim +10', 'Skill', 'Swim', 200),
      A('Demolitions +10', 'Skill', 'Demolitions', 300),
      A('Dodge +20', 'Skill', 'Dodge +10', 300),
      A('Intimidate +10', 'Skill', 'Intimidate', 300),
      A('Medicae +20', 'Skill', 'Medicae +10', 300),
      A('Pilot (Flyers) +20', 'Skill', 'Pilot (Flyers) +10', 300),
      A('Shadowing', 'Skill', null, 300),
      A('Die Hard', 'Talent', null, 300),
      A('Sharpshooter', 'Talent', 'BS 40, Deadeye Shot', 300),
      A('Technical Knock', 'Talent', 'Int 30', 400),
      A('Disciple of Kauyon', 'Talent', 'Bonding Ritual', 500),
      A('Dual Shot', 'Talent', 'Ag 40, Two-Weapon Wielder', 500),
      A('Exemplar of the Selfless Cause', 'Talent', 'Bonding Ritual, Command +10', 500),
      A('Exotic Weapon Training (Choose One)', 'Talent', null, 500),
      A('Talented (Drive)', 'Talent', null, 500),
      A('Takedown', 'Talent', null, 750)
    ],
    6: [
      A('Climb', 'Skill', null, 100),
      A('Common Lore (War) +20', 'Skill', 'Common Lore (War) +10', 100),
      A('Awareness +20', 'Skill', 'Awareness +10', 200),
      A('Interrogation', 'Skill', null, 200),
      A('Navigation (Surface) +20', 'Skill', 'Navigation (Surface) +10', 200),
      A('Speak Language (High Gothic)', 'Skill', null, 200),
      A('Hatred (Orks)', 'Talent', null, 200),
      A('Light Sleeper', 'Talent', 'Per 30', 200),
      A('Security', 'Skill', null, 300),
      A('Deceive +20', 'Skill', 'Deceive +10', 300),
      A('Scrutiny +20', 'Skill', 'Scrutiny +10', 300),
      A('Bulging Biceps', 'Talent', 'S 45', 300),
      A('Cleanse and Purify', 'Talent', 'Flame Weapon Training (Universal)', 300),
      A('Sure Strike', 'Talent', 'WS 30', 400),
      A('Blessing of the Ethereals', 'Talent', 'WP 40', 500),
      A('Exotic Weapon Training (Choose One)', 'Talent', null, 500),
      A('Good Reputation (Kroot or other Tau Empire race)', 'Talent', 'Fel 50, Peer', 500),
      A('Inspire Wrath', 'Talent', 'Fel 30', 500),
      A('Jaded', 'Talent', 'WP 30', 500),
      A('Strength through Unity', 'Talent', 'Fel 40, Bonding Ritual', 600),
      A('Duty Unto Death', 'Talent', 'WP 45', 750),
      A('Unarmed Warrior', 'Talent', 'WS 35, Ag 35', 750)
    ],
    7: [
      A('Climb +10', 'Skill', 'Climb', 200),
      A('Survival +20', 'Skill', 'Survival +10', 200),
      A('Swim +20', 'Skill', 'Swim +10', 200),
      A('Tracking +20', 'Skill', 'Tracking +10', 200),
      A('Interrogation +10', 'Skill', 'Interrogation', 300),
      A('Intimidate +20', 'Skill', 'Intimidate +10', 300),
      A('Security +10', 'Skill', 'Security', 300),
      A('Shadowing +10', 'Skill', 'Shadowing', 300),
      A('Gunslinger', 'Talent', 'BS 40, Two-Weapon Wielder', 300),
      A('Iron Discipline', 'Talent', 'WP 30, Command', 300),
      A('Total Recall', 'Talent', 'Int 30', 300),
      A('Concealment +20', 'Skill', 'Concealment +10', 500),
      A('Demolitions +20', 'Skill', 'Demolitions +10', 500),
      A('Exotic Weapon Training (Choose One)', 'Talent', null, 500),
      A('Hotshot Pilot', 'Talent', 'Ag 40, Pilot (Any One)', 500),
      A('Independent Targeting', 'Talent', 'BS 40', 500),
      A('Master Orator', 'Talent', 'Fel 30', 500),
      A('Precise Blow', 'Talent', 'WS 40, Sure Strike', 500),
      A('Step Aside', 'Talent', 'Ag 40, Dodge', 500),
      A('Talented (Command)', 'Talent', null, 500),
      A('Disciple of Mont’ka', 'Talent', 'Ag 40, Silent Move +10', 750),
      A('Technology Triumphant', 'Talent', 'Scholastic Lore (Tau Empire) +10, Tech-Use +20', 1000)
    ],
    8: [
      A('Climb +20', 'Skill', 'Climb +10', 200),
      A('Interrogation +20', 'Skill', 'Interrogation +10', 300),
      A('Security +20', 'Skill', 'Security +10', 300),
      A('Shadowing +20', 'Skill', 'Shadowing +10', 300),
      A('Swift Attack', 'Talent', 'WS 35', 400),
      A('Exotic Weapon Training (Choose One) (×2)', 'Talent', null, 500),
      A('Into the Jaws of Hell', 'Talent', 'Iron Discipline', 500),
      A('Master & Commander', 'Talent', 'Int 35, Fel 35', 500),
      A('Master Chirurgeon', 'Talent', 'Medicae +10', 500),
      A('Sound Constitution', 'Talent', null, 500),
      A('Talented (Any One)', 'Talent', null, 500),
      A('Wall of Steel', 'Talent', 'WS 40, Parry', 500),
      A('Greater than the Sum', 'Talent', 'Fel 45, New Allies', 750),
      A('Last Man Standing', 'Talent', 'Nerves of Steel', 750),
      A('Through Unity, Devastation', 'Talent', 'BS 45, Furious Fusillade, Command +20', 1000)
    ]
  }
};

export const CAREERS_WITH_TABLES = Object.keys(CAREER_ADVANCES);

// The career name on a sheet may carry an alternate rank or a parenthetical,
// e.g. "Seneschal (Alternate Rank: Witch Finder)" — match on the base name.
export function baseCareer(name) {
  const n = String(name || '').split('(')[0].trim();
  return CAREERS_WITH_TABLES.find((c) => c.toLowerCase() === n.toLowerCase()) || null;
}

// null when the career has no published table at all; [] when the rank exists
// but lists nothing.
export function advancesFor(career, rank) {
  const base = baseCareer(career);
  if (!base) return null;
  const table = CAREER_ADVANCES[base];
  return table[rank] || [];
}

// Core careers cover ranks 1-4; xenos careers extend to rank 8.
export const MAX_TABLED_RANK = 8;

// Every advance a career can offer, each carrying the rank it sits at, so the
// UI can group them without re-deriving that. null for a career with no table.
export function allAdvances(career) {
  const base = baseCareer(career);
  if (!base) return null;
  const out = [];
  for (let rank = 1; rank <= MAX_TABLED_RANK; rank++) {
    for (const a of CAREER_ADVANCES[base][rank] || []) out.push({ ...a, rank });
  }
  return out;
}

/* ------------------------------ prerequisites ------------------------------
   Characteristic requirements are checkable against a sheet; talent and skill
   requirements are named, so they are returned for a human to confirm.      */

const CHAR_KEYS = {
  ws: 'ws', bs: 'bs', s: 's', t: 't', ag: 'ag',
  int: 'int', per: 'per', wp: 'wp', fel: 'fel'
};

export function parsePrereq(text) {
  const out = { chars: [], others: [], anyOf: false };
  const raw = String(text || '').trim();
  if (!raw) return out;
  out.anyOf = / or /i.test(raw);
  for (const part of raw.split(/,| or /i)) {
    const p = part.trim();
    if (!p) continue;
    const m = p.match(/^(WS|BS|S|T|Ag|Int|Per|WP|Fel)\s+(\d{1,3})$/i);
    if (m) out.chars.push({ key: CHAR_KEYS[m[1].toLowerCase()], min: Number(m[2]) });
    else out.others.push(p);
  }
  return out;
}

// Which characteristic requirements a set of totals fails. With "or", meeting
// any one is enough, so nothing is reported unless all of them fail.
export function unmetCharPrereqs(text, totals) {
  const { chars, anyOf } = parsePrereq(text);
  if (!chars.length || !totals) return [];
  const failed = chars.filter((c) => (totals[c.key] || 0) < c.min);
  if (anyOf && failed.length < chars.length) return [];
  return failed;
}

/* Whether a character may take an advance, and if not, why not.
   Three things block a purchase outright, and all three are rules rather than
   preferences: a table above your rank is unreachable, an unmet characteristic
   requirement disqualifies you, and you cannot spend XP you do not have.
   Named prerequisites (talents, skills) are returned for a human to confirm
   rather than enforced, since the sheet does not always record them. */
export function advanceStatus(advance, ctx) {
  const { rank = 1, remaining = 0, totals = null, owned = [] } = ctx || {};
  const isOwned = owned.some((o) => o.name === advance.name);
  const unmetChars = unmetCharPrereqs(advance.prereq, totals);
  const lockedByRank = advance.rank > rank;
  const unaffordable = advance.cost > remaining;
  return {
    owned: isOwned,
    lockedByRank,
    unaffordable,
    unmetChars,
    namedPrereqs: parsePrereq(advance.prereq).others,
    // owned advances are always removable, so blocking only applies to buying
    blocked: !isOwned && (lockedByRank || unaffordable || unmetChars.length > 0)
  };
}

/* ------------------------------ alternate career ranks ------------------------------
   A side path a character takes in place of one rank of their career (Tau
   Character Guide, pp.18-24): from a minimum Rank, with the GM\u2019s leave, their
   advances come from this table instead of that rank\u2019s. What they pass up they
   may buy later as Elite Advances at the GM\u2019s price, which the guide suggests
   should be twice the printed cost. The tables are the guide\u2019s as printed. */
export const ALTERNATE_RANKS = [
  {
    name: 'Pathfinder', careers: ["T'au Fire Warrior"], minRank: 2, xp: 7000,
    requires: 'Ag 35, Nerves of Steel, Silent Move',
    blurb: 'The Fire caste’s scouts and markerlight spotters: stealth, snipers and bait.',
    advances: [
      A('Awareness +10', 'Skill', 'Awareness', 100),
      A('Concealment', 'Skill', null, 100),
      A('Silent Move +10', 'Skill', 'Silent Move', 100),
      A('Sleight of Hand', 'Skill', null, 100),
      A('Tracking', 'Skill', null, 100),
      A('Concealment +10', 'Skill', 'Concealment', 200),
      A('Dodge +10', 'Skill', 'Dodge', 200),
      A('Navigation (Surface) +10', 'Skill', 'Navigation (Surface)', 200),
      A('Tracking +10', 'Skill', 'Tracking', 200),
      A('Combat Sense', 'Talent', 'Per 40', 200),
      A('Paranoia', 'Talent', null, 200),
      A('Unremarkable', 'Talent', null, 200),
      A('Demolitions', 'Skill', null, 300),
      A('Navigation (Surface) +20', 'Skill', 'Navigation (Surface) +10', 300),
      A('Security', 'Skill', null, 300),
      A('Shadowing', 'Skill', null, 300),
      A('Deadeye Shot', 'Talent', 'BS 30', 300),
      A('Guided Precision', 'Talent', 'BS 40, Deadeye Shot', 300),
      A('Hard Target', 'Talent', 'Ag 40', 300),
      A('Demolitions +10', 'Skill', 'Demolitions', 400),
      A('Silent Move +20', 'Skill', 'Silent Move +10', 400),
      A('Hip Shooting', 'Talent', 'BS 40, Ag 40', 500),
      A('Last Man Standing', 'Talent', 'Nerves of Steel', 500),
      A('Talented (Silent Move)', 'Talent', null, 500),
      A('Opportunist’s Evasion', 'Talent', 'Ag 45, Hard Target', 600)
    ]
  },
  {
    name: 'Drone Handler', careers: ["T'au Fire Warrior"], minRank: 3, xp: 10000,
    requires: 'Int 40, Tech-Use +10',
    blurb: 'A Fire Warrior with the aptitude to direct drones.',
    advances: [
      A('Awareness +10', 'Skill', 'Awareness', 100),
      A('Blather', 'Skill', null, 100),
      A('Common Lore (Tech)', 'Skill', null, 100),
      A('Scholastic Lore (Chymistry)', 'Skill', null, 100),
      A('Trade (Armourer)', 'Skill', null, 100),
      A('Trade (Chymist)', 'Skill', null, 100),
      A('Trade (Technomat)', 'Skill', null, 100),
      A('Common Lore (Tech) +10', 'Skill', 'Common Lore (Tech)', 200),
      A('Evaluate', 'Skill', null, 200),
      A('Forbidden Lore (Xenos)', 'Skill', null, 200),
      A('Technical Knock', 'Talent', 'Int 30', 200),
      A('Common Lore (Tech) +20', 'Skill', 'Common Lore (Tech) +10', 300),
      A('Tech-Use +20', 'Skill', 'Tech-Use +10', 300),
      A('Master of Technology', 'Talent', 'Scholastic Lore (Tau Empire), Common Lore (War)', 300),
      A('Priority Fire', 'Talent', 'Per 35, Quick Draw', 300),
      A('Quick Draw', 'Talent', null, 300),
      A('Combat Formation', 'Talent', 'Int 40', 400),
      A('Pistol Weapon Training (Universal)', 'Talent', null, 400),
      A('Gun Blessing', 'Talent', 'Mechanicus Implants (T’au Gun Drone Handlers ignore this)', 500),
      A('Talented (Tech-Use)', 'Talent', null, 500),
      A('Swarm Protocols', 'Talent', 'Int 45, Trade (Technomat)', 800)
    ]
  },
  {
    name: 'Battlesuit Pilot', careers: ["T'au Fire Warrior"], minRank: 5, xp: 17000,
    requires: 'Ag 45, and the rank of Shas’ui',
    blurb: 'A veteran trusted with a battlesuit.',
    advances: [
      A('Pilot (Personal)', 'Skill', null, 100),
      A('Pilot (Personal) +10', 'Skill', 'Pilot (Personal)', 200),
      A('Guardian', 'Talent', 'Ag 40', 200),
      A('Pilot (Personal) +20', 'Skill', 'Pilot (Personal) +10', 300),
      A('Advanced Battlesuit Training', 'Talent', 'Ag 40, Pilot (Personal) +10', 300),
      A('Cleanse and Purify', 'Talent', 'Flame Weapon Training (Universal)', 300),
      A('Dual Shot', 'Talent', 'Ag 40, Two-Weapon Wielder', 300),
      A('Independent Targeting', 'Talent', 'BS 40', 300),
      A('Orthoproxy', 'Talent', null, 300),
      A('Catfall', 'Talent', 'Ag 30', 400),
      A('Furious Assault', 'Talent', 'WS 35', 400),
      A('Rapid Reaction', 'Talent', 'Ag 40', 500),
      A('Technical Knock', 'Talent', 'Int 30', 500),
      A('Talented (Pilot)', 'Talent', null, 500),
      A('Hotshot Pilot', 'Talent', 'Ag 40, Pilot (Any One)', 750),
      A('Step Aside', 'Talent', 'Ag 40, Dodge', 750),
      A('Exemplar of the Selfless Cause', 'Talent', 'Bonding Ritual, Command +10', 800),
      A('Disciple of Kauyon', 'Talent', 'Bonding Ritual', 800),
      A('Veteran’s Reflexes', 'Talent', 'Ag 45, Talented (Pilot)', 1000)
    ]
  }
];

export const alternateRanksFor = (career) => {
  const base = baseCareer(career);
  return base ? ALTERNATE_RANKS.filter((r) => r.careers.includes(base)) : [];
};
export const alternateRankByName = (name) => ALTERNATE_RANKS.find((r) => r.name === name) || null;
/* The advances of one alternate rank, each carrying the Rank it opens at, so
   they sit among a career\u2019s own without the caller re-deriving that. */
export const alternateAdvances = (name) => {
  const r = alternateRankByName(name);
  return r ? r.advances.map((a) => ({ ...a, rank: r.minRank, alt: r.name })) : [];
};
