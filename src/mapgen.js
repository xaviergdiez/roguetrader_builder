/* Generating a deck.

   WHY BSP AND NOT A CAVE. The fog of war in this app is not a radius — it is
   rooms. regionAt() flood-fills the floor and stops only at doors, so one
   click reveals one compartment and shutting a bulkhead takes the room beyond
   it off the board. A generator that produces one undivided blob of floor
   therefore produces a deck where the first fog click reveals everything.

   Binary space partitioning is the generator whose output IS that structure:
   it cuts the grid into non-overlapping boxes, drops a room in each, and the
   places where the connecting corridors meet the rooms are exactly where a
   door belongs. It also happens to be what a voidship is — compartments
   behind bulkheads — so the bias of the algorithm is the thing being
   modelled rather than something to fight.

   THE RANDOM WALK IS STILL HERE, demoted to the job it is good at: carving
   the corridor between two rooms. Biased toward its target so it always
   arrives, but free to take the other axis on the way, which is what gives a
   corridor its kink instead of a drawn L.

   CELLULAR AUTOMATA IS DELIBERATELY ABSENT. Caves belong to the natural
   grounds, and they need their own answer to the fog problem before they are
   worth adding — an undivided cavern wants chokepoints found and turned into
   doors, or a radius fog, and neither is this module's business yet.

   Pure, and seeded. See mapgen.check.mjs. */

import { cellKey, MIN_GRID, MAX_GRID } from './battlemap.js';

/* ------------------------------- the seed -------------------------------

   SEEDED, NEVER Math.random. A deck is saved, published to the projector
   window and edited afterwards. A deck that cannot be produced again from
   what is written on it is a deck that cannot be recovered when an edit goes
   wrong, and "generate until it looks right again" is not recovery. */

// FNV-1a over the text form, so a seed may be typed. Any string, any number,
// and nothing — which still has to give a usable generator rather than NaN.
export function hashSeed(v) {
  const s = String(v == null ? '' : v);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32: small, fast, and good enough for laying out rooms. The point
// is reproducibility, not cryptography.
export function makeRng(seed) {
  let a = hashSeed(seed);
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* A fresh seed for the UI. Short and typeable, because it is meant to be
   written on a scrap of paper beside the map and typed back in. */
export function newSeed() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = (rng, list) => list[Math.floor(rng() * list.length)];

/* ------------------------------- the styles ------------------------------

   Not decoration: each one is a different shape of fight. Compartments the
   size of a gun deck play nothing like a warren of cells, and the door kind
   decides whether getting through is an action or a job. */
export const DECK_STYLES = [
  {
    id: 'decks', name: 'Voidship decks',
    note: 'Regular compartments behind blast bulkheads. The standard boarding action.',
    minLeaf: 7, margin: [1, 2], depth: 4, doorKinds: ['bulkhead', 'bulkhead', 'hatch'],
    straightness: 0.82
  },
  {
    id: 'warren', name: 'Hive warren',
    note: 'Many small cells and crawlways. Hatches, not bulkheads — it is all shortcuts.',
    /* THE MARGIN IS NEVER ZERO. At [0,1] the rooms either side of a cut
       touched, merged into one blob of floor, and a warren of cells became a
       warren-shaped open plan: one fog click took a third of the deck. The
       margin is the wall, and a compartment without one is not a
       compartment. */
    minLeaf: 5, margin: [1, 1], depth: 5, doorKinds: ['hatch', 'hatch', 'bulkhead'],
    straightness: 0.55
  },
  {
    id: 'hulk', name: 'Space hulk',
    note: 'Few large chambers joined by long wandering runs. Open ground and dead ends.',
    minLeaf: 11, margin: [1, 3], depth: 3, doorKinds: ['bulkhead', 'hatch'],
    straightness: 0.6
  }
];

export const styleById = (id) =>
  DECK_STYLES.find((s) => s.id === id) || DECK_STYLES[0];

const clampGrid = (v, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(MAX_GRID, Math.max(MIN_GRID, n)) : fallback;
};

/* ------------------------------ partitioning -----------------------------

   Rectangles are inclusive of both corners, because every other piece of
   grid arithmetic in this app is and mixing the two conventions is how off-
   by-one walls appear. */

function partition(rect, rng, style, depth, out) {
  const w = rect.x1 - rect.x0 + 1;
  const h = rect.y1 - rect.y0 + 1;
  const min = style.minLeaf;

  // Too small to halve, or deep enough: this is a leaf.
  if (depth <= 0 || (w < min * 2 && h < min * 2)) {
    out.push(rect);
    return out;
  }

  // Cut the long way, so compartments stay roughly square rather than
  // degenerating into corridors that are accidentally rooms.
  const canV = w >= min * 2;
  const canH = h >= min * 2;
  const vertical = canV && canH
    ? (w > h * 1.25 ? true : h > w * 1.25 ? false : rng() < 0.5)
    : canV;

  if (vertical) {
    const at = randInt(rng, rect.x0 + min - 1, rect.x1 - min);
    partition({ ...rect, x1: at }, rng, style, depth - 1, out);
    partition({ ...rect, x0: at + 1 }, rng, style, depth - 1, out);
  } else {
    const at = randInt(rng, rect.y0 + min - 1, rect.y1 - min);
    partition({ ...rect, y1: at }, rng, style, depth - 1, out);
    partition({ ...rect, y0: at + 1 }, rng, style, depth - 1, out);
  }
  return out;
}

// A room inside its box, inset by a margin. The margin is what leaves the
// void between compartments that the walls are derived from — with no margin
// the rooms meet and the deck is one rectangle again.
function roomIn(rect, rng, style) {
  const [lo, hi] = style.margin;
  const inset = () => randInt(rng, lo, hi);
  let x0 = rect.x0 + inset(), x1 = rect.x1 - inset();
  let y0 = rect.y0 + inset(), y1 = rect.y1 - inset();
  // A margin that ate the room gives it back: a 1x1 compartment is a
  // cupboard, not a room, and it still has to be connectable.
  if (x1 - x0 < 1) { x0 = rect.x0; x1 = Math.min(rect.x1, rect.x0 + 1); }
  if (y1 - y0 < 1) { y0 = rect.y0; y1 = Math.min(rect.y1, rect.y0 + 1); }
  return { x0, y0, x1, y1 };
}

const centreOf = (r) => ({
  x: Math.floor((r.x0 + r.x1) / 2),
  y: Math.floor((r.y0 + r.y1) / 2)
});

/* The random walk, doing the one job it is good at. Biased toward the target
   so it always arrives — an unbiased drunkard's walk between two points on a
   200-square deck is a very long wait — but free to take the other axis,
   which is the difference between a corridor and a drawn L. */
function carveWalk(floor, from, to, rng, straightness) {
  let x = from.x, y = from.y;
  let guard = 0;
  const limit = 4 * (MAX_GRID * 2);
  while ((x !== to.x || y !== to.y) && guard++ < limit) {
    floor[cellKey(x, y)] = true;
    const dx = Math.sign(to.x - x);
    const dy = Math.sign(to.y - y);
    // With one axis already satisfied there is no choice to make, which is
    // also what guarantees this terminates: every step closes the distance.
    const moveX = dx === 0 ? false : dy === 0 ? true : rng() < straightness;
    if (moveX) x += dx; else y += dy;
  }
  floor[cellKey(to.x, to.y)] = true;
}

/* ------------------------------- the doors -------------------------------

   This is the part that makes the deck playable rather than merely drawn.
   Every place a corridor meets a room gets exactly one door, so regionAt()
   stops there and the room is its own region.

   Found by walking the ring just outside each room: a cell out there that is
   floor, with floor directly inside it, is an opening. Consecutive openings
   along one side are ONE doorway, not three, so the middle of each run is
   where the door goes. */
function placeDoors(floor, rooms, rng, style) {
  const doors = {};
  const isFloor = (x, y) => Boolean(floor[cellKey(x, y)]);

  for (const r of rooms) {
    const sides = [
      // along the top, standing one above it
      { fixed: r.y0 - 1, from: r.x0, to: r.x1, horizontal: true, inward: 1 },
      { fixed: r.y1 + 1, from: r.x0, to: r.x1, horizontal: true, inward: -1 },
      { fixed: r.x0 - 1, from: r.y0, to: r.y1, horizontal: false, inward: 1 },
      { fixed: r.x1 + 1, from: r.y0, to: r.y1, horizontal: false, inward: -1 }
    ];
    for (const s of sides) {
      let run = [];
      const flush = () => {
        if (!run.length) return;
        const mid = run[Math.floor(run.length / 2)];
        doors[cellKey(mid.x, mid.y)] = {
          kind: pick(rng, style.doorKinds),
          // Closed, because a generated deck is one nobody has walked yet.
          state: 'closed'
        };
        run = [];
      };
      for (let i = s.from; i <= s.to; i++) {
        const x = s.horizontal ? i : s.fixed;
        const y = s.horizontal ? s.fixed : i;
        const ix = s.horizontal ? x : x + s.inward;
        const iy = s.horizontal ? y + s.inward : y;
        if (isFloor(x, y) && isFloor(ix, iy)) run.push({ x, y });
        else flush();
      }
      flush();
    }
  }
  return doors;
}

/* --------------------------------- the deck -------------------------------

   Returns the layers to merge into a map, never a whole map: the caller owns
   the theme, the calibration and everything else on the deck it is replacing,
   and a generator that returned those too would quietly reset them. */
export function generateDeck({ cols, rows, style, seed } = {}) {
  const st = styleById(style);
  const w = clampGrid(cols, 30);
  const h = clampGrid(rows, 20);
  const s = seed == null || seed === '' ? newSeed() : seed;
  const rng = makeRng(s);

  // One square of margin all round, so the outermost rooms have a wall
  // rather than running off the edge of the grid.
  const leaves = partition({ x0: 1, y0: 1, x1: w - 2, y1: h - 2 }, rng, st, st.depth, []);
  const rooms = leaves.map((r) => roomIn(r, rng, st));

  const floor = {};
  for (const r of rooms) {
    for (let x = r.x0; x <= r.x1; x++) {
      for (let y = r.y0; y <= r.y1; y++) {
        if (x >= 0 && y >= 0 && x < w && y < h) floor[cellKey(x, y)] = true;
      }
    }
  }

  /* Connected in a chain through the leaf order. BSP emits leaves in
     depth-first order, so neighbours in that list are neighbours on the
     deck, and a chain over them is a spanning tree — every room reachable,
     no room sealed. Checked, because "generated a room nobody can enter" is
     the failure that ruins a session rather than looking wrong. */
  for (let i = 1; i < rooms.length; i++) {
    carveWalk(floor, centreOf(rooms[i - 1]), centreOf(rooms[i]), rng, st.straightness);
  }

  const doors = placeDoors(floor, rooms, rng, st);
  return { floor, doors, rooms, seed: s, style: st.id, cols: w, rows: h };
}
