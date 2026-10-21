/* ========================= BOARDING BATTLE MAP =========================
   A map for ground combat — boarding actions, hulk sweeps, deck fights.

   There are two layers here and they are deliberately separate:

   GEOMETRY is the deck itself: which cells are floor, which are void, where
   the bulkheads are. It is scenery. The GM builds it by stamping modular
   tiles or painting cells, and the walls are not stored at all — they are
   derived from the floor every time it is drawn (see wallMask), so a wall can
   never disagree with the floor it is supposed to edge.

   COMBATANTS ARE NOT DRAWN. The fight is played with miniatures on the
   table, and the map is projected under them. A combatant circle painted on
   the deck would sit beneath a physical model and fight it for the square, so
   nothing here tracks who is standing where — the models do that, and the
   ground-combat board holds their Wounds and conditions as it already did.

   That makes two scales matter, and they are different things:
     metresPerSquare  what a square is worth IN THE FICTION, which is what
                      range bands are priced in.
     mmPerSquare      how big a square is ON THE TABLE, which is what the
                      projector has to be calibrated against so a square
                      fits a miniature's base.

   The payoff is reachBetween(): two squares become a distance in metres, and
   groundcombat.js's rangeBand() already knows what that is worth on the
   to-hit roll. Before this, that number was typed in by hand and guessed. */

import { rangeBand, RANGE_MODIFIERS, parseWeaponStats } from './groundcombat.js';

/* ------------------------------ themes ------------------------------ */

const T = (id, name, subtitle, grid, accent, fallback, desc) => ({
  id, name, subtitle, grid, accent, fallback, desc,
  // The floor fill is a real photographed/painted texture served from
  // public/maps as a static file, not a flat colour and not a bundled
  // import: a 1024px texture has no business going through the JS bundle.
  // `fallback` is what the floor is painted if the texture 404s.
  texture: `/maps/${id}.jpg`
});

export const MAP_THEMES = [
  T('space_hulk', 'Derelict Corridor', 'Rusted deckplate, vents, hazard stripes',
    '#00e5ff', '#e74c3c', '#161a1e',
    'Void-exposed passages of a hulk, welded together from a dozen dead ships.'),
  T('rogue_trader', 'Flagship Deck', 'Gothic plating, brass inlay, Aquila seals',
    '#d4af37', '#f39c12', '#1c1916',
    'The command decks and armoured corridors of a Warrant-holder’s own ship.'),
  T('genestealer_hive', 'Infested Sector', 'Chitin, bioluminescence, tendrils',
    '#a855f7', '#2ecc71', '#1a1024',
    'Hibernation chambers where the walls themselves have been colonised.'),
  T('blackstone_fortress', 'Blackstone Citadel', 'Noctilith tiles, conduits, xenos runes',
    '#00f2fe', '#00c6ff', '#0b141d',
    'Corridors of a fortress that rearranges itself while you walk them.')
];

export const DEFAULT_THEME = 'space_hulk';

// Falls back to the default rather than returning undefined: the renderer
// reads theme.grid straight off this, and an undefined would crash the canvas
// rather than merely looking wrong.
export const themeById = (id) =>
  MAP_THEMES.find((t) => t.id === id) ||
  MAP_THEMES.find((t) => t.id === DEFAULT_THEME) ||
  MAP_THEMES[0];

/* --------------------------- the tile catalogue --------------------------- */

const TL = (id, name, category, w, h, kind) => ({ id, name, category, w, h, kind });

export const TILE_CATALOG = [
  TL('corridor_1x1', 'Corridor Cell', 'Corridors', 1, 1, 'floor'),
  TL('corridor_1x2', 'Corridor, short', 'Corridors', 1, 2, 'floor'),
  TL('corridor_1x3', 'Corridor', 'Corridors', 1, 3, 'floor'),
  TL('corridor_1x5', 'Corridor, long', 'Corridors', 1, 5, 'floor'),
  TL('corner_1x1', 'L-turn corner', 'Junctions', 1, 1, 'floor'),
  TL('t_junction_1x1', 'T-junction', 'Junctions', 1, 1, 'floor'),
  TL('cross_1x1', 'Crossroads', 'Junctions', 1, 1, 'floor'),
  TL('dead_end_1x1', 'Dead end', 'Junctions', 1, 1, 'floor'),
  TL('room_2x2', 'Guardroom', 'Rooms', 2, 2, 'floor'),
  TL('room_3x3', 'Command chamber', 'Rooms', 3, 3, 'floor'),
  TL('room_3x4', 'Armoury', 'Rooms', 3, 4, 'floor'),
  TL('room_5x5', 'Great hall', 'Rooms', 5, 5, 'floor'),
  TL('breach_1x1', 'Torpedo breach', 'Special', 1, 1, 'floor'),
  TL('airlock_1x1', 'Vacuum airlock', 'Special', 1, 1, 'floor'),
  TL('ladder_1x1', 'Access shaft', 'Special', 1, 1, 'floor')
];

export const tileById = (id) => TILE_CATALOG.find((t) => t.id === id) || null;

export const TILE_CATEGORIES = [...new Set(TILE_CATALOG.map((t) => t.category))];

/* ------------------------------ the map ------------------------------ */

// metresPerSquare is the calibration knob, and it is deliberately a knob
// rather than a constant. Rogue Trader measures in metres and has no grid of
// its own, so the squares are ours: one metre each suits a corridor fight,
// two suits a cargo hold that would otherwise need a 60-square map. Every
// distance this module reports runs through it. (A square is NOT 1.5m — that
// is the d20 five-foot square, and using it here would misprice every range
// band in the book.)
export const EMPTY_MAP = {
  theme: DEFAULT_THEME,
  cols: 30,
  rows: 20,
  metresPerSquare: 1,
  // 25mm is a standard infantry base and near enough the inch most terrain is
  // cut to. This is the real-world size of a square, and it is what the
  // projector is calibrated against — see calibrationBar.
  mmPerSquare: 25,
  pxPerSquare: 40,      // screen pixels per square, adjusted until it matches
  floor: {},            // { 'x,y': true } — the single source of truth for deck
  doors: {},            // { 'x,y': 'closed' | 'open' | 'jammed' }
  markers: {}           // { 'x,y': { type, label } } — scenery
};

export const cellKey = (x, y) => `${Math.round(x)},${Math.round(y)}`;
export const parseKey = (k) => {
  const parts = String(k).split(',');
  // Both halves must actually be there. Number('') is 0, so a truncated key
  // like "3," would otherwise read as the cell (3, 0) and put floor down in
  // a square nobody painted.
  if (parts.length !== 2 || parts.some((p) => p.trim() === '')) return null;
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
};

const int = (v, fallback, min, max) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

export const DOOR_STATES = ['closed', 'open', 'jammed'];
// Closed -> open -> jammed -> closed. A jammed bulkhead still blocks, which
// is the whole reason the state exists.
export const nextDoorState = (s) => {
  const i = DOOR_STATES.indexOf(s);
  return DOOR_STATES[(i < 0 ? 0 : i + 1) % DOOR_STATES.length];
};
export const doorBlocks = (state) => state !== 'open';

export const MARKER_TYPES = [
  { id: 'breach', name: 'Torpedo breach', colour: '#ff5722' },
  { id: 'objective', name: 'Objective', colour: '#f1c40f' },
  { id: 'hazard', name: 'Hazard (fire, vacuum)', colour: '#e74c3c' },
  { id: 'deploy', name: 'Deployment point', colour: '#3498db' }
];
export const markerTypeById = (id) => MARKER_TYPES.find((m) => m.id === id) || MARKER_TYPES[0];

// Anything absent is defaulted rather than trusted, the same way readBlueprint
// treats a blueprint saved before a field existed.
export function readMap(m) {
  const src = m && typeof m === 'object' ? m : {};

  const floor = {};
  for (const k of Object.keys(src.floor || {})) {
    if (src.floor[k] && parseKey(k)) floor[k] = true;
  }
  const doors = {};
  for (const [k, v] of Object.entries(src.doors || {})) {
    if (parseKey(k) && DOOR_STATES.includes(v)) doors[k] = v;
  }
  const markers = {};
  for (const [k, v] of Object.entries(src.markers || {})) {
    if (!parseKey(k) || !v || typeof v !== 'object') continue;
    markers[k] = { type: markerTypeById(v.type).id, label: String(v.label || '') };
  }
  return {
    theme: themeById(src.theme).id,
    cols: int(src.cols, EMPTY_MAP.cols, 5, 100),
    rows: int(src.rows, EMPTY_MAP.rows, 5, 100),
    // Half-metre squares are legitimate (a cramped gun deck), so this one is
    // not rounded to an integer like the rest.
    metresPerSquare: (() => {
      const n = Number(src.metresPerSquare);
      return Number.isFinite(n) && n > 0 ? Math.min(10, n) : EMPTY_MAP.metresPerSquare;
    })(),
    pxPerSquare: int(src.pxPerSquare, EMPTY_MAP.pxPerSquare, 10, 200),
    mmPerSquare: int(src.mmPerSquare, EMPTY_MAP.mmPerSquare, 5, 100),
    floor, doors, markers
  };
}

/* --------------------------- projector calibration ---------------------------

   A projected square has to match the miniatures standing on it, and no
   amount of arithmetic can work out how far the projector is from the table.
   So the map draws a bar of known real-world length and the GM stretches
   pxPerSquare until a ruler laid on the table agrees with it. That is the
   calibration knob; everything else about the projection follows from it.

   The bar spans whole squares, because a fractional square is impossible to
   line a ruler up against. */
export function calibrationBar(map, { targetMm = 100 } = {}) {
  const m = readMap(map);
  const squares = Math.max(1, Math.min(m.cols, Math.round(targetMm / m.mmPerSquare)));
  return {
    squares,
    mm: squares * m.mmPerSquare,
    px: squares * m.pxPerSquare,
    label: `${squares} squares = ${squares * m.mmPerSquare} mm`
  };
}

export const isFloor = (floor, x, y) => Boolean(floor && floor[cellKey(x, y)]);

// Cheaper than Object.keys(o).length on a big object: stops at the first key.
const isEmpty = (o) => { for (const _k in o) return false; return true; };

/* --------------------------- building the deck --------------------------- */

/* The cells a stamp covers. Rotating by 90 or 270 swaps the footprint, which
   is the whole point of rotating a 1x5 corridor. Cells outside the map are
   dropped rather than clamped — clamping would fold a corridor back on itself
   into a stack of cells at the edge. */
export function stampCells(tile, pos, rotation = 0, map = EMPTY_MAP) {
  const t = typeof tile === 'string' ? tileById(tile) : tile;
  if (!t) return [];
  const turned = Math.abs(Math.round(Number(rotation) || 0) / 90) % 2 === 1;
  const w = turned ? t.h : t.w;
  const h = turned ? t.w : t.h;
  const x0 = Math.round(Number(pos && pos.x) || 0);
  const y0 = Math.round(Number(pos && pos.y) || 0);
  const out = [];
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < h; dy++) {
      const x = x0 + dx;
      const y = y0 + dy;
      if (x >= 0 && x < map.cols && y >= 0 && y < map.rows) out.push({ x, y });
    }
  }
  return out;
}

/* Paint cells on or off. THE FLOOR IS THE ONLY RECORD OF THE DECK: a stamped
   tile writes its cells here and is then forgotten. Keeping a separate list
   of placed tiles alongside it would mean two sources of truth for the same
   squares, and the next stamp rebuilding the floor from that list would
   silently erase everything painted by hand. */
export function paintCells(floor, cells, on = true) {
  const next = { ...(floor || {}) };
  for (const c of cells || []) {
    const k = cellKey(c.x, c.y);
    if (on) next[k] = true; else delete next[k];
  }
  return next;
}

/* --------------------------- walls, derived --------------------------- */

export const WALL_N = 1, WALL_E = 2, WALL_S = 4, WALL_W = 8;

/* Which sides of a floor cell face the void. Walls are never stored — a
   stored wall drifts out of step with the floor the moment a cell is erased,
   and then the map shows a bulkhead edging nothing. A void cell has no walls
   of its own; the wall belongs to the floor beside it. */
export function wallMask(floor, x, y) {
  if (!isFloor(floor, x, y)) return 0;
  return (isFloor(floor, x, y - 1) ? 0 : WALL_N)
    | (isFloor(floor, x + 1, y) ? 0 : WALL_E)
    | (isFloor(floor, x, y + 1) ? 0 : WALL_S)
    | (isFloor(floor, x - 1, y) ? 0 : WALL_W);
}

/* A corner pillar sits where two walls meet, and also where the diagonal
   alone is void — the inner corner of an L-shaped room, which a four-sided
   mask cannot see. dx/dy pick the corner (-1/-1 is north-west). */
export function cornerPillar(floor, x, y, dx, dy) {
  if (!isFloor(floor, x, y)) return false;
  return !isFloor(floor, x + dx, y)
    || !isFloor(floor, x, y + dy)
    || !isFloor(floor, x + dx, y + dy);
}

/* The painted extent of the deck, for centring and for export. Null when
   nothing is painted — an empty map has no bounds, and returning 0,0,0,0
   would centre the view on a corner. */
export function floorBounds(floor) {
  const keys = Object.keys(floor || {});
  if (!keys.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const k of keys) {
    const p = parseKey(k);
    if (!p) continue;
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY, cols: maxX - minX + 1, rows: maxY - minY + 1 };
}

/* ------------------------------ distance ------------------------------ */

// Straight-line, not squares-walked. Rogue Trader measures range with a tape
// and knows nothing about grids, so counting a diagonal as one square (the
// Chebyshev shortcut most VTTs use) would quietly make a diagonal shot 40%
// shorter than the same shot along a wall.
export const distanceSquares = (a, b) =>
  Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0));

export const distanceMetres = (a, b, metresPerSquare = 1) =>
  Math.round(distanceSquares(a, b) * (Number(metresPerSquare) || 1));

/* Does the shot have a lane? Walks the cells between the two points and
   reports the first thing in the way: a closed or jammed bulkhead, or void
   where there is no deck at all.

   This is a straight line between cell centres, NOT true line of sight — it
   has no notion of cover, corner cases or firing around a doorframe, and the
   GM overrules it freely. It answers one question honestly: is there a wall
   or a shut bulkhead between these two. */
export function lineBlocked(map, from, to) {
  return walkLine(readMap(map), from, to);
}

/* The same walk, on a map that has ALREADY been read. visibleCells asks this
   once per square on the board, and readMap rebuilds the whole floor, door
   and marker set each time it is called — re-reading inside the loop made a
   single redraw rebuild the map several hundred times and stalled the tab. */
function walkLine(m, from, to) {
  if (!from || !to) return null;
  const steps = Math.ceil(distanceSquares(from, to) * 2);
  if (steps === 0) return null;
  // Whether a deck has been painted at all is a property of the MAP, not of
  // the step: asking Object.keys(floor).length inside the loop walked every
  // key in the map on every square of every line, which on a large deck is
  // billions of operations for one redraw and freezes the tab.
  const built = !isEmpty(m.floor);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(from.x + (to.x - from.x) * t);
    const y = Math.round(from.y + (to.y - from.y) * t);
    if (x === to.x && y === to.y) break;       // the target's own square is not cover
    if (x === from.x && y === from.y) continue;
    const k = cellKey(x, y);
    const door = m.doors[k];
    if (door && doorBlocks(door)) return { x, y, reason: 'door', state: door };
    // Void only blocks on a map that has a deck painted at all; an unbuilt
    // map is open ground, not a solid block of rock.
    if (built && !m.floor[k]) return { x, y, reason: 'void' };
  }
  return null;
}

/* What the shot is worth: the distance, the band it falls in, the modifier
   that band carries, and anything in the way. weaponRangeM comes from
   parseWeaponStats(...).range, so a melee weapon (no range) reports
   'standard' and leaves the call to the GM rather than inventing a penalty. */
export function reachBetween({ from, to, map, weaponRangeM = null } = {}) {
  if (!from || !to) return null;
  const m = map ? readMap(map) : EMPTY_MAP;
  const squares = distanceSquares(from, to);
  const metres = distanceMetres(from, to, m.metresPerSquare);
  const band = rangeBand(metres, weaponRangeM);
  return {
    squares: Math.round(squares * 10) / 10,
    metres,
    band,
    // 'out' carries null, not 0: out of range is no shot at all, and a 0 here
    // would be applied to the roll as "no modifier".
    mod: RANGE_MODIFIERS[band],
    blocked: map ? walkLine(m, from, to) : null
  };
}

/* ============================ OVERLAYS ============================
   What the projector casts over the models: range bands, blast radii, flame
   cones, shield auras and what can actually be seen from a square. These are
   the reason the map is worth projecting at all — a template that would
   otherwise be a cardboard cut-out laid on the table and argued over.

   Every one of them returns plain geometry in grid squares. None of them
   knows or cares which model is standing where; the GM lines the overlay up
   on the table and reads off who is caught in it. */

/* The band boundaries for a weapon, as radii in squares, outermost first so
   they paint back-to-front without the near bands being buried.
   Point-blank is an absolute 2m and does not scale with the weapon, which is
   why it is listed separately rather than derived. */
export function rangeRings(weaponRangeM, map) {
  const m = readMap(map);
  const perSquare = m.metresPerSquare || 1;
  const toSquares = (metres) => metres / perSquare;
  const r = Number(weaponRangeM);
  const rings = [];
  if (Number.isFinite(r) && r > 0) {
    rings.push({ band: 'extreme', metres: r * 3, mod: RANGE_MODIFIERS.extreme });
    rings.push({ band: 'long', metres: r * 2, mod: RANGE_MODIFIERS.long });
    rings.push({ band: 'standard', metres: r, mod: RANGE_MODIFIERS.standard });
    rings.push({ band: 'short', metres: r / 2, mod: RANGE_MODIFIERS.short });
  }
  rings.push({ band: 'point_blank', metres: 2, mod: RANGE_MODIFIERS.point_blank });
  return rings
    .map((x) => ({ ...x, radius: toSquares(x.metres) }))
    .filter((x) => x.radius > 0)
    .sort((a, b) => b.radius - a.radius);
}

/* Every square within a radius in metres of a centre — a grenade's Blast, a
   flamer's spread, or a force field's aura. A square counts as caught if its
   CENTRE is inside the radius, which is the same measurement the GM would
   make with a tape and keeps the shape symmetrical. */
export function areaCells(map, centre, radiusM) {
  const m = readMap(map);
  if (!centre) return [];
  const perSquare = m.metresPerSquare || 1;
  const radius = (Number(radiusM) || 0) / perSquare;
  if (radius <= 0) return [];
  const out = [];
  const lo = Math.floor(-radius), hi = Math.ceil(radius);
  for (let dx = lo; dx <= hi; dx++) {
    for (let dy = lo; dy <= hi; dy++) {
      const x = centre.x + dx, y = centre.y + dy;
      if (x < 0 || y < 0 || x >= m.cols || y >= m.rows) continue;
      if (Math.hypot(dx, dy) <= radius) out.push({ x, y });
    }
  }
  return out;
}

/* A flame weapon's cone: everything within its range, in a wedge pointing at
   the target. Rogue Trader prints no template, so the half-angle is a knob
   rather than a constant — 15 degrees either side gives the narrow teardrop
   a flamer is usually read as, and a GM who rules it wider can say so. The
   origin square is always included: you are standing in your own fire. */
export function coneCells(map, origin, towards, rangeM, halfAngleDeg = 15) {
  const m = readMap(map);
  if (!origin || !towards) return [];
  const perSquare = m.metresPerSquare || 1;
  const reach = (Number(rangeM) || 0) / perSquare;
  if (reach <= 0) return [];
  const aim = Math.atan2(towards.y - origin.y, towards.x - origin.x);
  if (!Number.isFinite(aim)) return [];
  const half = (Math.abs(Number(halfAngleDeg)) || 30) * Math.PI / 180;
  const out = [];
  const span = Math.ceil(reach);
  for (let dx = -span; dx <= span; dx++) {
    for (let dy = -span; dy <= span; dy++) {
      const x = origin.x + dx, y = origin.y + dy;
      if (x < 0 || y < 0 || x >= m.cols || y >= m.rows) continue;
      const dist = Math.hypot(dx, dy);
      if (dist > reach) continue;
      if (dx === 0 && dy === 0) { out.push({ x, y }); continue; }
      // The smallest angle between the aim and this square, wrapped so a
      // cone pointing west does not split at the +/-pi seam and lose half of
      // itself.
      let delta = Math.atan2(dy, dx) - aim;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      if (Math.abs(delta) <= half) out.push({ x, y });
    }
  }
  return out;
}

/* Trims a template to what it can actually reach. Fire does not cross a
   sealed bulkhead and a grenade does not blast through a wall, so a cone or
   a blast radius is filtered against the same lineBlocked() the measuring
   tape uses. The centre is always kept — a template is always on its own
   square, and dropping it would leave the thrower standing in a hole in
   their own grenade. */
export function unobstructed(map, centre, cells) {
  const m = readMap(map);
  if (!centre) return [];
  return (cells || []).filter((c) =>
    (c.x === centre.x && c.y === centre.y) || !walkLine(m, centre, c));
}

/* Keeps a template on the deck. A blast or a field spilling into the void
   beside a corridor is drawn over squares that are not part of the map at
   all, which on a projector reads as the template covering a wall. On an
   unpainted map there is no deck to stay on, so everything passes. */
export function onDeck(map, cells) {
  const m = readMap(map);
  if (isEmpty(m.floor)) return cells || [];
  return (cells || []).filter((c) => m.floor[cellKey(c.x, c.y)]);
}

/* What can be seen from a square: every cell within a radius that has an
   unblocked lane to the origin. Uses the same lineBlocked() the measuring
   tape does, so the overlay and the ruler can never disagree about whether a
   bulkhead is in the way.

   Still a straight line between centres, not true line of sight — no cover,
   no corner cases. It answers "is there a wall between these two", which is
   the question that actually comes up at the table. */
export function visibleCells(map, origin, radiusM = null) {
  const m = readMap(map);
  if (!origin) return [];
  const perSquare = m.metresPerSquare || 1;
  const limit = radiusM === null ? Infinity : (Number(radiusM) || 0) / perSquare;
  if (limit <= 0) return [];
  const out = [];
  for (let x = 0; x < m.cols; x++) {
    for (let y = 0; y < m.rows; y++) {
      if (Math.hypot(x - origin.x, y - origin.y) > limit) continue;
      if (!walkLine(m, origin, { x, y })) out.push({ x, y });
    }
  }
  return out;
}

/* Pulls the numbers an overlay needs straight off a weapon's catalogue line,
   so a flamer's reach and a grenade's Blast come from the same string the
   damage does rather than being typed in again. */
export function weaponOverlay(stats) {
  // The field figures are read off the raw line rather than the parsed
  // qualities: parseWeaponStats splits a segment on ", " as well as on the
  // separator, which cuts "aura, 5 m" into two useless halves.
  const text = String(stats || '');
  const parsed = parseWeaponStats(stats);
  const qualities = (parsed.qualities || []).join(' ');
  const blast = /blast\s*\((\d+)\)/i.exec(qualities);
  const rating = /protection rating\s*(\d+)/i.exec(text);
  const aura = /aura,?\s*(\d+)\s*m/i.exec(text);
  return {
    range: parsed.range,
    // Blast (X) is a radius in metres from the point of impact.
    blastM: blast ? Number(blast[1]) : null,
    isFlame: /flame/i.test(qualities),
    // A force field, which is not a weapon and never draws a shot.
    isField: Boolean(rating),
    protectionRating: rating ? Number(rating[1]) : null,
    // A field with no aura figure covers its bearer and nobody else, which
    // is one square — not nothing, or it would draw no overlay at all.
    auraM: rating ? (aura ? Number(aura[1]) : 1) : null,
    qualities: parsed.qualities || []
  };
}

/* Which overlay a thing gets, decided by the thing itself. There is no
   picker for this: a flamer throws a cone and a lasgun throws a line
   whatever anyone selects from a menu, and asking the GM to say so again is
   a chance to say it wrong in front of the table. */
export function overlayKindFor(ov) {
  if (!ov) return null;
  if (ov.isField) return 'field';
  if (ov.isFlame) return 'cone';
  return 'beam';            // blast weapons draw a beam AND a burst
}

/* Deployment zones are drawn, not occupied: a shaded band at each end of the
   deck telling the players where to set their models down. The map never
   knows which model is where — that is what the models are for. */
export function deploymentRows(map, depth = 1) {
  const m = readMap(map);
  const d = Math.max(1, Math.min(Math.floor(m.rows / 2), Math.round(depth)));
  return {
    hostile: { y0: 0, y1: d - 1 },
    crew: { y0: m.rows - d, y1: m.rows - 1 }
  };
}
