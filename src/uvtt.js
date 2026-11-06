/* MAPS FROM OTHER PROGRAMS: the Universal VTT format.

   Dungeondraft (.dd2vtt), Dungeon Alchemist and Arkenforge (.uvtt) and
   DungeonFog (.df2vtt) all export the same JSON: the map as one picture, how
   many pixels make a square, the walls as lines, the doors, and the lights.

     resolution  { map_origin {x,y}, map_size {x,y}, pixels_per_grid }
     line_of_sight, objects_line_of_sight
                 arrays of polylines, [{x,y}, ...], in squares
     portals     [{ position, bounds: [{x,y},{x,y}], rotation, closed }]
     lights      [{ position, range, intensity, color: 'AARRGGBB', shadows }]
     environment { baked_lighting, ambient_light: 'AARRGGBB' }
     image       the picture, base64

   Everything is in squares, from the map's origin. Here it becomes a deck:

   THE PICTURE is the deck's picture floor (backdrop.js), exactly as many
   squares across as the file says, and every square under it is deck.

   A WALL is a line, and this map's thin walls stand on the edges between
   squares (battlemap.js, EMPTY_MAP.walls). A line blocks the edge between two
   neighbouring squares when it crosses the line joining their centres, which
   is what "a wall between them" means whichever way the wall runs: one along
   a grid line blocks exactly the squares either side of it, and a diagonal
   one blocks the steps it cuts.

   A DOOR is drawn in these programs as a gap in a wall with a leaf across it.
   Here a door is a square, so it goes on the square on the near (west or
   north) side of each edge the leaf crosses, the leaf is drawn along that
   edge, and the gap stays open: the door square is the room's boundary, the
   way every door on this map is.

   THE LIGHT. Rogue Trader prices darkness on the to-hit roll, so the map's
   own light is read for it: an ambient light near black makes the deck Total
   Darkness, a dim one Fog, Mist or Shadow, and every square a light reaches
   (in range and in its line of sight) is painted lit.

   These maps are drawn five feet to the square, for D&D: a square here is
   1.5 m, so a ten-foot corridor is three metres wide. The GM can change it.

   Pure: see uvtt.check.mjs. */

import { readMap, cellKey, visibleCells, WALL_EAST, WALL_SOUTH, MAX_GRID } from './battlemap.js';

export const UVTT_EXTENSIONS = ['.dd2vtt', '.uvtt', '.df2vtt', '.json'];
export const UVTT_METRES_PER_SQUARE = 1.5;
// Bounds on what one file may ask for: a hostile or corrupt one should not
// be able to stall the tab.
const MAX_LINES = 20000;
const MAX_POINTS = 200000;
const MAX_PORTALS = 2000;
const MAX_LIGHTS = 1000;

const fin = (v) => Number.isFinite(Number(v));
const pt = (p) => (p && typeof p === 'object' && fin(p.x) && fin(p.y) ? { x: Number(p.x), y: Number(p.y) } : null);

// The picture's type, from its first bytes, or null for anything else.
export function imageTypeOf(b64) {
  const s = String(b64 || '').replace(/^data:[^,]*,/, '').slice(0, 16);
  if (s.startsWith('iVBORw0KGgo')) return 'image/png';
  if (s.startsWith('/9j/')) return 'image/jpeg';
  if (s.startsWith('UklGR')) return 'image/webp';
  return null;
}

/* The file, read and checked. Null when it is not one of these at all;
   otherwise what it holds, relative to its origin, with anything malformed
   left out rather than trusted. */
export function readUvtt(json) {
  const src = json && typeof json === 'object' ? json : null;
  const res = src && src.resolution;
  const size = res && pt(res.map_size);
  if (!size || size.x <= 0 || size.y <= 0) return null;
  const origin = pt(res.map_origin) || { x: 0, y: 0 };
  const at = (p) => { const q = pt(p); return q ? { x: q.x - origin.x, y: q.y - origin.y } : null; };

  const lines = [];
  let points = 0;
  for (const list of [src.line_of_sight, src.objects_line_of_sight]) {
    for (const poly of Array.isArray(list) ? list : []) {
      if (lines.length >= MAX_LINES || points >= MAX_POINTS || !Array.isArray(poly)) continue;
      const pts = poly.map(at).filter(Boolean);
      points += pts.length;
      if (pts.length >= 2) lines.push(pts);
    }
  }
  const portals = (Array.isArray(src.portals) ? src.portals : []).slice(0, MAX_PORTALS).map((d) => {
    const bounds = Array.isArray(d && d.bounds) ? d.bounds.map(at).filter(Boolean) : [];
    return bounds.length === 2 ? { a: bounds[0], b: bounds[1], closed: d.closed !== false } : null;
  }).filter(Boolean);
  const lights = (Array.isArray(src.lights) ? src.lights : []).slice(0, MAX_LIGHTS).map((l) => {
    const p = l && at(l.position);
    const range = Number(l && l.range);
    return p && Number.isFinite(range) && range > 0 ? { x: p.x, y: p.y, range: Math.min(range, 100) } : null;
  }).filter(Boolean);
  const env = src.environment && typeof src.environment === 'object' ? src.environment : {};
  const image = typeof src.image === 'string' ? src.image.replace(/^data:[^,]*,/, '') : '';
  return {
    cols: size.x, rows: size.y,
    pixelsPerGrid: fin(res.pixels_per_grid) ? Number(res.pixels_per_grid) : null,
    lines, portals, lights,
    ambient: typeof env.ambient_light === 'string' ? env.ambient_light : null,
    baked: Boolean(env.baked_lighting),
    image: imageTypeOf(image) ? image : '',
    imageType: imageTypeOf(image)
  };
}

/* ------------------------------ lines to edges ------------------------------ */

/* Every edge a segment crosses, as { x, y, bit } the way thin walls are kept.
   An east edge of (x, y) is crossed when the segment cuts the line from
   (x+.5, y+.5) to (x+1.5, y+.5); a south edge, the line down to (x+.5, y+1.5). */
export function edgesCrossed(a, b, cols = MAX_GRID, rows = MAX_GRID) {
  const out = [];
  // Rows of centres the segment passes: horizontal lines y = r + .5.
  const ylo = Math.min(a.y, b.y), yhi = Math.max(a.y, b.y);
  if (yhi > ylo) {
    for (let r = Math.max(0, Math.ceil(ylo - 0.5)); r + 0.5 <= yhi; r++) {
      const cy = r + 0.5;
      if (cy < ylo || cy > yhi || r < 0 || r >= rows) continue;
      const t = (cy - a.y) / (b.y - a.y);
      const x = a.x + (b.x - a.x) * t;
      const c = Math.floor(x - 0.5);
      if (c >= 0 && c + 1 < cols) out.push({ x: c, y: r, bit: WALL_EAST });
    }
  }
  const xlo = Math.min(a.x, b.x), xhi = Math.max(a.x, b.x);
  if (xhi > xlo) {
    for (let c = Math.max(0, Math.ceil(xlo - 0.5)); c + 0.5 <= xhi; c++) {
      const cx = c + 0.5;
      if (cx < xlo || cx > xhi || c < 0 || c >= cols) continue;
      const t = (cx - a.x) / (b.x - a.x);
      const y = a.y + (b.y - a.y) * t;
      const r = Math.floor(y - 0.5);
      if (r >= 0 && r + 1 < rows) out.push({ x: c, y: r, bit: WALL_SOUTH });
    }
  }
  return out;
}

// The ambient light's brightness, 0 to 1, from 'AARRGGBB' (or 'RRGGBB').
export function ambientLevel(hex) {
  const s = String(hex || '').replace(/^#/, '');
  const rgb = s.length === 8 ? s.slice(2) : s.length === 6 ? s : null;
  if (!rgb || !/^[0-9a-f]{6}$/i.test(rgb)) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(rgb.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const lightingForAmbient = (level) =>
  (level === null || level >= 0.5 ? 'clear' : level >= 0.2 ? 'dim' : 'dark');

/* The deck. `backdrop` is the picture floor's record, made by the caller once
   the picture is stored (its id is the browser's business); the rest is the
   map. `notes` says what was made of the file, for the GM. */
export function uvttToMap(u, { backdrop = null } = {}) {
  const cols = Math.max(5, Math.min(MAX_GRID, Math.ceil(u.cols - 1e-9)));
  const rows = Math.max(5, Math.min(MAX_GRID, Math.ceil(u.rows - 1e-9)));
  // The picture's own extent, which the deck may be padded past to reach
  // its smallest size; nothing beyond it is walled or decked.
  const ec = Math.min(cols, Math.ceil(u.cols - 1e-9)), er = Math.min(rows, Math.ceil(u.rows - 1e-9));
  const floor = {};
  for (let x = 0; x < ec; x++) for (let y = 0; y < er; y++) floor[cellKey(x, y)] = true;

  const walls = {};
  for (const poly of u.lines) {
    for (let i = 1; i < poly.length; i++) {
      for (const e of edgesCrossed(poly[i - 1], poly[i], ec, er)) {
        const k = cellKey(e.x, e.y);
        walls[k] = (walls[k] || 0) | e.bit;
      }
    }
  }

  const doors = {};
  let doorCount = 0;
  for (const d of u.portals) {
    const crossed = edgesCrossed(d.a, d.b, ec, er);
    for (const e of crossed) {
      // The gap is open: a wall drawn across a doorway would make the door
      // a door into a wall.
      const k = cellKey(e.x, e.y);
      if (walls[k]) { walls[k] &= ~e.bit; if (!walls[k]) delete walls[k]; }
      const near = { x: e.x, y: e.y };
      const far = e.bit === WALL_EAST ? { x: e.x + 1, y: e.y } : { x: e.x, y: e.y + 1 };
      const spot = doors[cellKey(near.x, near.y)] ? far : near;
      if (doors[cellKey(spot.x, spot.y)]) continue;
      const side = spot === near ? (e.bit === WALL_EAST ? 'e' : 's') : (e.bit === WALL_EAST ? 'w' : 'n');
      doors[cellKey(spot.x, spot.y)] = { kind: 'bulkhead', state: d.closed ? 'closed' : 'open', edge: side };
      doorCount++;
    }
  }

  const level = ambientLevel(u.ambient);
  const lighting = u.lights.length || level !== null ? lightingForAmbient(level) : 'clear';
  let m = readMap({
    cols, rows, floor, walls, doors, lighting,
    metresPerSquare: UVTT_METRES_PER_SQUARE,
    backdrop: backdrop ? { ...backdrop, x: 0, y: 0, w: u.cols, h: u.rows, grid: false } : null
  });
  const light = {};
  if (lighting !== 'clear') {
    // What each light reaches: in range, and seen from it through the walls.
    // A shut door stops it as a wall does, and the doors start as the file
    // has them; the door's own square is lit, as it is seen from the room.
    for (const l of u.lights) {
      const at = { x: Math.min(cols - 1, Math.max(0, Math.floor(l.x))), y: Math.min(rows - 1, Math.max(0, Math.floor(l.y))) };
      for (const c of visibleCells(m, at, l.range * UVTT_METRES_PER_SQUARE)) light[cellKey(c.x, c.y)] = 'clear';
      light[cellKey(at.x, at.y)] = 'clear';
    }
    m = readMap({ ...m, light });
  }

  const wallEdges = Object.values(walls).reduce((n, b) => n + (b & WALL_EAST ? 1 : 0) + (b & WALL_SOUTH ? 1 : 0), 0);
  return {
    map: m,
    notes: {
      cols: u.cols, rows: u.rows, walls: wallEdges, doors: doorCount, lights: u.lights.length,
      lit: Object.keys(light).length, lighting
    }
  };
}
