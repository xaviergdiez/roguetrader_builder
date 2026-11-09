/* NAMED AREAS: squares of a deck given a name, a colour and a note, the way
   a station's plan labels its modules or a finished battle map names its
   rooms. Lay a picture under the deck (a photograph of a model, a map made in
   another program) and paint its parts as areas, and the picture becomes a
   map the GM can work from: what each part is, what is in it, and, where an
   area is a place with a deck of its own, the way into that deck.

   Not triggers (triggers.js): an area does nothing by itself. It is drawn,
   in its colour with its name in it, on the GM's screen always and on the
   table's only when the GM says the table may see it.

   An area is { id, name, colour, note, deck, show, cells }: `deck` the id of
   a saved deck it opens, `show` whether the table sees its name. Pure; see
   areas.check.mjs. The map's own reader keeps areas with it. */

export const AREA_COLOURS = [
  { id: 'gold', name: 'Gold', hex: '#e8c25a' },
  { id: 'blue', name: 'Blue', hex: '#5aa9ff' },
  { id: 'green', name: 'Green', hex: '#5ad08f' },
  { id: 'red', name: 'Red', hex: '#ff6a5a' },
  { id: 'violet', name: 'Violet', hex: '#b48cff' },
  { id: 'cyan', name: 'Cyan', hex: '#4fd6e6' },
  { id: 'orange', name: 'Orange', hex: '#ff9a3c' },
  { id: 'pink', name: 'Pink', hex: '#ff7ac8' }
];
export const areaColour = (id) => (AREA_COLOURS.find((c) => c.id === id) || AREA_COLOURS[0]).hex;

export const MAX_AREAS = 40;
export const MAX_AREA_CELLS = 2500;

const ID = /^a[a-z0-9]{3,40}$/;
const KEY = /^-?\d{1,4},-?\d{1,4}$/;
const DECK = /^[A-Za-z0-9_-]{1,64}$/;

let seq = 0;
export const newAreaId = () => 'a' + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 5);

export function readArea(v) {
  if (!v || typeof v !== 'object' || typeof v.id !== 'string' || !ID.test(v.id)) return null;
  const cells = [...new Set((Array.isArray(v.cells) ? v.cells : []).filter((k) => typeof k === 'string' && KEY.test(k)))]
    .slice(0, MAX_AREA_CELLS);
  return {
    id: v.id,
    name: String(v.name || '').slice(0, 60),
    colour: AREA_COLOURS.some((c) => c.id === v.colour) ? v.colour : AREA_COLOURS[0].id,
    note: String(v.note || '').slice(0, 600),
    deck: typeof v.deck === 'string' && DECK.test(v.deck) ? v.deck : null,
    show: v.show === true,
    cells
  };
}

export function readAreas(list) {
  const out = [];
  const ids = new Set();
  for (const v of Array.isArray(list) ? list : []) {
    const a = readArea(v);
    if (a && !ids.has(a.id)) { ids.add(a.id); out.push(a); }
    if (out.length >= MAX_AREAS) break;
  }
  return out;
}

// A new area takes the next colour round, so neighbours are told apart.
export const newArea = (list = []) => readArea({
  id: newAreaId(), name: `Area ${list.length + 1}`, colour: AREA_COLOURS[list.length % AREA_COLOURS.length].id
});

export const areaById = (list, id) => (list || []).find((a) => a.id === id) || null;
// The area on a square: the one painted last, on top.
export const areaAt = (list, key) => [...(list || [])].reverse().find((a) => a.cells.includes(key)) || null;

/* Paints squares into an area, or lifts them out. A square belongs to one
   area: painting it into this one takes it out of any other, so two areas
   never claim the same floor. An area left with no squares stays, empty,
   until it is deleted: it may have a name and a note worth keeping. */
export function paintArea(list, id, keys, on = true) {
  const want = new Set((keys || []).filter((k) => typeof k === 'string' && KEY.test(k)));
  return readAreas((list || []).map((a) => {
    if (a.id === id) {
      const cells = on ? [...new Set([...a.cells, ...want])] : a.cells.filter((k) => !want.has(k));
      return { ...a, cells };
    }
    return on ? { ...a, cells: a.cells.filter((k) => !want.has(k)) } : a;
  }));
}

export const updateArea = (list, id, patch) =>
  readAreas((list || []).map((a) => (a.id === id ? { ...a, ...patch, id: a.id, cells: a.cells } : a)));
export const removeArea = (list, id) => readAreas((list || []).filter((a) => a.id !== id));

/* Where an area's name goes: on the square of its own nearest the middle of
   it, so an L-shaped area is labelled on itself and not in the gap. */
export function labelCell(cells) {
  const pts = (cells || []).map((k) => k.split(',').map(Number)).filter((p) => p.length === 2 && p.every(Number.isFinite));
  if (!pts.length) return null;
  const cx = pts.reduce((n, p) => n + p[0], 0) / pts.length;
  const cy = pts.reduce((n, p) => n + p[1], 0) / pts.length;
  let best = pts[0], d = Infinity;
  for (const p of pts) {
    const dd = (p[0] - cx) ** 2 + (p[1] - cy) ** 2;
    if (dd < d) { d = dd; best = p; }
  }
  return { x: best[0], y: best[1] };
}

// What the table's screen may draw: only the areas the GM has shown it.
export const areasForTable = (list) => (list || []).filter((a) => a.show && a.cells.length);
