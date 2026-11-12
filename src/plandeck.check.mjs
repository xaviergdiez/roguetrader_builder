// Self-check for caverns and for a deck made from a sketch plan. Run: node src/plandeck.check.mjs
import assert from 'node:assert/strict';
import { deckFromPlan } from './plandeck.js';
import { generateCaverns, roughen } from './caverns.js';
import { planFromStrokes } from './sketchread.js';
import { generateDeck, makeRng, DECK_STYLES } from './mapgen.js';
import { regionAt, readMap, DOOR_KINDS } from './battlemap.js';

const key = (x, y) => `${x},${y}`;
const pk = (k) => k.split(',').map(Number);
// The squares reachable from a square without walking through a door.
const flood = (floor, doors, from) => {
  const seen = new Set([from]);
  const stack = [from];
  while (stack.length) {
    const [x, y] = pk(stack.pop());
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = key(x + dx, y + dy);
      if (!floor[k] || seen.has(k)) continue;
      seen.add(k);
      if (!doors[k]) stack.push(k);
    }
  }
  return seen;
};
const connected = (floor) => flood(floor, {}, Object.keys(floor)[0]).size === Object.keys(floor).length;

/* ---- caverns ---- */
{
  assert.ok(DOOR_KINDS.some((d) => d.id === 'passage'), 'a narrow passage is a door kind');
  assert.ok(DECK_STYLES.some((d) => d.id === 'caverns'), 'and Caverns a deck style');
  let most = 0;
  for (const seed of ['X1', 'X2', 'X3', 'X4']) {
    const c = generateCaverns({ cols: 50, rows: 36, seed });
    assert.ok(Object.keys(c.floor).length > 50 * 36 * 0.25, `${seed}: a cave, not a crack`);
    assert.ok(connected(c.floor), `${seed}: one cave, every part of it reachable`);
    for (const [k, d] of Object.entries(c.doors)) {
      assert.equal(d.kind, 'passage');
      assert.ok(c.floor[k], 'a door stands on floor');
    }
    // The fog, flooding from any square, stops at the necks: the caverns are apart.
    const roomsSeen = new Set();
    for (const k of Object.keys(c.floor)) {
      if (c.doors[k]) continue;
      const region = [...flood(c.floor, c.doors, k)].filter((x) => !c.doors[x]).sort()[0];
      roomsSeen.add(region);
    }
    assert.equal(roomsSeen.size, c.rooms.length, `${seed}: one room to the fog per cavern`);
    if (Object.keys(c.doors).length) assert.ok(roomsSeen.size >= 2, `${seed}: doors divide the cave`);
    most = Math.max(most, roomsSeen.size);
    assert.deepEqual(generateCaverns({ cols: 50, rows: 36, seed }).floor, c.floor, `${seed}: seeded`);
  }
  assert.ok(most >= 4, 'some cave is cut into several caverns: ' + most);
  const viaDeck = generateDeck({ cols: 40, rows: 30, style: 'caverns', seed: 'Q' });
  assert.equal(viaDeck.style, 'caverns');
  assert.ok(Object.keys(viaDeck.floor).length > 100 && Array.isArray(viaDeck.rooms), 'Generate deck makes caverns');
  // A room worn into a cave stays in place, joined, and mostly there.
  const cells = [];
  for (let y = 5; y < 13; y++) for (let x = 5; x < 15; x++) cells.push(key(x, y));
  const worn = roughen(cells, makeRng('w'));
  assert.ok(worn.every((k) => cells.includes(k)), 'never outside the room');
  assert.ok(worn.length >= cells.length * 0.55 && worn.length < cells.length, 'worn, not gone: ' + worn.length);
  assert.ok(connected(Object.fromEntries(worn.map((k) => [k, true]))), 'and in one piece');
}

/* ---- a deck from a sketch ---- */
const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y + 0.1]];
const oval = (cx, cy, rx, ry) => Array.from({ length: 36 }, (_, i) => [cx + rx * Math.cos((i / 36) * Math.PI * 2), cy + ry * Math.sin((i / 36) * Math.PI * 2)]);
const strokes = [
  { id: 'sa', pen: 'room', pts: rect(2, 2, 6, 5) },
  { id: 'sb', pen: 'room', pts: rect(20, 2, 7, 6) },
  { id: 'sc', pen: 'room', pts: oval(12, 16, 5, 3.5) },
  { id: 'sd', pen: 'passage', pts: [[7.5, 4], [14, 4.2], [20.5, 4]] },
  { id: 'se', pen: 'passage', pts: [[5, 6.5], [6, 12], [8, 16]] },
  { id: 'sf', pen: 'passage', pts: [[23, 7.5], [22, 12], [16.5, 16]] },
  { id: 'sh', pen: 'mark', mark: 'lock', pts: [[14, 3.2], [14.1, 5]] },
  { id: 'si', pen: 'mark', mark: 'start', pts: [[4, 4]] },
  { id: 'sj', pen: 'mark', mark: 'objective', pts: [[23, 5]] },
  { id: 'sk', pen: 'mark', mark: 'hazard', detail: 'fire', pts: [[12, 16]] },
  { id: 'sl', pen: 'mark', mark: 'fixture', detail: 'turret', pts: [[24, 3]] }
];
const plan = planFromStrokes(strokes, { cols: 40, rows: 24 });
for (const layout of ['decks', 'caverns']) {
  const d = deckFromPlan(plan, { cols: 40, rows: 24, layout, seed: 'S1' });
  assert.equal(d.rooms, 3, `${layout}: every room drawn is made`);
  assert.deepEqual(d.unplaced, [], `${layout}: nothing left out: ${d.unplaced.join(' / ')}`);
  // The rooms are where they were drawn.
  assert.ok(d.floor[key(4, 4)] && d.floor[key(23, 4)] && d.floor[key(12, 16)], `${layout}: rooms where drawn`);
  // And apart to the fog: from the first room, the second is only reached through a door.
  const fromA = flood(d.floor, d.doors, key(4, 4));
  assert.ok(!fromA.has(key(23, 4)) && !fromA.has(key(12, 16)), `${layout}: the rooms are separate rooms`);
  const all = flood(d.floor, {}, key(4, 4));
  assert.ok(all.has(key(23, 4)) && all.has(key(12, 16)), `${layout}: and joined through their doors`);
  // Through regionAt too, as the map's fog does it.
  const map = readMap({ cols: 40, rows: 24, floor: d.floor, doors: d.doors });
  const reg = regionAt(map, { x: 4, y: 4 }).map((c) => key(c.x, c.y));
  assert.ok(!reg.includes(key(23, 4)), `${layout}: the map's own fog agrees`);
  const kinds = new Set(Object.values(d.doors).map((x) => x.kind));
  assert.deepEqual([...kinds], [layout === 'caverns' ? 'passage' : 'bulkhead'], `${layout}: ${[...kinds]}`);
  assert.ok(Object.values(d.doors).some((x) => x.state === 'jammed'), `${layout}: the locked passage is sealed`);
  assert.deepEqual(d.start && [d.start.x >= 2 && d.start.x < 8, d.start.y >= 2 && d.start.y < 7], [true, true], `${layout}: the start in the start room`);
  const marks = Object.entries(d.markers);
  assert.ok(marks.some(([k, m]) => m.type === 'objective' && pk(k)[0] >= 20), `${layout}: the objective in its room`);
  assert.ok(marks.some(([k, m]) => m.type === 'turret' && pk(k)[0] >= 20), `${layout}: the turret where it was marked`);
  assert.ok(Object.values(d.hazards).every((h) => h === 'fire') && Object.keys(d.hazards).length >= 3, `${layout}: the chamber is on fire`);
  assert.deepEqual(deckFromPlan(plan, { cols: 40, rows: 24, layout, seed: 'S1' }).floor, d.floor, `${layout}: seeded`);
}
{
  const plain = deckFromPlan(plan, { cols: 40, rows: 24, seed: 'S1' });
  const filled = deckFromPlan(plan, { cols: 40, rows: 24, seed: 'S1', fill: true });
  assert.ok(Object.keys(filled.floor).length > Object.keys(plain.floor).length + 40, 'filling the rest adds rooms');
  assert.ok(filled.floor[key(4, 4)] && filled.floor[key(23, 4)], 'and keeps the drawn ones');
  // Rooms drawn touching are kept apart by a wall.
  const touching = planFromStrokes([{ pen: 'room', pts: rect(2, 2, 5, 5) }, { pen: 'room', pts: rect(7, 2, 5, 5) }], { cols: 30, rows: 20 });
  const t = deckFromPlan(touching, { cols: 30, rows: 20, seed: 'T' });
  assert.ok(!flood(t.floor, t.doors, key(3, 3)).has(key(10, 3)), 'two rooms drawn touching are still two rooms');
}

console.log('plandeck.js and caverns.js OK');
