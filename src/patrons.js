/* An Inquisitor as the party's patron, and the business of serving one:
   briefings, debriefings, and what the GM keeps count of in between.

   From the Imperium Maledictum Inquisition GM's Guide: its six Inquisitors of
   the Macharian Sector with their boons, liabilities and standing; its tables
   for how orders arrive, where the cell lies low and where it is met; how a
   debriefing goes; and the party's Subtlety. Written here in this app's own
   words. GM material: the Endeavour journal is where it is used.

   Where Imperium Maledictum's terms do not exist here, the conversion is the
   one rosettes.js states (Advantage +20, Disadvantage -20, +1 SL a Degree).
   Two of its systems this app does not have, and both are HOUSE RULES, named
   so they can be changed in one place:

     Superiority   a party resource against one foe. Each point: once a round,
                   +1 Degree of Success on one test against that foe. The book
                   also compares it with an enemy's Resolve, which Rogue Trader
                   has no figure for, so that half is the GM's call.
     Legitimacy    the book scores Inquisitors racing to be Inquisitor Lord.
                   Here it is the GM's hidden count of how far an Interrogator
                   has proved fit for the rosette: +1 or +2 for each mission that
                   settles something that mattered, never shown to the player.

   Pure: see patrons.check.mjs. */

import { DISADVANTAGE, asModifier } from './rosettes.js';

/* ------------------------------ the patrons ------------------------------ */

// Every Inquisitor patron has this boon, so it is said once.
export const LIMITLESS_AUTHORITY = 'Limitless Authority. When you use your patron’s Influence, you may use '
  + 'their Influence with the Inquisition in place of their Influence with the Faction you are dealing with. '
  + 'The other side may find that insulting, may not think much of your patron, or may be a heretic: the GM decides.';

const B = (name, text) => ({ name, text });
const SANCTUM = B('Sanctum Obscurus', 'A safehouse nobody else in the Imperium knows of, stocked with a chameleoline cloak, '
  + 'photo-visors, an auspex, a drop harness, a comm leech, a disguise kit, three magnoculars, a pict recorder, '
  + 'a signal jammer and a vox-caster.');
const DISCRETION = B('Demands Discretion', 'Keeps out of your missions and lets you use their name only when you must. '
  + 'Use it without good reason and your pay is docked. Secrecy looks like guilt in the Imperium: the GM may take a point '
  + 'of the patron’s Influence with the Administratum or the Inquisition.');
const OBSESSION = B('Obsessive Objective', 'One aim comes before every other. They may pull you off a mission to chase '
  + 'any lead on it, and failing to follow it displeases them.');

const P = (o) => o;

export const PATRONS = [
  P({
    id: 'baek', name: 'Ksenia Baek', ordo: 'hereticus', philosophy: 'thorian', demeanour: 'Zealous',
    territory: 'Cytheris Subsector', interrogator: 'Severina Melnyk',
    concerns: ['Find pure psykers across the sector.', 'Hunt rogue psykers and heretical cults.', 'Train psykers to strengthen the Inquisition.'],
    boons: [
      B('Pall in the Warp', 'Her agents carry a strange psychic mark. Psykers who face them take −10 on Willpower Tests against Fear and Pinning.'),
      B('Psychic Instruction', 'She can have psykers in her service trained, by her or an ally; while they are, psychic powers cost them 20 XP less.')
    ],
    liabilities: [
      OBSESSION,
      B('Witch Hunter', 'Any psyker near your mission untouched by Chaos is to be captured for the Black Ships. A rogue psyker, she wants the head of.')
    ],
    influence: { 'Adeptus Astra Telepathica': 1, Inquisition: 2 },
    moreBoons: ['Clandestine Inquisition Training Facility', 'Contact Network', 'Null Sanctum', 'Psychic Protection', 'Psyker Support'],
    moreLiabilities: ['Corrupt', 'Overextended', 'Strange Tastes', 'Suspect (Inquisition)', 'Warped Visions']
  }),
  P({
    id: 'halikarn', name: 'Aegidius Halikarn', ordo: 'hereticus', philosophy: 'recongregationism', demeanour: 'Inscrutable',
    territory: 'Cytheris Subsector', interrogator: 'Caecilius Elbegdorj',
    concerns: ['Root out heresy and cults on the sector’s most crowded worlds.', 'Uncover corruption running through the great Factions of the sector.'],
    boons: [
      B('Fearsome Reputation', 'Name him to anyone who knows of him and they make a Hard (−20) Willpower Test or are afraid of you. Anyone who shares a Faction with him knows the name.'),
      SANCTUM
    ],
    liabilities: [
      B('Abrupt', 'Brusque with every Faction: −1 Influence with three of them, already counted below.'),
      DISCRETION,
      B('Paranoid', 'Trusts nobody, you included: questions your reports, has you watched, may send you to die.')
    ],
    influence: { Inquisition: 2, 'Adeptus Mechanicus': -1, 'Adeptus Ministorum': -1, Administratum: -1, 'Rogue Trader Dynasties': -1 },
    moreBoons: ['Clandestine Inquisition Training Facility', 'Cleansing Flame', 'Cover Story', 'Plausible Deniability', 'Strategos Extremis'],
    moreLiabilities: ['Corrupt', 'Incessant Updates', 'Known Meddler', 'Revisionist', 'Suspect']
  }),
  P({
    id: 'horst', name: 'Sylvestrine Horst', ordo: 'hereticus', philosophy: 'amalathian', demeanour: 'Zealous',
    territory: 'Gallosque Nebula', interrogator: null,
    concerns: ['Keep the noble houses as they are.', 'Learn what became of Inquisitor Lord Drake, and what the Kryptman Protocol is.', 'Become Inquisitor Lord of the sector.'],
    boons: [
      B('Contact Network', 'Informants across the sector: +20 to Inquiry Tests in the local area.'),
      SANCTUM
    ],
    liabilities: [
      B('Deadly Assignments', 'She sends you where the fire is hottest, and may know more of the danger than she tells you.'),
      B('Enemy Operatives', 'A capable fireteam with its own transport harries her work on the ground: murder, sabotage, and now and then you.')
    ],
    influence: { Inquisition: 2, 'Adeptus Ministorum': 2 },
    moreBoons: ['Clandestine Inquisition Training Facility', 'Deploy Devout', 'Noble Blood', 'Spy Network', 'Strategos Extremis'],
    moreLiabilities: ['Crisis of Faith', 'Incessant Updates', 'Meticulous Archivist', 'Obsolete Observer', 'Pious Stipulations']
  }),
  P({
    id: 'raud', name: 'Alis Raud', ordo: 'malleus', philosophy: 'xanthism', demeanour: 'Pragmatic',
    territory: 'Drimor Subsector', interrogator: 'Damien Savantas',
    concerns: ['Keep the Ordo Malleus’s secrets.', 'Hunt the daemons and cults she ties to a heretic of the Macharian Crusade, long thought dead.'],
    boons: [
      B('Daemonshield', 'Wards daubed on your gear. Once a mission, +20 to one test to resist Corruption or one Opposed Test against a psyker or a daemon.'),
      B('Spy Network', 'An informant in every Imperial Faction. Reach one and they know something useful, or at least who does.')
    ],
    liabilities: [
      B('Demands Discretion', 'Use her name only when you must. Ignore that and she may punish you, or have you disappear. Her secrecy draws Administratum adepts and other Inquisitors’ agents in time.'),
      B('Known Meddler', `Known for interfering. When you use her Influence, the party’s next Fellowship Test is at ${asModifier(DISADVANTAGE)}; she has −1 Influence with two Factions of the GM’s choosing.`),
      OBSESSION
    ],
    influence: { Inquisition: 2, Infractionists: 2, 'Adeptus Astra Telepathica': -1, 'Imperial Navy': -1 },
    moreBoons: ['Backchannel Contacts', 'Blackmailer', 'Cover Story', 'Forger', 'Witch Hunt'],
    moreLiabilities: ['Abrupt', 'Excommunicated', 'Loose Cannon', 'Psyker Slayer', 'Saboteur']
  }),
  P({
    id: 'serranus', name: 'Konstan Serranus', ordo: 'xenos', philosophy: 'monodominant', demeanour: 'Wrathful',
    territory: 'Andosk Subsector', interrogator: 'Arnaut Cisneros',
    concerns: ['Stop any xenos interference in the sector.', 'Carry the fight to the aliens beyond its borders.', 'Find out why Genestealer Cults are rising across it.'],
    boons: [
      B('Augmetics Bay', 'A base in an augmetics facility: no Acquisition Test for augmetics, surgery free, and each one Good Craftsmanship.'),
      B('Servitor Clade', 'Once a mission, a servitor slaved to each of you for a day.')
    ],
    liabilities: [
      B('Dogmatic', 'Any word against the Emperor or His Ecclesiarchy is punished: docked pay, or the arco-flagellant’s chair.'),
      B('Obsolete Observer', 'A servo-skull or servitor with a pict recorder follows you to see how you work, and gets in the way.'),
      B('Utter Purity', 'Psykers, the warp and the works of xenos, mutants and heretics are abhorrent to him. Transgressors lose a hand, or their life.')
    ],
    influence: { Inquisition: 2, 'Adeptus Mechanicus': 2 },
    moreBoons: ['Adeptus Mechanicus Instruction', 'Cleansing Flame', 'Ideologue Crusader', 'Purification Rituals', 'Strategos Extremis'],
    moreLiabilities: ['Abrupt', 'Enemy (Eskender Thracius)', 'Incessant Updates', 'Paranoid', 'Unorthodox Beliefs']
  }),
  P({
    id: 'thracius', name: 'Eskender Thracius', ordo: 'xenos', philosophy: 'isstvanism', demeanour: 'Pragmatic',
    territory: 'Cytheris Subsector', interrogator: 'Julios Macrio',
    concerns: ['Study the Eldar.', 'Prepare for the Emperor’s return.', 'Keep his web of false names, and stay alive.'],
    boons: [
      B('Dubious Allies', 'Dealing with his strange company draws no suspicion outside the Inquisition: people assume you are infiltrating them.'),
      B('Xenotechnician', 'He lets you loot and use xenos technology, and rewards you for bringing it to his collection. That protects you from nobody else.')
    ],
    liabilities: [
      DISCRETION,
      B('Hallowed Ignorance', 'Tells you nothing you do not need, and may work against your digging for more.'),
      B('Heretek', 'At the start of a mission each piece of lawful gear you carry has a 5% chance of tech-heretical changes. The Mechanicus will seize it and try to arrest whoever carries it.')
    ],
    influence: { Inquisition: 2, 'Adeptus Mechanicus': -1, Administratum: -1 },
    moreBoons: ['Adeptus Mechanicus Instruction', 'Arms of the Alien (Eldar)', 'Forbidden Archive', 'Sanctum Obscurus', 'Tentative Alliance'],
    moreLiabilities: ['Convoluted Communicae', 'Enemy (Konstan Serranus)', 'Excommunicated', 'Offended the Omnissiah', 'Suspect']
  })
];

export const patronById = (id) => PATRONS.find((p) => p.id === id) || null;

// The book's d10 for a further boon or liability: two numbers to a result.
// Only the names are here; what each does is Imperium Maledictum's.
export const extraFor = (patron, roll) => {
  const i = Math.floor((Math.max(1, Math.min(10, Math.round(Number(roll) || 0))) - 1) / 2);
  return patron ? { boon: patron.moreBoons[i], liability: patron.moreLiabilities[i] } : null;
};

/* ------------------------------ Subtlety ------------------------------
   How covertly the party is working, 10 down to 1. The GM keeps it, secretly;
   the party has to work to find out where they stand. The full rules for what
   moves it are in the Inquisition Player's Guide, which this app does not
   have: the bands are the GM's Guide's, and the moving is the GM's. */

export const SUBTLETY_MAX = 10;
export const SUBTLETY_BANDS = [
  { id: 'covert', name: 'Covert', from: 8, to: 10 },
  { id: 'suspicious', name: 'Suspicious', from: 5, to: 7 },
  { id: 'overt', name: 'Overt', from: 2, to: 4 },
  { id: 'exposed', name: 'Exposed', from: 1, to: 1 }
];
export const clampSubtlety = (n) => Math.max(1, Math.min(SUBTLETY_MAX, Math.round(Number(n) || SUBTLETY_MAX)));
export const subtletyBand = (n) => {
  const v = clampSubtlety(n);
  return SUBTLETY_BANDS.find((b) => v >= b.from && v <= b.to);
};
// What the book says costs it, gathered from across its chapters.
export const SUBTLETY_COSTS = [
  'Showing a rosette, or the Inquisition’s mark, where people can see it.',
  'Breaking a stipulation of the briefing: a cover story, someone who must not know.',
  'Using an infractionist’s tools or contacts, or being seen with xenos.',
  'Psychic phenomena around the party, or daemonic activity they cause.',
  'Dealing with a Faction openly when the mission needed it done quietly.'
];

/* ------------------------------ briefing ------------------------------ */

// How the patron sends orders. d10.
export const COMMUNIQUES = [
  'A relay of astropaths speaks through one Acolyte, who is helpless until the message ends.',
  'Infractionist couriers, well paid and better threatened.',
  'Book ciphers broadcast on the local vox: the key is a particular volume in a local archive.',
  'Coded lines planted in a local preacher’s sermons: someone attends every service.',
  'Orders rolled inside bullet casings in an ammunition shipment, each stamped with the Inquisition’s mark.',
  'Local servo-skulls, taken over by some means the cell never learns, carry messages both ways.',
  'A messenger wearing a stranger’s face through polymorphine, known by a signet ring like the rosette.',
  'A cyber-augmented bird of prey with bladed wings and a second, mechanical head that projects the orders.',
  'A rotating schedule of encrypted vox channels: miss the mathematics or the hour and you miss the orders.',
  'A servitor that broadcasts hymns, and the orders hidden as interference in them.'
];

// Where the cell lies low. d10.
export const SAFEHOUSES = [
  'Secure rooms at a hostelry whose keeper is paid, or blackmailed, into silence.',
  'An abandoned Imperial Guard barracks, lightly fortified, with long sightlines.',
  'An old Arbites watch post with a guard tower and lockers of old uniforms and kit.',
  'A hangar off the local voidport, big enough for a Valkyrie, close to transport off-world.',
  'The basement of a gang-owned bar with a back way in; working the bar builds a cover.',
  'An empty wing of a noble’s mansion with secret doors, and a host who owes the patron and hates it.',
  'The top floors of an abandoned hive spire, reached by a hidden lift.',
  'A corner of a manufactorum set aside by a Tech-Priest, loud enough to cover anything.',
  'A forgotten wing of an Administratum archive, beside wings full of local records.',
  'A small cathedral whose congregation is a front, and whose priests have been told to treat you as saints.'
];

// Where the patron meets them. d10.
export const MEETING_PLACES = [
  'The inner chambers of a busy cathedral, reached by a passage only the patron’s faction knows.',
  'A dead vox-relay satellite in orbit; the Mechanicus provide the shuttle.',
  'An abandoned control room in a manufactorum, its noise covering every word.',
  'A disused rail station, with the patron’s own engine and carriage.',
  'The deepest cells of an Arbites precinct-fortress; they may simply arrest the cell to bring it there.',
  'A closed section of a morgue, all service doors and cold storage.',
  'A forgotten cathedral in the lower hive whose odd little cult asks no questions.',
  'A condemned hab block even the gangs avoid, with room for vehicles.',
  'A rooftop garden of strange plants under a spire’s dome, with a secret way in and a landing pad.',
  'A back-alley chirurgeon’s, where the patron keeps an office of dubious medicae and instruments of question.'
];

export const rollOn = (table, rng = Math.random) => {
  const i = Math.floor(rng() * table.length);
  return { roll: i + 1, text: table[i] };
};

/* ------------------------------ debriefing ------------------------------
   The cell presents what it found and answers for how it got it. Each piece
   of evidence is +10 on Fellowship Tests with the patron (the book's +1 SL);
   justifying what they did is Challenging to Very Hard depending on how far
   they strayed from orders. Rogue Trader caps a test's modifiers at +/-60. */

export const EVIDENCE_BONUS = 10;
export const MAX_MODIFIER = 60;
export const STRAYED = [
  { id: 'kept', name: 'Kept to their orders', difficulty: 'Challenging (+0)', mod: 0 },
  { id: 'bent', name: 'Bent them', difficulty: 'Difficult (−10)', mod: -10 },
  { id: 'broke', name: 'Broke them', difficulty: 'Hard (−20)', mod: -20 },
  { id: 'defied', name: 'Defied them outright', difficulty: 'Very Hard (−30)', mod: -30 }
];
export const strayedById = (id) => STRAYED.find((s) => s.id === id) || STRAYED[0];

export function debriefModifier({ evidence = 0, strayed = 'kept' } = {}) {
  const n = Math.max(0, Math.floor(Number(evidence) || 0));
  const total = n * EVIDENCE_BONUS + strayedById(strayed).mod;
  return Math.max(-MAX_MODIFIER, Math.min(MAX_MODIFIER, total));
}

// What a debriefing can lead to, for the GM to read out of the result.
export const DEBRIEF_OUTCOMES = [
  { id: 'justify', name: 'Justification', text: 'Answering for executions, arrests, fights and broken law. Done well, the patron sends more help next time: guards, or access to what is forbidden.' },
  { id: 'shape', name: 'Shaping what comes next', text: 'The evidence decides where the cell goes next, and may turn the patron’s attention, or bring them into the field.' },
  { id: 'foe', name: 'Know thy foe', text: 'Strong evidence about an enemy is +1 Superiority against it in the coming fight, and may bring weapons, gear or contacts fit to fight it.' },
  { id: 'strange', name: 'Strange complications', text: 'Whatever did not fit is passed on, so other cells and contacts can look into it. This is the cell’s last chance to come clean without consequences.' }
];

export const SUPERIORITY_RULE = 'Each point of Superiority against a foe: once a round, +1 Degree of Success on one test against it.';
export const LEGITIMACY_RULE = 'The GM’s hidden count of how far an Interrogator has shown themselves fit for a rosette: +1 or +2 for each mission that settles something that mattered. The player never sees it.';

/* What the journal stores for these, read the way endeavours.js reads
   everything else: defaulted, clipped, and never trusted. */

const str = (v, max) => String(v == null ? '' : v).slice(0, max);
const int = (v, lo, hi, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.floor(n))) : fallback;
};

// The Endeavour's Inquisition: whose work it is, and how quiet the cell is.
export function readInquisitionJournal(v) {
  const src = v && typeof v === 'object' ? v : {};
  return {
    patron: patronById(src.patron) ? src.patron : '',
    // Free text, for a patron of the GM's own.
    patronName: str(src.patronName, 80),
    subtlety: clampSubtlety(src.subtlety)
  };
}

// One mission's debriefing.
export function readDebrief(v) {
  const src = v && typeof v === 'object' ? v : {};
  const rows = (list, fn) => (Array.isArray(list) ? list : []).filter((x) => x && typeof x === 'object').map(fn).slice(0, 20);
  return {
    evidence: int(src.evidence, 0, 20),
    strayed: strayedById(src.strayed).id,
    notes: str(src.notes, 1200),
    superiority: rows(src.superiority, (x) => ({ foe: str(x.foe, 80), points: int(x.points, 0, 10) })),
    // GM-only: stripped before the journal reaches the table.
    legitimacy: rows(src.legitimacy, (x) => ({ who: str(x.who, 80), gained: int(x.gained, -5, 5) }))
  };
}

// Superiority the party holds, by foe, across an Endeavour's missions. Read
// again here because the party's copy arrives from the server as it was sent.
export function superiorityByFoe(end) {
  const out = {};
  for (const m of (end && end.missions) || []) {
    for (const s of readDebrief(m && m.debrief).superiority) {
      const foe = s.foe.trim();
      if (foe && s.points) out[foe] = (out[foe] || 0) + s.points;
    }
  }
  return out;
}

// Legitimacy by person, across every Endeavour: a career outlives a campaign.
// Names are compared without case or surrounding spaces, and shown as first written.
export function legitimacyTotals(endeavours) {
  const out = {};
  const shown = {};
  for (const e of endeavours || []) {
    for (const m of (e && e.missions) || []) {
      for (const l of readDebrief(m && m.debrief).legitimacy) {
        const key = l.who.trim().toLowerCase();
        if (!key) continue;
        shown[key] = shown[key] || l.who.trim();
        out[key] = (out[key] || 0) + l.gained;
      }
    }
  }
  return Object.keys(out).map((k) => ({ who: shown[k], total: out[k] }));
}
