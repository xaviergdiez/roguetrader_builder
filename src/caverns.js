/* CAVERNS: natural caves, cut into caverns at their narrow necks.

   mapgen.js left caves out on purpose: the fog here reveals a room at a time,
   flooding the floor up to the doors, and an undivided cave is one room, so
   the first click would light all of it. Its note says caves wait until "the
   chokepoints are found and turned into doors". This finds them.

   1. THE CAVE grows by cellular automaton: a grid filled at random about
      45% rock, then smoothed (a square becomes rock with five or more rock
      neighbours, floor with fewer than four), which is the RogueBasin method.
      The pockets it leaves are joined to the largest by a tunnel a square
      wide, which is a neck of its own; pockets too small to matter go.

   2. THE HEARTS are the open middles of the cave: the squares farthest from
      any rock, one per open space, each kept clear of a bigger one nearby.

   3. THE FLOOD runs outward from the hearts, widest floor first, so two
      hearts' caverns meet where the cave is narrowest. That is a neck.

   4. A WIDE MEETING IS NOT A NECK. Two caverns that meet along a front as
      broad as the shallower of them is deep are one cavern with two middles
      and are merged, as is a cavern too small to be worth a click. Broad is
      measured against the caverns, not fixed: a gap of five squares between
      two great halls is a neck, between two crawlspaces it is not. And no
      cavern may grow past MAX_SHARE of the cave by merging: a hall that big
      would be most of the map in one fog click, so its widest meeting is
      narrowed to a passage like any neck.

   5. EACH NECK becomes one square with a door in it, a narrow passage, and
      the rest of the front is walled up, so the fog stops there like any
      doorway and the cavern beyond is its own place.

   Pure and seeded. See caverns.check.mjs. */

import { makeRng } from './mapgen.js';

const key = (x, y) => `${x},${y}`;
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/* A cave as a grid of booleans (true is floor), by cellular automaton. */
export function growCave(w, h, rng, { fill = 0.58, steps = 5 } = {}) {
  let g = [];
  for (let y = 0; y < h; y++) {
    g.push([]);
    for (let x = 0; x < w; x++) g[y].push(x > 0 && y > 0 && x < w - 1 && y < h - 1 && rng() >= fill);
  }
  const rockAround = (gr, x, y, r) => {
    let n = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (!dx && !dy) continue;
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h || !gr[yy][xx]) n++;
    }
    return n;
  };
  for (let s = 0; s < steps; s++) {
    const next = g.map((row) => row.slice());
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const r1 = rockAround(g, x, y, 1);
      // Early on, also open up wide solid areas, so no great slab of rock is left.
      const r2 = s < 3 ? rockAround(g, x, y, 2) : 99;
      next[y][x] = !(r1 >= 5 || r2 <= 2);
    }
    g = next;
  }
  return joinPockets(g, w, h, rng);
}

function components(g, w, h) {
  const seen = new Uint8Array(w * h);
  const out = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!g[y][x] || seen[y * w + x]) continue;
    const comp = [];
    const stack = [[x, y]];
    seen[y * w + x] = 1;
    while (stack.length) {
      const [cx, cy] = stack.pop();
      comp.push([cx, cy]);
      for (const [dx, dy] of N4) {
        const xx = cx + dx, yy = cy + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h || seen[yy * w + xx] || !g[yy][xx]) continue;
        seen[yy * w + xx] = 1;
        stack.push([xx, yy]);
      }
    }
    out.push(comp);
  }
  return out.sort((a, b) => b.length - a.length);
}

/* Every pocket big enough to stand in, joined to the largest cave by a tunnel
   one square wide, dug the shortest way through the rock (ties broken by the
   seed, so the tunnel wanders a little). Pockets smaller than MIN_POCKET are
   filled in. */
const MIN_POCKET = 16;
function joinPockets(g, w, h, rng) {
  const out = Array.from({ length: h }, () => new Array(w).fill(false));
  const comps = components(g, w, h);
  if (!comps.length) return out;
  const main = new Set(comps[0].map(([x, y]) => y * w + x));
  for (const [x, y] of comps[0]) out[y][x] = true;
  for (const comp of comps.slice(1)) {
    if (comp.length < MIN_POCKET) continue;
    for (const [x, y] of comp) out[y][x] = true;
    // Breadth first from the pocket to the nearest square of the main cave.
    const prev = new Int32Array(w * h).fill(-2);
    let q = comp.map(([x, y]) => y * w + x);
    for (const p of q) prev[p] = -1;
    let hit = -1;
    while (q.length && hit < 0) {
      const next = [];
      for (const p of q) {
        const x = p % w, y = (p - x) / w;
        const dirs = [...N4].sort(() => rng() - 0.5);
        for (const [dx, dy] of dirs) {
          const xx = x + dx, yy = y + dy;
          if (xx < 1 || yy < 1 || xx >= w - 1 || yy >= h - 1) continue;
          const pp = yy * w + xx;
          if (prev[pp] !== -2) continue;
          prev[pp] = p;
          if (main.has(pp)) { hit = pp; break; }
          next.push(pp);
        }
        if (hit >= 0) break;
      }
      q = next;
    }
    for (let p = hit; p >= 0; p = prev[p]) { out[Math.floor(p / w)][p % w] = true; main.add(p); }
    for (const [x, y] of comp) main.add(y * w + x);
  }
  return out;
}

// How far each floor square is from rock, counting diagonals as one step.
function distances(g, w, h) {
  const d = new Int16Array(w * h).fill(-1);
  const q = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!g[y][x]) { d[y * w + x] = 0; q.push(y * w + x); }
  for (let i = 0; i < q.length; i++) {
    const p = q[i], x = p % w, y = (p - x) / w;
    for (const [dx, dy] of N8) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const pp = yy * w + xx;
      if (d[pp] !== -1) continue;
      d[pp] = d[p] + 1;
      q.push(pp);
    }
  }
  return d;
}

/* The cave cut at its necks: { floor, doors, regions }. `g` is the grid of
   booleans; `rng` breaks ties so the same seed cuts the same way. */
export const MAX_SHARE = 0.4;
export const SPLIT_SHARE = 0.45;
export function cutNecks(g, w, h, { minRegion = 14, wideFront = 3, breadth = 1.1 } = {}) {
  const dist = distances(g, w, h);
  const floorIdx = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (g[y][x]) floorIdx.push(y * w + x);
  // Hearts: the deepest squares, each keeping a clear radius round it.
  const order = [...floorIdx].sort((a, b) => dist[b] - dist[a] || a - b);
  const hearts = [];
  for (const p of order) {
    if (dist[p] < 2) break;
    const x = p % w, y = (p - x) / w;
    const clear = Math.max(4, Math.round(dist[p] * 1.6));
    if (hearts.some((q) => Math.max(Math.abs(q.x - x), Math.abs(q.y - y)) < clear)) continue;
    hearts.push({ x, y, p });
  }
  if (!hearts.length && floorIdx.length) hearts.push({ x: floorIdx[0] % w, y: Math.floor(floorIdx[0] / w), p: floorIdx[0] });
  // The flood: widest floor first, by buckets of distance.
  const label = new Int32Array(w * h).fill(-1);
  const maxD = order.length ? dist[order[0]] : 0;
  const buckets = Array.from({ length: maxD + 1 }, () => []);
  hearts.forEach((hh, i) => { label[hh.p] = i; buckets[dist[hh.p]].push(hh.p); });
  for (let level = maxD; level >= 0; level--) {
    const b = buckets[level];
    for (let i = 0; i < b.length; i++) {
      const p = b[i], x = p % w, y = (p - x) / w;
      for (const [dx, dy] of N4) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h || !g[yy][xx]) continue;
        const pp = yy * w + xx;
        if (label[pp] !== -1) continue;
        label[pp] = label[p];
        // Never climb: a square deeper than this one waits in its own bucket
        // only if nothing reached it from its own heart first.
        buckets[Math.min(level, dist[pp])].push(pp);
      }
    }
  }
  // Merge: union-find over the caverns.
  const parent = hearts.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  // Which cavern a square is in: by its heart, merged; after the splitting
  // below, by the split.
  let regionOf = (p) => find(label[p]);
  const fronts = () => {
    const f = new Map();
    for (const p of floorIdx) {
      const x = p % w, y = (p - x) / w;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx >= w || yy >= h || !g[yy][xx]) continue;
        const a = regionOf(p), bb = regionOf(yy * w + xx);
        if (a === bb || a < 0 || bb < 0) continue;
        const k = a < bb ? `${a}|${bb}` : `${bb}|${a}`;
        if (!f.has(k)) f.set(k, []);
        f.get(k).push([p, yy * w + xx]);
      }
    }
    return f;
  };
  const sizes = () => { const s = new Map(); for (const p of floorIdx) { const r = regionOf(p); s.set(r, (s.get(r) || 0) + 1); } return s; };
  // How deep each cavern is: the deepest of its hearts.
  const depthOf = (r) => {
    let d = 0;
    hearts.forEach((hh, i) => { if (find(i) === r) d = Math.max(d, dist[hh.p]); });
    return d;
  };
  const cap = Math.max(minRegion * 2, floorIdx.length * MAX_SHARE);
  for (let pass = 0; pass < 4; pass++) {
    let merged = false;
    const f = fronts();
    let sz = sizes();
    for (const [k, pairs] of f) {
      const [a, bb] = k.split('|').map(Number);
      const ra = find(a), rb = find(bb);
      if (ra === rb) continue;
      const broad = Math.max(wideFront, breadth * Math.min(depthOf(ra), depthOf(rb)));
      if (pairs.length <= broad || (sz.get(ra) || 0) + (sz.get(rb) || 0) > cap) continue;
      parent[ra] = rb; merged = true;
      sz = sizes();
    }
    const s = sizes();
    for (const [r, n] of s) {
      if (n >= minRegion) continue;
      // A cavern too small to be worth a click joins the neighbour it meets most.
      let best = null, most = 0;
      for (const [k, pairs] of fronts()) {
        const [a, bb] = k.split('|').map(Number);
        if (find(a) !== r && find(bb) !== r) continue;
        if (pairs.length > most) { most = pairs.length; best = find(a) === r ? find(bb) : find(a); }
      }
      if (best != null) { parent[r] = best; merged = true; }
    }
    if (!merged) break;
  }
  /* A cavern still past SPLIT_SHARE of the cave (one heart can flood that
     much by itself) is split: flooded from its two farthest-apart squares at
     once, and where the halves meet is a neck like any other. */
  const region = new Int32Array(w * h).fill(-1);
  for (const p of floorIdx) region[p] = find(label[p]);
  regionOf = (p) => region[p];
  const walk = (cells, from) => {
    const inR = new Set(cells);
    const d = new Map([[from, 0]]);
    const q = [from];
    for (let i = 0; i < q.length; i++) {
      const p = q[i], x = p % w, y = (p - x) / w;
      for (const [dx, dy] of N4) {
        const pp = (y + dy) * w + (x + dx);
        if (inR.has(pp) && !d.has(pp)) { d.set(pp, d.get(p) + 1); q.push(pp); }
      }
    }
    return d;
  };
  let nextId = hearts.length;
  for (let round = 0; round < 4; round++) {
    const sz = sizes();
    let big = null, n = 0;
    for (const [r, c] of sz) if (c > n) { n = c; big = r; }
    if (big == null || n <= floorIdx.length * SPLIT_SHARE) break;
    const cells = floorIdx.filter((p) => region[p] === big);
    const far = (dm) => { let b = null, bd = -1; for (const [p, dd] of dm) if (dd > bd) { bd = dd; b = p; } return b; };
    const a = far(walk(cells, cells[0]));
    const da = walk(cells, a);
    const b = far(da);
    const db = walk(cells, b);
    for (const p of cells) if ((db.get(p) ?? Infinity) < (da.get(p) ?? Infinity)) region[p] = nextId;
    nextId++;
  }

  // Each remaining neck: one square with a door, the rest of its front walled.
  const floor = {};
  for (const p of floorIdx) floor[key(p % w, Math.floor(p / w))] = true;
  const doors = {};
  const isDoor = (x, y) => Boolean(doors[key(x, y)]);
  for (const [, pairs] of fronts()) {
    /* The door goes as near the middle of the front as it can without
       standing beside another door, on the side of the shallower square. A
       front with no door at all would be a leak, so failing that, the middle. */
    const midIx = Math.floor(pairs.length / 2);
    const byMiddle = pairs.map((pr, i) => [Math.abs(i - midIx), pr]).sort((a, b) => a[0] - b[0]).map(([, pr]) => pr);
    const sideOf = ([pa, pb]) => (dist[pa] <= dist[pb] ? pa : pb);
    const free = byMiddle.find((pr) => {
      const d = sideOf(pr), x = d % w, y = Math.floor(d / w);
      return ![[0, 0], ...N4].some(([dx, dy]) => isDoor(x + dx, y + dy));
    });
    const chosen = free || byMiddle[0];
    const door = sideOf(chosen);
    const partner = chosen[0] === door ? chosen[1] : chosen[0];
    const dx0 = door % w, dy0 = Math.floor(door / w);
    doors[key(dx0, dy0)] = { kind: 'passage', state: 'open' };
    /* Wall up every other contact on the front, so the door is the only way
       through: always on the far side from the door, so the door's own
       cavern is left whole, and never the square the door opens onto. */
    const doorSide = regionOf(door);
    for (const [a, bb] of pairs) {
      if (a === door || bb === door) continue;
      const far = regionOf(a) === doorSide ? bb : a;
      const near = far === a ? bb : a;
      const wall = far === partner ? near : far;
      if (wall === door) continue;
      delete floor[key(wall % w, Math.floor(wall / w))];
    }
  }
  // Walling can strand a square or two: keep the largest piece the doors join.
  let keep = new Set();
  const visited = new Set();
  for (const s0 of Object.keys(floor)) {
    if (visited.has(s0)) continue;
    const piece = new Set([s0]);
    const stack = [s0];
    visited.add(s0);
    while (stack.length) {
      const [x, y] = stack.pop().split(',').map(Number);
      for (const [dx, dy] of N4) {
        const k = key(x + dx, y + dy);
        if (floor[k] && !visited.has(k)) { visited.add(k); piece.add(k); stack.push(k); }
      }
    }
    if (piece.size > keep.size) keep = piece;
  }
  const out = {};
  for (const k of keep) out[k] = true;
  for (const k of Object.keys(doors)) if (!out[k]) delete doors[k];
  const regions = new Set(floorIdx.map((p) => region[p]).filter((r) => r >= 0)).size;
  return { floor: out, doors, regions };
}

/* A whole deck of caverns, as generateDeck returns a deck: { floor, doors,
   rooms, seed }. `rooms` are each cavern's bounds, for anything that dresses
   a deck room by room. A cave too small for the grid is grown again from the
   next seed, up to a few times. */
export function generateCaverns({ cols, rows, seed }) {
  const w = cols, h = rows;
  let best = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const rng = makeRng(`${seed}|cave|${attempt}`);
    const g = growCave(w, h, rng);
    const area = g.reduce((n, row) => n + row.filter(Boolean).length, 0);
    if (!best || area > best.area) best = { g, area };
    if (area >= w * h * 0.3) break;
  }
  // A grid too small to grow a cave in is one chamber worn out of its middle.
  if (best.area < 8) {
    const inner = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) inner.push(key(x, y));
    const cells = inner.length >= 9 ? roughen(inner, makeRng(`${seed}|small`)) : inner;
    const floor = Object.fromEntries((cells.length ? cells : [key(Math.floor(w / 2), Math.floor(h / 2))]).map((k) => [k, true]));
    return { floor, doors: {}, rooms: roomsOf(floor, {}, w, h), regions: 1 };
  }
  const cut = cutNecks(best.g, w, h);
  return { floor: cut.floor, doors: cut.doors, rooms: roomsOf(cut.floor, cut.doors, w, h), regions: cut.regions };
}

/* Each cavern as a room: the open square round its deepest point, all floor,
   which is where anything dressing a deck room by room should go, and whose
   middle is always a square someone can stand on (a cavern's own bounds would
   not do: the middle of a crescent is rock). */
function roomsOf(floor, doors, w, h) {
  const grid = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => Boolean(floor[key(x, y)])));
  const dist = distances(grid, w, h);
  const seen = new Set();
  const out = [];
  for (const k of Object.keys(floor)) {
    if (seen.has(k) || doors[k]) continue;
    const stack = [k];
    seen.add(k);
    let deep = null;
    while (stack.length) {
      const c = stack.pop();
      const [x, y] = c.split(',').map(Number);
      if (!deep || dist[y * w + x] > deep.d) deep = { x, y, d: dist[y * w + x] };
      for (const [dx, dy] of N4) {
        const kk = key(x + dx, y + dy);
        if (floor[kk] && !doors[kk] && !seen.has(kk)) { seen.add(kk); stack.push(kk); }
      }
    }
    const r = Math.max(0, deep.d - 1);
    out.push({ x0: deep.x - r, y0: deep.y - r, x1: deep.x + r, y1: deep.y + r });
  }
  return out;
}

/* A drawn room worn into a cave: its edge eaten away at random and smoothed,
   keeping the part round its middle, never less than most of it. Used by the
   sketch's Caverns layout, so a drawn compartment becomes a chamber of rock
   in the same place. `cells` is the room's squares. */
export function roughen(cells, rng) {
  const set = new Set(cells);
  const pts = cells.map((k) => k.split(',').map(Number));
  if (pts.length < 9) return cells;
  const edge = (x, y) => N4.some(([dx, dy]) => !set.has(key(x + dx, y + dy)));
  let cur = new Set(cells);
  // Eat at the edge, twice inward.
  for (let ring = 0; ring < 2; ring++) {
    const next = new Set(cur);
    for (const [x, y] of pts) {
      const k = key(x, y);
      if (!cur.has(k)) continue;
      const atEdge = N4.some(([dx, dy]) => !cur.has(key(x + dx, y + dy)));
      if (atEdge && rng() < (ring === 0 ? 0.5 : 0.3)) next.delete(k);
    }
    cur = next;
  }
  // Smooth: a square with mostly rock round it goes, a gap with mostly floor fills.
  for (let s = 0; s < 2; s++) {
    const next = new Set(cur);
    for (const [x, y] of pts) {
      const k = key(x, y);
      const n = N8.filter(([dx, dy]) => cur.has(key(x + dx, y + dy))).length;
      if (cur.has(k) && n <= 2) next.delete(k);
      else if (!cur.has(k) && n >= 5 && !edge(x, y)) next.add(k);
    }
    cur = next;
  }
  // The part joined to the middle, and never less than 55% of the room.
  const cx = pts.reduce((n, p) => n + p[0], 0) / pts.length, cy = pts.reduce((n, p) => n + p[1], 0) / pts.length;
  let seed = null, d = Infinity;
  for (const k of cur) { const [x, y] = k.split(',').map(Number); const dd = (x - cx) ** 2 + (y - cy) ** 2; if (dd < d) { d = dd; seed = k; } }
  if (!seed) return cells;
  const keep = new Set([seed]);
  const stack = [seed];
  while (stack.length) {
    const [x, y] = stack.pop().split(',').map(Number);
    for (const [dx, dy] of N4) {
      const kk = key(x + dx, y + dy);
      if (cur.has(kk) && !keep.has(kk)) { keep.add(kk); stack.push(kk); }
    }
  }
  return keep.size >= cells.length * 0.55 ? [...keep] : cells;
}
