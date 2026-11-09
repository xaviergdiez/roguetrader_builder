// Self-check for named areas. Run: node src/areas.check.mjs
import assert from 'node:assert/strict';
import {
  readArea, readAreas, newArea, paintArea, areaAt, areaById, updateArea, removeArea, labelCell, areasForTable,
  AREA_COLOURS, areaColour, MAX_AREAS
} from './areas.js';
import { readMap, rotateMap, expandMap } from './battlemap.js';

{
  const a = newArea([]);
  assert.ok(a && /^a/.test(a.id), 'a new area has an id');
  assert.equal(a.name, 'Area 1');
  assert.equal(a.colour, AREA_COLOURS[0].id);
  assert.equal(newArea([a]).colour, AREA_COLOURS[1].id, 'the next takes the next colour');
  assert.equal(a.show, false, 'the table does not see an area until the GM says so');
  assert.equal(a.deck, null);
  for (const bad of [null, {}, { id: 'x' }, { id: 'nope!' }, 42]) assert.equal(readArea(bad), null);
  const r = readArea({ id: a.id, name: 'x'.repeat(200), colour: 'puce', note: 'n'.repeat(2000), deck: '../etc', show: 'yes', cells: ['1,2', '1,2', 'bad', 3] });
  assert.equal(r.name.length, 60);
  assert.equal(r.colour, 'gold', 'an unknown colour is the first');
  assert.equal(r.note.length, 600);
  assert.equal(r.deck, null, 'a deck id that is not one is dropped');
  assert.equal(r.show, false, 'only true shows it');
  assert.deepEqual(r.cells, ['1,2'], 'squares checked and kept once');
  assert.equal(areaColour('blue'), '#5aa9ff');
  const many = Array.from({ length: MAX_AREAS + 5 }, (_, i) => ({ id: 'aid' + i, cells: [] }));
  assert.equal(readAreas(many).length, MAX_AREAS);
  assert.equal(readAreas([{ id: 'aone' }, { id: 'aone' }]).length, 1, 'one id once');
}

{
  let list = [];
  const a = newArea(list); list = [a];
  const b = newArea(list); list = [...list, b];
  list = paintArea(list, a.id, ['0,0', '1,0', '2,0']);
  list = paintArea(list, b.id, ['2,0', '3,0']);
  assert.deepEqual(areaById(list, a.id).cells, ['0,0', '1,0'], 'a square belongs to one area: painting it into B took it from A');
  assert.deepEqual(areaById(list, b.id).cells, ['2,0', '3,0']);
  assert.equal(areaAt(list, '2,0').id, b.id);
  assert.equal(areaAt(list, '9,9'), null);
  list = paintArea(list, a.id, ['0,0'], false);
  assert.deepEqual(areaById(list, a.id).cells, ['1,0'], 'lifted');
  list = updateArea(list, a.id, { name: 'Bridge', note: 'The throne', deck: 'bmap-abc', show: true, cells: ['99,99'], id: 'hijack' });
  const up = areaById(list, a.id);
  assert.equal(up.name, 'Bridge'); assert.equal(up.deck, 'bmap-abc'); assert.equal(up.show, true);
  assert.deepEqual(up.cells, ['1,0'], 'an update does not repaint');
  assert.deepEqual(areasForTable(list).map((x) => x.id), [a.id], 'the table sees the shown ones');
  list = removeArea(list, a.id);
  assert.equal(list.length, 1);
}

{
  assert.deepEqual(labelCell(['0,0', '1,0', '2,0']), { x: 1, y: 0 }, 'the middle square');
  // An L: the middle of it is off the L; the label goes on the L.
  const L = ['0,0', '0,1', '0,2', '1,2', '2,2'];
  const at = labelCell(L);
  assert.ok(L.includes(`${at.x},${at.y}`), 'an L is labelled on itself');
  assert.equal(labelCell([]), null);
}

/* The map keeps its areas, and turns and grows them with the deck. */
{
  const a = { id: 'aroom', name: 'Hold', colour: 'blue', cells: ['0,0', '1,0'], show: true, deck: null, note: '' };
  const m = readMap({ cols: 10, rows: 6, floor: { '0,0': true, '1,0': true, '2,0': true, '0,1': true }, areas: [a] });
  assert.equal(m.areas.length, 1);
  assert.deepEqual(readMap({}).areas, [], 'a deck with none has none');
  const turned = rotateMap(m, 1);
  assert.equal(turned.areas.length, 1, 'turning keeps it');
  assert.notDeepEqual(turned.areas[0].cells, a.cells, 'and moves its squares with the deck');
  assert.equal(turned.areas[0].cells.length, 2);
  const cropped = expandMap(m, 5, 5);
  assert.deepEqual(cropped.areas[0].cells, ['0,0', '1,0'], 'growing or cropping keeps what is still on the grid');
}

console.log('areas.js OK');
