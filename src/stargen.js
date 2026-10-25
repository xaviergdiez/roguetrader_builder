// The star system generator: a whole system rolled from its star outward.
//
// Rogue Trader's own system generation (Stars of Inequity) builds a system in
// this order, and so does this:
//
//   system features  ->  star  ->  three zones  ->  elements in each zone
//                                                -> planets, in detail
//
// The three zones are fixed: Inner Cauldron, Primary Biosphere, Outer
// Reaches. The star decides which of them is Dominant or Weak, that decides
// how many elements each holds, and the zone a planet lands in reaches all
// the way down into its climate and its atmosphere.
//
// Dice are injected, same as npcgen.js and everywhere else here: `rng` is a
// () => [0,1) function defaulting to Math.random, so a check can hand in a
// scripted sequence and get the same system back every time.
//
// WHAT THIS DOES NOT DO YET: the contents of a derelict station or a
// starship graveyard, the pirate fleet behind a Pirate Den, and the full
// xenos stat blocks for native species. Those are their own generators in
// the source material and are left for a second pass; a system rolled here
// names them and leaves the GM to stock them. npcgen.js already rolls a
// creature when one is needed at the table.

const d = (rng, n) => 1 + Math.floor(rng() * n);
const d10 = (rng) => d(rng, 10);
const d100 = (rng) => d(rng, 100);
const d5 = (rng) => d(rng, 5);
const inTable = (table, roll) => table.find((r) => roll >= r.min && roll <= r.max) || null;
const clampLow = (n, low = 0) => Math.max(low, n);

/* ================================ the star ================================
   Each result names what it does to a zone, which is the only way the star
   reaches the rest of the system. */

export const ZONES = [
  { id: 'inner_cauldron', name: 'Inner Cauldron' },
  { id: 'primary_biosphere', name: 'Primary Biosphere' },
  { id: 'outer_reaches', name: 'Outer Reaches' }
];

export const zoneById = (id) => ZONES.find((z) => z.id === id) || null;

// effects: [zoneId, 'dominant' | 'weak'][]
export const STAR_TYPES = [
  { min: 1, max: 1, id: 'mighty', name: 'Mighty',
    effects: [['inner_cauldron', 'dominant'], ['outer_reaches', 'weak']] },
  { min: 2, max: 4, id: 'vigorous', name: 'Vigorous', effects: [] },
  { min: 5, max: 7, id: 'luminous', name: 'Luminous',
    effects: [['inner_cauldron', 'weak']] },
  { min: 8, max: 8, id: 'dull', name: 'Dull',
    effects: [['outer_reaches', 'dominant']] },
  { min: 9, max: 9, id: 'anomalous', name: 'Anomalous', rolls: 'anomalous', effects: [] },
  { min: 10, max: 10, id: 'binary', name: 'Binary', rolls: 'binary', effects: [] }
];

export const starTypeById = (id) => STAR_TYPES.find((s) => s.id === id) || null;

// An Anomalous star rolls again on its own 1d7 for which zone it warps.
export const ANOMALOUS = [
  { min: 1, max: 1, effects: [['inner_cauldron', 'dominant']], note: 'Inner Cauldron Dominant' },
  { min: 2, max: 2, effects: [['inner_cauldron', 'weak']], note: 'Inner Cauldron Weak' },
  { min: 3, max: 3, effects: [['primary_biosphere', 'dominant']], note: 'Primary Biosphere Dominant' },
  { min: 4, max: 4, effects: [['primary_biosphere', 'weak']], note: 'Primary Biosphere Weak' },
  { min: 5, max: 5, effects: [['outer_reaches', 'weak']], note: 'Outer Reaches Weak' },
  { min: 6, max: 6, effects: [['outer_reaches', 'dominant']], note: 'Outer Reaches Dominant' },
  { min: 7, max: 7, effects: [], note: 'No effect' }
];

// A Binary pair takes its effect from one of the two companions. Only the
// first eight star results can be a companion — an Anomalous or Binary
// companion would recurse, which the source material does not intend.
const COMPANION_MAX = 8;

export function rollStar(rng = Math.random) {
  const base = inTable(STAR_TYPES, d10(rng));
  if (base.rolls === 'anomalous') {
    const row = inTable(ANOMALOUS, d(rng, 7));
    return { type: base, effects: row.effects, detail: row.note, companions: null };
  }
  if (base.rolls === 'binary') {
    const twins = d10(rng) <= 7;
    const a = inTable(STAR_TYPES, d(rng, COMPANION_MAX));
    const b = twins ? a : inTable(STAR_TYPES, d(rng, COMPANION_MAX));
    // Twin stars share one type and so share its effect. A mixed pair takes
    // the effect of the stronger star, and this table runs brightest-first:
    // Mighty is 1 and Dull is 8, so the LOWER roll is the mightier of the
    // two and the one that sets the system's zones.
    const ruling = twins ? a : (a.min <= b.min ? a : b);
    return {
      type: base, effects: ruling.effects, companions: [a, b],
      detail: twins ? `Twin ${a.name} stars` : `${a.name} and ${b.name}`
    };
  }
  return { type: base, effects: base.effects, detail: null, companions: null };
}

/* ============================= system features =============================
   1d5-2 features, minimum 1, each on 1d10. A duplicate is rerolled and does
   not count against the total. Several of them reach into how the rest of
   the system is built, which is why they are rolled FIRST. */

const F = (min, max, id, name, note, rules = {}) => ({ min, max, id, name, note, rules });

export const SYSTEM_FEATURES = [
  F(1, 1, 'bountiful', 'Bountiful',
    'Richer than it has any right to be: more asteroids, and more in every seam.',
    { extraAsteroids: true, extraMineralResources: 1, exoticMaterials: true }),
  F(2, 2, 'gravity_tides', 'Gravity Tides',
    'The system pulls at itself. Riptides, gravity wells, or a shorter crossing.',
    { gravityTides: true }),
  F(3, 3, 'haven', 'Haven',
    'Something here favours life: an extra world per zone, thicker air, kinder ground.',
    { extraPlanetPerZone: true, thickerAtmospheres: true, betterHabitability: true }),
  F(4, 4, 'ill_omened', 'Ill-Omened',
    'Fate turns fickle here, and the mind frays faster than it should.',
    { illOmened: true }),
  F(5, 5, 'pirate_den', 'Pirate Den',
    'Somebody is using this system, and they are not declaring themselves.',
    { pirateShips: true }),
  F(6, 6, 'ruined_empire', 'Ruined Empire',
    'Somebody was here first, and left things behind worth finding.',
    { ruinedEmpire: true }),
  F(7, 7, 'starfarers', 'Starfarers',
    'The system is settled, and the settlers crossed the void to do it.',
    { starfarers: true, minPlanets: 4 }),
  F(8, 8, 'stellar_anomaly', 'Stellar Anomaly',
    'The star is wrong in some way that cost this system two of its worlds.',
    { planetModifier: -2 }),
  F(9, 9, 'warp_stasis', 'Warp Stasis',
    'The Immaterium runs shallow here. Powers come harder, and quieter.',
    { warpStasis: true }, true),
  F(10, 10, 'warp_turbulence', 'Warp Turbulence',
    'The Immaterium runs close. One world sits under a permanent storm.',
    { warpTurbulence: true })
];

export const featureById = (id) => SYSTEM_FEATURES.find((f) => f.id === id) || null;

// Warp Stasis and Warp Turbulence are opposites and cannot both hold.
const CONFLICTS = [['warp_stasis', 'warp_turbulence']];
const conflictsWith = (chosen, candidate) => CONFLICTS.some(
  ([a, b]) => (candidate.id === a && chosen.some((c) => c.id === b))
           || (candidate.id === b && chosen.some((c) => c.id === a))
);

export function rollSystemFeatures(rng = Math.random) {
  const wanted = Math.max(1, d5(rng) - 2);
  const chosen = [];
  // Bounded rather than `while (true)`: with ten rows and at most three
  // wanted this always fills, but a table edit that made it unfillable
  // would otherwise hang the app rather than return a short list.
  for (let tries = 0; tries < 100 && chosen.length < wanted; tries++) {
    const f = inTable(SYSTEM_FEATURES, d10(rng));
    if (!f) continue;
    if (chosen.some((c) => c.id === f.id)) continue;
    if (conflictsWith(chosen, f)) continue;
    chosen.push(f);
  }
  return chosen;
}

// The rules every rolled feature contributes, merged into one object the
// rest of the generator reads.
export function rulesFrom(features) {
  const rules = {};
  for (const f of features || []) {
    for (const [k, v] of Object.entries(f.rules || {})) {
      rules[k] = typeof v === 'number' ? (rules[k] || 0) + v : v;
    }
  }
  return rules;
}

/* ============================== zone elements ==============================
   1d5 elements per zone, +2 Dominant, -2 Weak (minimum 1), each rolled on
   1d100 against that zone's own table. */

const E = (min, max, id, name) => ({ min, max, id, name });

export const ZONE_ELEMENTS = {
  inner_cauldron: [
    E(1, 20, 'nothing', 'Nothing'),
    E(21, 29, 'asteroid_cluster', 'Asteroid Cluster'),
    E(30, 41, 'dust_cloud', 'Dust Cloud'),
    E(42, 45, 'gas_giant', 'Gas Giant'),
    E(46, 56, 'gravity_riptide', 'Gravity Riptide'),
    E(57, 76, 'planet', 'Planet'),
    E(77, 88, 'radiation_bursts', 'Radiation Bursts'),
    E(89, 100, 'solar_flares', 'Solar Flares')
  ],
  primary_biosphere: [
    E(1, 20, 'nothing', 'Nothing'),
    E(21, 30, 'asteroid_belt', 'Asteroid Belt'),
    E(31, 41, 'asteroid_cluster', 'Asteroid Cluster'),
    E(42, 47, 'derelict_station', 'Derelict Station'),
    E(48, 58, 'dust_cloud', 'Dust Cloud'),
    E(59, 64, 'gravity_riptide', 'Gravity Riptide'),
    E(65, 93, 'planet', 'Planet'),
    E(94, 100, 'starship_graveyard', 'Starship Graveyard')
  ],
  outer_reaches: [
    E(1, 20, 'nothing', 'Nothing'),
    E(21, 29, 'asteroid_belt', 'Asteroid Belt'),
    E(30, 40, 'asteroid_cluster', 'Asteroid Cluster'),
    E(41, 46, 'derelict_station', 'Derelict Station'),
    E(47, 55, 'dust_cloud', 'Dust Cloud'),
    E(56, 73, 'gas_giant', 'Gas Giant'),
    E(74, 80, 'gravity_riptide', 'Gravity Riptide'),
    E(81, 93, 'planet', 'Planet'),
    E(94, 100, 'starship_graveyard', 'Starship Graveyard')
  ]
};

export const ZONE_SIZE_MOD = { dominant: 2, weak: -2, normal: 0 };

export const elementCount = (rng, size) =>
  Math.max(1, d5(rng) + (ZONE_SIZE_MOD[size] || 0));

// Radiation Bursts and Solar Flares stack onto an existing entry in the same
// zone rather than appearing twice — a zone has one of each, more or less
// intense, which is why they carry an `intensity`.
const STACKING = ['radiation_bursts', 'solar_flares'];

/* ====================== derelict stations and graveyards ======================
   The two elements that are worth boarding. Both were names on a list until
   now; a GM who rolled one had a label and nothing to find inside it.

   A station is one structure with an origin that decides whether what is
   left behind is archeotech or xenos. A graveyard is several hulks with an
   origin that decides how many, whose they were, and how much is left of
   them — a Lost Explorers field is mostly salvageable, a Crushed Defence
   Force is mostly scrap. */

export const DERELICT_ORIGINS = [
  { min: 1, max: 10, id: 'egarian_void_maze', name: 'Egarian Void-maze', xenos: true },
  { min: 11, max: 20, id: 'eldar_orrery', name: 'Eldar Orrery', xenos: true },
  { min: 21, max: 25, id: 'eldar_gate', name: 'Eldar Gate', xenos: true },
  { min: 26, max: 40, id: 'ork_rok', name: 'Ork Rok', xenos: true },
  { min: 41, max: 50, id: 'stc_defence', name: 'STC Defence Station', xenos: false },
  { min: 51, max: 65, id: 'stc_monitor', name: 'STC Monitor Station', xenos: false },
  { min: 66, max: 76, id: 'stryxis_collection', name: 'Stryxis Collection', xenos: true },
  { min: 77, max: 85, id: 'xenos_defence', name: 'Xenos Defence Station', xenos: true },
  { min: 86, max: 100, id: 'xenos_monitor', name: 'Xenos Monitor Station', xenos: true }
];

export const DERELICT_ARMOUR = 10;

export function rollDerelict(rng = Math.random, { rules = {} } = {}) {
  const origin = inTable(DERELICT_ORIGINS, d100(rng));
  // 4d10 of hull left, which is what a boarding party has to cut through.
  const hullIntegrity = [0, 0, 0, 0].reduce((n) => n + d10(rng), 0);

  const finds = [];
  const rolls = clampLow(d5(rng) - 1);
  for (let i = 0; i < rolls; i++) {
    const kind = origin.xenos
      ? { id: 'xenos_ruin', name: 'Xenos Ruin' }
      : { id: 'archeotech_cache', name: 'Archeotech Cache' };
    finds.push({
      ...kind,
      abundance: d100(rng) + (rules.ruinedEmpire ? d10(rng) + 5 : 0)
    });
  }
  return { origin, xenos: origin.xenos, armour: DERELICT_ARMOUR, hullIntegrity, finds };
}

/* ---- starship graveyards ---- */

// hulks: [min,max] to roll; salvage: which column of HULK_CONDITIONS to use.
export const GRAVEYARD_ORIGINS = [
  { min: 1, max: 15, id: 'crushed_defence', name: 'Crushed Defence Force',
    hulks: [2, 10], salvage: 0 },
  { min: 16, max: 20, id: 'fleet_engagement', name: 'Fleet Engagement',
    hulks: [7, 16], salvage: 2 },
  { min: 21, max: 35, id: 'lost_explorers', name: 'Lost Explorers',
    hulks: [1, 6], salvage: 8 },
  { min: 36, max: 65, id: 'plundered_convoy', name: 'Plundered Convoy',
    hulks: [3, 7], salvage: 1 },
  { min: 66, max: 90, id: 'skirmish', name: 'Skirmish', hulks: [4, 8], salvage: 2 },
  { min: 91, max: 100, id: 'unknown_provenance', name: 'Unknown Provenance',
    hulks: [3, 7], salvage: 3 }
];

// Keyed by the origin's salvage chance: the 1d10 at or below which a hulk is
// worth salvaging, and at or below which it is at least boardable.
export const HULK_CONDITIONS = {
  0: { salvage: 0, boardable: 2 },
  1: { salvage: 1, boardable: 7 },      // a plundered convoy is easy to board
  2: { salvage: 2, boardable: 4 },
  3: { salvage: 3, boardable: 5 },
  8: { salvage: 8, boardable: 10 }
};

export const hulkCondition = (roll, salvage) => {
  const band = HULK_CONDITIONS[salvage] || HULK_CONDITIONS[2];
  if (roll <= band.salvage) return { id: 'salvageable', name: 'May be possible to salvage' };
  if (roll <= band.boardable) {
    return { id: 'boardable', name: 'Intact enough to board, but little else' };
  }
  return { id: 'shattered', name: 'Shattered beyond any value' };
};

// Whose hulls they were decides what can be stripped out of them.
export const HULK_SPECIES = [
  { id: 'human', name: 'Human', tech: 'archeotech' },
  { id: 'chaos_reaver', name: 'Chaos Reaver', tech: 'archeotech' },
  { id: 'ork', name: 'Ork', tech: 'xenotech' },
  { id: 'eldar', name: 'Eldar', tech: 'xenotech' },
  { id: 'drukhari', name: 'Dark Eldar', tech: 'xenotech' },
  { id: 'stryxis', name: 'Stryxis', tech: 'xenotech' },
  { id: 'rakgol', name: "Rak'Gol", tech: 'xenotech' },
  { id: 'kroot', name: 'Kroot', tech: 'xenotech' }
];

export function rollGraveyard(rng = Math.random, { rules = {} } = {}) {
  const origin = inTable(GRAVEYARD_ORIGINS, d100(rng));
  const [lo, hi] = origin.hulks;
  const count = Math.max(1, lo + Math.floor(rng() * (hi - lo + 1)));

  // Unknown Provenance is a different species every hull; everything else is
  // one fleet, or one fleet that met another.
  const pick = () => HULK_SPECIES[Math.floor(rng() * HULK_SPECIES.length)];
  const majority = pick();
  const minority = ['fleet_engagement', 'skirmish', 'crushed_defence'].includes(origin.id)
    ? pick() : null;

  const hulks = Array.from({ length: count }, (_, i) => {
    const species = origin.id === 'unknown_provenance' ? pick()
      : (minority && i >= Math.ceil(count / 2) ? minority : majority);
    return { species, condition: hulkCondition(d10(rng), origin.salvage) };
  });

  // What can be stripped out, split by whose hulls are out there.
  const kinds = [...new Set(hulks.map((h) => h.species.tech))];
  const total = d10(rng) + 2;
  const finds = Array.from({ length: total }, () => {
    const tech = kinds[Math.floor(rng() * kinds.length)];
    return tech === 'archeotech'
      ? { id: 'archeotech_cache', name: 'Archeotech Cache',
          abundance: d10(rng) + d10(rng) + 25 + (rules.ruinedEmpire ? d10(rng) + 5 : 0) }
      : { id: 'xenos_ruin', name: 'Xenos Ruin',
          abundance: d10(rng) + d10(rng) + 25 + (rules.ruinedEmpire ? d10(rng) + 5 : 0) };
  });

  return { origin, hulks, finds, salvageable: hulks.filter((h) => h.condition.id === 'salvageable').length };
}

/* ================================= planets ================================= */

export const BODIES = [
  { min: 1, max: 1, id: 'low_mass', name: 'Low-Mass', size: 'small', gravityMod: -7, maxMineralAbundance: 40 },
  { min: 2, max: 3, id: 'small', name: 'Small', size: 'small', gravityMod: -5 },
  { min: 4, max: 4, id: 'small_dense', name: 'Small and Dense', size: 'small', gravityMod: 0, mineralMod: 10 },
  { min: 5, max: 7, id: 'large', name: 'Large', size: 'large', gravityMod: 0 },
  { min: 8, max: 8, id: 'large_dense', name: 'Large and Dense', size: 'large', gravityMod: 5, mineralMod: 10 },
  { min: 9, max: 10, id: 'vast', name: 'Vast', size: 'vast', gravityMod: 4 }
];

export const GRAVITIES = [
  { max: 2, id: 'low', name: 'Low Gravity', orbitalMod: -10, atmosphereMod: -2, features: -3 },
  { max: 8, id: 'normal', name: 'Normal Gravity', orbitalMod: 0, atmosphereMod: 0, features: -2 },
  { max: Infinity, id: 'high', name: 'High Gravity', orbitalMod: 10, atmosphereMod: 1, features: -1 }
];

export const gravityFor = (total) => GRAVITIES.find((g) => total <= g.max);

export const ORBITAL_FEATURES = [
  { max: 45, id: 'none', name: 'None' },
  { max: 60, id: 'asteroid', name: 'Asteroid' },
  { max: 90, id: 'lesser_moon', name: 'Lesser Moon' },
  { max: Infinity, id: 'moon', name: 'Moon' }
];

export const ATMOSPHERES = [
  { max: 1, id: 'none', name: 'No Atmosphere' },
  { max: 4, id: 'thin', name: 'Thin Atmosphere' },
  { max: 9, id: 'moderate', name: 'Moderate Atmosphere' },
  { max: Infinity, id: 'heavy', name: 'Heavy Atmosphere' }
];

export const COMPOSITIONS = [
  { max: 1, id: 'deadly', name: 'Deadly', habitable: false },
  { max: 2, id: 'corrosive', name: 'Corrosive', habitable: false },
  { max: 5, id: 'toxic', name: 'Toxic', habitable: false },
  { max: 7, id: 'tainted', name: 'Tainted', habitable: true },
  { max: Infinity, id: 'pure', name: 'Pure', habitable: true }
];

// The zone reaches the climate directly: the same roll is six steps colder
// in the Outer Reaches than in the Inner Cauldron.
export const CLIMATE_ZONE_MOD = {
  inner_cauldron: -6, primary_biosphere: 0, outer_reaches: 6
};

export const CLIMATES = [
  { max: 0, id: 'burning', name: 'Burning World', habitabilityMod: -7, habitabilityCap: 3 },
  { max: 3, id: 'hot', name: 'Hot World', habitabilityMod: -2, habitabilityCap: null },
  { max: 7, id: 'temperate', name: 'Temperate World', habitabilityMod: 0, habitabilityCap: null },
  { max: 10, id: 'cold', name: 'Cold World', habitabilityMod: -2, habitabilityCap: null },
  { max: Infinity, id: 'ice', name: 'Ice World', habitabilityMod: -7, habitabilityCap: 3 }
];

export const HABITABILITIES = [
  { max: 1, id: 'inhospitable', name: 'Inhospitable', liveable: false },
  { max: 3, id: 'trapped_water', name: 'Trapped Water', liveable: false },
  { max: 5, id: 'liquid_water', name: 'Liquid Water', liveable: false },
  { max: 7, id: 'limited_ecosystem', name: 'Limited Ecosystem', liveable: true },
  { max: Infinity, id: 'verdant', name: 'Verdant', liveable: true }
];

const byMax = (table, n) => table.find((r) => n <= r.max);

export const INHABITANT_SPECIES = [
  { min: 1, max: 1, id: 'eldar', name: 'Eldar', needsLiveable: false },
  { min: 2, max: 4, id: 'human', name: 'Human', needsLiveable: false },
  { min: 5, max: 5, id: 'kroot', name: 'Kroot', needsLiveable: true },
  { min: 6, max: 7, id: 'ork', name: 'Ork', needsLiveable: true },
  { min: 8, max: 8, id: 'rakgol', name: "Rak'Gol", needsLiveable: false },
  { min: 9, max: 10, id: 'other_xenos', name: 'Other Xenos', needsLiveable: false }
];

export const ADDITIONAL_RESOURCES = [
  { min: 1, max: 2, id: 'archeotech_cache', name: 'Archeotech Cache', ruinBonus: true },
  { min: 3, max: 6, id: 'mineral', name: 'Mineral Resource' },
  { min: 7, max: 8, id: 'organic', name: 'Organic Compound', needsLiveable: true },
  { min: 9, max: 10, id: 'xenos_ruin', name: 'Xenos Ruin', ruinBonus: true }
];

const MINERALS_BY_SIZE = { small: (rng) => clampLow(d5(rng) - 2), large: (rng) => d5(rng), vast: (rng) => d10(rng) };
const EXTRA_BY_SIZE = {
  small: (rng) => clampLow(d5(rng) - 3), large: (rng) => clampLow(d5(rng) - 2), vast: (rng) => clampLow(d5(rng) - 1)
};
const TERRITORY_SIZE_MOD = { small: -2, large: 0, vast: 3 };

export function rollPlanet(rng = Math.random, {
  zoneId = 'primary_biosphere', rules = {}, forceHabitable = false, isMoon = false
} = {}) {
  const body = inTable(BODIES, d10(rng));
  const gravity = gravityFor(d10(rng) + body.gravityMod);

  // Orbital features. A moon has none of its own.
  const featureCount = isMoon ? 0 : Math.max(1, d5(rng) + gravity.features);
  const orbitalFeatures = [];
  for (let i = 0; i < featureCount; i++) {
    const f = byMax(ORBITAL_FEATURES, d100(rng) + gravity.orbitalMod);
    if (f.id !== 'none') orbitalFeatures.push(f);
  }

  // Atmosphere. A world forced habitable never comes back airless.
  const inBiosphere = zoneId === 'primary_biosphere';
  let atmosphere = byMax(ATMOSPHERES,
    d10(rng) + gravity.atmosphereMod + (rules.thickerAtmospheres && inBiosphere ? 1 : 0));
  if (forceHabitable && atmosphere.id === 'none') atmosphere = ATMOSPHERES[1];

  let composition = { id: 'none', name: 'None', habitable: false };
  if (atmosphere.id !== 'none') {
    const roll = d10(rng) + (rules.thickerAtmospheres && inBiosphere ? 2 : 0);
    composition = byMax(COMPOSITIONS, roll);
    // The three lethal results cannot stand on a world the system has
    // already promised is habitable.
    if (forceHabitable && !composition.habitable) composition = byMax(COMPOSITIONS, 6);
  }

  // Climate. With no air the zone decides it outright.
  let climate;
  if (atmosphere.id === 'none') {
    if (zoneId === 'inner_cauldron') climate = CLIMATES[0];
    else if (zoneId === 'outer_reaches') climate = CLIMATES[4];
    else climate = d10(rng) <= 5 ? CLIMATES[0] : CLIMATES[4];
  } else {
    climate = byMax(CLIMATES, d10(rng) + (CLIMATE_ZONE_MOD[zoneId] || 0));
  }

  // Habitability. Only a breathable world is a candidate, unless life has
  // adapted to something that should not support it — a 2% chance that also
  // lifts the climate's ceiling.
  let habitability = HABITABILITIES[0];
  const adapted = !composition.habitable && d100(rng) <= 2;
  if (composition.habitable || adapted) {
    const cap = adapted ? null : climate.habitabilityCap;
    let roll = d10(rng) + climate.habitabilityMod + (rules.betterHabitability ? 2 : 0);
    if (cap != null) roll = Math.min(roll, cap);
    habitability = byMax(HABITABILITIES, roll);
  }
  if (forceHabitable && !habitability.liveable) {
    habitability = d5(rng) <= 2 ? HABITABILITIES[3] : HABITABILITIES[4];
  }

  // Landmasses: easier to find on a world with surface water.
  const wet = ['liquid_water', 'limited_ecosystem', 'verdant'].includes(habitability.id);
  const hasLand = d10(rng) >= (wet ? 4 : 8);
  let continents = 0;
  let islands = 0;
  if (hasLand) {
    continents = d5(rng);
    islands = Math.min(d100(rng), d100(rng));
    if (body.size === 'small') {
      islands -= 15;
      if (islands > 20) islands = 10 + d10(rng);
    } else {
      islands -= 10;
      if (islands > 50) islands = 40 + d10(rng);
    }
    if (['inhospitable', 'trapped_water'].includes(habitability.id)) islands -= 30;
    islands = clampLow(islands);
  }

  // Territories: only a living world has them.
  let territories = 0;
  if (habitability.liveable) {
    territories = Math.max(1, d5(rng)
      + (TERRITORY_SIZE_MOD[body.size] || 0)
      + (habitability.id === 'verdant' ? 2 : 0));
  }

  // Resources.
  let minerals = MINERALS_BY_SIZE[body.size](rng) + (rules.extraMineralResources || 0);
  const exotic = Boolean(rules.exoticMaterials) && d10(rng) >= 7;
  let organics = territories;          // one per territory, before the extras
  const caches = [];
  const extras = EXTRA_BY_SIZE[body.size](rng);
  for (let i = 0; i < extras; i++) {
    let row = inTable(ADDITIONAL_RESOURCES, d10(rng));
    // An organic compound on a world with nothing living on it is rerolled.
    if (row.needsLiveable && !habitability.liveable) row = inTable(ADDITIONAL_RESOURCES, d10(rng));
    if (!row || (row.needsLiveable && !habitability.liveable)) continue;
    if (row.id === 'mineral') minerals += 1;
    else if (row.id === 'organic') organics += 1;
    else caches.push({ id: row.id, name: row.name,
      abundance: rules.ruinedEmpire ? d10(rng) + 5 : null });
  }

  // Inhabitants.
  let inhabitants = null;
  if (d10(rng) >= (habitability.liveable ? 8 : 10)) {
    for (let tries = 0; tries < 20 && !inhabitants; tries++) {
      const s = inTable(INHABITANT_SPECIES, d10(rng));
      if (s.needsLiveable && !habitability.liveable) continue;
      inhabitants = s;
    }
  }

  return {
    kind: 'planet', zoneId, isMoon,
    body, gravity, orbitalFeatures,
    atmosphere, composition, climate, habitability,
    landmasses: hasLand ? { continents, islands } : null,
    territories,
    resources: {
      minerals: body.maxMineralAbundance ? Math.min(minerals, body.maxMineralAbundance) : minerals,
      organics, exotic, caches
    },
    inhabitants
  };
}

/* =============================== the system =============================== */

function zoneSizes(effects) {
  const sizes = { inner_cauldron: 'normal', primary_biosphere: 'normal', outer_reaches: 'normal' };
  for (const [zoneId, size] of effects || []) sizes[zoneId] = size;
  return sizes;
}

export function rollSystem(rng = Math.random, { features: forced = null } = {}) {
  // Features first: several of them change how everything after is built.
  const features = forced || rollSystemFeatures(rng);
  const rules = rulesFrom(features);
  const star = rollStar(rng);
  const sizes = zoneSizes(star.effects);

  const zones = ZONES.map((z) => {
    const size = sizes[z.id];
    let wanted = elementCount(rng, size);
    if (rules.extraPlanetPerZone) wanted += 1;
    const elements = [];

    for (let i = 0; i < wanted; i++) {
      const row = inTable(ZONE_ELEMENTS[z.id], d100(rng));
      if (!row || row.id === 'nothing') continue;

      if (STACKING.includes(row.id)) {
        const existing = elements.find((e) => e.id === row.id);
        if (existing) { existing.intensity += 1; continue; }
        elements.push({ id: row.id, name: row.name, intensity: 1, kind: 'feature' });
        continue;
      }
      if (row.id === 'planet') {
        elements.push({ id: 'planet', name: 'Planet', kind: 'planet',
          planet: rollPlanet(rng, { zoneId: z.id, rules }) });
        continue;
      }
      if (row.id === 'derelict_station') {
        elements.push({ id: row.id, name: row.name, kind: 'site',
          site: rollDerelict(rng, { rules }) });
        continue;
      }
      if (row.id === 'starship_graveyard') {
        elements.push({ id: row.id, name: row.name, kind: 'site',
          site: rollGraveyard(rng, { rules }) });
        continue;
      }
      elements.push({ id: row.id, name: row.name, kind: 'feature' });
    }
    return { ...z, size, elements };
  });

  // Stellar Anomaly costs the system worlds; Starfarers guarantees it some.
  const planetsIn = (zs) => zs.flatMap((z) => z.elements.filter((e) => e.kind === 'planet'));
  if (rules.planetModifier < 0) {
    let toRemove = -rules.planetModifier;
    for (const z of zones) {
      while (toRemove > 0) {
        const ix = z.elements.findIndex((e) => e.kind === 'planet');
        if (ix < 0) break;
        z.elements.splice(ix, 1);
        toRemove -= 1;
      }
    }
  }
  if (rules.minPlanets) {
    const biosphere = zones.find((z) => z.id === 'primary_biosphere');
    while (planetsIn(zones).length < rules.minPlanets) {
      biosphere.elements.push({ id: 'planet', name: 'Planet', kind: 'planet',
        planet: rollPlanet(rng, { zoneId: biosphere.id, rules }) });
    }
  }

  // Starfarers need somewhere to have started. If nothing in the system can
  // hold them, the Primary Biosphere gets a world that can.
  let homeworld = null;
  if (rules.starfarers) {
    const liveable = planetsIn(zones).filter((e) => e.planet.habitability.liveable);
    if (liveable.length) {
      homeworld = liveable[Math.floor(rng() * liveable.length)];
    } else {
      const biosphere = zones.find((z) => z.id === 'primary_biosphere');
      homeworld = { id: 'planet', name: 'Planet', kind: 'planet',
        planet: rollPlanet(rng, { zoneId: biosphere.id, rules, forceHabitable: true }) };
      biosphere.elements.push(homeworld);
    }
    homeworld.homeworld = true;
  }

  return { star, features, rules, zones, homeworld };
}

/* ---- a short line for a list, the way npcgen names its antagonists ---- */

export function describeSystem(system) {
  if (!system) return '';
  const planets = system.zones.flatMap((z) => z.elements.filter((e) => e.kind === 'planet'));
  const liveable = planets.filter((e) => e.planet.habitability.liveable).length;
  const bits = [
    `${system.star.type.name} star`,
    `${planets.length} world${planets.length === 1 ? '' : 's'}`
  ];
  if (liveable) bits.push(`${liveable} habitable`);
  return bits.join(' · ');
}

export function describePlanet(p) {
  if (!p) return '';
  return [
    p.body.name, p.climate.name, p.habitability.name,
    p.atmosphere.id === 'none' ? 'airless' : `${p.composition.name.toLowerCase()} air`
  ].join(' · ');
}
