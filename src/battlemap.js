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
import { spriteRole } from './spritesheet.js';
import { readBackdrop } from './backdrop.js';

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
    /* The ground's sixteen props, as one 4x4 sheet, already keyed to
       transparency by the browser that made it. A string when this ground has
       props and null when it has none, and null is the ordinary case: every
       ground saved before props existed has none, and uploading a floor does
       not generate any. The index entry carries a boolean instead (see
       api/grounds.js) so the picker can say which grounds are dressed without
       hauling the sheets about. */
    sprites: typeof src.sprites === 'string'
      && /^data:image\/(png|jpeg|webp);base64,/.test(src.sprites)
      && src.sprites.length <= MAX_CUSTOM_SPRITES ? src.sprites : null,
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
  /* THIN WALLS, between two squares that are both deck. The walls derived
     from the floor can only stand where deck meets void, which is how a deck
     built from tiles is drawn; a map made in another program (or a picture
     laid under the grid) has its walls ON the grid lines, between two rooms
     that are both floor. Stored once per edge, on the square west or north of
     it: bit 1 is the square's east side, bit 2 its south side. They stop
     what a wall stops — the fog's rooms, sight, a blast, the air. */
  walls: {},            // { 'x,y': 1 | 2 | 3 }
  /* A PICTURE FLOOR: one image or video laid over a rectangle of the grid in
     place of the tiled ground, the way a battle map from another program or a
     moving TV map is played. The file itself stays on the computer that runs
     the table (see localfiles.js); the deck records which file and where it
     lies, in squares. See backdrop.js. */
  backdrop: null,
  // Rain falling, smoke drifting, fire and lumens flickering. A deck's own
  // choice, on unless switched off; never for anyone who asks for less motion.
  motion: true,
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
  obscuring: {},        // { 'x,y': densityId } — foliage and smoke, see OBSCURING
  lighting: 'clear',    // see LIGHTING_PRESETS
  markers: {},          // { 'x,y': { type, label } } — scenery
  // Fog of war. `explored` is what the party has seen; `fog` is whether the
  // map is drawn with it. The two are separate so turning fog off to check
  // something does not throw away what was explored.
  explored: {},         // { 'x,y': true } — everywhere the party has EVER seen
  // The deck's PLAN, downloaded from a cogitator: squares whose layout the
  // party knows without having been there. Drawn under the fog as a
  // blueprint — walls and doors, nothing of what is in the rooms.
  mapped: {},           // { 'x,y': true }
  // Light painted onto squares, over the deck's own `lighting`: a dark
  // corridor in a lit ship, a smoke-filled room. { 'x,y': lightingId }
  light: {},
  // Where they are now, set by the last reveal. What is DRAWN is `explored`
  // narrowed to what can still be walked to from here through open doors, so
  // shutting a bulkhead takes the room beyond it off the board and opening
  // it again brings the room back. Nothing is forgotten to do that — see
  // visibleExplored.
  viewpoint: null,
  /* THE STARTING ROOM. A square inside the room the party arrives in, chosen
     by the GM while the deck is built. Publishing a deck for play lights that
     room and puts the party in it, so a session opens on somewhere rather than
     on a black rectangle. null means nobody chose, and the deck starts dark. */
  start: null,
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
// A prop sheet is sixteen tokens in one 1024px image, and mostly transparent,
// which WebP packs hard. Its own ceiling rather than the floor's: the two are
// stored apart and a sheet going over should not cost a ground its floor.
export const MAX_CUSTOM_SPRITES = 1_500_000;

/* The largest grid a deck may be.

   Not a canvas limit any more: the map is drawn a window at a time (see
   BattleMap.jsx), so a deck can be far wider than any browser could hold as
   one image, and a square keeps the size the projector was calibrated to.
   What bounds it now is the cost of the per-square records the editor works
   on, and the size a saved deck may take once packed (packMap). 500 x 500 is
   a quarter of a million squares: a district, a hive spire's footprint, a
   forest. */
/* Zoom is a VIEW control: it scales what is already drawn so the GM can read
   a corner or take in a whole deck. It is deliberately not stored on the map
   — px/square is the projector's calibration and must not move — and it is
   bounded because a canvas scaled past a few hundred per cent is a wall of
   blur, and one scaled under a fiftieth is a dot. */
export const MIN_ZOOM = 0.02;
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

export const MAX_GRID = 500;
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

/* What a CLICK on a door does: opens it, or shuts it. Two states, because a
   door at a table is a thing you open and close and that is the whole of it.

   Jamming is not in the cycle. It is a thing the GM decides — the mechanism is
   wrecked, the lock is fused — and a state nobody can click past by accident:
   cycling through it meant every second click on a door left it jammed, which
   blocks like a shut door and reads like one, so the party was stopped by a
   door the GM never meant to jam. It is set by name, from the menu. */
export const toggledDoorState = (s) => (s === 'open' ? 'closed' : 'open');
export const doorBlocks = (state) => state !== 'open';

/* A bulkhead and a hatch are both doors and differ in what it takes to get
   through one: a blast bulkhead is a wall with a motor, a hatch is a crawlway
   cover. The AP is what the GM prices breaking it at. */
export const DOOR_KINDS = [
  { id: 'bulkhead', name: 'Bulkhead', ap: 12,
    note: 'A powered blast door. Breaking one is a job, not an action.' },
  { id: 'hatch', name: 'Hatch', ap: 6,
    note: 'A crawl-through access cover \u2014 maintenance ways, shafts, cargo holds.' },
  /* An airlock is a door like the others until it is open on the hull: then
     it is a hole in the ship, and everything behind it is pulled toward it
     exactly as it would be toward a breach (see ventField). */
  { id: 'airlock', name: 'Airlock', ap: 16,
    note: 'Opened on the hull, it vents everything behind it like a breach.' }
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
  const d = { kind: doorKindById(v.kind).id, state: v.state };
  // Which side of its square the leaf is drawn on, for a door that stands in
  // a doorway on a grid line (a map from another program; see uvtt.js). A
  // door without one fills its square, as every door drawn here does.
  if (DOOR_EDGES.includes(v.edge)) d.edge = v.edge;
  return d;
}
export const DOOR_EDGES = ['n', 'e', 's', 'w'];
// A side, turned a quarter at a time clockwise.
const turnEdge = (e, t) => DOOR_EDGES[(DOOR_EDGES.indexOf(e) + t) % 4];

/* ---------------------------- cover ----------------------------
   Something standing ON a square rather than the deck itself. The one that
   matters is blocksSight: a cargo stack is a wall you cannot see past, a
   railing is a thing you crouch behind and shoot over, and treating them
   alike would either seal a gantry or make a hold transparent. `ap` is the
   Armour Points the cover adds against a shot that crosses it. */
/* `directional` is cover that RUNS one way across its square rather than
   filling it: a railing has a length and two sides, and the GM says which way
   it lies. The other three are bulk — a crate stack occupies its square from
   every approach — so they have no angle to choose, do not record one, and
   are scattered by position instead (see spriteTurn in spritesheet.js, whose
   `turn` flag is the same fact seen from the art's side: a picture that may
   be freely turned is a picture with no front). */
export const COVER_TYPES = [
  { id: 'low', name: 'Low barrier or railing', ap: 4, blocksSight: false, directional: true,
    note: 'Crouch behind it and shoot over it.' },
  { id: 'crates', name: 'Cargo crates', ap: 8, blocksSight: true, directional: false,
    note: 'Stacked high enough to hide behind.' },
  { id: 'machinery', name: 'Machinery or plating', ap: 12, blocksSight: true, directional: false,
    note: 'Pipework, cogitator banks, loose hull plate.' },
  { id: 'pillar', name: 'Structural pillar', ap: 16, blocksSight: true, directional: false, sturdy: true,
    note: 'Part of the ship. It does not move and it does not break.' },
  /* Cover that is also a bomb. `blastM` is how far the blast reaches when it
     goes up — a house number: Rogue Trader gives a frag grenade Blast (4)
     and a tank of promethium is at least that. Detonating it takes the tank
     off the deck and sets everything in reach burning. */
  { id: 'tank', name: 'Promethium tanks', ap: 6, blocksSight: true, directional: false,
    volatile: true, blastM: 4,
    note: 'Solid enough to hide behind, until it is hit hard enough. Right-click to set it off.' }
];
export const coverById = (id) => COVER_TYPES.find((c) => c.id === id) || null;

/* WHICH WAY THE COVER LIES.

   A railing has a direction. It runs along one edge of a square and you
   crouch on one side of it, and the art for it — a barrier, a low wall —
   is drawn running left to right. Laid down the length of a corridor that
   runs north, every one of them is across the corridor rather than along it,
   which is not what the GM drew and not what the table will read.

   So a barrier is stored as one of TWO states: 0 lying across its square as
   the art is drawn, 1 standing up it, which is the same picture turned a
   quarter. Two and not four quarter turns, because a barrier turned a half
   turn is the same barrier seen from the other side — the GM is choosing
   between — and |, and a control offering four of them would offer two pairs
   of identical pictures.

   A cover square was once the bare type id, and still reads as one: every
   deck saved before this opens with its crates where they were. It is also
   WRITTEN as one unless it is turned — writeCover gives back the plain string
   for turn 0 — so a deck of a thousand untouched crates stores exactly what
   it stored before rather than a thousand little objects.

   Only DIRECTIONAL cover keeps an angle, and both of these enforce that
   rather than leaving it to the callers. A crate stack has no front, so
   recording which way round it is would be a fiction — and an expensive one:
   turning a deck of five hundred crates would turn five hundred bare strings
   into five hundred little records to say nothing at all. */
// 0 across, 1 standing up. Anything else folds into one of the two, so a
// deck turned twice or a hand-edited record cannot hold a third state.
const lie = (v) => {
  const t = Math.round(Number(v));
  return Number.isFinite(t) ? ((t % 2) + 2) % 2 : 0;
};

export function readCover(v) {
  const raw = typeof v === 'string' ? { id: v, turn: 0 }
    : (v && typeof v === 'object' ? v : null);
  const type = raw && coverById(raw.id);
  if (!type) return null;
  // WEAR: Armour Points shot off it. Never more than it had — at that point
  // it is gone, and taking it off the deck is the caller's job (wearCover).
  const w = Math.round(Number(raw.wear));
  const wear = Number.isFinite(w) ? Math.max(0, Math.min(type.ap, w)) : 0;
  return { id: raw.id, turn: type.directional ? lie(raw.turn) : 0, wear };
}

// Still the plain string for untouched cover, so a deck of a thousand crates
// stores what it always stored; a record only where something is turned or
// worn.
export const writeCover = (id, turn = 0, wear = 0) => {
  const type = coverById(id);
  if (!type) return id;
  const t = type.directional ? lie(turn) : 0;
  const w = Math.max(0, Math.min(type.ap, Math.round(Number(wear)) || 0));
  if (!t && !w) return id;
  const rec = { id };
  if (t) rec.turn = 1;
  if (w) rec.wear = w;
  return rec;
};


// The cover type on a square, whichever form the square is stored in. Most
// callers want the type and not the angle: it is the type that blocks sight
// and prices the Armour Points.
export const coverAt = (v) => {
  const rec = readCover(v);
  if (!rec) return null;
  const type = coverById(rec.id);
  // The cover as it stands NOW: worn cover gives what it has left.
  return rec.wear ? { ...type, ap: type.ap - rec.wear, wear: rec.wear } : type;
};

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
    note: 'A ruptured conduit. Crossing it risks being Stunned.' },
  /* The warp itself, as terrain: a tear where the veil has worn through. It
     has no token on the sheets and is drawn churning instead, and it carries
     the warp's own tables with it — right-click one on the map to roll
     Psychic Phenomena, or Perils of the Warp. What it costs anyone who
     lingers is the GM's call, as radiation's is. */
  { id: 'warp', name: 'Warp rift', colour: '#b45cff', condition: null,
    note: 'The veil is torn. Right-click it to roll Phenomena or Perils, spread it, or seal it; the GM sets the toll on anyone who lingers.' },
  // Gravity has failed. The rules for it are the GM's: this says where.
  { id: 'zerog', name: 'Zero gravity', colour: '#9fd8ff', condition: null,
    note: 'The gravity plating is dead. Movement is a drift and stopping takes an Agility Test, as the GM rules.' }
];
export const hazardById = (id) => HAZARD_TYPES.find((h) => h.id === id) || null;

/* ---------------------------- obscuring terrain ----------------------------
   Foliage, smoke and the like: not cover (nobody crouches behind it for
   Armour Points) but it eats sight. Sight carries this far INTO the stuff
   before it stops dead, and the denser it is the sooner. Rogue Trader gives
   no figure — only a -20 to hit for fog, mist, shadow or smoke (p.248) — so
   the distances are house numbers borrowed from Inquisitor's vision rules,
   and the GM can edit the table. Folded into lineBlocked, so the ruler, the
   line-of-sight overlay and the fog reveal all see it. */
export const OBSCURING = [
  { id: 'light', name: 'Light foliage / thin smoke', blocksAfterM: 7, colour: '#7fbf6a', alpha: 0.18 },
  { id: 'medium', name: 'Medium foliage / smoke', blocksAfterM: 5, colour: '#5f9f55', alpha: 0.3 },
  { id: 'heavy', name: 'Dense foliage / thick smoke', blocksAfterM: 4, colour: '#3f7f40', alpha: 0.45 }
];
export const obscuringById = (id) => OBSCURING.find((o) => o.id === id) || null;

/* The light a deck is fought in. Each preset names the combat situation
   modifiers it implies (groundcombat.js SITUATION_MODIFIERS): Rogue Trader
   makes shooting into fog, mist, shadow or smoke Hard (-20), harsh weather
   Hard (-20), and total darkness worse. */
export const LIGHTING_PRESETS = [
  { id: 'clear', name: 'Clear', situationIds: [] },
  { id: 'dim', name: 'Fog, Mist or Shadow', situationIds: ['poor_visibility'] },
  { id: 'smoke', name: 'Smoke', situationIds: ['poor_visibility'] },
  { id: 'rain', name: 'Rain or Ash Storm', situationIds: ['bad_weather'] },
  { id: 'dark', name: 'Total Darkness', situationIds: ['total_darkness'] }
];
export const lightingById = (id) => LIGHTING_PRESETS.find((p) => p.id === id) || LIGHTING_PRESETS[0];

export const MARKER_TYPES = [
  { id: 'breach', name: 'Torpedo breach', colour: '#ff5722' },
  { id: 'objective', name: 'Objective', colour: '#f1c40f' },
  { id: 'hazard', name: 'Hazard (fire, vacuum)', colour: '#e74c3c' },
  { id: 'deploy', name: 'Deployment point', colour: '#3498db' },
  // Not scenery: a thing the party can work. See TERMINAL_STATES below.
  { id: 'cogitator', name: 'Cogitator terminal', colour: '#4dd6ff' },
  // A fixed gun with a facing and an arc; the deck's terminals can switch the
  // whole defence grid off. See turretCells.
  { id: 'turret', name: 'Sentry turret', colour: '#e67e22' },
  // Holy ground round it: a warp rift cannot spread into it. See sanctified.
  { id: 'shrine', name: 'Shrine (sanctified ground)', colour: '#f1c40f' },
  // One end of a crawlway. Two vents share a `pair` and lead to each other.
  { id: 'vent', name: 'Vent / crawlway', colour: '#95a5a6' }
];
export const markerTypeById = (id) => MARKER_TYPES.find((m) => m.id === id) || MARKER_TYPES[0];
/* A cogitator terminal's state: locked, accessed, or burnt out. Declared up
   here beside the marker kinds because readMap reads it, and readMap runs
   long before the terminal functions further down are reached. */
export const TERMINAL_STATES = ['locked', 'open', 'dead'];
// What a sentry turret mounts unless the GM says otherwise: a heavy stubber,
// Heavy, 120m in the armoury. Declared here for the same reason.
export const TURRET_WEAPON = { name: 'heavy stubber', rangeM: 120 };

/* A TARGET is an Objective marker laid on a hostile to pick it out on the
   screen, and it carries a bonus to Ballistic Skill for whoever shoots at that
   square. An Objective without the bonus is plain scenery ("the vault"), so the
   bonus lives on the marker, not on the type: nothing that was already on a
   deck turns into a target.

   Rogue Trader gives no number for a marked target, so +10 is a house figure,
   the same size as an Aim, and the GM can set +5, +10 or +20 on any one. */
export const TARGET_BONUS = 10;
export const TARGET_BONUS_CAP = 30;
export const targetBonusAt = (map, pos) => {
  const mk = map && map.markers && pos ? map.markers[`${pos.x},${pos.y}`] : null;
  return mk && Number.isFinite(mk.bonus) ? mk.bonus : 0;
};

/* ----------------------- big decks: clean layers, packed storage -----------------------

   A deck is a record per square, and a big one is a quarter of a million of
   them. Two things follow, and both live here so the rest of the code does not
   have to know.

   CLEAN LAYERS. readMap used to walk every square of every layer on every
   call, and it is called on every render and every edit. A layer it has already
   walked is remembered (by identity, never by contents) and handed straight
   back, so reading a map costs what changed rather than what exists. Layers
   are never mutated in place anywhere, so identity is a safe key. A layer a
   caller builds from a clean one with only well-formed squares (paintCells,
   keepClean) joins the set without a second walk.

   PACKED STORAGE. Saved to the library, kept in the shared ship document and
   sent over the wire, a layer is written as runs along its rows instead of a
   key per square — a filled 500 x 500 floor is a few kilobytes, not three
   megabytes. readMap accepts either form, so a deck saved before this was
   written still opens, and nothing that reads a map needs to ask which it is. */
const CLEAN = new WeakSet();

export function keepClean(base, next) {
  if (base && typeof base === 'object' && CLEAN.has(base)) CLEAN.add(next);
  return next;
}

const isPackedLayer = (v) => Boolean(v) && typeof v === 'object' && v.rle === 1
  && Array.isArray(v.runs) && Array.isArray(v.vals);

// A packed layer back to { 'x,y': value }. Bounded by the largest grid, so a
// hostile or corrupt runs array cannot ask for a billion squares.
function unpackLayer(raw) {
  if (!isPackedLayer(raw)) return raw && typeof raw === 'object' ? raw : {};
  const out = {};
  const { runs, vals } = raw;
  let y = 0, end = -1;
  for (let i = 0; i + 3 < runs.length; i += 4) {
    const dy = Math.round(Number(runs[i]));
    const dx = Math.round(Number(runs[i + 1]));
    const len = Math.round(Number(runs[i + 2]));
    const v = vals[Number(runs[i + 3])];
    if (!Number.isFinite(dy) || !Number.isFinite(dx) || !Number.isFinite(len)) continue;
    y += dy;
    const x0 = dy > 0 ? dx : end + 1 + dx;
    const x1 = x0 + Math.max(0, len);
    end = x1;
    if (v === undefined || y < 0 || y >= MAX_GRID) continue;
    const lo = Math.max(0, x0);
    const hi = Math.min(MAX_GRID - 1, x1);
    for (let x = lo; x <= hi; x++) out[x + ',' + y] = v;
  }
  return out;
}

function layer(raw, build) {
  const plain = unpackLayer(raw);
  if (CLEAN.has(plain)) return plain;
  const out = build(plain);
  CLEAN.add(out);
  return out;
}

/* One layer as runs, four numbers each: how many rows down from the last run,
   how far along (from the left edge for the first run on a row, from the end of
   the previous run after that), how many squares past the first it covers, and
   which of the distinct values (listed once in `vals`) it holds. Sorted by row
   then column. A run is a row-wise stretch of neighbours holding one value.
   Differences rather than positions, because small numbers are short ones: a
   big deck's layers come out about half the size they would otherwise. */
export function packLayer(layerObj) {
  const cells = [];
  for (const [k, v] of Object.entries(layerObj || {})) {
    const p = parseKey(k);
    if (p) cells.push([p.y, p.x, v]);
  }
  cells.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const vals = [];
  const index = new Map();
  const runs = [];
  let cur = null;
  let py = 0, pend = -1;
  const flush = () => {
    if (!cur) return;
    const dy = cur.y - py;
    runs.push(dy, dy > 0 ? cur.x0 : cur.x0 - pend - 1, cur.x1 - cur.x0, cur.vi);
    py = cur.y; pend = cur.x1;
  };
  for (const [y, x, v] of cells) {
    const id = typeof v === 'object' && v !== null ? JSON.stringify(v) : v;
    let vi = index.get(id);
    if (vi === undefined) { vi = vals.length; vals.push(v); index.set(id, vi); }
    if (cur && cur.y === y && cur.x1 + 1 === x && cur.vi === vi) {
      cur.x1 = x;
    } else {
      flush();
      cur = { y, x0: x, x1: x, vi };
    }
  }
  flush();
  return { rle: 1, vals, runs };
}

// Layers that run into the thousands on a big deck. Doors, markers and
// contacts are a handful of records each and stay as they are.
const PACKED_LAYERS = ['floor', 'ground', 'cover', 'hazards', 'obscuring', 'explored', 'mapped', 'light', 'walls'];
const PACK_FROM = 64;     // below this a plain layer is smaller and easier to read

/* The map as it should be stored or sent. Round-trips exactly through readMap.
   Remembered per map object: the autosave, the library write and the bridge
   write all ask for the same map within a second of each other, and packing a
   big one is the slowest thing here. */
const PACKED = new WeakMap();
export function packMap(map) {
  if (map && typeof map === 'object' && PACKED.has(map)) return PACKED.get(map);
  const m = readMap(map);
  const out = { ...m };
  for (const key of PACKED_LAYERS) {
    if (Object.keys(m[key]).length >= PACK_FROM) out[key] = packLayer(m[key]);
  }
  if (map && typeof map === 'object') PACKED.set(map, out);
  return out;
}

/* The ground-combat state with its map packed, for the shared ship document
   and the autosave. Anything without a map is returned as it is. */
export function packCombat(combat) {
  const g = combat && combat.ground;
  if (!g || !g.map) return combat;
  return { ...combat, ground: { ...g, map: packMap(g.map) } };
}

/* The same state with the map left out, for comparing two states cheaply:
   stringifying a big map just to find out whether it changed is the cost
   packing exists to avoid. */
export function combatSansMap(combat) {
  const g = combat && combat.ground;
  if (!g || !g.map) return combat;
  const { map, ...rest } = g;
  return { ...combat, ground: rest };
}

// A saved deck with its map packed. Anything else about the entry, and an
// entry with no map yet, is left exactly as it was.
export const packSavedMap = (x) => (x && typeof x === 'object' && x.map && typeof x.map === 'object'
  ? { ...x, map: packMap(x.map) } : x);

// Anything absent is defaulted rather than trusted, the same way readBlueprint
// treats a blueprint saved before a field existed.
export function readMap(m) {
  const src = m && typeof m === 'object' ? m : {};

  const floor = layer(src.floor, (raw) => {
    const out = {};
    for (const k of Object.keys(raw)) if (raw[k] && parseKey(k)) out[k] = true;
    return out;
  });
  const doors = layer(src.doors, (raw) => {
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      if (!parseKey(k)) continue;
      const d = readDoor(v);
      if (d) out[k] = d;
    }
    return out;
  });
  const cover = layer(src.cover, (raw) => {
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      // Canonical, not normalised: a turned square keeps its object and an
      // untouched one keeps its bare string, so reading a map and writing it
      // back does not inflate every crate on the deck into a record.
      const c = readCover(v);
      if (parseKey(k) && c) out[k] = writeCover(c.id, c.turn, c.wear);
    }
    return out;
  });
  const hazards = layer(src.hazards, (raw) => {
    const out = {};
    for (const [k, v] of Object.entries(raw)) if (parseKey(k) && hazardById(v)) out[k] = v;
    return out;
  });
  const obscuring = layer(src.obscuring, (raw) => {
    const out = {};
    for (const [k, v] of Object.entries(raw)) if (parseKey(k) && obscuringById(v)) out[k] = v;
    return out;
  });
  /* Ground ids are KEPT AS WRITTEN, exactly as the deck's own theme is: a
     saved ground's id is unknown to this module, and matching against the
     built-in list here is the bug that silently moved every deck built on a
     generated floor back to the default. resolveTheme decides, at the point
     of drawing, where the library is actually in hand. */
  const ground = layer(src.ground, (raw) => {
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      if (parseKey(k) && typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, 64);
    }
    return out;
  });
  const explored = layer(src.explored, (raw) => {
    const out = {};
    for (const k of Object.keys(raw)) if (raw[k] && parseKey(k)) out[k] = true;
    return out;
  });
  const light = layer(src.light, (raw) => {
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      if (parseKey(k) && LIGHTING_PRESETS.some((p2) => p2.id === v)) out[k] = v;
    }
    return out;
  });
  const mapped = layer(src.mapped, (raw) => {
    const out = {};
    for (const k of Object.keys(raw)) if (raw[k] && parseKey(k)) out[k] = true;
    return out;
  });
  const walls = layer(src.walls, (raw) => {
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      const bits = Math.round(Number(v)) & (WALL_EAST | WALL_SOUTH);
      if (bits && parseKey(k)) out[k] = bits;
    }
    return out;
  });
  const contacts = layer(src.contacts, (raw) => {
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      if (!parseKey(k)) continue;
      const c = readContact(v);
      if (c) out[k] = c;
    }
    return out;
  });
  const markers = layer(src.markers, (raw) => {
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      if (!parseKey(k) || !v || typeof v !== 'object') continue;
      const rec = { type: markerTypeById(v.type).id, label: String(v.label || '') };
      if (rec.type === 'cogitator') rec.state = TERMINAL_STATES.includes(v.state) ? v.state : 'locked';
      if (rec.type === 'turret') {
        rec.state = v.state === 'off' ? 'off' : 'active';
        const f = Math.round(Number(v.facing));
        rec.facing = Number.isFinite(f) ? ((f % 8) + 8) % 8 : 0;
        rec.weapon = typeof v.weapon === 'string' && v.weapon.trim() ? v.weapon.trim().slice(0, 60) : TURRET_WEAPON.name;
        const r = Number(v.rangeM);
        rec.rangeM = Number.isFinite(r) && r > 0 ? Math.min(1000, Math.round(r)) : TURRET_WEAPON.rangeM;
      }
      if (rec.type === 'vent') rec.pair = typeof v.pair === 'string' && v.pair ? v.pair.slice(0, 24) : null;
      // Only a number that means something rides along: a target's bonus.
      const bonus = Number(v.bonus);
      if (v.bonus != null && Number.isFinite(bonus)) {
        rec.bonus = Math.max(-TARGET_BONUS_CAP, Math.min(TARGET_BONUS_CAP, Math.round(bonus)));
      }
      out[k] = rec;
    }
    return out;
  });
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
    lighting: lightingById(src.lighting).id,
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
    // Kept only while it is still a square of the deck: erasing the room it
    // was in leaves a start that points at the void.
    start: (() => {
      const v = src.start;
      if (!v || typeof v !== 'object') return null;
      const x = Math.round(Number(v.x)), y = Math.round(Number(v.y));
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return floor[cellKey(x, y)] ? { x, y } : null;
    })(),
    floor, doors, cover, hazards, obscuring, markers, explored, mapped, light, contacts, ground, walls,
    backdrop: readBackdrop(src.backdrop),
    motion: src.motion !== false
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

/* Which prop pictures a deck needs, as "<ground>/<role>" strings.

   Worked out from what is actually ON the deck rather than loaded wholesale:
   each ground has sixteen tokens weighing about half a megabyte together, and
   a deck with two doors and no cover has no business fetching the crates, the
   fire and the foliage. The ground is per square, so a crate standing on a
   square painted with ice is an ICE crate — the props follow the floor they
   are standing on, which is the whole point of having a set per ground.

   Expects a map already through readMap. Returns a sorted array so callers can
   join it into a cache key and compare two of them cheaply. */
export function tokensNeeded(map) {
  const m = map && typeof map === 'object' ? map : EMPTY_MAP;
  const base = typeof m.theme === 'string' ? m.theme : DEFAULT_THEME;
  const out = new Set();
  const want = (k, kind, id, state) => {
    const at = parseKey(k);
    if (!at) return;
    const role = spriteRole(kind, id, state, at);
    if (!role) return;
    out.add(((m.ground || {})[k] || base) + '/' + role);
  };
  for (const [k, v] of Object.entries(m.doors || {})) {
    if (v) want(k, 'door', v.kind, v.state);
  }
  for (const [k, v] of Object.entries(m.cover || {})) {
    const c = readCover(v);
    if (c) want(k, 'cover', c.id);
  }
  for (const [k, v] of Object.entries(m.hazards || {})) want(k, 'hazard', v);
  for (const [k, v] of Object.entries(m.obscuring || {})) want(k, 'obscure', v);
  // A cogitator terminal is drawn as the ground's own machinery, a vent as its
  // grating.
  for (const [k, v] of Object.entries(m.markers || {})) {
    if (v && v.type === 'cogitator') want(k, 'cover', 'machinery');
    else if (v) want(k, 'marker', v.type);
  }
  return [...out].sort();
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

/* What a player's copy of the map may carry. The whole combat document is
   polled by every browser, so anything left in it is readable by anyone
   with the network tab open: the floorplan, the explored squares, and every
   contact with its name. The table plays on the projector, not on a
   terminal, so a player's copy carries ONE thing: the light the deck is
   fought in, which their own attack rolls need. */
export function redactMapForTable(map) {
  if (!map || typeof map !== 'object') return map;
  return { lighting: lightingById(map.lighting).id };
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
      if (seen.has(k) || !m.floor[k] || wallBetween(m, cur.x, cur.y, dx, dy)) continue;
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
    if (!m.floor[k] || isDoorAt(m, x, y) || wallBetween(m, pos.x, pos.y, dx, dy)) continue;
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
      if (out.has(k) || !m.floor[k] || wallBetween(m, cur.x, cur.y, dx, dy)) continue;
      out.add(k);
      const d = m.doors[k];
      // A shut door is seen from the side you are on and goes no further.
      if (!d || d.state === 'open') queue.push({ x, y });
    }
  }
  return out;
}

/* What of the explored deck is on the board right now.

   Measured from TWO places: where the party is, and the starting room. The
   start is the anchor the whole crawl is counted out from — room one — so the
   way back to it is never taken off the board just because the party is
   standing somewhere a shut door can cut off. Before this, sight flowed only
   from a single viewpoint, and a party left standing in a one-square passage
   between two doors lost the entire deck the moment the second door shut. */
export function visibleExplored(map) {
  const m = readMap(map);
  if (!m.viewpoint && !m.start) return m.explored;
  const reach = openReach(m, m.viewpoint);
  for (const k of openReach(m, m.start)) reach.add(k);
  const out = {};
  for (const k of Object.keys(m.explored)) if (reach.has(k)) out[k] = true;
  return out;
}

/* Which side of a door is the way back, once it is shut.

   The side the starting room is on, when there is a start; failing that, the
   side with more of the explored deck in reach, which is where a party that
   has been exploring came from. Returns that side's square, or null when the
   two sides still meet some other way (a loop, a second open door) and so
   neither is cut off from the other. */
function wayBack(shut, pos, start) {
  const sides = ORTHO
    .filter(([dx, dy]) => !wallBetween(shut, pos.x, pos.y, dx, dy))
    .map(([dx, dy]) => ({ x: pos.x + dx, y: pos.y + dy }))
    .filter((c) => shut.floor[cellKey(c.x, c.y)] && !shut.doors[cellKey(c.x, c.y)]);
  if (sides.length < 2) return null;
  const reaches = sides.map((c) => openReach(shut, c));
  if (reaches[0].has(cellKey(sides[1].x, sides[1].y))) return null;
  const sk = start ? cellKey(start.x, start.y) : null;
  let best = 0;
  if (sk && reaches.some((r) => r.has(sk))) best = reaches.findIndex((r) => r.has(sk));
  else {
    const known = (r) => { let n = 0; for (const k of r) if (shut.explored[k]) n++; return n; };
    const counts = reaches.map(known);
    best = counts.indexOf(Math.max(...counts));
  }
  return { side: sides[best], reach: reaches[best] };
}

/* The mirror of revealArea, for a place the GM wants taken back by hand. */
export function concealArea(map, pos) {
  const m = readMap(map);
  const explored = { ...m.explored };
  for (const c of regionAt(m, pos)) delete explored[cellKey(c.x, c.y)];
  return explored;
}

/* ------------------------------ cogitator terminals ------------------------------

   A terminal is a marker the party can WORK. Locked until someone gets in —
   the Tech-Use test is the table's, the map only records the result —
   accessed once they have, or burnt out, which is how a GM says the
   saboteurs got there first. An accessed terminal can work the doors of the
   room it stands in, hand the party the deck's plan, or sweep for contacts.

   "The room it stands in" is the fog's own idea of a room: floor that can be
   walked without passing a door, and the doors round its edge. */
export function terminalAt(map, pos) {
  const m = readMap(map);
  if (!pos) return null;
  const t = m.markers[cellKey(pos.x, pos.y)];
  return t && t.type === 'cogitator' ? t : null;
}

export function setTerminal(map, pos, state) {
  const m = readMap(map);
  const k = cellKey(pos.x, pos.y);
  const t = m.markers[k];
  if (!t || t.type !== 'cogitator' || !TERMINAL_STATES.includes(state)) return null;
  return { markers: { ...m.markers, [k]: { ...t, state } } };
}

// The doors round the room a terminal stands in.
export function roomDoors(map, pos) {
  const m = readMap(map);
  return regionAt(m, pos).filter((c) => m.doors[cellKey(c.x, c.y)]);
}

/* Every door of the terminal's room set to one state, as one patch. Opening
   them goes through playDoor, door by door, so the fog behaves exactly as if
   the party had opened each one — the rooms beyond come into view, and
   shutting them backtracks the same way a hand on the door would. */
export function workRoomDoors(map, pos, state) {
  let m = readMap(map);
  const doorsHere = roomDoors(m, pos);
  if (!doorsHere.length) return null;
  const patch = {};
  for (const d of doorsHere) {
    const p = playDoor(m, d, state);
    if (!p || !p.doors) continue;
    Object.assign(patch, p);
    m = readMap({ ...m, ...p });
  }
  return Object.keys(patch).length ? patch : null;
}

/* The deck's plan, downloaded. Every square of deck is MAPPED: its walls and
   doors are known, nothing in it is. Explored squares are not touched — a
   plan is not a sighting. */
export function downloadSchematics(map) {
  const m = readMap(map);
  const mapped = { ...m.mapped };
  for (const k of Object.keys(m.floor)) mapped[k] = true;
  return { mapped };
}

/* ============================ TERRAIN THAT DOES THINGS ============================
   Everything below is a square, or a marker, that changes the fight while it
   is going on rather than sitting there being scenery. Each one is a pure
   function from the map to a patch, the way the doors and terminals are: the
   map component decides when, these decide what. */

/* -------------------------- cover that wears away --------------------------
   Cover in Rogue Trader is shot through: a hit that crosses it loses the
   cover's Armour Points, and the cover keeps what it did not spend. Recorded
   as WEAR on the square, so a crate stack that has soaked three hits gives
   five AP and not eight; worn down to nothing, it is gone. A structural
   pillar is part of the ship and does not wear. Promethium tanks go up
   instead of going away. `by` may be negative: patching cover back up. */
export function wearCover(map, pos, by = 1) {
  const m = readMap(map);
  if (!pos) return null;
  const k = cellKey(pos.x, pos.y);
  const rec = readCover(m.cover[k]);
  if (!rec) return null;
  const type = coverById(rec.id);
  if (type.sturdy) return null;
  const wear = Math.max(0, rec.wear + (Math.round(Number(by)) || 0));
  if (wear < type.ap) return { cover: { ...m.cover, [k]: writeCover(rec.id, rec.turn, wear) } };
  if (type.volatile) return { ...detonateTank(m, pos), blew: true };
  const cover = { ...m.cover };
  delete cover[k];
  return { cover, destroyed: true };
}

/* ---------------------------- promethium tanks ----------------------------
   A tank that goes up: off the deck, and fire in every square its blast
   reaches — through open floor, not through walls, shut doors or anything
   solid standing in the way, the same rule a grenade's template follows.
   Another tank inside the blast goes up with it. Fire does not overwrite the
   void or the warp: a breach is still a breach with burning fuel in it. */
const FIRE_KEEPS = new Set(['void', 'warp']);

export function detonateTank(map, pos) {
  let m = readMap(map);
  if (!pos) return null;
  const first = coverAt(m.cover[cellKey(pos.x, pos.y)]);
  if (!first || !first.volatile) return null;
  const cover = { ...m.cover };
  const hazards = { ...m.hazards };
  const burnt = new Set();
  const queue = [{ x: pos.x, y: pos.y }];
  let tanks = 0;
  while (queue.length) {
    const at = queue.shift();
    const k = cellKey(at.x, at.y);
    const tank = coverAt(cover[k]);
    if (!tank || !tank.volatile) continue;
    delete cover[k];
    tanks++;
    m = { ...m, cover };
    const caught = unobstructed(m, at, onDeck(m, areaCells(m, at, tank.blastM)));
    for (const c of caught) {
      const ck = cellKey(c.x, c.y);
      // A shut door takes the blast and stops it; it does not burn.
      const door = m.doors[ck];
      if (door && doorBlocks(door.state)) continue;
      burnt.add(ck);
      if (!FIRE_KEEPS.has(hazards[ck])) hazards[ck] = 'fire';
      const next = coverAt(cover[ck]);
      if (next && next.volatile) queue.push(c);
    }
  }
  return { cover, hazards, burnt: [...burnt].map(parseKey), tanks };
}

/* ------------------------------ sentry turrets ------------------------------
   A gun on a mount, watching a quarter of the compass. FACING is eighths of a
   turn, 0 north and counted clockwise, so one click of the mount is 45
   degrees; the deck turning a quarter adds two (rotateMap). What it covers is
   its 90-degree arc out to its weapon's reach, cut at whatever it cannot see
   through — a turret behind a bulkhead watches the bulkhead.

   The reach drawn is capped: a heavy stubber's 120m standard range is longer
   than most decks, and walking that many lines on every redraw for a fan
   nobody needs past the far wall is the cost to avoid. */
export const TURRET_ARC_DEG = 90;
export const TURRET_MAX_SQUARES = 30;

export function turretAt(map, pos) {
  const m = readMap(map);
  if (!pos) return null;
  const t = m.markers[cellKey(pos.x, pos.y)];
  return t && t.type === 'turret' ? t : null;
}

export function turretCells(map, pos) {
  const m = readMap(map);
  const t = turretAt(m, pos);
  if (!t || t.state !== 'active') return [];
  const a = (t.facing * 45 - 90) * Math.PI / 180;
  const towards = { x: pos.x + Math.cos(a) * 10, y: pos.y + Math.sin(a) * 10 };
  const reachM = Math.min(t.rangeM, TURRET_MAX_SQUARES * (m.metresPerSquare || 1));
  return onDeck(m, coneCells(m, pos, towards, reachM, TURRET_ARC_DEG / 2))
    .filter((c) => !(c.x === pos.x && c.y === pos.y) && !walkLine(m, pos, c));
}

// `patch` is any of state, facing (absolute) or turn (relative, in eighths).
export function setTurret(map, pos, { state, facing, turn } = {}) {
  const m = readMap(map);
  const t = turretAt(m, pos);
  if (!t) return null;
  const next = { ...t };
  if (state === 'active' || state === 'off') next.state = state;
  let f = facing != null ? Math.round(Number(facing)) : t.facing;
  if (turn != null) f += Math.round(Number(turn)) || 0;
  next.facing = Number.isFinite(f) ? ((f % 8) + 8) % 8 : t.facing;
  return { markers: { ...m.markers, [cellKey(pos.x, pos.y)]: next } };
}

/* The whole defence grid at once, from a terminal the party has got into.
   Null when the deck has no turrets to switch. */
export function setDeckTurrets(map, state) {
  const m = readMap(map);
  if (state !== 'active' && state !== 'off') return null;
  const markers = { ...m.markers };
  let n = 0;
  for (const [k, v] of Object.entries(m.markers)) {
    if (v.type !== 'turret') continue;
    markers[k] = { ...v, state };
    n++;
  }
  return n ? { markers } : null;
}

/* -------------------------- the warp, spreading --------------------------
   A rift is a hazard square, and a rift that is not closed grows. Each turn
   the GM says so, every separate rift on the deck reaches one square further
   into the floor beside it: not through walls, not into a doorway (a door is
   where a party seals a rift off) and never onto sanctified ground. Which
   square is the dice's business — `rng` is passed in so the checks can hold
   it still. Null when nothing can grow. */
const warpPatches = (m) => {
  const seen = new Set();
  const out = [];
  for (const [k, v] of Object.entries(m.hazards)) {
    if (v !== 'warp' || seen.has(k)) continue;
    const patch = [];
    const queue = [parseKey(k)];
    seen.add(k);
    while (queue.length) {
      const c = queue.shift();
      patch.push(c);
      for (const [dx, dy] of ORTHO) {
        const nk = cellKey(c.x + dx, c.y + dy);
        if (seen.has(nk) || m.hazards[nk] !== 'warp') continue;
        seen.add(nk);
        queue.push({ x: c.x + dx, y: c.y + dy });
      }
    }
    out.push(patch);
  }
  return out;
};

export function spreadWarp(map, rng = Math.random) {
  const m = readMap(map);
  const holy = sanctified(m);
  const hazards = { ...m.hazards };
  let grew = 0;
  for (const patch of warpPatches(m)) {
    const edge = [];
    const listed = new Set();
    for (const c of patch) {
      for (const [dx, dy] of ORTHO) {
        const x = c.x + dx, y = c.y + dy;
        const k = cellKey(x, y);
        if (listed.has(k) || !m.floor[k] || m.doors[k] || hazards[k] === 'warp' || holy.has(k)
          || wallBetween(m, c.x, c.y, dx, dy)) continue;
        listed.add(k);
        edge.push(k);
      }
    }
    if (!edge.length) continue;
    // Sorted so the same roll picks the same square whatever order the
    // squares happened to be stored in.
    edge.sort();
    const pick = edge[Math.min(edge.length - 1, Math.floor((Number(rng()) || 0) * edge.length))];
    hazards[pick] = 'warp';
    grew++;
  }
  return grew ? { hazards, grew } : null;
}

// Closing a rift closes all of it: every warp square joined to this one.
export function sealWarp(map, pos) {
  const m = readMap(map);
  if (!pos || m.hazards[cellKey(pos.x, pos.y)] !== 'warp') return null;
  const hazards = { ...m.hazards };
  const k0 = cellKey(pos.x, pos.y);
  for (const patch of warpPatches(m)) {
    if (!patch.some((c) => cellKey(c.x, c.y) === k0)) continue;
    for (const c of patch) delete hazards[cellKey(c.x, c.y)];
  }
  return { hazards };
}

/* ------------------------------ shrines ------------------------------
   Holy ground round a shrine, out to SHRINE_RADIUS_M and not through walls.
   The warp cannot spread onto it. What else it does — a bonus to Willpower
   against the warp, a daemon that will not cross — is the GM's; the radius is
   a house number for the same reason. */
export const SHRINE_RADIUS_M = 3;

export function sanctified(map) {
  const m = readMap(map);
  const out = new Set();
  for (const [k, v] of Object.entries(m.markers)) {
    if (v.type !== 'shrine') continue;
    const at = parseKey(k);
    for (const c of unobstructed(m, at, onDeck(m, areaCells(m, at, SHRINE_RADIUS_M)))) out.add(cellKey(c.x, c.y));
  }
  return out;
}

/* --------------------------- vents and crawlways ---------------------------
   Two vents with the same `pair` are the two ends of one crawlway. The pair is
   an id on the marker rather than a pointer to the other square, so turning or
   cropping the deck cannot leave one end pointing at the wrong place: a vent
   whose partner was cropped away simply has no partner.

   Placing a vent links it to the end that is waiting for one, if there is
   one; otherwise it waits. */
const ventEnds = (m) => {
  const byPair = new Map();
  for (const [k, v] of Object.entries(m.markers)) {
    if (v.type !== 'vent' || !v.pair) continue;
    if (!byPair.has(v.pair)) byPair.set(v.pair, []);
    byPair.get(v.pair).push(k);
  }
  return byPair;
};

export function placeVent(map, pos, label = '') {
  const m = readMap(map);
  if (!pos) return null;
  const k = cellKey(pos.x, pos.y);
  const ends = ventEnds(m);
  // The waiting end: a vent with no pair, or a pair whose other end is gone.
  let waiting = null;
  for (const [vk, v] of Object.entries(m.markers)) {
    if (vk === k || v.type !== 'vent') continue;
    if (!v.pair || (ends.get(v.pair) || []).length < 2) { waiting = vk; break; }
  }
  const markers = { ...m.markers };
  if (!waiting) {
    markers[k] = { type: 'vent', label, pair: null };
    return { markers };
  }
  let n = 1;
  while (ends.has('d' + n)) n++;
  const pair = 'd' + n;
  markers[waiting] = { ...markers[waiting], pair };
  markers[k] = { type: 'vent', label, pair };
  return { markers };
}

export function ventPartner(map, pos) {
  const m = readMap(map);
  if (!pos) return null;
  const k = cellKey(pos.x, pos.y);
  const v = m.markers[k];
  if (!v || v.type !== 'vent' || !v.pair) return null;
  const other = (ventEnds(m).get(v.pair) || []).find((o) => o !== k);
  return other ? parseKey(other) : null;
}

/* The party goes in one end and comes out of the other: they stand at the far
   end from now on, and with fog on, the room it opens into comes into view. */
export function crawlThrough(map, pos) {
  const m = readMap(map);
  const to = ventPartner(m, pos);
  if (!to || !m.floor[cellKey(to.x, to.y)]) return null;
  const patch = { viewpoint: { x: to.x, y: to.y } };
  if (m.fog) patch.explored = revealArea(m, to);
  return patch;
}

/* ------------------------- breaches and airlocks -------------------------
   Where the air goes. A vacuum breach is a hole in the ship, and so is an
   airlock standing open on the hull — open, and with deck on one side of it
   and nothing on the other. Air rushes to them from everywhere it can reach
   through open floor and open doors, out to VENT_REACH_SQUARES; shut a door
   and what is behind it stops moving.

   Returned as one arrow per square, pointing at the next square on the way to
   the nearest hole, which is what anything loose in that square is dragged
   along. The pull is strongest by the hole (`d` is how far off it is). On a
   deck with no hole in it this is empty and costs one look at each layer. */
export const VENT_REACH_SQUARES = 8;

export function ventSources(map) {
  const m = readMap(map);
  const out = [];
  for (const [k, v] of Object.entries(m.hazards)) {
    if (v === 'void' && m.floor[k]) out.push(parseKey(k));
  }
  for (const [k, d] of Object.entries(m.doors)) {
    if (d.kind !== 'airlock' || d.state !== 'open' || !m.floor[k]) continue;
    const p = parseKey(k);
    // On the hull: deck on one side of it and none on the other, across
    // either axis. An inner door has deck on both sides (and wall on both of
    // the others), which is the same on each axis.
    const hasDeck = (dx, dy) => Boolean(m.floor[cellKey(p.x + dx, p.y + dy)]);
    if (hasDeck(1, 0) !== hasDeck(-1, 0) || hasDeck(0, 1) !== hasDeck(0, -1)) out.push(p);
  }
  return out;
}

export function ventField(map) {
  const m = readMap(map);
  const sources = ventSources(m);
  if (!sources.length) return [];
  const seen = new Map();
  const queue = [];
  for (const s of sources) {
    seen.set(cellKey(s.x, s.y), { x: s.x, y: s.y, dx: 0, dy: 0, d: 0 });
    queue.push(s);
  }
  while (queue.length) {
    const cur = queue.shift();
    const here = seen.get(cellKey(cur.x, cur.y));
    if (here.d >= VENT_REACH_SQUARES) continue;
    for (const [dx, dy] of ORTHO) {
      const x = cur.x + dx, y = cur.y + dy;
      const k = cellKey(x, y);
      if (seen.has(k) || !m.floor[k] || wallBetween(m, cur.x, cur.y, dx, dy)) continue;
      // A shut door holds the air behind it.
      const door = m.doors[k];
      if (door && doorBlocks(door.state)) continue;
      seen.set(k, { x, y, dx: -dx || 0, dy: -dy || 0, d: here.d + 1 });
      queue.push({ x, y });
    }
  }
  return [...seen.values()].filter((c) => c.d > 0);
}

/* ------------------------------ light by the room ------------------------------
   The deck has one light (`lighting`), and any square can be painted with
   another: a corridor whose lumens are out in a lit ship, a hold full of
   smoke. What a square is fought in is its own light if it has one, the
   deck's if not. */
export function lightAt(map, pos) {
  const m = readMap(map);
  if (!pos) return lightingById(m.lighting);
  const own = m.light[cellKey(pos.x, pos.y)];
  return lightingById(own || m.lighting);
}

/* ------------------------- starting and running a crawl -------------------------
   Three small things make a published deck playable without the GM having to
   open the fog tool and click the first room by hand.

   THE START. setStartRoom picks the room the party arrives in. startPlay turns
   it into the fog state a session opens with: the room lit, the party in it,
   everything else dark.

   THE DOORS. playDoor is what a click on a door does during play. It changes
   the door's state, and when that opens it, brings in what is beyond. */

/* The start the map should have after the GM clicks `pos`. A room, not a
   doorway; clicking inside the room that already is the start takes the choice
   back, so one tool sets it and clears it. */
export function setStartRoom(map, pos) {
  const m = readMap(map);
  if (!pos) return m.start;
  const k = cellKey(pos.x, pos.y);
  if (!m.floor[k] || m.doors[k]) return m.start;
  if (m.start && regionAt(m, m.start).some((c) => cellKey(c.x, c.y) === k)) return null;
  return { x: Math.round(pos.x), y: Math.round(pos.y) };
}

/* The fog a session opens with. Fog on, the start room explored and the party
   standing in it. With no start chosen, or one the deck no longer has, the deck
   opens dark exactly as it always did. */
export function startPlay(map) {
  const m = readMap(map);
  if (!m.start || !m.floor[cellKey(m.start.x, m.start.y)]) {
    return { fog: true, explored: {}, mapped: {}, viewpoint: null };
  }
  const explored = {};
  for (const c of regionAt(m, m.start)) explored[cellKey(c.x, c.y)] = true;
  return { fog: true, explored, mapped: {}, viewpoint: { x: m.start.x, y: m.start.y } };
}

/* What a click on a door does in play: the patch to write, or null when there
   is no door there. `to` names a state to set directly (the right-click menu);
   without it the door steps on, closed -> open -> jammed -> closed, as it does
   under the door tool.

   OPENING A DOOR LIFTS THE FOG BEYOND IT. With fog on, the door and both rooms
   it joins are explored. Shutting it or jamming it explores nothing, and
   because what is drawn is only what can still be reached through open doors,
   it takes the far side off the board again; opening it brings it straight back.

   THE PARTY GOES THROUGH. Reaching is measured from where the party stands, so
   when the door being opened leads into somewhere new, the party is taken to be
   on that side from then on: a door shut behind them hides the way they came,
   not the room they are in. A door that only re-opens somewhere already seen
   leaves the party where they were. */
export function playDoor(map, pos, to = null) {
  const m = readMap(map);
  if (!pos) return null;
  const k = cellKey(pos.x, pos.y);
  const door = m.doors[k];
  if (!door) return null;
  const state = to && DOOR_STATES.includes(to) ? to : toggledDoorState(door.state);
  if (state === door.state) return {};
  const doors = { ...m.doors, [k]: { ...door, state } };
  const patch = { doors };

  /* SHUTTING A DOOR IS BACKTRACKING. What lies beyond it, counted from the
     start, goes back into the dark; the way back stays lit. If the party was
     standing on the far side — which is where opening a door further in left
     them — they came back through it before they shut it, and are put on the
     near side. Without this, a party left in a one-square passage between two
     doors was walled off by shutting the second, and the whole deck vanished
     with them. Explored squares are not forgotten: open the door again and
     everything beyond it is back exactly as it was. */
  if (door.state === 'open' && state !== 'open' && m.fog && m.viewpoint) {
    const back = wayBack({ ...m, doors }, pos, m.start);
    if (back && !back.reach.has(cellKey(m.viewpoint.x, m.viewpoint.y))) patch.viewpoint = back.side;
    return patch;
  }
  if (state !== 'open' || !m.fog) return patch;

  const opened = { ...m, doors };
  const explored = { ...m.explored };
  for (const c of regionAt(opened, pos)) explored[cellKey(c.x, c.y)] = true;
  patch.explored = explored;

  if (m.viewpoint) {
    const reach = openReach(m, m.viewpoint);
    const sides = [[0, -1], [1, 0], [0, 1], [-1, 0]]
      .filter(([dx, dy]) => !wallBetween(m, pos.x, pos.y, dx, dy))
      .map(([dx, dy]) => ({ x: pos.x + dx, y: pos.y + dy }))
      .filter((c) => m.floor[cellKey(c.x, c.y)] && !m.doors[cellKey(c.x, c.y)]);
    /* THE PARTY COMES TO THE DOOR, and stops at it.

       What is beyond a door is only SHOWN if it can be reached from where the
       party is standing (visibleExplored), so a door opened while they were
       three rooms away lit the room beyond in the record and showed nothing
       on screen. Opening a door is the party being at it, so they are moved
       to the side they opened it from: the near side, the one already within
       reach, and never the far one.

       Moving them to the FAR side is what this used to do, and it is why
       shutting a door hid the corridor behind them instead of the room they
       had just opened. They stop at the threshold instead — the room beyond
       is in sight while the door is open and gone the moment it is shut, and
       the way they came stays lit either way.

       With nothing in reach touching the door, the GM is opening one away
       from the party altogether; they are taken to be at it, or opening it
       would show nothing at all. */
    const near = sides.filter((c) => reach.has(cellKey(c.x, c.y)));
    if (near.length) patch.viewpoint = near[0];
    else if (sides.length) patch.viewpoint = sides[0];
  }
  return patch;
}

/* ------------------------- what a play panel lists -------------------------
   The Play tab lists the deck's doors and its rooms so each can be clicked
   without hunting for it on a 300-square map. A "room" here is what the fog
   already treats as a place: floor that can be walked without passing a door.
   A door belongs to the rooms on its two sides.

   Nothing is stored. A room is derived from the floor and the doors every time
   they change, the way the walls are, so it cannot disagree with them. */

const ORTHO = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/* The doors, left to right and top to bottom, each with the rooms it joins
   (indexes into roomsOf's list). Pass that list in if it is already in hand:
   walking a big deck twice to draw one panel is the cost to avoid. */
export function doorsOf(map, listed = null) {
  const m = readMap(map);
  const rooms = listed || roomsOf(m);
  const roomAt = new Map();
  rooms.forEach((r, i) => { for (const k of r.keys) roomAt.set(k, i); });
  const out = [];
  for (const [k, d] of Object.entries(m.doors)) {
    const p = parseKey(k);
    if (!p || !m.floor[k]) continue;
    const joins = [];
    for (const [dx, dy] of ORTHO) {
      if (wallBetween(m, p.x, p.y, dx, dy)) continue;
      const i = roomAt.get(cellKey(p.x + dx, p.y + dy));
      if (i !== undefined && !joins.includes(i)) joins.push(i);
    }
    out.push({ key: k, x: p.x, y: p.y, kind: d.kind, state: d.state, joins: joins.sort((a, b) => a - b) });
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

/* The rooms: connected floor, not walking through a door square. Each is
   { keys, cells, x0, y0, x1, y1, rep } where rep is a square inside it nearest
   its middle, which is the one to click on its behalf. Left to right and top to
   bottom by their top-left corner, so "Room 1" is the same room until the deck
   changes. */
export function roomsOf(map) {
  const m = readMap(map);
  const seen = new Set();
  const out = [];
  for (const k0 of Object.keys(m.floor)) {
    if (seen.has(k0) || m.doors[k0]) continue;
    const keys = [];
    const queue = [k0];
    seen.add(k0);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, sx = 0, sy = 0;
    while (queue.length) {
      const k = queue.pop();
      const p = parseKey(k);
      keys.push(k);
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
      sx += p.x; sy += p.y;
      for (const [dx, dy] of ORTHO) {
        const nk = cellKey(p.x + dx, p.y + dy);
        if (seen.has(nk) || !m.floor[nk] || m.doors[nk] || wallBetween(m, p.x, p.y, dx, dy)) continue;
        seen.add(nk);
        queue.push(nk);
      }
    }
    const cx = sx / keys.length, cy = sy / keys.length;
    // Nearest the middle; a tie goes to the upper left, so the square that
    // stands for a room is the same one every time rather than whichever the
    // walk happened to reach first.
    let best = null, bestD = Infinity;
    for (const k of keys) {
      const p = parseKey(k);
      const d = (p.x - cx) ** 2 + (p.y - cy) ** 2;
      if (d < bestD || (d === bestD && (p.y < best.y || (p.y === best.y && p.x < best.x)))) { bestD = d; best = p; }
    }
    out.push({ keys, cells: keys.length, x0, y0, x1, y1, rep: best });
  }
  return out.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
}

/* A room's fog, as the panel shows it: 'lit' when everything in it has been
   found, 'part' when some has, 'dark' when none. */
export function roomFog(room, explored) {
  let n = 0;
  for (const k of room.keys) if (explored[k]) n++;
  return n === 0 ? 'dark' : n === room.keys.length ? 'lit' : 'part';
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
export const packMapLibrary = (list) =>
  (Array.isArray(list) ? list : []).map(packSavedMap);

let mapSeq = 0;
const newMapId = () => 'bmap-' + Date.now().toString(36) + '-' + (mapSeq++).toString(36);

export const newBattleMap = (name = 'New deck') => readSavedMap({ name, map: EMPTY_MAP });

export function publishMap(saved) {
  const s = readSavedMap(saved);
  return {
    ...s.map,
    // Fog on and nothing explored but the room the party starts in, if one was
    // chosen. A map pushed with last session's fog still lifted would hand
    // the party the floorplan, so nothing else carries over.
    ...startPlay(s.map),
    contacts: Object.fromEntries(
      Object.entries(s.map.contacts).map(([k, c]) => [k, { ...c, state: 'hidden' }])
    ),
    // A terminal the party broke into last session is locked again; one the
    // GM drew burnt out stays burnt out.
    markers: Object.fromEntries(Object.entries(s.map.markers).map(([k, v]) =>
      [k, v.type === 'cogitator' && v.state === 'open' ? { ...v, state: 'locked' } : v]))
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
  return keepClean(floor, next);
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

  const floor = {}, cover = {}, hazards = {}, doors = {}, markers = {}, ground = {}, obscuring = {}, light = {};
  const walls = {};
  const eastOf = (x, y) => x >= 0 && x < sw && Boolean(src.walls[cellKey(x, y)] & WALL_EAST);
  const southOf = (x, y) => y >= 0 && y < sh && Boolean(src.walls[cellKey(x, y)] & WALL_SOUTH);
  for (let x = 0; x < w; x++) {
    // Which copy this column falls in, and whether that copy is flipped.
    const flipX = Boolean(mirror && Math.floor(x / sw) % 2);
    const lx = flipX ? sw - 1 - (x % sw) : x % sw;
    for (let y = 0; y < h; y++) {
      const flipY = Boolean(mirror && Math.floor(y / sh) % 2);
      const ly = flipY ? sh - 1 - (y % sh) : y % sh;
      const from = cellKey(lx, ly);
      const to = cellKey(x, y);
      // A square's east side in a flipped copy is its source's WEST side,
      // which is kept as the east side of the square before it.
      const bits = ((flipX ? eastOf(lx - 1, ly) : eastOf(lx, ly)) ? WALL_EAST : 0)
        | ((flipY ? southOf(lx, ly - 1) : southOf(lx, ly)) ? WALL_SOUTH : 0);
      if (bits) walls[to] = bits;
      // Each layer is copied on its own rather than gated on the floor: a
      // marker may legitimately sit off the deck, and gating would drop it.
      if (src.floor[from]) floor[to] = true;
      if (src.cover[from]) cover[to] = src.cover[from];
      if (src.hazards[from]) hazards[to] = src.hazards[from];
      if (src.doors[from]) {
        const d = { ...src.doors[from] };
        // A leaf on the east side of its square is on the west side in a
        // copy flipped east to west.
        if (d.edge && flipX && (d.edge === 'e' || d.edge === 'w')) d.edge = d.edge === 'e' ? 'w' : 'e';
        if (d.edge && flipY && (d.edge === 'n' || d.edge === 's')) d.edge = d.edge === 'n' ? 's' : 'n';
        doors[to] = d;
      }
      if (src.markers[from]) markers[to] = { ...src.markers[from] };
      // The terrain repeats with the deck it is painted on, or an expanded
      // ice shelf would come back as deck plate.
      if (src.ground[from]) ground[to] = src.ground[from];
      // Foliage and smoke belong to the terrain, and repeat with it.
      if (src.obscuring[from]) obscuring[to] = src.obscuring[from];
      // And so does the light it is lit by.
      if (src.light[from]) light[to] = src.light[from];
    }
  }

  const inside = (k) => {
    const p = parseKey(k);
    return Boolean(p) && p.x >= 0 && p.y >= 0 && p.x < w && p.y < h;
  };
  const explored = {};
  for (const k of Object.keys(src.explored)) if (inside(k)) explored[k] = true;
  const mapped = {};
  for (const k of Object.keys(src.mapped)) if (inside(k)) mapped[k] = true;
  const contacts = {};
  for (const [k, v] of Object.entries(src.contacts)) if (inside(k)) contacts[k] = v;
  const viewpoint = src.viewpoint && inside(cellKey(src.viewpoint.x, src.viewpoint.y))
    ? src.viewpoint : null;
  const start = src.start && inside(cellKey(src.start.x, src.start.y)) ? src.start : null;

  return {
    ...src,
    cols: w, rows: h,
    floor, cover, hazards, doors, markers, ground, obscuring, light, walls,
    explored, mapped, contacts, viewpoint, start
  };
}

/* The layers a GM paints (deck, terrain, cover, hazards, foliage, doors,
   markers, contacts) — the "created map", as opposed to the grid it sits in. */
const PAINT_LAYERS = ['floor', 'ground', 'cover', 'hazards', 'obscuring', 'doors', 'markers', 'contacts', 'light', 'walls'];

/* The smallest box holding everything painted, or null for an empty deck. */
export function paintBounds(map) {
  const m = readMap(map);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const layer of PAINT_LAYERS) {
    for (const k of Object.keys(m[layer] || {})) {
      const p = parseKey(k);
      if (!p) continue;
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.y > y1) y1 = p.y;
    }
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
}

/* Turns what has been painted a quarter turn at a time, clockwise for a
   positive count and anticlockwise for a negative one, and leaves the grid
   alone. The map's columns, rows, scale and texture are the container; deck,
   terrain, doors, cover, hazards, foliage, markers, fog and contacts are the
   content, and they turn together about the middle of the painted area, so a
   corridor laid east-west can be stood north-south without rebuilding it.
   Walls are derived from the floor, so they come out right on their own.

   A turn that would push the painted area past the edge of the grid (a
   corridor 30 wide cannot stand up in 20 rows) is not made: the map comes
   back unchanged, and rotationFits says so beforehand. */
/* A deck laid over a picture is not turned: the walls and doors were placed
   on the picture's own, and turning them would leave them standing in the
   rooms. */
export function rotateMap(map, turns = 1) {
  const src = readMap(map);
  const t = quarterCount(turns);
  if (t === 0 || src.backdrop) return src;
  return turnContent(src, t) || src;
}

export function rotationFits(map, turns = 1) {
  const src = readMap(map);
  const t = quarterCount(turns);
  return t === 0 || (!src.backdrop && turnContent(src, t) !== null);
}

const quarterCount = (turns) => (((Math.round(Number(turns)) || 0) % 4) + 4) % 4;

// Rounds halves away from zero, so a turn and its reverse shift the box by
// exactly opposite amounts and four turns bring the deck back to where it was.
const roundHalf = (v) => Math.sign(v) * Math.floor(Math.abs(v) + 0.5);

// t is 1 (clockwise), 2 (half turn) or 3 (anticlockwise). Null if the turned
// content would not fit the grid.
function turnContent(m, t) {
  const b = paintBounds(m);
  if (!b) return m;
  const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
  const nw = t === 2 ? w : h, nh = t === 2 ? h : w;
  if (nw > m.cols || nh > m.rows) return null;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const nx0 = clamp(b.x0 + roundHalf((w - nw) / 2), 0, m.cols - nw);
  const ny0 = clamp(b.y0 + roundHalf((h - nh) / 2), 0, m.rows - nh);
  const at = (x, y) => {
    const rx = x - b.x0, ry = y - b.y0;
    const q = t === 1 ? { x: h - 1 - ry, y: rx }
      : t === 3 ? { x: ry, y: w - 1 - rx }
        : { x: w - 1 - rx, y: h - 1 - ry };
    return { x: nx0 + q.x, y: ny0 + q.y };
  };
  const inGrid = (p) => p.x >= 0 && p.y >= 0 && p.x < m.cols && p.y < m.rows;
  const move = (layer, copy = (v) => v) => {
    const out = {};
    for (const [k, v] of Object.entries(layer || {})) {
      const p = parseKey(k);
      if (!p) continue;
      const q = at(p.x, p.y);
      if (inGrid(q)) out[cellKey(q.x, q.y)] = copy(v);
    }
    return out;
  };
  const vp = m.viewpoint ? at(m.viewpoint.x, m.viewpoint.y) : null;
  const st = m.start ? at(m.start.x, m.start.y) : null;
  return {
    ...m,
    floor: move(m.floor),
    /* Cover turns WITH the deck. A barrier laid across a corridor has to stay
       across it after the deck is turned a quarter, and it is the only thing
       on the map that both has a direction and is stored per square — the
       walls are derived from the floor, and the props that have no front do
       not care. Without this, turning a deck left every railing on it facing
       the way it faced before, at right angles to the corridor it was drawn
       along. */
    cover: move(m.cover, (v) => {
      const c = readCover(v);
      return c ? writeCover(c.id, c.turn + t, c.wear) : v;
    }),
    hazards: move(m.hazards),
    obscuring: move(m.obscuring), ground: move(m.ground), explored: move(m.explored),
    mapped: move(m.mapped), light: move(m.light),
    doors: move(m.doors, (d) => (d.edge ? { ...d, edge: turnEdge(d.edge, t) } : { ...d })),
    markers: move(m.markers, (v) => (v.type === 'turret'
      ? { ...v, facing: (((v.facing || 0) + 2 * t) % 8 + 8) % 8 } : { ...v })),
    contacts: move(m.contacts, (c) => ({ ...c })),
    /* A thin wall is an EDGE, and turning moves which side of its square it
       is on: a quarter turn clockwise stands an east side on the south, and
       a south side becomes the west one — the east side of the square
       before it. Kept on the square west or north of the edge, as ever. */
    walls: (() => {
      const out = {};
      const add = (x, y, bit) => {
        if (x < 0 || y < 0 || x >= m.cols || y >= m.rows) return;
        const k = cellKey(x, y);
        out[k] = (out[k] || 0) | bit;
      };
      for (const [k, v] of Object.entries(m.walls || {})) {
        const p = parseKey(k);
        if (!p) continue;
        const q = at(p.x, p.y);
        if (v & WALL_EAST) {
          if (t === 1) add(q.x, q.y, WALL_SOUTH);
          else if (t === 2) add(q.x - 1, q.y, WALL_EAST);
          else add(q.x, q.y - 1, WALL_SOUTH);
        }
        if (v & WALL_SOUTH) {
          if (t === 1) add(q.x - 1, q.y, WALL_EAST);
          else if (t === 2) add(q.x, q.y - 1, WALL_SOUTH);
          else add(q.x, q.y, WALL_EAST);
        }
      }
      return out;
    })(),
    viewpoint: vp && inGrid(vp) ? vp : null,
    start: st && inGrid(st) ? st : null
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

/* ------------------------------ thin walls ------------------------------
   A wall ON a grid line, between two squares that are both deck (see
   EMPTY_MAP.walls). Each edge is kept once, by the square west or north of
   it, so there is one record to agree with rather than two. */
export const WALL_EAST = 1, WALL_SOUTH = 2;

// Is there a thin wall between a square and the next one along (one step,
// dx or dy, never both)?
export function wallBetween(m, x, y, dx, dy) {
  const w = m && m.walls;
  if (!w) return false;
  if (dx === 1) return Boolean(w[x + ',' + y] & WALL_EAST);
  if (dx === -1) return Boolean(w[(x - 1) + ',' + y] & WALL_EAST);
  if (dy === 1) return Boolean(w[x + ',' + y] & WALL_SOUTH);
  if (dy === -1) return Boolean(w[x + ',' + (y - 1)] & WALL_SOUTH);
  return false;
}

/* A step from one square to the next on a line, diagonals included. A
   diagonal step gets past only if one of the two ways round the corner is
   open: a wall on each of two sides of a corner seals it, as it would a
   doorway. */
export function stepBlocked(m, from, to) {
  const dx = Math.sign(to.x - from.x), dy = Math.sign(to.y - from.y);
  if (!dx && !dy) return false;
  if (!dy) return wallBetween(m, from.x, from.y, dx, 0);
  if (!dx) return wallBetween(m, from.x, from.y, 0, dy);
  const viaX = wallBetween(m, from.x, from.y, dx, 0) || wallBetween(m, from.x + dx, from.y, 0, dy);
  const viaY = wallBetween(m, from.x, from.y, 0, dy) || wallBetween(m, from.x, from.y + dy, dx, 0);
  return viaX && viaY;
}

/* The edge nearest a point given in squares, fractions and all: the one a
   click lands on. Returned the way it is stored, as a square and its east or
   south side, or null for the outer edge of the grid's top or left. */
export function edgeNear(fx, fy) {
  const x = Math.floor(fx), y = Math.floor(fy);
  const ox = fx - x, oy = fy - y;
  const side = [[ox, 'W'], [1 - ox, 'E'], [oy, 'N'], [1 - oy, 'S']].sort((a, b) => a[0] - b[0])[0][1];
  const e = side === 'E' ? { x, y, bit: WALL_EAST }
    : side === 'W' ? { x: x - 1, y, bit: WALL_EAST }
      : side === 'S' ? { x, y, bit: WALL_SOUTH }
        : { x, y: y - 1, bit: WALL_SOUTH };
  return e.x < 0 || e.y < 0 ? null : e;
}

export const hasWall = (walls, e) => Boolean(e && walls && (walls[cellKey(e.x, e.y)] & e.bit));

// The walls with one edge put up or taken down.
export function setWall(walls, e, on = true) {
  const next = { ...(walls || {}) };
  if (!e) return next;
  const k = cellKey(e.x, e.y);
  const bits = on ? (next[k] || 0) | e.bit : (next[k] || 0) & ~e.bit;
  if (bits) next[k] = bits; else delete next[k];
  return next;
}

// Every thin wall round these squares, gone: erasing a square takes the walls
// on all four of its sides with it, or the deck keeps a wall edging nothing.
export function clearWallsAround(walls, cells) {
  const next = { ...(walls || {}) };
  const drop = (x, y, bit) => {
    const k = cellKey(x, y);
    if (!next[k]) return;
    const b = next[k] & ~bit;
    if (b) next[k] = b; else delete next[k];
  };
  for (const c of cells || []) {
    drop(c.x, c.y, WALL_EAST | WALL_SOUTH);
    drop(c.x - 1, c.y, WALL_EAST);
    drop(c.x, c.y - 1, WALL_SOUTH);
  }
  return next;
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

/* A sentence for what stopped a lane, for the ruler and the overlays. */
export function blockedText(b) {
  if (!b) return '';
  if (b.reason === 'door') return `a ${b.state} bulkhead`;
  if (b.reason === 'obscured') return 'foliage or smoke';
  if (b.reason === 'cover') return 'cover';
  return 'a wall';
}

/* The same walk, on a map that has ALREADY been read. visibleCells asks this
   once per square on the board, and readMap rebuilds the whole floor, door
   and marker set each time it is called — re-reading inside the loop made a
   single redraw rebuild the map several hundred times and stalled the tab. */
function walkLine(m, from, to, { sight = true } = {}) {
  if (!from || !to) return null;
  const steps = Math.ceil(distanceSquares(from, to) * 2);
  if (steps === 0) return null;
  // Whether a deck has been painted at all is a property of the MAP, not of
  // the step: asking Object.keys(floor).length inside the loop walked every
  // key in the map on every square of every line, which on a large deck is
  // billions of operations for one redraw and freezes the tab.
  const built = !isEmpty(m.floor);
  // Sight carried into foliage or smoke so far, in metres, and the shortest
  // reach of any density crossed on the way (a thin screen then a thick one
  // is stopped by the thick one's limit). Templates — a blast, a flame cone
  // — pass `sight: false`: a grenade is not stopped by smoke.
  const hasObscuring = sight && !isEmpty(m.obscuring);
  const metresPerStep = (distanceSquares(from, to) / steps) * (m.metresPerSquare || 1);
  let through = 0;
  let limit = Infinity;
  // A thin wall stands between two squares, not on one, so it is found by
  // looking at each step from one square to the next.
  const thin = !isEmpty(m.walls);
  let prev = { x: from.x, y: from.y };
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(from.x + (to.x - from.x) * t);
    const y = Math.round(from.y + (to.y - from.y) * t);
    const isTarget = x === to.x && y === to.y;
    const k = cellKey(x, y);
    if (thin && (x !== prev.x || y !== prev.y)) {
      if (stepBlocked(m, prev, { x, y })) return { x, y, reason: 'wall' };
      prev = { x, y };
    }
    if (hasObscuring && !(x === from.x && y === from.y)) {
      // The target's own square counts: something crouched in the reeds is
      // hidden by them. The firer's own square does not.
      const o = obscuringById(m.obscuring[k]);
      if (o) {
        through += metresPerStep;
        limit = Math.min(limit, o.blocksAfterM);
        if (through > limit) return { x, y, reason: 'obscured', density: o.id };
      }
    }
    if (isTarget) break;                       // the target's own square is not cover
    if (x === from.x && y === from.y) continue;
    const door = m.doors[k];
    if (door && doorBlocks(door.state)) {
      return { x, y, reason: 'door', state: door.state, kind: door.kind };
    }
    // Cover that stands head-high stops the lane; a railing does not, which
    // is the whole point of keeping the two apart.
    const cov = coverAt(m.cover[k]);
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
  const marked = targetBonusAt(m, to);
  return {
    squares: Math.round(squares * 10) / 10,
    metres,
    band,
    // 'out' carries null, not 0: out of range is no shot at all, and a 0 here
    // would be applied to the roll as "no modifier".
    mod: RANGE_MODIFIERS[band],
    // A marked target: the bonus on its own, and the whole thing. Out of range
    // stays null however marked the target is.
    marked,
    total: RANGE_MODIFIERS[band] === null ? null : RANGE_MODIFIERS[band] + marked,
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
/* `halfAngleDeg` is HALF the cone, which is what the geometry wants and NOT
   what a GM means by "a 30 degree cone". The caller halves the number the GM
   typed; it did not always, and the cone came out twice the angle asked for. */
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
    (c.x === centre.x && c.y === centre.y) || !walkLine(m, centre, c, { sight: false }));
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
    const c = coverAt(m.cover[cellKey(x, y)]);
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
/* How far a sight check reaches when nothing says otherwise. A deck can be
   500 squares across now, and asking "what can be seen from here" of every
   square on it is a quarter of a million lines walked. Eighty squares is far
   past anything a line of sight is used for at the table (a long gallery, a
   firing lane) and keeps the answer to a fraction of a second. */
export const LOS_MAX_SQUARES = 80;

export function visibleCells(map, origin, radiusM = null) {
  const m = readMap(map);
  if (!origin) return [];
  const perSquare = m.metresPerSquare || 1;
  const asked = radiusM === null ? Infinity : (Number(radiusM) || 0) / perSquare;
  if (asked <= 0) return [];
  const limit = Math.min(asked, LOS_MAX_SQUARES);
  // Only the box the circle fits in, not the whole grid.
  const x0 = Math.max(0, Math.floor(origin.x - limit)), x1 = Math.min(m.cols - 1, Math.ceil(origin.x + limit));
  const y0 = Math.max(0, Math.floor(origin.y - limit)), y1 = Math.min(m.rows - 1, Math.ceil(origin.y + limit));
  const out = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      if (Math.hypot(x - origin.x, y - origin.y) > limit) continue;
      if (!walkLine(m, origin, { x, y })) out.push({ x, y });
    }
  }
  return out;
}

/* Pulls the numbers an overlay needs straight off a weapon's catalogue line,
   so a flamer's reach and a grenade's Blast come from the same string the
   damage does rather than being typed in again. */
/* HOW FAR A MELEE WEAPON REACHES.

   Rogue Trader does not give melee a range: you are Engaged or you are not,
   and the rules leave it there. At a table with miniatures on squares that
   is not quite enough — a knife and a power lance are both "engaged" and the
   two plainly do not threaten the same squares, and a GM asked whether the
   spear can hit from two squares back wants an answer, not a shrug.

   So these are HOUSE NUMBERS, the way the obscuring-terrain distances above
   are, and they are deliberately coarse:

     1 square   everything held in the hand. A sword, an axe, a fist.
     2 squares  anything on a haft or a cord — a staff, a spear, a whip,
                something two-handed and swung wide.

   The cue is the weapon's name and its qualities, because the data has no
   reach field: Flexible is the whip-and-chain quality, and the rest is read
   off words that mean "long". A GM who disagrees moves the model. */
const LONG_HAFT = /\b(staff|spear|lance|pike|polearm|halberd|glaive|scythe|eviscerator|great weapon)\b/i;

export function meleeReachM({ name = '', qualities = [], perSquare = 1 } = {}) {
  const words = `${name} ${(qualities || []).join(' ')}`;
  const squares = LONG_HAFT.test(words) || /\bflexible\b/i.test(words) ? 2 : 1;
  return squares * (Number(perSquare) || 1);
}

/* What a weapon is, beyond its numbers: enough for the overlay to draw it as
   itself rather than as a generic line. `meta` carries the things the stats
   line does not say — what kind of weapon it is and what it is called — and
   is optional, so a caller with only a stats string still gets the rest. */
export function weaponOverlay(stats, meta = {}) {
  // The field figures are read off the raw line rather than the parsed
  // qualities: parseWeaponStats splits a segment on ", " as well as on the
  // separator, which cuts "aura, 5 m" into two useless halves.
  const text = String(stats || '');
  const parsed = parseWeaponStats(stats);
  const qualities = (parsed.qualities || []).join(' ');
  const blast = /blast\s*\((\d+)\)/i.exec(qualities);
  const rating = /protection rating\s*(\d+)/i.exec(text);
  const aura = /aura,?\s*(\d+)\s*m/i.exec(text);
  const kind = meta.kind || null;
  const name = meta.name || '';
  const isMelee = kind === 'Melee';
  return {
    range: parsed.range,
    kind,
    // Blast (X) is a radius in metres from the point of impact.
    blastM: blast ? Number(blast[1]) : null,
    isFlame: /flame/i.test(qualities),
    isMelee,
    /* Melee has no range in the data, so without this a knife reported
       "standard range, no modifier" at fifty metres: rangeBand falls back to
       standard when it is handed nothing, and nothing is exactly what a
       sword's stat line gives it. */
    reachM: isMelee ? meleeReachM({ name, qualities: parsed.qualities, perSquare: meta.perSquare }) : null,
    isThrown: kind === 'Thrown',
    isHeavy: kind === 'Heavy',
    // A shotgun sprays, and a weapon that can empty a magazine in a burst
    // does not put one neat hole in anything.
    isScatter: /\bscatter\b/i.test(qualities),
    burst: parsed.modes && (parsed.modes.fullAuto || parsed.modes.semiAuto) ? 1 : 0,
    isAccurate: /\baccurate\b/i.test(qualities),
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
  // A psychic power or a gaze says its own shape (see powerShape).
  if (ov.overlayKind) return ov.overlayKind;
  if (ov.isField) return 'field';
  if (ov.isFlame) return 'cone';
  // A sword threatens the squares around its bearer, not a lane across the
  // deck; drawing it as a beam said a knife could reach anything it could see.
  if (ov.isMelee) return 'melee';
  return 'beam';            // blast weapons draw a beam AND a burst
}

/* Is the target within reach of a melee weapon? Out of reach is no attack at
   all, which is the melee answer to being out of range. */
export function meleeReaches(ov, metres) {
  if (!ov || !ov.isMelee) return null;
  const d = Math.max(0, Number(metres) || 0);
  return d <= (Number(ov.reachM) || 0) + 1e-9;
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
