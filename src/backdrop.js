/* A PICTURE FLOOR: one image or video laid over a rectangle of the grid.

   The tiled grounds are textures: a square of floor repeated under every deck
   square. A battle map drawn in another program, or a moving map made for a
   TV, is the other kind of thing — one picture of one place, with its walls,
   furniture and light already in it — and it is laid over the grid once, at a
   size in squares, rather than repeated.

   What the deck stores is only which file and where it lies:

     { id, kind, name, x, y, w, h, grid }

   x, y, w and h are in SQUARES and may be fractions. A picture made for a
   40-inch television, one inch to the square, is 34.86 squares across, and
   drawing it 35 wide would put its own grid lines out of step with the
   table's by the far edge. `grid` is whether the map draws its own grid lines
   over the picture; many pictures carry their own.

   The file is not stored with the deck. A looping map is tens or hundreds of
   megabytes and the shared stores take one; it stays in the browser of the
   computer that runs the table (localfiles.js) under `id`, and a deck opened
   somewhere else says so and asks for the file again.

   Pure: see backdrop.check.mjs. */

export const BACKDROP_KINDS = ['image', 'video'];

// The largest grid a deck may be (battlemap.js's MAX_GRID, checked equal).
const GRID_MAX = 500;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,47}$/i;

const num = (v, lo, hi, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};
// Hundredths of a square are as fine as anyone can place a picture by eye,
// and rounding keeps a saved deck from carrying 0.30000000000000004.
const hundredths = (n) => Math.round(n * 100) / 100;

export function readBackdrop(v) {
  if (!v || typeof v !== 'object') return null;
  if (typeof v.id !== 'string' || !ID_RE.test(v.id)) return null;
  if (!BACKDROP_KINDS.includes(v.kind)) return null;
  const w = num(v.w, 0.5, GRID_MAX, null);
  const h = num(v.h, 0.5, GRID_MAX, null);
  if (w === null || h === null) return null;
  return {
    id: v.id,
    kind: v.kind,
    name: String(v.name == null ? '' : v.name).slice(0, 120),
    x: hundredths(num(v.x, -GRID_MAX, GRID_MAX, 0)),
    y: hundredths(num(v.y, -GRID_MAX, GRID_MAX, 0)),
    w: hundredths(w),
    h: hundredths(h),
    grid: v.grid !== false
  };
}

let seq = 0;
export const newBackdropId = () =>
  'pic-' + Date.now().toString(36) + '-' + (seq++).toString(36) + Math.random().toString(36).slice(2, 6);

// What a file is, by its type, or null for anything a map cannot show.
export function backdropKindOf(type) {
  const t = String(type || '').toLowerCase();
  if (/^image\/(png|jpeg|webp|gif)$/.test(t)) return 'image';
  if (/^video\/(mp4|webm|ogg|quicktime)$/.test(t)) return 'video';
  return null;
}

/* ------------------------------ sizing a picture ------------------------------

   Three ways a GM knows how big a picture is, and each comes down to how many
   squares it spans:

     its own grid    the picture was drawn at N pixels to the square (a VTT
                     export says so; 70, 100, 140 and 256 are usual)
     a television    made for a TV of a given size, one inch to the square:
                     the width of a 16:9 screen of that diagonal, in inches
     by hand         simply so many squares across

   The height always follows from the picture's own shape. */

export const TV_SIZES = [32, 40, 43, 50, 55, 65];

// The width in inches of a screen of this diagonal and shape, which on a map
// drawn an inch to the square is its width in squares.
export const tvSquaresAcross = (inches, aspect = 16 / 9) =>
  hundredths((Number(inches) || 0) * aspect / Math.hypot(aspect, 1));

export function squaresFor(size, { pxPerSquare = null, across = null } = {}) {
  const width = Number(size && size.width) || 0;
  const height = Number(size && size.height) || 0;
  if (width <= 0 || height <= 0) return null;
  let w = null;
  if (Number(pxPerSquare) > 0) w = width / Number(pxPerSquare);
  else if (Number(across) > 0) w = Number(across);
  if (!w) return null;
  w = Math.min(GRID_MAX, Math.max(0.5, w));
  return { w: hundredths(w), h: hundredths(Math.min(GRID_MAX, Math.max(0.5, w * height / width))) };
}

// The grid that holds the picture, whole squares, at least the deck minimum.
export function gridFor(b, min = 5) {
  const x = readBackdrop(b);
  if (!x) return null;
  const fit = (lo, span) => Math.max(min, Math.min(GRID_MAX, Math.ceil(Math.max(0, lo) + span - 1e-9)));
  return { cols: fit(x.x, x.w), rows: fit(x.y, x.h) };
}

/* The squares the picture covers: every square whose centre lies on it. Laying
   deck on exactly these is what makes a picture playable — the fog, the rooms
   and the walls all run on deck squares, and a square the picture only grazes
   at its edge is not a place anyone stands. */
export function squaresUnder(b, cols = GRID_MAX, rows = GRID_MAX) {
  const x = readBackdrop(b);
  if (!x) return [];
  const out = [];
  const x0 = Math.max(0, Math.floor(x.x)), x1 = Math.min(cols - 1, Math.ceil(x.x + x.w));
  const y0 = Math.max(0, Math.floor(x.y)), y1 = Math.min(rows - 1, Math.ceil(x.y + x.h));
  for (let cx = x0; cx <= x1; cx++) {
    for (let cy = y0; cy <= y1; cy++) {
      const mx = cx + 0.5, my = cy + 0.5;
      if (mx > x.x && mx < x.x + x.w && my > x.y && my < x.y + x.h) out.push({ x: cx, y: cy });
    }
  }
  return out;
}
