/* ---------------------------------------------------------------------------
   SPRITE SHEETS: sixteen tokens on one square image.

   Every environment ships as ONE 4x4 sheet rather than sixteen files, because
   that is how they are made: a single image generation lays all sixteen out
   together, so the crates and the door and the pillar share a palette, a light
   direction and a degree of wear. Generated one at a time they drift, and a
   deck dressed with drifted props looks like a collage.

   The same reason applies at the other end, which is why this module exists at
   all: a sheet the GM generates during a session has to be cut up in the
   browser, and the nine that ship with the app are cut up by a tool on a
   desktop (tools/slice-sprites.mjs). Two callers, one set of rules — the grid,
   the slot order, and how the black goes away.

   ---- the black ----
   The art is generated on a pitch-black background with no frame, which makes
   every sheet a PREMULTIPLIED image: a wisp of smoke at 30% is not grey smoke,
   it is the smoke's own colour already faded toward black. So the alpha is
   recovered from brightness and the colour is divided back out, rather than
   the brightness merely being thresholded. Threshold alone leaves every token
   ringed in the dark fringe where it met the background — which on a dark deck
   reads as a drop shadow nobody asked for, and on pale ice reads as dirt. */

export const SHEET_COLS = 4;
export const SHEET_ROWS = 4;
export const SHEET_CELLS = SHEET_COLS * SHEET_ROWS;

/* Where the background ends and the art begins, as a max-of-RGB.

   Below LO is background and goes fully transparent; above HI is art and is
   left alone; between the two the pixel is part background, which is what an
   edge IS.

   LO is not 1. The sheets measure 0-6 in their corners, but several carry
   faint grid lines around 21 where the generator remembered it was drawing for
   a battle map, and at a threshold of 18 those survive at about 9% opacity —
   invisible on a dark deck, a ghostly box ruled across pale ice. Sitting the
   floor above them costs the outermost wisp of the smoke and gas cells, which
   was at a tenth of an opacity nobody can see anyway. */
export const BLACK_LO = 24;
export const BLACK_HI = 52;

/* ---- the slots ----
   Fixed, and the same on all nine sheets, because the prompt that makes a
   sheet asks for them in this order. Read row by row: four doors and barriers,
   four solid props, four atmospherics, four pieces of ground clutter.

   `role` is this module's name for the cell. What the APP calls it is a
   separate question answered by spriteRole() below, because one role can serve
   several of the app's elements (a closed door and a jammed one are the same
   picture) and some of the app's elements have no picture at all.

   `turn` says whether the picture may be drawn at a quarter turn to break up
   a run of them. Sixteen crates in a hold all facing the same way read as one
   stamp repeated, which is the thing that makes tile art look like tile art.
   A door may not turn — it is a way through a wall and it faces the way the
   wall does — and neither may a barrier, which has a side you crouch on. A
   pile of crates, a fire and a bank of smoke have no front. */
export const SPRITE_SLOTS = [
  { slot: 0, role: 'door_closed', name: 'Door, closed', turn: false },
  { slot: 1, role: 'door_open', name: 'Doorway, open', turn: false },
  { slot: 2, role: 'hatch', name: 'Hatch', turn: false },
  { slot: 3, role: 'barrier', name: 'Low barrier or railing', turn: false },
  { slot: 4, role: 'crates', name: 'Cargo crates', turn: true },
  { slot: 5, role: 'machinery', name: 'Machinery', turn: true },
  { slot: 6, role: 'pillar', name: 'Structural pillar', turn: true },
  { slot: 7, role: 'fire', name: 'Fire', turn: true },
  { slot: 8, role: 'gas', name: 'Toxic gas', turn: true },
  { slot: 9, role: 'energy', name: 'Live current', turn: true },
  { slot: 10, role: 'smoke', name: 'Smoke', turn: true },
  { slot: 11, role: 'scrub', name: 'Light foliage', turn: true },
  { slot: 12, role: 'thicket', name: 'Dense foliage', turn: true },
  { slot: 13, role: 'tangle', name: 'Vines or tangle', turn: true },
  { slot: 14, role: 'grate', name: 'Grating or vent', turn: false },
  { slot: 15, role: 'wall_low', name: 'Low wall', turn: false }
];

/* How far to turn the picture on this square: 0, 1, 2 or 3 quarter turns.
   Derived from the square so a deck draws the same way every time it opens —
   a prop that span to a new angle on every redraw would be unusable. */
export function spriteTurn(role, at) {
  const hit = SPRITE_SLOTS.find((s) => s.role === role);
  if (!hit || !hit.turn || !at) return 0;
  const x = Math.round(Number(at.x));
  const y = Math.round(Number(at.y));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
  // Two coprime multipliers, so neighbours in a row and neighbours in a
  // column both get different angles rather than the grid banding into
  // diagonal stripes of one angle.
  return (((x * 3 + y * 7) % 4) + 4) % 4;
}

export const SPRITE_ROLES = SPRITE_SLOTS.map((s) => s.role);
export const slotOfRole = (role) => {
  const hit = SPRITE_SLOTS.find((s) => s.role === role);
  return hit ? hit.slot : -1;
};

/* Which sheet belongs to which ground. The sheets are named for the place and
   the themes for the fiction, so the two lists have to be married somewhere;
   here, once, rather than by a filename convention that would break the first
   time a theme was renamed. */
export const SHEET_FOR_THEME = {
  space_hulk: 'SpaceHulk',
  rogue_trader: 'Deck',
  genestealer_hive: 'Infested',
  blackstone_fortress: 'Blackstone',
  tau_station: 'Tau',
  jungle: 'Jungle',
  desert: 'Desert',
  ice: 'Ice',
  hive_city: 'Hive'
};

/* ---- which picture an element gets ----

   Returns a role, or null to mean "draw it the way it was drawn before". Null
   is not a failure: Vacuum breach and Radiation have no token on the sheets,
   and a flat wash with a label is a perfectly good way to show a square that
   is dangerous rather than occupied. Anything that returns a role still falls
   back to the flat drawing when that sheet has not loaded, so the map never
   waits on an image.

   `at` is the square's own coordinate and only decides between two pictures of
   the same thing — the sheets carry a railing AND a low wall, and alternating
   them by position keeps a long barrier from looking stamped. Position rather
   than random so the same deck draws the same way every time it opens. */
export function spriteRole(kind, id, state = null, at = null) {
  if (kind === 'door') {
    if (id === 'hatch') return 'hatch';
    return state === 'open' ? 'door_open' : 'door_closed';
  }
  if (kind === 'cover') {
    if (id === 'crates') return 'crates';
    if (id === 'machinery') return 'machinery';
    if (id === 'pillar') return 'pillar';
    if (id === 'low') return alternate(at) ? 'wall_low' : 'barrier';
    return null;
  }
  if (kind === 'hazard') {
    if (id === 'fire') return 'fire';
    if (id === 'toxic') return 'gas';
    if (id === 'electrical') return 'energy';
    // Vacuum and radiation: no token, and inventing one would lie about what
    // the square is. The grate is a hole in the floor, not a hull breach.
    return null;
  }
  /* Obscuring terrain is stored as a density — light, medium, heavy — and the
     sheets carry four pictures that could serve it: three kinds of greenery
     and a bank of smoke. Density picks the greenery, because that is the axis
     the map actually records. The smoke cell is cut and shipped but nothing
     asks for it yet: choosing smoke over foliage for a square would mean
     storing that choice, and the map format is not being changed for a
     picture. */
  if (kind === 'obscure') {
    if (id === 'light') return 'scrub';
    if (id === 'medium') return 'tangle';
    if (id === 'heavy') return 'thicket';
    return null;
  }
  return null;
}

// Which of a pair a square gets. A cheap checker rather than a hash: these
// only ever come in twos, and a checker never puts a run of the same one down
// the length of a barrier.
function alternate(at) {
  if (!at) return false;
  const x = Number(at.x);
  const y = Number(at.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return ((Math.abs(Math.round(x)) + Math.abs(Math.round(y))) % 2) === 1;
}

/* ---- the grid ----
   Where a cell sits on a sheet of any size. The shipped sheets are 2048 and a
   generated one may be 1024, so nothing here may assume 512px cells; the only
   fixed thing is that there are four of them across. A sheet whose sides are
   not divisible by four loses the odd pixel at the far edge rather than
   smearing a seam of the next cell into this one. */
export function cellRect(index, sheetW, sheetH = sheetW) {
  const i = Math.max(0, Math.min(SHEET_CELLS - 1, Math.round(Number(index) || 0)));
  const w = Math.floor(Number(sheetW) / SHEET_COLS);
  const h = Math.floor(Number(sheetH) / SHEET_ROWS);
  return { x: (i % SHEET_COLS) * w, y: Math.floor(i / SHEET_COLS) * h, w, h };
}

/* ---- the black into alpha ----

   Works on a plain RGBA array — a canvas ImageData's `data` in the browser, a
   sharp raw buffer in the tool — in place, because these are megabytes and
   copying them twice to be tidy is not tidy.

   Alpha comes from the brightest channel, not from a luminance weighting: a
   pure blue warp glow and a pure yellow arc are both fully present art, and
   weighting the channels the way the eye does would call the blue one
   half-transparent for being blue. */
export function keyBlack(rgba, { lo = BLACK_LO, hi = BLACK_HI } = {}) {
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const m = r > g ? (r > b ? r : b) : (g > b ? g : b);
    if (m <= lo) {
      // Zero the colour as well. An invisible pixel's colour still shows up
      // once anything scales the image: the filter mixes it with its visible
      // neighbours, and black leaking in that way is exactly the fringe this
      // whole routine exists to avoid.
      rgba[i] = 0; rgba[i + 1] = 0; rgba[i + 2] = 0; rgba[i + 3] = 0;
      continue;
    }
    if (m >= hi) { rgba[i + 3] = 255; continue; }
    const a = (m - lo) / span;
    // Undo the premultiply: this pixel is the art's own colour faded toward
    // black by `a`, so dividing by `a` recovers the colour it was.
    rgba[i] = Math.min(255, Math.round(r / a));
    rgba[i + 1] = Math.min(255, Math.round(g / a));
    rgba[i + 2] = Math.min(255, Math.round(b / a));
    rgba[i + 3] = Math.round(a * 255);
  }
  return rgba;
}

/* Is there anything in this cell worth keeping? A generated sheet can come
   back with a cell the model left empty, and a blank token drawn over a floor
   is an invisible bug: the GM places cover, nothing appears, and the square
   still blocks sight. Measured as the share of pixels with any opacity at all.
   The threshold is low because a railing is mostly air. */
export function cellCoverage(rgba) {
  let on = 0;
  const n = rgba.length / 4;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 8) on++;
  return n ? on / n : 0;
}
export const MIN_COVERAGE = 0.01;
