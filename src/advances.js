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
  'Explorator': {
    1: [
      A('Common Lore (Machine Cult)', 'Skill', null, 100),
      A('Common Lore (Tech)', 'Skill', null, 100),
      A('Forbidden Lore (Archeotech)', 'Skill', null, 100),
      A('Forbidden Lore (Adeptus Mechanicus)', 'Skill', null, 100),
      A('Tech-Use', 'Skill', null, 100),
      A('Logic', 'Skill', null, 100),
      A('Trade (Technomat)', 'Skill', null, 100),
      A('Security', 'Skill', null, 200),
      A('Basic Weapon Training (Universal)', 'Talent', null, 500),
      A('Melee Weapon Training (Universal)', 'Talent', null, 500),
      A('Logis Implant', 'Talent', 'Mechanicus Implants', 200),
      A('Technical Knock', 'Talent', 'Int 30', 200),
      A('Autosanguine', 'Talent', 'Mechanicus Implants', 200)
    ],
    2: [
      A('Tech-Use +10', 'Skill', 'Tech-Use', 200),
      A('Security +10', 'Skill', 'Security', 200),
      A('Forbidden Lore (Archeotech) +10', 'Skill', 'Forbidden Lore (Archeotech)', 200),
      A('Medicae', 'Skill', null, 200),
      A('Binary Chatter', 'Talent', 'Mechanicus Implants', 200),
      A('Luminen Charge', 'Talent', 'Mechanicus Implants', 200),
      A('Electro-Graft Use', 'Talent', 'Mechanicus Implants', 200),
      A('Sound Constitution (x2)', 'Talent', null, 200)
    ],
    3: [
      A('Tech-Use +20', 'Skill', 'Tech-Use +10', 200),
      A('Logic +10', 'Skill', 'Logic', 200),
      A('Ferric Lure', 'Talent', 'Mechanicus Implants', 200),
      A('Maglev Grace', 'Talent', 'Mechanicus Implants', 200),
      A('Rite of Fear', 'Talent', 'Mechanicus Implants', 500),
      A('Utility Mechadendrite', 'Talent', 'Mechadendrite Use', 500)
    ],
    4: [
      A('Forbidden Lore (Archeotech) +20', 'Skill', 'Forbidden Lore (Archeotech) +10', 200),
      A('Security +20', 'Skill', 'Security +10', 200),
      A('Cyber-Terminal Interface', 'Talent', 'Tech-Use +10', 500),
      A('Optical Mechadendrite', 'Talent', 'Mechadendrite Use', 500),
      A('Total Recall', 'Talent', 'Int 30', 200),
      A('Master Engineer', 'Talent', 'Tech-Use +20', 500)
    ]
  },

  'Rogue Trader': {
    1: [
      A('Command', 'Skill', null, 100),
      A('Commerce', 'Skill', null, 100),
      A('Charm', 'Skill', null, 100),
      A('Evaluate', 'Skill', null, 100),
      A('Common Lore (Imperium)', 'Skill', null, 100),
      A('Air of Authority', 'Talent', 'Fel 30', 200),
      A('Pistol Weapon Training (Universal)', 'Talent', null, 500),
      A('Melee Weapon Training (Universal)', 'Talent', null, 500),
      A('Renowned Warrant', 'Talent', null, 200)
    ],
    2: [
      A('Command +10', 'Skill', 'Command', 200),
      A('Charm +10', 'Skill', 'Charm', 200),
      A('Commerce +10', 'Skill', 'Commerce', 200),
      A('Dodge', 'Skill', null, 200),
      A('Iron Discipline', 'Talent', 'WP 30, Command', 200),
      A('Peer (Nobility)', 'Talent', 'Fel 30', 200),
      A('Sound Constitution (x2)', 'Talent', null, 200)
    ],
    3: [
      A('Command +20', 'Skill', 'Command +10', 200),
      A('Charm +20', 'Skill', 'Charm +10', 200),
      A('Master & Commander', 'Talent', 'Command +10', 500),
      A('Inspirational Leader', 'Talent', 'Fel 35', 500),
      A('Quick Draw', 'Talent', null, 200)
    ],
    4: [
      A('Commerce +20', 'Skill', 'Commerce +10', 200),
      A('Evaluate +20', 'Skill', 'Evaluate +10', 200),
      A('Polyglot', 'Talent', 'Int 30, Fel 30', 500),
      A('Eye of Vengeance', 'Talent', 'BS 50', 500),
      A('Infused Knowledge', 'Talent', 'Int 40', 500)
    ]
  },

  'Arch-Militant': {
    1: [
      A('Common Lore (War)', 'Skill', null, 100),
      A('Dodge', 'Skill', null, 100),
      A('Intimidate', 'Skill', null, 100),
      A('Basic Weapon Training (Universal)', 'Talent', null, 500),
      A('Pistol Weapon Training (Universal)', 'Talent', null, 500),
      A('Melee Weapon Training (Universal)', 'Talent', null, 500),
      A('Quick Draw', 'Talent', null, 200),
      A('Weapon Master', 'Talent', 'BS 30 or WS 30', 500)
    ],
    2: [
      A('Dodge +10', 'Skill', 'Dodge', 200),
      A('Intimidate +10', 'Skill', 'Intimidate', 200),
      A('Bulging Biceps', 'Talent', 'S 45', 200),
      A('Crushing Blow', 'Talent', 'S 40', 200),
      A('Sound Constitution (x3)', 'Talent', null, 200)
    ],
    3: [
      A('Dodge +20', 'Skill', 'Dodge +10', 200),
      A('Intimidate +20', 'Skill', 'Intimidate +10', 200),
      A('Mighty Blow', 'Talent', 'Crushing Blow', 500),
      A('Target Selection', 'Talent', 'BS 50', 500),
      A('Swift Attack', 'Talent', 'WS 35', 500)
    ],
    4: [
      A('Lightning Attack', 'Talent', 'Swift Attack', 500),
      A('Sharpshooter', 'Talent', 'BS 40', 500),
      A('True Grit', 'Talent', 'T 40', 500),
      A('Step Aside', 'Talent', 'Ag 40, Dodge', 500)
    ]
  },

  'Astropath Transcendent': {
    1: [
      A('Invocation', 'Skill', null, 100),
      A('Psyniscience', 'Skill', null, 100),
      A('Forbidden Lore (Psykers)', 'Skill', null, 100),
      A('Forbidden Lore (Warp)', 'Skill', null, 100),
      A('Psy Rating 1', 'Talent', null, 200),
      A('Psy Rating 2', 'Talent', 'Psy Rating 1', 200),
      A('Pistol Weapon Training (Universal)', 'Talent', null, 500),
      A('Telepathic Jamming', 'Technique', 'Telepathy Discipline', 200)
    ],
    2: [
      A('Psyniscience +10', 'Skill', 'Psyniscience', 200),
      A('Invocation +10', 'Skill', 'Invocation', 200),
      A('Psy Rating 3', 'Talent', 'Psy Rating 2', 300),
      A('Psychic Discipline (Divination/Telepathy)', 'Talent', null, 500),
      A('Mind Link', 'Technique', 'Telepathy Discipline', 200),
      A('Sound Constitution (x2)', 'Talent', null, 200)
    ],
    3: [
      A('Psyniscience +20', 'Skill', 'Psyniscience +10', 200),
      A('Psy Rating 4', 'Talent', 'Psy Rating 3', 300),
      A('Psychic Scream', 'Technique', 'Telepathy Discipline', 300),
      A('Strong Minded', 'Talent', 'WP 30, Resistance', 500),
      A('Warp Sense', 'Talent', 'Psyniscience, WP 30', 500)
    ],
    4: [
      A('Psy Rating 5', 'Talent', 'Psy Rating 4', 500),
      A('Compel', 'Technique', 'Telepathy Discipline', 500),
      A('Master Telepath', 'Talent', 'Telepathy Discipline', 500),
      A('Rite of Sanctioning', 'Talent', 'Psy Rating 3', 500)
    ]
  },

  'Seneschal': {
    1: [
      A('Barter', 'Skill', null, 100),
      A('Commerce', 'Skill', null, 100),
      A('Common Lore (Imperium)', 'Skill', null, 100),
      A('Deceive', 'Skill', null, 100),
      A('Evaluate', 'Skill', null, 100),
      A('Inquiry', 'Skill', null, 100),
      A('Literacy', 'Skill', null, 100),
      A('Basic Weapon Training (Universal)', 'Talent', null, 500),
      A('Pistol Weapon Training (Universal)', 'Talent', null, 500),
      A('Seeker of Lore', 'Talent', null, 200),
      A('Unremarkable', 'Talent', null, 200)
    ],
    2: [
      A('Commerce +10', 'Skill', 'Commerce', 200),
      A('Evaluate +10', 'Skill', 'Evaluate', 200),
      A('Inquiry +10', 'Skill', 'Inquiry', 200),
      A('Forbidden Lore (Inquisition)', 'Skill', null, 200),
      A('Logic', 'Skill', null, 200),
      A('Peer (Academic)', 'Talent', 'Fel 30', 200),
      A('Infused Knowledge', 'Talent', 'Int 40', 500),
      A('Sound Constitution (x2)', 'Talent', null, 200)
    ],
    3: [
      A('Commerce +20', 'Skill', 'Commerce +10', 200),
      A('Evaluate +20', 'Skill', 'Evaluate +10', 200),
      A('Inquiry +20', 'Skill', 'Inquiry +10', 200),
      A('Scrutiny +10', 'Skill', 'Scrutiny', 200),
      A('Whispers', 'Talent', 'Inquiry +10', 500),
      A('Polyglot', 'Talent', 'Int 30, Fel 30', 500)
    ],
    4: [
      A('Barter +20', 'Skill', 'Barter +10', 200),
      A('Deceive +20', 'Skill', 'Deceive +10', 200),
      A('Mastery (Commerce)', 'Talent', 'Commerce +20', 500),
      A('Talent for Deception', 'Talent', 'Deceive +10', 500)
    ]
  },

  'Navigator': {
    1: [
      A('Navigation (Warp)', 'Skill', null, 100),
      A('Navigation (Stellar)', 'Skill', null, 100),
      A('Psyniscience', 'Skill', null, 100),
      A('Forbidden Lore (Warp)', 'Skill', null, 100),
      A('Scholastic Lore (Astromancy)', 'Skill', null, 100),
      A('Pistol Weapon Training (Universal)', 'Talent', null, 500),
      A('Navigator', 'Talent', null, 200),
      A('Navigator Power (Novice)', 'Power', null, 200),
      A('Warp Sense', 'Talent', 'Psyniscience, WP 30', 200)
    ],
    2: [
      A('Navigation (Warp) +10', 'Skill', 'Navigation (Warp)', 200),
      A('Psyniscience +10', 'Skill', 'Psyniscience', 200),
      A('Forbidden Lore (Warp) +10', 'Skill', 'Forbidden Lore (Warp)', 200),
      A('Navigator Power (Novice/Adept)', 'Power', 'Navigator Power', 200),
      A('Resistance (Fear)', 'Talent', null, 200),
      A('Foresight', 'Talent', 'Int 30', 200),
      A('Sound Constitution (x2)', 'Talent', null, 200)
    ],
    3: [
      A('Navigation (Warp) +20', 'Skill', 'Navigation (Warp) +10', 200),
      A('Psyniscience +20', 'Skill', 'Psyniscience +10', 200),
      A('Navigator Power (Adept)', 'Power', 'Novice Power', 300),
      A('Gaze into the Abyss', 'Power', 'Navigator', 300),
      A('Inured to the Warp', 'Talent', 'WP 40', 500)
    ],
    4: [
      A('Scholastic Lore (Astromancy) +20', 'Skill', 'Scholastic Lore (Astromancy) +10', 200),
      A('Navigator Power (Master)', 'Power', 'Adept Power', 500),
      A('Master Navigator', 'Talent', 'Navigation (Warp) +20', 500),
      A('Unshakeable Faith', 'Talent', null, 500)
    ]
  },

  'Missionary': {
    1: [
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
      A('Common Lore (Imperial Creed) +10', 'Skill', 'Common Lore (Imperial Creed)', 200),
      A('Medicae +10', 'Skill', 'Medicae', 200),
      A('Charm', 'Skill', null, 200),
      A('Intimidate', 'Skill', null, 200),
      A('Hatred (Psykers)', 'Talent', null, 200),
      A('Inspired Rhetoric', 'Talent', 'Charm', 200),
      A('Sound Constitution (x2)', 'Talent', null, 200)
    ],
    3: [
      A('Common Lore (Imperial Creed) +20', 'Skill', 'Common Lore (Imperial Creed) +10', 200),
      A('Medicae +20', 'Skill', 'Medicae +10', 200),
      A('Charm +10', 'Skill', 'Charm', 200),
      A('Divine Ministration', 'Talent', 'Medicae +10', 500),
      A('Litany of Hate', 'Talent', 'Hatred', 500),
      A('Master Orator', 'Talent', 'Fel 30', 500)
    ],
    4: [
      A('Charm +20', 'Skill', 'Charm +10', 200),
      A('Intimidate +20', 'Skill', 'Intimidate +10', 200),
      A('Wrath of the Righteous', 'Talent', 'Pure Faith', 500),
      A('Flagellant', 'Talent', null, 500)
    ]
  },

  'Void-Master': {
    1: [
      A('Common Lore (Imperial Navy)', 'Skill', null, 100),
      A('Common Lore (War)', 'Skill', null, 100),
      A('Navigation (Stellar)', 'Skill', null, 100),
      A('Pilot (Space Craft)', 'Skill', null, 100),
      A('Pilot (Flyers)', 'Skill', null, 100),
      A('Scholastic Lore (Astromancy)', 'Skill', null, 100),
      A('Pistol Weapon Training (Universal)', 'Talent', null, 500),
      A('Basic Weapon Training (Universal)', 'Talent', null, 500),
      A('Mastery of Small Craft', 'Talent', null, 200),
      A('Nerves of Steel', 'Talent', null, 200)
    ],
    2: [
      A('Pilot (Space Craft) +10', 'Skill', 'Pilot (Space Craft)', 200),
      A('Pilot (Flyers) +10', 'Skill', 'Pilot (Flyers)', 200),
      A('Navigation (Stellar) +10', 'Skill', 'Navigation (Stellar)', 200),
      A('Dodge', 'Skill', null, 200),
      A('Quick Draw', 'Talent', null, 200),
      A('Void Accustomed', 'Talent', null, 200),
      A('Sound Constitution (x2)', 'Talent', null, 200)
    ],
    3: [
      A('Pilot (Space Craft) +20', 'Skill', 'Pilot (Space Craft) +10', 200),
      A('Pilot (Flyers) +20', 'Skill', 'Pilot (Flyers) +10', 200),
      A('Gunnery', 'Skill', null, 200),
      A('Ace Pilot', 'Talent', 'Ag 40, Pilot', 500),
      A('Hotfoot Pilot', 'Talent', 'Ag 35', 500)
    ],
    4: [
      A('Gunnery +10', 'Skill', 'Gunnery', 200),
      A('Navigation (Stellar) +20', 'Skill', 'Navigation (Stellar) +10', 200),
      A('Target Selection', 'Talent', 'BS 50', 500),
      A('Master Gunner', 'Talent', 'Gunnery +10', 500)
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

export const MAX_TABLED_RANK = 4;

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
