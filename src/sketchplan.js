/* SKETCHES: the GM showing the battle map what they mean instead of rolling
   seeds until it looks right. Every way in (strokes drawn on the map now; a
   photographed paper sketch or a reference image later) is read into one
   small SKETCH PLAN, and the generator (plandeck.js) turns the plan into a
   deck the room-by-room fog, the doors and Publish for play already
   understand.

   THE SKETCH is what the GM drew, kept on the deck beside its seed so the deck
   can always be made again:

     { strokes, layout, fill, seed, notes, example }

   A stroke is { id, pen, mark, detail, pts }: the pen it was drawn with
   (room, passage or mark), for a mark which one (start, objective, lock,
   hazard, fixture) and its detail (which hazard, which fixture; for a
   passage, 'open' when it has no doors), and its points in squares,
   fractions and all. A room may have a `name` and a mark may be `unsure`,
   both read from a photograph (strokesFromReading). The pens are the GM's
   choice, so the reader never has to guess what a stroke is meant to be.

   `notes` are what the photograph's reader said it could not be sure of,
   kept to show the GM. `example` is the small painted example a deck is
   grown from (wfc.js), which makes no plan: { rows, doorKind, merge, name }.

   THE PLAN is what the strokes say, read by sketchread.js:

     rooms  [{ id, name, shape: 'box' | 'blob', box: [x, y, w, h], cells, tags,
              hazards, fixtures }]
     links  [{ id, from, to, kind: 'door' | 'locked' | 'open', path }]
     fixtures [{ type, at, confirmed }]: those in no room, in a corridor
     unclear [what could not be read, said in words]

   A box is a compartment, a blob a chamber or a cavern; `cells` are a blob's
   squares. `path` is the squares a passage was drawn through, which the
   generator follows. Nothing uncertain is dropped silently or made definite
   silently: it is placed and listed in `unclear`.

   Pure, and read the way readMap reads a deck: anything absent is defaulted,
   nothing is trusted. See sketchplan.check.mjs. */

export const PENS = [
  { id: 'room', name: 'Room', note: 'Draw a loop. A loop that fills its own bounds is a compartment; a rounder one is a chamber.' },
  { id: 'passage', name: 'Passage', note: 'Draw a line from one room to another.' },
  { id: 'mark', name: 'Mark', note: 'Touch a room or a passage to mark it.' },
  { id: 'erase', name: 'Eraser', note: 'Click a stroke to take it off.' }
];
export const MARKS = [
  { id: 'start', name: 'Start', note: 'Where the party comes in: the starting room.' },
  { id: 'objective', name: 'Objective', note: 'What they came for: an objective marker in the room.' },
  { id: 'lock', name: 'Lock', note: 'Drawn across a passage: its door is sealed.' },
  { id: 'hazard', name: 'Hazard', note: 'The room is on fire, or full of gas, or worse.' },
  { id: 'fixture', name: 'Fixture', note: 'A terminal, a turret, a shrine or a vent, where you touch.' }
];
export const LAYOUTS = [
  { id: 'decks', name: 'Voidship decks', note: 'Compartments as drawn, corridors that keep straight, bulkheads at their mouths.' },
  { id: 'caverns', name: 'Caverns', note: 'The same rooms worn into caves, tunnels that wander, narrow passages where they meet.' }
];
export const LINK_KINDS = ['door', 'locked', 'open'];

export const MAX_STROKES = 150;
export const MAX_POINTS = 300;
export const MAX_ROOMS = 60;
export const MAX_LINKS = 120;
const LIMIT = 520;   // a little past the biggest grid, so a stroke off its edge still reads

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const round2 = (v) => Math.round(v * 100) / 100;
const word = (v, list) => (list.some((x) => x.id === v) ? v : null);
const ID = /^[a-z][a-z0-9]{1,40}$/;
const KEY = /^-?\d{1,4},-?\d{1,4}$/;
const DETAIL = /^[a-z_]{1,24}$/;
const text = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');
export const PASSAGE_KINDS = [
  { id: 'door', name: 'With doors', note: 'A door where it meets each room.' },
  { id: 'open', name: 'Open', note: 'No doors: the rooms it joins open into it.' }
];

let seq = 0;
export const newStrokeId = () => 's' + Date.now().toString(36) + (seq++).toString(36);

export function readStroke(v) {
  if (!v || typeof v !== 'object') return null;
  const pen = word(v.pen, PENS);
  if (!pen || pen === 'erase') return null;
  const pts = [];
  for (const p of Array.isArray(v.pts) ? v.pts : []) {
    if (!Array.isArray(p)) continue;
    const x = num(p[0]), y = num(p[1]);
    if (x == null || y == null || Math.abs(x) > LIMIT || Math.abs(y) > LIMIT) continue;
    pts.push([round2(x), round2(y)]);
    if (pts.length >= MAX_POINTS) break;
  }
  if (!pts.length) return null;
  const name = pen === 'room' ? text(v.name, 40) : '';
  return {
    id: typeof v.id === 'string' && ID.test(v.id) ? v.id : newStrokeId(),
    pen,
    mark: pen === 'mark' ? (word(v.mark, MARKS) || 'objective') : null,
    detail: pen === 'mark' && typeof v.detail === 'string' && DETAIL.test(v.detail) ? v.detail
      : pen === 'passage' && v.detail === 'open' ? 'open' : null,
    ...(name ? { name } : {}),
    ...(pen === 'mark' && v.unsure === true ? { unsure: true } : {}),
    pts
  };
}

/* The example a deck is grown from (wfc.js, which narrows the door kind to
   one the map knows): rows of '#' wall, '.' floor and '+' door, all one
   length, 4 to 26 a side, with some floor. Anything else is no example. */
export const EXAMPLE_MIN = 4;
export const EXAMPLE_MAX = 26;
export const MERGE_DEFAULT = 6;
export function readExample(v) {
  if (!v || typeof v !== 'object' || !Array.isArray(v.rows)) return null;
  const rows = v.rows.filter((r) => typeof r === 'string');
  if (rows.length !== v.rows.length || rows.length < EXAMPLE_MIN || rows.length > EXAMPLE_MAX) return null;
  const w = rows[0].length;
  if (w < EXAMPLE_MIN || w > EXAMPLE_MAX || rows.some((r) => r.length !== w || /[^#.+]/.test(r))) return null;
  if (!rows.some((r) => r.includes('.'))) return null;
  const merge = Math.round(Number(v.merge));
  return {
    rows,
    doorKind: typeof v.doorKind === 'string' && DETAIL.test(v.doorKind) ? v.doorKind : 'hatch',
    merge: Number.isFinite(merge) ? Math.min(40, Math.max(0, merge)) : MERGE_DEFAULT,
    name: text(v.name, 40)
  };
}

/* The sketch on a deck, or null when there is none worth keeping. */
export function readSketch(v) {
  if (!v || typeof v !== 'object') return null;
  const strokes = [];
  for (const s of Array.isArray(v.strokes) ? v.strokes : []) {
    const r = readStroke(s);
    if (r) strokes.push(r);
    if (strokes.length >= MAX_STROKES) break;
  }
  const plan = v.plan ? readPlan(v.plan) : null;
  const example = readExample(v.example);
  if (!strokes.length && !(plan && plan.rooms.length) && !example) return null;
  return {
    strokes,
    // A plan that did not come from strokes (an import) is kept as it was
    // read; one from strokes is read again from them.
    plan: strokes.length ? null : plan,
    layout: word(v.layout, LAYOUTS) || 'decks',
    fill: v.fill === true,
    seed: typeof v.seed === 'string' ? v.seed.slice(0, 40) : '',
    notes: strokes.length ? (Array.isArray(v.notes) ? v.notes : []).map((nt) => text(nt, 200)).filter(Boolean).slice(0, 30) : [],
    example
  };
}

const readFixtures = (list, max) => (Array.isArray(list) ? list : []).filter((f) => f && typeof f.type === 'string' && DETAIL.test(f.type)
  && Array.isArray(f.at) && f.at.length === 2 && f.at.every((x) => num(x) != null))
  .slice(0, max).map((f) => ({ type: f.type, at: [Math.floor(num(f.at[0])), Math.floor(num(f.at[1]))], confirmed: f.confirmed !== false }));
const cellsOf = (list) => [...new Set((Array.isArray(list) ? list : []).filter((k) => typeof k === 'string' && KEY.test(k)))];

export function readPlan(v) {
  const src = v && typeof v === 'object' ? v : {};
  const rooms = [];
  const ids = new Set();
  for (const r of Array.isArray(src.rooms) ? src.rooms : []) {
    if (!r || typeof r !== 'object' || typeof r.id !== 'string' || ids.has(r.id) || !/^[A-Za-z0-9_-]{1,40}$/.test(r.id)) continue;
    const b = Array.isArray(r.box) ? r.box.map(num) : [];
    if (b.length !== 4 || b.some((x) => x == null) || b[2] < 1 || b[3] < 1) continue;
    const box = b.map((x) => Math.round(x));
    const shape = r.shape === 'blob' ? 'blob' : 'box';
    const cells = shape === 'blob' ? cellsOf(r.cells) : [];
    if (shape === 'blob' && !cells.length) continue;
    ids.add(r.id);
    rooms.push({
      id: r.id, ...(text(r.name, 40) ? { name: text(r.name, 40) } : {}), shape, box, cells,
      tags: [...new Set((Array.isArray(r.tags) ? r.tags : []).filter((t) => t === 'start' || t === 'objective'))],
      hazards: [...new Set((Array.isArray(r.hazards) ? r.hazards : []).filter((h) => typeof h === 'string' && DETAIL.test(h)))].slice(0, 4),
      fixtures: readFixtures(r.fixtures, 12)
    });
    if (rooms.length >= MAX_ROOMS) break;
  }
  const links = [];
  for (const l of Array.isArray(src.links) ? src.links : []) {
    if (!l || typeof l !== 'object') continue;
    const from = typeof l.from === 'string' && ids.has(l.from) ? l.from : null;
    const to = typeof l.to === 'string' && ids.has(l.to) ? l.to : null;
    const path = (Array.isArray(l.path) ? l.path : [])
      .filter((p) => Array.isArray(p) && p.length === 2 && p.every((x) => num(x) != null))
      .slice(0, 600).map((p) => [Math.floor(num(p[0])), Math.floor(num(p[1]))]);
    if (!from && !to && path.length < 2) continue;
    links.push({
      id: typeof l.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(l.id) ? l.id : `l${links.length + 1}`,
      from, to, kind: LINK_KINDS.includes(l.kind) ? l.kind : 'door', path
    });
    if (links.length >= MAX_LINKS) break;
  }
  const unclear = (Array.isArray(src.unclear) ? src.unclear : []).filter((u) => typeof u === 'string').map((u) => u.slice(0, 200)).slice(0, 30);
  return { rooms, links, fixtures: readFixtures(src.fixtures, 30), unclear };
}

/* A stroke made lighter before it is kept: points closer than `eps` squares to
   the line between their neighbours add nothing a deck can show
   (Ramer-Douglas-Peucker). */
export function simplify(pts, eps = 0.15) {
  if (!Array.isArray(pts) || pts.length < 3) return pts || [];
  const keep = new Uint8Array(pts.length);
  keep[0] = 1; keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    let far = -1, fd = 0;
    for (let i = a + 1; i < b; i++) {
      // A loop closed neatly ends where it began: there is no line between its
      // ends to measure from, so it is measured from that point.
      const d = len < 1e-6 ? Math.hypot(pts[i][0] - ax, pts[i][1] - ay)
        : Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
      if (d > fd) { fd = d; far = i; }
    }
    if (far > 0 && fd > eps) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

// How far a point is from a stroke, in squares: what the eraser hits.
export function distanceToStroke(stroke, x, y) {
  const pts = stroke.pts;
  if (pts.length === 1) return Math.hypot(pts[0][0] - x, pts[0][1] - y);
  let best = Infinity;
  const n = stroke.pen === 'room' ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / ((dx * dx + dy * dy) || 1e-9)));
    best = Math.min(best, Math.hypot(ax + dx * t - x, ay + dy * t - y));
  }
  return best;
}
