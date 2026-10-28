/* Checks for spritesheet.js — the grid, the slot table, and the keying.

   The keying is the part worth testing: it is the one piece of this feature
   that runs twice, once in a desktop tool against a 2048px JPEG and once in
   the browser against a canvas the GM just generated, and a difference between
   the two shows up as tokens that look right in the app and wrong on the
   shipped sheets, or the reverse. */

import {
  SHEET_COLS, SHEET_ROWS, SHEET_CELLS, SPRITE_SLOTS, SPRITE_ROLES, slotOfRole,
  SHEET_FOR_THEME, spriteRole, cellRect, keyBlack, cellCoverage, MIN_COVERAGE,
  BLACK_LO, BLACK_HI
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

/* ---- what the app asks for, it can get ----
   The point of this block is that the two vocabularies cannot drift apart
   silently. Add a cover type and this says which picture it has not got. */
for (const k of DOOR_KINDS) {
  for (const st of DOOR_STATES) {
    const role = spriteRole('door', k.id, st);
    ok(SPRITE_ROLES.includes(role), `door ${k.id}/${st} -> a real role (got ${role})`);
  }
}
ok(spriteRole('door', 'bulkhead', 'open') === 'door_open', 'an open bulkhead is the open archway');
ok(spriteRole('door', 'bulkhead', 'jammed') === 'door_closed', 'a jammed door still looks shut');
ok(spriteRole('door', 'hatch', 'open') === 'hatch', 'a hatch is a hatch either way');

for (const c of COVER_TYPES) {
  const role = spriteRole('cover', c.id, null, { x: 0, y: 0 });
  ok(SPRITE_ROLES.includes(role), `cover ${c.id} -> a real role (got ${role})`);
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
ok(hazardRoles.void === null && hazardRoles.radiation === null,
  'vacuum and radiation are drawn flat, deliberately');
ok(spriteRole('nonsense', 'x') === null, 'an unknown kind asks for nothing');

/* ---- the two low-cover pictures alternate by position ---- */
const lows = [];
for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) lows.push(spriteRole('cover', 'low', null, { x, y }));
ok(new Set(lows).size === 2, 'low cover uses both of its pictures');
ok(spriteRole('cover', 'low', null, { x: 0, y: 0 }) === spriteRole('cover', 'low', null, { x: 0, y: 0 }),
  'and the same square always gets the same one');
ok(spriteRole('cover', 'low', null, { x: 1, y: 0 }) !== spriteRole('cover', 'low', null, { x: 0, y: 0 }),
  'neighbours differ, so a run of barrier is not one stamp repeated');
ok(SPRITE_ROLES.includes(spriteRole('cover', 'low', null, null)), 'and it still works with no position');

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

console.log(fails === 0 ? 'spritesheet.js: all checks passed' : `spritesheet.js: ${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
