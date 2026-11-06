// Self-check for backdrop.js. Run: node src/backdrop.check.mjs
import assert from 'node:assert/strict';
import {
  readBackdrop, newBackdropId, backdropKindOf, squaresFor, gridFor, squaresUnder, TV_SIZES, tvSquaresAcross
} from './backdrop.js';
import { MAX_GRID, readMap, packMap, publishMap, rotateMap, rotationFits } from './battlemap.js';

/* ---- the record ---- */
assert.equal(readBackdrop(null), null);
assert.equal(readBackdrop({ id: 'pic-1', kind: 'image' }), null, 'no size, no picture');
assert.equal(readBackdrop({ id: '../etc', kind: 'image', w: 3, h: 3 }), null, 'the id is a key, not a path');
assert.equal(readBackdrop({ id: 'pic-1', kind: 'audio', w: 3, h: 3 }), null);
{
  const b = readBackdrop({ id: 'pic-1', kind: 'video', name: 'Sewer.mp4', x: '1.234', y: -2, w: 34.861, h: 19.6, grid: false, extra: 1 });
  assert.deepEqual(b, { id: 'pic-1', kind: 'video', name: 'Sewer.mp4', x: 1.23, y: -2, w: 34.86, h: 19.6, grid: false });
  assert.equal(readBackdrop({ id: 'pic-1', kind: 'image', w: 9999, h: 0.01 }).w, MAX_GRID, 'no bigger than a deck');
  assert.equal(readBackdrop({ id: 'pic-1', kind: 'image', w: 3, h: 3 }).grid, true, 'the grid is drawn unless asked not to be');
}
assert.match(newBackdropId(), /^pic-[a-z0-9-]+$/);
assert.notEqual(newBackdropId(), newBackdropId());

/* ---- what a file is ---- */
assert.equal(backdropKindOf('image/png'), 'image');
assert.equal(backdropKindOf('IMAGE/JPEG'), 'image');
assert.equal(backdropKindOf('video/mp4'), 'video');
assert.equal(backdropKindOf('video/webm'), 'video');
assert.equal(backdropKindOf('image/svg+xml'), null, 'no scripts in a floor');
assert.equal(backdropKindOf('application/json'), null);

/* ---- sizing ---- */
// A 40-inch 16:9 screen is 34.86 inches across, and a TV map is an inch to the square.
assert.equal(tvSquaresAcross(40), 34.86);
assert.equal(tvSquaresAcross(50), 43.58);
assert.ok(TV_SIZES.includes(40) && TV_SIZES.includes(50));
assert.deepEqual(squaresFor({ width: 2800, height: 2100 }, { pxPerSquare: 100 }), { w: 28, h: 21 });
assert.deepEqual(squaresFor({ width: 1920, height: 1080 }, { across: tvSquaresAcross(40) }), { w: 34.86, h: 19.61 });
assert.equal(squaresFor({ width: 0, height: 10 }, { pxPerSquare: 10 }), null);
assert.equal(squaresFor({ width: 100, height: 100 }, {}), null, 'nothing said, nothing guessed');
assert.deepEqual(gridFor({ id: 'p', kind: 'image', x: 0, y: 0, w: 34.86, h: 19.61 }), { cols: 35, rows: 20 });
assert.deepEqual(gridFor({ id: 'p', kind: 'image', x: 0, y: 0, w: 3, h: 2 }), { cols: 5, rows: 5 }, 'never under a deck’s smallest');
{
  const cells = squaresUnder({ id: 'p', kind: 'image', x: 0, y: 0, w: 3.4, h: 2 });
  // Centres at .5, 1.5, 2.5 across (3.5 is past 3.4) and .5, 1.5 down.
  assert.equal(cells.length, 6);
  assert.ok(!cells.some((c) => c.x === 3));
  assert.equal(squaresUnder({ id: 'p', kind: 'image', x: 0, y: 0, w: 10, h: 10 }, 4, 4).length, 16, 'kept inside the grid');
}

/* ---- the deck carries it ---- */
{
  const b = { id: 'pic-x', kind: 'image', name: 'Hall', x: 0, y: 0, w: 12, h: 8 };
  const m = readMap({ cols: 12, rows: 8, backdrop: b, floor: { '1,1': true } });
  assert.equal(m.backdrop.id, 'pic-x');
  assert.equal(readMap(packMap(m)).backdrop.w, 12, 'through storage');
  assert.equal(readMap(publishMap({ map: m })).backdrop.id, 'pic-x', 'and onto the table');
  assert.equal(readMap({ backdrop: { id: 'x', kind: 'image' } }).backdrop, null);
  // A deck over a picture lies the way the picture does.
  assert.equal(rotationFits(m, 1), false);
  assert.equal(rotateMap(m, 1).floor['1,1'], true, 'not turned');
}

console.log('backdrop.js OK');
