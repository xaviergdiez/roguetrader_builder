// Self-check for uvtt.js. Run: node src/uvtt.check.mjs
import assert from 'node:assert/strict';
import { readUvtt, uvttToMap, edgesCrossed, ambientLevel, lightingForAmbient, imageTypeOf, UVTT_METRES_PER_SQUARE } from './uvtt.js';
import { WALL_EAST, WALL_SOUTH, regionAt, lineBlocked, readMap, playDoor, visibleExplored, rotateMap } from './battlemap.js';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/* ---- the picture's type, by its bytes ---- */
assert.equal(imageTypeOf(PNG), 'image/png');
assert.equal(imageTypeOf('data:image/png;base64,' + PNG), 'image/png');
assert.equal(imageTypeOf('/9j/4AAQSkZJRg'), 'image/jpeg');
assert.equal(imageTypeOf('UklGRiQAAABXRUJQ'), 'image/webp');
assert.equal(imageTypeOf('PHN2ZyB4bWxucz0'), null, 'not an SVG, whatever it calls itself');

/* ---- a wall line becomes the edges it cuts ---- */
// Along the grid line x = 6, from y = 0 to 2: the edges between columns 5 and 6, rows 0 and 1.
assert.deepEqual(edgesCrossed({ x: 6, y: 0 }, { x: 6, y: 2 }), [
  { x: 5, y: 0, bit: WALL_EAST }, { x: 5, y: 1, bit: WALL_EAST }
]);
// Along y = 3 from x = 1 to 3: the south edges of row 2, columns 1 and 2.
assert.deepEqual(edgesCrossed({ x: 1, y: 3 }, { x: 3, y: 3 }), [
  { x: 1, y: 2, bit: WALL_SOUTH }, { x: 2, y: 2, bit: WALL_SOUTH }
]);
// The map's own outline has nothing on the far side to wall off.
assert.deepEqual(edgesCrossed({ x: 0, y: 0 }, { x: 0, y: 4 }), []);
// A diagonal cuts the steps it crosses, both ways.
{
  const d = edgesCrossed({ x: 2, y: 0 }, { x: 4, y: 2 });
  assert.ok(d.length >= 2 && d.some((e) => e.bit === WALL_EAST) && d.some((e) => e.bit === WALL_SOUTH));
}
assert.equal(ambientLevel('ff000000'), 0);
assert.equal(ambientLevel('ffffffff'), 1);
assert.equal(ambientLevel('#808080') > 0.49, true);
assert.equal(ambientLevel('nope'), null);
assert.equal(lightingForAmbient(0.05), 'dark');
assert.equal(lightingForAmbient(0.3), 'dim');
assert.equal(lightingForAmbient(0.9), 'clear');
assert.equal(lightingForAmbient(null), 'clear');

/* ---- a whole file: two rooms with a door between them, one lamp ---- */
const file = {
  format: 0.3,
  resolution: { map_origin: { x: 10, y: 20 }, map_size: { x: 12, y: 4 }, pixels_per_grid: 256 },
  line_of_sight: [
    [{ x: 10, y: 20 }, { x: 22, y: 20 }, { x: 22, y: 24 }, { x: 10, y: 24 }, { x: 10, y: 20 }],
    // the partition at x = 6 (16 with the origin), broken for the door at rows 1-2
    [{ x: 16, y: 20 }, { x: 16, y: 21 }],
    [{ x: 16, y: 22 }, { x: 16, y: 24 }],
    'junk', [{ x: 1 }]
  ],
  objects_line_of_sight: [],
  portals: [{ position: { x: 16, y: 21.5 }, bounds: [{ x: 16, y: 21 }, { x: 16, y: 22 }], rotation: 1.57, closed: true, freestanding: false }],
  lights: [{ position: { x: 12.5, y: 21.5 }, range: 3, intensity: 1, color: 'ffeccd8b', shadows: true }, { position: 'x' }],
  environment: { baked_lighting: true, ambient_light: 'ff0a0a0a' },
  image: PNG
};
assert.equal(readUvtt({}), null);
assert.equal(readUvtt({ resolution: { map_size: { x: 0, y: 3 } } }), null);
const u = readUvtt(file);
assert.equal(u.cols, 12);
assert.equal(u.rows, 4);
assert.equal(u.pixelsPerGrid, 256);
assert.equal(u.lines.length, 3, 'the junk is left out');
assert.deepEqual(u.lines[1], [{ x: 6, y: 0 }, { x: 6, y: 1 }], 'from the map’s own origin');
assert.equal(u.portals.length, 1);
assert.equal(u.lights.length, 1);
assert.equal(u.imageType, 'image/png');

const { map: m, notes } = uvttToMap(u, { backdrop: { id: 'pic-imported', kind: 'image', name: 'Two rooms' } });
assert.equal(m.cols, 12);
assert.equal(m.rows, 5, 'a deck is never under five rows');
assert.equal(Object.keys(m.floor).length, 48, 'deck under the picture, not past it');
assert.equal(m.metresPerSquare, UVTT_METRES_PER_SQUARE);
assert.deepEqual(m.backdrop, { id: 'pic-imported', kind: 'image', name: 'Two rooms', x: 0, y: 0, w: 12, h: 4, grid: false });
// The partition: walls on rows 0, 2 and 3; the doorway at row 1 open, with the door on its west side.
assert.equal(m.walls['5,0'], WALL_EAST);
assert.equal(m.walls['5,2'], WALL_EAST);
assert.equal(m.walls['5,3'], WALL_EAST);
assert.equal(m.walls['5,1'], undefined, 'the doorway');
assert.deepEqual(m.doors['5,1'], { kind: 'bulkhead', state: 'closed', edge: 'e' });
assert.equal(notes.doors, 1);
assert.equal(notes.walls, 3);
// It plays: the rooms stop at the wall and meet at the door.
const west = regionAt(m, { x: 1, y: 1 });
assert.ok(west.some((c) => c.x === 5 && c.y === 1) && !west.some((c) => c.x >= 6));
assert.equal(lineBlocked(m, { x: 2, y: 3 }, { x: 9, y: 3 }).reason, 'wall');
const opened = readMap({ ...m, fog: true, viewpoint: { x: 1, y: 1 }, explored: { '1,1': true } });
const after = readMap({ ...opened, ...playDoor(opened, { x: 5, y: 1 }) });
assert.ok(visibleExplored(after)['9,2'], 'opening the door shows the far room');
// The light: a dark map, the lamp's room lit as far as its range and no further than the wall.
assert.equal(m.lighting, 'dark');
assert.equal(m.light['2,1'], 'clear');
assert.equal(m.light['4,3'], 'clear');
assert.equal(m.light['8,1'], undefined, 'not through the wall');
// A turned door keeps its leaf on the doorway.
{
  const loose = readMap({ ...m, backdrop: null, cols: 20, rows: 20 });
  const k = Object.keys(rotateMap(loose, 1).doors)[0];
  assert.equal(rotateMap(loose, 1).doors[k].edge, 's');
}
// A bright map is played in clear light, and nothing is painted.
{
  const lit = uvttToMap(readUvtt({ ...file, environment: { ambient_light: 'ffffffff' } })).map;
  assert.equal(lit.lighting, 'clear');
  assert.deepEqual(lit.light, {});
}
// No picture, no backdrop: the walls and doors still come in on the tiled ground.
assert.equal(uvttToMap(readUvtt({ ...file, image: 'garbage' })).map.backdrop, null);
assert.equal(readUvtt({ ...file, image: 'garbage' }).image, '');

console.log('uvtt.js OK');
