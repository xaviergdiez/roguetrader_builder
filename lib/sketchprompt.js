// Reading a picture of a map into a sketch plan: a photograph of a paper
// sketch, or a reference (a published board, a game map, a floor plan).
//
// A pen sketch has no pens to say what is a room and what a passage, and it
// is full of handwriting, so pixels alone will not do: the picture goes to a
// vision model, which is asked for the plan as JSON (READING_SCHEMA), with a
// list of what it could not read. Nothing it returns is trusted:
// readReading() keeps only what fits, the way readMap reads a deck.
//
// POSITIONS are [y, x], each 0 to 1000 across the whole picture, and boxes
// [ymin, xmin, ymax, xmax] the same way: the convention the model is trained
// to point in. The browser lays the picture on the grid and turns them into
// squares (sketchread.js's strokesFromReading), so what was read becomes
// strokes the GM can correct with the same pens before generating.
//
// HOW MUCH MAY IT INVENT: nothing silently. Anything uncertain is placed as
// its best reading and said in `unclear`; a fixture it is unsure of comes
// back unconfirmed and is marked so on the deck.
//
// Pure, and outside /api so Vercel does not count it against the function
// cap. See sketchprompt.check.mjs.

export const SKETCH_SOURCES = [
  { id: 'sketch', name: 'A paper sketch', note: 'Your own plan, drawn by hand and photographed, squared paper or not.' },
  { id: 'reference', name: 'A reference map', note: 'A published board, a game map or a floor plan: its rooms and the ways between them.' }
];
export const READ_HAZARDS = ['fire', 'toxic', 'void', 'radiation', 'electrical', 'warp', 'zerog'];
export const READ_FIXTURES = ['cogitator', 'turret', 'shrine', 'vent', 'breach', 'deploy'];
export const READ_LINKS = ['door', 'locked', 'open', 'crawl'];
export const READ_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
// A photograph made smaller in the browser first (1600 px across) is a few
// hundred KB; Vercel takes a request of 4.5 MB.
export const MAX_READ_IMAGE_CHARS = 4_000_000;
export const MAX_READ_NOTE = 300;
export const MAX_READ_ROOMS = 40;
export const MAX_READ_LINKS = 80;

const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

export function buildSketchReadPrompt(input) {
  const src = input && typeof input === 'object' ? input : {};
  const source = SKETCH_SOURCES.some((s) => s.id === src.source) ? src.source : 'sketch';
  const note = clean(src.note, MAX_READ_NOTE);
  return [
    source === 'reference'
      ? 'This picture is a map for a tabletop game: a published board, a game map or a floor plan. Read its layout: the rooms and the ways between them, not the art. Large open areas are rooms; furniture and decoration are not.'
      : 'This picture is a photograph of a game master\'s hand-drawn sketch of a battle map for a tabletop game, on paper. Read the sketch, not the photograph: ignore the table, hands, pens and anything off the paper.',
    'The game is Rogue Trader, in the Warhammer 40,000 setting: the maps are compartments of voidships, space hulks, hive tunnels, caves and ruins.',
    'Turn it into a plan of rooms and the links between them, as JSON.',
    '',
    'POSITIONS: every point is [y, x], each from 0 to 1000 across the whole picture, 0,0 at the top left and 1000,1000 at the bottom right. Every box is [ymin, xmin, ymax, xmax] the same way.',
    'GRID: if the paper is squared (graph paper, a drawn grid), cols and rows are how many squares the grid has across and down, and box is the part of the picture the grid covers. If it is not squared, cols and rows are 0.',
    '',
    'ROOMS: every enclosed room, compartment, chamber, hall or cave. For each:',
    '- id: a short lowercase name from its label (bridge, reactor), or room1, room2 when it has none.',
    '- name: its label as written, if any.',
    '- shape: "rect" for a rectangle, "ellipse" for a round or oval room, "polygon" for any other outline (a cave, an L-shape), and then points, its outline in order, 4 to 24 points.',
    '- box: its bounds.',
    '- tags: "start" where the party comes in (an arrow in, start, entry, airlock, breach point); "objective" where they are going (objective, target, an X, a star).',
    '- hazards, only from: fire, toxic (gas), void (vacuum, hull breach), radiation, electrical, warp, zerog (zero gravity). Any word or sign of one written in or beside a room (fire!, flames, gas, rads, vacuum) is that room\'s hazard: put it here.',
    '- fixtures, only from: cogitator (terminal, console), turret (gun, sentry), shrine (altar, chapel), vent (vent, end of a crawlway), breach (torpedo breach), deploy (where enemies come in); each with at, where it is drawn, and confirmed false if you are not sure of it (a question mark, an unclear symbol).',
    '- note: anything else written in or beside it, short: who is there, what is kept there.',
    'FIXTURES outside any room (in a corridor, at a junction) go in the top-level fixtures, the same way.',
    'LINKS: every way between two rooms: a corridor, a door, an opening.',
    '- from, to: the ids of the rooms it joins.',
    '- kind: "door" (a door or bulkhead: a short bar or gap across the corridor where it meets a room, or a corridor that simply runs between rooms), "locked" (marked locked, sealed or barred, a padlock, a cross on it), "open" (only where the sketch says so: written open, an archway, a wall broken through), "crawl" (a vent or crawlway, often dashed). When you cannot tell, it is a door.',
    '- via: the course of a drawn corridor from the first room to the second, as points; empty when the rooms simply touch.',
    'UNCLEAR: each thing you could not read, or guessed at, in a short sentence. Never leave something out silently and never make a guess definite silently: place your best reading and say so here.',
    '',
    'Read only what is drawn. Do not invent rooms or links that are not there.',
    note ? `The game master says of it: "${note}"` : ''
  ].filter((l, i, all) => l || all[i - 1]).join('\n').trim();
}

// The shape asked for (Gemini's responseSchema, an OpenAPI subset).
const INT = { type: 'INTEGER' };
const POINT = { type: 'ARRAY', items: INT };
const STR = { type: 'STRING' };
const FIXTURE = { type: 'OBJECT', properties: { type: { type: 'STRING', enum: READ_FIXTURES }, at: POINT, confirmed: { type: 'BOOLEAN' } }, required: ['type', 'at'] };
export const READING_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: STR,
    grid: { type: 'OBJECT', properties: { cols: INT, rows: INT, box: POINT }, required: ['cols', 'rows'] },
    rooms: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: STR, name: STR,
          shape: { type: 'STRING', enum: ['rect', 'ellipse', 'polygon'] },
          box: POINT,
          points: { type: 'ARRAY', items: POINT },
          tags: { type: 'ARRAY', items: { type: 'STRING', enum: ['start', 'objective'] } },
          hazards: { type: 'ARRAY', items: { type: 'STRING', enum: READ_HAZARDS } },
          fixtures: { type: 'ARRAY', items: FIXTURE },
          note: STR
        },
        required: ['id', 'shape', 'box']
      }
    },
    fixtures: { type: 'ARRAY', items: FIXTURE },
    links: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { from: STR, to: STR, kind: { type: 'STRING', enum: READ_LINKS }, via: { type: 'ARRAY', items: POINT } },
        required: ['from', 'to', 'kind']
      }
    },
    unclear: { type: 'ARRAY', items: STR }
  },
  required: ['grid', 'rooms', 'links', 'unclear']
};

const n1000 = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(Math.min(1000, Math.max(0, n))) : null; };
const point = (p) => {
  if (!Array.isArray(p) || p.length !== 2) return null;
  const y = n1000(p[0]), x = n1000(p[1]);
  return y == null || x == null ? null : [y, x];
};
const box = (b) => {
  if (!Array.isArray(b) || b.length !== 4) return null;
  const v = b.map(n1000);
  if (v.some((x) => x == null)) return null;
  const [y0, x0, y1, x1] = [Math.min(v[0], v[2]), Math.min(v[1], v[3]), Math.max(v[0], v[2]), Math.max(v[1], v[3])];
  return y1 - y0 < 2 || x1 - x0 < 2 ? null : [y0, x0, y1, x1];
};
const points = (list, max) => (Array.isArray(list) ? list : []).map(point).filter(Boolean).slice(0, max);
const fixtures = (list, max) => (Array.isArray(list) ? list : [])
  .filter((f) => f && READ_FIXTURES.includes(f.type) && point(f.at))
  .slice(0, max).map((f) => ({ type: f.type, at: point(f.at), confirmed: f.confirmed !== false }));
const HAZARD_WORDS = [
  ['fire', /\b(fire|flames?|burning|ablaze|inferno)\b/i],
  ['toxic', /\b(gas|toxic|poison(ed)?|fumes|chem(ical)?s?)\b/i],
  ['void', /\b(vacuum|hull breach|void|decompress(ed|ion)?)\b/i],
  ['radiation', /\b(rads?|radiation|radioactive)\b/i],
  ['electrical', /\b(live (current|wires?|cables?)|electrified|shock(s|ing)?|sparks)\b/i],
  ['warp', /\b(warp( rift)?|daemonic|immaterium)\b/i],
  ['zerog', /\b(zero[- ]?g(rav(ity)?)?|no gravity|weightless)\b/i]
];
const boundsOf = (pts) => box([Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))]);

/* What the model said, kept only where it fits. Never throws. */
export function readReading(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const unclear = (Array.isArray(src.unclear) ? src.unclear : []).map((u) => clean(u, 200)).filter(Boolean).slice(0, 20);
  const g = src.grid && typeof src.grid === 'object' ? src.grid : {};
  const gc = Math.round(Number(g.cols)), gr = Math.round(Number(g.rows));
  const grid = gc >= 2 && gc <= 200 && gr >= 2 && gr <= 200 ? { cols: gc, rows: gr, box: box(g.box) || [0, 0, 1000, 1000] } : null;
  const rooms = [];
  const ids = new Set();
  for (const r of Array.isArray(src.rooms) ? src.rooms : []) {
    if (!r || typeof r !== 'object') continue;
    let shape = ['rect', 'ellipse', 'polygon'].includes(r.shape) ? r.shape : 'rect';
    const pts = shape === 'polygon' ? points(r.points, 24) : [];
    if (shape === 'polygon' && pts.length < 3) shape = 'rect';
    const b = box(r.box) || (pts.length >= 3 ? boundsOf(pts) : null);
    if (!b) { unclear.push(`A room${r.name ? ` "${clean(r.name, 40)}"` : ''} had no size, and was left out.`); continue; }
    let id = clean(r.id, 24).toLowerCase().replace(/[^a-z0-9_-]+/g, '') || `room${rooms.length + 1}`;
    for (let k = 2; ids.has(id); k++) id = `${id.replace(/\d+$/, '')}${k}`;
    ids.add(id);
    const hazards = new Set((Array.isArray(r.hazards) ? r.hazards : []).filter((h) => READ_HAZARDS.includes(h)));
    // A hazard written in the room but put in its note: the model knows the
    // word and not always where it goes. Said, so it is not made definite
    // silently.
    let note = clean(r.note, 120);
    for (const [hz, re] of HAZARD_WORDS) {
      const m = note.match(re);
      if (!m) continue;
      note = note.replace(m[0], ' ').replace(/^[\s\W]+|[\s\W]+$/g, '').replace(/\s+/g, ' ');
      if (hazards.has(hz)) continue;
      hazards.add(hz);
      unclear.push(`"${m[0]}" in ${clean(r.name, 40) || id} is read as a hazard: ${hz}.`);
    }
    rooms.push({
      id, name: clean(r.name, 40), shape, box: b, points: shape === 'polygon' ? pts : [],
      tags: [...new Set((Array.isArray(r.tags) ? r.tags : []).filter((t) => t === 'start' || t === 'objective'))],
      hazards: [...hazards].slice(0, 3),
      fixtures: fixtures(r.fixtures, 8),
      note,
      // The model's own id, so a link naming it still finds it after a rename.
      said: clean(r.id, 40).toLowerCase()
    });
    if (rooms.length >= MAX_READ_ROOMS) break;
  }
  const idOf = (v) => {
    const k = clean(v, 40).toLowerCase();
    const r = rooms.find((x) => x.said === k) || rooms.find((x) => x.id === k);
    return r ? r.id : null;
  };
  const links = [];
  for (const l of Array.isArray(src.links) ? src.links : []) {
    if (!l || typeof l !== 'object') continue;
    const from = idOf(l.from), to = idOf(l.to);
    if (!from || !to) {
      unclear.push(`A way between "${clean(l.from, 30)}" and "${clean(l.to, 30)}" names a room that was not read, and was left out.`);
      continue;
    }
    if (from === to) continue;
    links.push({ from, to, kind: READ_LINKS.includes(l.kind) ? l.kind : 'door', via: points(l.via, 24) });
    if (links.length >= MAX_READ_LINKS) break;
  }
  return {
    title: clean(src.title, 60),
    grid,
    rooms: rooms.map(({ said, ...r }) => r),
    fixtures: fixtures(src.fixtures, 16),
    links,
    unclear: unclear.slice(0, 30)
  };
}
