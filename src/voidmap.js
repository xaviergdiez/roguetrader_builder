/* ============================ THE VOID MAP ============================
   A chart for ship combat, built from a rolled star system.

   The boarding map (battlemap.js) is a deck: squares, walls, doors, and
   miniatures on the table standing for the combatants. A void fight is a
   different animal. There is no floor, the combatants ARE the things worth
   drawing (a ship's position and heading decide who can shoot whom), and what
   the table needs from the map is a number: how far apart are we, and what is
   in the way. So this is its own module, and its own file for the same reason
   awareness.js is: the numbers are pure and checked here, the canvas is
   VoidMap.jsx.

   SCALE. One square is one Void Unit, because VU is what everything in
   voidcombat.js is priced in: a weapon's range, the distance a ship covers in
   a turn, the Distance box on the gunnery panel. A point on the chart is in
   VU from the top-left corner, y down, and a square i,j has its centre at
   i+0.5, j+0.5. Ships sit on square centres, so two ships three squares apart
   are three VU apart and nobody has to measure a diagonal with a ruler.

   WHAT COMES FROM THE SYSTEM. stargen.js rolls a whole system and names what
   is in each zone: planets in detail, asteroid belts and clusters, dust
   clouds, gas giants, gravity riptides, derelict stations, starship
   graveyards, and radiation bursts and solar flares that wash over a zone as
   a whole. A chart is ONE place in that system, a fight's worth of it: pick
   an element (or several) and the scene is laid out around them, lit by the
   star the zone actually sits under (a Mighty star over the Inner Cauldron
   fills a corner with white; the same star over the Outer Reaches is a bright
   point you could cover with a thumb).

   WHAT IS ROGUE TRADER AND WHAT IS HOUSE
     RT (voidcombat.js, already in the app): range in VU and its bands, the
     size modifier, and the +10 for a Silhouetted target. This module feeds the
     last one from the geometry, which until now nobody could do because
     nothing knew where anything was.
     HOUSE: what a belt or a cloud does to a shot or to a ship crossing it, and
     what a riptide does to a drifting hull. stargen only NAMES these
     elements, so there is no printed number to follow. They are written onto
     each field when the scene is built (shotMod, moveMod, drift), so the GM can
     change one on the chart without touching the table below.

   MINIATURES. The ships on the table are physical models, so the chart does not
   draw a hull to fight the model for the square: a ship is a base ring with a
   heading tick (`minis`, on by default), and the things a model cannot show are
   what the chart is for: arcs, range rings, what is in the way. The token
   stands for where the model is and which way it faces, and is moved to match.

   FIRING ARCS. A weapon sits in a mount (prow, port, starboard, dorsal) and can
   only fire at what is inside that mount's arc, measured from the ship's
   heading. The widths below are the default quadrants: the prow covers the
   forward 90 degrees, port and starboard 90 each, and a dorsal mount fires
   everywhere but astern. They are stored on the chart (`arcs`), so a table
   whose book draws them differently changes them on the chart, not in code.

   Dice are never rolled here. A Pilot test for crossing a belt is reported as
   a prompt, the way a Pinning test is, and the table rolls it. */

import { makeRng } from './mapgen.js';
import { rangeBand } from './voidcombat.js';
import { packCombat } from './battlemap.js';

/* ------------------------------ sizes ------------------------------ */

export const VOID_SIZES = [
  { id: 'skirmish', name: 'Skirmish', cols: 40, rows: 28 },
  { id: 'standard', name: 'Standard', cols: 64, rows: 40 },
  { id: 'wide', name: 'Wide', cols: 96, rows: 64 },
  { id: 'fleet', name: 'Fleet action', cols: 140, rows: 90 }
];

export const sizeById = (id) => VOID_SIZES.find((s) => s.id === id) || VOID_SIZES[1];

export const MIN_VOID = 16;
export const MAX_VOID = 200;
const MAX_SHIPS = 40;
const MAX_BODIES = 120;
const MAX_FIELDS = 40;

/* ------------------------------ what a field does ------------------------------ */

/* shotMod: added to the to-hit of a shot whose line crosses it. moveMod: the
   modifier on the Pilot test a ship takes for flying through it, or null when
   it asks for none. drift: how far it carries a hull, in VU a turn, along the
   band. The total a shot can lose to terrain is capped (TERRAIN_FLOOR), the
   same way evasion is capped at -50: stacking three clouds should be a bad
   shot, not an impossible one. */
export const TERRAIN_FLOOR = -30;
export const MIN_CHORD = 0.5;

export const FIELD_KINDS = {
  asteroid_belt: {
    name: 'Asteroid Belt', shape: 'band', shotMod: -10, moveMod: -10,
    note: 'House: a shot through the belt is at -10. Flying through it is a Pilot (Space Craft) Test at -10; the GM prices a failure in Hull.'
  },
  asteroid_cluster: {
    name: 'Asteroid Cluster', shape: 'circle', shotMod: -10, moveMod: -10,
    note: 'House: as a belt, but small enough to go round.'
  },
  dust_cloud: {
    name: 'Dust Cloud', shape: 'circle', shotMod: -10, moveMod: null,
    note: 'House: a shot through the cloud is at -10. Nothing to fly through, but ships inside it are hard to pick out.'
  },
  gravity_riptide: {
    name: 'Gravity Riptide', shape: 'band', shotMod: 0, moveMod: null, drift: 2,
    note: 'House: carries any hull inside it along the arrows each turn. Apply the drift when the turn ends.'
  },
  debris: {
    name: 'Debris Field', shape: 'circle', shotMod: -10, moveMod: -10,
    note: 'House: the wreckage of a graveyard. Treated as an asteroid cluster.'
  },
  nebula: {
    name: 'Gas Cloud', shape: 'circle', shotMod: 0, moveMod: null,
    note: 'Scenery the GM can give a rule to.'
  }
};

export const fieldKindById = (id) => FIELD_KINDS[id] || null;

/* ------------------------------ what a body is ------------------------------ */

/* blocks: a shot cannot cross it, and nothing may sit inside it.
   silhouettes: a ship passing in front of it can be seen against it (RT's
   Silhouetted, +10). A station or a hulk is too small to do either. */
export const BODY_KINDS = {
  planet: { name: 'Planet', blocks: true, silhouettes: true },
  gas_giant: { name: 'Gas Giant', blocks: true, silhouettes: true },
  moon: { name: 'Moon', blocks: true, silhouettes: true },
  asteroid: { name: 'Asteroid', blocks: true, silhouettes: false },
  station: { name: 'Derelict Station', blocks: false, silhouettes: false },
  hulk: { name: 'Hulk', blocks: false, silhouettes: false },
  // What a table sees of a body it can only ping: that something is there and
  // how big it looms. Never built by the generator, and it blocks nothing,
  // because the table has no way to know whether what it cannot read would.
  contact: { name: 'Unknown contact', blocks: false, silhouettes: false }
};

export const bodyKindById = (id) => BODY_KINDS[id] || null;

/* ------------------------------ the star ------------------------------ */

// What colour a star is and how big it looks. `size` scales the disc.
export const STAR_LOOK = {
  mighty: { colour: '#bcd6ff', size: 1.3, bright: 1 },
  vigorous: { colour: '#fff1b8', size: 1, bright: 0.85 },
  luminous: { colour: '#ffcf8a', size: 0.9, bright: 0.7 },
  dull: { colour: '#ff8a66', size: 0.7, bright: 0.45 },
  anomalous: { colour: '#c99bff', size: 1, bright: 0.8 },
  binary: { colour: '#fff1b8', size: 0.8, bright: 0.9 }
};

/* The zone sets how much of the sky the star fills. radius is in VU of a
   Vigorous star; reach is how far past the map's edge its centre sits, as a
   multiple of that radius (negative: it leans in over the edge). */
const ZONE_STAR = {
  inner_cauldron: { radius: 14, lean: 0.15, glow: 1 },
  primary_biosphere: { radius: 7, lean: 1.4, glow: 0.55 },
  outer_reaches: { radius: 3, lean: 4, glow: 0.2 }
};

/* ------------------------------ small helpers ------------------------------ */

const num = (v, dflt = 0) => (Number.isFinite(Number(v)) ? Number(v) : dflt);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
// The `+ 0` turns a rounded -0 into 0: a rotation that should land exactly on
// an axis otherwise leaves a -0 that compares unequal to the 0 it means.
const round1 = (n) => Math.round(n * 10) / 10 + 0;
const round2 = (n) => Math.round(n * 100) / 100 + 0;
const str = (v, max, dflt = '') => (typeof v === 'string' ? v.trim().slice(0, max) : dflt);
const HEX = /^#[0-9a-f]{6}$/i;
const hex = (v, dflt) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : dflt);
export const newVoidId = () => Math.random().toString(36).slice(2, 8);

const pickOf = (rng, list) => list[Math.floor(rng() * list.length)];
const between = (rng, lo, hi) => lo + rng() * (hi - lo);

export const SIDES = ['player', 'ally', 'enemy', 'neutral'];
export const STATES = ['seen', 'ping', 'hidden'];

/* ------------------------------ geometry ------------------------------ */

export const distanceVU = (a, b) => round1(Math.hypot(num(a.x) - num(b.x), num(a.y) - num(b.y)));

// Shortest distance from p to the segment ab.
export function segDist(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function inField(field, p) {
  if (!field) return false;
  if (field.shape === 'band') {
    return segDist(p, { x: field.x, y: field.y }, { x: field.x2, y: field.y2 }) <= field.w / 2;
  }
  return Math.hypot(p.x - field.x, p.y - field.y) <= field.r;
}

/* How much of the segment ab lies inside the field, in VU. Walked in
   quarter-VU steps rather than solved: a belt is a capsule and a cloud is a
   circle and one rule that works for both is worth more than the exactness
   nobody can see on a chart. */
export function chordLength(field, a, b) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len === 0) return 0;
  const STEP = 0.25;
  const n = Math.max(1, Math.ceil(len / STEP));
  let inside = 0;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    if (inField(field, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) inside += len / n;
  }
  return round1(inside);
}

/* ------------------------------ firing arcs ------------------------------ */

/* c is the centre of the arc in degrees clockwise from the bow, w its full
   width. A mount with no arc on the chart is unconstrained. */
export const ARC_SLOTS = ['prow', 'port', 'starboard', 'dorsal', 'keel'];
export const ARC_DEFAULTS = Object.freeze({
  prow: Object.freeze({ c: 0, w: 90 }),
  port: Object.freeze({ c: 270, w: 90 }),
  starboard: Object.freeze({ c: 90, w: 90 }),
  dorsal: Object.freeze({ c: 0, w: 270 }),
  // A keel mount fires in every direction (Drydock's cheat sheet).
  keel: Object.freeze({ c: 0, w: 360 })
});
export const MIN_ARC = 10;

/* On a light cruiser or anything larger the prow covers fore, port and
   starboard, 270 degrees; on a smaller ship it is the forward quarter only
   (Drydock's cheat sheet). The chart's prow arc is the small-ship one, so it
   is widened here for a large class, and only while the table has left it as
   the default: an arc the table has set by hand stays exactly as it set it. */
export const PROW_WIDE = 270;
export const isLargeClass = (cls) => /cruiser|battleship|battlecruiser/i.test(String(cls || ''));
export function arcOf(m, ship, slot) {
  const a = slot && m && m.arcs ? m.arcs[slot] : null;
  if (a && slot === 'prow' && isLargeClass(ship && ship.cls)
    && a.c === ARC_DEFAULTS.prow.c && a.w === ARC_DEFAULTS.prow.w) {
    return { c: 0, w: PROW_WIDE };
  }
  return a;
}

const norm360 = (d) => ((d % 360) + 360) % 360;
// The signed difference a - b, folded into -180..180.
export const angleDiff = (a, b) => {
  const d = norm360(a - b);
  return d > 180 ? d - 360 : d;
};

function readArcs(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const slot of ARC_SLOTS) {
    const a = src[slot] && typeof src[slot] === 'object' ? src[slot] : {};
    const d = ARC_DEFAULTS[slot];
    out[slot] = {
      c: Math.round(norm360(num(a.c, d.c))),
      w: clamp(Math.round(num(a.w, d.w)), MIN_ARC, 360)
    };
  }
  return out;
}

/* ------------------------------ reading a map ------------------------------ */

function readStar(s) {
  const typeId = STAR_LOOK[s && s.typeId] ? s.typeId : 'vigorous';
  return {
    typeId,
    x: round2(clamp(num(s && s.x), -MAX_VOID * 3, MAX_VOID * 4)),
    y: round2(clamp(num(s && s.y), -MAX_VOID * 3, MAX_VOID * 4)),
    r: round2(clamp(num(s && s.r, 4), 0.5, 120)),
    colour: hex(s && s.colour, STAR_LOOK[typeId].colour)
  };
}

function readBody(b) {
  if (!b || typeof b !== 'object') return null;
  const kind = BODY_KINDS[b.kind] ? b.kind : null;
  if (!kind) return null;
  return {
    id: str(b.id, 24) || newVoidId(),
    kind,
    name: str(b.name, 60) || BODY_KINDS[kind].name,
    x: round2(clamp(num(b.x), -MAX_VOID, MAX_VOID * 2)),
    y: round2(clamp(num(b.y), -MAX_VOID, MAX_VOID * 2)),
    r: round2(clamp(num(b.r, 1), 0.2, 60)),
    tone: hex(b.tone, '#8a8a8a'),
    // How thick the air is, 0-3: drawn as a halo, and the one thing about a
    // world a pilot can see from orbit.
    air: clamp(Math.floor(num(b.air)), 0, 3),
    well: round2(clamp(num(b.well), 0, 80)),
    // Which way it is turned, in degrees clockwise. Nothing but looks: a hulk's
    // long axis, a station's spokes, the tilt of a giant's bands.
    rot: Math.round(norm360(num(b.rot))),
    note: str(b.note, 300),
    state: STATES.includes(b.state) ? b.state : 'seen'
  };
}

function readField(f) {
  if (!f || typeof f !== 'object') return null;
  const spec = FIELD_KINDS[f.kind];
  if (!spec) return null;
  const shape = f.shape === 'band' || f.shape === 'circle' ? f.shape : spec.shape;
  const out = {
    id: str(f.id, 24) || newVoidId(),
    kind: f.kind,
    name: str(f.name, 60) || spec.name,
    shape,
    x: round2(clamp(num(f.x), -MAX_VOID, MAX_VOID * 2)),
    y: round2(clamp(num(f.y), -MAX_VOID, MAX_VOID * 2)),
    shotMod: clamp(Math.round(num(f.shotMod, spec.shotMod)), -50, 50),
    // Absent means the kind's own; an explicit null means "asks no test".
    moveMod: f.moveMod === undefined ? spec.moveMod
      : (f.moveMod === null || f.moveMod === '' ? null : clamp(Math.round(num(f.moveMod)), -50, 50)),
    note: str(f.note, 300),
    // A band's direction is its two ends; a round field's `rot` only turns the
    // rocks or the wisps drawn inside it.
    rot: shape === 'band' ? 0 : Math.round(norm360(num(f.rot))),
    state: STATES.includes(f.state) ? f.state : 'seen'
  };
  if (shape === 'band') {
    out.x2 = round2(clamp(num(f.x2, out.x + 10), -MAX_VOID, MAX_VOID * 2));
    out.y2 = round2(clamp(num(f.y2, out.y), -MAX_VOID, MAX_VOID * 2));
    out.w = round2(clamp(num(f.w, 10), 1, 100));
  } else {
    out.r = round2(clamp(num(f.r, 8), 0.5, 100));
  }
  if (Array.isArray(f.drift) && f.drift.length === 2) {
    out.drift = [round1(clamp(num(f.drift[0]), -20, 20)), round1(clamp(num(f.drift[1]), -20, 20))];
  } else {
    out.drift = null;
  }
  return out;
}

function readShip(s) {
  if (!s || typeof s !== 'object') return null;
  const id = str(s.id, 40);
  if (!id) return null;
  return {
    id,
    name: str(s.name, 60) || 'Ship',
    cls: str(s.cls, 40),
    side: SIDES.includes(s.side) ? s.side : 'neutral',
    x: round2(clamp(num(s.x), -MAX_VOID, MAX_VOID * 2)),
    y: round2(clamp(num(s.y), -MAX_VOID, MAX_VOID * 2)),
    heading: ((Math.round(num(s.heading)) % 360) + 360) % 360,
    state: STATES.includes(s.state) ? s.state : 'seen'
  };
}

function readHazard(h) {
  if (!h || typeof h !== 'object') return null;
  const id = str(h.id, 32);
  if (!id) return null;
  return {
    id,
    name: str(h.name, 60) || id,
    intensity: clamp(Math.floor(num(h.intensity, 1)), 1, 9),
    note: str(h.note, 300)
  };
}

/* A pinned attack range: one mount's arc and reach, cast on the chart and kept
   there. It belongs to a ship and follows it, turning when the ship turns, so
   it is stored as which ship and which mount, plus the numbers it was pinned
   with (a table that cannot read a ship's weapons can still read its reach). */
function readOverlay(o) {
  if (!o || typeof o !== 'object') return null;
  const shipId = str(o.shipId, 40);
  const range = round1(clamp(num(o.range), 0, 200));
  if (!shipId || range <= 0) return null;
  return {
    id: str(o.id, 24) || newVoidId(),
    shipId,
    slot: ARC_SLOTS.includes(o.slot) ? o.slot : null,
    range,
    name: str(o.name, 80)
  };
}
export const MAX_OVERLAYS = 60;

const list = (raw, read, cap) => (Array.isArray(raw) ? raw : []).map(read).filter(Boolean).slice(0, cap);

export const EMPTY_VOID = Object.freeze({
  v: 1, name: 'Void scene', cols: 64, rows: 40, seed: '',
  mmPerSquare: 25, pxPerSquare: 18, grid: true, minis: true,
  source: null, glow: 0.6,
  stars: [], bodies: [], fields: [], hazards: [], ships: [], overlays: []
});

/* Anything absent is defaulted rather than trusted, the same way readMap
   treats a deck saved before a field existed. A chart is read at three
   doors (the autosave, the shared ship, and a table's poll), so this is the
   one place its limits live. */
export function readVoidMap(m) {
  const src = m && typeof m === 'object' ? m : {};
  const source = src.source && typeof src.source === 'object' ? {
    zoneId: str(src.source.zoneId, 32),
    zoneName: str(src.source.zoneName, 40),
    label: str(src.source.label, 160),
    star: str(src.source.star, 80),
    items: (Array.isArray(src.source.items) ? src.source.items : [])
      .map((x) => str(x, 80)).filter(Boolean).slice(0, 12),
    features: (Array.isArray(src.source.features) ? src.source.features : [])
      .map((x) => str(x, 60)).filter(Boolean).slice(0, 6)
  } : null;
  return {
    v: 1,
    name: str(src.name, 80) || 'Void scene',
    cols: clamp(Math.floor(num(src.cols, 64)), MIN_VOID, MAX_VOID),
    rows: clamp(Math.floor(num(src.rows, 40)), MIN_VOID, MAX_VOID),
    seed: str(src.seed, 24),
    mmPerSquare: clamp(Math.round(num(src.mmPerSquare, 25)), 1, 500),
    pxPerSquare: clamp(Math.round(num(src.pxPerSquare, 18)), 4, 120),
    grid: src.grid !== false,
    // Physical models stand on the table: ships are drawn as bases, not hulls.
    minis: src.minis !== false,
    arcs: readArcs(src.arcs),
    source,
    glow: round2(clamp(num(src.glow, 0.6), 0, 1)),
    stars: list(src.stars, readStar, 3),
    bodies: list(src.bodies, readBody, MAX_BODIES),
    fields: list(src.fields, readField, MAX_FIELDS),
    hazards: list(src.hazards, readHazard, 8),
    ships: list(src.ships, readShip, MAX_SHIPS),
    overlays: list(src.overlays, readOverlay, MAX_OVERLAYS)
  };
}

export const newVoidMap = (name = 'Void scene', size = 'standard') => {
  const s = sizeById(size);
  return readVoidMap({ ...EMPTY_VOID, name, cols: s.cols, rows: s.rows });
};

/* ------------------------------ building a scene ------------------------------ */

const ZONE_SHORT = {
  inner_cauldron: 'Inner Cauldron',
  primary_biosphere: 'Primary Biosphere',
  outer_reaches: 'Outer Reaches'
};

const CLIMATE_TONE = {
  burning: '#c8582b', hot: '#c9a05f', temperate: '#4e8f78', cold: '#86a8be', ice: '#d4e6ef'
};
const GIANT_TONES = ['#c9a36b', '#8fa7c2', '#b98f7a', '#7ea99a', '#a994c4'];
const HULK_TONE = { salvageable: '#6f9a74', boardable: '#c9a24f', shattered: '#7b7f86' };

// 1 VU of planet is a lot of planet; these are what reads well beside a range
// of five or six.
const PLANET_R = { small: [1.8, 2.6], large: [2.8, 4], vast: [4.2, 5.8] };

/* Find a place for a circle of radius r that keeps well clear of what is
   already down. Forty candidates, best clearance wins: an even spread rather
   than the first spot that happens to fit. `taken` is mutated by the caller. */
function spot(rng, cols, rows, r, taken, { centre = 0 } = {}) {
  const margin = Math.min(cols, rows) * 0.12;
  let best = null;
  for (let i = 0; i < 40; i++) {
    const x = between(rng, margin + r * 0.4, cols - margin - r * 0.4);
    const y = between(rng, margin + r * 0.4, rows - margin - r * 0.4);
    let gap = Infinity;
    for (const t of taken) gap = Math.min(gap, Math.hypot(x - t.x, y - t.y) - t.r - r);
    // The first piece of scenery is drawn toward the middle: it is what the
    // fight is about.
    const pull = centre ? -centre * Math.hypot(x - cols / 2, y - rows / 2) : 0;
    const score = gap + pull;
    if (!best || score > best.score) best = { x, y, score };
  }
  return { x: round2(best.x), y: round2(best.y) };
}

/* A point on a ring around `at`, on the chart. A moon that orbits off the edge
   is a moon nobody can see, so a few angles are tried and the last is clamped. */
function orbitPoint(rng, at, orbit, cols, rows, pad = 0.8) {
  let p = at;
  for (let i = 0; i < 12; i++) {
    const a = rng() * Math.PI * 2;
    p = { x: at.x + Math.cos(a) * orbit, y: at.y + Math.sin(a) * orbit };
    if (p.x >= pad && p.x <= cols - pad && p.y >= pad && p.y <= rows - pad) break;
  }
  return { x: round2(clamp(p.x, pad, cols - pad)), y: round2(clamp(p.y, pad, rows - pad)) };
}

function planetBodies(element, at, rng, ids, cols, rows) {
  const p = element.planet;
  const [lo, hi] = PLANET_R[p.body.size] || PLANET_R.large;
  const r = round2(between(rng, lo, hi));
  const air = p.atmosphere.id === 'none' ? 0
    : p.atmosphere.id === 'thin' ? 1 : p.atmosphere.id === 'moderate' ? 2 : 3;
  const tone = p.atmosphere.id === 'none' ? '#8d8d92' : (CLIMATE_TONE[p.climate.id] || '#8a8a8a');
  const bits = [p.body.name, p.climate.name, p.habitability.name];
  if (element.homeworld) bits.push('homeworld');
  const out = [{
    id: ids(), kind: 'planet',
    name: element.homeworld ? 'Homeworld' : `Planet · ${p.climate.name}`,
    x: at.x, y: at.y, r, tone, air, well: round2(r * 2.6), rot: Math.floor(rng() * 360),
    note: bits.join(' · '), state: 'seen'
  }];
  const fields = [];
  const moons = (p.orbitalFeatures || []).filter((f) => f.id === 'moon' || f.id === 'lesser_moon');
  moons.forEach((f, i) => {
    const mr = f.id === 'moon' ? 1.1 : 0.6;
    const orbit = r + 2.4 + i * 2.8 + rng() * 1.2;
    const at2 = orbitPoint(rng, at, orbit, cols, rows);
    out.push({
      id: ids(), kind: 'moon', name: f.id === 'moon' ? 'Moon' : 'Lesser moon',
      x: at2.x, y: at2.y,
      r: mr, tone: '#a7a9ad', air: 0, well: 0, note: '', state: 'seen'
    });
  });
  if ((p.orbitalFeatures || []).some((f) => f.id === 'asteroid')) {
    const orbit = r + 5 + rng() * 2;
    const ring = orbitPoint(rng, at, orbit, cols, rows, 3);
    fields.push({
      id: ids(), kind: 'asteroid_cluster', name: 'Orbital asteroids', shape: 'circle',
      x: ring.x, y: ring.y,
      r: 3, ...fieldDefaults('asteroid_cluster')
    });
  }
  return { bodies: out, fields, radius: r + (moons.length ? 4 + moons.length * 2.8 : 1) };
}

function fieldDefaults(kind) {
  const spec = FIELD_KINDS[kind];
  return {
    shotMod: spec.shotMod, moveMod: spec.moveMod,
    drift: null, note: spec.note, state: 'seen'
  };
}

/* One element of the system, laid onto the scene. Returns what it adds and the
   circles it occupies so the next element can keep clear. */
function layElement(element, zoneId, cols, rows, taken, rng, ids, features, first) {
  const added = { bodies: [], fields: [], hazards: [], label: element.name };
  const keep = (x, y, r) => taken.push({ x, y, r });
  const k = first ? 0.8 : 0;

  switch (element.id) {
    case 'planet': {
      const [lo, hi] = PLANET_R[element.planet.body.size] || PLANET_R.large;
      const at = spot(rng, cols, rows, hi + 8, taken, { centre: k });
      const made = planetBodies(element, at, rng, ids, cols, rows);
      added.bodies.push(...made.bodies);
      added.fields.push(...made.fields);
      keep(at.x, at.y, made.radius + lo);
      added.label = element.homeworld ? 'Homeworld' : `Planet (${element.planet.climate.name})`;
      break;
    }
    case 'gas_giant': {
      const r = round2(between(rng, 7.5, 10.5));
      const at = spot(rng, cols, rows, r + 6, taken, { centre: k });
      added.bodies.push({
        id: ids(), kind: 'gas_giant', name: 'Gas Giant', x: at.x, y: at.y, r,
        tone: pickOf(rng, GIANT_TONES), air: 3, well: round2(r * 2.2), note: '', state: 'seen',
        rot: Math.floor(rng() * 40) - 20
      });
      const moons = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < moons; i++) {
        const orbit = r + 3 + i * 2.6 + rng() * 1.5;
        const ring = orbitPoint(rng, at, orbit, cols, rows);
        added.bodies.push({
          id: ids(), kind: 'moon', name: 'Moon',
          x: ring.x, y: ring.y,
          r: round2(between(rng, 0.5, 1.2)), tone: '#a7a9ad', air: 0, well: 0, note: '', state: 'seen'
        });
      }
      keep(at.x, at.y, r + 3 + moons * 2.6);
      break;
    }
    case 'asteroid_cluster': {
      const r = round2(between(rng, 7, 10.5));
      const at = spot(rng, cols, rows, r, taken, { centre: k });
      added.fields.push({
        id: ids(), kind: 'asteroid_cluster', name: 'Asteroid Cluster', shape: 'circle',
        x: at.x, y: at.y, r, ...fieldDefaults('asteroid_cluster')
      });
      const rocks = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < rocks; i++) {
        const a = rng() * Math.PI * 2;
        const d = Math.sqrt(rng()) * r * 0.75;
        added.bodies.push({
          id: ids(), kind: 'asteroid', name: 'Asteroid',
          x: round2(at.x + Math.cos(a) * d), y: round2(at.y + Math.sin(a) * d),
          r: round2(between(rng, 0.7, 1.5)), tone: '#7d776e', air: 0, well: 0, note: '', state: 'seen'
        });
      }
      keep(at.x, at.y, r);
      break;
    }
    case 'asteroid_belt': {
      // A band right across the scene, tilted, wide enough to matter. It runs
      // past both edges so there is no end of it to fly round.
      const w = round2(between(rng, 11, 17));
      const tilt = between(rng, -0.6, 0.6) + (rng() < 0.5 ? 0 : Math.PI / 2 - 0.3);
      const cx = between(rng, cols * 0.4, cols * 0.6);
      const cy = between(rng, rows * 0.4, rows * 0.6);
      const reach = Math.hypot(cols, rows);
      const x = round2(cx - Math.cos(tilt) * reach);
      const y = round2(cy - Math.sin(tilt) * reach);
      const x2 = round2(cx + Math.cos(tilt) * reach);
      const y2 = round2(cy + Math.sin(tilt) * reach);
      added.fields.push({
        id: ids(), kind: 'asteroid_belt', name: 'Asteroid Belt', shape: 'band',
        x, y, x2, y2, w, ...fieldDefaults('asteroid_belt')
      });
      const rocks = 3 + Math.floor(rng() * 4);
      for (let i = 0; i < rocks; i++) {
        const along = between(rng, -0.35, 0.35) * reach;
        const across = between(rng, -w * 0.4, w * 0.4);
        const px = cx + Math.cos(tilt) * along - Math.sin(tilt) * across;
        const py = cy + Math.sin(tilt) * along + Math.cos(tilt) * across;
        if (px < 1 || py < 1 || px > cols - 1 || py > rows - 1) continue;
        added.bodies.push({
          id: ids(), kind: 'asteroid', name: 'Asteroid', x: round2(px), y: round2(py),
          r: round2(between(rng, 0.7, 1.6)), tone: '#7d776e', air: 0, well: 0, note: '', state: 'seen'
        });
      }
      // Sampled along its length so the next element keeps off the whole belt.
      for (let t = -0.5; t <= 0.5; t += 0.06) {
        keep(cx + Math.cos(tilt) * t * reach, cy + Math.sin(tilt) * t * reach, w / 2);
      }
      break;
    }
    case 'dust_cloud': {
      const r = round2(between(rng, 9, 14));
      const at = spot(rng, cols, rows, r, taken, { centre: k });
      added.fields.push({
        id: ids(), kind: 'dust_cloud', name: 'Dust Cloud', shape: 'circle',
        x: at.x, y: at.y, r, ...fieldDefaults('dust_cloud')
      });
      keep(at.x, at.y, r);
      break;
    }
    case 'gravity_riptide': {
      const w = round2(between(rng, 6, 10));
      const tilt = rng() * Math.PI;
      const cx = between(rng, cols * 0.35, cols * 0.65);
      const cy = between(rng, rows * 0.35, rows * 0.65);
      const reach = Math.hypot(cols, rows);
      const strength = FIELD_KINDS.gravity_riptide.drift + (features.gravityTides ? 1 : 0);
      added.fields.push({
        id: ids(), kind: 'gravity_riptide', name: 'Gravity Riptide', shape: 'band',
        x: round2(cx - Math.cos(tilt) * reach), y: round2(cy - Math.sin(tilt) * reach),
        x2: round2(cx + Math.cos(tilt) * reach), y2: round2(cy + Math.sin(tilt) * reach), w,
        ...fieldDefaults('gravity_riptide'),
        drift: [round1(Math.cos(tilt) * strength), round1(Math.sin(tilt) * strength)]
      });
      for (let t = -0.5; t <= 0.5; t += 0.08) {
        keep(cx + Math.cos(tilt) * t * reach, cy + Math.sin(tilt) * t * reach, w / 2);
      }
      break;
    }
    case 'derelict_station': {
      const s = element.site;
      const at = spot(rng, cols, rows, 7, taken, { centre: k });
      added.bodies.push({
        id: ids(), kind: 'station', name: s ? s.origin.name : 'Derelict Station',
        x: at.x, y: at.y, r: 2.2, tone: s && s.xenos ? '#7fbf9a' : '#b59a62', air: 0, well: 0,
        rot: Math.floor(rng() * 360),
        note: s ? `${s.origin.name} · Armour ${s.armour}, Hull ${s.hullIntegrity}` : '',
        state: 'ping'
      });
      keep(at.x, at.y, 7);
      added.label = s ? s.origin.name : 'Derelict Station';
      break;
    }
    case 'starship_graveyard': {
      const s = element.site;
      const hulks = s ? s.hulks : [];
      const spread = round2(clamp(7 + hulks.length * 0.9, 8, 15));
      const at = spot(rng, cols, rows, spread + 2, taken, { centre: k });
      added.fields.push({
        id: ids(), kind: 'debris', name: 'Debris Field', shape: 'circle',
        x: at.x, y: at.y, r: spread, ...fieldDefaults('debris')
      });
      hulks.forEach((h) => {
        const a = rng() * Math.PI * 2;
        const d = Math.sqrt(rng()) * spread * 0.85;
        added.bodies.push({
          id: ids(), kind: 'hulk', name: `${h.species.name} hulk`,
          x: round2(at.x + Math.cos(a) * d), y: round2(at.y + Math.sin(a) * d),
          r: round2(between(rng, 0.9, 1.7)), tone: HULK_TONE[h.condition.id] || '#7b7f86',
          air: 0, well: 0, note: h.condition.name, state: 'ping', rot: Math.floor(rng() * 360)
        });
      });
      keep(at.x, at.y, spread + 1);
      added.label = s ? `${s.origin.name} (${hulks.length} hulks)` : 'Starship Graveyard';
      break;
    }
    default:
      // Radiation Bursts and Solar Flares are not a place. They are the zone's
      // weather and are added once, below.
      break;
  }
  return added;
}

const ZONE_WEATHER = {
  radiation_bursts: {
    name: 'Radiation Bursts',
    note: 'House: the zone is wet with hard radiation. The GM calls for Morale or Population losses on ships caught in an unshielded burst; more intense means more often.'
  },
  solar_flares: {
    name: 'Solar Flares',
    note: 'House: the star throws out flares. The GM rules on shields and crew exposure whenever one fires; it can wipe a detection roll.'
  }
};

const starLabel = (star) => {
  if (!star) return '';
  const name = star.type.name;
  return star.detail ? `${name} (${star.detail})` : `${name} star`;
};

// One short name for the element a GM picked, for a dropdown and a scene title.
export function elementLabel(element) {
  if (!element) return '';
  if (element.kind === 'planet' && element.planet) {
    return element.homeworld ? 'Homeworld' : `Planet (${element.planet.climate.name})`;
  }
  if (element.kind === 'site' && element.site) {
    return element.site.hulks
      ? `${element.name} (${element.site.hulks.length} hulks)` : element.site.origin.name;
  }
  return element.name + (element.intensity > 1 ? ` ×${element.intensity}` : '');
}

/* Everything a GM can chart, in one list: the elements that are PLACES (the
   weather is not one). Each carries the zone and its index so the pick can be
   made from a dropdown or a button on the system sheet. */
export function chartableElements(system) {
  const out = [];
  for (const z of (system && system.zones) || []) {
    (z.elements || []).forEach((e, index) => {
      if (['radiation_bursts', 'solar_flares'].includes(e.id)) return;
      out.push({ zoneId: z.id, zoneName: z.name, index, element: e, label: elementLabel(e) });
    });
  }
  return out;
}

/* Build a scene.

     system   what rollSystem() returned
     picks    [{ zoneId, index }] the elements the fight is among; none means
              open void in `zoneId`
     options  size, seed, name, and ships (see placeShips)

   The same system, picks, size and seed always give the same scene, so a seed
   written on a scrap of paper brings it back. */
export function buildScene(system, picks = [], { size = 'standard', seed = '', name = '', zoneId = null } = {}) {
  const dims = sizeById(size);
  const cols = dims.cols;
  const rows = dims.rows;
  const chosen = (Array.isArray(picks) ? picks : []).filter(Boolean);
  const zone = (system && system.zones || []).find((z) => z.id === (chosen[0] ? chosen[0].zoneId : zoneId))
    || (system && system.zones && system.zones[1]) || null;
  const zid = zone ? zone.id : 'primary_biosphere';
  const s = seed || Math.random().toString(36).slice(2, 8).toUpperCase();
  const rng = makeRng(`void|${s}|${zid}|${chosen.map((p) => `${p.zoneId}:${p.index}`).join(',')}|${size}`);
  // Ids come from the same stream as the layout, so a seed brings back the
  // same scene down to its ids; the counter keeps them unique.
  let counter = 0;
  const ids = () => `v${(counter++).toString(36)}${rng().toString(36).slice(2, 5)}`;
  const rules = (system && system.rules) || {};

  // The star, or stars. A Binary pair is two discs a little apart.
  const look = ZONE_STAR[zid] || ZONE_STAR.primary_biosphere;
  const angle = rng() * Math.PI * 2;
  const types = system && system.star
    ? (system.star.companions ? system.star.companions : [system.star.type]) : [];
  const half = Math.hypot(cols, rows) / 2;
  const stars = types.slice(0, 2).map((t, i) => {
    const sk = STAR_LOOK[t.id] || STAR_LOOK.vigorous;
    const r = round2(look.radius * sk.size * (types.length > 1 ? 0.75 : 1));
    const dist = half + look.lean * look.radius * sk.size + (i ? r * 1.6 : 0);
    const a = angle + (i ? 0.18 : 0);
    return {
      typeId: t.id, r, colour: sk.colour,
      x: round2(cols / 2 + Math.cos(a) * dist), y: round2(rows / 2 + Math.sin(a) * dist)
    };
  });
  const bright = types.length
    ? Math.max(...types.map((t) => (STAR_LOOK[t.id] || STAR_LOOK.vigorous).bright)) : 0.5;

  const taken = [];
  const bodies = [];
  const fields = [];
  const items = [];
  chosen.forEach((p, i) => {
    const z = (system.zones || []).find((q) => q.id === p.zoneId);
    const element = z && z.elements[p.index];
    if (!element) return;
    const added = layElement(element, p.zoneId, cols, rows, taken, rng, ids, rules, i === 0);
    bodies.push(...added.bodies);
    fields.push(...added.fields);
    items.push(added.label);
  });

  // The zone's weather applies to every scene fought in it.
  const hazards = [];
  for (const e of (zone && zone.elements) || []) {
    const w = ZONE_WEATHER[e.id];
    if (w) hazards.push({ id: e.id, name: w.name, intensity: e.intensity || 1, note: w.note });
  }

  const zoneName = zone ? ZONE_SHORT[zone.id] || zone.name : '';
  const title = name || (items.length ? `${items[0]}${items.length > 1 ? ` +${items.length - 1}` : ''}` : `Open void`);
  return readVoidMap({
    name: `${title}${zoneName ? ' — ' + zoneName : ''}`,
    cols, rows, seed: s, grid: true, glow: round2(look.glow * (0.4 + 0.6 * bright)),
    source: {
      zoneId: zid, zoneName,
      label: items.join(', ') || 'Open void',
      star: starLabel(system && system.star),
      items,
      features: ((system && system.features) || []).map((f) => f.name)
    },
    stars, bodies, fields, hazards, ships: []
  });
}

/* ------------------------------ ships on the chart ------------------------------ */

// Is this point somewhere a hull can be? Not inside a planet.
export function clearSpace(map, p, margin = 0.6) {
  return !map.bodies.some((b) => BODY_KINDS[b.kind].blocks
    && Math.hypot(p.x - b.x, p.y - b.y) < b.r + margin);
}

export const snapToSquare = (map, p) => ({
  x: clamp(Math.floor(p.x) + 0.5, 0.5, map.cols - 0.5),
  y: clamp(Math.floor(p.y) + 0.5, 0.5, map.rows - 0.5)
});

/* Put ships on the chart. `ships` is what the host knows about them:
   [{ id, name, side, cls }]. Anything already on the chart keeps its place;
   players start on the left, hostiles on the right, facing each other, spaced
   down the edge and nudged inward off anything solid. */
export function placeShips(map, ships, seed = '') {
  const m = readVoidMap(map);
  const rng = makeRng(`ships|${seed || m.seed}|${m.cols}`);
  const have = new Set(m.ships.map((s) => s.id));
  const fresh = (ships || []).filter((s) => s && s.id && !have.has(s.id));
  const sides = { left: fresh.filter((s) => s.side === 'player' || s.side === 'ally'),
    right: fresh.filter((s) => s.side !== 'player' && s.side !== 'ally') };
  const out = [...m.ships];

  for (const [edge, group] of Object.entries(sides)) {
    group.forEach((s, i) => {
      const n = group.length;
      const y0 = (m.rows * (i + 1)) / (n + 1) + (rng() - 0.5) * 2;
      let x = edge === 'left' ? 3.5 : m.cols - 3.5;
      let p = snapToSquare(m, { x, y: y0 });
      for (let t = 0; t < 30 && !clearSpace(m, p, 1.5); t++) {
        x += edge === 'left' ? 1 : -1;
        p = snapToSquare(m, { x, y: y0 });
      }
      out.push(readShip({
        id: s.id, name: s.name, cls: s.cls, side: s.side || 'neutral',
        x: p.x, y: p.y, heading: edge === 'left' ? 90 : 270, state: 'seen'
      }));
    });
  }
  return { ...m, ships: out.filter(Boolean).slice(0, MAX_SHIPS) };
}

// Drop ships the host no longer has (a hull removed from the fleet).
export function pruneShips(map, liveIds) {
  const m = readVoidMap(map);
  const live = new Set(liveIds);
  return {
    ...m,
    ships: m.ships.filter((s) => live.has(s.id)),
    overlays: m.overlays.filter((o) => live.has(o.shipId))
  };
}

/* ------------------------------ distance, cover, silhouette ------------------------------ */

const shipOf = (map, id) => map.ships.find((s) => s.id === id) || null;

// How far behind a target a body can be and still be what the shooter sees it
// against.
export const SILHOUETTE_REACH = 10;

/* Is the target seen against something? From the shooter, the line carries on
   past the target; if that stretch runs into a big body (or the face of a
   star) the hull is a dark shape against it. RT's Silhouetted is +10. */
export function silhouetteBehind(map, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  const ux = dx / len;
  const uy = dy / len;
  const far = { x: to.x + ux * SILHOUETTE_REACH, y: to.y + uy * SILHOUETTE_REACH };
  for (const b of map.bodies) {
    if (!BODY_KINDS[b.kind].silhouettes) continue;
    if (segDist(b, to, far) < b.r) return b.name;
  }
  for (const star of map.stars) {
    // The star is a long way off: treat the line as a ray toward it.
    const sx = star.x - to.x;
    const sy = star.y - to.y;
    const ahead = sx * ux + sy * uy;
    if (ahead <= 0) continue;
    const off = Math.abs(sx * uy - sy * ux);
    if (off < star.r * 1.35) return 'the star';
  }
  return null;
}

/* Everything the chart can say about a shot from one ship to another.

     distance      VU between centres, to a tenth
     band          the weapon's range band (voidcombat's own), if a range is given
     blocked       the body in the way, or null: nothing fires through a planet
     crossing      each field the line passes through, with how far
     parts         the to-hit modifiers the terrain adds, ready for toHit()
     silhouetted   target seen against a body or a star
     arc           where the target lies from the firer's bow, and whether the
                   weapon's mount can fire that way (when a slot is given)

   canFire is false for any of: out of range, a body in the way, or outside the
   mount's arc. */
export function reach(map, fromId, toId, { weaponRange = null, slot = null } = {}) {
  const m = readVoidMap(map);
  const a = shipOf(m, fromId);
  const b = shipOf(m, toId);
  if (!a || !b) return null;
  const distance = distanceVU(a, b);

  const blocker = m.bodies.find((body) => BODY_KINDS[body.kind].blocks
    && segDist(body, a, b) < body.r);

  const crossing = [];
  for (const f of m.fields) {
    if (!f.shotMod) continue;
    const length = chordLength(f, a, b);
    if (length >= MIN_CHORD) crossing.push({ id: f.id, name: f.name, length, shotMod: f.shotMod });
  }
  const parts = crossing.map((c) => ({ label: `${c.name} (${c.length} VU)`, value: c.shotMod }));
  const sum = parts.reduce((n, p) => n + p.value, 0);
  if (sum < TERRAIN_FLOOR) parts.push({ label: 'Terrain, capped', value: TERRAIN_FLOOR - sum });
  const terrainMod = Math.max(TERRAIN_FLOOR, sum);

  const silhouette = silhouetteBehind(m, a, b);
  const band = weaponRange == null ? null : rangeBand(distance, weaponRange);
  const arc = inArc(m, a, slot, b);
  return {
    from: a, to: b, distance, band,
    canFire: !blocker && band !== 'out' && arc.inArc,
    blocked: blocker ? blocker.name : null,
    outOfArc: !arc.inArc,
    arc,
    crossing, parts, terrainMod,
    silhouetted: Boolean(silhouette), silhouette
  };
}

/* Which of a ship's weapons can fire on a target? Each one, with the same
   answer reach() gives for it, so the list on the chart and the shot that is
   sent to gunnery cannot disagree. */
export function weaponsBearing(map, fromId, toId, weapons) {
  const m = readVoidMap(map);
  return (weapons || []).map((weapon, index) => {
    const r = reach(m, fromId, toId, { weaponRange: weapon.range, slot: weapon.slot || null });
    return r ? { index, weapon, reach: r, bears: r.canFire } : null;
  }).filter(Boolean);
}

/* ------------------------------ moving ------------------------------ */

/* What a move would do, for the preview while a token is dragged.

     distance   how far, against the ship's Speed
     over       true past Speed
     tests      one entry per field crossed that asks for a test
     solid      the body it would run through, or null */
export function moveCheck(map, shipId, to, speed = null) {
  const m = readVoidMap(map);
  const s = shipOf(m, shipId);
  if (!s) return null;
  const distance = distanceVU(s, to);
  const tests = [];
  for (const f of m.fields) {
    if (f.moveMod == null) continue;
    const length = chordLength(f, s, to);
    // Ending, or starting, inside a field counts as being in it.
    if (length >= MIN_CHORD || inField(f, to)) {
      tests.push({ id: f.id, name: f.name, modifier: f.moveMod,
        text: `${f.name}: Pilot (Space Craft) Test at ${f.moveMod >= 0 ? '+' : ''}${f.moveMod}` });
    }
  }
  const solid = m.bodies.find((b) => BODY_KINDS[b.kind].blocks
    && segDist(b, s, to) < b.r);
  return {
    distance,
    over: speed != null && distance > speed,
    tests,
    solid: solid ? solid.name : null
  };
}

// The drift a point is carried by, summed over every riptide it sits in.
export function driftAt(map, p) {
  let dx = 0;
  let dy = 0;
  for (const f of map.fields) {
    if (f.drift && inField(f, p)) { dx += f.drift[0]; dy += f.drift[1]; }
  }
  return [round1(dx), round1(dy)];
}

/* Carry every ship that is in a riptide along it, once. Positions stay on
   square centres, so a drift of 2.4 VU is two squares, which is as far as a
   hull can honestly be said to have moved on a grid. */
export function applyDrift(map) {
  const m = readVoidMap(map);
  const moved = [];
  const ships = m.ships.map((s) => {
    const [dx, dy] = driftAt(m, s);
    if (!dx && !dy) return s;
    const p = snapToSquare(m, { x: s.x + dx, y: s.y + dy });
    if (p.x === s.x && p.y === s.y) return s;
    if (!clearSpace(m, p, 0.2)) return s;
    moved.push({ id: s.id, name: s.name, dx: round1(p.x - s.x), dy: round1(p.y - s.y) });
    return { ...s, x: p.x, y: p.y };
  });
  return { map: { ...m, ships }, moved };
}

/* ------------------------------ editing ------------------------------ */

export function moveShip(map, id, p, { snap = true } = {}) {
  const m = readVoidMap(map);
  const to = snap ? snapToSquare(m, p) : { x: clamp(p.x, 0, m.cols), y: clamp(p.y, 0, m.rows) };
  return { ...m, ships: m.ships.map((s) => (s.id === id ? { ...s, x: round2(to.x), y: round2(to.y) } : s)) };
}

export function turnShip(map, id, heading) {
  const m = readVoidMap(map);
  const h = ((Math.round(num(heading)) % 360) + 360) % 360;
  return { ...m, ships: m.ships.map((s) => (s.id === id ? { ...s, heading: h } : s)) };
}

/* ------------------------------ turning things ------------------------------ */

// A point turned `deg` degrees clockwise about c. The chart's y runs down, so
// "clockwise" on screen is the plain rotation matrix.
export function rotatePoint(p, c, deg) {
  const r = (num(deg) * Math.PI) / 180;
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return {
    x: round2(c.x + dx * Math.cos(r) - dy * Math.sin(r)),
    y: round2(c.y + dx * Math.sin(r) + dy * Math.cos(r))
  };
}

const rotateVec = (v, deg) => {
  const r = (num(deg) * Math.PI) / 180;
  return [round1(v[0] * Math.cos(r) - v[1] * Math.sin(r)), round1(v[0] * Math.sin(r) + v[1] * Math.cos(r))];
};

/* Turn one thing by `deg` degrees clockwise: a ship's heading, a body's
   facing, a belt or riptide about its middle (its drift turning with it), or
   the rocks inside a round field. type is 'ship' | 'body' | 'field'. */
export function rotateThing(map, type, id, deg) {
  const m = readVoidMap(map);
  const d = num(deg);
  if (type === 'ship') {
    return { ...m, ships: m.ships.map((s) => (s.id === id ? { ...s, heading: Math.round(norm360(s.heading + d)) } : s)) };
  }
  if (type === 'body') {
    return { ...m, bodies: m.bodies.map((b) => (b.id === id ? { ...b, rot: Math.round(norm360(b.rot + d)) } : b)) };
  }
  if (type === 'field') {
    return {
      ...m,
      fields: m.fields.map((f) => {
        if (f.id !== id) return f;
        if (f.shape !== 'band') return { ...f, rot: Math.round(norm360(f.rot + d)) };
        const mid = { x: (f.x + f.x2) / 2, y: (f.y + f.y2) / 2 };
        const a = rotatePoint({ x: f.x, y: f.y }, mid, d);
        const b = rotatePoint({ x: f.x2, y: f.y2 }, mid, d);
        return { ...f, x: a.x, y: a.y, x2: b.x, y2: b.y, drift: f.drift ? rotateVec(f.drift, d) : null };
      })
    };
  }
  return m;
}

/* Turn the whole scene by quarter turns, clockwise (negative for anticlockwise).
   The chart's width and height swap, every position turns about the middle,
   and everything that faces somewhere turns with it, so what the table sees
   is the same fight seen from another side. Ships stay on square centres: a
   square maps to a square. */
export function rotateScene(map, turns = 1) {
  let m = readVoidMap(map);
  const n = ((Math.round(num(turns)) % 4) + 4) % 4;
  for (let i = 0; i < n; i++) {
    const rows = m.rows;
    const at = (p) => ({ x: round2(rows - p.y), y: round2(p.x) });
    m = readVoidMap({
      ...m,
      cols: m.rows, rows: m.cols,
      stars: m.stars.map((s) => ({ ...s, ...at(s) })),
      bodies: m.bodies.map((b) => ({ ...b, ...at(b), rot: norm360(b.rot + 90) })),
      fields: m.fields.map((f) => {
        const out = { ...f, ...at(f) };
        if (f.shape === 'band') {
          const e = at({ x: f.x2, y: f.y2 });
          out.x2 = e.x; out.y2 = e.y;
        } else {
          out.rot = norm360(f.rot + 90);
        }
        if (f.drift) out.drift = [-f.drift[1], f.drift[0]];
        return out;
      }),
      ships: m.ships.map((s) => ({ ...s, ...at(s), heading: norm360(s.heading + 90) }))
    });
  }
  return m;
}

// Empty out part of a chart. 'everything' leaves the stars and the settings.
export function clearChart(map, what = 'everything') {
  const m = readVoidMap(map);
  const all = what === 'everything';
  return {
    ...m,
    ships: all || what === 'ships' ? [] : m.ships,
    bodies: all || what === 'bodies' ? [] : m.bodies,
    fields: all || what === 'fields' ? [] : m.fields,
    hazards: all ? [] : m.hazards,
    overlays: all || what === 'overlays' || what === 'ships' ? [] : m.overlays
  };
}

// Take one thing off the chart, and any range pinned to it.
export function removeThing(map, type, id) {
  const m = readVoidMap(map);
  if (type === 'ship') {
    return { ...m, ships: m.ships.filter((s) => s.id !== id), overlays: m.overlays.filter((o) => o.shipId !== id) };
  }
  if (type === 'body') return { ...m, bodies: m.bodies.filter((b) => b.id !== id) };
  if (type === 'field') return { ...m, fields: m.fields.filter((f) => f.id !== id) };
  return m;
}

/* ------------------------------ pinned ranges ------------------------------ */

/* Pin a ship's attack ranges to the chart: one wedge per mount, as far as the
   longest gun in it reaches. If any of the ship's are already pinned, they are
   all taken down instead, so the same button pins and unpins. `weapons` is what
   the host knows: [{ name, range, slot }]. */
export function togglePins(map, shipId, weapons) {
  const m = readVoidMap(map);
  const ship = m.ships.find((s) => s.id === shipId);
  if (!ship) return m;
  if (m.overlays.some((o) => o.shipId === shipId)) {
    return { ...m, overlays: m.overlays.filter((o) => o.shipId !== shipId) };
  }
  const added = arcWedges(m, ship, weapons).map((w) => ({
    id: newVoidId(), shipId, slot: w.slot, range: w.range, name: w.weapons.join(', ')
  }));
  return readVoidMap({ ...m, overlays: [...m.overlays, ...added] });
}

// Pin or unpin one mount's reach.
export function togglePin(map, shipId, slot, range, name = '') {
  const m = readVoidMap(map);
  const key = slot || null;
  const has = m.overlays.find((o) => o.shipId === shipId && o.slot === key);
  if (has) return { ...m, overlays: m.overlays.filter((o) => o !== has) };
  return readVoidMap({ ...m, overlays: [...m.overlays, { id: newVoidId(), shipId, slot: key, range, name }] });
}

export const isPinned = (map, shipId, slot = null) =>
  (map.overlays || []).some((o) => o.shipId === shipId && o.slot === (slot || null));

// Every pinned range as the wedge it covers now: from where its ship is, facing
// the way it faces. A pin whose ship has left the chart covers nothing.
export function overlayWedges(map) {
  const m = map && map.overlays ? map : readVoidMap(map);
  const out = [];
  for (const o of m.overlays) {
    const ship = m.ships.find((s) => s.id === o.shipId);
    if (!ship) continue;
    const [wedge] = arcWedges(m, ship, [{ name: o.name || 'Weapon', range: o.range, slot: o.slot }]);
    if (wedge) out.push({ overlay: o, ship, wedge });
  }
  return out;
}

// The bearing from a to b, degrees, 0 up and clockwise: what a heading is.
export const bearing = (a, b) => {
  const deg = (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI;
  return ((Math.round(deg) % 360) + 360) % 360;
};

// The same, unrounded: an arc's edge is a boundary and a rounded bearing would
// push a target a degree over it.
const bearingExact = (a, b) => norm360((Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI);

/* ------------------------------ who can be shot ------------------------------ */

/* Is a point inside the arc of a ship's mount? `relative` is how far round
   from the bow it lies, clockwise. A mount that is not named, or a slot the
   chart has no arc for, is unconstrained, which is what a weapon of unknown
   mount has to be. */
export function inArc(map, ship, slot, p) {
  const m = map && map.arcs ? map : readVoidMap(map);
  const relative = Math.round(norm360(bearingExact(ship, p) - num(ship.heading)) * 10) / 10;
  const arc = arcOf(m, ship, slot);
  if (!arc) return { inArc: true, slot: slot || null, relative, arc: null };
  const inside = arc.w >= 360 || Math.abs(angleDiff(relative, arc.c)) <= arc.w / 2 + 1e-9;
  return { inArc: inside, slot, relative, arc };
}

/* The wedges a ship's weapons cover, for drawing and for saying what can be
   hit. One per mount that holds a weapon, as far as the longest gun in it
   reaches; a weapon with no mount is all-round. `weapons` is what the host
   knows: [{ name, range, slot }]. */
export function arcWedges(map, ship, weapons) {
  const m = map && map.arcs ? map : readVoidMap(map);
  const by = new Map();
  for (const w of weapons || []) {
    if (!Number.isFinite(w.range) || w.range <= 0) continue;
    const key = w.slot && m.arcs[w.slot] ? w.slot : '';
    const cur = by.get(key) || { slot: key || null, range: 0, weapons: [] };
    cur.range = Math.max(cur.range, w.range);
    cur.weapons.push(w.name || 'Weapon');
    by.set(key, cur);
  }
  const heading = num(ship && ship.heading);
  const order = [...ARC_SLOTS, ''];
  return order.filter((k) => by.has(k)).map((k) => {
    const g = by.get(k);
    const arc = k ? arcOf(m, ship, k) : { c: 0, w: 360 };
    return {
      slot: g.slot, range: g.range, weapons: g.weapons,
      centre: norm360(heading + arc.c), width: arc.w,
      from: norm360(heading + arc.c - arc.w / 2), to: norm360(heading + arc.c + arc.w / 2),
      full: arc.w >= 360
    };
  });
}

/* ------------------------------ what the table may see ------------------------------ */

/* The chart as a player reads it. A hidden thing is not there at all. A
   pinged one is there and unreadable: the augurs know something is at that
   spot and how big it looms, and nothing else, which is what a contact is on
   the boarding map too. */
export function redactVoidForTable(map) {
  if (!map || typeof map !== 'object') return map;
  const m = readVoidMap(map);
  const unknown = (x, kind) => ({ ...x, kind, name: 'Unknown contact', note: '', tone: '#8f9aa6', air: 0, well: 0 });
  return {
    ...m,
    bodies: m.bodies.filter((b) => b.state !== 'hidden')
      .map((b) => (b.state === 'ping' ? unknown(b, 'contact') : b)),
    fields: m.fields.filter((f) => f.state !== 'hidden')
      .map((f) => (f.state === 'ping' ? { ...f, name: 'Unknown reading', note: '', shotMod: 0, moveMod: null, drift: null } : f)),
    ships: m.ships.filter((s) => s.state !== 'hidden')
      .map((s) => (s.state === 'ping' ? { ...s, name: 'Unknown contact', cls: '' } : s)),
    // A pinned range gives away the ship's guns, so only a ship the table can
    // read keeps one.
    overlays: m.overlays.filter((o) => {
      const ship = m.ships.find((s) => s.id === o.shipId);
      return ship && ship.state === 'seen';
    })
  };
}

/* The combat document carries { system, map }. The system is the GM's own
   (inhabitants, resources, what is in a hulk) and never leaves their screen:
   it is saved with the character and kept off the shared ship. */
export function voidForBridge(v) {
  if (!v || typeof v !== 'object') return v;
  const { system, ...rest } = v;
  return rest;
}

export function voidForTable(v) {
  if (!v || typeof v !== 'object') return v;
  const { system, ...rest } = v;
  return rest.map ? { ...rest, map: redactVoidForTable(rest.map) } : rest;
}

/* The combat document as the shared ship stores it: the boarding map packed,
   and the GM's star system left out. */
export function combatForBridge(combat) {
  const c = packCombat(combat);
  return c && c.void ? { ...c, void: voidForBridge(c.void) } : c;
}

/* ------------------------------ saved charts ------------------------------ */

/* A GM keeps a few charts to come back to: the derelict they will fly to
   next session, a stock ambush. They live in the homebrew library next to the
   encounters, which is one 900KB budget shared with everything else, so the
   library is capped well under it, by count and by size, rather than left to
   crowd out a hull a player was building. A chart is a few KB; the cap is
   something to hit on purpose. */
export const MAX_SAVED_CHARTS = 25;
export const MAX_LIBRARY_BYTES = 250_000;

export function readSavedChart(x) {
  if (!x || typeof x !== 'object' || !x.map || typeof x.map !== 'object') return null;
  const id = str(x.id, 24);
  if (!id) return null;
  const map = readVoidMap(x.map);
  return {
    id,
    name: str(x.name, 80) || map.name || 'Void scene',
    updatedAt: Math.max(0, Math.floor(num(x.updatedAt))),
    map
  };
}

export const readVoidLibrary = (raw) =>
  (Array.isArray(raw) ? raw : []).map(readSavedChart).filter(Boolean).slice(0, MAX_SAVED_CHARTS);

export const libraryBytes = (lib) => JSON.stringify(lib || []).length;

// What a list needs to show, without the maps.
export const chartSummary = (c) => ({
  id: c.id, name: c.name, cols: c.map.cols, rows: c.map.rows,
  ships: c.map.ships.length, updatedAt: c.updatedAt
});

/* Save a chart into the library: over the one with this id, or as a new one.
   Never throws and never half-saves: it answers { ok: true, library, id } or
   { ok: false, error } and leaves the library as it was. */
export function saveChart(library, { id = null, name = '', map, now = Date.now() } = {}) {
  const lib = readVoidLibrary(library);
  const chart = readVoidMap(map);
  const entry = {
    id: id && lib.some((c) => c.id === id) ? id : newVoidId(),
    name: str(name, 80) || chart.name,
    updatedAt: now,
    map: chart
  };
  const isNew = !lib.some((c) => c.id === entry.id);
  if (isNew && lib.length >= MAX_SAVED_CHARTS) {
    return { ok: false, error: `The library holds ${MAX_SAVED_CHARTS} charts. Delete one first.` };
  }
  const next = isNew ? [...lib, entry] : lib.map((c) => (c.id === entry.id ? entry : c));
  const bytes = libraryBytes(next);
  if (bytes > MAX_LIBRARY_BYTES) {
    return { ok: false, error: `That makes the chart library ${Math.round(bytes / 1024)}KB, over the ${Math.round(MAX_LIBRARY_BYTES / 1024)}KB it may take. Delete a chart first.` };
  }
  return { ok: true, library: next, id: entry.id, entry };
}

export const deleteChart = (library, id) => readVoidLibrary(library).filter((c) => c.id !== id);

// Is the chart on screen the one that was saved? Compared as the reader sees
// them, so a stored field that did not exist yet when it was saved is not a change.
export const sameChart = (a, b) =>
  Boolean(a) && Boolean(b) && JSON.stringify(readVoidMap(a)) === JSON.stringify(readVoidMap(b));

// A one-line summary for a list.
export function describeScene(map) {
  const m = readVoidMap(map);
  const bits = [`${m.cols}×${m.rows} VU`];
  const worlds = m.bodies.filter((b) => b.kind === 'planet' || b.kind === 'gas_giant').length;
  if (worlds) bits.push(`${worlds} world${worlds === 1 ? '' : 's'}`);
  if (m.fields.length) bits.push(`${m.fields.length} field${m.fields.length === 1 ? '' : 's'}`);
  if (m.ships.length) bits.push(`${m.ships.length} ship${m.ships.length === 1 ? '' : 's'}`);
  return bits.join(' · ');
}
