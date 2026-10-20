// A voidship's personality: the Machine Spirit Oddity it has picked up, and
// the Past History it carries.
//
// Rogue Trader makes this Step 3 of starship creation — after the hull is
// chosen and BEFORE components are bought, because some results change what
// the ship can afford. Fantasy Flight's own Drydock aid lays the steps out
// that way:
//
//   1. Determine Ship Points        4. Selecting Essential Components
//   2. Select starship hull         5. Selecting Supplemental Components
//   3. DEVELOPING PERSONALITY
//
// The twenty entries below are Table 8-1 (Machine Spirit Oddities, Core
// Rulebook p. 197) and Table 8-2 (Past Histories, p. 198), effects as
// printed.
//
// `mods` carries ONLY the part of an entry that is a flat change to a ship
// statistic this app actually models — Detection, Armour, Speed,
// Manoeuvrability, Hull Integrity, Morale, Population, Power. Those are
// summed into ship.js's stats() alongside the component modifiers, so a
// Resolute ship really does sail with +3 Hull Integrity.
//
// Everything else stays printed text and is NOT applied, because applying
// half of a rule is worse than applying none of it:
//
//   - test modifiers on skills this app does not roll for a ship
//     (Navigation, Intimidate, Tech-Use repair, Pilot to escape)
//   - conditional modifiers that depend on a state the ship does not track
//     (Wrothful and Skittish change in combat; Adventurous depends on
//     whether an Endeavour is running)
//   - anything the GM adjudicates (Rebellious unpowering a component,
//     Turbulent Past's two social groups, a Misfortune rolled twice)
//
// `applies` names the modifiers in plain words for the builder to show, so
// it is obvious on screen which half of a rule the app has taken care of.

const ODDITY_PAGE = 197;
const HISTORY_PAGE = 198;

const entry = (roll, name, page, effect, mods = null) => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
  roll, name, page, effect, mods
});

/* ---- Table 8-1: Machine Spirit Oddities (Core Rulebook p. 197) ---- */

export const MACHINE_SPIRIT_ODDITIES = [
  entry(1, 'A Nose for Trouble', ODDITY_PAGE,
    'Something about this ship quivers at the thought of battle, always probing the cosmos '
    + 'for a new victim. Add +5 to the ship’s Detection, and reduce this ship’s Armour '
    + 'by 1, due to its many battles. Occasionally, the crew may find themselves in fights they '
    + 'might have preferred to avoid.',
    { detection: 5, armour: -1 }),

  entry(2, 'Blasphemous Tendencies', ODDITY_PAGE,
    'Some unidentifiable aspect of this vessel’s spirit resonates sympathetically with the '
    + 'Immaterium. Captains find this ship swims through the warp more easily, as if it was more '
    + 'at home there. All Navigation Tests made to pilot this vessel through the warp gain a +15 '
    + 'bonus. However, while aboard the ship, all crew suffer −5 to Willpower based Tests.'),

  entry(3, 'Martial Hubris', ODDITY_PAGE,
    'The ship has a glorious legacy of warfare and triumphant combats. It is always eager to '
    + 'fight, and unwilling to back down. The ship gains +5 to all Ballistic Skill Tests to fire '
    + 'its weapons, but suffers −15 on any Pilot (Space Craft) Tests made to escape combat.'),

  entry(4, 'Rebellious', ODDITY_PAGE,
    'This vessel does not suffer authority willingly. At times it seems to take pleasure in '
    + 'interfering with the plans of its masters. During no more than one space combat per game '
    + 'session, the GM should randomly select one of the ship’s Components that becomes '
    + 'unpowered until repaired. However, whenever the ship suffers a critical hit (for any '
    + 'reason) roll 1d10. On an 8 or higher, the critical effect is ignored.'),

  entry(5, 'Stoic', ODDITY_PAGE,
    'The vessel behaves like a beast of burden, plodding but reliable. Due to its somewhat '
    + 'plodding behaviour, whenever the crew would gain Profit Factor from an Endeavour, reduce '
    + 'the amount gained by 1. However, whenever one of the ship’s Components becomes '
    + 'damaged or unpowered, roll 1d10. On a 7 or higher, the ship shrugs off the damage and it '
    + 'is ignored.'),

  entry(6, 'Skittish', ODDITY_PAGE,
    'The ship fears battle, bucking against its masters when entering the fray. When in combat, '
    + 'reduce the ship’s Speed by 1. However, when not in danger, it runs eagerly and fast. '
    + 'Reduce the travel time for any long distance (between stars) voyage by 1d5 weeks, to a '
    + 'minimum of 1.'),

  entry(7, 'Wrothful', ODDITY_PAGE,
    'The ship’s spirit constantly smoulders with anger. In battle, it explodes into a '
    + 'berserker fury, straining and exhausting its systems. During combat, the ship gains +1 '
    + 'Speed and +7 Manoeuvrability. Out of combat, the ship suffers −1 Speed and −5 to '
    + 'Manoeuvrability and Detection.'),

  entry(8, 'Resolute', ODDITY_PAGE,
    'There is little in the universe that can stagger this vessel. No matter the foe, it will '
    + 'advance slowly but surely to meet it. The ship suffers −1 Speed, but gains +3 Hull '
    + 'Points and grants a +10 bonus to all Repair Tests.',
    { speed: -1, hullIntegrity: 3 }),

  entry(9, 'Adventurous', ODDITY_PAGE,
    'The vessel is eager to seek new horizons, to turn its bow from civilisation and delve into '
    + 'the darkness of the unknown. When participating in an Endeavour the ship gains +10 '
    + 'Detection; when not participating in an Endeavour it suffers −10 Detection.'),

  entry(10, 'Ancient and Wise', ODDITY_PAGE,
    'This ship is of a bygone age, having survived many millennia of voyages and adventures. Its '
    + 'hull has weakened over the centuries, but it anticipates the needs of its crew, and will '
    + 'move as one with a competent master. The ship suffers −4 Hull Integrity but gains a '
    + '+10 bonus to any Manoeuvre Actions it performs (including out of combat and ramming).',
    { hullIntegrity: -4 })
];

/* ---- Table 8-2: Past Histories (Core Rulebook p. 198) ---- */

export const PAST_HISTORIES = [
  entry(1, 'Reliquary of Mars', HISTORY_PAGE,
    'Somehow, this vessel has been outfitted with ancient archaeo-tech systems from mankind’s '
    + 'forgotten past. When constructing this vessel, players must select 1 Archeotech Component '
    + 'of their choice. However, any Tech-Use Tests to repair the ship suffer a −20, due to '
    + 'the highly complex nature of the machinery. Additionally, the tech priests of Mars regard '
    + 'the vessel as holy, or at least having holy components. Some may petition to visit the '
    + 'vessel, others may want it for themselves.'),

  entry(2, 'Haunted', HISTORY_PAGE,
    'Some nameless horror haunts this vessel’s past, leaving voidsmen to whisper stories of '
    + 'ghosts wandering through the corridors and cabins. Reduce Morale permanently by 10. '
    + 'However, strange premonitions flicker on the auger arrays, granting a +6 to the ship’s '
    + 'Detection. Additionally, all non-crewmembers suffer −5 to Command Tests involving '
    + 'boarding actions or hit and run actions against the haunted vessel.',
    { morale: -10, detection: 6 }),

  entry(3, 'Emissary of the Imperator', HISTORY_PAGE,
    'The vessel is a veritable monument to the power and grandeur of the God-Emperor’s '
    + 'might. Awe-inspiring and terrible, it lacks subtlety. All Intimidate Tests made by '
    + 'characters from this vessel gain +15, while all other social Skill Tests suffer a −5. '
    + 'These bonuses and penalties only apply if the character is known to be from the vessel.'),

  entry(4, 'Wolf in Sheep’s Clothing', HISTORY_PAGE,
    'Beneath this vessel’s unassuming exterior is a dangerous spacefaring predator. The '
    + 'captain selects three Components. When scanned or subjected to anything but a thorough '
    + 'internal inspection, these components will either not register on the scans, or appear to '
    + 'be a different Component of the same type. However, the ship suffers −2 Power to '
    + 'maintain the systems creating the illusion.',
    { power: -2 }),

  entry(5, 'Turbulent Past', HISTORY_PAGE,
    'Over the years this ship has been used to perform deeds dastardly to some and heroic to '
    + 'others. The GM selects a social group (pirates, heretics, the Imperial Navy, the '
    + 'Inquisition, or inhabitants of an important locale like Footfall). All ship’s crew '
    + 'suffer a −20 to social Skill Tests when interacting with that group. The GM then '
    + 'selects a second group naturally opposed to the first. All ship’s crew gain +20 when '
    + 'interacting with that group.'),

  entry(6, 'Death Cult', HISTORY_PAGE,
    'Amongst the low-decks indentured crew, strange perversions of the Imperial Creed have '
    + 'arisen, glorifying death to celebrate the Emperor. Reduce Crew Population permanently by '
    + '8. However, reduce all Morale loss from any source by 2, due to the crew’s unwavering '
    + 'faith. Additionally, ship officers and members of the Ministorum will have to deal warily '
    + 'with the cult and its leaders.',
    { population: -8, moraleLossReduction: 2 }),

  entry(7, 'Wrested from a Space Hulk', HISTORY_PAGE,
    'The ship has been recovered from a space hulk — a mass of wrecked ships that drifts '
    + 'intermittently through the warp and realspace. The ship is very old (and thus of high '
    + 'quality), but those who know of its origins whisper that it is cursed. The ship gains +1 '
    + 'Armour, +1 Speed, and +3 Manoeuvrability. However, every time the crew suffers a '
    + 'Misfortune, the GM rolls twice and chooses the worse of the two.',
    { armour: 1, speed: 1, manoeuvre: 3 }),

  entry(8, 'Temperamental Warp Engine', HISTORY_PAGE,
    'The ship suffers a flutter in its Warp Engines, an inconsistency that no amount of '
    + 'maintenance or supplication can eliminate. Whenever the ship travels through the '
    + 'immaterium, the GM should roll 1d10. On a 6 or lower, the journey takes an additional 1d5 '
    + 'weeks; on a 7 or higher, the travel time is reduced 1d5 weeks instead (potentially causing '
    + 'the ship to arrive before it left). Once in a great while, the ship will leave the warp to '
    + 'find itself someplace other than its intended destination.'),

  entry(9, 'Finances in Arrears', HISTORY_PAGE,
    'The ship was purchased with borrowed funds. The money could have come from a criminal '
    + 'organisation, influential noble, or even a member of the Inquisition — but no matter '
    + 'the source, the debt must be repaid. Whenever the crew attempts to complete an '
    + 'Endeavour’s Objective, they must accumulate an additional 50 Achievement Points to '
    + 'accomplish the Objective. However, the ship’s financier supports his investment by '
    + 'providing aid and information. All crew can count their financier as a reliable contact.'),

  entry(10, 'Xenophilous', HISTORY_PAGE,
    'Through dealings with some xenos race, this vessel has been outfitted with examples of their '
    + 'blasphemous technology. When constructing this vessel, players must select 1 Xenotech '
    + 'Component of their choice. However, any Tech-Use Tests to repair the ship suffer a '
    + '−30, due to the strange and blasphemous nature of the machinery. Should the character '
    + 'attempting the repairs have Forbidden Lore (Xenos), the penalty is only −10. Also, '
    + 'the forces of the Ordo Xenos have an interest in the vessel and who controls it.')
];

/* ---- lookup and rolling ---- */

const byId = (table) => (id) => table.find((e) => e.id === id) || null;
export const oddityById = byId(MACHINE_SPIRIT_ODDITIES);
export const historyById = byId(PAST_HISTORIES);

// A roll outside 1-10 is a caller bug rather than a table gap, so it comes
// back null instead of silently landing on the nearest entry.
const byRoll = (table) => (roll) => table.find((e) => e.roll === Number(roll)) || null;
export const oddityForRoll = byRoll(MACHINE_SPIRIT_ODDITIES);
export const historyForRoll = byRoll(PAST_HISTORIES);

// Dice injected, as everywhere else in this app, so the roll is testable and
// the server can roll it when a GM rolls a ship for the table.
export const EMPTY_HISTORY = { oddityId: null, historyId: null };

export function rollShipPersonality(d10 = () => 1 + Math.floor(Math.random() * 10)) {
  const oddity = oddityForRoll(d10());
  const history = historyForRoll(d10());
  return {
    oddityId: oddity ? oddity.id : null,
    historyId: history ? history.id : null
  };
}

// Anything absent is defaulted rather than trusted: a blueprint saved before
// this existed arrives without the field, same rule as readBlueprint's.
export const readHistory = (h) => ({
  oddityId: (h && oddityById(h.oddityId)) ? h.oddityId : null,
  historyId: (h && historyById(h.historyId)) ? h.historyId : null
});

export const entriesOf = (h) => {
  const { oddityId, historyId } = readHistory(h);
  return [oddityById(oddityId), historyById(historyId)].filter(Boolean);
};

/* ---- the part the engine applies ---- */

// Every statistic a history entry can move. Named so a typo in a `mods`
// object fails the check rather than silently doing nothing.
export const MOD_KEYS = [
  'speed', 'manoeuvre', 'detection', 'armour', 'hullIntegrity',
  'morale', 'population', 'power', 'moraleLossReduction'
];

// The flat modifiers of both rolled entries, summed. ship.js adds these to
// the hull's own figures the same way it adds a component's.
export function historyMods(h) {
  const out = {};
  for (const e of entriesOf(h)) {
    for (const [k, v] of Object.entries(e.mods || {})) out[k] = (out[k] || 0) + v;
  }
  return out;
}

// The same figures as a line a reader can check against the hull: "+5
// Detection, -1 Armour". Shown beside the entry so it is obvious which half
// of a printed rule the app has taken care of and which half is the GM's.
const MOD_LABELS = {
  speed: 'Speed', manoeuvre: 'Manoeuvrability', detection: 'Detection',
  armour: 'Armour', hullIntegrity: 'Hull Integrity', morale: 'Morale',
  population: 'Crew Population', power: 'Power',
  moraleLossReduction: 'Morale loss reduction'
};

export function describeMods(mods) {
  const parts = Object.entries(mods || {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${v > 0 ? '+' : '−'}${Math.abs(v)} ${MOD_LABELS[k] || k}`);
  return parts.join(', ');
}

/* ---- what the sheet prints for a ship ---- */

export function describeHistory(h) {
  const { oddityId, historyId } = readHistory(h);
  const o = oddityById(oddityId);
  const p = historyById(historyId);
  if (!o && !p) return null;
  return {
    oddity: o, history: p,
    line: [o && o.name, p && p.name].filter(Boolean).join(' · ')
  };
}
