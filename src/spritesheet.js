/* ---------------------------------------------------------------------------
   SPRITE SHEETS: sixteen tokens on one square image.

   Every environment ships as ONE 4x4 sheet rather than sixteen files, because
   that is how they are made: a single image generation lays all sixteen out
   together, so the crates and the door and the pillar share a palette, a light
   direction and a degree of wear. Generated one at a time they drift, and a
   deck dressed with drifted props looks like a collage.

   The same reason applies at the other end, which is why this module exists at
   all: a sheet the GM generates during a session has to be cut up in the
   browser, and the nine that ship with the app are cut up by a tool on a
   desktop (tools/slice-sprites.mjs). Two callers, one set of rules — the grid,
   the slot order, and how the black goes away.

   ---- the black ----
   The art is generated on a pitch-black background with no frame, which makes
   every sheet a PREMULTIPLIED image: a wisp of smoke at 30% is not grey smoke,
   it is the smoke's own colour already faded toward black. So the alpha is
   recovered from brightness and the colour is divided back out, rather than
   the brightness merely being thresholded. Threshold alone leaves every token
   ringed in the dark fringe where it met the background — which on a dark deck
   reads as a drop shadow nobody asked for, and on pale ice reads as dirt. */

export const SHEET_COLS = 4;
export const SHEET_ROWS = 4;
export const SHEET_CELLS = SHEET_COLS * SHEET_ROWS;

/* Where the background ends and the art begins, as a max-of-RGB.

   Below LO is background and goes fully transparent; above HI is art and is
   left alone; between the two the pixel is part background, which is what an
   edge IS.

   LO is not 1. The sheets measure 0-6 in their corners, but several carry
   faint grid lines around 21 where the generator remembered it was drawing for
   a battle map, and at a threshold of 18 those survive at about 9% opacity —
   invisible on a dark deck, a ghostly box ruled across pale ice. Sitting the
   floor above them costs the outermost wisp of the smoke and gas cells, which
   was at a tenth of an opacity nobody can see anyway. */
export const BLACK_LO = 24;
/* HI is low, and deliberately. It started at 52 on the reasoning that a wider
   band gives a softer edge, and a wider band is exactly what made a grimdark
   set see-through: this art is DARK, so a rusted bulkhead's own recessed
   panels sit in the 24-52 range and came out part-transparent with the deck
   plate showing through them. Narrowed to 34 and checked against the art
   rather than reasoned about — the doors, hatches, machinery and crates all
   read solid at 34, the smoke and gas clouds are still soft, and nothing
   gained the dark outline a hard cut would have given it. */
export const BLACK_HI = 34;

/* ---- the slots ----
   Fixed, and the same on all nine sheets, because the prompt that makes a
   sheet asks for them in this order. Read row by row: four doors and barriers,
   four solid props, four atmospherics, four pieces of ground clutter.

   `role` is this module's name for the cell. What the APP calls it is a
   separate question answered by spriteRole() below, because one role can serve
   several of the app's elements (a closed door and a jammed one are the same
   picture) and some of the app's elements have no picture at all.

   `turn` says whether the picture may be drawn at a quarter turn to break up
   a run of them. Sixteen crates in a hold all facing the same way read as one
   stamp repeated, which is the thing that makes tile art look like tile art.
   A door may not turn — it is a way through a wall and it faces the way the
   wall does — and neither may a barrier, which has a side you crouch on. A
   pile of crates, a fire and a bank of smoke have no front. */
export const SPRITE_SLOTS = [
  { slot: 0, role: 'door_closed', name: 'Door, closed', turn: false },
  { slot: 1, role: 'door_open', name: 'Doorway, open', turn: false },
  { slot: 2, role: 'hatch', name: 'Hatch', turn: false },
  { slot: 3, role: 'barrier', name: 'Low barrier or railing', turn: false },
  { slot: 4, role: 'crates', name: 'Cargo crates', turn: true },
  { slot: 5, role: 'machinery', name: 'Machinery', turn: true },
  { slot: 6, role: 'pillar', name: 'Structural pillar', turn: true },
  { slot: 7, role: 'fire', name: 'Fire', turn: true },
  { slot: 8, role: 'gas', name: 'Toxic gas', turn: true },
  { slot: 9, role: 'energy', name: 'Live current', turn: true },
  { slot: 10, role: 'smoke', name: 'Smoke', turn: true },
  { slot: 11, role: 'scrub', name: 'Light foliage', turn: true },
  { slot: 12, role: 'thicket', name: 'Dense foliage', turn: true },
  { slot: 13, role: 'tangle', name: 'Vines or tangle', turn: true },
  { slot: 14, role: 'grate', name: 'Grating or vent', turn: false },
  { slot: 15, role: 'wall_low', name: 'Low wall', turn: false }
];

/* How far to turn the picture on this square: 0, 1, 2 or 3 quarter turns.
   Derived from the square so a deck draws the same way every time it opens —
   a prop that span to a new angle on every redraw would be unusable. */
export function spriteTurn(role, at) {
  const hit = SPRITE_SLOTS.find((s) => s.role === role);
  if (!hit || !hit.turn || !at) return 0;
  const x = Math.round(Number(at.x));
  const y = Math.round(Number(at.y));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
  // Two coprime multipliers, so neighbours in a row and neighbours in a
  // column both get different angles rather than the grid banding into
  // diagonal stripes of one angle.
  return (((x * 3 + y * 7) % 4) + 4) % 4;
}

export const SPRITE_ROLES = SPRITE_SLOTS.map((s) => s.role);
export const slotOfRole = (role) => {
  const hit = SPRITE_SLOTS.find((s) => s.role === role);
  return hit ? hit.slot : -1;
};

/* Which sheet belongs to which ground. The sheets are named for the place and
   the themes for the fiction, so the two lists have to be married somewhere;
   here, once, rather than by a filename convention that would break the first
   time a theme was renamed. */
export const SHEET_FOR_THEME = {
  space_hulk: 'SpaceHulk',
  rogue_trader: 'Deck',
  genestealer_hive: 'Infested',
  blackstone_fortress: 'Blackstone',
  tau_station: 'Tau',
  jungle: 'Jungle',
  desert: 'Desert',
  ice: 'Ice',
  hive_city: 'Hive',
  command_deck: 'Command',
  forge_sanctum: 'Forge',
  cogitator_vault: 'Cogitator',
  enginarium: 'Enginarium',
  cargo_lanes: 'Cargo',
  hangar_bay: 'Hangar',
  lower_decks: 'LowerDecks',
  medicae: 'Medicae'
};

/* Grounds whose own sheet has not been made yet, and whose props they wear
   until it is: the nearest of the shipped sets. A theme leaves this table the
   day its sheet is cut (tools/slice-sprites.mjs says so), and the check holds
   that a lender has a set of its own. `node tools/props-prompt.mjs <theme>`
   prints the prompt for a ground's sheet. */
export const TOKENS_BORROWED = {
  command_deck: 'rogue_trader',
  forge_sanctum: 'rogue_trader',
  cogitator_vault: 'rogue_trader',
  medicae: 'rogue_trader',
  enginarium: 'hive_city',
  cargo_lanes: 'space_hulk',
  hangar_bay: 'space_hulk',
  lower_decks: 'space_hulk'
};
// The folder a ground's prop pictures are served from.
export const tokenDirFor = (theme) => (SHEET_FOR_THEME[theme] ? TOKENS_BORROWED[theme] || theme : null);

/* ---- which picture an element gets ----

   Returns a role, or null to mean "draw it the way it was drawn before". Null
   is not a failure: Vacuum breach and Radiation have no token on the sheets,
   and a flat wash with a label is a perfectly good way to show a square that
   is dangerous rather than occupied. Anything that returns a role still falls
   back to the flat drawing when that sheet has not loaded, so the map never
   waits on an image.

   `at` is the square's own coordinate and only decides between two pictures of
   the same thing — the sheets carry a railing AND a low wall, and alternating
   them by position keeps a long barrier from looking stamped. Position rather
   than random so the same deck draws the same way every time it opens. */
export function spriteRole(kind, id, state = null, at = null) {
  if (kind === 'door') {
    if (id === 'hatch') return 'hatch';
    return state === 'open' ? 'door_open' : 'door_closed';
  }
  if (kind === 'cover') {
    if (id === 'crates') return 'crates';
    if (id === 'machinery') return 'machinery';
    if (id === 'pillar') return 'pillar';
    /* ONE picture for every barrier, so a run of them is one barrier.

       The sheets carry two low-cover pictures — a railing and a low wall —
       and this used to alternate between them by position, on the reasoning
       that repeating one picture looks stamped. That reasoning is wrong for
       this prop in particular: a barrier is laid square by square to make a
       LINE, and alternating two different barriers along it reads as a
       railing that changes into a wall and back. Cohesion beats variety for
       the one prop whose whole purpose is to join up with itself.

       That leaves wall_low cut and shipped but unasked for, like the smoke
       cell: it wants to be a cover type of its own, with its own Armour
       Points, rather than a second skin for this one. */
    if (id === 'low') return 'barrier';
    return null;
  }
  // Markers that are a piece of the deck draw as one: a crawlway's mouth is
  // the ground's own grating.
  if (kind === 'marker') return id === 'vent' ? 'grate' : null;
  if (kind === 'hazard') {
    if (id === 'fire') return 'fire';
    if (id === 'toxic') return 'gas';
    if (id === 'electrical') return 'energy';
    // Vacuum and radiation: no token, and inventing one would lie about what
    // the square is. The grate is a hole in the floor, not a hull breach.
    return null;
  }
  /* Obscuring terrain is stored as a density — light, medium, heavy — and the
     sheets carry four pictures that could serve it: three kinds of greenery
     and a bank of smoke. Density picks the greenery, because that is the axis
     the map actually records. The smoke cell is cut and shipped but nothing
     asks for it yet: choosing smoke over foliage for a square would mean
     storing that choice, and the map format is not being changed for a
     picture. */
  if (kind === 'obscure') {
    if (id === 'light') return 'scrub';
    if (id === 'medium') return 'tangle';
    if (id === 'heavy') return 'thicket';
    return null;
  }
  return null;
}

/* ---- the fixtures sheet ----

   A SECOND 4x4 sheet, for what the map gained after the first sixteen: the
   things on a deck that are WORKED or that ACT rather than sit there. Cut and
   keyed exactly as the first is (same grid, same black, same rules), but it is
   not a replacement for it: the first sheet is per environment and carries the
   everyday props, this one is the equipment of a ship or station and is the
   same wherever it is drawn, only dressed in the place's materials.

   Why a sheet and not sixteen calls: the same reason as before. A terminal,
   its burnt-out twin and the turret next to it have to share a palette and a
   light direction, or a deck dressed with them looks like a collage.

   Four rows, read left to right:
     1  the cogitator terminal in its three states, and the sentry turret
     2  the turret switched off, the shrine, the vent, the promethium tanks
     3  two pictures of the warp rift, and the airlock shut and open
     4  the hull breach, radiation, dead gravity, the boarding torpedo

   `turn` is the same question as before, and it matters more here. A turret is
   drawn pointing straight UP and the map turns it to its facing, so the sheet
   must not also be turned by position: it is false for everything with a front
   (the terminal's screen, the turret's barrel, the airlock in its wall, the
   shrine's altar, the torpedo's nose). The rift has two pictures so that a run
   of them, which is what a spreading rift is, is not one stamp.

   The order is load-bearing and is asked for in the same words by
   FIXTURE_SLOTS in lib/mapprompt.js; mapprompt.check.mjs holds the two to each
   other, as it does for the first sheet. */
export const FIXTURE_SLOTS = [
  { slot: 0, role: 'terminal_locked', name: 'Terminal, locked', turn: false },
  { slot: 1, role: 'terminal_open', name: 'Terminal, accessed', turn: false },
  { slot: 2, role: 'terminal_dead', name: 'Terminal, burnt out', turn: false },
  { slot: 3, role: 'turret', name: 'Sentry turret', turn: false },
  { slot: 4, role: 'turret_off', name: 'Sentry turret, switched off', turn: false },
  { slot: 5, role: 'shrine', name: 'Shrine', turn: false },
  { slot: 6, role: 'vent', name: 'Vent or crawlway', turn: true },
  { slot: 7, role: 'tanks', name: 'Promethium tanks', turn: true },
  { slot: 8, role: 'rift_a', name: 'Warp rift', turn: true },
  { slot: 9, role: 'rift_b', name: 'Warp rift, second picture', turn: true },
  { slot: 10, role: 'airlock_closed', name: 'Airlock, sealed', turn: false },
  { slot: 11, role: 'airlock_open', name: 'Airlock, open', turn: false },
  { slot: 12, role: 'breach', name: 'Hull breach', turn: true },
  { slot: 13, role: 'radiation', name: 'Radiation', turn: true },
  { slot: 14, role: 'zero_g', name: 'Dead gravity', turn: true },
  { slot: 15, role: 'torpedo_breach', name: 'Boarding torpedo breach', turn: false }
];
export const FIXTURE_ROLES = FIXTURE_SLOTS.map((s) => s.role);

/* Which fixture picture an element gets, or null for "draw it as before".
   Separate from spriteRole() on purpose: that one answers for the first sheet,
   this one for the second, and an element that has a picture on both (the vent
   has the grating and the crawlway mouth) is asked of each. Nothing draws from
   the second sheet yet; this is the table that will, written down and tested
   while the decisions are fresh.

   The warp alternates its two pictures by position, so the same deck draws the
   same way every time it opens and a spreading rift does not look stamped. */
export function fixtureRole(kind, id, state = null, at = null) {
  if (kind === 'marker') {
    if (id === 'cogitator') return state === 'open' ? 'terminal_open' : state === 'dead' ? 'terminal_dead' : 'terminal_locked';
    if (id === 'turret') return state === 'off' ? 'turret_off' : 'turret';
    if (id === 'shrine') return 'shrine';
    if (id === 'vent') return 'vent';
    if (id === 'breach') return 'torpedo_breach';
    return null;
  }
  if (kind === 'cover') return id === 'tank' ? 'tanks' : null;
  if (kind === 'door') {
    if (id !== 'airlock') return null;
    return state === 'open' ? 'airlock_open' : 'airlock_closed';
  }
  if (kind === 'hazard') {
    if (id === 'warp') {
      const x = at ? Math.round(Number(at.x)) : 0;
      const y = at ? Math.round(Number(at.y)) : 0;
      return (((x + y) % 2) + 2) % 2 ? 'rift_b' : 'rift_a';
    }
    if (id === 'void') return 'breach';
    if (id === 'radiation') return 'radiation';
    if (id === 'zerog') return 'zero_g';
    return null;
  }
  return null;
}

/* ---- the void chart's sheet ----

   Sixteen pictures for the void chart, asked for in this order by
   VOID_SHEET_SLOTS in lib/mapprompt.js and held to it by mapprompt.check.mjs.
   The stock set is cut by tools/slice-sprites.mjs into public/maps/tokens/void;
   one the GM generates is cut in the browser (useVoidArt.js).

   No `turn` here: the chart turns everything to its own rotation, course or
   heading, so nothing is turned by position. */
export const VOID_SLOTS = [
  { slot: 0, role: 'world_rocky', name: 'Rocky world' },
  { slot: 1, role: 'world_living', name: 'Living world' },
  { slot: 2, role: 'world_ice', name: 'Ice world' },
  { slot: 3, role: 'world_hell', name: 'Volcanic world' },
  { slot: 4, role: 'gas_giant', name: 'Gas giant' },
  { slot: 5, role: 'moon', name: 'Moon' },
  { slot: 6, role: 'asteroid', name: 'Asteroid' },
  { slot: 7, role: 'rock', name: 'Belt rock' },
  { slot: 8, role: 'debris', name: 'Wreckage' },
  { slot: 9, role: 'station', name: 'Station' },
  { slot: 10, role: 'hulk', name: 'Space hulk' },
  { slot: 11, role: 'ship_imperial', name: 'Imperial cruiser' },
  { slot: 12, role: 'ship_raider', name: 'Raider' },
  { slot: 13, role: 'torpedoes', name: 'Torpedo salvo' },
  { slot: 14, role: 'attack_craft', name: 'Attack craft' },
  { slot: 15, role: 'warp_rift', name: 'Warp rift' }
];
export const VOID_ROLES = VOID_SLOTS.map((s) => s.role);

const hexHsl = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const hi = Math.max(r, g, b), lo = Math.min(r, g, b), l = (hi + lo) / 2;
  if (hi === lo) return { h: 0, s: 0, l };
  const d = hi - lo;
  const s = l > 0.5 ? d / (2 - hi - lo) : d / (hi + lo);
  const h = hi === r ? ((g - b) / d + (g < b ? 6 : 0)) : hi === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
};

/* Which world a planet is, from the colour the scene gave it (CLIMATE_TONE in
   voidmap.js: burning, hot, temperate, cold, ice, or the grey of no air) or
   the GM picked. Red and hot is the lava world, pale is ice, green-to-blue is
   alive, and anything else is rock, tinted toward its colour so a hot desert
   world reads ochre and an airless one grey. */
export function worldRole(tone) {
  const c = hexHsl(tone);
  if (!c) return 'world_rocky';
  if ((c.h < 25 || c.h > 340) && c.s > 0.45) return 'world_hell';
  if (c.l > 0.6 && c.s < 0.55) return 'world_ice';
  if (c.h >= 90 && c.h <= 200 && c.s > 0.2) return 'world_living';
  return 'world_rocky';
}

/* The picture a body is drawn with, and how much of its own colour is laid
   over it (0 to 1): a gas giant and a rock world take the scene's colour, a
   world with a picture of its own colour does not. Null is "draw it as before"
   (a contact is a ping, not a thing). */
export function voidBodyArt(b) {
  if (!b) return null;
  if (b.kind === 'planet') {
    const role = worldRole(b.tone);
    return { role, tint: role === 'world_rocky' ? 0.45 : 0 };
  }
  if (b.kind === 'gas_giant') return { role: 'gas_giant', tint: 0.55 };
  if (b.kind === 'moon') return { role: 'moon', tint: 0.2 };
  if (['asteroid', 'station', 'hulk', 'torpedoes', 'attack_craft'].includes(b.kind)) return { role: b.kind, tint: 0 };
  return null;
}

// What a field is strewn with, or drawn as. Null: the field's own drawing.
export function voidFieldArt(kind) {
  if (kind === 'asteroid_belt' || kind === 'asteroid_cluster') return 'rock';
  if (kind === 'debris') return 'debris';
  if (kind === 'warp_rift') return 'warp_rift';
  return null;
}

// A ship token, by side: the Imperial cruiser for the players and their
// friends, the raider for everyone else.
export const voidShipArt = (side) => (side === 'enemy' ? 'ship_raider' : 'ship_imperial');

/* ---- the grid ----
   Where a cell sits on a sheet of any size. The shipped sheets are 2048 and a
   generated one may be 1024, so nothing here may assume 512px cells; the only
   fixed thing is that there are four of them across. A sheet whose sides are
   not divisible by four loses the odd pixel at the far edge rather than
   smearing a seam of the next cell into this one. */
export function cellRect(index, sheetW, sheetH = sheetW) {
  const i = Math.max(0, Math.min(SHEET_CELLS - 1, Math.round(Number(index) || 0)));
  const w = Math.floor(Number(sheetW) / SHEET_COLS);
  const h = Math.floor(Number(sheetH) / SHEET_ROWS);
  return { x: (i % SHEET_COLS) * w, y: Math.floor(i / SHEET_COLS) * h, w, h };
}

/* ---- the black into alpha ----

   Works on a plain RGBA array — a canvas ImageData's `data` in the browser, a
   sharp raw buffer in the tool — in place, because these are megabytes and
   copying them twice to be tidy is not tidy.

   Alpha comes from the brightest channel, not from a luminance weighting: a
   pure blue warp glow and a pure yellow arc are both fully present art, and
   weighting the channels the way the eye does would call the blue one
   half-transparent for being blue.

   WHY THE BAND NEEDS TO KNOW WHERE IT IS.

   Brightness alone cannot tell dark ART from half-transparent BACKGROUND, and
   a grimdark set is mostly dark art. Judged on brightness alone, two thirds of
   a rusted bulkhead's own panels came out see-through, and the deck plate
   showed straight through the door — measured, not guessed: 66% of the solid
   art on the space hulk's door, 46% on the flagship's. The pale ice tokens
   were fine at 12%, which is exactly why it looked like a theme problem.

   So the band is resolved by CONNECTIVITY. The background is the dark region
   that reaches the edge of the cell; a dark pixel walled in by art is art, and
   stays solid. Only a pixel that something could reach from outside is faded,
   which is what an edge is.

   Pure black is still cleared wherever it is found, connected or not. That is
   what keeps an open doorway open, and the gaps between a railing's balusters
   and a grating's bars clear: those are holes, and a hole is rendered as true
   #000 while a shadow inside a door is merely dark.

   GLOW, for art lit by its own light on black: a drive flame, a warp rift.
   Its halo is bright enough to pass for solid art at HI, so it came out as an
   opaque brown disc round every flame. With `glow` set, a strongly coloured
   pixel the background can reach fades by its brightness all the way up to
   `glow`, which is what a glow is: light, more or less of it, over whatever
   is behind. Grey is never glow, so a dark hull edge stays solid. Off unless
   asked for; the deck sheets do not ask. */
export const GLOW_SATURATION = 0.4;
export function keyBlack(rgba, { lo = BLACK_LO, hi = BLACK_HI, w = 0, h = 0, glow = 0 } = {}) {
  const span = Math.max(1, hi - lo);
  const n = rgba.length / 4;
  /* No dimensions given means a strip of pixels with no inside — every one of
     them is on the edge, so every one is reachable, which is the old
     brightness-only behaviour. That is what the pixel-level checks want and
     it is the right reading of "I did not tell you the shape". */
  const width = w > 0 && h > 0 && w * h === n ? w : n;
  const height = width === n ? 1 : h;

  // Which pixels the background can reach, walking only through pixels dark
  // enough to be background or its edge. A stack rather than recursion: a
  // 512-square cell of near-black would blow the call stack.
  const open = new Uint8Array(n);
  const stack = [];
  const maxAt = (p) => {
    const i = p * 4;
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    return r > g ? (r > b ? r : b) : (g > b ? g : b);
  };
  const glowAt = (p) => {
    if (!glow) return false;
    const i = p * 4;
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    const m = r > g ? (r > b ? r : b) : (g > b ? g : b);
    const lo2 = r < g ? (r < b ? r : b) : (g < b ? g : b);
    return m < glow && m > 0 && (m - lo2) / m >= GLOW_SATURATION;
  };
  const push = (p) => { if (!open[p] && (maxAt(p) < hi || glowAt(p))) { open[p] = 1; stack.push(p); } };
  for (let x = 0; x < width; x++) { push(x); push((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { push(y * width); push(y * width + width - 1); }
  while (stack.length) {
    const p = stack.pop();
    const x = p % width, y = (p - x) / width;
    if (x > 0) push(p - 1);
    if (x < width - 1) push(p + 1);
    if (y > 0) push(p - width);
    if (y < height - 1) push(p + width);
  }

  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    const m = r > g ? (r > b ? r : b) : (g > b ? g : b);
    if (m <= lo) {
      /* True black, wherever it sits: the background, and the holes in the
         art — an open doorway, the gaps in a railing, the slots of a grate.

         Zero the colour as well. An invisible pixel's colour still shows up
         once anything scales the image: the filter mixes it with its visible
         neighbours, and black leaking in that way is exactly the fringe this
         whole routine exists to avoid. */
      rgba[i] = 0; rgba[i + 1] = 0; rgba[i + 2] = 0; rgba[i + 3] = 0;
      continue;
    }
    // Light on black, reached from outside: as much of it as there is.
    const g0 = open[p] && m >= hi && glowAt(p);
    // Dark, but walled in by art: this is the art's own shadow, not the
    // background showing through it.
    if (!g0 && (m >= hi || !open[p])) { rgba[i + 3] = 255; continue; }
    const a = g0 ? (m - lo) / Math.max(1, glow - lo) : (m - lo) / span;
    // Undo the premultiply: this pixel is the art's own colour faded toward
    // black by `a`, so dividing by `a` recovers the colour it was.
    rgba[i] = Math.min(255, Math.round(r / a));
    rgba[i + 1] = Math.min(255, Math.round(g / a));
    rgba[i + 2] = Math.min(255, Math.round(b / a));
    rgba[i + 3] = Math.round(a * 255);
  }
  return rgba;
}

/* A sheet keyed cell by cell, each with its own band: the void sheet, where a
   world wants a low floor (its dark limb is nearly black and must stay) and a
   torpedo salvo wants its flames to glow. The cells are copied out, keyed with
   the background round each one, and written back. */
export function keyCells(rgba, sheetW, sheetH, optsFor) {
  for (let i = 0; i < SHEET_CELLS; i++) {
    const r = cellRect(i, sheetW, sheetH);
    const cell = new Uint8ClampedArray(r.w * r.h * 4);
    for (let y = 0; y < r.h; y++) {
      const from = ((r.y + y) * sheetW + r.x) * 4;
      cell.set(rgba.subarray(from, from + r.w * 4), y * r.w * 4);
    }
    const o = optsFor(i) || {};
    keyBlack(cell, { ...o, w: r.w, h: r.h });
    if (o.solid) fillSolid(cell, r.w, r.h);
    for (let y = 0; y < r.h; y++) rgba.set(cell.subarray(y * r.w * 4, (y + 1) * r.w * 4), ((r.y + y) * sheetW + r.x) * 4);
  }
  return rgba;
}

/* A SOLID thing's silhouette, closed. A rock in space is lit from one side and
   its shadows go as black as the sky, so the keying bites into its edge and
   punches holes where a crater's shadow reaches the outside. Nothing can tell
   that black from the sky's by its colour; but a rock has no holes, so the
   outline is closed (grown and shrunk back by a few percent of the cell) and
   what lies inside it is filled with the dark of the rock's own shadow. Only
   for what is solid: a station's ring has real space between its spokes. */
export function fillSolid(rgba, w, h, { radius = Math.max(2, Math.round(Math.min(w, h) * 0.025)), shade = [18, 16, 14] } = {}) {
  const n = w * h;
  const on = new Uint8Array(n);
  for (let p = 0; p < n; p++) on[p] = rgba[p * 4 + 3] >= 128 ? 1 : 0;
  // A square max (grow) then min (shrink), each as two one-dimensional passes.
  const pass = (src, grow, horizontal) => {
    const out = new Uint8Array(n);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = grow ? 0 : 1;
        for (let k = -radius; k <= radius; k++) {
          const xx = horizontal ? x + k : x, yy = horizontal ? y : y + k;
          const inside = xx >= 0 && yy >= 0 && xx < w && yy < h;
          const s = inside ? src[yy * w + xx] : 0;
          if (grow ? s : !s) { v = grow ? 1 : 0; break; }
        }
        out[y * w + x] = v;
      }
    }
    return out;
  };
  const closed = pass(pass(pass(pass(on, true, true), true, false), false, true), false, false);
  // And whatever the outside cannot reach without crossing the outline is inside.
  const outside = new Uint8Array(n);
  const stack = [];
  const push = (p) => { if (!outside[p] && !closed[p]) { outside[p] = 1; stack.push(p); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const p = stack.pop();
    const x = p % w, y = (p - x) / w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (y > 0) push(p - w);
    if (y < h - 1) push(p + w);
  }
  for (let p = 0; p < n; p++) {
    if (outside[p] || on[p]) continue;
    const i = p * 4;
    const a = rgba[i + 3] / 255;
    // What little of the art is there shows over the shadow it sits in.
    rgba[i] = Math.round(rgba[i] * a + shade[0] * (1 - a));
    rgba[i + 1] = Math.round(rgba[i + 1] * a + shade[1] * (1 - a));
    rgba[i + 2] = Math.round(rgba[i + 2] * a + shade[2] * (1 - a));
    rgba[i + 3] = 255;
  }
  return rgba;
}

/* How each cell of the void sheet is keyed. Worlds and rocks are solid and
   keep the deck sheets' band; what burns or glows fades by its light; what is
   built has gaps that must stay open, and a slightly lower floor for its dark
   plating. Measured on the shipped sheet against a coloured ground, the way
   the deck band was. */
export function voidKeyOptions(role) {
  if (['torpedoes', 'attack_craft', 'ship_imperial', 'ship_raider', 'warp_rift'].includes(role)) {
    return { lo: 8, hi: 34, glow: 235 };
  }
  if (['station', 'hulk', 'debris'].includes(role)) return { lo: 12, hi: 30 };
  return { solid: true };
}

/* Is there anything in this cell worth keeping? A generated sheet can come
   back with a cell the model left empty, and a blank token drawn over a floor
   is an invisible bug: the GM places cover, nothing appears, and the square
   still blocks sight. Measured as the share of pixels with any opacity at all.
   The threshold is low because a railing is mostly air. */
export function cellCoverage(rgba) {
  let on = 0;
  const n = rgba.length / 4;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 8) on++;
  return n ? on / n : 0;
}
export const MIN_COVERAGE = 0.01;
