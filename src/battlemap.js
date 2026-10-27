/* ========================= BOARDING BATTLE MAP =========================
   A map for ground combat — boarding actions, hulk sweeps, deck fights.

   There are two layers here and they are deliberately separate:

   GEOMETRY is the deck itself: which cells are floor, which are void, where
   the bulkheads are. It is scenery. The GM builds it by stamping modular
   tiles or painting cells, and the walls are not stored at all — they are
   derived from the floor every time it is drawn (see wallMask), so a wall can
   never disagree with the floor it is supposed to edge.

   COMBATANTS ARE NOT DRAWN. The fight is played with miniatures on the
   table, and the map is projected under them. A combatant circle painted on
   the deck would sit beneath a physical model and fight it for the square, so
   nothing here tracks who is standing where — the models do that, and the
   ground-combat board holds their Wounds and conditions as it already did.

   That makes two scales matter, and they are different things:
     metresPerSquare  what a square is worth IN THE FICTION, which is what
                      range bands are priced in.
     mmPerSquare      how big a square is ON THE TABLE, which is what the
                      projector has to be calibrated against so a square
                      fits a miniature's base.

   The payoff is reachBetween(): two squares become a distance in metres, and
   groundcombat.js's rangeBand() already knows what that is worth on the
   to-hit roll. Before this, that number was typed in by hand and guessed. */

import { rangeBand, RANGE_MODIFIERS, parseWeaponStats } from './groundcombat.js';

/* ------------------------------ themes ------------------------------ */

/* `wash` is how far the deck is knocked back before the grid, the tokens and
   the templates are drawn over it. It exists so those read against a busy
   floor, and it is per theme because the floors differ: a dim, cluttered
   hulk plate needs the full quarter, and the same wash over a scrubbed white
   station turns a deliberately bright deck grey.

   `gridAlpha` goes with it. The grid is how the table counts squares, so it
   has to be legible ON the floor, and a dark line over a bright deck needs
   to be drawn harder than a bright line over a dim one. */
const T = (id, name, subtitle, grid, accent, fallback, desc, wash = 0.25, gridAlpha = 0.3) => ({
  id, name, subtitle, grid, accent, fallback, desc, wash, gridAlpha,
  // The floor fill is a real photographed/painted texture served from
  // public/maps as a static file, not a flat colour and not a bundled
  // import: a 1024px texture has no business going through the JS bundle.
  // `fallback` is what the floor is painted if the texture 404s.
  texture: `/maps/${id}.jpg`
});

export const MAP_THEMES = [
  T('space_hulk', 'Derelict Corridor', 'Rusted deckplate, vents, hazard stripes',
    '#00e5ff', '#e74c3c', '#161a1e',
    'Void-exposed passages of a hulk, welded together from a dozen dead ships.'),
  T('rogue_trader', 'Flagship Deck', 'Gothic plating, brass inlay, Aquila seals',
    '#d4af37', '#f39c12', '#1c1916',
    'The command decks and armoured corridors of a Warrant-holder’s own ship.'),
  T('genestealer_hive', 'Infested Sector', 'Chitin, bioluminescence, tendrils',
    '#a855f7', '#2ecc71', '#1a1024',
    'Hibernation chambers where the walls themselves have been colonised.'),
  T('blackstone_fortress', 'Blackstone Citadel', 'Noctilith tiles, conduits, xenos runes',
    '#00f2fe', '#00c6ff', '#0b141d',
    'Corridors of a fortress that rearranges itself while you walk them.'),
  // The one clean deck in the set. Everything else here is rusted, haunted
  // or growing; this is maintained.
  T('tau_station', 'T\u2019au Void Station', 'Pale composite panelling, soft seams, cool light',
    '#2f4a55', '#2b93b5', '#c3ccd1',
    'The scrubbed, well-lit decks of a T\u2019au orbital. Nothing rusted, nothing bleeding.',
    0.14, 0.55),

  /* Planetside. The tile and bulkhead tools work out here unchanged \u2014 a
     wall is terrain and a bulkhead is a gate or a cave mouth, which is a
     matter of what the GM calls it at the table rather than anything the app
     needs told. The numbers differ a lot across these four, because a sunlit
     dune and a hive bottom are not the same kind of dark. */
  T('jungle', 'Death World Jungle', 'Wet leaf litter, strangling root, standing water',
    '#c8dba0', '#7fa05a', '#2f3324',
    'Equatorial canopy floor. Everything underfoot is rotting, or growing through something that is.',
    0.18, 0.34),
  T('desert', 'Desert Waste', 'Drift sand over cracked hardpan and bare rock',
    '#4a3520', '#8a5a2b', '#cfa06a',
    'Wind-scoured and open. Cover is wherever the rock has broken, and there is not much of it.',
    0.14, 0.5),
  T('ice', 'Ice Shelf', 'Pressure ridge, refrozen melt, snow in the lee of the rock',
    '#2c4450', '#2f7f99', '#cfd9de',
    'A glacial sheet over frozen stone. The blue is where the snow has gone and the ice has not.',
    0.12, 0.55),
  T('hive_city', 'Hive Underlevels', 'Stained plate, hazard stripe, pipework and loose cabling',
    '#7fd4e8', '#b5651d', '#2a241f',
    'The bottom of a hive, where the floor is whatever was welded over the last floor.',
    0.25, 0.32)
];

export const DEFAULT_THEME = 'space_hulk';

/* What to tell a GM about a floor they are about to upload.

   A map texture TILES. That is the whole difference between it and a
   picture, and it is what makes the two things people reach for — a photo
   and a screenshot — usually wrong: a 16:9 shot repeats as a band of
   letterboxed strips, and anything with a horizon in it tiles into a wall.

   Square is the shape to aim for, within a few per cent. Pure, so the
   advice can be checked without a canvas. */

/* How far from square a floor can be before it is worth saying something.
   Set from the shipped floors rather than picked: the hive deck is 1024x945
   and three others are 1024x930, because a watermark was cropped off the
   bottom. A tolerance that flagged the app's own textures as the wrong shape
   would be advice nobody should take. 4:3 and 16:9 are still well outside. */
export const SQUARE_TOLERANCE = 0.12;

export function textureAdvice(size) {
  const w = Math.round(Number(size && size.width) || 0);
  const h = Math.round(Number(size && size.height) || 0);
  if (w <= 0 || h <= 0) {
    return { ok: false, square: false, ratio: 0, message: 'That file is not an image this can read.' };
  }
  const ratio = w / h;
  const square = Math.abs(ratio - 1) <= SQUARE_TOLERANCE;
  if (square) {
    return {
      ok: true, square: true, ratio,
      message: `${w}\u00d7${h}, square enough to tile cleanly.`
    };
  }
  // Said as a ratio rather than a decimal, because 16:9 is a thing a person
  // recognises and 1.78 is not.
  const asRatio = ratio > 1
    ? `${(ratio).toFixed(2).replace(/\.?0+$/, '')}:1`
    : `1:${(1 / ratio).toFixed(2).replace(/\.?0+$/, '')}`;
  return {
    ok: true, square: false, ratio,
    message: `${w}\u00d7${h} is ${asRatio}. A floor tiles best square \u2014 `
      + 'cropped to the middle it will repeat cleanly; left as it is it repeats as a band.'
  };
}

/* ---------------- a saved environment, and its five numbers ----------------
   A GM who generates a ground should not then be asked for a grid colour, a
   wash and a grid strength. They are derived from the image itself, using the
   same reasoning the nine built-in themes were tuned by hand with (see
   TEXTURES.md): a dark line on a bright floor and a pale one on a dark floor,
   less knock-back on a bright deck because washing it only turns it grey, and
   more ink in the grid where it has to fight a bright texture.

   The caller samples the image; this decides what the numbers are, so the
   decision is testable without a canvas. */

const byte = (v) => Math.max(0, Math.min(255, Math.round(Number(v) || 0)));
const hex = (r, g, b) =>
  '#' + [r, g, b].map((v) => byte(v).toString(16).padStart(2, '0')).join('');

// Above this the floor is treated as bright. 110 of 255 is where a dark grid
// line starts reading better than a pale one.
export const BRIGHT_FLOOR = 110;

export function themeNumbersFor(sample) {
  const s = sample && typeof sample === 'object' ? sample : {};
  const r = byte(s.r), g = byte(s.g), b = byte(s.b);
  const lum = Number.isFinite(Number(s.luminance)) ? Number(s.luminance) : (r + g + b) / 3;
  const bright = lum >= BRIGHT_FLOOR;
  return {
    fallback: hex(r, g, b),
    grid: bright ? hex(r * 0.22, g * 0.24, b * 0.3) : hex(132 + r * 0.34, 142 + g * 0.34, 118 + b * 0.34),
    accent: bright ? hex(r * 0.5, g * 0.46, b * 0.42) : hex(92 + r * 0.5, 96 + g * 0.5, 78 + b * 0.5),
    wash: bright ? 0.14 : 0.22,
    gridAlpha: bright ? 0.52 : 0.34
  };
}

/* An environment the GM generated and kept. It is a theme like any other
   except that its texture is a data URL on the saved record rather than a
   file in public/maps \u2014 there is no build to drop a file into at the
   table. */
export function readCustomTheme(x) {
  const src = x && typeof x === 'object' ? x : null;
  if (!src) return null;
  const texture = typeof src.texture === 'string'
    && /^data:image\/(png|jpeg|webp);base64,/.test(src.texture)
    && src.texture.length <= MAX_CUSTOM_TEXTURE ? src.texture : null;
  if (!texture) return null;          // a theme with no floor is not a theme
  const n = themeNumbersFor({});
  const col = (v, fallback) =>
    (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) ? v : fallback;
  const num = (v, fallback, lo, hi) => {
    const x2 = Number(v);
    return Number.isFinite(x2) ? Math.min(hi, Math.max(lo, x2)) : fallback;
  };
  return {
    id: (typeof src.id === 'string' && src.id) || newThemeId(),
    name: String(src.name || '').slice(0, 60) || 'Saved ground',
    subtitle: String(src.subtitle || '').slice(0, 120),
    desc: String(src.desc || '').slice(0, 300),
    // What it was asked for, kept so it can be generated again or adjusted.
    prompt: String(src.prompt || '').slice(0, 800),
    texture,
    custom: true,
    grid: col(src.grid, n.grid),
    accent: col(src.accent, n.accent),
    fallback: col(src.fallback, n.fallback),
    wash: num(src.wash, 0.2, 0, 0.5),
    gridAlpha: num(src.gridAlpha, 0.35, 0.11, 1)
  };
}

let themeSeq = 0;
const newThemeId = () => 'env-' + Date.now().toString(36) + '-' + (themeSeq++).toString(36);

export const readThemeLibrary = (list) =>
  (Array.isArray(list) ? list : []).map(readCustomTheme).filter(Boolean);

/* The theme a map is using, built-in or saved. A saved one that has since
   been deleted falls back to a built-in rather than leaving the renderer
   without colours. */
export const resolveTheme = (id, custom) =>
  (Array.isArray(custom) ? custom.find((t) => t.id === id) : null) || themeById(id);


// Falls back to the default rather than returning undefined: the renderer
// reads theme.grid straight off this, and an undefined would crash the canvas
// rather than merely looking wrong.
export const themeById = (id) =>
  MAP_THEMES.find((t) => t.id === id) ||
  MAP_THEMES.find((t) => t.id === DEFAULT_THEME) ||
  MAP_THEMES[0];

/* --------------------------- the tile catalogue --------------------------- */

const TL = (id, name, category, w, h, kind) => ({ id, name, category, w, h, kind });

export const TILE_CATALOG = [
  TL('corridor_1x1', 'Corridor Cell', 'Corridors', 1, 1, 'floor'),
  TL('corridor_1x2', 'Corridor, short', 'Corridors', 1, 2, 'floor'),
  TL('corridor_1x3', 'Corridor', 'Corridors', 1, 3, 'floor'),
  TL('corridor_1x5', 'Corridor, long', 'Corridors', 1, 5, 'floor'),
  TL('corner_1x1', 'L-turn corner', 'Junctions', 1, 1, 'floor'),
  TL('t_junction_1x1', 'T-junction', 'Junctions', 1, 1, 'floor'),
  TL('cross_1x1', 'Crossroads', 'Junctions', 1, 1, 'floor'),
  TL('dead_end_1x1', 'Dead end', 'Junctions', 1, 1, 'floor'),
  TL('room_2x2', 'Guardroom', 'Rooms', 2, 2, 'floor'),
  TL('room_3x3', 'Command chamber', 'Rooms', 3, 3, 'floor'),
  TL('room_3x4', 'Armoury', 'Rooms', 3, 4, 'floor'),
  TL('room_5x5', 'Great hall', 'Rooms', 5, 5, 'floor'),
  TL('breach_1x1', 'Torpedo breach', 'Special', 1, 1, 'floor'),
  TL('airlock_1x1', 'Vacuum airlock', 'Special', 1, 1, 'floor'),
  TL('ladder_1x1', 'Access shaft', 'Special', 1, 1, 'floor')
];

export const tileById = (id) => TILE_CATALOG.find((t) => t.id === id) || null;

export const TILE_CATEGORIES = [...new Set(TILE_CATALOG.map((t) => t.category))];

/* ------------------------------ the map ------------------------------ */

// metresPerSquare is the calibration knob, and it is deliberately a knob
// rather than a constant. Rogue Trader measures in metres and has no grid of
// its own, so the squares are ours: one metre each suits a corridor fight,
// two suits a cargo hold that would otherwise need a 60-square map. Every
// distance this module reports runs through it. (A square is NOT 1.5m — that
// is the d20 five-foot square, and using it here would misprice every range
// band in the book.)
export const EMPTY_MAP = {
  theme: DEFAULT_THEME,
  cols: 30,
  rows: 20,
  metresPerSquare: 1,
  /* A generated ground, as a data URL, overriding the theme's own texture.
     Kept ON THE DECK rather than in public/maps because it is made at the
     table: there is no build to drop a file into, and a GM who generates a
     fen for tonight should not have to deploy to use it. The theme's five
     numbers still apply \u2014 switch theme to re-tune the grid over it. */
  customTexture: null,
  // 25mm is a standard infantry base and near enough the inch most terrain is
  // cut to. This is the real-world size of a square, and it is what the
  // projector is calibrated against — see calibrationBar.
  mmPerSquare: 25,
  pxPerSquare: 40,      // screen pixels per square, adjusted until it matches
  floor: {},            // { 'x,y': true } — the single source of truth for deck
  /* PER-CELL GROUND. One deck is rarely one terrain: a boarding action runs
     from the ice outside to the deck plate inside, and an agri-world fight
     crosses ploughed soil, an irrigation ditch and the rockcrete apron.

     A cell named here is drawn with that ground instead of the deck's own.
     It is PAINT, nothing more: the floor stays binary, so the walls derived
     from it, the regions flood-filled over it and the fog that follows them
     are all untouched by what a square looks like. That is the whole reason
     this is a separate layer and not a second kind of floor. */
  ground: {},           // { 'x,y': themeId }
  doors: {},            // { 'x,y': { kind, state } }
  cover: {},            // { 'x,y': coverTypeId } — things standing on the deck
  hazards: {},          // { 'x,y': hazardTypeId } — dangerous to stand in
  markers: {},          // { 'x,y': { type, label } } — scenery
  // Fog of war. `explored` is what the party has seen; `fog` is whether the
  // map is drawn with it. The two are separate so turning fog off to check
  // something does not throw away what was explored.
  explored: {},         // { 'x,y': true } — everywhere the party has EVER seen
  // Where they are now, set by the last reveal. What is DRAWN is `explored`
  // narrowed to what can still be walked to from here through open doors, so
  // shutting a bulkhead takes the room beyond it off the board and opening
  // it again brings the room back. Nothing is forgotten to do that — see
  // visibleExplored.
  viewpoint: null,
  fog: false,
  /* Hostiles placed from a saved encounter. THESE ARE NOT TOKENS: the fight
     is played with miniatures, and a model standing on a square the party
     has not reached would give the position away. A contact is the GM's own
     note of what is out there, and the one thing fog is allowed to leak —
     an auspex sweep turns a hidden contact into a ping, which says something
     is there without saying what, or opening the deck around it. */
  contacts: {}          // { 'x,y': { name, encounterId, hostileId, state } }
};

// ~1.5MB of base64, which is a 768px JPEG with room to spare. Past this a
// generated ground is costing more to load than the deck it decorates.
export const MAX_CUSTOM_TEXTURE = 1_500_000;

/* The largest grid a deck may be.

   NOT a design preference — a browser canvas has a hard pixel ceiling
   (16384 a side in Chrome, lower on some machines) and the deck is drawn as
   one canvas of cols x px. At 200 squares and a 40px square that is already
   8000px a side, which is where MAX_CANVAS_PX sits. Past this the square
   would have to shrink below the size of the miniature standing on it, which
   decalibrates the projector — the one thing the calibration exists to stop.
   Zoom is the answer to a big deck, not a smaller square. */
/* Zoom is a VIEW control: it scales what is already drawn so the GM can read
   a corner or take in a whole deck. It is deliberately not stored on the map
   — px/square is the projector's calibration and must not move — and it is
   bounded because a canvas scaled past a few hundred per cent is a wall of
   blur, and one scaled under a tenth is unclickable. */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
export const clampZoom = (z) => {
  // An empty box means "nothing typed yet", not zero. Number('') is 0 and
  // Number(null) is 0, and reading either as a zoom clamps the map to its
  // smallest size while the GM is halfway through typing a number.
  if (z === null || z === undefined) return 1;
  if (typeof z === 'string' && z.trim() === '') return 1;
  const n = Number(z);
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, n));
};

export const MAX_GRID = 200;
export const MIN_GRID = 5;

export const cellKey = (x, y) => `${Math.round(x)},${Math.round(y)}`;
export const parseKey = (k) => {
  const parts = String(k).split(',');
  // Both halves must actually be there. Number('') is 0, so a truncated key
  // like "3," would otherwise read as the cell (3, 0) and put floor down in
  // a square nobody painted.
  if (parts.length !== 2 || parts.some((p) => p.trim() === '')) return null;
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
};

const int = (v, fallback, min, max) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

export const DOOR_STATES = ['closed', 'open', 'jammed'];
// Closed -> open -> jammed -> closed. A jammed door still blocks, which is
// the whole reason the state exists.
export const nextDoorState = (s) => {
  const i = DOOR_STATES.indexOf(s);
  return DOOR_STATES[(i < 0 ? 0 : i + 1) % DOOR_STATES.length];
};
export const doorBlocks = (state) => state !== 'open';

/* A bulkhead and a hatch are both doors and differ in what it takes to get
   through one: a blast bulkhead is a wall with a motor, a hatch is a crawlway
   cover. The AP is what the GM prices breaking it at. */
export const DOOR_KINDS = [
  { id: 'bulkhead', name: 'Bulkhead', ap: 12,
    note: 'A powered blast door. Breaking one is a job, not an action.' },
  { id: 'hatch', name: 'Hatch', ap: 6,
    note: 'A crawl-through access cover \u2014 maintenance ways, shafts, cargo holds.' }
];
export const doorKindById = (id) =>
  DOOR_KINDS.find((d) => d.id === id) || DOOR_KINDS[0];

/* A door was once stored as the bare state string. Both shapes are read, so
   a map saved before hatches existed still opens with its bulkheads intact
   rather than losing every door on the deck. */
export function readDoor(v) {
  if (typeof v === 'string') {
    return DOOR_STATES.includes(v) ? { kind: 'bulkhead', state: v } : null;
  }
  if (!v || typeof v !== 'object' || !DOOR_STATES.includes(v.state)) return null;
  return { kind: doorKindById(v.kind).id, state: v.state };
}

/* ---------------------------- cover ----------------------------
   Something standing ON a square rather than the deck itself. The one that
   matters is blocksSight: a cargo stack is a wall you cannot see past, a
   railing is a thing you crouch behind and shoot over, and treating them
   alike would either seal a gantry or make a hold transparent. `ap` is the
   Armour Points the cover adds against a shot that crosses it. */
export const COVER_TYPES = [
  { id: 'low', name: 'Low barrier or railing', ap: 4, blocksSight: false,
    note: 'Crouch behind it and shoot over it.' },
  { id: 'crates', name: 'Cargo crates', ap: 8, blocksSight: true,
    note: 'Stacked high enough to hide behind.' },
  { id: 'machinery', name: 'Machinery or plating', ap: 12, blocksSight: true,
    note: 'Pipework, cogitator banks, loose hull plate.' },
  { id: 'pillar', name: 'Structural pillar', ap: 16, blocksSight: true,
    note: 'Part of the ship. It does not move and it does not break.' }
];
export const coverById = (id) => COVER_TYPES.find((c) => c.id === id) || null;

/* ---------------------------- hazards ----------------------------
   A square that is dangerous to stand in. These block nothing and stop
   nothing \u2014 they are information, drawn so the table can see where not to
   walk. Where one lines up with a condition the combat engine already
   applies, it names it, so the GM can hand out the right chip. */
export const HAZARD_TYPES = [
  { id: 'fire', name: 'Fire', colour: '#ff6b2c', condition: 'on_fire',
    note: '1d10 Wounds a round, ignoring armour. An Agility Test puts it out.' },
  { id: 'toxic', name: 'Toxic gas', colour: '#5fe06a', condition: null,
    note: 'A Toughness Test each round, or Fatigue and damage as the GM rules.' },
  { id: 'void', name: 'Vacuum breach', colour: '#6fa8ff', condition: null,
    note: 'No air, and anything unsealed is dragged toward the hole.' },
  { id: 'radiation', name: 'Radiation', colour: '#e3d23c', condition: null,
    note: 'Lingering after the exposure. The GM sets the toll.' },
  { id: 'electrical', name: 'Live current', colour: '#b98cff', condition: 'stunned',
    note: 'A ruptured conduit. Crossing it risks being Stunned.' }
];
export const hazardById = (id) => HAZARD_TYPES.find((h) => h.id === id) || null;

export const MARKER_TYPES = [
  { id: 'breach', name: 'Torpedo breach', colour: '#ff5722' },
  { id: 'objective', name: 'Objective', colour: '#f1c40f' },
  { id: 'hazard', name: 'Hazard (fire, vacuum)', colour: '#e74c3c' },
  { id: 'deploy', name: 'Deployment point', colour: '#3498db' }
];
export const markerTypeById = (id) => MARKER_TYPES.find((m) => m.id === id) || MARKER_TYPES[0];

// Anything absent is defaulted rather than trusted, the same way readBlueprint
// treats a blueprint saved before a field existed.
export function readMap(m) {
  const src = m && typeof m === 'object' ? m : {};

  const floor = {};
  for (const k of Object.keys(src.floor || {})) {
    if (src.floor[k] && parseKey(k)) floor[k] = true;
  }
  const doors = {};
  for (const [k, v] of Object.entries(src.doors || {})) {
    if (!parseKey(k)) continue;
    const d = readDoor(v);
    if (d) doors[k] = d;
  }
  const cover = {};
  for (const [k, v] of Object.entries(src.cover || {})) {
    if (parseKey(k) && coverById(v)) cover[k] = v;
  }
  const hazards = {};
  for (const [k, v] of Object.entries(src.hazards || {})) {
    if (parseKey(k) && hazardById(v)) hazards[k] = v;
  }
  /* Ground ids are KEPT AS WRITTEN, exactly as the deck's own theme is: a
     saved ground's id is unknown to this module, and matching against the
     built-in list here is the bug that silently moved every deck built on a
     generated floor back to the default. resolveTheme decides, at the point
     of drawing, where the library is actually in hand. */
  const ground = {};
  for (const [k, v] of Object.entries(src.ground || {})) {
    if (parseKey(k) && typeof v === 'string' && v.trim()) ground[k] = v.trim().slice(0, 64);
  }
  const explored = {};
  for (const k of Object.keys(src.explored || {})) {
    if (src.explored[k] && parseKey(k)) explored[k] = true;
  }
  const contacts = {};
  for (const [k, v] of Object.entries(src.contacts || {})) {
    if (!parseKey(k)) continue;
    const c = readContact(v);
    if (c) contacts[k] = c;
  }
  const markers = {};
  for (const [k, v] of Object.entries(src.markers || {})) {
    if (!parseKey(k) || !v || typeof v !== 'object') continue;
    markers[k] = { type: markerTypeById(v.type).id, label: String(v.label || '') };
  }
  return {
    /* KEPT AS WRITTEN, not matched against the built-in list. A saved
       ground's id is unknown to this module by design, and coercing it here
       silently moved every deck built on one back to the default theme.
       resolveTheme() is what makes an unresolvable id safe, at the point of
       drawing, where the saved library is actually in hand. */
    theme: (typeof src.theme === 'string' && src.theme.trim())
      ? src.theme.trim().slice(0, 64) : DEFAULT_THEME,
    cols: int(src.cols, EMPTY_MAP.cols, MIN_GRID, MAX_GRID),
    rows: int(src.rows, EMPTY_MAP.rows, MIN_GRID, MAX_GRID),
    // Half-metre squares are legitimate (a cramped gun deck), so this one is
    // not rounded to an integer like the rest.
    metresPerSquare: (() => {
      const n = Number(src.metresPerSquare);
      return Number.isFinite(n) && n > 0 ? Math.min(10, n) : EMPTY_MAP.metresPerSquare;
    })(),
    pxPerSquare: int(src.pxPerSquare, EMPTY_MAP.pxPerSquare, 10, 200),
    mmPerSquare: int(src.mmPerSquare, EMPTY_MAP.mmPerSquare, 5, 100),
    fog: Boolean(src.fog),
    /* Only ever an image data URL, and bounded. It rides along in the saved
       deck, so an oversized one would quietly bloat every read and write of
       the GM's library; and a non-data URL here would let a saved document
       point the renderer at an arbitrary address. */
    customTexture: (() => {
      const v = src.customTexture;
      if (typeof v !== 'string') return null;
      if (!/^data:image\/(png|jpeg|webp);base64,/.test(v)) return null;
      return v.length <= MAX_CUSTOM_TEXTURE ? v : null;
    })(),
    viewpoint: (() => {
      const v = src.viewpoint;
      if (!v || typeof v !== 'object') return null;
      const x = Math.round(Number(v.x)), y = Math.round(Number(v.y));
      return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    })(),
    floor, doors, cover, hazards, markers, explored, contacts, ground
  };
}

/* Every ground a deck actually draws with, the deck's own first. What the
   renderer has to have loaded before it can paint, and nothing more — a deck
   that uses two grounds should not fetch the other seven. */
export function groundsUsed(map) {
  const m = map && typeof map === 'object' ? map : EMPTY_MAP;
  const out = [];
  const add = (id) => { if (id && !out.includes(id)) out.push(id); };
  add(typeof m.theme === 'string' ? m.theme : DEFAULT_THEME);
  for (const k of Object.keys(m.ground || {})) {
    // Only where there is deck to paint: a ground left behind on an erased
    // square is not drawn, so it should not be fetched either.
    if (!m.floor || m.floor[k]) add(m.ground[k]);
  }
  return out;
}

/* --------------------------- projector calibration ---------------------------

   A projected square has to match the miniatures standing on it, and no
   amount of arithmetic can work out how far the projector is from the table.
   So the map draws a bar of known real-world length and the GM stretches
   pxPerSquare until a ruler laid on the table agrees with it. That is the
   calibration knob; everything else about the projection follows from it.

   The bar spans whole squares, because a fractional square is impossible to
   line a ruler up against. */
export function calibrationBar(map, { targetMm = 100 } = {}) {
  const m = readMap(map);
  const squares = Math.max(1, Math.min(m.cols, Math.round(targetMm / m.mmPerSquare)));
  return {
    squares,
    mm: squares * m.mmPerSquare,
    px: squares * m.pxPerSquare,
    label: `${squares} squares = ${squares * m.mmPerSquare} mm`
  };
}

export const isFloor = (floor, x, y) => Boolean(floor && floor[cellKey(x, y)]);

// Cheaper than Object.keys(o).length on a big object: stops at the first key.
const isEmpty = (o) => { for (const _k in o) return false; return true; };

/* ---------------------------- contacts ----------------------------
   hidden : the party has no idea it is there.
   ping   : an auspex has it — something is on the scope, at that bearing.
            The deck around it stays dark; only the contact shows.
   seen   : they have laid eyes on it, and the square is open. */
export const CONTACT_STATES = ['hidden', 'ping', 'seen'];
export const nextContactState = (st) => {
  const i = CONTACT_STATES.indexOf(st);
  return CONTACT_STATES[(i < 0 ? 0 : i + 1) % CONTACT_STATES.length];
};

export function readContact(v) {
  if (!v || typeof v !== 'object') return null;
  const name = String(v.name == null ? '' : v.name).slice(0, 60);
  if (!name) return null;      // a blip with no name is one nobody can act on
  return {
    name,
    encounterId: typeof v.encounterId === 'string' ? v.encounterId : null,
    hostileId: typeof v.hostileId === 'string' ? v.hostileId : null,
    state: CONTACT_STATES.includes(v.state) ? v.state : 'hidden'
  };
}

// An auspex reaches 50 metres in the books. A default, not a law — a GM
// with a different reading, or a jury-rigged augur, changes it.
export const AUSPEX_RANGE_M = 50;

/* An auspex sweep from a square. Everything in range that was hidden becomes
   a ping; what has already been seen stays seen, because a scope does not
   un-see a thing.

   A sweep is NOT line of sight: an auspex reads through a bulkhead, which is
   most of why it is worth carrying. Range alone bounds it. */
export function auspexSweep(map, from, rangeM = AUSPEX_RANGE_M) {
  const m = readMap(map);
  if (!from) return m.contacts;
  const reach = (Number(rangeM) || 0) / (m.metresPerSquare || 1);
  if (reach <= 0) return m.contacts;
  const out = {};
  for (const [k, c] of Object.entries(m.contacts)) {
    const p = parseKey(k);
    if (!p) continue;
    const near = Math.hypot(p.x - from.x, p.y - from.y) <= reach;
    out[k] = (near && c.state === 'hidden') ? { ...c, state: 'ping' } : c;
  }
  return out;
}

/* What the projection shows of a square once fog is on. The GM's own window
   draws the deck regardless; this is about what the table may see. */
export function fogStateAt(map, x, y) {
  const m = readMap(map);
  if (!m.fog) return 'open';
  return m.explored[cellKey(x, y)] ? 'open' : 'dark';
}

/* How many squares fit across a given number of screen pixels.

   PX PER SQUARE IS NOT THE THING TO CHANGE HERE. It is the projector's
   calibration — a square has to stay the size of the miniature bases
   standing on it — so filling a bigger screen means MORE SQUARES, not
   bigger ones. Scaling the squares to fit instead would silently decalibrate
   the table every time the window changed size. */
export const fitGrid = (availablePx, pxPerSquare) => {
  const px = Number(pxPerSquare) || EMPTY_MAP.pxPerSquare;
  const n = Math.floor((Number(availablePx) || 0) / px);
  return Math.max(MIN_GRID, Math.min(MAX_GRID, n));
};

/* --------------------------- revealing an area ---------------------------
   A deck is revealed a PLACE at a time, not a square at a time: the party
   steps into a hall and the hall is there, all of it.

   A DOOR IS A BOUNDARY, whatever state it is in. That is what makes the
   reveal behave the way a crawl should — a room lights up to its doorways
   and stops, and opening a door is what brings the next room in. If open
   doors let the flood through instead, the first one opened would cascade
   through every connected compartment on the deck and there would be no fog
   left to lift. The door's own square belongs to every region it touches,
   because you can see a door from either side of it. */

const isDoorAt = (m, x, y) => Boolean(m.doors[cellKey(x, y)]);

export function regionAt(map, pos) {
  const m = readMap(map);
  if (!pos) return [];
  const start = cellKey(pos.x, pos.y);
  if (!m.floor[start]) return [];
  // Clicking the door itself asks for what it joins, not for the doorway.
  if (m.doors[start]) return regionsAroundDoor(m, pos);

  const seen = new Set([start]);
  const out = [{ x: pos.x, y: pos.y }];
  const queue = [pos];
  while (queue.length) {
    const cur = queue.shift();
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const x = cur.x + dx, y = cur.y + dy;
      const k = cellKey(x, y);
      if (seen.has(k) || !m.floor[k]) continue;
      seen.add(k);
      out.push({ x, y });
      // A doorway is shown but not walked through: the room stops there.
      if (!isDoorAt(m, x, y)) queue.push({ x, y });
    }
  }
  return out;
}

/* What a door joins: the door, and every region that touches it. Both sides,
   not just the far one — a GM opening a bulkhead from an unexplored
   corridor should not have to click twice to see where they are standing. */
export function regionsAroundDoor(map, pos) {
  const m = readMap(map);
  if (!pos || !m.floor[cellKey(pos.x, pos.y)]) return [];
  const out = [{ x: pos.x, y: pos.y }];
  const seen = new Set([cellKey(pos.x, pos.y)]);
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    const x = pos.x + dx, y = pos.y + dy;
    const k = cellKey(x, y);
    if (!m.floor[k] || isDoorAt(m, x, y)) continue;
    for (const c of regionAt(m, { x, y })) {
      const ck = cellKey(c.x, c.y);
      if (seen.has(ck)) continue;
      seen.add(ck);
      out.push(c);
    }
  }
  return out;
}

/* The explored set with that area added. Revealing is additive — a deck is
   uncovered, never covered back up by accident. */
export function revealArea(map, pos) {
  const m = readMap(map);
  const explored = { ...m.explored };
  for (const c of regionAt(m, pos)) explored[cellKey(c.x, c.y)] = true;
  return explored;
}

/* ----------------------- what is still in view -----------------------
   `explored` is everywhere the party has ever seen, and it is never taken
   away. What the map DRAWS is that set narrowed to what can still be reached
   from where they are standing, passing through doors only while those doors
   are open.

   So shutting a bulkhead takes the room beyond it off the board, and opening
   it again brings the room back exactly as it was. Doing this by deleting
   squares from `explored` would work once and then lose the deck: reopening
   the door would show a room nobody had ever been in. Derived, it is free
   and reversible.

   With no viewpoint set — a deck being built, or one revealed by hand —
   everything explored is drawn, because there is nobody to be cut off from. */

export function openReach(map, from) {
  const m = readMap(map);
  const out = new Set();
  if (!from) return out;
  const start = cellKey(from.x, from.y);
  if (!m.floor[start]) return out;
  out.add(start);
  const queue = [from];
  // The square they stand on may itself be a doorway; they can still see out
  // of it either way, so the walk starts regardless of that door's state.
  while (queue.length) {
    const cur = queue.shift();
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const x = cur.x + dx, y = cur.y + dy;
      const k = cellKey(x, y);
      if (out.has(k) || !m.floor[k]) continue;
      out.add(k);
      const d = m.doors[k];
      // A shut door is seen from the side you are on and goes no further.
      if (!d || d.state === 'open') queue.push({ x, y });
    }
  }
  return out;
}

export function visibleExplored(map) {
  const m = readMap(map);
  if (!m.viewpoint) return m.explored;
  const reach = openReach(m, m.viewpoint);
  const out = {};
  for (const k of Object.keys(m.explored)) if (reach.has(k)) out[k] = true;
  return out;
}

/* The mirror of revealArea, for a place the GM wants taken back by hand. */
export function concealArea(map, pos) {
  const m = readMap(map);
  const explored = { ...m.explored };
  for (const c of regionAt(m, pos)) delete explored[cellKey(c.x, c.y)];
  return explored;
}

/* ------------------------- the saved map library -------------------------
   A GM builds decks between sessions and plays them later, so a map is a
   thing you keep, not a thing you have. The library is the GM's own, beside
   their encounters and journals.

   Publishing is what turns a drawing into a game: fog goes ON, what was
   explored is wiped, and every contact goes back to hidden. A map pushed
   with last session's fog still lifted would hand the party the floorplan. */
export const readSavedMap = (x) => {
  const src = x && typeof x === 'object' ? x : null;
  return {
    id: (src && typeof src.id === 'string' && src.id) || newMapId(),
    name: String((src && src.name) || '').slice(0, 80),
    map: readMap(src && src.map)
  };
};
export const readMapLibrary = (list) =>
  (Array.isArray(list) ? list : []).map(readSavedMap);

let mapSeq = 0;
const newMapId = () => 'bmap-' + Date.now().toString(36) + '-' + (mapSeq++).toString(36);

export const newBattleMap = (name = 'New deck') => readSavedMap({ name, map: EMPTY_MAP });

export function publishMap(saved) {
  const s = readSavedMap(saved);
  return {
    ...s.map,
    fog: true,
    explored: {},
    viewpoint: null,
    contacts: Object.fromEntries(
      Object.entries(s.map.contacts).map(([k, c]) => [k, { ...c, state: 'hidden' }])
    )
  };
}

/* --------------------------- building the deck --------------------------- */

/* The cells a stamp covers. Rotating by 90 or 270 swaps the footprint, which
   is the whole point of rotating a 1x5 corridor. Cells outside the map are
   dropped rather than clamped — clamping would fold a corridor back on itself
   into a stack of cells at the edge. */
export function stampCells(tile, pos, rotation = 0, map = EMPTY_MAP) {
  const t = typeof tile === 'string' ? tileById(tile) : tile;
  if (!t) return [];
  const turned = Math.abs(Math.round(Number(rotation) || 0) / 90) % 2 === 1;
  const w = turned ? t.h : t.w;
  const h = turned ? t.w : t.h;
  const x0 = Math.round(Number(pos && pos.x) || 0);
  const y0 = Math.round(Number(pos && pos.y) || 0);
  const out = [];
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < h; dy++) {
      const x = x0 + dx;
      const y = y0 + dy;
      if (x >= 0 && x < map.cols && y >= 0 && y < map.rows) out.push({ x, y });
    }
  }
  return out;
}

/* The cells a brush covers, centred on the cursor. Size 1 is a single
   square, which is what every tool did before; a bigger brush is how you
   clear a hall without a hundred clicks.

   An odd size is centred on the cursor. An even one has no true centre, so
   the cursor is the block's top-left corner — a 2-brush at (5,5) covers
   (5,5)..(6,6), and you paint away from where you clicked. The alternative
   is a block whose centre shifts with the direction of the drag, which is
   worse than a fixed bias you can learn in one stroke. */
export function brushCells(pos, size, map) {
  const m = map || EMPTY_MAP;
  if (!pos) return [];
  const n = Math.max(1, Math.min(25, Math.round(Number(size) || 1)));
  const back = Math.floor((n - 1) / 2);
  const out = [];
  for (let dx = 0; dx < n; dx++) {
    for (let dy = 0; dy < n; dy++) {
      const x = Math.round(pos.x) - back + dx;
      const y = Math.round(pos.y) - back + dy;
      if (x >= 0 && y >= 0 && x < m.cols && y < m.rows) out.push({ x, y });
    }
  }
  return out;
}

/* Paint cells on or off. THE FLOOR IS THE ONLY RECORD OF THE DECK: a stamped
   tile writes its cells here and is then forgotten. Keeping a separate list
   of placed tiles alongside it would mean two sources of truth for the same
   squares, and the next stamp rebuilding the floor from that list would
   silently erase everything painted by hand. */
export function paintCells(floor, cells, on = true) {
  const next = { ...(floor || {}) };
  for (const c of cells || []) {
    const k = cellKey(c.x, c.y);
    if (on) next[k] = true; else delete next[k];
  }
  return next;
}

/* ---------------------------- expanding a deck ----------------------------

   Growing a deck used to mean typing a bigger number into Cols, which added
   bare grid: a 20x20 boarding action became a 20x20 boarding action with a
   lot of void east of it, and the GM painted the rest by hand.

   This repeats what is already built instead. The CURRENT GRID is the tile —
   not the floor's bounding box — so the repeat keeps whatever margin was
   designed around the deck, and the number of copies is just the new size
   over the old.

   MIRRORED AT THE SEAMS by default, which is the whole reason this is worth
   doing: butt two copies of a deck together and every corridor that ran to
   the east edge dies against the west wall of its neighbour. Flip the odd
   blocks and those corridors meet their own mouths, so the repeat reads as
   one larger complex rather than as a deck photocopied four times.

   WHAT DOES NOT REPEAT, and why:
   - contacts: a hostile is one creature from one encounter. Copying it makes
     three more that the GM never placed and the auspex would ping.
   - explored: fog is a record of where the party has BEEN. Copying it reveals
     rooms nobody has walked into.
   Both are kept where they are and cropped to the new grid.

   Shrinking falls out of the same arithmetic — with a target smaller than the
   source, the modulo never wraps and the result is a plain crop. */
export function expandMap(map, cols, rows, { mirror = true } = {}) {
  const src = readMap(map);
  const w = int(cols, src.cols, MIN_GRID, MAX_GRID);
  const h = int(rows, src.rows, MIN_GRID, MAX_GRID);
  const sw = src.cols, sh = src.rows;

  const floor = {}, cover = {}, hazards = {}, doors = {}, markers = {}, ground = {};
  for (let x = 0; x < w; x++) {
    // Which copy this column falls in, and whether that copy is flipped.
    const lx = (mirror && Math.floor(x / sw) % 2) ? sw - 1 - (x % sw) : x % sw;
    for (let y = 0; y < h; y++) {
      const ly = (mirror && Math.floor(y / sh) % 2) ? sh - 1 - (y % sh) : y % sh;
      const from = cellKey(lx, ly);
      const to = cellKey(x, y);
      // Each layer is copied on its own rather than gated on the floor: a
      // marker may legitimately sit off the deck, and gating would drop it.
      if (src.floor[from]) floor[to] = true;
      if (src.cover[from]) cover[to] = src.cover[from];
      if (src.hazards[from]) hazards[to] = src.hazards[from];
      if (src.doors[from]) doors[to] = { ...src.doors[from] };
      if (src.markers[from]) markers[to] = { ...src.markers[from] };
      // The terrain repeats with the deck it is painted on, or an expanded
      // ice shelf would come back as deck plate.
      if (src.ground[from]) ground[to] = src.ground[from];
    }
  }

  const inside = (k) => {
    const p = parseKey(k);
    return Boolean(p) && p.x >= 0 && p.y >= 0 && p.x < w && p.y < h;
  };
  const explored = {};
  for (const k of Object.keys(src.explored)) if (inside(k)) explored[k] = true;
  const contacts = {};
  for (const [k, v] of Object.entries(src.contacts)) if (inside(k)) contacts[k] = v;
  const viewpoint = src.viewpoint && inside(cellKey(src.viewpoint.x, src.viewpoint.y))
    ? src.viewpoint : null;

  return {
    ...src,
    cols: w, rows: h,
    floor, cover, hazards, doors, markers, ground,
    explored, contacts, viewpoint
  };
}

/* What expanding to this size would do, for the button to say so before it is
   pressed. A GM about to turn one deck into nine should be told that. */
export function expandPlan(map, cols, rows) {
  const src = readMap(map);
  const w = int(cols, src.cols, MIN_GRID, MAX_GRID);
  const h = int(rows, src.rows, MIN_GRID, MAX_GRID);
  const across = Math.ceil(w / src.cols);
  const down = Math.ceil(h / src.rows);
  const copies = across * down;
  return {
    cols: w, rows: h, across, down, copies,
    // A partial copy is the normal case — 50 wide off a 30-wide deck is one
    // whole copy and two thirds of another — and it is worth saying, because
    // it is the one that cuts a room in half.
    partial: w % src.cols !== 0 || h % src.rows !== 0,
    shrinking: w < src.cols || h < src.rows
  };
}

/* --------------------------- walls, derived --------------------------- */

export const WALL_N = 1, WALL_E = 2, WALL_S = 4, WALL_W = 8;

/* Which sides of a floor cell face the void. Walls are never stored — a
   stored wall drifts out of step with the floor the moment a cell is erased,
   and then the map shows a bulkhead edging nothing. A void cell has no walls
   of its own; the wall belongs to the floor beside it. */
export function wallMask(floor, x, y) {
  if (!isFloor(floor, x, y)) return 0;
  return (isFloor(floor, x, y - 1) ? 0 : WALL_N)
    | (isFloor(floor, x + 1, y) ? 0 : WALL_E)
    | (isFloor(floor, x, y + 1) ? 0 : WALL_S)
    | (isFloor(floor, x - 1, y) ? 0 : WALL_W);
}

/* A corner pillar sits where two walls meet, and also where the diagonal
   alone is void — the inner corner of an L-shaped room, which a four-sided
   mask cannot see. dx/dy pick the corner (-1/-1 is north-west). */
export function cornerPillar(floor, x, y, dx, dy) {
  if (!isFloor(floor, x, y)) return false;
  return !isFloor(floor, x + dx, y)
    || !isFloor(floor, x, y + dy)
    || !isFloor(floor, x + dx, y + dy);
}

/* The painted extent of the deck, for centring and for export. Null when
   nothing is painted — an empty map has no bounds, and returning 0,0,0,0
   would centre the view on a corner. */
export function floorBounds(floor) {
  const keys = Object.keys(floor || {});
  if (!keys.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const k of keys) {
    const p = parseKey(k);
    if (!p) continue;
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY, cols: maxX - minX + 1, rows: maxY - minY + 1 };
}

/* ------------------------------ distance ------------------------------ */

// Straight-line, not squares-walked. Rogue Trader measures range with a tape
// and knows nothing about grids, so counting a diagonal as one square (the
// Chebyshev shortcut most VTTs use) would quietly make a diagonal shot 40%
// shorter than the same shot along a wall.
export const distanceSquares = (a, b) =>
  Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0));

export const distanceMetres = (a, b, metresPerSquare = 1) =>
  Math.round(distanceSquares(a, b) * (Number(metresPerSquare) || 1));

/* Does the shot have a lane? Walks the cells between the two points and
   reports the first thing in the way: a closed or jammed bulkhead, or void
   where there is no deck at all.

   This is a straight line between cell centres, NOT true line of sight — it
   has no notion of cover, corner cases or firing around a doorframe, and the
   GM overrules it freely. It answers one question honestly: is there a wall
   or a shut bulkhead between these two. */
export function lineBlocked(map, from, to) {
  return walkLine(readMap(map), from, to);
}

/* The same walk, on a map that has ALREADY been read. visibleCells asks this
   once per square on the board, and readMap rebuilds the whole floor, door
   and marker set each time it is called — re-reading inside the loop made a
   single redraw rebuild the map several hundred times and stalled the tab. */
function walkLine(m, from, to) {
  if (!from || !to) return null;
  const steps = Math.ceil(distanceSquares(from, to) * 2);
  if (steps === 0) return null;
  // Whether a deck has been painted at all is a property of the MAP, not of
  // the step: asking Object.keys(floor).length inside the loop walked every
  // key in the map on every square of every line, which on a large deck is
  // billions of operations for one redraw and freezes the tab.
  const built = !isEmpty(m.floor);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(from.x + (to.x - from.x) * t);
    const y = Math.round(from.y + (to.y - from.y) * t);
    if (x === to.x && y === to.y) break;       // the target's own square is not cover
    if (x === from.x && y === from.y) continue;
    const k = cellKey(x, y);
    const door = m.doors[k];
    if (door && doorBlocks(door.state)) {
      return { x, y, reason: 'door', state: door.state, kind: door.kind };
    }
    // Cover that stands head-high stops the lane; a railing does not, which
    // is the whole point of keeping the two apart.
    const cov = coverById(m.cover[k]);
    if (cov && cov.blocksSight) return { x, y, reason: 'cover', cover: cov.id };
    // Void only blocks on a map that has a deck painted at all; an unbuilt
    // map is open ground, not a solid block of rock.
    if (built && !m.floor[k]) return { x, y, reason: 'void' };
  }
  return null;
}

/* What the shot is worth: the distance, the band it falls in, the modifier
   that band carries, and anything in the way. weaponRangeM comes from
   parseWeaponStats(...).range, so a melee weapon (no range) reports
   'standard' and leaves the call to the GM rather than inventing a penalty. */
export function reachBetween({ from, to, map, weaponRangeM = null } = {}) {
  if (!from || !to) return null;
  const m = map ? readMap(map) : EMPTY_MAP;
  const squares = distanceSquares(from, to);
  const metres = distanceMetres(from, to, m.metresPerSquare);
  const band = rangeBand(metres, weaponRangeM);
  return {
    squares: Math.round(squares * 10) / 10,
    metres,
    band,
    // 'out' carries null, not 0: out of range is no shot at all, and a 0 here
    // would be applied to the roll as "no modifier".
    mod: RANGE_MODIFIERS[band],
    blocked: map ? walkLine(m, from, to) : null,
    // What the target is crouched behind, if anything.
    cover: map ? coverBetween(m, from, to) : null
  };
}

/* ============================ OVERLAYS ============================
   What the projector casts over the models: range bands, blast radii, flame
   cones, shield auras and what can actually be seen from a square. These are
   the reason the map is worth projecting at all — a template that would
   otherwise be a cardboard cut-out laid on the table and argued over.

   Every one of them returns plain geometry in grid squares. None of them
   knows or cares which model is standing where; the GM lines the overlay up
   on the table and reads off who is caught in it. */

/* The band boundaries for a weapon, as radii in squares, outermost first so
   they paint back-to-front without the near bands being buried.
   Point-blank is an absolute 2m and does not scale with the weapon, which is
   why it is listed separately rather than derived. */
export function rangeRings(weaponRangeM, map) {
  const m = readMap(map);
  const perSquare = m.metresPerSquare || 1;
  const toSquares = (metres) => metres / perSquare;
  const r = Number(weaponRangeM);
  const rings = [];
  if (Number.isFinite(r) && r > 0) {
    rings.push({ band: 'extreme', metres: r * 3, mod: RANGE_MODIFIERS.extreme });
    rings.push({ band: 'long', metres: r * 2, mod: RANGE_MODIFIERS.long });
    rings.push({ band: 'standard', metres: r, mod: RANGE_MODIFIERS.standard });
    rings.push({ band: 'short', metres: r / 2, mod: RANGE_MODIFIERS.short });
  }
  rings.push({ band: 'point_blank', metres: 2, mod: RANGE_MODIFIERS.point_blank });
  return rings
    .map((x) => ({ ...x, radius: toSquares(x.metres) }))
    .filter((x) => x.radius > 0)
    .sort((a, b) => b.radius - a.radius);
}

/* Every square within a radius in metres of a centre — a grenade's Blast, a
   flamer's spread, or a force field's aura. A square counts as caught if its
   CENTRE is inside the radius, which is the same measurement the GM would
   make with a tape and keeps the shape symmetrical. */
export function areaCells(map, centre, radiusM) {
  const m = readMap(map);
  if (!centre) return [];
  const perSquare = m.metresPerSquare || 1;
  const radius = (Number(radiusM) || 0) / perSquare;
  if (radius <= 0) return [];
  const out = [];
  const lo = Math.floor(-radius), hi = Math.ceil(radius);
  for (let dx = lo; dx <= hi; dx++) {
    for (let dy = lo; dy <= hi; dy++) {
      const x = centre.x + dx, y = centre.y + dy;
      if (x < 0 || y < 0 || x >= m.cols || y >= m.rows) continue;
      if (Math.hypot(dx, dy) <= radius) out.push({ x, y });
    }
  }
  return out;
}

/* A flame weapon's cone: everything within its range, in a wedge pointing at
   the target. Rogue Trader prints no template, so the half-angle is a knob
   rather than a constant — 15 degrees either side gives the narrow teardrop
   a flamer is usually read as, and a GM who rules it wider can say so. The
   origin square is always included: you are standing in your own fire. */
export function coneCells(map, origin, towards, rangeM, halfAngleDeg = 15) {
  const m = readMap(map);
  if (!origin || !towards) return [];
  const perSquare = m.metresPerSquare || 1;
  const reach = (Number(rangeM) || 0) / perSquare;
  if (reach <= 0) return [];
  const aim = Math.atan2(towards.y - origin.y, towards.x - origin.x);
  if (!Number.isFinite(aim)) return [];
  const half = (Math.abs(Number(halfAngleDeg)) || 30) * Math.PI / 180;
  const out = [];
  const span = Math.ceil(reach);
  for (let dx = -span; dx <= span; dx++) {
    for (let dy = -span; dy <= span; dy++) {
      const x = origin.x + dx, y = origin.y + dy;
      if (x < 0 || y < 0 || x >= m.cols || y >= m.rows) continue;
      const dist = Math.hypot(dx, dy);
      if (dist > reach) continue;
      if (dx === 0 && dy === 0) { out.push({ x, y }); continue; }
      // The smallest angle between the aim and this square, wrapped so a
      // cone pointing west does not split at the +/-pi seam and lose half of
      // itself.
      let delta = Math.atan2(dy, dx) - aim;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      if (Math.abs(delta) <= half) out.push({ x, y });
    }
  }
  return out;
}

/* Trims a template to what it can actually reach. Fire does not cross a
   sealed bulkhead and a grenade does not blast through a wall, so a cone or
   a blast radius is filtered against the same lineBlocked() the measuring
   tape uses. The centre is always kept — a template is always on its own
   square, and dropping it would leave the thrower standing in a hole in
   their own grenade. */
export function unobstructed(map, centre, cells) {
  const m = readMap(map);
  if (!centre) return [];
  return (cells || []).filter((c) =>
    (c.x === centre.x && c.y === centre.y) || !walkLine(m, centre, c));
}

/* The cover a shot has to cross, as Armour Points. Sight-blocking cover
   never reaches here — that stops the shot outright — so this reports the
   low stuff a target crouches behind, including cover on the target's own
   square, which is where most of it is. The highest wins; cover does not
   stack in this system. */
export function coverBetween(map, from, to) {
  const m = readMap(map);
  if (!from || !to) return null;
  const steps = Math.ceil(distanceSquares(from, to) * 2);
  let best = null;
  const consider = (x, y) => {
    const c = coverById(m.cover[cellKey(x, y)]);
    if (c && (!best || c.ap > best.ap)) best = c;
  };
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(from.x + (to.x - from.x) * t);
    const y = Math.round(from.y + (to.y - from.y) * t);
    consider(x, y);
  }
  consider(to.x, to.y);
  return best;
}

/* Keeps a template on the deck. A blast or a field spilling into the void
   beside a corridor is drawn over squares that are not part of the map at
   all, which on a projector reads as the template covering a wall. On an
   unpainted map there is no deck to stay on, so everything passes. */
export function onDeck(map, cells) {
  const m = readMap(map);
  if (isEmpty(m.floor)) return cells || [];
  return (cells || []).filter((c) => m.floor[cellKey(c.x, c.y)]);
}

/* What can be seen from a square: every cell within a radius that has an
   unblocked lane to the origin. Uses the same lineBlocked() the measuring
   tape does, so the overlay and the ruler can never disagree about whether a
   bulkhead is in the way.

   Still a straight line between centres, not true line of sight — no cover,
   no corner cases. It answers "is there a wall between these two", which is
   the question that actually comes up at the table. */
export function visibleCells(map, origin, radiusM = null) {
  const m = readMap(map);
  if (!origin) return [];
  const perSquare = m.metresPerSquare || 1;
  const limit = radiusM === null ? Infinity : (Number(radiusM) || 0) / perSquare;
  if (limit <= 0) return [];
  const out = [];
  for (let x = 0; x < m.cols; x++) {
    for (let y = 0; y < m.rows; y++) {
      if (Math.hypot(x - origin.x, y - origin.y) > limit) continue;
      if (!walkLine(m, origin, { x, y })) out.push({ x, y });
    }
  }
  return out;
}

/* Pulls the numbers an overlay needs straight off a weapon's catalogue line,
   so a flamer's reach and a grenade's Blast come from the same string the
   damage does rather than being typed in again. */
export function weaponOverlay(stats) {
  // The field figures are read off the raw line rather than the parsed
  // qualities: parseWeaponStats splits a segment on ", " as well as on the
  // separator, which cuts "aura, 5 m" into two useless halves.
  const text = String(stats || '');
  const parsed = parseWeaponStats(stats);
  const qualities = (parsed.qualities || []).join(' ');
  const blast = /blast\s*\((\d+)\)/i.exec(qualities);
  const rating = /protection rating\s*(\d+)/i.exec(text);
  const aura = /aura,?\s*(\d+)\s*m/i.exec(text);
  return {
    range: parsed.range,
    // Blast (X) is a radius in metres from the point of impact.
    blastM: blast ? Number(blast[1]) : null,
    isFlame: /flame/i.test(qualities),
    // A force field, which is not a weapon and never draws a shot.
    isField: Boolean(rating),
    protectionRating: rating ? Number(rating[1]) : null,
    // A field with no aura figure covers its bearer and nobody else, which
    // is one square — not nothing, or it would draw no overlay at all.
    auraM: rating ? (aura ? Number(aura[1]) : 1) : null,
    qualities: parsed.qualities || []
  };
}

/* Which overlay a thing gets, decided by the thing itself. There is no
   picker for this: a flamer throws a cone and a lasgun throws a line
   whatever anyone selects from a menu, and asking the GM to say so again is
   a chance to say it wrong in front of the table. */
export function overlayKindFor(ov) {
  if (!ov) return null;
  if (ov.isField) return 'field';
  if (ov.isFlame) return 'cone';
  return 'beam';            // blast weapons draw a beam AND a burst
}

/* Deployment zones are drawn, not occupied: a shaded band at each end of the
   deck telling the players where to set their models down. The map never
   knows which model is where — that is what the models are for. */
export function deploymentRows(map, depth = 1) {
  const m = readMap(map);
  const d = Math.max(1, Math.min(Math.floor(m.rows / 2), Math.round(depth)));
  return {
    hostile: { y0: 0, y1: d - 1 },
    crew: { y0: m.rows - d, y1: m.rows - 1 }
  };
}
