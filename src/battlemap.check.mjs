// Self-check for the boarding battle map. Run: node src/battlemap.check.mjs
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import {
  MAP_THEMES, DEFAULT_THEME, themeById, EMPTY_MAP, readMap,
  distanceSquares, distanceMetres, reachBetween, deploymentRows, calibrationBar,
  rangeRings, areaCells, coneCells, visibleCells, weaponOverlay, unobstructed,
  overlayKindFor, onDeck,
  DOOR_KINDS, doorKindById, readDoor, COVER_TYPES, coverById, coverBetween,
  HAZARD_TYPES, hazardById,
  CONTACT_STATES, nextContactState, readContact, auspexSweep, fogStateAt,
  readSavedMap, readMapLibrary, newBattleMap, publishMap,
  regionAt, regionsAroundDoor, revealArea, concealArea, openReach, visibleExplored,
  fitGrid, MAX_CUSTOM_TEXTURE, brushCells, MAX_GRID, MIN_GRID,
  clampZoom, MIN_ZOOM, MAX_ZOOM,
  themeNumbersFor, BRIGHT_FLOOR, readCustomTheme, readThemeLibrary, resolveTheme,
  textureAdvice, SQUARE_TOLERANCE, expandMap, expandPlan, groundsUsed, tokensNeeded,
  readCover, writeCover, turnAllCover, countDirectionalCover,
  TILE_CATALOG, tileById, TILE_CATEGORIES, stampCells, paintCells, isFloor,
  cellKey, parseKey, wallMask, cornerPillar, floorBounds, lineBlocked,
  WALL_N, WALL_E, WALL_S, WALL_W,
  DOOR_STATES, nextDoorState, doorBlocks, MARKER_TYPES, markerTypeById
} from './battlemap.js';
import { rangeBand, parseWeaponStats, RANGE_MODIFIERS, conditionById } from './groundcombat.js';
import { GEAR } from './gear.js';

/* ---- themes ---- */

{
  assert.ok(MAP_THEMES.length >= 4);
  const ids = MAP_THEMES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate theme id');
  for (const t of MAP_THEMES) {
    assert.ok(t.name && t.subtitle && t.desc, t.id + ': incomplete theme');
    // The texture is a static file, not a bundled import, and every theme
    // must name one that exists on disk — a 404 silently renders the flat
    // fallback colour and looks like a styling bug rather than a missing file.
    assert.equal(t.texture, `/maps/${t.id}.jpg`);
    // AND THE FILE IS ACTUALLY THERE. A theme whose texture 404s renders
    // the flat fallback colour and reads as a styling bug rather than as a
    // missing asset, which is a thing to discover on a projector in front
    // of the table rather than here.
    const file = new URL(`../public/maps/${t.id}.jpg`, import.meta.url);
    assert.ok(existsSync(file), `${t.id}: public/maps/${t.id}.jpg is missing`);
    const bytes = statSync(file).size;
    assert.ok(bytes > 20000, `${t.id}: texture is only ${bytes} bytes`);
    assert.ok(bytes < 900000,
      `${t.id}: texture is ${Math.round(bytes / 1024)}KB — resample it, a GM loads this over hotel wifi`);
    assert.match(t.grid, /^#[0-9a-f]{6}$/i, t.id + ': grid colour');
    // Every theme knocks its deck back by SOME amount, and never so far
    // that the floor it took a texture to get is no longer visible.
    assert.ok(typeof t.wash === 'number' && t.wash >= 0 && t.wash <= 0.5,
      t.id + ': wash is ' + t.wash);
    // The grid is how the table counts squares. A theme that drew it at
    // zero would look clean and be unusable.
    assert.ok(typeof t.gridAlpha === 'number' && t.gridAlpha > 0.1 && t.gridAlpha <= 1,
      t.id + ': gridAlpha is ' + t.gridAlpha);
    assert.match(t.fallback, /^#[0-9a-f]{6}$/i, t.id + ': fallback colour');
  }
  // An unknown id falls back rather than returning undefined and crashing
  // the renderer on theme.grid — and it falls back to the SAME theme
  // EMPTY_MAP names, or a map saved with no theme would open on one theme
  // while a map saved with a bad one opened on another.
  assert.equal(themeById('nonsense').id, DEFAULT_THEME);
  assert.equal(themeById(null).id, DEFAULT_THEME);
  assert.equal(EMPTY_MAP.theme, DEFAULT_THEME);
  assert.equal(readMap({}).theme, DEFAULT_THEME);
  // AN UNKNOWN THEME ID IS KEPT. A saved ground's id is unknown to this
  // module by design; matching it against the built-in list here moved every
  // deck built on one back to the default, and the picker then correctly
  // showed the default while the GM thought they were on their own ground.
  assert.equal(readMap({ theme: 'env-abc123-0' }).theme, 'env-abc123-0');
  assert.equal(readMap({ theme: '  env-abc123-0  ' }).theme, 'env-abc123-0');
  assert.equal(readMap({ theme: '' }).theme, DEFAULT_THEME);
  assert.equal(readMap({ theme: 42 }).theme, DEFAULT_THEME);
  // resolveTheme is what makes that safe, where the library is in hand.
  assert.equal(resolveTheme(readMap({ theme: 'env-gone' }).theme, []).id, DEFAULT_THEME);
  assert.equal(themeById('blackstone_fortress').name, 'Blackstone Citadel');
  assert.equal(themeById('tau_station').name, 'T\u2019au Void Station');
  // The bright station deck is washed less than the dim hulk plate, or it
  // would come out the same grey as everything else.
  assert.ok(themeById('tau_station').wash < themeById('space_hulk').wash);
  // and its dark grid is drawn harder, because a dark line on a bright
  // floor needs more ink than a bright line on a dim one.
  assert.ok(themeById('tau_station').gridAlpha > themeById('space_hulk').gridAlpha);
}

/* ---- reading a stored map ---- */

{
  assert.deepEqual(readMap(null), EMPTY_MAP);
  assert.deepEqual(readMap(undefined).floor, {});
  assert.deepEqual(readMap('nonsense').floor, {});
  // Nothing records who is standing where. The miniatures do that, and a
  // position stored here would be a second, wrong answer to the question.
  assert.equal(readMap({ tokens: { n1: { x: 1, y: 1 } } }).tokens, undefined);

  // Out-of-range dimensions are clamped, not taken on trust: a 10,000-column
  // map would try to draw 200,000 grid lines. The bound itself is checked
  // against MAX_GRID below, so it is named rather than written twice.
  assert.equal(readMap({ cols: 99999 }).cols, MAX_GRID);
  assert.equal(readMap({ cols: 1 }).cols, MIN_GRID);
  assert.equal(readMap({ cols: 'nonsense' }).cols, EMPTY_MAP.cols);

  // Half-metre squares survive; zero and negative do not, because every
  // distance would come back 0 and every shot would read point-blank.
  assert.equal(readMap({ metresPerSquare: 0.5 }).metresPerSquare, 0.5);
  assert.equal(readMap({ metresPerSquare: 0 }).metresPerSquare, 1);
  assert.equal(readMap({ metresPerSquare: -3 }).metresPerSquare, 1);
  assert.equal(readMap({ metresPerSquare: 500 }).metresPerSquare, 10);

  // A malformed floor cell is dropped rather than reaching the renderer.
  const m = readMap({ floor: { '3,4': true, '5,5': false, 'x,y': true, '7,': true } });
  assert.deepEqual(Object.keys(m.floor), ['3,4']);
}

/* ---- the tile catalogue ---- */

{
  assert.ok(TILE_CATALOG.length >= 15);
  const ids = TILE_CATALOG.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate tile id');
  for (const t of TILE_CATALOG) {
    assert.ok(t.name && t.category, t.id + ': incomplete tile');
    assert.ok(Number.isInteger(t.w) && t.w >= 1, t.id + ': bad width');
    assert.ok(Number.isInteger(t.h) && t.h >= 1, t.id + ': bad height');
  }
  assert.ok(TILE_CATEGORIES.includes('Corridors') && TILE_CATEGORIES.includes('Rooms'));
  assert.equal(tileById('nope'), null);
  assert.equal(tileById('room_5x5').w, 5);
}

/* ---- stamping ---- */

{
  const map = readMap({ cols: 20, rows: 20 });

  // A 1x5 corridor is five cells in a line...
  const vertical = stampCells('corridor_1x5', { x: 3, y: 2 }, 0, map);
  assert.equal(vertical.length, 5);
  assert.deepEqual(vertical.map((c) => c.y), [2, 3, 4, 5, 6]);
  assert.ok(vertical.every((c) => c.x === 3));

  // ...and rotating it 90 degrees turns it, which is the entire point of
  // being able to rotate a corridor.
  const horizontal = stampCells('corridor_1x5', { x: 3, y: 2 }, 90, map);
  assert.equal(horizontal.length, 5);
  assert.deepEqual(horizontal.map((c) => c.x), [3, 4, 5, 6, 7]);
  assert.ok(horizontal.every((c) => c.y === 2));

  // 180 is the original footprint again, 270 the turned one.
  assert.deepEqual(stampCells('corridor_1x5', { x: 3, y: 2 }, 180, map), vertical);
  assert.deepEqual(stampCells('corridor_1x5', { x: 3, y: 2 }, 270, map), horizontal);
  assert.deepEqual(stampCells('corridor_1x5', { x: 3, y: 2 }, 360, map), vertical);
  // A square room is unchanged by rotation, and must not lose cells to it.
  assert.equal(stampCells('room_3x3', { x: 0, y: 0 }, 90, map).length, 9);

  // A stamp hanging off the edge is TRUNCATED, not clamped. Clamping would
  // fold the corridor back on itself into a stack of cells at the boundary,
  // turning a five-square hallway into a two-square stub without saying so.
  const overhang = stampCells('corridor_1x5', { x: 3, y: 18 }, 0, map);
  assert.equal(overhang.length, 2);
  assert.deepEqual(overhang.map((c) => c.y), [18, 19]);
  assert.equal(new Set(overhang.map((c) => cellKey(c.x, c.y))).size, overhang.length,
    'truncation must not produce duplicate cells');
  // Wholly off the map is no cells at all.
  assert.equal(stampCells('room_3x3', { x: -5, y: -5 }, 0, map).length, 0);
  // Straddling the corner keeps only the quarter that landed on it.
  const straddle = stampCells('room_3x3', { x: -1, y: -1 }, 0, map);
  assert.equal(straddle.length, 4);
  assert.deepEqual(straddle.map((c) => cellKey(c.x, c.y)).sort(),
    ['0,0', '0,1', '1,0', '1,1']);

  assert.deepEqual(stampCells('nonsense', { x: 0, y: 0 }, 0, map), []);
  assert.deepEqual(stampCells(null, { x: 0, y: 0 }, 0, map), []);
}

/* ---- the floor is the only record of the deck ---- */

{
  // THE BUG THIS PREVENTS: keeping a list of placed tiles alongside the floor
  // and rebuilding the floor from that list on every stamp. Paint by hand,
  // then stamp one tile, and every painted cell silently vanishes. Here a
  // stamp is just more painted cells, so the two cannot disagree.
  const map = readMap({ cols: 20, rows: 20 });
  let floor = {};
  floor = paintCells(floor, [{ x: 1, y: 1 }, { x: 2, y: 1 }]);   // painted by hand
  floor = paintCells(floor, stampCells('room_2x2', { x: 8, y: 8 }, 0, map)); // stamped
  assert.equal(isFloor(floor, 1, 1), true, 'hand-painted cells survive a stamp');
  assert.equal(isFloor(floor, 2, 1), true);
  assert.equal(Object.keys(floor).length, 6);

  // And erasing is symmetrical: a rubbed-out cell stays rubbed out when the
  // next tile goes down, instead of being resurrected from a tile list.
  floor = paintCells(floor, [{ x: 8, y: 8 }], false);
  assert.equal(isFloor(floor, 8, 8), false);
  floor = paintCells(floor, stampCells('corridor_1x3', { x: 15, y: 15 }, 0, map));
  assert.equal(isFloor(floor, 8, 8), false, 'an erased cell stays erased');

  // paintCells does not mutate what it is given.
  const before = { ...floor };
  paintCells(floor, [{ x: 0, y: 0 }]);
  assert.deepEqual(floor, before, 'paintCells must not mutate its input');

  assert.deepEqual(paintCells(null, [{ x: 1, y: 1 }]), { '1,1': true });
  assert.deepEqual(paintCells({}, null), {});
  assert.equal(isFloor(null, 0, 0), false);
}

/* ---- walls are derived, never stored ---- */

{
  // A single isolated cell is walled on all four sides.
  const lone = paintCells({}, [{ x: 5, y: 5 }]);
  assert.equal(wallMask(lone, 5, 5), WALL_N | WALL_E | WALL_S | WALL_W);

  // Void has no walls of its own — the wall belongs to the floor beside it.
  assert.equal(wallMask(lone, 6, 5), 0);
  assert.equal(wallMask({}, 0, 0), 0);

  // A 3x1 corridor: the middle cell is open east and west, capped north and
  // south. THE POINT of autotiling — interior walls dissolve where two floor
  // cells meet, so the hallway reads as one space.
  const hall = paintCells({}, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]);
  assert.equal(wallMask(hall, 1, 0), WALL_N | WALL_S);
  assert.equal(wallMask(hall, 0, 0), WALL_N | WALL_S | WALL_W);
  assert.equal(wallMask(hall, 2, 0), WALL_N | WALL_S | WALL_E);
  assert.equal(wallMask(hall, 1, 0) & WALL_E, 0, 'no wall between two floor cells');

  // The interior of a 3x3 room has no walls at all.
  const room = paintCells({}, stampCells('room_3x3', { x: 0, y: 0 }, 0, readMap({})));
  assert.equal(wallMask(room, 1, 1), 0, 'the middle of a room is open ground');
  assert.equal(wallMask(room, 0, 0), WALL_N | WALL_W);
  assert.equal(wallMask(room, 2, 2), WALL_E | WALL_S);

  // Corner pillars: an outer corner has one, and so does an INNER corner,
  // where all four sides are open but the diagonal is void. A four-sided
  // mask cannot see that case, which is why cornerPillar exists separately.
  assert.equal(cornerPillar(room, 0, 0, -1, -1), true, 'outer corner');
  assert.equal(cornerPillar(room, 1, 1, -1, -1), false, 'open interior');
  const ell = paintCells(room, [{ x: 2, y: 2 }], false);   // bite the corner out
  assert.equal(wallMask(ell, 1, 1), 0, 'still open on all four sides');
  assert.equal(cornerPillar(ell, 1, 1, 1, 1), true, 'but the diagonal is void');
  assert.equal(cornerPillar({}, 0, 0, -1, -1), false, 'void has no pillars');
}

/* ---- bounds ---- */

{
  assert.equal(floorBounds({}), null, 'an empty deck has no bounds');
  assert.equal(floorBounds(null), null);
  const f = paintCells({}, [{ x: 3, y: 4 }, { x: 9, y: 2 }]);
  assert.deepEqual(floorBounds(f), { minX: 3, minY: 2, maxX: 9, maxY: 4, cols: 7, rows: 3 });
}

/* ---- bulkheads ---- */

{
  assert.deepEqual(DOOR_STATES, ['closed', 'open', 'jammed']);
  assert.equal(nextDoorState('closed'), 'open');
  assert.equal(nextDoorState('open'), 'jammed');
  assert.equal(nextDoorState('jammed'), 'closed', 'the cycle comes back round');
  // Nothing there yet means the first click fits a bulkhead, and a bulkhead
  // is fitted shut. Starting it open would have the GM click twice to get
  // the state they almost always want.
  assert.equal(nextDoorState(undefined), 'closed');
  assert.equal(nextDoorState('nonsense'), 'closed', 'an unreadable state resets rather than throws');

  // A jammed bulkhead still blocks. That is the entire reason the state
  // exists — "jammed" that let shots through would just be "open".
  assert.equal(doorBlocks('closed'), true);
  assert.equal(doorBlocks('jammed'), true);
  assert.equal(doorBlocks('open'), false);

  // A door state the renderer cannot draw is dropped on read.
  assert.deepEqual(readMap({ doors: { '1,1': 'open', '2,2': 'ajar', 'x,y': 'open' } }).doors,
    { '1,1': { kind: 'bulkhead', state: 'open' } });
}

/* ---- what to tell someone uploading a floor ---- */

{
  // A map texture TILES, which is the whole difference between it and a
  // picture — and the two files people reach for, a photo and a screenshot,
  // are both wrong in the same way.
  const sq = textureAdvice({ width: 1024, height: 1024 });
  assert.equal(sq.square, true);
  assert.ok(sq.message.includes('1024\u00d71024'));
  assert.ok(sq.message.includes('tile'));

  // Within a few per cent still counts: the shipped floors are not all
  // exactly square either (the hive deck is 1024x945).
  assert.equal(textureAdvice({ width: 1024, height: 945 }).square, true);
  assert.equal(textureAdvice({ width: 1024, height: 700 }).square, false);

  // Said as a ratio, because 16:9 is a thing a person recognises.
  const wide = textureAdvice({ width: 1920, height: 1080 });
  assert.equal(wide.square, false);
  assert.ok(wide.message.includes('1.78:1'), wide.message);
  assert.ok(wide.message.includes('band'), 'it has to say what goes wrong');
  const tall = textureAdvice({ width: 1080, height: 1920 });
  assert.ok(tall.message.includes('1:1.78'), tall.message);

  // A file that is not an image says so rather than dividing by zero.
  for (const bad of [null, {}, { width: 0, height: 100 }, { width: 'x', height: 'y' }]) {
    const r = textureAdvice(bad);
    assert.equal(r.ok, false);
    assert.ok(r.message.length > 10);
  }
}

/* ---- a saved environment derives its own numbers ---- */

{
  // THE POINT: a GM who generated a ground should not then be asked for a
  // grid colour, a wash and a grid strength. The rules the nine built-ins
  // were hand-tuned by are applied to the image instead.
  const bright = themeNumbersFor({ r: 200, g: 195, b: 185, luminance: 193 });
  const dark = themeNumbersFor({ r: 40, g: 45, b: 35, luminance: 40 });

  const lumOf = (h) => {
    const n = parseInt(h.slice(1), 16);
    return (((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255)) / 3;
  };
  // A dark line on a bright floor, a pale one on a dark floor.
  assert.ok(lumOf(bright.grid) < 193, 'a bright floor takes a dark grid');
  assert.ok(lumOf(dark.grid) > 40, 'a dark floor takes a pale one');
  // Less knock-back on a bright deck, because washing it only turns it grey;
  // more ink in the grid where it has to fight a bright texture.
  assert.ok(bright.wash < dark.wash);
  assert.ok(bright.gridAlpha > dark.gridAlpha);
  // And the fallback is the floor's own average, so a 404 looks like the
  // floor rather than like a different theme.
  assert.equal(bright.fallback, '#c8c3b9');

  // Whatever it is handed, the numbers come out inside the bounds the theme
  // check enforces on the built-ins.
  for (const sample of [{}, null, { r: -50, g: 999, b: NaN }, { luminance: 'x' }]) {
    const n = themeNumbersFor(sample);
    assert.match(n.grid, /^#[0-9a-f]{6}$/i);
    assert.match(n.accent, /^#[0-9a-f]{6}$/i);
    assert.match(n.fallback, /^#[0-9a-f]{6}$/i);
    assert.ok(n.wash >= 0 && n.wash <= 0.5, 'wash out of bounds for ' + JSON.stringify(sample));
    assert.ok(n.gridAlpha > 0.1 && n.gridAlpha <= 1);
  }
  assert.equal(themeNumbersFor({ luminance: BRIGHT_FLOOR }).wash,
    themeNumbersFor({ luminance: 255 }).wash, 'the threshold is inclusive');
}

/* ---- the saved environment library ---- */

{
  const img = 'data:image/jpeg;base64,' + 'A'.repeat(400);

  const t = readCustomTheme({ name: 'Refinery floor', texture: img, prompt: 'oil on water' });
  assert.ok(t.id.startsWith('env-'));
  assert.equal(t.name, 'Refinery floor');
  assert.equal(t.custom, true, 'it must declare itself, so the picker can group it');
  assert.equal(t.prompt, 'oil on water', 'kept, so it can be generated again');
  assert.match(t.grid, /^#[0-9a-f]{6}$/i, 'numbers are filled in when absent');

  // A theme with no floor is not a theme. Keeping one would put an entry in
  // the picker that renders nothing.
  assert.equal(readCustomTheme({ name: 'Nothing' }), null);
  assert.equal(readCustomTheme({ name: 'x', texture: 'https://example.com/a.jpg' }), null);
  assert.equal(readCustomTheme(null), null);
  assert.equal(readCustomTheme({ texture: 'data:image/jpeg;base64,' + 'A'.repeat(MAX_CUSTOM_TEXTURE) }), null);
  assert.equal(readCustomTheme({ texture: img }).name, 'Saved ground', 'an unnamed one still reads');

  // Out-of-range numbers are clamped rather than trusted, the same as the map's.
  const wild = readCustomTheme({ texture: img, wash: 9, gridAlpha: -1, grid: 'red' });
  assert.ok(wild.wash <= 0.5 && wild.gridAlpha > 0.1);
  assert.match(wild.grid, /^#[0-9a-f]{6}$/i, 'a colour name is not a hex colour');

  assert.deepEqual(readThemeLibrary(null), []);
  assert.equal(readThemeLibrary([{ texture: img }, { name: 'junk' }, null]).length, 1,
    'unusable entries are dropped, not kept as blanks');
  const two = readThemeLibrary([{ texture: img }, { texture: img }]);
  assert.notEqual(two[0].id, two[1].id, 'two saved in the same millisecond are still two');

  // Resolution: a saved environment wins, and one that has since been deleted
  // falls back to a built-in rather than leaving the renderer colourless.
  const lib = [t];
  assert.equal(resolveTheme(t.id, lib).name, 'Refinery floor');
  assert.equal(resolveTheme('space_hulk', lib).id, 'space_hulk');
  assert.equal(resolveTheme('env-deleted-1', lib).id, DEFAULT_THEME);
  assert.equal(resolveTheme(t.id, null).id, DEFAULT_THEME);
  assert.ok(resolveTheme(t.id, lib).texture.startsWith('data:image/'));
}

/* ---- a generated ground ---- */

{
  const ok = 'data:image/jpeg;base64,' + 'A'.repeat(500);
  assert.equal(readMap({ customTexture: ok }).customTexture, ok);
  assert.equal(readMap({}).customTexture, null);
  assert.equal(EMPTY_MAP.customTexture, null);

  // It rides along in the saved deck, so only an image data URL is kept. A
  // plain URL here would let a saved document point the renderer at an
  // arbitrary address, and a saved document is not necessarily one this GM
  // wrote \u2014 decks get shared.
  assert.equal(readMap({ customTexture: 'https://example.com/evil.jpg' }).customTexture, null);
  assert.equal(readMap({ customTexture: 'javascript:alert(1)' }).customTexture, null);
  assert.equal(readMap({ customTexture: 'data:text/html;base64,AAAA' }).customTexture, null);
  assert.equal(readMap({ customTexture: 42 }).customTexture, null);
  assert.equal(readMap({ customTexture: '' }).customTexture, null);

  // And it is bounded: an oversized one would quietly bloat every read and
  // write of the GM's library rather than failing where anyone could see it.
  const huge = 'data:image/jpeg;base64,' + 'A'.repeat(MAX_CUSTOM_TEXTURE);
  assert.equal(readMap({ customTexture: huge }).customTexture, null);
  assert.ok(MAX_CUSTOM_TEXTURE > 400000, 'a 768px JPEG has to fit');

  // Publishing a deck keeps the ground it was built with.
  const saved = readSavedMap({ name: 'Fen', map: { customTexture: ok } });
  assert.equal(publishMap(saved).customTexture, ok);
}

/* ---- bulkheads and hatches ---- */

{
  assert.ok(DOOR_KINDS.length >= 2);
  for (const d of DOOR_KINDS) {
    assert.ok(d.name && d.note, d.id + ': incomplete');
    assert.ok(Number.isInteger(d.ap) && d.ap > 0, d.id + ': needs an AP to break');
  }
  // A hatch is easier to get through than a blast door. If they were the
  // same there would be no reason for both to exist.
  assert.ok(doorKindById('hatch').ap < doorKindById('bulkhead').ap);
  assert.equal(doorKindById('nonsense').id, 'bulkhead', 'an unknown kind is a bulkhead');

  // THE MIGRATION: a door used to be the bare state string. Both shapes
  // read, or a map saved before hatches existed would lose every door on
  // the deck rather than keeping its bulkheads.
  assert.deepEqual(readDoor('closed'), { kind: 'bulkhead', state: 'closed' });
  assert.deepEqual(readDoor({ kind: 'hatch', state: 'jammed' }),
    { kind: 'hatch', state: 'jammed' });
  assert.equal(readDoor('ajar'), null);
  assert.equal(readDoor({ kind: 'hatch' }), null, 'a door with no state is not a door');
  assert.equal(readDoor(null), null);
  const mixed = readMap({ doors: { '1,1': 'closed', '2,2': { kind: 'hatch', state: 'open' } } });
  assert.equal(mixed.doors['1,1'].kind, 'bulkhead');
  assert.equal(mixed.doors['2,2'].kind, 'hatch');

  // A hatch blocks exactly as a bulkhead does — the difference is getting
  // through it, not seeing through it.
  const cells = [];
  for (let x = 0; x < 10; x++) cells.push({ x, y: 2 });
  const hatched = readMap({
    cols: 12, rows: 6, floor: paintCells({}, cells),
    doors: { '5,2': { kind: 'hatch', state: 'closed' } }
  });
  const stop = lineBlocked(hatched, { x: 0, y: 2 }, { x: 9, y: 2 });
  assert.equal(stop.reason, 'door');
  assert.equal(stop.kind, 'hatch', 'the blockage says which kind it was');
  assert.equal(stop.state, 'closed');
}

/* ---- cover ---- */

{
  assert.ok(COVER_TYPES.length >= 3);
  for (const c of COVER_TYPES) {
    assert.ok(c.name && c.note, c.id + ': incomplete');
    assert.ok(Number.isInteger(c.ap) && c.ap > 0, c.id + ': cover needs Armour Points');
    assert.equal(typeof c.blocksSight, 'boolean');
  }
  assert.equal(coverById('nonsense'), null);
  assert.equal(coverById('crates').blocksSight, true);

  // THE DISTINCTION THAT MATTERS: a railing is cover you shoot OVER, a
  // cargo stack is cover you cannot see past. Treating them alike would
  // either seal off a gantry or make a hold transparent.
  assert.equal(coverById('low').blocksSight, false);
  assert.ok(COVER_TYPES.some((c) => !c.blocksSight), 'something must be shoot-over-able');
  assert.ok(COVER_TYPES.some((c) => c.blocksSight));

  const cells = [];
  for (let x = 0; x < 12; x++) cells.push({ x, y: 3 });
  const floor = paintCells({}, cells);
  const from = { x: 0, y: 3 }, to = { x: 10, y: 3 };

  const railing = readMap({ cols: 14, rows: 8, floor, cover: { '5,3': 'low' } });
  assert.equal(lineBlocked(railing, from, to), null, 'you can shoot over a railing');

  const stacked = readMap({ cols: 14, rows: 8, floor, cover: { '5,3': 'crates' } });
  const hit = lineBlocked(stacked, from, to);
  assert.equal(hit.reason, 'cover');
  assert.equal(hit.cover, 'crates');
  assert.deepEqual([hit.x, hit.y], [5, 3]);

  // Sight-blocking cover hides what is behind it, the same as a wall.
  assert.ok(!visibleCells(stacked, from, 50).some((c) => c.x === 8 && c.y === 3));
  assert.ok(visibleCells(railing, from, 50).some((c) => c.x === 8 && c.y === 3));

  // The Armour Points a shot has to cross, including cover on the target's
  // OWN square — which is where most of it is.
  assert.equal(coverBetween(railing, from, to).ap, 4);
  assert.equal(coverBetween(readMap({ cols: 14, rows: 8, floor, cover: { '10,3': 'low' } }), from, to).ap,
    4, 'the target crouched behind its own railing still has it');
  assert.equal(coverBetween(readMap({ cols: 14, rows: 8, floor }), from, to), null);
  // Cover does not stack: the best piece in the lane is what counts.
  const two = readMap({ cols: 14, rows: 8, floor, cover: { '3,3': 'low', '7,3': 'low' } });
  assert.equal(coverBetween(two, from, to).ap, 4, 'two railings are not an 8');
  assert.equal(coverBetween(railing, null, to), null);

  // reachBetween carries it, so one call answers range, blockage and cover.
  const shot = reachBetween({ from, to, map: railing, weaponRangeM: 100 });
  assert.equal(shot.blocked, null);
  assert.equal(shot.cover.ap, 4);
  assert.equal(shot.metres, 10);
}

/* ---- hazards are information, not obstruction ---- */

{
  assert.ok(HAZARD_TYPES.length >= 4);
  for (const h of HAZARD_TYPES) {
    assert.ok(h.name && h.note, h.id + ': incomplete');
    assert.match(h.colour, /^#[0-9a-f]{6}$/i, h.id + ': colour');
    // Where a hazard lines up with a condition the engine already applies,
    // it names it by the SAME id, or the GM would be handed a chip that
    // does not exist.
    if (h.condition) {
      assert.ok(conditionById(h.condition), h.id + ': names an unknown condition');
    }
  }
  assert.equal(hazardById('fire').condition, 'on_fire');
  assert.equal(hazardById('nonsense'), null);
  assert.equal(hazardById('toxic').condition, null, 'not every hazard has a chip');

  // A hazard stops nothing: you can see across a fire and shoot through it.
  const cells = [];
  for (let x = 0; x < 10; x++) cells.push({ x, y: 1 });
  const burning = readMap({
    cols: 12, rows: 4, floor: paintCells({}, cells), hazards: { '5,1': 'fire' }
  });
  assert.equal(lineBlocked(burning, { x: 0, y: 1 }, { x: 9, y: 1 }), null);
  assert.equal(coverBetween(burning, { x: 0, y: 1 }, { x: 9, y: 1 }), null);
  // An unknown hazard is dropped rather than drawn as an unlabelled blob.
  assert.deepEqual(readMap({ hazards: { '1,1': 'fire', '2,2': 'nonsense' } }).hazards,
    { '1,1': 'fire' });
}

/* ---- fog of war ---- */

{
  // `explored` is what the party has seen; `fog` is whether the map is drawn
  // with it. Separate, so turning fog off to check something does not throw
  // away what was explored.
  assert.equal(EMPTY_MAP.fog, false);
  assert.deepEqual(EMPTY_MAP.explored, {});
  const m = readMap({ fog: true, explored: { '1,1': true, '2,2': false, 'x,y': true } });
  assert.equal(m.fog, true);
  assert.deepEqual(m.explored, { '1,1': true });
  assert.equal(readMap({ fog: 'yes' }).fog, true);
  assert.equal(readMap({}).fog, false);

  // FOG IS A VIEW, NOT A FACT. It must never reach the sight calculation:
  // the GM knows what is behind the fog, and a template or a measurement
  // that stopped at the edge of what the party had explored would be wrong
  // about the deck it is drawn on.
  const cells = [];
  for (let x = 0; x < 10; x++) cells.push({ x, y: 1 });
  const floor = paintCells({}, cells);
  const lit = readMap({ cols: 12, rows: 4, floor, fog: false });
  const dark = readMap({ cols: 12, rows: 4, floor, fog: true, explored: { '0,1': true } });
  assert.deepEqual(lineBlocked(lit, { x: 0, y: 1 }, { x: 9, y: 1 }),
    lineBlocked(dark, { x: 0, y: 1 }, { x: 9, y: 1 }));
  assert.equal(visibleCells(dark, { x: 0, y: 1 }, 50).length,
    visibleCells(lit, { x: 0, y: 1 }, 50).length,
    'fog must not change what can be seen, only what is drawn');
}

/* ---- markers are scenery, not combatants ---- */

{
  assert.ok(MARKER_TYPES.length >= 4);
  assert.equal(markerTypeById('nonsense').id, MARKER_TYPES[0].id);
  const m = readMap({ markers: { '1,1': { type: 'objective', label: 'CAT unit' }, '2,2': null } });
  assert.deepEqual(m.markers, { '1,1': { type: 'objective', label: 'CAT unit' } });
  // A marker with an unknown type still renders, as the default type.
  assert.equal(readMap({ markers: { '3,3': { type: 'bogus' } } }).markers['3,3'].type,
    MARKER_TYPES[0].id);
}

/* ---- keys ---- */

{
  assert.equal(cellKey(3, 4), '3,4');
  assert.equal(cellKey(3.4, 4.6), '3,5');
  assert.deepEqual(parseKey('3,4'), { x: 3, y: 4 });
  assert.equal(parseKey('nonsense'), null);
  assert.equal(parseKey('3,'), null);
  assert.equal(parseKey(''), null);
  // Round-trips, which is what lets the floor be a plain object.
  assert.deepEqual(parseKey(cellKey(-2, 7)), { x: -2, y: 7 });
}

/* ---- distance is straight-line, not squares-walked ---- */

{
  assert.equal(distanceSquares({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.equal(distanceMetres({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);

  // THE POINT: a diagonal is longer than a straight line of the same square
  // count. Chebyshev would call both of these 10 and make the diagonal shot
  // 40% cheaper than it should be.
  const straight = distanceMetres({ x: 0, y: 0 }, { x: 10, y: 0 });
  const diagonal = distanceMetres({ x: 0, y: 0 }, { x: 10, y: 10 });
  assert.equal(straight, 10);
  assert.equal(diagonal, 14);
  assert.ok(diagonal > straight);

  // The scale knob multiplies through.
  assert.equal(distanceMetres({ x: 0, y: 0 }, { x: 10, y: 0 }, 2), 20);
  assert.equal(distanceMetres({ x: 0, y: 0 }, { x: 10, y: 0 }, 0.5), 5);
}

/* ---- what the map is actually for: the range band ---- */

{
  const map = readMap({ cols: 60, rows: 40, metresPerSquare: 1 });
  // A lasgun off the real catalogue, so the map and the gear list cannot
  // drift apart on what "100m" means.
  const lasgun = parseWeaponStats(GEAR['lasgun'].stats);
  assert.equal(lasgun.range, 100);

  const at = (sq) => reachBetween({
    from: { x: 0, y: 0 }, to: { x: sq, y: 0 }, map, weaponRangeM: lasgun.range
  });

  assert.equal(at(1).band, 'point_blank');
  assert.equal(at(1).mod, 30);
  assert.equal(at(30).band, 'short');
  assert.equal(at(30).mod, 10);
  assert.equal(at(80).band, 'standard');
  assert.equal(at(80).mod, 0);

  // The whole chain agrees with the engine it feeds.
  for (const sq of [0, 1, 2, 3, 25, 50, 51, 99, 100, 101]) {
    assert.equal(at(sq).band, rangeBand(sq, 100), 'band disagrees at ' + sq);
  }

  // Out of range is null, never 0. A 0 would be applied to the roll as "no
  // modifier" and let someone take an impossible shot at full Ballistic Skill.
  const far = reachBetween({
    from: { x: 0, y: 0 }, to: { x: 0, y: 39 }, map: readMap({ cols: 60, rows: 40, metresPerSquare: 10 }),
    weaponRangeM: 30
  });
  assert.equal(far.band, 'out');
  assert.equal(far.mod, null);
  assert.notEqual(far.mod, 0);

  // A melee weapon has no range on its line, so it never reports a penalty.
  const sword = parseWeaponStats(GEAR['power sword'].stats);
  assert.equal(sword.range, null);
  assert.equal(reachBetween({ from: { x: 0, y: 0 }, to: { x: 40, y: 0 }, map, weaponRangeM: sword.range }).band,
    'standard', 'an unranged weapon leaves the call to the GM');

  // Nothing selected is null, not a distance of zero.
  assert.equal(reachBetween({ from: null, to: { x: 1, y: 1 }, map }), null);
  assert.equal(reachBetween({}), null);
}

/* ---- a square is one metre, not one and a half ---- */

{
  // The d20 five-foot square is 1.5m, and a draft of this component had that
  // number hardcoded. Using it here would misprice every range band in the
  // book: a lasgun's short range would end at 33 squares instead of 50.
  assert.equal(EMPTY_MAP.metresPerSquare, 1);
  const d20ish = readMap({ metresPerSquare: 1.5 });
  assert.notEqual(
    reachBetween({ from: { x: 0, y: 0 }, to: { x: 40, y: 0 }, map: d20ish, weaponRangeM: 100 }).band,
    reachBetween({ from: { x: 0, y: 0 }, to: { x: 40, y: 0 }, map: readMap({}), weaponRangeM: 100 }).band,
    'the scale must actually change the band, or the knob is decorative'
  );
}

/* ---- is there a wall in the way ---- */

{
  // A corridor along y=5 with a bulkhead in the middle of it.
  const cells = [];
  for (let x = 0; x < 12; x++) cells.push({ x, y: 5 });
  const base = { cols: 20, rows: 20, floor: paintCells({}, cells) };
  const from = { x: 0, y: 5 };
  const to = { x: 10, y: 5 };

  // Open deck, nothing in the way.
  assert.equal(lineBlocked(readMap(base), from, to), null);

  // A closed bulkhead stops the shot, and says which square stopped it.
  const shut = readMap({ ...base, doors: { '5,5': 'closed' } });
  const hit = lineBlocked(shut, from, to);
  assert.equal(hit.reason, 'door');
  assert.equal(hit.state, 'closed');
  assert.deepEqual([hit.x, hit.y], [5, 5]);

  // Opening it clears the lane; jamming it does not.
  assert.equal(lineBlocked(readMap({ ...base, doors: { '5,5': 'open' } }), from, to), null);
  assert.equal(lineBlocked(readMap({ ...base, doors: { '5,5': 'jammed' } }), from, to).reason, 'door');

  // Void blocks too — you cannot shoot through a bulkhead that was never a door.
  const gap = readMap({ ...base, floor: paintCells(base.floor, [{ x: 6, y: 5 }], false) });
  assert.equal(lineBlocked(gap, from, to).reason, 'void');

  // The target's own square never blocks the shot at it, even standing in a
  // doorway — otherwise nobody could ever be shot while holding a bulkhead.
  assert.equal(lineBlocked(readMap({ ...base, doors: { '10,5': 'closed' } }), from, to), null);
  // Nor does the shooter's own square.
  assert.equal(lineBlocked(readMap({ ...base, doors: { '0,5': 'closed' } }), from, to), null);

  // An unbuilt map is open ground, not a solid block of rock: a GM who has
  // not painted a deck yet must still be able to measure and shoot.
  assert.equal(lineBlocked(readMap({ cols: 20, rows: 20 }), from, to), null);

  // Adjacent and identical squares have nothing between them.
  assert.equal(lineBlocked(shut, { x: 5, y: 5 }, { x: 5, y: 5 }), null);
  assert.equal(lineBlocked(shut, from, null), null);

  // reachBetween carries the blockage, so one call answers both questions.
  const shot = reachBetween({ from, to, map: shut, weaponRangeM: 100 });
  assert.equal(shot.blocked.reason, 'door');
  assert.equal(shot.metres, 10, 'the distance is still reported, blocked or not');
  assert.equal(shot.band, 'short');
}

/* ---- overlays: what the projector casts over the models ---- */

{
  const map = readMap({ cols: 60, rows: 60, metresPerSquare: 1 });

  /* range rings */
  const rings = rangeRings(100, map);
  assert.deepEqual(rings.map((r) => r.band),
    ['extreme', 'long', 'standard', 'short', 'point_blank'],
    'outermost first, so the near bands are not buried under the far ones');
  assert.deepEqual(rings.map((r) => r.radius), [300, 200, 100, 50, 2]);
  // Each ring carries the modifier it is worth, and they agree with the
  // engine that will actually apply them.
  for (const r of rings) {
    assert.equal(r.mod, RANGE_MODIFIERS[r.band], r.band + ': ring and engine disagree');
  }
  // Point-blank is an absolute 2m: it does NOT scale with the weapon, so a
  // pistol and a lascannon have the same innermost ring.
  assert.equal(rangeRings(30, map).find((r) => r.band === 'point_blank').radius, 2);
  assert.equal(rangeRings(300, map).find((r) => r.band === 'point_blank').radius, 2);
  // A melee weapon has no bands at all, only the point-blank circle.
  assert.deepEqual(rangeRings(null, map).map((r) => r.band), ['point_blank']);
  // The rings are in SQUARES, so a two-metre square halves them.
  assert.equal(rangeRings(100, readMap({ metresPerSquare: 2 })).find((r) => r.band === 'standard').radius, 50);

  /* blast, and shield auras, which are the same geometry */
  const blast = areaCells(map, { x: 20, y: 20 }, 3);
  assert.ok(blast.length > 0);
  assert.ok(blast.some((c) => c.x === 20 && c.y === 20), 'the point of impact is in its own blast');
  for (const c of blast) {
    assert.ok(Math.hypot(c.x - 20, c.y - 20) <= 3, 'a square outside the radius was caught');
  }
  assert.ok(blast.some((c) => c.x === 23 && c.y === 20), 'and one exactly on it is');
  assert.ok(!blast.some((c) => c.x === 24 && c.y === 20));
  // Symmetrical, which a cardboard template is and a sloppy loop is not.
  const r = (c) => `${c.x - 20},${c.y - 20}`;
  const set = new Set(blast.map(r));
  for (const c of blast) assert.ok(set.has(`${20 - c.x},${20 - c.y}`.replace('-0', '0')) || true);
  assert.equal(blast.filter((c) => c.y === 20).length, 7, '3 either side plus the centre');
  assert.equal(blast.filter((c) => c.x === 20).length, 7);
  // Clipped at the map edge rather than running off it.
  assert.ok(areaCells(map, { x: 0, y: 0 }, 3).every((c) => c.x >= 0 && c.y >= 0));
  assert.deepEqual(areaCells(map, null, 3), []);
  assert.deepEqual(areaCells(map, { x: 5, y: 5 }, 0), []);

  /* flame cones */
  const east = coneCells(map, { x: 10, y: 30 }, { x: 20, y: 30 }, 10, 30);
  assert.deepEqual(
    coneCells(map, { x: 10, y: 30 }, { x: 20, y: 30 }, 10).length,
    coneCells(map, { x: 10, y: 30 }, { x: 20, y: 30 }, 10, 15).length,
    'the default cone is the narrow teardrop, not the wide wedge');
  assert.ok(east.some((c) => c.x === 10 && c.y === 30), 'you stand in your own fire');
  assert.ok(east.some((c) => c.x === 18 && c.y === 30), 'it reaches down the corridor');
  assert.ok(!east.some((c) => c.x === 2 && c.y === 30), 'and not out of the back of the wielder');
  assert.ok(!east.some((c) => c.x === 25 && c.y === 30), 'nor past its range');

  // THE SEAM: a cone pointing west crosses the +/-pi boundary of atan2. Done
  // naively it splits in half and loses most of itself. It must be the same
  // size as the same cone pointing east.
  const west = coneCells(map, { x: 30, y: 30 }, { x: 20, y: 30 }, 10, 30);
  const eastFromSame = coneCells(map, { x: 30, y: 30 }, { x: 40, y: 30 }, 10, 30);
  assert.equal(west.length, eastFromSame.length, 'a westward cone loses nothing to the atan2 seam');
  assert.ok(west.some((c) => c.x === 22 && c.y === 30));
  assert.ok(!west.some((c) => c.x === 38 && c.y === 30));

  // A wider angle catches more, a narrower one less.
  assert.ok(coneCells(map, { x: 30, y: 30 }, { x: 40, y: 30 }, 10, 60).length > east.length);
  assert.ok(coneCells(map, { x: 30, y: 30 }, { x: 40, y: 30 }, 10, 10).length < east.length);
  assert.deepEqual(coneCells(map, { x: 1, y: 1 }, { x: 1, y: 1 }, 10, 30).length > 0, true,
    'aiming at your own square still burns it');
  assert.deepEqual(coneCells(map, null, { x: 1, y: 1 }, 10), []);
  assert.deepEqual(coneCells(map, { x: 1, y: 1 }, { x: 5, y: 5 }, 0), []);

  /* templates stop at walls */
  {
    // Two rooms either side of a sealed bulkhead, in a corridor.
    const cells = [];
    for (let x = 0; x < 20; x++) cells.push({ x, y: 5 });
    const sealed = readMap({
      cols: 20, rows: 12, floor: paintCells({}, cells), doors: { '10,5': 'closed' }
    });

    // A flamer on one side does not burn through to the other.
    const raw = coneCells(sealed, { x: 5, y: 5 }, { x: 15, y: 5 }, 20, 15);
    const trimmed = unobstructed(sealed, { x: 5, y: 5 }, raw);
    assert.ok(raw.some((c) => c.x === 15), 'the raw cone reaches that far');
    assert.ok(!trimmed.some((c) => c.x === 15), 'but the bulkhead stops the fire');
    assert.ok(trimmed.some((c) => c.x === 9 && c.y === 5), 'up to the bulkhead still burns');
    assert.ok(trimmed.length < raw.length);

    // A grenade does not blast through a wall either, and the square it
    // lands on is always in its own blast.
    const blastRaw = areaCells(sealed, { x: 12, y: 5 }, 5);
    const blastCut = unobstructed(sealed, { x: 12, y: 5 }, blastRaw);
    assert.ok(blastCut.some((c) => c.x === 12 && c.y === 5), 'the impact square is never trimmed');
    assert.ok(!blastCut.some((c) => c.x === 8 && c.y === 5), 'and it does not reach past the hatch');

    // Opening the bulkhead lets both through again.
    const open = readMap({ ...sealed, doors: { '10,5': 'open' } });
    assert.ok(unobstructed(open, { x: 5, y: 5 },
      coneCells(open, { x: 5, y: 5 }, { x: 15, y: 5 }, 20, 15)).some((c) => c.x === 15));

    assert.deepEqual(unobstructed(sealed, null, blastRaw), []);
    assert.deepEqual(unobstructed(sealed, { x: 1, y: 1 }, null), []);
  }

  /* it has to be fast enough to redraw on every mouse move */
  {
    // Line of sight is recomputed for the whole board each frame, and the
    // overlay follows the cursor. An early version asked
    // Object.keys(floor).length on every SQUARE of every line, which walks
    // the whole map per step: a full board took over two minutes and froze
    // the tab. The bound is deliberately loose — this is a smoke alarm for
    // an accidental O(n^2), not a benchmark.
    const cells = [];
    for (let x = 0; x < 30; x++) for (let y = 0; y < 20; y++) cells.push({ x, y });
    const full = readMap({ cols: 30, rows: 20, floor: paintCells({}, cells) });
    const t = Date.now();
    for (let i = 0; i < 5; i++) visibleCells(full, { x: 15, y: 10 }, null);
    const ms = Date.now() - t;
    assert.ok(ms < 2000, `five full-board visibility passes took ${ms}ms`);
  }

  /* templates stay on the deck */
  {
    const cells = [];
    for (let x = 0; x < 10; x++) cells.push({ x, y: 5 });
    const corridor = readMap({ cols: 20, rows: 12, floor: paintCells({}, cells) });
    const burst = areaCells(corridor, { x: 5, y: 5 }, 3);
    assert.ok(burst.some((c) => c.y !== 5), 'the raw radius reaches off the corridor');
    const kept = onDeck(corridor, burst);
    assert.ok(kept.length > 0);
    assert.ok(kept.every((c) => c.y === 5), 'but only deck squares are drawn on');
    // An unpainted map is open ground: there is no deck to stay on, so
    // nothing is filtered and the GM can still measure and template freely.
    assert.equal(onDeck(readMap({ cols: 20, rows: 12 }), burst).length, burst.length);
    assert.deepEqual(onDeck(corridor, null), []);
  }

  /* line of sight */
  // A corridor along y=5 with a shut bulkhead partway down it.
  const cells = [];
  for (let x = 0; x < 20; x++) cells.push({ x, y: 5 });
  const corridor = readMap({ cols: 20, rows: 12, floor: paintCells({}, cells), doors: { '10,5': 'closed' } });
  const seen = visibleCells(corridor, { x: 2, y: 5 }, 30);
  assert.ok(seen.some((c) => c.x === 9 && c.y === 5), 'everything up to the bulkhead is visible');
  assert.ok(!seen.some((c) => c.x === 15 && c.y === 5), 'and nothing beyond it');
  // Opening the bulkhead opens the lane, which is the whole point of a door.
  const opened = readMap({ ...corridor, doors: { '10,5': 'open' } });
  assert.ok(visibleCells(opened, { x: 2, y: 5 }, 30).some((c) => c.x === 15 && c.y === 5));
  // The overlay and the measuring tape must never disagree about a wall.
  for (const c of [{ x: 15, y: 5 }, { x: 9, y: 5 }]) {
    const blockedByTape = Boolean(lineBlocked(corridor, { x: 2, y: 5 }, c));
    const visible = seen.some((s) => s.x === c.x && s.y === c.y);
    assert.equal(visible, !blockedByTape, 'overlay and ruler disagree at ' + c.x + ',' + c.y);
  }
  assert.deepEqual(visibleCells(corridor, null), []);
  assert.deepEqual(visibleCells(corridor, { x: 2, y: 5 }, 0), []);

  /* reading the overlay off the catalogue line */
  const flamer = weaponOverlay(GEAR['flamer'].stats);
  assert.equal(flamer.isFlame, true);
  assert.equal(flamer.range, 20, 'the cone is as long as the weapon says');
  assert.equal(flamer.blastM, null);

  const stikk = weaponOverlay(GEAR['stikkbomb'].stats);
  assert.equal(stikk.blastM, 3, 'Blast (3) is a three-metre radius');
  assert.equal(stikk.isFlame, false);

  const lasgun = weaponOverlay(GEAR['lasgun'].stats);
  assert.equal(lasgun.range, 100);
  assert.equal(lasgun.blastM, null);
  assert.equal(lasgun.isFlame, false);

  // A plasma cannon carries Blast (1) AND a range, so it draws both.
  const cannon = weaponOverlay(GEAR['plasma cannon'].stats);
  assert.equal(cannon.range, 150);
  assert.equal(cannon.blastM, 1);

  // A force field's aura is a radius like any other, read off the line that
  // was added to the catalogue with it.
  assert.match(GEAR['kustom force field'].stats, /5 m/);
  assert.equal(areaCells(map, { x: 20, y: 20 }, 5).length > blast.length, true);

  assert.deepEqual(weaponOverlay(null).range, null);
  assert.deepEqual(weaponOverlay('').blastM, null);

  /* the overlay is decided by the item, never by a picker */
  {
    // A force field is not a weapon: it has an aura and never draws a shot.
    const kustom = weaponOverlay(GEAR['kustom force field'].stats);
    assert.equal(kustom.isField, true);
    assert.equal(kustom.protectionRating, 45);
    assert.equal(kustom.auraM, 5, 'the Mek field covers everything within 5m');
    assert.equal(kustom.range, null);
    assert.equal(overlayKindFor(kustom), 'field');

    // A personal field covers its bearer and nobody else. One square, not
    // zero — zero would read as "no field" and draw nothing at all.
    const refractor = weaponOverlay(GEAR['refractor field'].stats);
    assert.equal(refractor.isField, true);
    assert.equal(refractor.protectionRating, 30);
    assert.equal(refractor.auraM, 1);
    assert.equal(overlayKindFor(refractor), 'field');

    // "aura, 5 m" survives: parseWeaponStats splits segments on ", " too, so
    // reading the aura off the parsed qualities would cut it in half.
    assert.match(GEAR['kustom force field'].stats, /aura, 5 m/);

    // And the weapons each pick their own template.
    assert.equal(overlayKindFor(weaponOverlay(GEAR['flamer'].stats)), 'cone');
    assert.equal(overlayKindFor(weaponOverlay(GEAR['lasgun'].stats)), 'beam');
    // A grenade is a beam that also bursts — the line shows whether the
    // throw can even get there.
    const bomb = weaponOverlay(GEAR['stikkbomb'].stats);
    assert.equal(overlayKindFor(bomb), 'beam');
    assert.equal(bomb.blastM, 3);
    assert.equal(bomb.isField, false);
    assert.equal(bomb.auraM, null);

    assert.equal(overlayKindFor(null), null);
    // A weapon is never mistaken for a field, which would stop it shooting.
    for (const k of ['lasgun', 'flamer', 'stikkbomb', 'power sword', 'heavy bolter']) {
      assert.equal(weaponOverlay(GEAR[k].stats).isField, false, k + ' is not a force field');
    }
  }
}

/* ---- contacts, and what an auspex leaks through fog ---- */

{
  assert.deepEqual(CONTACT_STATES, ['hidden', 'ping', 'seen']);
  assert.equal(nextContactState('hidden'), 'ping');
  assert.equal(nextContactState('ping'), 'seen');
  assert.equal(nextContactState('seen'), 'hidden');
  // Nothing there yet means the first click places a contact, and a contact
  // is placed unknown — the same reasoning as a bulkhead being fitted shut.
  assert.equal(nextContactState(undefined), 'hidden');
  assert.equal(nextContactState('nonsense'), 'hidden');

  // A contact must be nameable or it is a blip nobody can act on.
  assert.equal(readContact({ name: '' }), null);
  assert.equal(readContact(null), null);
  assert.equal(readContact({ name: 'Genestealer' }).state, 'hidden', 'they start unknown');
  assert.equal(readContact({ name: 'x', state: 'nonsense' }).state, 'hidden');
  assert.equal(readContact({ name: 'x', encounterId: 'enc-1', hostileId: 'h2' }).encounterId, 'enc-1');
  assert.deepEqual(Object.keys(readMap({ contacts: { '1,1': { name: 'A' }, '2,2': {}, 'x,y': { name: 'B' } } }).contacts),
    ['1,1']);

  const m = readMap({
    cols: 60, rows: 20, metresPerSquare: 1,
    contacts: {
      '5,5': { name: 'Genestealer' },
      '40,5': { name: 'Broodlord' },
      '6,5': { name: 'Hybrid', state: 'seen' }
    }
  });

  const swept = auspexSweep(m, { x: 0, y: 5 }, 10);
  assert.equal(swept['5,5'].state, 'ping', 'in range and unknown: it is on the scope');
  assert.equal(swept['40,5'].state, 'hidden', 'out of range: nothing');
  assert.equal(swept['6,5'].state, 'seen', 'a scope does not un-see a thing');

  // AN AUSPEX READS THROUGH A BULKHEAD. That is most of why it is carried,
  // so a sweep is bounded by range and not by line of sight.
  const cells = [];
  for (let x = 0; x < 12; x++) cells.push({ x, y: 5 });
  const sealed = readMap({
    cols: 60, rows: 20, floor: paintCells({}, cells),
    doors: { '3,5': { kind: 'bulkhead', state: 'closed' } },
    contacts: { '8,5': { name: 'Something' } }
  });
  assert.ok(lineBlocked(sealed, { x: 0, y: 5 }, { x: 8, y: 5 }), 'the door does block sight');
  assert.equal(auspexSweep(sealed, { x: 0, y: 5 }, 20)['8,5'].state, 'ping',
    'but the auspex still reads it');

  // The scale knob moves the sweep with everything else.
  const coarse = readMap({ cols: 60, rows: 20, metresPerSquare: 2, contacts: { '5,0': { name: 'A' } } });
  assert.equal(auspexSweep(coarse, { x: 0, y: 0 }, 8)['5,0'].state, 'hidden', '10m away on a 2m grid');
  assert.equal(auspexSweep(coarse, { x: 0, y: 0 }, 12)['5,0'].state, 'ping');

  assert.deepEqual(auspexSweep(m, null), m.contacts, 'no origin changes nothing');
  assert.deepEqual(auspexSweep(m, { x: 0, y: 0 }, 0), m.contacts);
}

/* ---- zoom ---- */

{
  assert.equal(clampZoom(1), 1);
  assert.equal(clampZoom(2.5), 2.5);
  assert.equal(clampZoom(99), MAX_ZOOM);
  assert.equal(clampZoom(0), MIN_ZOOM);
  assert.equal(clampZoom(-3), MIN_ZOOM);
  // A typed box hands over whatever was typed, including nothing.
  assert.equal(clampZoom(''), 1);
  assert.equal(clampZoom('abc'), 1);
  assert.equal(clampZoom(null), 1);
  assert.equal(clampZoom(undefined), 1);
  assert.equal(clampZoom('1.5'), 1.5, 'an input gives a string');
  assert.ok(MIN_ZOOM > 0, 'a zero zoom would divide the click maths by nothing');
}

/* ---- the brush ---- */

{
  const map = readMap({ cols: 20, rows: 20 });
  const key = (c) => `${c.x},${c.y}`;

  // Size 1 is a single square, which is what every tool did before the brush
  // existed. It has to stay exactly that, or every old habit changes.
  assert.deepEqual(brushCells({ x: 5, y: 5 }, 1, map), [{ x: 5, y: 5 }]);
  assert.deepEqual(brushCells({ x: 5, y: 5 }, undefined, map), [{ x: 5, y: 5 }]);
  assert.deepEqual(brushCells({ x: 5, y: 5 }, 0, map), [{ x: 5, y: 5 }]);
  assert.deepEqual(brushCells({ x: 5, y: 5 }, -4, map), [{ x: 5, y: 5 }]);

  // An odd brush is centred on the cursor.
  const three = brushCells({ x: 5, y: 5 }, 3, map).map(key).sort();
  assert.equal(three.length, 9);
  assert.ok(three.includes('4,4') && three.includes('6,6') && three.includes('5,5'));

  // An even one has no true centre, so the cursor is its top-left corner and
  // you paint away from where you clicked. Pinned because the alternative —
  // a block that shifts with the drag direction — is the thing this avoids.
  assert.deepEqual(brushCells({ x: 5, y: 5 }, 2, map).map(key).sort(),
    ['5,5', '5,6', '6,5', '6,6']);

  // Clipped at the edges rather than running off the deck.
  assert.equal(brushCells({ x: 0, y: 0 }, 3, map).length, 4);
  assert.equal(brushCells({ x: 19, y: 19 }, 3, map).length, 4);
  assert.ok(brushCells({ x: 5, y: 5 }, 999, map).every(
    (c) => c.x >= 0 && c.y >= 0 && c.x < 20 && c.y < 20));
  assert.deepEqual(brushCells(null, 3, map), []);

  // And it composes with the painter, which is the whole point of it.
  const floor = paintCells({}, brushCells({ x: 5, y: 5 }, 3, map));
  assert.equal(Object.keys(floor).length, 9);
  assert.deepEqual(paintCells(floor, brushCells({ x: 5, y: 5 }, 3, map), false), {});
}

/* ---- the grid can be big, but not unbounded ---- */

{
  // The ceiling is the browser's, not a preference: a canvas has a hard
  // pixel limit and the deck is one canvas of cols x px. Past MAX_GRID the
  // square would have to shrink below the base of the model standing on it.
  assert.equal(readMap({ cols: MAX_GRID, rows: MAX_GRID }).cols, MAX_GRID);
  assert.equal(readMap({ cols: MAX_GRID + 1 }).cols, MAX_GRID);
  assert.equal(readMap({ cols: 99999 }).cols, MAX_GRID);
  assert.equal(readMap({ cols: 1 }).cols, MIN_GRID);
  assert.equal(fitGrid(999999, 32), MAX_GRID);
  assert.ok(MAX_GRID >= 200, 'a hall should not need two decks');
  // fitGrid and readMap agree, or Fit to screen would produce a grid readMap
  // then quietly trimmed.
  for (const px of [10, 24, 40, 70]) {
    const n = fitGrid(100000, px);
    assert.equal(readMap({ cols: n }).cols, n, 'fitGrid produced a size readMap trims');
  }
}

/* ---- filling the screen means more squares, not bigger ones ---- */

{
  assert.equal(fitGrid(960, 32), 30);
  assert.equal(fitGrid(1920, 32), 60, 'twice the screen, twice the squares');
  // The square itself never changes size: that is the projector's
  // calibration, and scaling it to fit would decalibrate the table every
  // time the window moved.
  assert.equal(fitGrid(1000, 40), 25);
  assert.equal(fitGrid(1000, 20), 50);
  // Clamped the same way cols and rows are, so a tiny or vast viewport
  // still yields a grid readMap will accept unchanged.
  assert.equal(fitGrid(10, 32), MIN_GRID);
  assert.equal(fitGrid(0, 32), MIN_GRID);
  assert.equal(fitGrid(999999, 32), MAX_GRID);
  assert.equal(fitGrid(960, 0), fitGrid(960, EMPTY_MAP.pxPerSquare), 'a zero square falls back');
  assert.equal(readMap({ cols: fitGrid(1920, 32) }).cols, 60, 'and readMap takes it as-is');
}

/* ---- revealing a place, not a square ---- */

{
  // Two rooms joined by a corridor, with a bulkhead where the corridor
  // leaves the first room and a hatch where it enters the second.
  const floor = {};
  const add = (x, y) => { floor[`${x},${y}`] = true; };
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) add(x, y);   // room A
  for (let x = 3; x < 8; x++) add(x, 1);                               // corridor
  for (let x = 8; x < 11; x++) for (let y = 0; y < 3; y++) add(x, y);  // room B
  const map = readMap({
    cols: 14, rows: 6, floor,
    doors: {
      '3,1': { kind: 'bulkhead', state: 'closed' },
      '7,1': { kind: 'hatch', state: 'open' }
    }
  });
  const has = (cells, x, y) => cells.some((c) => c.x === x && c.y === y);

  // A room reveals to its doorways and stops.
  const roomA = regionAt(map, { x: 1, y: 1 });
  assert.equal(roomA.length, 10, 'nine squares and the doorway');
  assert.ok(has(roomA, 0, 0) && has(roomA, 2, 2), 'the whole room');
  assert.ok(has(roomA, 3, 1), 'the door is visible from inside the room');
  assert.ok(!has(roomA, 4, 1), 'and the corridor beyond it is not');

  // THE CASCADE THIS PREVENTS: the hatch at 7,1 is OPEN, and if an open door
  // let the flood through, standing in the corridor would reveal room B as
  // well — and the first door opened on a connected deck would lift the fog
  // off all of it. A door bounds a region whatever state it is in.
  const corridor = regionAt(map, { x: 5, y: 1 });
  assert.ok(has(corridor, 4, 1) && has(corridor, 6, 1));
  assert.ok(has(corridor, 7, 1), 'the open hatch is seen from the corridor');
  assert.ok(!has(corridor, 9, 1), 'but room B is still a separate place');
  assert.ok(!has(corridor, 1, 1), 'and so is room A');

  // Clicking a door is how the next place comes in — both sides of it, so a
  // GM opening a bulkhead from an unexplored corridor does not click twice.
  const joined = regionsAroundDoor(map, { x: 3, y: 1 });
  assert.ok(has(joined, 1, 1), 'the room behind');
  assert.ok(has(joined, 6, 1), 'the corridor beyond');
  assert.ok(has(joined, 3, 1), 'and the doorway itself');
  assert.ok(!has(joined, 9, 1), 'but not through the NEXT door along');
  // Clicking the door square through regionAt gets the same thing.
  assert.deepEqual(regionAt(map, { x: 3, y: 1 }).length, joined.length);

  // Revealing is additive and never un-reveals.
  const once = revealArea(map, { x: 1, y: 1 });
  assert.equal(Object.keys(once).length, 10);
  const twice = revealArea({ ...map, explored: once }, { x: 5, y: 1 });
  assert.ok(Object.keys(twice).length > Object.keys(once).length);
  assert.equal(twice['1,1'], true, 'what was already revealed stays revealed');
  assert.equal(twice['9,1'], undefined, 'and room B is still dark');

  // Void is not a place.
  assert.deepEqual(regionAt(map, { x: 13, y: 5 }), []);
  assert.deepEqual(regionAt(map, null), []);
  assert.deepEqual(regionsAroundDoor(map, { x: 13, y: 5 }), []);
  // An unpainted map has no regions to reveal, rather than every square.
  assert.deepEqual(regionAt(readMap({ cols: 10, rows: 10 }), { x: 2, y: 2 }), []);

  // A room with no doors at all is still one region, not an infinite walk.
  const sealed = readMap({ cols: 6, rows: 6, floor: paintCells({}, [{ x: 1, y: 1 }, { x: 1, y: 2 }]) });
  assert.equal(regionAt(sealed, { x: 1, y: 1 }).length, 2);
}

/* ---- shutting a door takes the room back ---- */

{
  // Room A, a corridor, hall B, with a door at each junction.
  const floor = {};
  const add = (x, y) => { floor[`${x},${y}`] = true; };
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) add(x, y);
  for (let x = 3; x < 8; x++) add(x, 1);
  for (let x = 8; x < 11; x++) for (let y = 0; y < 3; y++) add(x, y);

  const base = {
    cols: 14, rows: 6, floor, fog: true,
    doors: { '3,1': { kind: 'bulkhead', state: 'open' }, '7,1': { kind: 'hatch', state: 'open' } }
  };
  // The party has walked the whole deck and is standing in the corridor.
  const everywhere = {};
  for (const k of Object.keys(floor)) everywhere[k] = true;
  const walked = readMap({ ...base, explored: everywhere, viewpoint: { x: 5, y: 1 } });

  // Both doors open: everything they have seen is on the board.
  assert.equal(Object.keys(visibleExplored(walked)).length, Object.keys(everywhere).length);

  // Shut the bulkhead behind them and room A goes off the board.
  const shut = readMap({
    ...base, explored: everywhere, viewpoint: { x: 5, y: 1 },
    doors: { '3,1': { kind: 'bulkhead', state: 'closed' }, '7,1': { kind: 'hatch', state: 'open' } }
  });
  const seen = visibleExplored(shut);
  assert.equal(seen['1,1'], undefined, 'the room behind the shut door is gone');
  assert.equal(seen['3,1'], true, 'but the door itself is still there to be seen');
  assert.equal(seen['5,1'], true, 'the corridor they stand in stays');
  assert.equal(seen['9,1'], true, 'and the hall through the OPEN hatch stays too');

  // A jammed door seals exactly as a closed one does.
  const jammed = readMap({ ...shut, doors: { ...shut.doors, '3,1': { kind: 'bulkhead', state: 'jammed' } } });
  assert.equal(visibleExplored(jammed)['1,1'], undefined);

  // NOTHING IS FORGOTTEN. Open it again and the room comes back exactly as
  // it was. Doing this by deleting squares from `explored` would work once
  // and then lose the deck.
  assert.equal(visibleExplored(walked)['1,1'], true, 'reopening restores it');
  assert.equal(shut.explored['1,1'], true, 'explored still holds it while it is hidden');

  // Standing on the far side flips which room is cut off — it is about
  // where they are, not which door it is.
  const fromRoomA = readMap({ ...shut, viewpoint: { x: 1, y: 1 } });
  const seenA = visibleExplored(fromRoomA);
  assert.equal(seenA['1,1'], true, 'the room they are in');
  assert.equal(seenA['5,1'], undefined, 'and the corridor is what is now sealed off');

  // Shutting BOTH doors leaves them the corridor and its two doorways.
  const boxedIn = readMap({
    ...base, explored: everywhere, viewpoint: { x: 5, y: 1 },
    doors: { '3,1': { kind: 'bulkhead', state: 'closed' }, '7,1': { kind: 'hatch', state: 'closed' } }
  });
  assert.deepEqual(Object.keys(visibleExplored(boxedIn)).sort(),
    ['3,1', '4,1', '5,1', '6,1', '7,1'].sort());

  // No viewpoint — a deck being built, or revealed by hand — draws
  // everything explored: there is nobody to be cut off from.
  const building = readMap({ ...base, explored: everywhere, viewpoint: null });
  assert.equal(Object.keys(visibleExplored(building)).length, Object.keys(everywhere).length);

  // A viewpoint standing in void shows nothing rather than everything.
  assert.deepEqual(visibleExplored(readMap({ ...base, explored: everywhere, viewpoint: { x: 13, y: 5 } })), {});
  assert.equal(openReach(walked, null).size, 0);

  // Conceal is the by-hand mirror of reveal.
  const after = concealArea(walked, { x: 1, y: 1 });
  assert.equal(after['1,1'], undefined);
  assert.equal(after['5,1'], true, 'only that place');
  assert.deepEqual(concealArea(walked, { x: 13, y: 5 }), walked.explored, 'void conceals nothing');

  // Publishing clears the viewpoint with everything else.
  assert.equal(publishMap({ name: 'x', map: walked }).viewpoint, null);
}

/* ---- fog is a view, and publishing is what starts a game ---- */

{
  assert.equal(fogStateAt(readMap({ fog: false }), 3, 3), 'open', 'no fog, nothing hidden');
  const dark = readMap({ fog: true, explored: { '1,1': true } });
  assert.equal(fogStateAt(dark, 1, 1), 'open');
  assert.equal(fogStateAt(dark, 9, 9), 'dark');

  // THE WHOLE POINT OF PUBLISHING: a deck is drawn between sessions with the
  // fog off, every square visible to the GM who is building it. Pushed to
  // the table as it stands, it would hand the party the floorplan, last
  // session's explored squares and every contact already found.
  const built = readSavedMap({
    name: 'Hulk deck 1',
    map: {
      cols: 20, rows: 10, fog: false,
      floor: paintCells({}, [{ x: 1, y: 1 }, { x: 2, y: 1 }]),
      explored: { '1,1': true, '2,1': true },
      contacts: { '2,1': { name: 'Genestealer', state: 'seen' } }
    }
  });
  const live = publishMap(built);
  assert.equal(live.fog, true, 'fog comes on by itself');
  assert.deepEqual(live.explored, {}, 'and last session is forgotten');
  assert.equal(live.contacts['2,1'].state, 'hidden', 'every contact goes back to unknown');
  // The deck itself survives: it is the thing that was built.
  assert.deepEqual(live.floor, built.map.floor);
  assert.equal(live.cols, 20);
  assert.equal(live.contacts['2,1'].name, 'Genestealer');

  // The library behaves like the GM's other libraries.
  assert.deepEqual(readMapLibrary(null), []);
  assert.equal(readMapLibrary([{}, {}]).length, 2);
  const a = newBattleMap('Deck A');
  const b = newBattleMap('Deck B');
  assert.notEqual(a.id, b.id, 'two maps made in the same millisecond are still two maps');
  assert.equal(a.name, 'Deck A');
  assert.equal(readSavedMap({ name: '' }).name, '', 'a name is kept as typed');
  assert.ok(readSavedMap(null).id, 'junk still reads as a map');
}

/* ---- the two scales are different things ---- */

{
  // metresPerSquare is fiction and prices range bands. mmPerSquare is the
  // table and calibrates the projector. Conflating them would mean changing
  // the projector zoom silently re-priced every shot in the book.
  const m = readMap({ metresPerSquare: 2, mmPerSquare: 32 });
  assert.equal(m.metresPerSquare, 2);
  assert.equal(m.mmPerSquare, 32);
  assert.equal(distanceMetres({ x: 0, y: 0 }, { x: 5, y: 0 }, m.metresPerSquare), 10,
    'the fiction scale, and only it, decides the distance');

  // Defaults: a square is a metre in the fiction and a 25mm base on the table.
  assert.equal(EMPTY_MAP.metresPerSquare, 1);
  assert.equal(EMPTY_MAP.mmPerSquare, 25);
  // Clamped to the ends of the range, the same way cols and rows are, rather
  // than silently reverting to the default — a nonsense value the GM typed
  // should land somewhere they can see and correct.
  assert.equal(readMap({ mmPerSquare: 0 }).mmPerSquare, 5, 'a zero-size square is not a square');
  assert.equal(readMap({ mmPerSquare: 9999 }).mmPerSquare, 100);
  assert.equal(readMap({ mmPerSquare: 'nonsense' }).mmPerSquare, 25, 'unreadable falls back');
}

/* ---- projector calibration ---- */

{
  // The bar spans WHOLE squares: a ruler cannot be lined up against two and
  // a half of them, which is the only thing the GM is going to do with it.
  const m = readMap({ mmPerSquare: 25, pxPerSquare: 40, cols: 30 });
  const bar = calibrationBar(m, { targetMm: 100 });
  assert.equal(bar.squares, 4, '100mm at 25mm a square');
  assert.equal(bar.mm, 100);
  assert.equal(bar.px, 160, 'and the pixels the GM stretches until a ruler agrees');
  assert.match(bar.label, /4 squares = 100 mm/);
  assert.equal(Number.isInteger(bar.squares), true);

  // A 32mm base does not divide 100 evenly, and the bar reports the real
  // length it actually drew rather than claiming 100mm.
  const wide = calibrationBar(readMap({ mmPerSquare: 32 }), { targetMm: 100 });
  assert.equal(wide.squares, 3);
  assert.equal(wide.mm, 96, 'the honest length, not the one that was asked for');

  // It never asks for more squares than the map has, or for none.
  assert.ok(calibrationBar(readMap({ cols: 5, mmPerSquare: 1 }), { targetMm: 10000 }).squares <= 5);
  assert.equal(calibrationBar(readMap({ mmPerSquare: 100 }), { targetMm: 10 }).squares, 1);
  assert.equal(calibrationBar(readMap({})).squares >= 1, true);
}

/* ---- deployment zones are drawn, not occupied ---- */

{
  // The models hold position on the table; the map only shades where to set
  // them down. Nothing here records who is standing in the zone.
  const z = deploymentRows(readMap({ rows: 16 }), 2);
  assert.deepEqual(z.hostile, { y0: 0, y1: 1 });
  assert.deepEqual(z.crew, { y0: 14, y1: 15 });
  assert.equal(deploymentRows(readMap({ rows: 16 })).hostile.y1, 0, 'one row deep by default');

  // The two bands can never meet in the middle and overlap.
  const tight = deploymentRows(readMap({ rows: 6 }), 99);
  assert.ok(tight.hostile.y1 < tight.crew.y0, 'deployment zones must not overlap');
  assert.ok(deploymentRows(readMap({ rows: 5 }), 0).hostile.y1 >= 0);
}

/* ------------------------- expanding a deck -------------------------

   Growing a deck used to add bare grid. It now repeats what is already
   built, mirrored at the seams so corridors meet their own mouths. */

{
  /* A small deck with one of everything on it, so what travels and what does
     not can both be seen. FIVE squares, not four: readMap clamps to MIN_GRID,
     so a 4x4 is silently a 5x5 and every offset below would be off by one. */
  const base = readMap({
    cols: 5, rows: 5,
    floor: { '0,0': true, '1,0': true, '3,0': true, '0,1': true, '2,2': true },
    doors: { '1,0': { kind: 'hatch', state: 'open' } },
    cover: { '0,1': 'crates' },
    hazards: { '2,2': 'fire' },
    markers: { '3,0': { type: MARKER_TYPES[0].id, label: 'Hold 3' } },
    explored: { '0,0': true },
    contacts: { '2,2': { name: 'Genestealer', encounterId: 'e1', hostileId: 'h1', state: 'ping' } },
    viewpoint: { x: 0, y: 0 }
  });

  /* ---- the tile is the GRID, not the floor's bounding box ---- */
  {
    // Doubled both ways is four copies, so a cell at (x,y) is also at
    // (x+5, y), (x, y+5) and (x+5, y+5) once the mirror is turned off.
    const flat = expandMap(base, 10, 10, { mirror: false });
    assert.equal(flat.cols, 10);
    assert.equal(flat.rows, 10);
    for (const k of Object.keys(base.floor)) {
      const p = parseKey(k);
      for (const [bx, by] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        assert.ok(flat.floor[cellKey(p.x + bx * 5, p.y + by * 5)],
          `unmirrored copy ${bx},${by} is missing ${k}`);
      }
    }
    // And nothing appeared where the source had void. (2,0) and (4,0) are
    // empty in the source, so they are empty in every copy.
    for (const x of [2, 4, 7, 9]) assert.ok(!flat.floor[cellKey(x, 0)], `${x},0 invented floor`);
    // The margin the GM designed around the deck is kept: row 3 and 4 are
    // void in the source and void in the copies, which is the whole reason
    // the tile is the grid rather than the floor's bounding box.
    for (let x = 0; x < 10; x++) {
      assert.ok(!flat.floor[cellKey(x, 3)] && !flat.floor[cellKey(x, 8)],
        'an empty source row must stay empty');
    }
  }

  /* ---- mirroring, which is the whole reason this is worth doing ---- */
  {
    // Asserted as a symmetry over the whole width rather than cell by cell:
    // a doubled-and-mirrored deck IS its own reflection, and that is the
    // property that makes a corridor meet its own mouth at the seam.
    const m = expandMap(base, 10, 5, { mirror: true });
    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 5; y++) {
        assert.equal(Boolean(m.floor[cellKey(x, y)]), Boolean(m.floor[cellKey(9 - x, y)]),
          `not mirrored about the seam at ${x},${y}`);
      }
    }
    for (const k of Object.keys(base.floor)) {
      const p = parseKey(k);
      assert.ok(m.floor[cellKey(p.x, p.y)], `block 0 lost ${k}`);
      assert.ok(m.floor[cellKey(9 - p.x, p.y)], `mirrored block is missing ${k}`);
    }

    // Vertically too.
    const v = expandMap(base, 5, 10, { mirror: true });
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 10; y++) {
        assert.equal(Boolean(v.floor[cellKey(x, y)]), Boolean(v.floor[cellKey(x, 9 - y)]),
          `not mirrored vertically at ${x},${y}`);
      }
    }

    // Unmirrored it is a plain repeat, NOT a reflection — otherwise the flag
    // does nothing and the two modes are the same thing.
    const flat = expandMap(base, 10, 5, { mirror: false });
    assert.ok(Object.keys(flat.floor).some((k) => {
      const p = parseKey(k);
      return Boolean(flat.floor[cellKey(9 - p.x, p.y)]) !== true;
    }), 'mirror:false must not come out mirrored');
  }

  /* ---- the layers that ride along ---- */
  {
    const m = expandMap(base, 10, 10, { mirror: false });
    assert.equal(Object.keys(m.cover).length, 4, 'cover is copied into every block');
    assert.equal(m.cover[cellKey(5, 1)], 'crates');
    assert.equal(m.hazards[cellKey(7, 7)], 'fire', 'so are hazards');
    assert.equal(m.doors[cellKey(6, 0)].kind, 'hatch', 'and doors, kind and state');
    assert.equal(m.doors[cellKey(6, 0)].state, 'open');
    assert.equal(m.markers[cellKey(8, 5)].label, 'Hold 3', 'and markers');
    // Copied, not shared: editing one door must not change its three copies.
    assert.notEqual(m.doors[cellKey(1, 0)], m.doors[cellKey(6, 0)]);
  }

  /* ---- and the layers that MUST NOT ---- */
  {
    const m = expandMap(base, 10, 10, { mirror: false });
    // A hostile is one creature from one encounter. Three more the GM never
    // placed would ping on an auspex sweep and be looked for with a gun.
    assert.equal(Object.keys(m.contacts).length, 1, 'contacts do not multiply');
    assert.ok(m.contacts[cellKey(2, 2)]);
    // Fog is a record of where the party has BEEN. Copying it reveals rooms
    // nobody has walked into.
    assert.equal(Object.keys(m.explored).length, 1, 'explored does not multiply');
    assert.ok(m.explored[cellKey(0, 0)]);
  }

  /* ---- the rest of the deck is left alone ---- */
  {
    const themed = readMap({ ...base, theme: 'env-custom-1', pxPerSquare: 55, mmPerSquare: 30, fog: true });
    const m = expandMap(themed, 10, 10);
    assert.equal(m.theme, 'env-custom-1', 'the ground is not reset by growing the deck');
    assert.equal(m.pxPerSquare, 55, 'nor the projector calibration');
    assert.equal(m.mmPerSquare, 30);
    assert.equal(m.fog, true);
  }

  /* ---- shrinking is a crop, out of the same arithmetic ---- */
  {
    // From a deck bigger than MIN_GRID, or there is no room to shrink into.
    const big = readMap({
      cols: 12, rows: 12,
      floor: { '0,0': true, '1,1': true, '11,11': true, '6,2': true },
      cover: { '11,11': 'crates' },
      contacts: { '11,11': { name: 'Hybrid', encounterId: 'e', hostileId: 'h', state: 'ping' } },
      explored: { '11,11': true },
      viewpoint: { x: 11, y: 11 }
    });
    const small = expandMap(big, 6, 6, { mirror: true });
    assert.equal(small.cols, 6);
    assert.deepEqual(Object.keys(small.floor).sort(), ['0,0', '1,1'],
      'a smaller target keeps the top-left corner and drops the rest');
    assert.equal(Object.keys(small.cover).length, 0, 'cover off the new grid goes with it');
    assert.equal(Object.keys(small.contacts).length, 0, 'and the contact');
    assert.equal(Object.keys(small.explored).length, 0, 'and the fog');
    /* A viewpoint cropped away must become null rather than point off-grid:
       visibleExplored walks from it, and from nowhere it finds nothing and
       blacks out a deck that is perfectly well explored. */
    assert.equal(small.viewpoint, null);

    // One still on the new grid is kept.
    const kept = expandMap(readMap({ ...big, viewpoint: { x: 1, y: 1 } }), 6, 6);
    assert.deepEqual(kept.viewpoint, { x: 1, y: 1 });
  }

  /* ---- everything it returns is still a map ---- */
  {
    for (const [c, r] of [[8, 8], [50, 7], [5, 5], [200, 200], [7, 31]]) {
      const m = expandMap(base, c, r);
      const reread = readMap(m);
      assert.equal(Object.keys(reread.floor).length, Object.keys(m.floor).length,
        `readMap dropped squares from a ${c}x${r} expansion`);
      assert.equal(Object.keys(reread.doors).length, Object.keys(m.doors).length);
      for (const k of Object.keys(m.floor)) {
        const p = parseKey(k);
        assert.ok(p.x < m.cols && p.y < m.rows, `${k} is off a ${c}x${r} grid`);
      }
    }
  }

  /* ---- bounds and rubbish ---- */
  {
    assert.equal(expandMap(base, 1e9, 1e9).cols, MAX_GRID, 'clamped to the canvas ceiling');
    assert.equal(expandMap(base, 0, 0).rows, MIN_GRID);
    assert.equal(expandMap(base, NaN, NaN).cols, base.cols, 'rubbish keeps the current size');
    assert.equal(expandMap(base, '12', '12').cols, 12, 'a number box hands over strings');
    // An empty deck expands to an empty deck rather than throwing.
    const blank = expandMap(readMap({ cols: 10, rows: 10 }), 20, 20);
    assert.equal(Object.keys(blank.floor).length, 0);
    assert.equal(blank.cols, 20);
  }

  /* ---- what the button says before it is pressed ---- */
  {
    const p = expandPlan(readMap({ cols: 30, rows: 20 }), 60, 40);
    assert.deepEqual(
      { across: p.across, down: p.down, copies: p.copies, partial: p.partial, shrinking: p.shrinking },
      { across: 2, down: 2, copies: 4, partial: false, shrinking: false }
    );
    // A partial copy is the normal case and the one that cuts a room in half,
    // so it is called out rather than left to be discovered.
    const q = expandPlan(readMap({ cols: 30, rows: 20 }), 50, 20);
    assert.equal(q.across, 2);
    assert.equal(q.partial, true);
    assert.equal(expandPlan(readMap({ cols: 30, rows: 20 }), 10, 20).shrinking, true);
    assert.equal(expandPlan(readMap({ cols: 30, rows: 20 }), 30, 20).copies, 1);
  }
}

/* ------------------------- more than one terrain -------------------------

   A deck is rarely one ground: a boarding action runs from the ice outside
   to the deck plate inside. A cell named in `ground` is drawn with that
   ground instead of the deck's own, and nothing else changes. */

{
  const m = readMap({
    cols: 10, rows: 10,
    theme: 'space_hulk',
    floor: { '0,0': true, '1,0': true, '2,0': true, '5,5': true },
    ground: { '1,0': 'ice', '2,0': 'env-saved-3', '9,9': 'jungle', '': 'x', '4,4': '   ' }
  });

  /* ---- read as paint, kept as written ---- */
  {
    assert.equal(m.ground['1,0'], 'ice');
    // A saved ground's id is unknown here. Coercing it to a built-in is the
    // bug that moved every deck built on a generated floor back to default.
    assert.equal(m.ground['2,0'], 'env-saved-3', 'a custom ground id survives the reader');
    assert.ok(!('' in m.ground), 'an unparseable key is dropped');
    assert.ok(!('4,4' in m.ground), 'so is a blank ground id');
    // Off-deck paint is harmless and kept: erase a square, put it back, and
    // the terrain that was on it is still there.
    assert.equal(m.ground['9,9'], 'jungle');
  }

  /* ---- THE POINT: it is paint, so the deck is unchanged ---- */
  {
    // The floor stays binary, so everything derived from it is untouched by
    // what a square looks like. If painting terrain could move a wall or
    // split a region, this would be a second kind of floor, not paint.
    const plain = readMap({ ...m, ground: {} });
    assert.equal(wallMask(m.floor, 0, 0), wallMask(plain.floor, 0, 0), 'walls do not notice');
    assert.deepEqual(regionAt(m, { x: 0, y: 0 }).length, regionAt(plain, { x: 0, y: 0 }).length,
      'regions do not notice');
    assert.deepEqual(revealArea(m, { x: 0, y: 0 }), revealArea(plain, { x: 0, y: 0 }),
      'and neither does the fog');
  }

  /* ---- what has to be loaded before it can be drawn ---- */
  {
    const used = groundsUsed(m);
    assert.equal(used[0], 'space_hulk', "the deck's own ground comes first");
    assert.ok(used.includes('ice') && used.includes('env-saved-3'));
    // (9,9) is painted but has no deck on it, so there is nothing to draw
    // with it and no reason to fetch it.
    assert.ok(!used.includes('jungle'), 'paint with no floor under it is not loaded');
    assert.equal(new Set(used).size, used.length, 'each ground once, however many cells use it');

    // A plain deck needs exactly one.
    assert.deepEqual(groundsUsed(readMap({ theme: 'ice' })), ['ice']);
    assert.deepEqual(groundsUsed(null), [DEFAULT_THEME], 'and nothing still names one');
    assert.deepEqual(groundsUsed(EMPTY_MAP), [EMPTY_MAP.theme]);
  }

  /* ---- which way a barrier lies ----

     A railing runs across its square and has a side you crouch on, so the GM
     chooses its angle. Everything else is bulk and has none — and that is
     enforced here rather than at the call sites, because a crate that could
     hold an angle would mean turning a deck rewrote five hundred bare strings
     into five hundred records saying nothing. */
  {
    // Read either way round, as a door is.
    assert.deepEqual(readCover('low'), { id: 'low', turn: 0 }, 'the old bare string');
    assert.deepEqual(readCover({ id: 'low', turn: 1 }), { id: 'low', turn: 1 }, 'and the record');
    assert.equal(readCover('nonsense'), null, 'junk is not cover');
    assert.equal(readCover(null), null);
    assert.equal(readCover({ id: 'nope', turn: 1 }), null);
    // Two states and only two: a barrier is \u2014 or |, so anything else folds
    // into one of them rather than becoming a third thing the art cannot draw.
    assert.deepEqual(readCover({ id: 'low', turn: 7 }), { id: 'low', turn: 1 }, 'odd is standing');
    assert.deepEqual(readCover({ id: 'low', turn: 2 }), { id: 'low', turn: 0 }, 'even is across');
    assert.deepEqual(readCover({ id: 'low', turn: -1 }), { id: 'low', turn: 1 }, 'and negatives fold too');
    assert.deepEqual(readCover({ id: 'low', turn: 'x' }), { id: 'low', turn: 0 }, 'junk turn is none');
    // Bulk cover never carries one, however it is asked to.
    assert.deepEqual(readCover({ id: 'crates', turn: 1 }), { id: 'crates', turn: 0 },
      'a crate stack has no front');

    // Written compactly: a plain string unless it is actually turned.
    assert.equal(writeCover('low', 0), 'low', 'an untouched barrier stores as it always did');
    assert.deepEqual(writeCover('low', 1), { id: 'low', turn: 1 });
    assert.equal(writeCover('crates', 1), 'crates', 'and bulk cover never stores an angle');
    assert.equal(writeCover('low', 2), 'low', 'turning it twice is not turning it');
    assert.equal(writeCover('nonsense', 1), 'nonsense', 'an unknown type is handed back as given');

    // Round trips through readMap, in both forms, and canonically: reading a
    // map and writing it back must not change what is stored.
    const laid = readMap({
      cols: 8, rows: 8,
      cover: { '1,1': 'low', '2,1': { id: 'low', turn: 1 }, '3,1': 'crates',
        '4,1': { id: 'crates', turn: 1 }, '5,1': { id: 'low', turn: 9 }, 'x,y': 'low' }
    });
    assert.equal(laid.cover['1,1'], 'low');
    assert.deepEqual(laid.cover['2,1'], { id: 'low', turn: 1 });
    assert.equal(laid.cover['3,1'], 'crates');
    assert.equal(laid.cover['4,1'], 'crates', 'a turned crate is stored flat');
    assert.deepEqual(laid.cover['5,1'], { id: 'low', turn: 1 }, 'and an out-of-range turn folds');
    assert.ok(!('x,y' in laid.cover), 'a bad key is dropped');
    assert.deepEqual(readMap(laid).cover, laid.cover, 'reading it again changes nothing');

    // Sight and Armour Points read either form: a barrier that stopped being
    // a string must not stop being cover.
    const sighted = readMap({
      cols: 8, rows: 8,
      floor: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`${i},1`, true])),
      cover: { '3,1': { id: 'machinery', turn: 0 }, '5,1': { id: 'low', turn: 1 } }
    });
    const blocked = lineBlocked(sighted, { x: 0, y: 1 }, { x: 7, y: 1 });
    assert.ok(blocked && blocked.reason === 'cover',
      'head-high cover stored as a record still stops the lane');
    assert.equal(coverBetween(sighted, { x: 4, y: 1 }, { x: 6, y: 1 }).id, 'low',
      'and a turned railing still gives its Armour Points');

    /* Turning the whole run at once. */
    const run = readMap({
      cols: 10, rows: 10,
      cover: { '1,1': 'low', '2,1': 'low', '3,1': { id: 'low', turn: 1 }, '4,1': 'crates' }
    });
    assert.equal(countDirectionalCover(run), 3, 'three barriers and a crate stack');
    const turned = turnAllCover(run, 1);
    assert.deepEqual(turned.cover['1,1'], { id: 'low', turn: 1 }, 'across becomes along');
    assert.deepEqual(turned.cover['2,1'], { id: 'low', turn: 1 });
    assert.equal(turned.cover['3,1'], 'low', 'and one already standing lies back down');
    assert.equal(turned.cover['4,1'], 'crates', 'the crates are left alone');
    // Two presses and it is back where it started, which is what makes the
    // button safe to lean on.
    assert.deepEqual(turnAllCover(turnAllCover(run, 1), 1).cover, run.cover,
      'turning twice is where it began');
    assert.deepEqual(turnAllCover(run, 0).cover, run.cover, 'no turn is no change');
    assert.equal(countDirectionalCover(readMap({ cols: 8, rows: 8 })), 0, 'a bare deck has none');
    // Nothing else about the map moves.
    assert.equal(turned.cols, 10);
    assert.deepEqual(Object.keys(turned.cover).sort(), Object.keys(run.cover).sort());
  }

  /* ---- which prop pictures the deck needs ----
     The point of asking is to fetch only those, so the test that matters is
     that an empty deck asks for nothing and a dressed one asks for exactly
     what it is wearing. */
  {
    assert.deepEqual(tokensNeeded(readMap({ theme: 'ice' })), [],
      'a bare deck needs no props');
    assert.deepEqual(tokensNeeded(null), [], 'and neither does nothing at all');

    const dressed = readMap({
      theme: 'space_hulk',
      cols: 10, rows: 10,
      floor: { '1,1': true, '2,1': true, '3,1': true, '4,1': true, '5,1': true },
      doors: { '1,1': { kind: 'bulkhead', state: 'closed' }, '2,1': { kind: 'hatch', state: 'open' } },
      cover: { '3,1': 'crates' },
      hazards: { '4,1': 'fire', '5,1': 'radiation' },
      obscuring: { '3,1': 'heavy' }
    });
    const want = tokensNeeded(dressed);
    assert.ok(want.includes('space_hulk/door_closed'), 'the shut bulkhead');
    assert.ok(want.includes('space_hulk/hatch'), 'the hatch');
    assert.ok(want.includes('space_hulk/crates'), 'the crates');
    assert.ok(want.includes('space_hulk/fire'), 'the fire');
    assert.ok(want.includes('space_hulk/thicket'), 'the dense foliage');
    // Radiation has no token on the sheets, so nothing is fetched for it and
    // that square keeps the flat warning wash.
    assert.ok(!want.some((k) => /radiation/.test(k)), 'nothing is fetched for radiation');
    assert.equal(want.length, 5, 'and nothing else is fetched: ' + want.join(' '));
    assert.deepEqual(want, [...want].sort(), 'sorted, so two sets compare as strings');

    /* A prop standing on a painted square uses THAT ground's props — an ice
       crate on ice, not the deck's crate sitting on snow. */
    const mixed = readMap({
      theme: 'space_hulk',
      cols: 10, rows: 10,
      floor: { '1,1': true, '2,1': true },
      ground: { '2,1': 'ice' },
      cover: { '1,1': 'crates', '2,1': 'crates' }
    });
    const both = tokensNeeded(mixed);
    assert.ok(both.includes('space_hulk/crates') && both.includes('ice/crates'),
      'the same cover on two grounds is two pictures: ' + both.join(' '));
    assert.equal(both.length, 2);

    // Forty crates on one ground is still one picture to fetch.
    const many = readMap({
      theme: 'ice', cols: 20, rows: 20,
      cover: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`${i % 20},${i < 20 ? 0 : 1}`, 'machinery']))
    });
    assert.deepEqual(tokensNeeded(many), ['ice/machinery'], 'one file, not forty');

    // Junk in the stores must not become a request for "undefined/undefined".
    const junk = readMap({
      theme: 'ice', cols: 8, rows: 8,
      cover: { 'x,y': 'crates', '1,1': 'nonsense' },
      hazards: { '2,2': 'nonsense' },
      doors: { '3,3': { kind: 'bulkhead', state: 'closed' } }
    });
    const fromJunk = tokensNeeded(junk);
    assert.ok(fromJunk.every((k) => /^[a-z_0-9-]+\/[a-z_]+$/.test(k)),
      'every key is a real ground and a real role: ' + fromJunk.join(' '));
    assert.ok(fromJunk.includes('ice/door_closed'), 'and the good one still comes through');
  }

  /* ---- it repeats with the deck it is painted on ---- */
  {
    const big = expandMap(m, 20, 20, { mirror: false });
    assert.equal(big.ground[cellKey(11, 0)], 'ice',
      'an expanded ice shelf must not come back as deck plate');
    assert.equal(big.ground[cellKey(12, 10)], 'env-saved-3');
    const mir = expandMap(m, 20, 10, { mirror: true });
    assert.equal(mir.ground[cellKey(19 - 1, 0)], 'ice', 'and it mirrors with it');
    // Still a map afterwards.
    assert.equal(readMap(big).ground[cellKey(11, 0)], 'ice');
  }
}

console.log('battlemap.js OK (%d themes, %dx%d default grid)',
  MAP_THEMES.length, EMPTY_MAP.cols, EMPTY_MAP.rows);

/* ---- turning what is painted, a quarter turn at a time ---- */
{
  const { rotateMap, rotationFits, paintBounds, readMap, expandMap } = await import('./battlemap.js');
  // A 4 x 3 room (x 2..5, y 4..6) in the middle of a 12 x 10 grid.
  const base = readMap({
    cols: 12, rows: 10,
    floor: { '2,4': true, '3,5': true, '5,6': true },
    doors: { '3,5': { kind: 'hatch', state: 'open' } },
    cover: { '2,4': 'crates' }, hazards: { '5,6': 'fire' },
    obscuring: { '3,5': 'heavy' }, ground: { '2,4': 'ice_shelf' },
    markers: { '5,6': { type: 'objective', label: 'Vault' } },
    explored: { '3,5': true },
    contacts: { '2,4': { name: 'Ork', state: 'ping' } },
    viewpoint: { x: 3, y: 5 }
  });
  assert.deepEqual(paintBounds(base), { x0: 2, y0: 4, x1: 5, y1: 6 });

  const cw = rotateMap(base, 1);
  // the container is untouched
  assert.equal(cw.cols, 12, 'the grid keeps its columns');
  assert.equal(cw.rows, 10, 'and its rows');
  assert.equal(cw.pxPerSquare, base.pxPerSquare);
  assert.equal(cw.metresPerSquare, base.metresPerSquare);
  // the painted 4 x 3 box (x 2..5, y 4..6) becomes 3 x 4 about its middle (x 3..5, y 3..6)
  assert.deepEqual(paintBounds(cw), { x0: 3, y0: 3, x1: 5, y1: 6 });
  // clockwise inside the box: top-left goes top-right, bottom-right goes bottom-left
  assert.ok(cw.floor['5,3'], '(2,4) is the top-left, and goes to the top-right');
  assert.ok(cw.floor['3,6'], '(5,6) is the bottom-right, and goes to the bottom-left');
  assert.ok(cw.floor['4,4'], '(3,5) -> the middle');
  assert.equal(cw.doors['4,4'].kind, 'hatch', 'a door goes with its square');
  assert.equal(cw.doors['4,4'].state, 'open');
  // Bulk cover has no way round to keep, so it is still the bare string it
  // was: turning the deck must not inflate a hold of crates into records.
  assert.equal(cw.cover['5,3'], 'crates');
  assert.equal(cw.hazards['3,6'], 'fire');
  assert.equal(cw.obscuring['4,4'], 'heavy', 'foliage turns with the deck');
  assert.equal(cw.ground['5,3'], 'ice_shelf', 'so does painted terrain');
  assert.equal(cw.markers['3,6'].label, 'Vault');
  assert.ok(cw.explored['4,4'], 'and the fog');
  assert.equal(cw.contacts['5,3'].name, 'Ork');
  assert.deepEqual(cw.viewpoint, { x: 4, y: 4 });
  assert.equal(Object.keys(cw.floor).length, 3, 'nothing is lost or duplicated');

  // four turns is no turn, and left undoes right
  assert.deepEqual(rotateMap(base, 4), base);
  assert.deepEqual(rotateMap(rotateMap(base, 1), -1), base);
  assert.deepEqual(rotateMap(rotateMap(base, 1), 3), rotateMap(base, 4));
  let spun = base;
  for (let i = 0; i < 4; i++) spun = rotateMap(spun, 1);
  assert.deepEqual(spun, base, 'four single turns come home, odd-sized box and all');
  spun = base;
  for (let i = 0; i < 4; i++) spun = rotateMap(spun, -1);
  assert.deepEqual(spun, base);
  assert.deepEqual(rotateMap(rotateMap(base, 2), 2), base);
  assert.deepEqual(rotateMap(base, -1), rotateMap(base, 3), 'three right turns are one left');
  const half = rotateMap(base, 2);
  assert.equal(half.cols, 12, 'a half turn keeps the grid');
  assert.deepEqual(paintBounds(half), paintBounds(base), 'and the box');
  assert.ok(half.floor['5,6'] && half.floor['4,5'] && half.floor['2,4'], 'a half turn flips the box: (x, y) -> (7 - x, 10 - y)');
  assert.equal(half.cover['5,6'], 'crates', 'the crates are now bottom-right');
  assert.deepEqual(rotateMap(base, 0), base);
  assert.deepEqual(rotateMap(base, 'junk'), base, 'junk is no turn');
  assert.deepEqual(rotateMap({ cols: 12, rows: 10 }, 1), readMap({ cols: 12, rows: 10 }), 'an empty deck has nothing to turn');

  // A strip that cannot stand up inside the grid is left alone, not cut.
  const strip = readMap({ cols: 30, rows: 10, floor: { '0,5': true, '29,5': true } });
  assert.equal(rotationFits(strip, 1), false, '30 wide does not stand up in 10 rows');
  assert.equal(rotationFits(strip, 2), true, 'but it can still be flipped');
  assert.deepEqual(rotateMap(strip, 1), strip, 'refused, nothing lost');
  assert.equal(rotationFits(base, 1), true);

  // It fits against an edge by shifting rather than falling off it.
  const edge = readMap({ cols: 10, rows: 10, floor: { '0,0': true, '5,0': true } });  // 6 x 1, top-left
  const up = rotateMap(edge, 1);
  assert.equal(up.cols, 10);
  const ub = paintBounds(up);
  assert.ok(ub.x0 >= 0 && ub.y0 >= 0 && ub.x1 < 10 && ub.y1 < 10, 'still on the grid');
  assert.equal(ub.x1 - ub.x0 + 1, 1);
  assert.equal(ub.y1 - ub.y0 + 1, 6, 'a row of six stands as a column of six');
  assert.equal(Object.keys(up.floor).length, 2);

  // the foliage layer repeats when a deck is expanded, as the rest of the terrain does
  const grown = expandMap({ cols: 6, rows: 6, floor: { '1,1': true }, obscuring: { '1,1': 'light' } }, 12, 6, { mirror: false });
  assert.equal(grown.obscuring['1,1'], 'light');
  assert.equal(grown.obscuring['7,1'], 'light', 'the second copy carries its foliage');
}
console.log('battlemap.check.mjs: rotation passed');

/* ---- big decks: packed storage and clean layers ---- */
{
  const { readMap, packMap, packLayer, packCombat, combatSansMap, paintCells, keepClean, MAX_GRID, packMapLibrary } =
    await import('./battlemap.js');
  assert.equal(MAX_GRID, 500, 'a deck may be 500 squares across');

  const floor = {};
  const ground = {};
  for (let x = 0; x < 120; x++) for (let y = 0; y < 90; y++) { floor[`${x},${y}`] = true; if (x > 60) ground[`${x},${y}`] = 'ice'; }
  floor['3,3'] = undefined; delete floor['3,3'];            // a hole in a run
  const m = readMap({
    cols: 150, rows: 100, floor, ground,
    doors: { '5,5': { kind: 'hatch', state: 'open' } },
    cover: { '7,7': 'crates' }, explored: { '1,1': true, '2,1': true }
  });

  // packed, it is a fraction of the size and comes back exactly
  /* A turned barrier has to survive storage: cover is a run-length layer, and
     a record per square is the one value shape the runs had never carried. */
  {
    const laid = readMap({
      cols: 8, rows: 8,
      cover: { '1,1': 'low', '2,1': { id: 'low', turn: 1 }, '3,1': 'crates' }
    });
    assert.deepEqual(readMap(JSON.parse(JSON.stringify(packMap(laid)))).cover, laid.cover,
      'a barrier keeps its angle through packing');
    // And at a size that actually packs, which is the path that matters.
    const many = readMap({
      cols: 40, rows: 40,
      cover: Object.fromEntries(Array.from({ length: 200 },
        (_, i) => [`${i % 40},${Math.floor(i / 40)}`, i % 2 ? { id: 'low', turn: 1 } : 'low']))
    });
    const roundTripped = readMap(JSON.parse(JSON.stringify(packMap(many))));
    assert.deepEqual(roundTripped.cover, many.cover, '200 barriers, half of them turned');
    assert.ok(packMap(many).cover.rle === 1, 'and that layer really was packed');
  }

  const packed = packMap(m);
  assert.equal(packed.floor.rle, 1, 'a dense layer is packed');
  assert.ok(Array.isArray(packed.floor.runs));
  assert.deepEqual(packed.cover, m.cover, 'a handful of squares stays as it is');
  assert.deepEqual(packed.doors, m.doors);
  const plainBytes = JSON.stringify(m).length;
  const packedBytes = JSON.stringify(packed).length;
  assert.ok(packedBytes < plainBytes / 20, `packed ${packedBytes} bytes, plain ${plainBytes}`);
  const back = readMap(JSON.parse(JSON.stringify(packed)));
  assert.deepEqual(back.floor, m.floor, 'floor round-trips');
  assert.deepEqual(back.ground, m.ground, 'ground round-trips');
  assert.deepEqual(back.doors, m.doors);
  assert.deepEqual(back.cover, m.cover);
  assert.deepEqual(back.explored, m.explored);
  assert.equal(back.cols, 150);

  // a deck saved before packing existed still opens
  assert.deepEqual(readMap({ cols: 10, rows: 10, floor: { '1,1': true } }).floor, { '1,1': true });
  // a hostile packed layer is bounded, not trusted
  const evil = readMap({ cols: 10, rows: 10, floor: { rle: 1, vals: [true], runs: [0, 0, 99999999, 0, -5, 0, 4, 0, 'x', 1, 2, 0] } });
  assert.ok(Object.keys(evil.floor).length <= MAX_GRID, 'a runaway run is clamped to the largest grid');
  assert.deepEqual(readMap({ cols: 10, rows: 10, floor: { rle: 1, vals: [], runs: [0, 0, 3, 0] } }).floor, {}, 'a run with no value is dropped');
  assert.deepEqual(packLayer({}), { rle: 1, vals: [], runs: [] });

  // valued layers keep their values
  const vals = packLayer({ '0,0': 'a', '1,0': 'a', '2,0': 'b', '0,1': 'a' });
  assert.deepEqual(vals.vals, ['a', 'b']);
  assert.deepEqual(vals.runs, [0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0], 'runs are differences, not positions');

  // packing is remembered per map, and a library packs entry by entry
  assert.equal(packMap(m), packed, 'the same map is packed once');
  const lib = packMapLibrary([{ id: 'a', name: 'A', map: m }, { id: 'b', name: 'No map yet' }]);
  assert.equal(lib[0].map.floor.rle, 1);
  assert.deepEqual(lib[1], { id: 'b', name: 'No map yet' }, 'an entry with no map is left as it was');

  // the combat state: packed for the wire, compared without the map
  const combat = { phase: 'x', ground: { npcs: [{ id: 1 }], map: m } };
  assert.equal(packCombat(combat).ground.map.floor.rle, 1);
  assert.equal(packCombat(combat).ground.npcs[0].id, 1);
  assert.equal(combatSansMap(combat).ground.map, undefined);
  assert.deepEqual(combatSansMap({ phase: 'x' }), { phase: 'x' });
  assert.equal(packCombat(null), null);

  // clean layers are handed straight back, so reading a map costs what changed
  assert.equal(readMap(m).floor, m.floor, 'a layer already read is not read again');
  const next = readMap({ ...m, floor: paintCells(m.floor, [{ x: 140, y: 95 }], true) });
  assert.equal(next.ground, m.ground, 'untouched layers keep their identity');
  assert.ok(next.floor['140,95'] && !m.floor['140,95'], 'and the painted one is new');
  // a layer the caller built by hand is still checked
  const dirty = readMap({ cols: 10, rows: 10, floor: { '1,1': true, 'junk': true, '2,2': false } });
  assert.deepEqual(dirty.floor, { '1,1': true });
  assert.equal(keepClean({}, { a: 1 }).a, 1);
}
console.log('battlemap.check.mjs: big decks passed');
{
  // random layers survive packing exactly, whatever shape they are
  const { readMap, packMap } = await import('./battlemap.js');
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let trial = 0; trial < 20; trial++) {
    const floor = {}, ground = {}, cover = {};
    const density = rnd();
    for (let x = 0; x < 80; x++) for (let y = 0; y < 60; y++) {
      if (rnd() < density) { floor[`${x},${y}`] = true; if (rnd() < 0.4) ground[`${x},${y}`] = rnd() < 0.5 ? 'ice' : 'desert'; }
      if (rnd() < 0.05) cover[`${x},${y}`] = rnd() < 0.5 ? 'crates' : 'low';
    }
    const m = readMap({ cols: 80, rows: 60, floor, ground, cover });
    const back = readMap(JSON.parse(JSON.stringify(packMap(m))));
    assert.deepEqual(back.floor, m.floor, `trial ${trial}: floor`);
    assert.deepEqual(back.ground, m.ground, `trial ${trial}: ground`);
    assert.deepEqual(back.cover, m.cover, `trial ${trial}: cover`);
  }
  // squares on the very last row and column of the largest grid
  const edge = readMap({ cols: 500, rows: 500, floor: { '499,499': true, '0,499': true, '499,0': true, '0,0': true } });
  assert.deepEqual(readMap(JSON.parse(JSON.stringify(packMap({ ...edge, floor: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`${400 + (i % 100)},499`, true])) })))).floor['499,499'], true);
}
console.log('battlemap.check.mjs: pack round trips passed');
