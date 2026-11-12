/* Checks for spritesheet.js — the grid, the slot table, and the keying.

   The keying is the part worth testing: it is the one piece of this feature
   that runs twice, once in a desktop tool against a 2048px JPEG and once in
   the browser against a canvas the GM just generated, and a difference between
   the two shows up as tokens that look right in the app and wrong on the
   shipped sheets, or the reverse. */

import { existsSync } from 'node:fs';
import {
  SHEET_COLS, SHEET_ROWS, SHEET_CELLS, SPRITE_SLOTS, SPRITE_ROLES, slotOfRole,
  SHEET_FOR_THEME, spriteRole, cellRect, keyBlack, cellCoverage, MIN_COVERAGE,
  BLACK_LO, BLACK_HI, TOKENS_BORROWED, tokenDirFor, keyCells, fillSolid, voidKeyOptions, VOID_SLOTS, GLOW_SATURATION
} from './spritesheet.js';
import { MAP_THEMES, COVER_TYPES, HAZARD_TYPES, OBSCURING, DOOR_KINDS, DOOR_STATES } from './battlemap.js';

let fails = 0;
const ok = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); fails++; } };

/* ---- the slot table ---- */
ok(SPRITE_SLOTS.length === SHEET_CELLS, 'a slot for every cell');
ok(SHEET_COLS * SHEET_ROWS === SHEET_CELLS, 'the grid multiplies out');
ok(new Set(SPRITE_ROLES).size === SHEET_CELLS, 'every role is distinct');
SPRITE_SLOTS.forEach((s, i) => {
  ok(s.slot === i, `slot ${i} is in its own place (reading order is the sheet order)`);
  ok(typeof s.name === 'string' && s.name.length > 2, `slot ${i} has a name for the GM`);
  ok(slotOfRole(s.role) === i, `${s.role} is found by name`);
});
ok(slotOfRole('nonsense') === -1, 'an unknown role is not found');

/* ---- every theme has a sheet, every sheet a theme ---- */
for (const t of MAP_THEMES) {
  ok(typeof SHEET_FOR_THEME[t.id] === 'string', `${t.id} names a sheet`);
}
ok(Object.keys(SHEET_FOR_THEME).length === MAP_THEMES.length,
  'no sheet is named for a theme that does not exist');
ok(new Set(Object.values(SHEET_FOR_THEME)).size === MAP_THEMES.length,
  'two themes do not share one sheet');
/* A ground with no sheet of its own yet borrows a shipped set: the lender
   must have its own, and a ground whose own set has been cut must stop
   borrowing, or its new tokens would never be seen. */
{
  const tokensAt = (t) => existsSync(new URL(`../public/maps/tokens/${t}/door_closed.webp`, import.meta.url));
  for (const [t, lender] of Object.entries(TOKENS_BORROWED)) {
    ok(MAP_THEMES.some((m) => m.id === t), `${t} borrows, and is a theme`);
    ok(!TOKENS_BORROWED[lender] && tokensAt(lender), `${t} borrows from ${lender}, which has a set of its own`);
    ok(!tokensAt(t), `${t} has its own set cut now: take it out of TOKENS_BORROWED`);
    ok(tokenDirFor(t) === lender, `${t} is served from ${lender}`);
  }
  for (const m of MAP_THEMES) {
    if (!TOKENS_BORROWED[m.id]) ok(tokensAt(m.id) && tokenDirFor(m.id) === m.id, `${m.id} has its own set`);
  }
  ok(tokenDirFor('a-ground-the-gm-generated') === null, 'a generated ground has no folder');
}

/* ---- what the app asks for, it can get ----
   The point of this block is that the two vocabularies cannot drift apart
   silently. Add a cover type and this says which picture it has not got. */
// A cave's narrow passage has no leaf to picture: it is drawn as a threshold.
const DRAWN_DOORS = new Set(['passage']);
for (const k of DOOR_KINDS) {
  for (const st of DOOR_STATES) {
    const role = spriteRole('door', k.id, st);
    if (DRAWN_DOORS.has(k.id)) { ok(role === null, `door ${k.id} is drawn, not a token (got ${role})`); continue; }
    ok(SPRITE_ROLES.includes(role), `door ${k.id}/${st} -> a real role (got ${role})`);
  }
}
ok(spriteRole('door', 'bulkhead', 'open') === 'door_open', 'an open bulkhead is the open archway');
ok(spriteRole('door', 'bulkhead', 'jammed') === 'door_closed', 'a jammed door still looks shut');
ok(spriteRole('door', 'hatch', 'open') === 'hatch', 'a hatch is a hatch either way');

// Promethium tanks are drawn by hand, as the warp is: the sheets have no
// tank, and a crate stack standing in for a bomb would be read as a crate.
const DRAWN_COVER = new Set(['tank']);
for (const c of COVER_TYPES) {
  const role = spriteRole('cover', c.id, null, { x: 0, y: 0 });
  if (DRAWN_COVER.has(c.id)) ok(role === null, `cover ${c.id} is drawn, not a token (got ${role})`);
  else ok(SPRITE_ROLES.includes(role), `cover ${c.id} -> a real role (got ${role})`);
}
for (const o of OBSCURING) {
  const role = spriteRole('obscure', o.id);
  ok(SPRITE_ROLES.includes(role), `obscuring ${o.id} -> a real role (got ${role})`);
}
// Hazards are the one place a null is correct, so assert WHICH ones are null
// rather than that some are: a new hazard arriving with no art should fail
// this line and be thought about, not silently drawn flat.
const hazardRoles = Object.fromEntries(HAZARD_TYPES.map((h) => [h.id, spriteRole('hazard', h.id)]));
ok(hazardRoles.fire === 'fire' && hazardRoles.toxic === 'gas' && hazardRoles.electrical === 'energy',
  'fire, gas and current have tokens');
ok(hazardRoles.warp === null, 'a warp rift is drawn churning, not from a token');
ok(hazardRoles.zerog === null, 'nor is dead gravity: there is nothing there to picture');
ok(hazardRoles.void === null && hazardRoles.radiation === null,
  'vacuum and radiation are drawn flat, deliberately');
ok(spriteRole('nonsense', 'x') === null, 'an unknown kind asks for nothing');

/* ---- every barrier is the same picture ----
   A barrier is laid square by square to make a LINE, so neighbours must match:
   two different low-cover pictures alternating along a run read as a railing
   that turns into a wall and back. This asserts the cohesion directly, because
   an earlier version did alternate them and it looked like a mistake. */
const lows = [];
for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) lows.push(spriteRole('cover', 'low', null, { x, y }));
ok(new Set(lows).size === 1, 'every barrier on the deck is the same picture');
ok(lows[0] === 'barrier', 'and it is the railing, not the low wall');
ok(SPRITE_ROLES.includes(spriteRole('cover', 'low', null, null)), 'and it still works with no position');
// A barrier must not be scattered by position either, or a run of them would
// come apart again at the angles rather than at the artwork.
ok(SPRITE_SLOTS.find((s) => s.role === 'barrier').turn === false,
  'and it is never turned on its own, which would break the run just as badly');

/* ---- the grid ---- */
for (const size of [2048, 1024, 512, 2046]) {
  const seen = [];
  for (let i = 0; i < SHEET_CELLS; i++) {
    const r = cellRect(i, size);
    ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= size && r.y + r.h <= size,
      `cell ${i} of a ${size}px sheet stays on the sheet`);
    seen.push(`${r.x},${r.y}`);
  }
  ok(new Set(seen).size === SHEET_CELLS, `a ${size}px sheet has ${SHEET_CELLS} distinct cells`);
}
// Reading order, because the slot table is written in it.
ok(cellRect(0, 2048).x === 0 && cellRect(0, 2048).y === 0, 'cell 0 is top left');
ok(cellRect(3, 2048).x === 1536 && cellRect(3, 2048).y === 0, 'cell 3 ends the first row');
ok(cellRect(4, 2048).x === 0 && cellRect(4, 2048).y === 512, 'cell 4 begins the second');
ok(cellRect(15, 2048).x === 1536 && cellRect(15, 2048).y === 1536, 'cell 15 is bottom right');
ok(cellRect(99, 2048).x === 1536, 'an index past the end is clamped, not wrapped');
ok(cellRect(-5, 2048).x === 0, 'and so is one before the start');
ok(cellRect(0, 512).w === 128, 'a 512px sheet has 128px cells');

/* ---- the keying ---- */
const px = (r, g, b) => Uint8ClampedArray.from([r, g, b, 255]);

ok(keyBlack(px(0, 0, 0))[3] === 0, 'pitch black goes away');
ok(keyBlack(px(5, 5, 5))[3] === 0, 'and so does the near-black the sheets really have');
ok(keyBlack(px(21, 21, 21))[3] === 0, 'and the faint grid lines at 21, which is why LO is not 1');
ok(keyBlack(px(255, 255, 255))[3] === 255, 'white is solid');
ok(keyBlack(px(BLACK_HI, BLACK_HI, BLACK_HI))[3] === 255, 'and so is anything at HI');
ok(keyBlack(px(0, 0, 200))[3] === 255, 'a saturated blue is solid, not half-there for being blue');
ok(keyBlack(px(200, 0, 0))[3] === 255, 'and so is a saturated red');

// A pixel in between is part background, and its colour is recovered.
{
  const mid = Math.round((BLACK_LO + BLACK_HI) / 2);
  const out = keyBlack(px(mid, mid, mid));
  ok(out[3] > 100 && out[3] < 155, `a half-way pixel is half-way opaque (${out[3]})`);
  ok(out[0] > mid * 1.6, `and brighter than it looked on black (${mid} -> ${out[0]})`);
}
// The transparent ones are zeroed, which is what keeps a dark fringe from
// reappearing the moment the image is scaled down.
{
  const out = keyBlack(px(3, 3, 3));
  ok(out[0] === 0 && out[1] === 0 && out[2] === 0, 'an invisible pixel carries no colour to smear');
}
// Solid art is untouched: a token's interior must come out of this byte for
// byte, or every sheet is quietly recoloured.
{
  const before = [90, 140, 200];
  const out = keyBlack(px(...before));
  ok(out[0] === before[0] && out[1] === before[1] && out[2] === before[2],
    'art above HI keeps its exact colour');
}
// In place, and the same array back, because the callers rely on both.
{
  const buf = px(10, 10, 10);
  ok(keyBlack(buf) === buf, 'the same array is returned');
}
// A custom range, as a sheet with a dirtier background would need.
ok(keyBlack(px(60, 60, 60), { lo: 70, hi: 100 })[3] === 0, 'LO and HI can be moved');

/* ---- dark art is not background ----

   The bug this prevents: judged on brightness alone, a rusted iron door's own
   panels are darker than the edge-feather threshold, so two thirds of the
   door came out see-through and the deck plate showed through it. Measured
   before the fix at 66% of the solid art on one sheet.

   A dark pixel WALLED IN by art is the art's own shadow. A dark pixel the
   background can walk to is an edge. That is the whole rule. */
{
  const W = 9;
  // Inside the feather band, whatever the band currently is: pinning this to a
  // literal is how these checks went stale when HI moved from 52 to 34.
  const DARK = Math.round((BLACK_LO + BLACK_HI) / 2);
  // A ring of bright art with a dark interior, on a dark background.
  const img = new Uint8ClampedArray(W * W * 4);
  const set = (x, y, v) => {
    const i = (y * W + x) * 4;
    img[i] = v; img[i + 1] = v; img[i + 2] = v; img[i + 3] = 255;
  };
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) set(x, y, 2);   // background
  for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) set(x, y, 200); // the art
  // Its inside is dark — the shadow in a door's recess — and sits inside the
  // band, so brightness alone would have called it half-background.
  for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) set(x, y, DARK);
  keyBlack(img, { w: W, h: W });
  const alphaAt = (x, y) => img[(y * W + x) * 4 + 3];

  ok(alphaAt(0, 0) === 0, 'the background still goes');
  ok(alphaAt(4, 4) === 255, 'but the shadow INSIDE the art stays solid');
  ok(alphaAt(3, 3) === 255, 'all of it, not just the middle');
  ok(alphaAt(2, 2) === 255, 'and the art itself is untouched');

  // The same interior, left open to the outside, is background again: an
  // open doorway is a hole and must show the floor through it.
  const open2 = new Uint8ClampedArray(img.length);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    open2[i] = 2; open2[i + 1] = 2; open2[i + 2] = 2; open2[i + 3] = 255;
  }
  const put = (x, y, v) => {
    const i = (y * W + x) * 4;
    open2[i] = v; open2[i + 1] = v; open2[i + 2] = v; open2[i + 3] = 255;
  };
  for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) put(x, y, 200);
  for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) put(x, y, DARK);
  for (let y = 3; y <= 5; y++) put(6, y, DARK);      // break the wall open
  keyBlack(open2, { w: W, h: W });
  ok(open2[(4 * W + 4) * 4 + 3] < 255,
    'a dark region the background can reach is still faded');

  /* TRUE BLACK IS A HOLE WHEREVER IT IS. This is what keeps an open doorway
     open and the gaps between a railing's balusters clear, even though both
     are enclosed by the art around them. */
  const holed = new Uint8ClampedArray(W * W * 4);
  const mark = (x, y, v) => {
    const i = (y * W + x) * 4;
    holed[i] = v; holed[i + 1] = v; holed[i + 2] = v; holed[i + 3] = 255;
  };
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) mark(x, y, 2);
  for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) mark(x, y, 200);
  for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) mark(x, y, 0);
  keyBlack(holed, { w: W, h: W });
  ok(holed[(4 * W + 4) * 4 + 3] === 0, 'an enclosed pure-black hole is still a hole');
  ok(holed[(2 * W + 2) * 4 + 3] === 255, 'and the frame around it is solid');

  // Without dimensions it is a strip with no inside, so everything is
  // reachable: the old brightness-only behaviour, which is what the
  // pixel-level checks above rely on.
  const strip = Uint8ClampedArray.from([DARK, DARK, DARK, 255]);
  keyBlack(strip);
  ok(strip[3] > 0 && strip[3] < 255, 'with no shape given, a dark pixel still fades');
}

/* ---- coverage ---- */
{
  const empty = new Uint8ClampedArray(64 * 4);
  ok(cellCoverage(empty) === 0, 'an empty cell covers nothing');
  ok(cellCoverage(empty) < MIN_COVERAGE, 'and reads as empty');
  const full = new Uint8ClampedArray(64 * 4).fill(255);
  ok(cellCoverage(full) === 1, 'a full cell covers everything');
  const sparse = new Uint8ClampedArray(1000 * 4);
  for (let i = 0; i < 30; i++) sparse[i * 4 + 3] = 255;
  ok(Math.abs(cellCoverage(sparse) - 0.03) < 1e-9, 'and a sparse one reads in between');
  ok(cellCoverage(sparse) > MIN_COVERAGE, 'a railing is mostly air and still counts as art');
}

/* ---- glow: light on black fades by its light ---- */
{
  // A strip: background, a dim orange halo, the bright flame, a dim grey hull edge.
  const px = (r, g, b) => [r, g, b, 255];
  const strip = () => new Uint8ClampedArray([
    ...px(0, 0, 0), ...px(90, 40, 8), ...px(255, 200, 120), ...px(60, 58, 56), ...px(0, 0, 0)]);
  const off = keyBlack(strip(), { lo: 8, hi: 34 });
  ok(off[7] === 255, 'without glow the halo is solid (the brown disc)');
  const on = keyBlack(strip(), { lo: 8, hi: 34, glow: 235 });
  ok(on[7] > 0 && on[7] < 128, 'with glow the halo is part light: ' + on[7]);
  ok(on[4] > 200, 'and its colour is the light\u2019s, not the dark it was faded toward: ' + on[4]);
  ok(on[11] > 200, 'the flame itself stays nearly solid: ' + on[11]);
  ok(on[15] === 255, 'grey is never glow: a dark hull edge stays solid');
  ok(on[3] === 0 && on[19] === 0, 'the background is gone');
  ok(GLOW_SATURATION > 0 && GLOW_SATURATION < 1);
}

/* ---- a solid thing's outline is closed ---- */
{
  // A 20x20 disc of art with a bite out of its edge and a hole in its middle,
  // and a ring (like a station's) that is NOT solid.
  const w = 20, h = 20;
  const make = () => new Uint8ClampedArray(w * h * 4);
  const disc = make();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot(x - 9.5, y - 9.5);
    const bite = x >= 14 && x <= 15 && y >= 9 && y <= 10;
    const hole = x >= 9 && x <= 10 && y >= 9 && y <= 10;
    if (d < 7 && !bite && !hole) { const i = (y * w + x) * 4; disc[i] = 120; disc[i + 1] = 110; disc[i + 2] = 100; disc[i + 3] = 255; }
  }
  const at = (a, x, y) => a[(y * w + x) * 4 + 3];
  fillSolid(disc, w, h, { radius: 2 });
  ok(at(disc, 9, 9) === 255, 'the hole in the middle is filled');
  ok(at(disc, 15, 10) === 255, 'and the bite out of the edge');
  ok(at(disc, 0, 0) === 0 && at(disc, 19, 19) === 0, 'and the sky outside it is left alone');
  ok(disc[(9 * w + 9) * 4] < 40, 'with the dark of a shadow, not a colour from nowhere');
}

/* ---- the void sheet is keyed cell by cell ---- */
{
  ok(VOID_SLOTS.every((s) => voidKeyOptions(s.role)), 'every void cell has a band');
  ok(voidKeyOptions('world_living').solid && voidKeyOptions('asteroid').solid, 'worlds and rocks are solid');
  ok(!voidKeyOptions('station').solid, 'a station has space between its spokes');
  ok(voidKeyOptions('torpedoes').glow > 0 && voidKeyOptions('warp_rift').glow > 0, 'what burns glows');
  // An 8x8 sheet: cell 0 solid with a hole, every other cell empty black.
  const W = 8, sheet = new Uint8ClampedArray(W * W * 4);
  for (const [x, y] of [[0, 0], [1, 0], [0, 1]]) { const i = (y * W + x) * 4; sheet[i] = sheet[i + 1] = sheet[i + 2] = 200; sheet[i + 3] = 255; }
  for (let p = 0; p < W * W; p++) if (!sheet[p * 4 + 3]) sheet[p * 4 + 3] = 255;
  keyCells(sheet, W, W, () => ({}));
  ok(sheet[3] === 255 && sheet[(W * W - 1) * 4 + 3] === 0, 'each cell is keyed with the background round it');
}

console.log(fails === 0 ? 'spritesheet.js: all checks passed' : `spritesheet.js: ${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
