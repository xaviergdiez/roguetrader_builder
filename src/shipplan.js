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

/* ---- the spaces every voidship has ----
   Not components (the rules price none of them) but the rooms a ship of that
   size is built with, as the sourcebooks' cutaways draw them: a Navigator's
   sanctum on any warp-capable hull, a shrine and a medicae bay from a
   frigate's size up, an astropathic choir and an armoury on a cruiser.
   Which a hull has is set by its Space, so an escort is mostly drive and
   guns and a cruiser a town. The GM can hide any of them, and add others. */
const S = (id, label, zone, weight, minSpace, note) => ({ id, label, zone, weight, minSpace, note });
export const STANDARD_SPACES = [
  S('navigator', 'Navigator\u2019s sanctum', 'dorsal', 3, 0, 'Where the Navigator reads the warp, sealed off from the crew.'),
  S('chapel', 'Emperor\u2019s shrine', 'upper', 3, 35, 'The ship\u2019s chapel: where the crew pray before a fight and the dead are commended.'),
  S('medicae', 'Medicae bay', 'upper', 3, 40, 'Surgeons, cots and a chirurgeon-servitor, busiest after a broadside.'),
  S('cells', 'Cells', 'lower', 2, 40, 'The brig: mutineers, prisoners, and anything taken aboard alive.'),
  S('officers', 'Officers\u2019 quarters', 'dorsal', 4, 45, 'The officers\u2019 staterooms and wardroom, near the bridge.'),
  S('armoury', 'Armoury', 'lower', 3, 50, 'Small arms and boarding gear for the armsmen.'),
  S('astropath', 'Astropathic choir', 'dorsal', 3, 55, 'The astropaths and their choir, who send and hear across the warp.'),
  S('manufactorum', 'Manufactorum', 'ventral', 4, 60, 'Where the ship makes and mends its own parts.'),
  S('troops', 'Troop quarters', 'ventral', 4, 70, 'Barracks for the armsmen and anyone carried to make planetfall.')
];
export const standardSpacesFor = (hull) =>
  STANDARD_SPACES.filter((x) => (Number(hull && hull.space) || 0) >= x.minSpace);

export const ZONE_IDS = ['stern', 'aftKeel', 'upper', 'lower', 'dorsal', 'tower', 'spire', 'ventral', 'prow'];
export const ZONE_LABEL = {
  stern: 'Stern block', aftKeel: 'Under the stern', upper: 'Upper decks', lower: 'Gun decks', dorsal: 'Superstructure',
  tower: 'Command tower', spire: 'Spire', ventral: 'Under the keel', prow: 'Prow'
};
export const SHAPE_LABEL = { escort: 'Escort', light: 'Light cruiser', cruiser: 'Cruiser', transport: 'Transport' };

/* ---- the GM's own changes to a plan ----
   Kept on the ship (the blueprint's `plan`, an NPC's own entry), read here
   and never trusted:

     shape   the silhouette, if not the one its class gives it
     rooms   by compartment key: a name, where it goes, how big, or hidden
     extra   compartments of the GM's own: a name, where, how big, a note

   A compartment's KEY is what it is, not where it sits in a list, so a
   change stays with it: an essential by its category ("ess:bridge"), a gun
   by its mount and count ("gun:port:2"), a supplemental by its component, a
   standard space by its id, the GM's own by theirs. */
export const MAX_EXTRA = 24;
const KEYRE = /^[a-z]+(?::[A-Za-z0-9_-]+){0,2}$|^free$|^fill-[a-zA-Z]+$/;
const wt = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 1 ? Math.min(30, n) : null; };
const txt = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
export function readPlanEdits(v) {
  const src = v && typeof v === 'object' ? v : {};
  const rooms = {};
  for (const [k, r] of Object.entries(src.rooms && typeof src.rooms === 'object' ? src.rooms : {}).slice(0, 120)) {
    if (!KEYRE.test(k) || !r || typeof r !== 'object') continue;
    const o = {};
    const label = txt(r.label, 40); if (label) o.label = label;
    if (ZONE_IDS.includes(r.zone)) o.zone = r.zone;
    const w = wt(r.weight); if (w) o.weight = w;
    if (r.hidden === true) o.hidden = true;
    if (Object.keys(o).length) rooms[k] = o;
  }
  const extra = [];
  for (const x of Array.isArray(src.extra) ? src.extra : []) {
    if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !/^[a-z0-9]{3,32}$/.test(x.id)) continue;
    const label = txt(x.label, 40);
    if (!label || extra.some((y) => y.id === x.id)) continue;
    extra.push({ id: x.id, label, zone: ZONE_IDS.includes(x.zone) ? x.zone : 'upper', weight: wt(x.weight) || 3, note: txt(x.note, 300) });
    if (extra.length >= MAX_EXTRA) break;
  }
  return { shape: SHAPES[src.shape] ? src.shape : null, rooms, extra };
}
export const planEdited = (v) => { const e = readPlanEdits(v); return Boolean(e.shape || e.extra.length || Object.keys(e.rooms).length); };

let xseq = 0;
export const newExtraId = () => 'x' + Date.now().toString(36) + (xseq++).toString(36);

/* What a part's key is: stable across edits and reloads. */
export function keysFor(parts) {
  const n = {};
  return parts.map((p) => {
    const base = p.category === 'weapon' ? `gun:${p.slot || 'mount'}`
      : ESSENTIAL_CATEGORIES.includes(p.category) ? `ess:${p.category}` : `sup:${p.id}`;
    n[base] = (n[base] || 0) + 1;
    return p.category === 'weapon' || !ESSENTIAL_CATEGORIES.includes(p.category) ? `${base}:${n[base]}` : base;
  });
}

/* The plan: { shape, width, height, zones (the hull's rectangles), ram, nozzles,
   rooms: [{ key, kind, id, label, name, category, slot, space, power, note, zone,
   x, y, w, h, filler, edited, status, burning, flags }], hiddenSpaces, unplacedFires }.
   A room's `kind` is what it is: 'component', 'standard' (a space every ship of
   its size has), 'extra' (the GM's own), 'free' (unused Space), 'filler' (hull
   with nothing in it) or 'spine'. `edits` is the GM's own changes, above. */
export function shipPlan({ hull, parts = [], vitals = null, edits = null } = {}) {
  const ed = readPlanEdits(edits);
  const shapeId = ed.shape || shapeFor(hull && hull.cls);
  const shape = SHAPES[shapeId];
  const status = (vitals && vitals.componentStatus) || {};
  const fires = (vitals && Array.isArray(vitals.fires)) ? vitals.fires : [];
  const conditions = (vitals && Array.isArray(vitals.conditions)) ? vitals.conditions : [];
  // Where a zone the shape does not have sends things: an escort has no spire.
  const zoneHere = (z) => (shape[z] ? z : z === 'spire' ? 'dorsal' : 'upper');

  /* A compartment's share is its Space, but never less than MIN_SHARE: a
     Geller field takes no Space at all and is still a compartment someone
     can stand in, and drawn to its Space it would be a sliver. */
  const MIN_SHARE = 3;
  const items = [];
  const used = parts.reduce((n, p) => n + (p.space || 0), 0);
  const keys = keysFor(parts);
  parts.forEach((p, i) => {
    items.push({ ...p, key: keys[i], kind: 'component', label: labelOf(p), zone: zoneOf(p, shape), weight: Math.max(MIN_SHARE, p.space || 0) });
  });
  const hiddenSpaces = [];
  for (const x of standardSpacesFor(hull)) {
    const key = `std:${x.id}`;
    if (ed.rooms[key] && ed.rooms[key].hidden) { hiddenSpaces.push({ key, label: x.label }); continue; }
    items.push({ key, kind: 'standard', id: null, label: x.label, name: '', note: x.note, zone: x.zone, weight: x.weight });
  }
  for (const x of ed.extra) {
    items.push({ key: `x:${x.id}`, kind: 'extra', id: null, label: x.label, name: '', note: x.note, zone: x.zone, weight: x.weight });
  }
  // The hull's room to spare: holds, under the keel.
  const free = Math.max(0, (Number(hull && hull.space) || 0) - used);
  // Drawn no bigger than a large compartment: forty Space unused would
  // otherwise squeeze everything else under the keel into slivers. How much
  // there is, is in its name.
  if (free > 0) items.push({ key: 'free', kind: 'free', id: null, label: 'Holds', name: `${free} Space unused`, filler: true, zone: 'ventral', weight: Math.max(MIN_SHARE, Math.min(free, 8)) });

  // The GM's changes, over what the ship would be by itself.
  const byZone = {};
  for (const it of items) {
    const o = ed.rooms[it.key] || {};
    const at = { ...it, defaultLabel: it.label, edited: Boolean(o.label || o.zone || o.weight) };
    if (o.label) at.label = o.label;
    if (o.weight) at.weight = o.weight;
    at.zone = zoneHere(o.zone || it.zone);
    (byZone[at.zone] ||= []).push(at);
  }

  /* THE SUPERSTRUCTURE AND THE KEEL GROW WITH WHAT IS IN THEM. A class's
     shape is a starting point: a cruiser carrying a choir, a sanctum, its
     officers and a trophy room of the GM's has a longer superstructure than
     an escort with a Navigator in it, and a hull with a manufactorum and
     troop decks a longer keel. Each grows (never shrinks) to give its
     compartments room for their names, up to the length of the hull; the
     tower rides the superstructure and the spire stands aft of its end.
     Unused Space is not counted: holds fill whatever room there is. */
  const geo = { ...shape };
  const weightIn = (z) => (byZone[z] || []).filter((it) => it.kind !== 'free').reduce((n, it) => n + it.weight, 0);
  const mainEnd = shape.upper.x + shape.upper.w;
  const grow = (z, perWeight, right) => {
    const base = shape[z];
    const want = weightIn(z) * perWeight + 12;
    geo[z] = { ...base, w: round1(Math.min(right - base.x, Math.max(base.w, want))) };
  };
  grow('dorsal', 30, mainEnd - (shape.spire ? shape.spire.w + 40 : 24));
  geo.tower = { ...shape.tower, x: round1(geo.dorsal.x + Math.max(0, (geo.dorsal.w - shape.tower.w) * 0.4)) };
  if (shape.spire) geo.spire = { ...shape.spire, x: round1(Math.min(mainEnd - shape.spire.w - 10, Math.max(shape.spire.x, geo.dorsal.x + geo.dorsal.w + 30))) };
  grow('ventral', 28, mainEnd - 30);

  const rooms = [];
  for (const z of ZONE_IDS) {
    const r = geo[z];
    if (!r) continue;
    let list = byZone[z] || [];
    if (!list.length) list = [{ key: `fill-${z}`, kind: 'filler', id: null, label: FILLER[z], filler: true, weight: 1 }];
    // The drive is the stern block; the shields sit over it, a strip.
    const placed = z === 'stern' && list.some((it) => it.category === 'voidShield') && list.length > 1
      ? (() => {
        const top = list.filter((it) => it.category === 'voidShield');
        const rest = list.filter((it) => it.category !== 'voidShield');
        const th = r.h * 0.26;
        return [...pack(R(r.x, r.y, r.w, th), top, []), ...pack(R(r.x, r.y + th, r.w, r.h - th), rest, [])];
      })()
      : pack(r, list, []);
    for (const it of placed) {
      const st = it.id ? (status[it.id] || 'working') : null;
      const flags = [];
      if (it.category === 'plasmaDrive' && conditions.includes('adrift')) flags.push('adrift');
      if (it.category === 'voidShield' && conditions.includes('shields_collapsed')) flags.push('collapsed');
      if (it.category === 'augurArray' && conditions.includes('etherics_down')) flags.push('blind');
      if (it.category === 'bridge' && conditions.includes('no_extended_actions')) flags.push('smashed');
      rooms.push({
        key: it.key, kind: it.kind || 'filler', id: it.id, label: it.label, defaultLabel: it.defaultLabel || it.label,
        name: it.name || '', category: it.category || null,
        slot: it.slot || null, space: it.space || 0, power: it.power || 0, note: it.note || '',
        implied: Boolean(it.implied), noCrit: Boolean(it.noCrit), zone: z, filler: Boolean(it.filler), edited: Boolean(it.edited),
        weight: it.weight || 1,
        x: round1(it.x), y: round1(it.y), w: round1(it.w), h: round1(it.h),
        status: st, burning: Boolean(it.id && fires.some((f) => f && f.location === it.id)), flags
      });
    }
  }
  /* Two of a kind are told apart by number, "Port battery" and "Port battery
     2", stern to prow: each is its own compartment, with its own deck. A
     name the GM gave is theirs and left alone. */
  const seen = {};
  for (const r of [...rooms].sort((a, b) => a.x - b.x || a.y - b.y)) {
    if (r.filler || (ed.rooms[r.key] && ed.rooms[r.key].label)) continue;
    seen[r.label] = (seen[r.label] || 0) + 1;
    if (seen[r.label] > 1) r.label = `${r.label} ${seen[r.label]}`;
  }
  // The spine: the corridor everything opens off.
  rooms.push({ key: 'spine', kind: 'spine', id: null, label: 'Main spine', name: 'Freight line and artillery decks', filler: true, zone: 'spine',
    ...shape.spine, status: null, burning: false, flags: [] });
  const placedIds = new Set(rooms.filter((r) => r.id).map((r) => r.id));
  const unplacedFires = fires.filter((f) => !f || !placedIds.has(f.location)).length;
  const zones = Object.entries(geo).filter(([k, v]) => v && typeof v === 'object' && !Array.isArray(v)).map(([k, v]) => ({ zone: k, ...v }));
  // Drive nozzles at the stern face.
  const st = shape.stern;
  const nozzles = [0.22, 0.5, 0.78].map((f) => R(st.x - 22, st.y + st.h * f - 9, 22, 18));
  return { shape: shapeId, width: 1000, height: shape.height, zones, ram: shape.ram, nozzles, rooms, hiddenSpaces, unplacedFires };
}

/* ---- changing the plan ----
   Each returns the next edits, read again, so the caller stores what it gets. */
export function editRoom(edits, key, patch) {
  const e = readPlanEdits(edits);
  if (key.startsWith('x:')) {
    const id = key.slice(2);
    return readPlanEdits({ ...e, extra: e.extra.map((x) => (x.id === id ? { ...x, ...patch, id } : x)) });
  }
  const cur = { ...(e.rooms[key] || {}), ...patch };
  for (const k of Object.keys(cur)) if (cur[k] == null || cur[k] === '' || cur[k] === false) delete cur[k];
  const rooms = { ...e.rooms };
  if (Object.keys(cur).length) rooms[key] = cur; else delete rooms[key];
  return readPlanEdits({ ...e, rooms });
}
export const resetRoom = (edits, key) => {
  const e = readPlanEdits(edits);
  const rooms = { ...e.rooms };
  delete rooms[key];
  return readPlanEdits({ ...e, rooms });
};
export const addExtra = (edits, { label, zone = 'upper', weight = 3, note = '' }) => {
  const e = readPlanEdits(edits);
  return readPlanEdits({ ...e, extra: [...e.extra, { id: newExtraId(), label, zone, weight, note }] });
};
export const removeExtra = (edits, key) => {
  const e = readPlanEdits(edits);
  return readPlanEdits({ ...e, extra: e.extra.filter((x) => `x:${x.id}` !== key) });
};
export const setShape = (edits, shape) => readPlanEdits({ ...readPlanEdits(edits), shape: shape || null });

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
