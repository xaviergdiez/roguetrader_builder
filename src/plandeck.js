/* A DECK FROM A SKETCH PLAN (sketchplan.js): the rooms where they were drawn,
   the passages between them along the lines they were drawn on, doors where
   they meet, and what was marked, where it was marked.

   ROOMS go down first, each exactly as drawn, but never on or beside another:
   two rooms that touch would be one room to the fog, which floods the floor
   to the doors, so a square of wall is kept between them. In the Caverns
   layout each room is then worn into a cave (caverns.js), in the same place.

   PASSAGES are routed, not traced: a hand-drawn line wobbles, and a corridor
   walked square by square along it would zigzag. So each is found by A*
   from one room to the other, paying for every square it strays from the
   line, so it keeps to what was drawn, and in the Voidship decks layout for
   every turn, so it keeps straight. It may not touch a room it does not join,
   and it leaves and enters its own rooms straight on rather than running
   along their walls, so the room opens onto it at one square: its mouth. In
   the Caverns layout turning costs nothing and the rock costs a little more
   in some places than others, so tunnels wander.

   DOORS go in the mouths: a bulkhead in the decks, a narrow passage in the
   caves; a locked passage's far door sealed; an open one none at all.

   THE REST of the grid can be filled with rooms by the ordinary generator
   (mapgen.js's growDeck), joined to what was drawn.

   Seeded, like every deck: the same plan and seed always make the same deck.
   See plandeck.check.mjs. */

import { makeRng, growDeck, newSeed } from './mapgen.js';
import { roughen } from './caverns.js';
import { readMap, EMPTY_MAP, HAZARD_TYPES, MARKER_TYPES, MIN_GRID, MAX_GRID } from './battlemap.js';

const key = (x, y) => `${x},${y}`;
const pk = (k) => k.split(',').map(Number);
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const clampGrid = (v, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(MAX_GRID, Math.max(MIN_GRID, n)) : d; };

function boxCells([x, y, w, h]) {
  const out = [];
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) out.push(key(xx, yy));
  return out;
}

// A small binary heap, by cost.
class Heap {
  constructor() { this.a = []; }
  push(v) { const a = this.a; a.push(v); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top;
  }
  get size() { return this.a.length; }
}

/* How far every square is from the drawn line, up to `cap`. */
function nearLine(path, w, h, cap = 8) {
  const d = new Int8Array(w * h).fill(cap);
  const q = [];
  for (const [x, y] of path) if (x >= 0 && y >= 0 && x < w && y < h && d[y * w + x] !== 0) { d[y * w + x] = 0; q.push(y * w + x); }
  for (let i = 0; i < q.length; i++) {
    const p = q[i], x = p % w, y = (p - x) / w;
    if (d[p] + 1 >= cap) continue;
    for (const [dx, dy] of N4) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const pp = yy * w + xx;
      if (d[pp] > d[p] + 1) { d[pp] = d[p] + 1; q.push(pp); }
    }
  }
  return d;
}

/* A route from room A to room B (or to a square, `goalCell`), as squares
   outside both rooms, from A's mouth to B's. Null if there is none. */
function route({ w, h, owner, from, to, goalCell, path, cavern, rng, corridor }) {
  const A = new Set(from), B = to ? new Set(to) : null;
  const line = nearLine(path, w, h);
  const noise = cavern ? Array.from({ length: w * h }, () => rng()) : null;
  const ok = (x, y) => x >= 1 && y >= 1 && x < w - 1 && y < h - 1;
  const ownerAt = (x, y) => owner.get(key(x, y)) || null;
  const touchesOther = (x, y) => N4.some(([dx, dy]) => {
    const o = ownerAt(x + dx, y + dy);
    return o && !A.has(key(x + dx, y + dy)) && !(B && B.has(key(x + dx, y + dy)));
  });
  const besideA = (x, y) => N4.some(([dx, dy]) => A.has(key(x + dx, y + dy)));
  const besideB = (x, y) => B && N4.some(([dx, dy]) => B.has(key(x + dx, y + dy)));
  const goal = goalCell ? key(goalCell[0], goalCell[1]) : null;
  const best = new Map();
  const came = new Map();
  const heap = new Heap();
  // Start from A's squares facing out.
  for (const k of from) {
    const [x, y] = pk(k);
    for (let dir = 0; dir < 4; dir++) {
      const [dx, dy] = N4[dir];
      const nx = x + dx, ny = y + dy;
      const nk = key(nx, ny);
      if (!ok(nx, ny) || A.has(nk) || (ownerAt(nx, ny) && !(B && B.has(nk))) || touchesOther(nx, ny)) continue;
      const st = `${nk}|${dir}`;
      const c = 1 + line[ny * w + nx] * 0.8;
      if (c < (best.get(st) ?? Infinity)) { best.set(st, c); came.set(st, null); heap.push([c, nx, ny, dir, st]); }
    }
  }
  let end = null;
  let guard = 0;
  while (heap.size && guard++ < 400000) {
    const [c, x, y, dir, st] = heap.pop();
    if (c > (best.get(st) ?? Infinity)) continue;
    const k = key(x, y);
    if ((B && B.has(k)) || k === goal) { end = st; break; }
    for (let nd = 0; nd < 4; nd++) {
      const [dx, dy] = N4[nd];
      const nx = x + dx, ny = y + dy;
      if (!ok(nx, ny)) continue;
      const nk = key(nx, ny);
      if (A.has(nk)) continue;
      const intoB = B && B.has(nk);
      if (!intoB && (ownerAt(nx, ny) || touchesOther(nx, ny))) continue;
      // Leave A straight on and come to B straight on: a square beside a
      // room is a second mouth, which the fog would leak through.
      // The first square out of A is its mouth and was paid for at the start;
      // every later square beside A would be a second one. Beside B costs a
      // little, so the cheapest way in meets it at one square.
      const hug = intoB ? 0 : (besideA(nx, ny) ? 12 : 0) + (besideB(nx, ny) ? 3 : 0);
      let step = 1 + line[ny * w + nx] * 0.8 + hug;
      if (!cavern && nd !== dir) step += 1.5;
      if (cavern) step += noise[ny * w + nx] * 1.6;
      if (corridor.has(nk)) step -= 0.5;
      const nc = c + Math.max(0.3, step);
      const ns = `${nk}|${nd}`;
      if (nc < (best.get(ns) ?? Infinity)) { best.set(ns, nc); came.set(ns, st); heap.push([nc, nx, ny, nd, ns]); }
    }
  }
  if (!end) return null;
  const cells = [];
  for (let s = end; s; s = came.get(s)) cells.push(s.split('|')[0]);
  cells.reverse();
  // The squares outside both rooms; the last is in B (or the goal square).
  return cells.filter((k) => !(B && B.has(k)));
}

/* { floor, doors, markers, hazards, start, rooms, unplaced, seed, cols, rows } */
export function deckFromPlan(plan, { cols, rows, layout = 'decks', seed, fill = false } = {}) {
  const w = clampGrid(cols, 30), h = clampGrid(rows, 20);
  const s = seed || newSeed();
  const cavern = layout === 'caverns';
  const rng = makeRng(`${s}|plan`);
  const unplaced = [];
  const owner = new Map();
  const roomCells = {};
  const inBounds = (x, y) => x >= 1 && y >= 1 && x < w - 1 && y < h - 1;

  for (const r of plan.rooms) {
    let cells = (r.shape === 'blob' ? r.cells : boxCells(r.box)).filter((k) => {
      const [x, y] = pk(k);
      if (!inBounds(x, y) || owner.has(k)) return false;
      return !N4.some(([dx, dy]) => { const o = owner.get(key(x + dx, y + dy)); return o && o !== r.id; });
    });
    if (cavern) cells = roughen(cells, makeRng(`${s}|room|${r.id}`));
    if (cells.length < 2) { unplaced.push(`Room ${r.id} had no space left beside the others.`); continue; }
    roomCells[r.id] = cells;
    for (const k of cells) owner.set(k, r.id);
  }

  const floor = {};
  for (const cells of Object.values(roomCells)) for (const k of cells) floor[k] = true;
  const doors = {};
  const corridor = new Set();
  const doorKind = cavern ? 'passage' : 'bulkhead';
  const setDoor = (k, state) => { if (k && !doors[k]) doors[k] = { kind: doorKind, state }; };

  for (const l of plan.links) {
    const A = l.from && roomCells[l.from], B = l.to && roomCells[l.to];
    const lrng = makeRng(`${s}|link|${l.id}`);
    if (!A && !B) {
      // A corridor touching no room: laid along the line as drawn.
      for (const [x, y] of l.path) if (inBounds(x, y) && !owner.has(key(x, y))) { floor[key(x, y)] = true; corridor.add(key(x, y)); }
      continue;
    }
    const startRoom = A || B;
    const otherRoom = A && B ? B : null;
    // A dead end runs to where the line was drawn to.
    const endCell = otherRoom ? null : (A ? l.path[l.path.length - 1] : l.path[0]);
    const path = A ? l.path : [...l.path].reverse();
    const cells = route({ w, h, owner, from: startRoom, to: otherRoom, goalCell: endCell, path, cavern, rng: lrng, corridor });
    if (!cells) { unplaced.push(`The passage ${l.id} could not be routed between its rooms.`); continue; }
    for (const k of cells) { floor[k] = true; corridor.add(k); }
    if (l.kind === 'open' || !cells.length) continue;
    // The mouths: the first square out of the first room, the last before the second.
    setDoor(cells[0], 'closed');
    if (otherRoom && cells.length > 1) setDoor(cells[cells.length - 1], l.kind === 'locked' ? 'jammed' : 'closed');
    if (l.kind === 'locked' && (!otherRoom || cells.length === 1)) doors[cells[0]] = { kind: doorKind, state: 'jammed' };
  }
  if (cavern) for (const k of Object.keys(doors)) if (doors[k].state === 'closed') doors[k].state = 'open';

  let map = readMap({ ...EMPTY_MAP, cols: w, rows: h, floor, doors });
  if (fill) {
    const grown = growDeck(map, { cols: w, rows: h, style: cavern ? 'hulk' : 'decks', seed: s });
    map = grown.map;
  }

  // What was marked.
  const markers = {};
  const hazards = {};
  let start = null;
  const hazardIds = HAZARD_TYPES.map((x) => x.id);
  const markerIds = MARKER_TYPES.map((x) => x.id);
  const nearestIn = (cells, x, y) => {
    let best = null, d = Infinity;
    for (const k of cells) {
      if (map.doors[k] || markers[k]) continue;
      const [cx, cy] = pk(k);
      const dd = (cx - x) ** 2 + (cy - y) ** 2;
      if (dd < d) { d = dd; best = k; }
    }
    return best;
  };
  for (const r of plan.rooms) {
    const cells = roomCells[r.id];
    if (!cells) continue;
    const pts = cells.map(pk);
    const cx = pts.reduce((n, p) => n + p[0], 0) / pts.length, cy = pts.reduce((n, p) => n + p[1], 0) / pts.length;
    if (r.tags.includes('start') && !start) { const k = nearestIn(cells, cx, cy); if (k) { const [x, y] = pk(k); start = { x, y }; } }
    if (r.tags.includes('objective')) { const k = nearestIn(cells, cx, cy); if (k) markers[k] = { type: 'objective', label: 'Objective' }; }
    for (const hz of r.hazards) {
      if (!hazardIds.includes(hz)) { unplaced.push(`A hazard "${hz}" in ${r.id} is not one the map knows.`); continue; }
      // The middle third of the room, nearest its centre first.
      const around = [...cells].sort((a, b) => { const [ax, ay] = pk(a), [bx, by] = pk(b); return ((ax - cx) ** 2 + (ay - cy) ** 2) - ((bx - cx) ** 2 + (by - cy) ** 2); });
      for (const k of around.slice(0, Math.max(1, Math.round(cells.length / 3)))) if (!map.doors[k]) hazards[k] = hz;
    }
    for (const f of r.fixtures) {
      if (!markerIds.includes(f.type)) { unplaced.push(`A fixture "${f.type}" in ${r.id} is not one the map knows.`); continue; }
      const k = nearestIn(cells, f.at[0], f.at[1]);
      if (k) markers[k] = { type: f.type, label: f.confirmed === false ? '?' : '' };
    }
  }
  return {
    floor: map.floor, doors: map.doors, markers, hazards, start,
    rooms: Object.keys(roomCells).length, unplaced, seed: s, cols: w, rows: h
  };
}
