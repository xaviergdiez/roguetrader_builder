/* THE SHIP PLAN: a voidship seen side-on, stern to the left and prow to the
   right, cut into one compartment for every component it carries, the way a
   cutaway in a sourcebook draws one. Made from the ship itself rather than
   drawn, so the crew's own Lunar-class has its own drive and its own guns,
   and an enemy raider gets a plan from nothing but its hull and weapons.

   WHERE THINGS GO is by what they are, as a Gothic warship is built: the
   plasma drive in the stern block with the void shield generators over it,
   the warp engine and Geller field slung under the stern, the bridge in the
   tower over the superstructure and the augurs in a spire, the crew and the
   life sustainer in the upper decks, the broadside batteries along the gun
   decks below the spine, the holds and hangars under the keel, and the prow
   guns in the prow. Inside its zone a compartment's share is its Space.

   Space the components do not use is the ship's holds, so a cruiser with
   room to spare shows it. A zone with nothing in it is still the hull, and is
   drawn as what fills such a deck (crew decks, holds) rather than left out of
   the outline.

   DAMAGE is what the vitals already say (voidcombat.js): a component's
   status (damaged, destroyed, offline), the fires and where they burn, and
   the conditions a critical leaves on the ship. Pure; see shipplan.check.mjs. */

import {
  ESSENTIAL_CATEGORIES, ESSENTIAL_LABELS, componentById, hullById, allComponents, hullGroup
} from './ship.js';

/* ---- what a ship carries ----
   A part is { id, name, category, space, power, note, slot }: one per
   component, and one per weapon MOUNT, so two port batteries are two
   compartments. `id` is the component's id, which is what a critical marks. */
const partOf = (c, extra = {}) => ({
  id: c.id, name: c.name, category: c.category, space: Number(c.space) || 0,
  power: Number(c.power) || 0, note: c.note || '', noCrit: Boolean(c.noCrit), ...extra
});

export function partsOfBlueprint(bp) {
  const out = [];
  for (const cat of ESSENTIAL_CATEGORIES) {
    const c = componentById(bp && bp.essential && bp.essential[cat], bp);
    if (c) out.push(partOf(c));
  }
  for (const w of (bp && bp.weapons) || []) {
    const c = componentById(w && w.componentId, bp);
    if (c) out.push(partOf(c, { slot: w.slot || null }));
  }
  for (const id of (bp && bp.supplemental) || []) {
    const c = componentById(id, bp);
    if (c) out.push(partOf(c));
  }
  return out;
}

/* An NPC ship is a hull and a list of guns: the rest of it is implied. The
   implied essentials are the ones the catalogue lists for the hull's weight
   (a raider gets the escort drive), so a plan and a critical on an enemy name
   real components, and the same ones every time. */
export function npcEssentials(hull, source) {
  const group = hullGroup(hull && hull.cls);
  const all = allComponents(source);
  const out = {};
  for (const cat of ESSENTIAL_CATEGORIES) {
    const of = all.filter((c) => c.category === cat);
    const fit = of.find((c) => Array.isArray(c.fits) && c.fits.includes(group));
    const pick = fit || of[0];
    if (pick) out[cat] = pick.id;
  }
  return out;
}

export function partsOfNpc(ship, source) {
  const hull = hullById(ship && ship.hullId, source);
  if (!hull) return [];
  const ess = npcEssentials(hull, source);
  const out = [];
  for (const cat of ESSENTIAL_CATEGORIES) {
    const c = componentById(ess[cat], source);
    if (c) out.push(partOf(c, { implied: true }));
  }
  const slots = hull.slots || [];
  (ship.weapons || []).forEach((id, i) => {
    const c = componentById(id, source);
    if (c) out.push(partOf(c, { slot: slots.length ? slots[i % slots.length] : null }));
  });
  return out;
}

/* What a critical can land on: every component once, less any that cannot
   be critically hit (the Tenebro-Maze). */
export function critTargets(parts) {
  return [...new Set((parts || []).filter((p) => p && p.id && !p.noCrit).map((p) => p.id))];
}
export const driveOf = (parts) => {
  const d = (parts || []).find((p) => p.category === 'plasmaDrive');
  return d ? d.id : null;
};

/* ---- the shape ----
   A side view in a box 1000 wide. Each weight of hull is the same anatomy in
   other proportions: escorts short and low with a small tower, a transport
   all hold, a cruiser tall in the superstructure. Rectangles, so the zones
   are also where the compartments go; the prow's ram and the drive nozzles
   are drawn round them. */
const R = (x, y, w, h) => ({ x, y, w, h });
const SHAPES = {
  cruiser: {
    height: 360,
    stern: R(30, 110, 160, 190), aftKeel: R(70, 300, 120, 45),
    upper: R(190, 150, 640, 52), spine: R(190, 202, 640, 18), lower: R(190, 220, 640, 52),
    dorsal: R(230, 92, 340, 58), tower: R(355, 30, 110, 62), spire: R(600, 62, 56, 88),
    ventral: R(270, 272, 330, 50), prow: R(830, 150, 80, 122), ram: [[910, 150], [992, 248], [910, 272]]
  },
  light: {
    height: 340,
    stern: R(40, 118, 150, 172), aftKeel: R(80, 290, 110, 42),
    upper: R(190, 150, 620, 50), spine: R(190, 200, 620, 16), lower: R(190, 216, 620, 50),
    dorsal: R(240, 100, 300, 50), tower: R(350, 48, 100, 52), spire: R(570, 80, 48, 70),
    ventral: R(280, 266, 280, 44), prow: R(810, 150, 84, 116), ram: [[894, 150], [988, 240], [894, 266]]
  },
  escort: {
    height: 300,
    stern: R(60, 112, 150, 150), aftKeel: R(100, 262, 110, 40),
    upper: R(210, 128, 560, 50), spine: R(210, 178, 560, 16), lower: R(210, 194, 560, 50),
    dorsal: R(250, 84, 260, 44), tower: R(330, 36, 100, 48), spire: null,
    ventral: R(300, 244, 220, 38), prow: R(770, 128, 90, 116), ram: [[860, 128], [985, 220], [860, 244]]
  },
  transport: {
    height: 340,
    stern: R(40, 120, 150, 170), aftKeel: R(80, 290, 110, 40),
    upper: R(190, 140, 640, 54), spine: R(190, 194, 640, 16), lower: R(190, 210, 640, 54),
    dorsal: R(300, 104, 240, 36), tower: R(380, 60, 90, 44), spire: null,
    ventral: R(230, 264, 520, 62), prow: R(830, 140, 70, 124), ram: [[900, 140], [960, 230], [900, 264]]
  }
};
export const shapeFor = (cls) => {
  const g = hullGroup(cls);
  if (g === 'raider' || g === 'frigate') return 'escort';
  if (g === 'transport') return 'transport';
  if (g === 'light') return 'light';
  return 'cruiser';
};

/* ---- which zone a part goes in ---- */
const HOLD_WORDS = /hold|cargo|hangar|launch|bay|vault|smuggl|storage/i;
const GUNDECK_WORDS = /munitorum|ammo|magazine|armou?ry|gun ?deck/i;
export function zoneOf(part, shape) {
  switch (part.category) {
    case 'plasmaDrive': case 'voidShield': return 'stern';
    case 'warpEngine': case 'gellerField': return 'aftKeel';
    case 'bridge': return 'tower';
    case 'augurArray': return shape.spire ? 'spire' : 'dorsal';
    case 'lifeSustainer': case 'crewQuarters': return 'upper';
    case 'weapon':
      if (part.slot === 'prow') return 'prow';
      if (part.slot === 'dorsal') return 'dorsal';
      if (part.slot === 'keel') return 'ventral';
      return 'lower';
    default:
      if (HOLD_WORDS.test(part.name)) return 'ventral';
      if (GUNDECK_WORDS.test(part.name)) return 'lower';
      return 'dorsal';
  }
}

// What a zone is when nothing the ship carries is in it.
const FILLER = {
  stern: 'Engineering', aftKeel: 'Warp vanes', upper: 'Crew decks', lower: 'Gun decks',
  dorsal: 'Officers’ decks', tower: 'Command tower', spire: 'Vox spire', ventral: 'Holds', prow: 'Armoured prow'
};

const SLOT_LABEL = { prow: 'Prow', dorsal: 'Dorsal', port: 'Port', starboard: 'Starboard', keel: 'Keel' };
export function labelOf(part) {
  if (part.category === 'weapon') return `${SLOT_LABEL[part.slot] || 'Gun'} battery`;
  if (ESSENTIAL_LABELS[part.category]) {
    if (part.category === 'voidShield') return 'Void shield generators';
    if (part.category === 'augurArray') return 'Augur arrays';
    return ESSENTIAL_LABELS[part.category];
  }
  return part.name;
}

/* ---- packing a zone ----
   Cut in two along the longer side, the cut placed so each half holds its
   share of the Space, and again inside each half: what a sourcebook's
   cutaway looks like, rooms side by side and stacked, never slivers. */
function pack(r, items, out) {
  if (!items.length) return out;
  if (items.length === 1) { out.push({ ...items[0], x: r.x, y: r.y, w: r.w, h: r.h }); return out; }
  const total = items.reduce((n, it) => n + it.weight, 0);
  let acc = 0, k = 1, best = Infinity;
  for (let i = 1; i < items.length; i++) {
    acc += items[i - 1].weight;
    const gap = Math.abs(acc - total / 2);
    if (gap < best) { best = gap; k = i; }
  }
  const a = items.slice(0, k), b = items.slice(k);
  const share = a.reduce((n, it) => n + it.weight, 0) / total;
  if (r.w >= r.h) {
    const wa = r.w * share;
    pack(R(r.x, r.y, wa, r.h), a, out); pack(R(r.x + wa, r.y, r.w - wa, r.h), b, out);
  } else {
    const ha = r.h * share;
    pack(R(r.x, r.y, r.w, ha), a, out); pack(R(r.x, r.y + ha, r.w, r.h - ha), b, out);
  }
  return out;
}

const round1 = (v) => Math.round(v * 10) / 10;

/* The plan: { shape, width, height, zones (the hull's rectangles), ram, nozzles,
   rooms: [{ key, id, label, name, category, slot, space, power, note, zone,
   x, y, w, h, filler, status, burning, flags }], unplacedFires } */
export function shipPlan({ hull, parts = [], vitals = null } = {}) {
  const shapeId = shapeFor(hull && hull.cls);
  const shape = SHAPES[shapeId];
  const status = (vitals && vitals.componentStatus) || {};
  const fires = (vitals && Array.isArray(vitals.fires)) ? vitals.fires : [];
  const conditions = (vitals && Array.isArray(vitals.conditions)) ? vitals.conditions : [];

  /* A compartment's share is its Space, but never less than MIN_SHARE: a
     Geller field takes no Space at all and is still a compartment someone
     can stand in, and drawn to its Space it would be a sliver. */
  const MIN_SHARE = 3;
  const byZone = {};
  const used = parts.reduce((n, p) => n + (p.space || 0), 0);
  parts.forEach((p, i) => {
    const z = zoneOf(p, shape);
    (byZone[z] ||= []).push({ ...p, key: `${p.id}#${i}`, label: labelOf(p), weight: Math.max(MIN_SHARE, p.space || 0) });
  });
  // The hull's room to spare: holds, under the keel.
  const free = Math.max(0, (Number(hull && hull.space) || 0) - used);
  if (free > 0) (byZone.ventral ||= []).push({ key: 'free', id: null, label: 'Holds', name: `${free} Space unused`, filler: true, weight: Math.max(MIN_SHARE, free) });

  const ZONES = ['stern', 'aftKeel', 'upper', 'lower', 'dorsal', 'tower', 'spire', 'ventral', 'prow'];
  const rooms = [];
  for (const z of ZONES) {
    const r = shape[z];
    if (!r) continue;
    let items = byZone[z] || [];
    if (!items.length) items = [{ key: `fill-${z}`, id: null, label: FILLER[z], filler: true, weight: 1 }];
    // The drive is the stern block; the shields sit over it, a strip.
    if (z === 'stern') items = [...items].sort((a, b) => (a.category === 'voidShield' ? -1 : 0) - (b.category === 'voidShield' ? -1 : 0));
    const placed = z === 'stern' && items.length > 1
      ? (() => {
        const top = items.filter((it) => it.category === 'voidShield');
        const rest = items.filter((it) => it.category !== 'voidShield');
        const th = top.length ? r.h * 0.26 : 0;
        return [...pack(R(r.x, r.y, r.w, th), top, []), ...pack(R(r.x, r.y + th, r.w, r.h - th), rest, [])];
      })()
      : pack(r, items, []);
    for (const it of placed) {
      const st = it.id ? (status[it.id] || 'working') : null;
      const flags = [];
      if (it.category === 'plasmaDrive' && conditions.includes('adrift')) flags.push('adrift');
      if (it.category === 'voidShield' && conditions.includes('shields_collapsed')) flags.push('collapsed');
      if (it.category === 'augurArray' && conditions.includes('etherics_down')) flags.push('blind');
      if (it.category === 'bridge' && conditions.includes('no_extended_actions')) flags.push('smashed');
      rooms.push({
        key: it.key, id: it.id, label: it.label, name: it.name || '', category: it.category || null,
        slot: it.slot || null, space: it.space || 0, power: it.power || 0, note: it.note || '',
        implied: Boolean(it.implied), noCrit: Boolean(it.noCrit), zone: z, filler: Boolean(it.filler),
        x: round1(it.x), y: round1(it.y), w: round1(it.w), h: round1(it.h),
        status: st, burning: Boolean(it.id && fires.some((f) => f && f.location === it.id)), flags
      });
    }
  }
  // The spine: the corridor everything opens off.
  rooms.push({ key: 'spine', id: null, label: 'Main spine', name: 'Freight line and artillery decks', filler: true, zone: 'spine',
    ...shape.spine, status: null, burning: false, flags: [] });
  const placedIds = new Set(rooms.filter((r) => r.id).map((r) => r.id));
  const unplacedFires = fires.filter((f) => !f || !placedIds.has(f.location)).length;
  const zones = Object.entries(shape).filter(([k, v]) => v && typeof v === 'object' && !Array.isArray(v)).map(([k, v]) => ({ zone: k, ...v }));
  // Drive nozzles at the stern face.
  const s = shape.stern;
  const nozzles = [0.22, 0.5, 0.78].map((f) => R(s.x - 22, s.y + s.h * f - 9, 22, 18));
  return { shape: shapeId, width: 1000, height: shape.height, zones, ram: shape.ram, nozzles, rooms, unplacedFires };
}

export const STATUSES = ['working', 'damaged', 'offline', 'destroyed'];
export const STATUS_LABEL = { working: 'Working', damaged: 'Damaged', offline: 'Offline', destroyed: 'Destroyed' };

/* A label fitted into a compartment: the largest size, down to `min`, at
   which its words wrap into lines that fit the room's width and stack inside
   its height. Null when even the smallest will not go, and the room is named
   by its tooltip instead. Character width is taken as 0.56 of the size, which
   is what the app's serif runs at. */
export function fitLabel(text, w, h, { max = 20, min = 7, pad = 6 } = {}) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const room = Math.max(0, w - pad * 2), tall = Math.max(0, h - pad);
  for (let size = max; size >= min; size -= 1) {
    const per = Math.floor(room / (size * 0.56));
    if (per < 3) continue;
    const lines = [];
    let line = '';
    let fits = true;
    for (const word of words) {
      if (word.length > per) { fits = false; break; }
      const next = line ? `${line} ${word}` : word;
      if (next.length <= per) line = next; else { lines.push(line); line = word; }
    }
    if (!fits) continue;
    if (line) lines.push(line);
    if (lines.length * size * 1.15 <= tall) return { lines, size };
  }
  return null;
}
