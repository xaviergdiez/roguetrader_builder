// Self-check for growing a deck from an example. Run: node src/wfc.check.mjs
import assert from 'node:assert/strict';
import {
  readExample, exampleFromMap, learnExample, growCells, deckFromExample, cellsToRows,
  STOCK_EXAMPLES, stockExample, EXAMPLE_MAX, GROW_MAX
} from './wfc.js';
import { regionAt, readMap, DOOR_KINDS, EMPTY_MAP } from './battlemap.js';

const key = (x, y) => `${x},${y}`;

/* ---- an example, read and never trusted ---- */
{
  assert.equal(readExample(null), null);
  assert.equal(readExample({ rows: ['###', '#.#', '###'] }), null, 'smaller than four a side is no example');
  assert.equal(readExample({ rows: ['####', '#x.#', '#..#', '####'] }), null, 'only wall, floor and door');
  assert.equal(readExample({ rows: ['####', '#..#', '#.#', '####'] }), null, 'rows all one length');
  assert.equal(readExample({ rows: ['####', '####', '####', '####'] }), null, 'all wall is nothing to grow');
  assert.equal(readExample({ rows: Array(EXAMPLE_MAX + 1).fill('#..#') }), null, 'too tall');
  const ok = readExample({ rows: ['#####', '#...#', '#.+.#', '#####'], doorKind: 'nope', merge: 'lots', name: '  a  b ' });
  assert.equal(ok.doorKind, 'hatch', 'an unknown door kind is a hatch');
  assert.equal(ok.merge, 6);
  assert.equal(ok.name, 'a b');
  for (const ex of STOCK_EXAMPLES) {
    assert.ok(readExample(ex), `the stock example ${ex.id} reads`);
    assert.ok(DOOR_KINDS.some((d) => d.id === ex.doorKind), `${ex.id}'s doors are a kind the map knows`);
    assert.equal(stockExample(ex.id), ex);
  }
}

/* ---- an example from what is painted ---- */
{
  const floor = {}, doors = {};
  for (let y = 5; y < 8; y++) for (let x = 10; x < 14; x++) floor[key(x, y)] = true;
  for (let y = 5; y < 8; y++) for (let x = 15; x < 18; x++) floor[key(x, y)] = true;
  floor[key(14, 6)] = true;
  doors[key(14, 6)] = { kind: 'bulkhead', state: 'closed' };
  const ex = exampleFromMap({ floor, doors });
  assert.deepEqual(ex.rows, [
    '##########',
    '#....#...#',
    '#....+...#',
    '#....#...#',
    '##########'
  ], 'its bounds with a wall round them');
  assert.equal(ex.doorKind, 'bulkhead', 'the doors are the kind painted');
  assert.match(exampleFromMap({ floor: {}, doors: {} }).error, /Nothing is painted/);
  const wide = {};
  for (let x = 0; x < 30; x++) wide[key(x, 2)] = true;
  assert.match(exampleFromMap({ floor: wide }).error, /30 × 1 squares/);
}

/* ---- learning: every window, every way round ---- */
{
  const ex = stockExample('warren');
  const m = learnExample(ex);
  assert.ok(m.patterns.length > 40 && m.patterns.length < 400, 'patterns: ' + m.patterns.length);
  assert.ok(m.patterns.every((p) => p.length === 9));
  // A door in a wall running across, between two rooms, is learned in a wall
  // running up and down as well.
  assert.ok(m.keys.has('111020111'), 'a door in a wall running across');
  assert.ok(m.keys.has('101121101'), 'and the same door turned');
  assert.equal(m.propagator.length, 4);
}

/* ---- growing: seeded, and only windows it has seen ---- */
{
  const ex = stockExample('warren');
  const a = growCells(ex, { cols: 34, rows: 24, seed: 'W1' });
  const b = growCells(ex, { cols: 34, rows: 24, seed: 'W1' });
  const c = growCells(ex, { cols: 34, rows: 24, seed: 'W2' });
  assert.ok(a.cells, 'it grows');
  assert.deepEqual(cellsToRows(a.cells, 34, 24), cellsToRows(b.cells, 34, 24), 'the same seed grows the same deck');
  assert.notDeepEqual(cellsToRows(a.cells, 34, 24), cellsToRows(c.cells, 34, 24), 'another seed another');
  const rows = cellsToRows(a.cells, 34, 24);
  for (let y = 0; y + 3 <= 24; y++) {
    for (let x = 0; x + 3 <= 34; x++) {
      const w = [0, 1, 2].map((dy) => rows[y + dy].slice(x, x + 3)).join('').replace(/#/g, '0').replace(/\./g, '1').replace(/\+/g, '2');
      assert.ok(a.model.keys.has(w), `the window at ${x},${y} is one the example has: ${w}`);
    }
  }
  assert.ok(rows[0].split('').every((ch) => ch === '#') && rows[23].split('').every((ch) => ch === '#'), 'the top and bottom edges are wall');
  assert.ok(rows.every((r) => r[0] === '#' && r[33] === '#'), 'and the sides');
}

/* ---- the deck: one piece, doors that are doors, rooms the fog can tell apart ---- */
const doorsHold = (d) => {
  const isOpen = (x, y) => Boolean(d.floor[key(x, y)]);
  for (const k of Object.keys(d.doors)) {
    assert.ok(d.floor[k], 'a door stands on floor');
    const [x, y] = k.split(',').map(Number);
    const lr = isOpen(x - 1, y) && isOpen(x + 1, y), ud = isOpen(x, y - 1) && isOpen(x, y + 1);
    assert.ok(lr || ud || [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => isOpen(x + dx, y + dy)).length >= 2,
      `the door at ${k} has floor on two sides`);
  }
};
const reachable = (d) => {
  const keys = Object.keys(d.floor);
  const seen = new Set([keys[0]]);
  const q = [keys[0]];
  while (q.length) {
    const [x, y] = q.shift().split(',').map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = key(x + dx, y + dy);
      if (d.floor[k] && !seen.has(k)) { seen.add(k); q.push(k); }
    }
  }
  return seen.size === keys.length;
};
for (const ex of STOCK_EXAMPLES) {
  for (const seed of ['S1', 'S2', 'S3', 'S4']) {
    const d = deckFromExample(ex, { cols: 40, rows: 28, seed });
    assert.ok(!d.error, `${ex.id}/${seed} grows: ${d.error}`);
    assert.ok(Object.keys(d.floor).length > 200, `${ex.id}/${seed} has a deck`);
    assert.ok(reachable(d), `${ex.id}/${seed}: every square can be reached through the doors`);
    doorsHold(d);
    // The fog: no click reveals most of the deck.
    const map = readMap({ ...EMPTY_MAP, cols: d.cols, rows: d.rows, floor: d.floor, doors: d.doors });
    const total = Object.keys(d.floor).length;
    const seen = new Set();
    let biggest = 0;
    const sizes = [];
    for (const k of Object.keys(d.floor)) {
      if (seen.has(k) || d.doors[k]) continue;
      const [x, y] = k.split(',').map(Number);
      const reg = regionAt(map, { x, y }).filter((c) => !d.doors[key(c.x, c.y)]);
      for (const c of reg) seen.add(key(c.x, c.y));
      biggest = Math.max(biggest, reg.length);
      sizes.push(reg.length);
    }
    assert.ok(biggest / total < 0.5, `${ex.id}/${seed}: one click reveals ${Math.round((biggest / total) * 100)}%`);
    assert.equal(sizes.length, d.rooms, `${ex.id}/${seed}: the rooms counted are the rooms the fog sees`);
    if (ex.merge > 0) {
      const small = sizes.filter((n) => n < ex.merge).length;
      assert.ok(small <= 1, `${ex.id}/${seed}: rooms under ${ex.merge} squares are merged, ${small} left`);
    }
  }
}

/* ---- merging is the GM's to set ---- */
{
  const ex = stockExample('warren');
  const none = deckFromExample(ex, { cols: 40, rows: 28, seed: 'M1', merge: 0 });
  const lots = deckFromExample(ex, { cols: 40, rows: 28, seed: 'M1', merge: 30 });
  assert.equal(none.merged, 0, 'nothing merged at 0');
  assert.ok(lots.rooms < none.rooms, `more merged, fewer rooms: ${lots.rooms} < ${none.rooms}`);
  assert.ok(Object.keys(lots.doors).length < Object.keys(none.doors).length, 'and fewer doors');
  assert.deepEqual(Object.keys(none.floor).sort(), Object.keys(lots.floor).sort(), 'merging opens doors, it does not move walls');
}

/* ---- the grid ---- */
{
  const ex = stockExample('ruin');
  const big = deckFromExample(ex, { cols: 200, rows: 30, seed: 'G1' });
  assert.equal(big.cols, GROW_MAX, 'grown over at most GROW_MAX a side');
  assert.equal(big.clipped, true, 'and it says so');
  assert.match(deckFromExample(ex, { cols: 5, rows: 5, seed: 'G1' }).error || '', /too small/);
  assert.match(deckFromExample({ rows: ['#'] }, { cols: 30, rows: 20 }).error, /not an example/);
  const t0 = Date.now();
  deckFromExample(stockExample('warren'), { cols: GROW_MAX, rows: GROW_MAX, seed: 'T1' });
  assert.ok(Date.now() - t0 < 4000, 'the biggest grows in seconds: ' + (Date.now() - t0) + 'ms');
}

console.log('wfc: ok');
