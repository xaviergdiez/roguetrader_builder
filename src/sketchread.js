/* READING A SKETCH: strokes drawn with the three pens into a sketch plan
   (sketchplan.js). Because the GM chose the pen, nothing here guesses what a
   stroke is: only what shape a room is, which rooms a passage joins, and what
   a mark lands on.

   ROOMS. A room stroke is a loop, closed whether or not it quite met itself.
   How much of its own bounds it fills says what it is: a rectangle drawn by
   hand fills nearly all of it, an oval about 0.79 of it. So a loop filling
   BOX_FILL or more is a box, a compartment the size of its bounds; anything
   rounder is a blob, a chamber of exactly the squares inside the line.

   PASSAGES. A passage stroke joins the room each of its ends is in, or the
   nearest within reach of it; its squares are the ones the line was drawn
   through, which the generator follows. An end in no room is a dead end.

   MARKS. A mark lands on the room it is in, or, a lock, on the passage it is
   drawn across. A mark that lands on nothing is said so in `unclear`.

   Pure, and the same strokes always read the same: see sketchread.check.mjs. */

import { readPlan } from './sketchplan.js';

export const BOX_FILL = 0.84;
const REACH = 1.6;   // how far from a room a passage end or a mark may fall and still be in it

function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

function inside(pts, x, y) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-9) + xi) hit = !hit;
  }
  return hit;
}

// The squares a line is drawn through, in order, each sharing a side with the
// one before it, so a corridor walked along them never cuts a corner.
export function cellsAlong(pts) {
  const out = [];
  const seen = new Set();
  const add = (x, y) => {
    const k = `${x},${y}`;
    if (seen.has(k)) return;
    const last = out[out.length - 1];
    if (last && Math.abs(last[0] - x) === 1 && Math.abs(last[1] - y) === 1) {
      const kk = `${x},${last[1]}`;
      if (!seen.has(kk)) { seen.add(kk); out.push([x, last[1]]); }
    }
    seen.add(k);
    out.push([x, y]);
  };
  if (pts.length === 1) { add(Math.floor(pts[0][0]), Math.floor(pts[0][1])); return out; }
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.25));
    for (let s = 0; s <= steps; s++) add(Math.floor(ax + ((bx - ax) * s) / steps), Math.floor(ay + ((by - ay) * s) / steps));
  }
  return out;
}

const clampBox = (x0, y0, x1, y1, cols, rows) => {
  const cx0 = Math.max(0, Math.min(cols - 1, x0)), cy0 = Math.max(0, Math.min(rows - 1, y0));
  const cx1 = Math.max(cx0, Math.min(cols - 1, x1)), cy1 = Math.max(cy0, Math.min(rows - 1, y1));
  return [cx0, cy0, cx1 - cx0 + 1, cy1 - cy0 + 1];
};

/* A room's shape from a loop, or a reason it is not one. */
export function roomFromLoop(pts, { cols = 500, rows = 500 } = {}) {
  if (!Array.isArray(pts) || pts.length < 3) return { error: 'a room needs a loop, not a dot or a line' };
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
  const bw = maxx - minx, bh = maxy - miny;
  if (bw < 1.5 || bh < 1.5) return { error: 'a room smaller than two squares across' };
  const fill = polyArea(pts) / (bw * bh);
  if (fill >= BOX_FILL) {
    const box = clampBox(Math.round(minx), Math.round(miny), Math.round(maxx) - 1, Math.round(maxy) - 1, cols, rows);
    return { shape: 'box', box, fill };
  }
  const cells = [];
  for (let y = Math.floor(miny); y <= Math.ceil(maxy); y++) {
    for (let x = Math.floor(minx); x <= Math.ceil(maxx); x++) {
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      if (inside(pts, x + 0.5, y + 0.5)) cells.push(`${x},${y}`);
    }
  }
  if (cells.length < 4) return { error: 'a room too small to hold anyone' };
  const box = clampBox(Math.floor(minx), Math.floor(miny), Math.ceil(maxx) - 1, Math.ceil(maxy) - 1, cols, rows);
  return { shape: 'blob', box, cells, fill };
}

const roomHas = (r, x, y) => (r.shape === 'blob'
  ? r.cells.includes(`${Math.floor(x)},${Math.floor(y)}`)
  : x >= r.box[0] && x < r.box[0] + r.box[2] && y >= r.box[1] && y < r.box[1] + r.box[3]);
const roomGap = (r, x, y) => {
  if (r.shape === 'blob') {
    let best = Infinity;
    for (const k of r.cells) {
      const [cx, cy] = k.split(',').map(Number);
      best = Math.min(best, Math.hypot(Math.max(cx - x, 0, x - cx - 1), Math.max(cy - y, 0, y - cy - 1)));
    }
    return best;
  }
  const [bx, by, bw, bh] = r.box;
  return Math.hypot(Math.max(bx - x, 0, x - (bx + bw)), Math.max(by - y, 0, y - (by + bh)));
};
// The room a point is in, or the nearest within reach of it.
function roomNear(rooms, x, y) {
  const hit = rooms.find((r) => roomHas(r, x, y));
  if (hit) return hit;
  let best = null, d = REACH;
  for (const r of rooms) { const g = roomGap(r, x, y); if (g <= d) { d = g; best = r; } }
  return best;
}

const centroid = (pts) => [pts.reduce((n, p) => n + p[0], 0) / pts.length, pts.reduce((n, p) => n + p[1], 0) / pts.length];
const MARK_NAME = { start: 'a start mark', objective: 'an objective mark', lock: 'a lock', hazard: 'a hazard mark', fixture: 'a fixture' };

export function planFromStrokes(strokes, { cols = 500, rows = 500 } = {}) {
  const rooms = [];
  const links = [];
  const unclear = [];
  const list = Array.isArray(strokes) ? strokes : [];
  for (const s of list.filter((x) => x.pen === 'room')) {
    const r = roomFromLoop(s.pts, { cols, rows });
    if (r.error) { unclear.push(`A room stroke was left out: ${r.error}.`); continue; }
    rooms.push({ id: `r${rooms.length + 1}`, stroke: s.id, shape: r.shape, box: r.box, cells: r.cells || [], tags: [], hazards: [], fixtures: [] });
  }
  for (const s of list.filter((x) => x.pen === 'passage')) {
    if (s.pts.length < 2) { unclear.push('A passage was only a dot, and was left out.'); continue; }
    const a = roomNear(rooms, s.pts[0][0], s.pts[0][1]);
    const b = roomNear(rooms, s.pts[s.pts.length - 1][0], s.pts[s.pts.length - 1][1]);
    if (a && b && a === b) { unclear.push(`A passage leaves room ${a.id} and comes back to it, and was left out.`); continue; }
    if (!a && !b) unclear.push('A passage touches no room at either end: drawn as a corridor on its own.');
    else if (!a || !b) unclear.push(`A passage from room ${(a || b).id} ends in no room: a dead end.`);
    links.push({ id: `l${links.length + 1}`, stroke: s.id, from: a ? a.id : null, to: b ? b.id : null, kind: 'door', path: cellsAlong(s.pts) });
  }
  for (const s of list.filter((x) => x.pen === 'mark')) {
    const [cx, cy] = centroid(s.pts);
    if (s.mark === 'lock') {
      // The passage the mark is drawn across: the one passing nearest it.
      let best = null, d = 1.5;
      for (const l of links) {
        for (const [px, py] of l.path) {
          for (const [mx, my] of s.pts) {
            const g = Math.hypot(px + 0.5 - mx, py + 0.5 - my);
            if (g < d) { d = g; best = l; }
          }
        }
      }
      if (best) best.kind = 'locked';
      else unclear.push('A lock is drawn across no passage, and was left out.');
      continue;
    }
    const r = roomNear(rooms, cx, cy);
    if (!r) { unclear.push(`${MARK_NAME[s.mark] || 'A mark'} touches no room, and was left out.`.replace(/^./, (c) => c.toUpperCase())); continue; }
    if (s.mark === 'start' || s.mark === 'objective') {
      if (!r.tags.includes(s.mark)) r.tags.push(s.mark);
      if (s.mark === 'start' && rooms.filter((x) => x.tags.includes('start')).length > 1) {
        unclear.push('More than one start is marked: the party starts in the first.');
      }
    } else if (s.mark === 'hazard') {
      const h = s.detail || 'fire';
      if (!r.hazards.includes(h)) r.hazards.push(h);
    } else if (s.mark === 'fixture') {
      r.fixtures.push({ type: s.detail || 'cogitator', at: [Math.floor(cx), Math.floor(cy)], confirmed: true });
    }
  }
  return { ...readPlan({ rooms, links, unclear }), strokesOf: Object.fromEntries([...rooms, ...links].map((x) => [x.id, x.stroke])) };
}

/* The plan in a line, for the GM to check before generating. */
export function describePlan(plan) {
  const rooms = plan.rooms.length;
  if (!rooms && !plan.links.length) return 'Nothing drawn yet.';
  const boxes = plan.rooms.filter((r) => r.shape === 'box').length;
  const parts = [`${rooms} room${rooms === 1 ? '' : 's'}${rooms ? ` (${boxes} compartment${boxes === 1 ? '' : 's'}, ${rooms - boxes} chamber${rooms - boxes === 1 ? '' : 's'})` : ''}`];
  const n = plan.links.length;
  parts.push(`${n} passage${n === 1 ? '' : 's'}`);
  const locked = plan.links.filter((l) => l.kind === 'locked').length;
  if (locked) parts.push(`${locked} locked`);
  const start = plan.rooms.find((r) => r.tags.includes('start'));
  if (start) parts.push(`the start in ${start.id}`);
  const obj = plan.rooms.filter((r) => r.tags.includes('objective'));
  if (obj.length) parts.push(`${obj.length === 1 ? 'the objective' : `${obj.length} objectives`} in ${obj.map((r) => r.id).join(', ')}`);
  return parts.join(', ') + '.';
}
