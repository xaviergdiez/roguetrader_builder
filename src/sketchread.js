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
   drawn across; a fixture in no room stands in the corridor where it was
   drawn. A mark that lands on nothing is said so in `unclear`.

   A PICTURE READ (lib/sketchprompt.js's reading, in fractions of the
   picture) becomes strokes too, below: the rooms as loops, the links as
   passages, the tags and fixtures as marks, laid where the picture lies on
   the grid. So what the vision model read is corrected with the same pens,
   and read by the same reader, as anything the GM drew.

   Pure, and the same strokes always read the same: see sketchplan.check.mjs. */

import { readPlan, newStrokeId, MAX_STROKES } from './sketchplan.js';

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
  const fixtures = [];
  const unclear = [];
  const list = Array.isArray(strokes) ? strokes : [];
  for (const s of list.filter((x) => x.pen === 'room')) {
    const r = roomFromLoop(s.pts, { cols, rows });
    if (r.error) { unclear.push(`A room stroke was left out: ${r.error}.`); continue; }
    rooms.push({ id: `r${rooms.length + 1}`, ...(s.name ? { name: s.name } : {}), stroke: s.id, shape: r.shape, box: r.box, cells: r.cells || [], tags: [], hazards: [], fixtures: [] });
  }
  for (const s of list.filter((x) => x.pen === 'passage')) {
    if (s.pts.length < 2) { unclear.push('A passage was only a dot, and was left out.'); continue; }
    const a = roomNear(rooms, s.pts[0][0], s.pts[0][1]);
    const b = roomNear(rooms, s.pts[s.pts.length - 1][0], s.pts[s.pts.length - 1][1]);
    if (a && b && a === b) { unclear.push(`A passage leaves room ${a.id} and comes back to it, and was left out.`); continue; }
    if (!a && !b) unclear.push('A passage touches no room at either end: drawn as a corridor on its own.');
    else if (!a || !b) unclear.push(`A passage from room ${(a || b).id} ends in no room: a dead end.`);
    links.push({ id: `l${links.length + 1}`, stroke: s.id, from: a ? a.id : null, to: b ? b.id : null, kind: s.detail === 'open' ? 'open' : 'door', path: cellsAlong(s.pts) });
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
    if (!r && s.mark === 'fixture') { fixtures.push({ type: s.detail || 'cogitator', at: [Math.floor(cx), Math.floor(cy)], confirmed: !s.unsure }); continue; }
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
      r.fixtures.push({ type: s.detail || 'cogitator', at: [Math.floor(cx), Math.floor(cy)], confirmed: !s.unsure });
    }
  }
  return { ...readPlan({ rooms, links, fixtures, unclear }), strokesOf: Object.fromEntries([...rooms, ...links].map((x) => [x.id, x.stroke])) };
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
  const open = plan.links.filter((l) => l.kind === 'open').length;
  if (open) parts.push(`${open} open`);
  const named = (r) => r.name || r.id;
  const start = plan.rooms.find((r) => r.tags.includes('start'));
  if (start) parts.push(`the start in ${named(start)}`);
  const obj = plan.rooms.filter((r) => r.tags.includes('objective'));
  if (obj.length) parts.push(`${obj.length === 1 ? 'the objective' : `${obj.length} objectives`} in ${obj.map(named).join(', ')}`);
  return parts.join(', ') + '.';
}

/* ---------------------------- a picture read ---------------------------- */

/* Where a picture lies on the grid: its top-left corner in squares and how
   many squares across it is. Its height follows from its shape (`aspect`,
   width over height). */
const toSquares = (place, aspect) => ([py, px]) => [
  place.x + (px / 1000) * place.across,
  place.y + (py / 1000) * (place.across / aspect)
];
const r2 = (v) => Math.round(v * 100) / 100;

/* A picture laid to fill the grid inside a square of margin: all of it, or,
   given a reading, the part with something drawn on it. */
export function placePicture(aspect, { cols, rows }, reading = null) {
  let y0 = 0, x0 = 0, y1 = 1000, x1 = 1000;
  if (reading) {
    const ys = [], xs = [];
    for (const r of reading.rooms) { ys.push(r.box[0], r.box[2]); xs.push(r.box[1], r.box[3]); }
    for (const l of reading.links) for (const [py, px] of l.via) { ys.push(py); xs.push(px); }
    for (const f of reading.fixtures || []) { ys.push(f.at[0]); xs.push(f.at[1]); }
    if (ys.length) {
      const pad = 25;
      y0 = Math.max(0, Math.min(...ys) - pad); y1 = Math.min(1000, Math.max(...ys) + pad);
      x0 = Math.max(0, Math.min(...xs) - pad); x1 = Math.min(1000, Math.max(...xs) + pad);
    }
  }
  const across = Math.min((cols - 2) / ((x1 - x0) / 1000), (rows - 2) / ((y1 - y0) / 1000 / aspect));
  return { x: r2(1 - (x0 / 1000) * across), y: r2(1 - (y0 / 1000) * (across / aspect)), across: r2(across) };
}

/* Strokes laid for one place of the picture, moved to another with it. */
export function moveStrokes(strokes, from, to) {
  const k = to.across / from.across;
  return strokes.map((st) => ({ ...st, pts: st.pts.map(([x, y]) => [r2(to.x + (x - from.x) * k), r2(to.y + (y - from.y) * k)]) }));
}

// A point inside a loop, as near its middle as there is one: the middle of a
// crescent is outside it.
function insidePoint(pts) {
  const [cx, cy] = centroid(pts);
  if (inside(pts, cx, cy)) return [cx, cy];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  let best = null, d = Infinity;
  for (let y = Math.min(...ys); y <= Math.max(...ys); y += 0.25) {
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.25) {
      const g = (x - cx) ** 2 + (y - cy) ** 2;
      if (g < d && inside(pts, x, y)) { d = g; best = [x, y]; }
    }
  }
  return best || [cx, cy];
}

// The middle of a line by its length, and which way it runs there.
function midway(pts) {
  const seg = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); seg.push(l); total += l; }
  let left = total / 2;
  for (let i = 0; i < seg.length; i++) {
    if (left <= seg[i] || i === seg.length - 1) {
      const t = seg[i] ? Math.min(1, left / seg[i]) : 0;
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const len = seg[i] || 1;
      return { at: [ax + (bx - ax) * t, ay + (by - ay) * t], dir: [(bx - ax) / len, (by - ay) / len] };
    }
    left -= seg[i];
  }
  return { at: pts[0], dir: [1, 0] };
}

/* A reading as strokes: { strokes, notes }. `notes` are what the reader was
   not sure of and what was written beside the rooms, for the GM to see. */
export function strokesFromReading(reading, place, aspect) {
  const at = toSquares(place, aspect);
  const strokes = [];
  const notes = [...reading.unclear];
  const mid = {};
  const nameOf = {};
  const mark = (kind, pt, extra = {}) => strokes.push({ id: newStrokeId(), pen: 'mark', mark: kind, detail: null, pts: [pt.map(r2)], ...extra });
  for (const r of reading.rooms) {
    let pts;
    if (r.shape === 'polygon') pts = r.points.map(at);
    else {
      const [x0, y0] = at([r.box[0], r.box[1]]), [x1, y1] = at([r.box[2], r.box[3]]);
      pts = r.shape === 'ellipse'
        ? Array.from({ length: 24 }, (_, i) => [(x0 + x1) / 2 + ((x1 - x0) / 2) * Math.cos((i / 24) * Math.PI * 2), (y0 + y1) / 2 + ((y1 - y0) / 2) * Math.sin((i / 24) * Math.PI * 2)])
        : [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    }
    pts = pts.map(([x, y]) => [r2(x), r2(y)]);
    nameOf[r.id] = r.name || r.id;
    strokes.push({ id: newStrokeId(), pen: 'room', mark: null, detail: null, name: nameOf[r.id], pts });
    const p = insidePoint(pts);
    mid[r.id] = p;
    if (r.tags.includes('start')) mark('start', p);
    if (r.tags.includes('objective')) mark('objective', [p[0] + 0.9, p[1]]);
    r.hazards.forEach((hz, i) => mark('hazard', [p[0] - 0.9 * (i + 1), p[1] + 0.6], { detail: hz }));
    for (const f of r.fixtures) mark('fixture', at(f.at), { detail: f.type, ...(f.confirmed ? {} : { unsure: true }) });
    // What was written beside it, unless it only says what is marked already.
    if (r.note && !/^\W*(start|entry|in|x|obj(ective)?|target)\W*(\W+(start|entry|x|obj(ective)?|target)\W*)*$/i.test(r.note)) notes.push(`${nameOf[r.id]}: ${r.note}`);
  }
  for (const f of reading.fixtures || []) mark('fixture', at(f.at), { detail: f.type, ...(f.confirmed ? {} : { unsure: true }) });
  for (const l of reading.links) {
    const a = mid[l.from], b = mid[l.to];
    if (!a || !b) continue;
    if (l.kind === 'crawl') {
      // A crawlway is no corridor: a vent at each end of it.
      mark('fixture', [a[0], a[1] - 0.8], { detail: 'vent' });
      mark('fixture', [b[0], b[1] - 0.8], { detail: 'vent' });
      notes.push(`The crawlway from ${nameOf[l.from]} to ${nameOf[l.to]} is a vent in each.`);
      continue;
    }
    const pts = [a, ...l.via.map(at), b].map(([x, y]) => [r2(x), r2(y)]);
    strokes.push({ id: newStrokeId(), pen: 'passage', mark: null, detail: l.kind === 'open' ? 'open' : null, pts });
    if (l.kind === 'locked') {
      // Drawn across the middle of the passage, as the GM would draw it.
      const { at: [mx, my], dir: [dx, dy] } = midway(pts);
      mark('lock', [mx - dy * 0.6, my + dx * 0.6], { pts: [[r2(mx - dy * 0.6), r2(my + dx * 0.6)], [r2(mx + dy * 0.6), r2(my - dx * 0.6)]] });
    }
  }
  // Rooms, then passages, then marks: if there are too many, marks go first.
  const order = { room: 0, passage: 1, mark: 2 };
  strokes.sort((p, q) => order[p.pen] - order[q.pen]);
  if (strokes.length > MAX_STROKES) notes.push(`Only the first ${MAX_STROKES} strokes of what was read are kept.`);
  return { strokes: strokes.slice(0, MAX_STROKES), notes: notes.slice(0, 30) };
}
