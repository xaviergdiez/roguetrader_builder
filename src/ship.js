// Voidship construction: hulls, components, and the constraint engine.
//
// Three constraints decide whether a blueprint is legal, and all three are
// hard rules rather than warnings:
//
//   SP     hull + components must fit the dynasty's Ship Points budget
//   Space  components must fit the hull's Space
//   Power  the plasma drive must generate at least what everything else draws
//
// A blueprint must also carry exactly one component from each of the eight
// essential categories, and a weapon can only go in a slot the hull has — a
// Sword-class has two dorsal mounts and no prow, so a prow weapon is not
// "over budget", it is unmountable.
//
// Pure, and the data is the doc's sample set rather than the full catalogue:
// every hull and component here is one the rules text actually lists. See
// ship.check.mjs.

/* --------------------------------- hulls --------------------------------- */

// slots are the mount points, listed once per mount: two dorsal mounts appear
// as two entries, because each holds its own weapon.
const H = (id, name, cls, speed, manoeuvre, detection, armour, hullIntegrity,
  turrets, space, sp, slots, source) => ({
  id, name, cls, speed, manoeuvre, detection, armour, hullIntegrity,
  turrets, space, sp, slots, source
});

export const HULLS = [
  H('hull-jericho', 'Jericho-class', 'Transport', 3, -10, 10, 12, 50, 1, 45, 20,
    ['prow', 'port', 'starboard'], 'Core'),
  H('hull-hazeroth', 'Hazeroth-class', 'Raider (Escort)', 10, 25, 10, 14, 32, 1, 35, 25,
    ['prow', 'dorsal'], 'Core'),
  H('hull-sword', 'Sword-class', 'Frigate (Escort)', 8, 20, 15, 18, 35, 2, 40, 40,
    ['dorsal', 'dorsal'], 'Core'),
  H('hull-dauntless', 'Dauntless-class', 'Light Cruiser', 7, 15, 20, 19, 60, 1, 60, 55,
    ['prow', 'port', 'starboard'], 'Core'),
  H('hull-lunar', 'Lunar-class', 'Cruiser', 5, 10, 10, 20, 71, 2, 75, 60,
    ['prow', 'port', 'port', 'starboard', 'starboard'], 'Core'),
  H('hull-secutor', 'Secutor-class', 'Monitor-Cruiser', 5, 12, 15, 20, 65, 2, 58, 65,
    ['prow', 'dorsal', 'dorsal', 'port', 'starboard'], 'Into the Storm'),
  H('hull-defiant', 'Defiant-class', 'Light Cruiser', 6, 12, 15, 19, 55, 2, 55, 55,
    ['prow', 'port', 'starboard'], 'Battlefleet Koronus')
];

/* ------------------------------ components ------------------------------ */

// The eight categories a blueprint must fill exactly once each.
export const ESSENTIAL_CATEGORIES = [
  'plasmaDrive', 'warpEngine', 'gellerField', 'voidShield',
  'bridge', 'lifeSustainer', 'crewQuarters', 'augurArray'
];

// power is signed: the plasma drive generates, everything else draws.
const C = (id, name, category, power, space, sp, extra = {}) => ({
  id, name, category, power, space, sp, ...extra
});

export const COMPONENTS = [
  // essential
  C('drive-jovian2', 'Jovian Pattern Class II Drive', 'plasmaDrive', 45, 10, 0,
    { note: 'Escort-weight drive. Generates the ship\'s whole Power pool.' }),
  C('drive-jovian3', 'Jovian Pattern Class III Drive', 'plasmaDrive', 60, 12, 0,
    { note: 'Cruiser-weight drive.' }),
  C('warp-strelov1', 'Strelov 1 Warp Engine', 'warpEngine', -10, 10, 0,
    { note: 'Allows warp travel.' }),
  C('geller-basic', 'Basic Geller Field', 'gellerField', -1, 0, 0,
    { note: 'Prevents daemonic incursion in the Warp.' }),
  C('shield-single', 'Single Void Shield Array', 'voidShield', -5, 1, 0,
    { note: 'Absorbs one hit per combat round.', shields: 1 }),
  C('bridge-combat', 'Combat Bridge', 'bridge', -1, 1, 0,
    { note: '+10 to Damage Control, +5 Tech-Use to repair.' }),
  C('life-vitae', 'Vitae Pattern Life Sustainer', 'lifeSustainer', -4, 2, 0,
    { note: 'Reduces Morale loss by 1.', moraleLossReduction: 1 }),
  C('quarters-voidsmen', 'Voidsmen Quarters', 'crewQuarters', -1, 3, 0,
    { note: 'Standard housing. Reduces Morale loss by 1.', moraleLossReduction: 1 }),
  C('augur-m100', 'M-100 Auger Array', 'augurArray', -3, 0, 0,
    { note: 'Baseline Detection; adds nothing to the hull\'s own.' }),

  // weapons
  C('weap-macrocannon-mars', 'Mars Macrocannon', 'weapon', -4, 2, 1,
    { weaponClass: 'macro', str: 3, damage: '1d10+2', crit: 5, range: 6 }),
  C('weap-lance-starbreaker', 'Starbreaker Lance', 'weapon', -6, 4, 2,
    { weaponClass: 'lance', str: 1, damage: '1d10+2', crit: 3, range: 5,
      note: 'Ignores Armour.' }),

  // supplemental
  C('comp-munitorum', 'Munitorum', 'supplemental', -2, 3, 2,
    { note: '+1d5 Macrocannon damage. +1 Space cost for explosions.' }),
  C('comp-tenebro-maze', 'Tenebro-Maze', 'supplemental', -1, 2, 2,
    { note: '+10 Command against boarding. Cannot be critically hit.' }),
  C('comp-smugglers-hold', "Smuggler's Hold", 'supplemental', -1, 2, 1,
    { note: '+50 Achievement Points for criminal objectives.' }),
  C('comp-flak-turrets', 'Flak Turrets', 'supplemental', -1, 1, 1,
    { note: '+1 Turret Rating.', mods: { turrets: 1 } })
];

export const hullById = (id) => HULLS.find((h) => h.id === id) || null;
export const componentById = (id) => COMPONENTS.find((c) => c.id === id) || null;

/* ------------------------------ crew rating ------------------------------ */

// The NPC crew's Base Skill when they act without a player rolling for them.
export const CREW_RATINGS = [
  { id: 'incompetent', name: 'Incompetent', rating: 20, sp: 0 },
  { id: 'competent', name: 'Competent', rating: 30, sp: 0 },
  { id: 'crack', name: 'Crack', rating: 40, sp: 5 },
  { id: 'veteran', name: 'Veteran', rating: 50, sp: 15 }
];

export const crewRating = (id) =>
  CREW_RATINGS.find((c) => c.id === id) || CREW_RATINGS[1];

/* ------------------------------- blueprint -------------------------------
   A blueprint is plain data:

     { hullId, dynastySP, crew, essential: {category: componentId},
       weapons: [{slot, componentId}], supplemental: [componentId] }

   Everything below derives from it, so nothing has to be kept in sync. */

const listed = (bp) => {
  const out = [];
  for (const cat of ESSENTIAL_CATEGORIES) {
    const c = componentById(bp && bp.essential && bp.essential[cat]);
    if (c) out.push(c);
  }
  for (const w of (bp && bp.weapons) || []) {
    const c = componentById(w && w.componentId);
    if (c) out.push(c);
  }
  for (const id of (bp && bp.supplemental) || []) {
    const c = componentById(id);
    if (c) out.push(c);
  }
  return out;
};

export const powerGenerated = (bp) =>
  listed(bp).reduce((n, c) => n + (c.power > 0 ? c.power : 0), 0);

export const powerUsed = (bp) =>
  listed(bp).reduce((n, c) => n + (c.power < 0 ? -c.power : 0), 0);

export const spaceUsed = (bp) => listed(bp).reduce((n, c) => n + c.space, 0);

export function spSpent(bp) {
  const hull = hullById(bp && bp.hullId);
  const crew = crewRating(bp && bp.crew);
  return (hull ? hull.sp : 0) + crew.sp + listed(bp).reduce((n, c) => n + c.sp, 0);
}

export function budget(bp) {
  const hull = hullById(bp && bp.hullId);
  const dynastySP = Number((bp && bp.dynastySP) ?? 0);
  return {
    dynastySP,
    spentSP: spSpent(bp),
    spRemaining: dynastySP - spSpent(bp),
    totalSpace: hull ? hull.space : 0,
    usedSpace: spaceUsed(bp),
    spaceRemaining: (hull ? hull.space : 0) - spaceUsed(bp),
    totalPower: powerGenerated(bp),
    usedPower: powerUsed(bp),
    powerRemaining: powerGenerated(bp) - powerUsed(bp)
  };
}

/* -------------------------------- validation -------------------------------- */

// Counts the mounts a hull has, so weapons can be checked against them.
const slotCounts = (hull) => (hull ? hull.slots : []).reduce((m, s) => {
  m[s] = (m[s] || 0) + 1;
  return m;
}, {});

// Every way a blueprint can be illegal, as messages meant to be shown.
export function validate(bp) {
  const errors = [];
  const hull = hullById(bp && bp.hullId);
  if (!hull) return { ok: false, errors: ['No hull chosen.'], budget: budget(bp) };

  for (const cat of ESSENTIAL_CATEGORIES) {
    const id = bp.essential && bp.essential[cat];
    const c = componentById(id);
    if (!c) { errors.push(`Missing an essential component: ${cat}.`); continue; }
    // a component installed in the wrong category would pass every arithmetic
    // check while leaving the ship without, say, a Geller Field
    if (c.category !== cat) {
      errors.push(`${c.name} is not a ${cat}.`);
    }
  }

  const have = slotCounts(hull);
  const want = {};
  for (const w of bp.weapons || []) {
    const c = componentById(w && w.componentId);
    if (!c) continue;
    if (c.category !== 'weapon') {
      errors.push(`${c.name} is not a weapon and cannot be mounted.`);
      continue;
    }
    want[w.slot] = (want[w.slot] || 0) + 1;
  }
  for (const [slot, n] of Object.entries(want)) {
    const capacity = have[slot] || 0;
    if (n > capacity) {
      errors.push(capacity === 0
        ? `The ${hull.name} has no ${slot} mount.`
        : `The ${hull.name} has ${capacity} ${slot} mount(s); ${n} weapons assigned.`);
    }
  }

  const b = budget(bp);
  if (b.powerRemaining < 0) errors.push(`Power is over by ${-b.powerRemaining}.`);
  if (b.spaceRemaining < 0) errors.push(`Space is over by ${-b.spaceRemaining}.`);
  if (b.spRemaining < 0) errors.push(`Ship Points are over by ${-b.spRemaining}.`);

  return { ok: errors.length === 0, errors, budget: b };
}

/* --------------------------------- vitals --------------------------------- */

// Population below three quarters costs Manoeuvre: there are no longer enough
// hands to work the thrusters.
export const POP_PENALTY_THRESHOLD = 0.75;
export const POP_MANOEUVRE_PENALTY = -5;

export function stats(bp, vitals) {
  const hull = hullById(bp && bp.hullId);
  if (!hull) return null;
  const comps = listed(bp);
  const sum = (key) => comps.reduce((n, c) => n + ((c.mods && c.mods[key]) || 0), 0);

  const pop = Number((vitals && vitals.population) ?? 100);
  const understaffed = pop < 100 * POP_PENALTY_THRESHOLD;

  return {
    speed: hull.speed + sum('speed'),
    manoeuvre: hull.manoeuvre + sum('manoeuvre')
      + (understaffed ? POP_MANOEUVRE_PENALTY : 0),
    detection: hull.detection + sum('detection'),
    armour: hull.armour + sum('armour'),
    turrets: hull.turrets + sum('turrets'),
    hullIntegrity: hull.hullIntegrity + sum('hullIntegrity'),
    maxMorale: 100 + sum('morale'),
    maxPopulation: 100,
    moraleLossReduction: comps.reduce((n, c) => n + (c.moraleLossReduction || 0), 0),
    voidShields: comps.reduce((n, c) => n + (c.shields || 0), 0),
    understaffed
  };
}

// Starting vitals for a finished blueprint.
export function newVitals(bp) {
  const s = stats(bp);
  const hull = hullById(bp && bp.hullId);
  return {
    population: 100,
    morale: s ? s.maxMorale : 100,
    hullIntegrity: hull ? hull.hullIntegrity : 0
  };
}
