// Bionics, cybernetic implants and power armour.
//
// THREE WAYS TO GET ONE, and the app has to tell them apart:
//
//   1. Initial gear — an Explorator, or anyone raised on a Forge World, picks
//      one or two Mechanicus implants at creation for nothing. See freeFor.
//   2. Throne Gelt — bought in downtime at the listed price, subject to the
//      region's Availability. The app only quotes the price; the acquisition
//      test is the GM's.
//   3. Elite Advance — the GM grants it for XP when no career rank offers it.
//      That route reuses extras.eliteAdvances, so the XP is counted where
//      every other off-table purchase is counted.
//
// GRADE IS CRAFTSMANSHIP, which is why the labels read "Good Bionic Arm":
// gearInfo already strips poor/common/good/best off the front of a gear label
// to find the catalogue entry, so a graded augmetic needs no special parsing
// anywhere else. The two entries whose tiers are not craftsmanship (the
// Resurrection Package) carry the tier in a parenthetical instead, which
// gearInfo also strips.
//
// Strength bonuses from power armour are CONDITIONAL, not flat: the suit
// grants them while it is powered and worn, and folding +20 S into the sheet
// would carry it into every unarmoured scene. Same reasoning as effects.js.

const G = (grade, gelt, xp, effect) => ({ grade, gelt, xp, effect });

export const AUGMETICS = [
  /* ---- bionics and implants ---- */
  {
    id: 'bionic-arm',
    name: 'Bionic Arm',
    kind: 'Bionic',
    stats: 'Replaces a lost arm · Good: +10 Strength for that arm, +1 AP',
    desc: 'A steel-and-ceramite limb. The Mechanicus considers the flesh it replaced an upgrade paid for in advance.',
    access: 'Tech-Priest starting cybernetic option; Forge World origin',
    careers: ['explorator'],
    origins: ['forge'],
    grades: [
      G('Common', 500, 100, 'Replaces the limb. No modifier.'),
      G('Good', 1500, 200, '+10 Strength for tests using that arm, and +1 AP to it.')
    ],
    conditionals: [
      { grade: 'Good', mod: 10, chars: ['s'], when: 'Strength tests made with the bionic arm' }
    ]
  },
  {
    id: 'bionic-leg',
    name: 'Bionic Leg',
    kind: 'Bionic',
    stats: 'Replaces a lost leg · Good: +10 Jump/Climb, +1 AP, +2m Movement',
    desc: 'Augmetic legs are common enough in the void that nobody looks twice at the gait.',
    access: 'Tech-Priest starting cybernetic option',
    careers: ['explorator'],
    origins: ['forge'],
    grades: [
      G('Common', 400, 100, 'Replaces the limb. No modifier.'),
      G('Good', 1200, 200, '+10 to Jump and Climb, +1 AP to the leg, and +2 metres Movement.')
    ],
    conditionals: [
      { grade: 'Good', mod: 10, chars: ['s', 'ag'], when: 'Jump and Climb tests' }
    ]
  },
  {
    id: 'bionic-senses',
    name: 'Bionic Senses',
    kind: 'Bionic',
    stats: 'Replaces eyes or ears · Good: Heightened Senses, Dark-Sight, or Targeter (+10 BS)',
    desc: 'Augmetic eyes rarely match the colour of the ones they replaced, and the Cult sees no reason they should.',
    access: 'Tech-Priest starting gear option',
    careers: ['explorator'],
    origins: ['forge'],
    grades: [
      G('Common', 500, 100, 'Restores the sense. No modifier.'),
      G('Good', 1500, 200, 'Pick one: Heightened Senses (that sense), Dark-Sight, or a Targeter for +10 Ballistic Skill.')
    ],
    conditionals: [
      { grade: 'Good', mod: 10, chars: ['bs'], when: 'shooting, if the Targeter option was taken' },
      { grade: 'Good', mod: 10, chars: ['per'], when: 'the augmented sense, if Heightened Senses was taken' }
    ]
  },
  {
    id: 'bionic-respiratory',
    name: 'Bionic Respiratory System',
    kind: 'Bionic',
    stats: 'Built-in rebreather, +20 vs toxins and gas · Good: 1 hour in vacuum',
    desc: 'Lungs of filtered bellows and sealed tubing. The cough never entirely goes away.',
    access: 'Tech-Priest, Guardsman, or Assassin replacement',
    careers: ['explorator', 'archmilitant', 'voidmaster'],
    origins: ['forge'],
    grades: [
      G('Common', 1000, 200, 'Acts as a built-in rebreather: +20 to resist toxins and gas.'),
      G('Good', 3000, 200, 'As Common, and survives up to an hour in vacuum or lethal atmosphere.')
    ],
    conditionals: [
      { mod: 20, chars: ['t'], when: 'resisting airborne toxins and gas' }
    ]
  },
  {
    id: 'miu',
    name: 'Mind Impulse Unit',
    kind: 'Bionic',
    stats: 'Neural interface · +10 Tech-Use and Pilot with linked systems',
    desc: 'A socket at the base of the skull. Machines answer faster than a hand ever could.',
    access: 'Tech-Priest, Adept, or Secutor Rank 4+',
    careers: ['explorator', 'seneschal'],
    origins: ['forge'],
    rank: 4,
    grades: [
      G('Common', 2500, 200, '+10 to Tech-Use and Pilot tests with a linked system.'),
      G('Good', 5000, 300, 'As Common, and the linked system can be run hands-free.')
    ],
    conditionals: [
      { mod: 10, chars: ['int', 'ag'], when: 'Tech-Use or Pilot tests through a linked system' }
    ]
  },
  {
    id: 'cortex-implant',
    name: 'Cortex Implant',
    kind: 'Bionic',
    stats: 'Cogitator link · +10 Logic and Lore · Good: Unnatural Intelligence (x2), Total Recall',
    desc: 'A cogitator grafted to the brain. What it remembers, it remembers exactly, whether or not that is a mercy.',
    access: 'High-rank Adept, Tech-Priest, or Savant',
    careers: ['explorator', 'seneschal'],
    origins: ['forge'],
    rank: 4,
    grades: [
      G('Common', 3000, 300, '+10 to Logic and all Lore tests.'),
      G('Good', 7500, 400, 'As Common, and grants Unnatural Intelligence (x2) and Total Recall.')
    ],
    conditionals: [
      { mod: 10, chars: ['int'], when: 'Logic and Lore tests' }
    ]
  },
  {
    id: 'sub-dermal-armour',
    name: 'Sub-Dermal Armour',
    kind: 'Bionic',
    stats: 'Micro-mesh under the skin · AP 1 body (Good: AP 2) · stacks with worn armour',
    desc: 'Woven mesh slid beneath the skin. Invisible until something fails to go through it.',
    access: 'Assassin, Guardsman, or Scum',
    careers: ['archmilitant', 'voidmaster'],
    origins: [],
    grades: [
      G('Common', 2000, 200, '+1 AP to the Body, stacking with worn armour.'),
      G('Good', 4500, 300, '+2 AP to the Body, stacking with worn armour.')
    ],
    conditionals: []
  },
  {
    id: 'mechadendrite',
    name: 'Mechadendrite',
    kind: 'Bionic',
    stats: 'Auxiliary cyber-limb — optical, gun or servo · optical grants +10 Perception',
    desc: 'A mechanical limb rising from the spine. Which pattern says a great deal about its owner.',
    access: 'Tech-Priest starting options and rank advances',
    careers: ['explorator'],
    origins: ['forge'],
    requires: 'Mechadendrite Use',
    grades: [
      G('Common', 500, 100, 'One mechadendrite: utility actions, optical sensors, or a weapon hardpoint.'),
      G('Good', 1500, 200, 'As Common, better built — the GM may allow a second hardpoint.')
    ],
    conditionals: [
      { mod: 10, chars: ['per'], when: 'sensor work through an Optical Mechadendrite' }
    ]
  },
  {
    id: 'volitor',
    name: 'Volitor Implants',
    kind: 'Bionic',
    stats: 'Cerebral governor · +20 to resist mind-reading and interrogation',
    desc: 'A governor wired into the will. It protects what it is told to protect, including from its host.',
    access: 'Inquisitorial Acolytes and Mind Cleansed agents — GM grant only',
    careers: [],
    origins: [],
    grades: [
      G('Common', 1500, 150, '+20 to resist mind-reading and interrogation. Can be triggered to wipe memory or induce a coma.')
    ],
    conditionals: [
      { mod: 20, chars: ['wp'], when: 'resisting mind-reading or interrogation' }
    ]
  },
  {
    id: 'resurrection-package',
    name: 'Cybernetic Resurrection Package',
    kind: 'Bionic',
    stats: 'Surgical rebuild into a cybernetic chassis · alters base characteristics and grants traits',
    desc: 'What comes back is not quite the same person, and the Mechanicus regards that as an improvement.',
    access: 'Post-incapacitation, or the reward for burning a Fate Point',
    careers: [],
    origins: [],
    gelt: null,
    geltNote: 'No price — a surgical procedure, not a purchase',
    grades: [
      G('Rebuild', null, 200, 'Maimed limbs and organs replaced. The GM sets which characteristics move.'),
      G('Full Resurrection', null, 500, 'Brought back whole in a metal chassis. New traits, new base characteristics, and a body of metal.')
    ],
    conditionals: []
  },

  /* ---- power armour ---- */
  {
    id: 'light-power-armour',
    name: 'Light Power Armour',
    kind: 'Power Armour',
    stats: 'AP 7 all · +10 Strength, Unnatural Strength (x2) · vox-caster, photo-visor, rebreather',
    desc: 'The lightest powered plate the Imperium fields. Still unmistakable in a corridor.',
    access: 'Inquisitorial requisition, or a high noble’s reward',
    careers: [],
    origins: [],
    requires: 'Power Armour Training',
    trainingXp: 200,
    grades: [
      G('Common', 10000, 300, 'AP 7 to all locations. +10 Strength and Unnatural Strength (x2) while powered. Integrated vox-caster, photo-visor and rebreather.')
    ],
    conditionals: [
      { mod: 10, chars: ['s'], when: 'Strength tests while the suit is powered' }
    ]
  },
  {
    id: 'ignatus-power-armour',
    name: 'Ignatus Power Armour',
    kind: 'Power Armour',
    stats: 'AP 8 (9 body) · +20 Strength, Unnatural Strength (x2) · auto-senses, 12-hour seal',
    desc: 'Inquisitorial plate, and a statement that the matter is no longer open to discussion.',
    access: 'High-level Inquisitorial assignment, or an Inquisitor Lord’s gift',
    careers: [],
    origins: [],
    requires: 'Power Armour Training',
    trainingXp: 200,
    grades: [
      G('Common', 20000, 500, 'AP 8, AP 9 to the body. +20 Strength and Unnatural Strength (x2) while powered. Auto-senses give +10 Ballistic Skill and Perception. Sealed for twelve hours.')
    ],
    conditionals: [
      { mod: 20, chars: ['s'], when: 'Strength tests while the suit is powered' },
      { mod: 10, chars: ['bs', 'per'], when: 'shooting and observation through the suit’s auto-senses' }
    ]
  },
  {
    id: 'sororitas-power-armour',
    name: 'Sororitas Power Armour',
    kind: 'Power Armour',
    stats: 'AP 7 (8 body) · form-fitted · +10 Strength · auto-senses, helmet vox, sealed',
    desc: 'Fitted to one wearer and to no other. Removing it from her is a theological problem as much as a practical one.',
    access: 'Issued as standard to Sororitas Militant ranks; 300 XP as an Elite Advance for anyone else',
    careers: [],
    origins: [],
    requires: 'Power Armour Training',
    trainingXp: 200,
    grades: [
      G('Common', null, 300, 'AP 7, AP 8 to the body. +10 Strength while powered. Auto-senses, helmet vox and a full environmental seal.')
    ],
    geltNote: 'Not sold — issued by the Order',
    conditionals: [
      { mod: 10, chars: ['s'], when: 'Strength tests while the suit is powered' },
      { mod: 10, chars: ['bs', 'per'], when: 'shooting and observation through the suit’s auto-senses' }
    ]
  },
  {
    id: 'astartes-power-armour',
    name: 'Astartes Power Armour (Mk VI / VII)',
    kind: 'Power Armour',
    stats: 'AP 8 (10 body) · +20 Strength · recoil suppression, auto-senses, bio-monitors, auto-medicae',
    desc: 'A relic of the Adeptus Astartes. Wearing one without the Black Carapace is an exercise in being worn by it.',
    access: 'Relic. Requires Space Marine Physiology and the Black Carapace',
    careers: [],
    origins: [],
    requires: 'Space Marine Physiology (Black Carapace)',
    trainingXp: 200,
    grades: [
      G('Common', null, 500, 'AP 8, AP 10 to the body. +20 Strength while powered. Recoil suppression, auto-senses, bio-monitors and auto-medicae systems.')
    ],
    geltNote: 'Priceless — a relic, never a purchase',
    conditionals: [
      { mod: 20, chars: ['s'], when: 'Strength tests while the suit is powered' },
      { mod: 10, chars: ['bs', 'per'], when: 'shooting and observation through the suit’s auto-senses' }
    ]
  }
];

export const augmeticById = (id) => AUGMETICS.find((a) => a.id === id) || null;

export const gradeOf = (id, grade) => {
  const a = augmeticById(id);
  if (!a) return null;
  return a.grades.find((g) => g.grade === grade) || a.grades[0];
};

/* ------------------------------ labels ------------------------------
   Craftsmanship grades go in front, where gearInfo already strips them.
   Anything else goes in a parenthetical, which gearInfo also strips. */

const CRAFT_GRADES = ['Poor', 'Common', 'Good', 'Best'];

export function labelFor(id, grade) {
  const a = augmeticById(id);
  if (!a) return '';
  const g = grade || a.grades[0].grade;
  if (g === 'Common') return a.name;              // the standard article is unmarked
  if (CRAFT_GRADES.includes(g)) return `${g} ${a.name}`;
  return `${a.name} (${g})`;
}

// The reverse: a stored gear label back to the augmetic and grade it names.
// Matching is by name, longest first, so "Bionic Respiratory System" is not
// shadowed by a shorter entry that happens to be a prefix.
const BY_NAME = [...AUGMETICS].sort((a, b) => b.name.length - a.name.length);

export function readLabel(label) {
  const text = String(label || '').trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  const item = BY_NAME.find((a) => lower.includes(a.name.toLowerCase()));
  if (!item) return null;
  const craft = CRAFT_GRADES.find((g) => lower.startsWith(g.toLowerCase() + ' '));
  const paren = (text.match(/\(([^)]*)\)\s*$/) || [])[1];
  const named = item.grades.find((g) => paren && g.grade.toLowerCase() === paren.trim().toLowerCase());
  const grade = named ? named.grade : (craft || 'Common');
  return { item, grade, grades: gradeOf(item.id, grade) };
}

/* ------------------------------ eligibility ------------------------------
   Initial gear is free, which is the only part of acquisition the app can
   decide on its own: one or two Mechanicus implants for an Explorator or a
   Forge World upbringing. Everything else is a price or a GM's call. */

export const STARTING_MAX = 2;

export const isFreeFor = (id, { careerId, originId } = {}) => {
  const a = augmeticById(id);
  if (!a) return false;
  // Boolean, not the truthy value: this crosses into JSON on a saved sheet,
  // where an undefined would simply vanish.
  return Boolean((careerId && a.careers.includes(careerId))
    || (originId && a.origins.includes(originId)));
};

export const freeFor = (who) => AUGMETICS.filter((a) => isFreeFor(a.id, who));

// How many of the free slots a sheet has already spent. The rule is one or
// two implants at creation, so the third has to be bought like anyone else's.
export const freeUsedIn = (labels, who) => (labels || []).reduce((n, label) => {
  const read = readLabel(label);
  return read && isFreeFor(read.item.id, who) ? n + 1 : n;
}, 0);

// What a character actually owes for one: nothing if it is initial gear,
// otherwise the grade's XP, plus the training talent where the item needs one
// and the character has not already got it.
export function costOf(id, grade, { careerId, originId, talents = [], freeUsed = 0 } = {}) {
  const a = augmeticById(id);
  if (!a) return null;
  const g = gradeOf(id, grade);
  const free = isFreeFor(id, { careerId, originId }) && freeUsed < STARTING_MAX;
  const held = (t) => talents.some((x) => String(x).toLowerCase().includes(String(t).toLowerCase()));
  const training = a.requires && a.trainingXp && !held(a.requires)
    ? { name: a.requires, xp: a.trainingXp } : null;
  return {
    free,
    gelt: free ? 0 : g.gelt,
    geltNote: a.geltNote || null,
    xp: free ? 0 : g.xp,
    training,
    // What the GM is asked to approve in total, training included.
    totalXp: (free ? 0 : g.xp) + (training ? training.xp : 0)
  };
}

/* ---------------------- conditionals from what is worn ----------------------
   Same idea as effects.js, but sourced from gear rather than the origin path:
   +10 Strength from a bionic arm applies to that arm, and +20 Strength from
   power armour applies while the suit is powered. Neither belongs in the
   characteristic total. Grade-gated entries only apply at that grade or
   better. */

const GRADE_RANK = { Poor: 0, Common: 1, Good: 2, Best: 3 };

export function conditionalsOf(labels) {
  const out = [];
  for (const label of labels || []) {
    const read = readLabel(label);
    if (!read) continue;
    for (const c of read.item.conditionals || []) {
      if (c.grade && (GRADE_RANK[read.grade] || 0) < (GRADE_RANK[c.grade] || 0)) continue;
      out.push({ from: labelFor(read.item.id, read.grade), mod: c.mod, chars: c.chars, when: c.when });
    }
  }
  return out;
}

export const conditionalsFor = (labels, charKey) =>
  conditionalsOf(labels).filter((c) => c.chars.includes(charKey));

/* ------------------------------ gear catalogue ------------------------------
   Merged into GEAR so an augmetic on a sheet shows its specs like any other
   item, keyed by lowercase name the way the rest of the catalogue is. */

export const AUGMETIC_GEAR = Object.fromEntries(AUGMETICS.map((a) => [
  a.name.toLowerCase(),
  { kind: a.kind, stats: a.stats, desc: a.desc }
]));
