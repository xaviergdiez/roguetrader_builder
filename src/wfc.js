/* GROWING A DECK FROM AN EXAMPLE: the GM paints a few rooms the way they
   want the whole deck to look, and the deck is grown from them.

   WAVE FUNCTION COLLAPSE, the overlapping model. Every 3 by 3 window of the
   example is learned, in all eight turns and mirrorings, and the deck is
   grown so that every 3 by 3 window of it is one the example has: the cells
   the size they were painted, the walls as thick, the doors sitting in them
   the same way. What it copies is texture, not plan: it does not know where
   the big rooms should go, which is what a sketch is for (sketchread.js).
   So it is right for warrens and ruins, and wrong for a deck with a shape
   in mind; and it keeps nothing longer than its window, so a long gallery
   in the example comes out as short ones.

   AN EXAMPLE is kept on the deck's sketch, so the deck can be grown again
   from it with another seed after the deck itself has been replaced:

     { rows: ['#####', '#..+.', ...], doorKind, merge, name }

   '#' is wall, '.' floor, '+' a door. The outside of the example counts as
   wall, and so does the edge of the grown deck, so no room runs off the map.

   AFTERWARDS the growth is made playable, because the fog reveals by room
   (regionAt stops at doors) and nothing in the collapse knows that:

     - a door with no floor on two opposite sides is not a door, and goes;
     - a scrap of floor too small to stand in goes;
     - every other island is joined to the rest by a corridor with a door at
       each end, the rule mapgen.js keeps between rooms;
     - a room so big one click would show a third of the deck is split by a
       door in its narrowest gap, as a cave is cut at its necks (caverns.js);
     - a room smaller than `merge` squares has a door opened onto its smallest
       neighbour, so a warren is not a hundred fog clicks.

   Pure and seeded, like every generator here. See wfc.check.mjs. */

import { makeRng, newSeed } from './mapgen.js';
import { DOOR_KINDS, MIN_GRID, MAX_GRID } from './battlemap.js';
import { readExample as readExampleShape, EXAMPLE_MIN, EXAMPLE_MAX, MERGE_DEFAULT } from './sketchplan.js';

export { EXAMPLE_MIN, EXAMPLE_MAX, MERGE_DEFAULT };

const WALL = 0, FLOOR = 1, DOOR = 2;
const CH = '#.+';
const N = 3;

export const GROW_MAX = 90;             // a side; past this the collapse is slow and fails more often
const MIN_ISLAND = 4;
const TRIES = 10;
const BIG_SHARE = 0.3;
const FOG_SHARE = 0.5;
const MIN_SPLIT = 8;

const clampGrid = (v, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(MAX_GRID, Math.max(MIN_GRID, n)) : d; };

/* Examples to start from, for a GM who has not painted one. */
export const STOCK_EXAMPLES = [
  {
    id: 'warren', name: 'Hab warren', doorKind: 'hatch', merge: 6,
    note: 'Small habs off crooked passages, every one behind a hatch.',
    rows: [
      '##################',
      '#...#....#...#...#',
      '#...+....#...+...#',
      '#...#....#...#...#',
      '##+####+####+###+#',
      '#....#.......#...#',
      '#....+.......+...#',
      '#....#.......#...#',
      '###+####+#####+###',
      '#...#......#.....#',
      '#...+......+.....#',
      '#...#......#.....#',
      '##################'
    ]
  },
  {
    id: 'ruin', name: 'Ruined halls', doorKind: 'bulkhead', merge: 10,
    note: 'Big broken halls, walls fallen in places, doors where they still stand.',
    rows: [
      '####################',
      '#.......#..........#',
      '#.......#..........#',
      '#..##...+....##....#',
      '#..##...#....##....#',
      '#.......#..........#',
      '####.######+########',
      '#........#.........#',
      '#........#..##.....#',
      '#........+..##.....#',
      '#........#.........#',
      '####################'
    ]
  }
];
export const stockExample = (id) => STOCK_EXAMPLES.find((e) => e.id === id) || null;

/* An example as kept on a deck (sketchplan.js reads its shape), with doors
   of a kind the map knows. */
export function readExample(v) {
  const ex = readExampleShape(v);
  return ex && { ...ex, doorKind: DOOR_KINDS.some((d) => d.id === ex.doorKind) ? ex.doorKind : 'hatch' };
}

/* What is painted on a deck, as an example: its floor and doors inside their
   bounds, with a square of wall round them. An error in words when there is
   nothing, or too much, to learn from. */
export function exampleFromMap(map) {
  const keys = [...new Set([...Object.keys(map.floor || {}), ...Object.keys(map.doors || {})])];
  if (!keys.length) return { error: 'Nothing is painted to copy. Paint a few rooms and their doors, or choose a stock example.' };
  const pts = keys.map((k) => k.split(',').map(Number));
  const x0 = Math.min(...pts.map((p) => p[0])), x1 = Math.max(...pts.map((p) => p[0]));
  const y0 = Math.min(...pts.map((p) => p[1])), y1 = Math.max(...pts.map((p) => p[1]));
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  if (w + 2 > EXAMPLE_MAX || h + 2 > EXAMPLE_MAX) {
    return { error: `What is painted is ${w} × ${h} squares. An example is at most ${EXAMPLE_MAX - 2} a side: clear the deck and paint a smaller one.` };
  }
  if (w < 3 || h < 3) return { error: 'What is painted is too small to learn from: paint at least a room and a door.' };
  const kinds = {};
  const rows = [];
  for (let y = y0 - 1; y <= y1 + 1; y++) {
    let r = '';
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      const k = `${x},${y}`;
      if (map.doors && map.doors[k]) { r += '+'; kinds[map.doors[k].kind] = (kinds[map.doors[k].kind] || 0) + 1; } else r += map.floor && map.floor[k] ? '.' : '#';
    }
    rows.push(r);
  }
  const doorKind = Object.entries(kinds).sort((a, b) => b[1] - a[1])[0];
  return readExample({ rows, doorKind: doorKind ? doorKind[0] : 'hatch', merge: MERGE_DEFAULT, name: 'Painted example' });
}

/* ------------------------------ learning ------------------------------ */

const turn = (p) => { const q = new Uint8Array(N * N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) q[x + y * N] = p[(N - 1 - y) + x * N]; return q; };
const mirror = (p) => { const q = new Uint8Array(N * N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) q[x + y * N] = p[(N - 1 - x) + y * N]; return q; };

/* Every 3 by 3 window of the example, turned and mirrored all eight ways,
   and how often each was seen (how likely it is to be grown). */
export function learnExample(example) {
  const rows = example.rows;
  const h = rows.length + 2, w = rows[0].length + 2;
  const at = (x, y) => (x <= 0 || y <= 0 || x >= w - 1 || y >= h - 1 ? WALL : CH.indexOf(rows[y - 1][x - 1]));
  const index = new Map();
  const patterns = [];
  const weights = [];
  for (let y = 0; y <= h - N; y++) {
    for (let x = 0; x <= w - N; x++) {
      let p = new Uint8Array(N * N);
      for (let dy = 0; dy < N; dy++) for (let dx = 0; dx < N; dx++) p[dx + dy * N] = at(x + dx, y + dy);
      for (let s = 0; s < 8; s++) {
        const q = s === 4 ? mirror(p) : p;
        if (s === 4) p = q;
        const k = q.join('');
        if (index.has(k)) weights[index.get(k)]++;
        else { index.set(k, patterns.length); patterns.push(q); weights.push(1); }
        p = turn(p);
      }
    }
  }
  // Which pattern may sit beside which, in each direction: left, down, right, up.
  const DX = [-1, 0, 1, 0], DY = [0, 1, 0, -1];
  const agrees = (a, b, dx, dy) => {
    for (let y = Math.max(0, dy); y < Math.min(N, N + dy); y++) {
      for (let x = Math.max(0, dx); x < Math.min(N, N + dx); x++) if (a[x + N * y] !== b[x - dx + N * (y - dy)]) return false;
    }
    return true;
  };
  const T = patterns.length;
  const propagator = [0, 1, 2, 3].map((d) => {
    const out = new Array(T);
    for (let t = 0; t < T; t++) {
      const list = [];
      for (let u = 0; u < T; u++) if (agrees(patterns[t], patterns[u], DX[d], DY[d])) list.push(u);
      out[t] = Int32Array.from(list);
    }
    return out;
  });
  return { patterns, weights, propagator, keys: new Set(index.keys()) };
}

/* ------------------------------- growing ------------------------------- */

/* One attempt at the collapse over a W by H grid: the grid of cells, or null
   when it ran into a place nothing fits. */
function collapse(model, W, H, rng) {
  const { patterns, weights, propagator } = model;
  const T = patterns.length;
  const MX = W - N + 1, MY = H - N + 1, L = MX * MY;
  const DX = [-1, 0, 1, 0], DY = [0, 1, 0, -1], OPP = [2, 3, 0, 1];
  const wave = new Uint8Array(L * T).fill(1);
  const compatible = new Int16Array(L * T * 4);
  for (let t = 0; t < T; t++) for (let d = 0; d < 4; d++) {
    const n = propagator[OPP[d]][t].length;
    for (let i = 0; i < L; i++) compatible[(i * T + t) * 4 + d] = n;
  }
  const logW = weights.map((w) => Math.log(w));
  let sumW = 0, sumWLogW = 0;
  for (let t = 0; t < T; t++) { sumW += weights[t]; sumWLogW += weights[t] * logW[t]; }
  const ones = new Int32Array(L).fill(T);
  const sw = new Float64Array(L).fill(sumW);
  const swl = new Float64Array(L).fill(sumWLogW);
  const stack = new Int32Array(L * T * 2);
  let sp = 0;
  let dead = false;
  const ban = (i, t) => {
    const it = i * T + t;
    if (!wave[it]) return;
    wave[it] = 0;
    const c = it * 4;
    compatible[c] = 0; compatible[c + 1] = 0; compatible[c + 2] = 0; compatible[c + 3] = 0;
    stack[sp++] = i; stack[sp++] = t;
    ones[i]--; sw[i] -= weights[t]; swl[i] -= weights[t] * logW[t];
    if (ones[i] === 0) dead = true;
  };
  const propagate = () => {
    while (sp > 0 && !dead) {
      const t1 = stack[--sp], i1 = stack[--sp];
      const x1 = i1 % MX, y1 = (i1 - x1) / MX;
      for (let d = 0; d < 4; d++) {
        const x2 = x1 + DX[d], y2 = y1 + DY[d];
        if (x2 < 0 || y2 < 0 || x2 >= MX || y2 >= MY) continue;
        const i2 = x2 + y2 * MX;
        const p = propagator[d][t1];
        for (let k = 0; k < p.length; k++) {
          const idx = (i2 * T + p[k]) * 4 + d;
          if (--compatible[idx] === 0) ban(i2, p[k]);
        }
      }
    }
  };
  // The edge of the deck is wall: a window on the edge has wall along it.
  const wallAlong = (p, side) => {
    for (let k = 0; k < N; k++) {
      const v = side === 0 ? p[0 + k * N] : side === 1 ? p[k + (N - 1) * N] : side === 2 ? p[(N - 1) + k * N] : p[k];
      if (v !== WALL) return false;
    }
    return true;
  };
  for (let i = 0; i < L; i++) {
    const x = i % MX, y = (i - x) / MX;
    for (let t = 0; t < T; t++) {
      const p = patterns[t];
      if ((x === 0 && !wallAlong(p, 0)) || (y === MY - 1 && !wallAlong(p, 1)) || (x === MX - 1 && !wallAlong(p, 2)) || (y === 0 && !wallAlong(p, 3))) ban(i, t);
    }
  }
  propagate();
  for (;;) {
    if (dead) return null;
    // The undecided place with least choice left, ties broken by the seed.
    let best = -1, min = Infinity;
    for (let i = 0; i < L; i++) {
      if (ones[i] <= 1) continue;
      const e = Math.log(sw[i]) - swl[i] / sw[i] + 1e-6 * rng();
      if (e < min) { min = e; best = i; }
    }
    if (best < 0) break;
    let r = rng() * sw[best];
    let pick = -1;
    for (let t = 0; t < T; t++) {
      if (!wave[best * T + t]) continue;
      pick = t;
      r -= weights[t];
      if (r <= 0) break;
    }
    for (let t = 0; t < T; t++) if (t !== pick && wave[best * T + t]) ban(best, t);
    propagate();
  }
  const g = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = Math.min(x, MX - 1), py = Math.min(y, MY - 1);
      const i = px + py * MX;
      let t = 0;
      while (!wave[i * T + t]) t++;
      g[x + y * W] = patterns[t][(x - px) + (y - py) * N];
    }
  }
  return g;
}

/* The raw growth, before it is made playable: the cells and how many tries
   it took, or null. For the checks, which test the collapse itself. */
export function growCells(example, { cols, rows, seed, from = 0, model: learned = null }) {
  const model = learned || learnExample(example);
  for (let attempt = from; attempt < TRIES; attempt++) {
    const g = collapse(model, cols, rows, makeRng(`${seed}|wfc|${attempt}`));
    if (g) return { cells: g, model, tries: attempt + 1 };
  }
  return { cells: null, model, tries: TRIES };
}

/* -------------------------- making it playable -------------------------- */

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const MAX_CUT = 6;

/* SPLITTING A ROOM TOO BIG FOR THE FOG. The room is cut between its two
   farthest-apart squares, through its necks only: a gap in a wall up to
   NECK squares wide, wall at both ends of it and floor either side, where a
   door can stand once the rest of the gap is blocked. As few squares as will
   do, by the least cut of a max-flow in which only a neck can be closed; then
   each gap cut gets a door in its middle and rubble in the rest, as a cave's
   neck is narrowed to its door (caverns.js). Only if that is at most MAX_CUT
   squares, strands nothing, and leaves neither side smaller than `least`; a
   room that cannot be cut so is left whole. Answers how many necks it cut. */
const NECK = 3;
function splitBig(g, W, H, least) {
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? WALL : g[x + y * W]);
  const open = (x, y) => at(x, y) !== WALL;
  const total = g.reduce((n, v) => n + (v !== WALL ? 1 : 0), 0);
  // In a gap across (wall at its left and right ends, floor above and below
  // all of it) or one up and down.
  const inGap = (x, y, across) => {
    const [ax, ay] = across ? [1, 0] : [0, 1];
    const side = (cx, cy) => open(cx + ay, cy + ax) && open(cx - ay, cy - ax);
    if (!side(x, y)) return false;
    let lo = 0, hi = 0;
    while (lo < NECK && open(x - ax * (lo + 1), y - ay * (lo + 1)) && side(x - ax * (lo + 1), y - ay * (lo + 1))) lo++;
    while (hi < NECK && open(x + ax * (hi + 1), y + ay * (hi + 1)) && side(x + ax * (hi + 1), y + ay * (hi + 1))) hi++;
    if (lo + hi + 1 > NECK) return false;
    return !open(x - ax * (lo + 1), y - ay * (lo + 1)) && !open(x + ax * (hi + 1), y + ay * (hi + 1));
  };
  const isGap = (c) => {
    const x = c % W, y = (c - x) / W;
    return (inGap(x, y, true) || inGap(x, y, false)) && !N4.some(([dx, dy]) => at(x + dx, y + dy) === DOOR);
  };
  const isDoorway = (c) => {
    const x = c % W, y = (c - x) / W;
    return (open(x - 1, y) && open(x + 1, y) && !open(x, y - 1) && !open(x, y + 1))
      || (open(x, y - 1) && open(x, y + 1) && !open(x - 1, y) && !open(x + 1, y));
  };
  const flood = (from, blocked = null) => {
    const seen = new Set([from]);
    const q = [from];
    for (let i = 0; i < q.length; i++) {
      const c = q[i], x = c % W, y = (c - x) / W;
      for (const [dx, dy] of N4) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const cc = xx + yy * W;
        if (g[cc] === FLOOR && !seen.has(cc) && !(blocked && blocked.has(cc))) { seen.add(cc); q.push(cc); }
      }
    }
    return q;
  };
  const farthest = (from) => { const q = flood(from); return q[q.length - 1]; };

  const leastCut = (cells) => {
    const n = cells.length;
    const local = new Map(cells.map((c, i) => [c, i]));
    const INF = 1 << 29;
    // Each square twice, in and out; closing a gap is cutting its in-to-out.
    const head = new Int32Array(2 * n).fill(-1);
    const next = [], to = [], cap = [];
    const edge = (u, v, c) => {
      to.push(v); cap.push(c); next.push(head[u]); head[u] = to.length - 1;
      to.push(u); cap.push(0); next.push(head[v]); head[v] = to.length - 1;
    };
    for (let i = 0; i < n; i++) {
      const c = cells[i], x = c % W, y = (c - x) / W;
      edge(2 * i, 2 * i + 1, isGap(c) ? 1 : INF);
      for (const [dx, dy] of N4) {
        const j = local.get((x + dx) + (y + dy) * W);
        if (j != null && x + dx >= 0 && x + dx < W) edge(2 * i + 1, 2 * j, INF);
      }
    }
    const a = farthest(cells[0]), b = farthest(a);
    const src = 2 * local.get(a) + 1, sink = 2 * local.get(b);
    const prev = new Int32Array(2 * n);
    const reach = () => {
      prev.fill(-1);
      const q = [src];
      const mark = new Uint8Array(2 * n);
      mark[src] = 1;
      for (let i = 0; i < q.length; i++) {
        for (let e = head[q[i]]; e >= 0; e = next[e]) {
          if (cap[e] <= 0 || mark[to[e]]) continue;
          mark[to[e]] = 1; prev[to[e]] = e; q.push(to[e]);
        }
      }
      return mark;
    };
    for (let flow = 0; ; flow++) {
      const mark = reach();
      if (!mark[sink]) break;
      if (flow >= MAX_CUT) return null;
      let bottleneck = INF;
      for (let v = sink; v !== src; v = to[prev[v] ^ 1]) bottleneck = Math.min(bottleneck, cap[prev[v]]);
      if (bottleneck >= INF) return null;      // a way round with no gap in it
      for (let v = sink; v !== src; v = to[prev[v] ^ 1]) { cap[prev[v]] -= bottleneck; cap[prev[v] ^ 1] += bottleneck; }
    }
    const mark = reach();
    const cut = cells.filter((c, i) => mark[2 * i] && !mark[2 * i + 1]);
    if (!cut.length) return null;
    const blocked = new Set(cut);
    const sideA = flood(a, blocked).length, sideB = flood(b, blocked).length;
    if (sideA < least || sideB < least || sideA + sideB + cut.length !== n) return null;
    return cut;
  };

  // The cut squares in their gaps: a door in the middle of each, rubble in
  // the rest. Undone, and false, if a door would not stand.
  const close = (cut) => {
    const left = new Set(cut);
    const was = cut.map((c) => [c, g[c]]);
    const doorsAt = [];
    while (left.size) {
      const first = left.values().next().value;
      const gap = [first];
      left.delete(first);
      for (let i = 0; i < gap.length; i++) {
        const c = gap[i];
        for (const d of [1, -1, W, -W]) if (left.has(c + d)) { left.delete(c + d); gap.push(c + d); }
      }
      gap.sort((p, q) => p - q);
      const door = gap[Math.floor(gap.length / 2)];
      for (const c of gap) g[c] = c === door ? DOOR : WALL;
      doorsAt.push(door);
    }
    if (doorsAt.every(isDoorway)) return doorsAt.length;
    for (const [c, v] of was) g[c] = v;
    return 0;
  };

  let necks = 0;
  const whole = new Set();         // rooms, by their first square, that cannot be cut
  for (let round = 0; round < 40; round++) {
    const seen = new Uint8Array(W * H);
    let biggest = null;
    for (let s = 0; s < W * H; s++) {
      if (g[s] !== FLOOR || seen[s]) continue;
      const cells = flood(s);
      for (const c of cells) seen[c] = 1;
      if (!whole.has(s) && (!biggest || cells.length > biggest.length)) biggest = cells.sort((p, q) => p - q);
    }
    if (!biggest || biggest.length <= total * BIG_SHARE) break;
    const cut = leastCut(biggest);
    const closed = cut ? close(cut) : 0;
    if (!closed) { whole.add(biggest[0]); continue; }
    necks += closed;
  }
  return necks;
}

function tidy(g, W, H, merge) {
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? WALL : g[x + y * W]);
  const open = (x, y) => at(x, y) !== WALL;
  // Doors: floor on two opposite sides and wall on the other two, and not
  // straight on from another door. Anything else is floor or wall.
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (g[x + y * W] !== DOOR) continue;
      const lr = open(x - 1, y) && open(x + 1, y) && !open(x, y - 1) && !open(x, y + 1);
      const ud = open(x, y - 1) && open(x, y + 1) && !open(x - 1, y) && !open(x + 1, y);
      const twin = (lr && (at(x - 1, y) === DOOR || at(x + 1, y) === DOOR)) || (ud && (at(x, y - 1) === DOOR || at(x, y + 1) === DOOR));
      if ((lr || ud) && !twin) continue;
      const n = N4.filter(([dx, dy]) => open(x + dx, y + dy)).length;
      g[x + y * W] = n >= 2 ? FLOOR : WALL;
    }
  }

  // Islands: the floor in pieces, doors and all.
  const label = new Int32Array(W * H).fill(-1);
  const pieces = [];
  for (let s = 0; s < W * H; s++) {
    if (g[s] === WALL || label[s] >= 0) continue;
    const cells = [s];
    label[s] = pieces.length;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i], x = c % W, y = (c - x) / W;
      for (const [dx, dy] of N4) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const cc = xx + yy * W;
        if (g[cc] !== WALL && label[cc] < 0) { label[cc] = pieces.length; cells.push(cc); }
      }
    }
    pieces.push(cells);
  }
  let dropped = 0;
  for (const p of pieces) if (p.length < MIN_ISLAND) { for (const c of p) { g[c] = WALL; label[c] = -1; } dropped++; }
  const big = pieces.map((p, i) => i).filter((i) => pieces[i].length >= MIN_ISLAND).sort((a, b) => pieces[b].length - pieces[a].length);

  // Joined, the nearest first, to what is already joined: a corridor through
  // the rock that touches nothing on the way, a door at each end.
  let joined = 0;
  if (big.length > 1) {
    const inMain = new Uint8Array(W * H);
    for (const c of pieces[big[0]]) inMain[c] = 1;
    const waiting = new Set(big.slice(1));
    while (waiting.size) {
      let done = false;
      for (const id of [...waiting]) {
        const island = new Set(pieces[id]);
        const ownedBy = (c) => (inMain[c] ? 'main' : island.has(c) ? 'island' : g[c] !== WALL ? 'other' : null);
        const came = new Map();
        const q = [];
        for (const c of pieces[id]) {
          const x = c % W, y = (c - x) / W;
          for (const [dx, dy] of N4) {
            const xx = x + dx, yy = y + dy;
            if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue;
            const cc = xx + yy * W;
            if (g[cc] !== WALL || came.has(cc)) continue;
            if (N4.some(([ex, ey]) => ownedBy((xx + ex) + (yy + ey) * W) === 'other')) continue;
            came.set(cc, -1); q.push(cc);
          }
        }
        let end = -1;
        for (let i = 0; i < q.length && end < 0; i++) {
          const c = q[i], x = c % W, y = (c - x) / W;
          if (N4.some(([dx, dy]) => inMain[(x + dx) + (y + dy) * W])) { end = c; break; }
          for (const [dx, dy] of N4) {
            const xx = x + dx, yy = y + dy;
            if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue;
            const cc = xx + yy * W;
            if (g[cc] !== WALL || came.has(cc)) continue;
            // Beyond the first square, nothing beside it but rock and, at the
            // far end, the deck it is going to.
            if (N4.some(([ex, ey]) => { const o = ownedBy((xx + ex) + (yy + ey) * W); return o === 'other' || o === 'island'; })) continue;
            came.set(cc, c); q.push(cc);
          }
        }
        if (end < 0) continue;
        const path = [];
        for (let c = end; c >= 0; c = came.get(c)) path.push(c);
        // A door at each end, or one in a corridor too short to hold two.
        for (const c of path) g[c] = FLOOR;
        g[path[0]] = DOOR;
        if (path.length > 2) g[path[path.length - 1]] = DOOR;
        for (const c of [...pieces[id], ...path]) inMain[c] = 1;
        waiting.delete(id);
        joined++;
        done = true;
      }
      if (!done) {
        // Sealed in by the rest: dropped rather than left where no one can go.
        for (const id of waiting) { for (const c of pieces[id]) g[c] = WALL; dropped++; }
        break;
      }
    }
  }

  // Rooms the fog would show a third of the deck of at a click (a ruin's
  // halls run into each other where its walls have fallen) are split, by
  // doors in the fewest one-square gaps that cut them in two.
  const split = splitBig(g, W, H, Math.max(MIN_SPLIT, merge));

  // Rooms as the fog sees them: floor flooded to the doors.
  const room = new Int32Array(W * H).fill(-1);
  const size = [];
  for (let s = 0; s < W * H; s++) {
    if (g[s] !== FLOOR || room[s] >= 0) continue;
    const cells = [s];
    room[s] = size.length;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i], x = c % W, y = (c - x) / W;
      for (const [dx, dy] of N4) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const cc = xx + yy * W;
        if (g[cc] === FLOOR && room[cc] < 0) { room[cc] = size.length; cells.push(cc); }
      }
    }
    size.push(cells.length);
  }
  // Small rooms merged: the door to the smallest neighbour opened, smallest first.
  const parent = size.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const doorsOf = [];
  for (let s = 0; s < W * H; s++) {
    if (g[s] !== DOOR) continue;
    const x = s % W, y = (s - x) / W;
    const rs = [...new Set(N4.map(([dx, dy]) => (x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H ? -1 : room[(x + dx) + (y + dy) * W])).filter((r) => r >= 0))];
    if (rs.length) doorsOf.push({ s, rs });
  }
  let merged = 0;
  if (merge > 0) {
    for (;;) {
      let pickDoor = null, best = Infinity;
      for (const d of doorsOf) {
        if (g[d.s] !== DOOR) continue;
        const roots = [...new Set(d.rs.map(find))];
        if (roots.length < 2) continue;
        const sizes = roots.map((r) => size[r]);
        const small = Math.min(...sizes);
        if (small >= merge) continue;
        // The smallest room first, and through it to its smallest neighbour.
        const score = small * 10000 + Math.max(...sizes);
        if (score < best) { best = score; pickDoor = { d, roots }; }
      }
      if (!pickDoor) break;
      const { d, roots } = pickDoor;
      g[d.s] = FLOOR;
      const root = roots[0];
      let total = 1;
      for (const r of roots) { total += size[r]; parent[r] = root; }
      size[root] = total;
      merged++;
    }
  }
  const rooms = new Set();
  for (let r = 0; r < size.length; r++) rooms.add(find(r));
  const floorCount = g.reduce((n, v) => n + (v !== WALL ? 1 : 0), 0);
  const biggest = Math.max(0, ...[...rooms].map((r) => size[r]));
  return { joined, dropped, merged, split, rooms: rooms.size, share: floorCount ? biggest / floorCount : 1 };
}

/* { floor, doors, rooms, patterns, joined, merged, split, dropped, tries, seed,
   cols, rows } or { error } when the example will not grow here. The deck
   is grown over at most GROW_MAX squares a side, from the top left. */
export function deckFromExample(example, { cols, rows, seed, merge } = {}) {
  const ex = readExample(example);
  if (!ex) return { error: 'That is not an example that can be grown from.' };
  const s = seed || newSeed();
  const W = Math.min(GROW_MAX, clampGrid(cols, 30)), H = Math.min(GROW_MAX, clampGrid(rows, 20));
  if (W < 7 || H < 7) return { error: 'The grid is too small to grow a deck on: 7 squares a side at least.' };
  /* Grown again, from the next attempt of the same seed, while one click
     would show more than FOG_SHARE of it: a ruin can come out so open that no
     neck is left to cut. The most divided of the tries if none is better. */
  const model = learnExample(ex);
  const mergeBelow = merge == null ? ex.merge : Math.max(0, Math.round(merge));
  let best = null;
  for (let from = 0; from < TRIES;) {
    const grown = growCells(ex, { cols: W, rows: H, seed: s, from, model });
    if (!grown.cells) break;
    const t = tidy(grown.cells, W, H, mergeBelow);
    if (!best || t.share < best.t.share) best = { g: grown.cells, t, tries: grown.tries };
    if (t.share <= FOG_SHARE) break;
    from = grown.tries;
  }
  if (!best) {
    return { error: `The example would not grow on this grid in ${TRIES} tries. Try another seed, or a larger, more varied example.`, patterns: model.patterns.length };
  }
  const { g, t } = best;
  const floor = {}, doors = {};
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = g[x + y * W];
    if (v === WALL) continue;
    floor[`${x},${y}`] = true;
    if (v === DOOR) doors[`${x},${y}`] = { kind: ex.doorKind, state: 'closed' };
  }
  return {
    floor, doors, rooms: t.rooms, patterns: model.patterns.length, joined: t.joined, merged: t.merged, split: t.split,
    dropped: t.dropped, tries: best.tries, share: t.share, seed: s, cols: W, rows: H, clipped: W < clampGrid(cols, 30) || H < clampGrid(rows, 20)
  };
}

// For the checks and for printing: a grid of cells as rows of '#.+'.
export const cellsToRows = (g, W, H) => Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => CH[g[x + y * W]]).join(''));
