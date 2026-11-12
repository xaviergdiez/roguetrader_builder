// Self-check for the sketch plan and the stroke reader. Run: node src/sketchplan.check.mjs
import assert from 'node:assert/strict';
import { readSketch, readStroke, readPlan, readExample, simplify, distanceToStroke, MAX_STROKES } from './sketchplan.js';
import {
  planFromStrokes, roomFromLoop, cellsAlong, describePlan, BOX_FILL, placePicture, moveStrokes, strokesFromReading
} from './sketchread.js';
import { readReading } from '../lib/sketchprompt.js';
import { deckFromPlan } from './plandeck.js';

// A hand-drawn rectangle: corners a little round, the line a little shaky.
const rect = (x, y, w, h) => {
  const pts = [];
  for (let i = 0; i <= 10; i++) pts.push([x + (w * i) / 10, y + (i % 2) * 0.1]);
  for (let i = 0; i <= 10; i++) pts.push([x + w - (i % 2) * 0.1, y + (h * i) / 10]);
  for (let i = 0; i <= 10; i++) pts.push([x + w - (w * i) / 10, y + h]);
  for (let i = 0; i <= 10; i++) pts.push([x, y + h - (h * i) / 10]);
  return pts;
};
const oval = (cx, cy, rx, ry) => Array.from({ length: 36 }, (_, i) => [cx + rx * Math.cos((i / 36) * Math.PI * 2), cy + ry * Math.sin((i / 36) * Math.PI * 2)]);

/* ---- strokes and sketches, read and never trusted ---- */
{
  assert.equal(readStroke({ pen: 'erase', pts: [[1, 1]] }), null, 'the eraser draws nothing');
  assert.equal(readStroke({ pen: 'room', pts: [] }), null);
  assert.equal(readStroke({ pen: 'nope', pts: [[1, 1]] }), null);
  const s = readStroke({ pen: 'mark', mark: 'bogus', detail: '<script>', pts: [[1.234, 2.345], ['x', 1], [99999, 1]] });
  assert.equal(s.mark, 'objective', 'an unknown mark is an objective');
  assert.equal(s.detail, null);
  assert.deepEqual(s.pts, [[1.23, 2.35]], 'points rounded, junk dropped');
  assert.equal(readSketch(null), null);
  assert.equal(readSketch({ strokes: [] }), null, 'nothing drawn is no sketch');
  const sk = readSketch({ strokes: Array.from({ length: MAX_STROKES + 9 }, () => ({ pen: 'room', pts: rect(1, 1, 4, 4) })), layout: 'swamp', fill: 'yes' });
  assert.equal(sk.strokes.length, MAX_STROKES);
  assert.equal(sk.layout, 'decks');
  assert.equal(sk.fill, false);
  assert.equal(sk.plan, null, 'a sketch of strokes keeps no plan: it is read again from them');
  const fromPhoto = readSketch({ strokes: [], plan: { rooms: [{ id: 'bridge', box: [2, 2, 5, 4] }] } });
  assert.equal(fromPhoto.plan.rooms[0].id, 'bridge', 'a plan with no strokes (a photograph read) is kept');
  const p = readPlan({ rooms: [{ id: 'a', box: [1, 1, 3, 3] }, { id: 'a', box: [1, 1, 3, 3] }, { id: 'b', shape: 'blob', box: [5, 5, 3, 3], cells: [] }, { id: 'bad id!', box: [1, 1, 2, 2] }],
    links: [{ from: 'a', to: 'ghost', kind: 'secret', path: [[1, 1], [2, 1]] }], unclear: ['x'.repeat(500), 4] });
  assert.equal(p.rooms.length, 1, 'one id once, a blob with no squares dropped, a bad id dropped');
  assert.deepEqual([p.links[0].from, p.links[0].to, p.links[0].kind], ['a', null, 'door'], 'a link to a room that is not there goes nowhere');
  assert.deepEqual(p.unclear.map((u) => u.length), [200]);
  const line = Array.from({ length: 50 }, (_, i) => [i / 5, 2 + (i % 2) * 0.05]);
  assert.ok(simplify(line).length <= 3, 'a straight shaky line keeps its ends: ' + simplify(line).length);
  const closed = Array.from({ length: 25 }, (_, i) => [5 + 4 * Math.cos((i / 24) * Math.PI * 2), 5 + 2 * Math.sin((i / 24) * Math.PI * 2)]);
  assert.ok(simplify(closed).length >= 8, 'a loop that ends where it began keeps its shape: ' + simplify(closed).length);
  assert.ok(distanceToStroke({ pen: 'passage', pts: [[0, 0], [10, 0]] }, 5, 0.3) < 0.31);
  assert.ok(distanceToStroke({ pen: 'room', pts: [[0, 0], [4, 0], [4, 4], [0, 4]] }, 0.2, 2) < 0.21, 'a loop is closed: its last side counts');
}

/* ---- rooms from loops ---- */
{
  const box = roomFromLoop(rect(2, 3, 6, 4));
  assert.equal(box.shape, 'box', 'a rectangle fills its bounds: ' + box.fill.toFixed(2));
  assert.deepEqual(box.box, [2, 3, 6, 4]);
  const blob = roomFromLoop(oval(10, 10, 4, 3));
  assert.equal(blob.shape, 'blob', 'an oval does not: ' + blob.fill.toFixed(2));
  assert.ok(blob.fill > 0.7 && blob.fill < BOX_FILL);
  assert.ok(blob.cells.includes('10,10') && !blob.cells.includes('6,7'), 'a blob is the squares inside its line');
  assert.match(roomFromLoop([[1, 1], [1.5, 1], [1.2, 1.4]]).error, /smaller than two squares/);
  assert.match(roomFromLoop([[1, 1]]).error, /loop/);
  const clipped = roomFromLoop(rect(-3, -3, 8, 8), { cols: 20, rows: 20 });
  assert.ok(clipped.box[0] >= 0 && clipped.box[1] >= 0, 'off the edge of the grid is cut to it');
  const walk = cellsAlong([[0.5, 0.5], [3.5, 3.5]]);
  for (let i = 1; i < walk.length; i++) {
    const [ax, ay] = walk[i - 1], [bx, by] = walk[i];
    assert.equal(Math.abs(ax - bx) + Math.abs(ay - by), 1, 'a passage steps side to side, never corner to corner');
  }
}

/* ---- a whole sketch ---- */
const strokes = [
  { id: 'sa', pen: 'room', pts: rect(2, 2, 6, 5) },
  { id: 'sb', pen: 'room', pts: rect(20, 2, 7, 6) },
  { id: 'sc', pen: 'room', pts: oval(12, 16, 5, 3.5) },
  { id: 'sd', pen: 'passage', pts: [[7.5, 4], [14, 4.2], [20.5, 4]] },
  { id: 'se', pen: 'passage', pts: [[5, 6.5], [6, 12], [8, 16]] },
  { id: 'sf', pen: 'passage', pts: [[23, 7.5], [22, 12], [16.5, 16]] },
  { id: 'sg', pen: 'passage', pts: [[24, 7.5], [30, 12], [34, 14]] },
  { id: 'sh', pen: 'mark', mark: 'lock', pts: [[14, 3.2], [14.1, 5]] },
  { id: 'si', pen: 'mark', mark: 'start', pts: [[4, 4]] },
  { id: 'sj', pen: 'mark', mark: 'objective', pts: [[23, 5]] },
  { id: 'sk', pen: 'mark', mark: 'hazard', detail: 'fire', pts: [[12, 16]] },
  { id: 'sl', pen: 'mark', mark: 'fixture', detail: 'turret', pts: [[24, 3]] },
  { id: 'sm', pen: 'mark', mark: 'start', pts: [[40, 30]] },
  { id: 'sn', pen: 'room', pts: [[30, 30], [30.5, 30.2], [30.2, 30.4]] }
];
{
  const plan = planFromStrokes(strokes, { cols: 40, rows: 24 });
  assert.equal(plan.rooms.length, 3);
  assert.deepEqual(plan.rooms.map((r) => r.shape), ['box', 'box', 'blob']);
  const [a, b, c] = plan.rooms;
  assert.equal(plan.links.length, 4);
  const ab = plan.links.find((l) => l.from === a.id && l.to === b.id);
  assert.ok(ab, 'the passage joins the two rooms its ends are in');
  assert.equal(ab.kind, 'locked', 'the lock drawn across it seals it');
  assert.ok(plan.links.find((l) => l.from === a.id && l.to === c.id), 'a passage ending at the oval joins it');
  const dead = plan.links.find((l) => l.from === b.id && !l.to);
  assert.ok(dead, 'a passage into nothing is a dead end');
  assert.deepEqual(a.tags, ['start']);
  assert.deepEqual(b.tags, ['objective']);
  assert.deepEqual(c.hazards, ['fire']);
  assert.deepEqual(b.fixtures, [{ type: 'turret', at: [24, 3], confirmed: true }]);
  assert.ok(plan.unclear.some((u) => /touches no room/.test(u)), 'a mark on nothing is said: ' + plan.unclear.join(' / '));
  assert.ok(plan.unclear.some((u) => /room stroke was left out/.test(u)), 'and a room too small');
  assert.ok(plan.unclear.some((u) => /dead end/.test(u)));
  assert.equal(plan.strokesOf[a.id], 'sa', 'each part knows the stroke it came from');
  assert.match(describePlan(plan), /3 rooms \(2 compartments, 1 chamber\), 4 passages, 1 locked, the start in r1, the objective in r2/);
  assert.equal(describePlan({ rooms: [], links: [] }), 'Nothing drawn yet.');
  // The same strokes always read the same.
  assert.deepEqual(planFromStrokes(strokes, { cols: 40, rows: 24 }), plan);
  // A passage that comes back to its own room is no passage.
  const loop = planFromStrokes([{ pen: 'room', pts: rect(2, 2, 6, 5) }, { pen: 'passage', pts: [[3, 3], [10, 10], [4, 4]] }]);
  assert.equal(loop.links.length, 0);
  assert.ok(loop.unclear.some((u) => /comes back/.test(u)));
}

/* ---- what a photograph adds to a stroke and a sketch ---- */
{
  const room = readStroke({ pen: 'room', name: '  Bridge\u0007  deck ', pts: rect(1, 1, 4, 4) });
  assert.equal(room.name, 'Bridge deck', 'a room may be named');
  assert.equal(readStroke({ pen: 'passage', name: 'x', pts: [[1, 1], [2, 2]] }).name, undefined, 'only a room');
  assert.equal(readStroke({ pen: 'passage', detail: 'open', pts: [[1, 1], [2, 2]] }).detail, 'open', 'a passage may be open');
  assert.equal(readStroke({ pen: 'passage', detail: 'secret', pts: [[1, 1], [2, 2]] }).detail, null);
  assert.equal(readStroke({ pen: 'mark', mark: 'fixture', detail: 'turret', unsure: true, pts: [[1, 1]] }).unsure, true, 'a mark may be unsure');
  assert.equal(readStroke({ pen: 'mark', mark: 'fixture', unsure: 'yes', pts: [[1, 1]] }).unsure, undefined);
  assert.equal(readExample({ rows: ['####', '#..#', '#.+#', '####'], doorKind: '<b>' }).doorKind, 'hatch');
  const ex = readSketch({ strokes: [], example: { rows: ['#####', '#...#', '#.+.#', '#####'], merge: 99 } });
  assert.ok(ex, 'an example alone is a sketch worth keeping');
  assert.equal(ex.example.merge, 40, 'merging held to forty squares');
  const sk = readSketch({ strokes: [{ pen: 'room', pts: rect(1, 1, 4, 4) }], notes: ['  turret?  ', 4, 'x'.repeat(300)] });
  assert.deepEqual(sk.notes.map((n) => n.length), [7, 200], 'notes kept short and only words');
  assert.deepEqual(readSketch({ strokes: [], plan: { rooms: [{ id: 'a', box: [1, 1, 3, 3] }] }, notes: ['x'] }).notes, [], 'no strokes, no notes');
  const plan = planFromStrokes([
    { id: 'a', pen: 'room', name: 'Breach', pts: rect(2, 2, 5, 5) },
    { id: 'b', pen: 'room', pts: rect(14, 2, 5, 5) },
    { id: 'c', pen: 'passage', detail: 'open', pts: [[6, 4], [15, 4]] },
    { id: 'd', pen: 'mark', mark: 'fixture', detail: 'turret', unsure: true, pts: [[10.5, 5.6]] },
    { id: 'e', pen: 'mark', mark: 'fixture', detail: 'shrine', unsure: true, pts: [[16, 4]] },
    { id: 'f', pen: 'mark', mark: 'start', pts: [[3, 3]] }
  ], { cols: 30, rows: 20 });
  assert.equal(plan.rooms[0].name, 'Breach');
  assert.equal(plan.links[0].kind, 'open', 'an open passage is read open');
  assert.deepEqual(plan.fixtures, [{ type: 'turret', at: [10, 5], confirmed: false }], 'a fixture in no room stands where it was drawn, unsure');
  assert.equal(plan.rooms[1].fixtures[0].confirmed, false);
  assert.match(describePlan(plan), /1 open, the start in Breach\./, 'named rooms by their names');
  const d = deckFromPlan(plan, { cols: 30, rows: 20, seed: 'F1' });
  const turret = Object.entries(d.markers).find(([, m]) => m.type === 'turret');
  assert.ok(turret && turret[1].label === '?', 'the corridor\'s fixture is on the deck, marked unsure');
  const [tx, ty] = turret[0].split(',').map(Number);
  assert.ok(Math.hypot(tx - 10, ty - 5) <= 3.2, 'near where it was drawn: ' + turret[0]);
  assert.equal(Object.keys(d.doors).length, 0, 'an open passage has no doors');
}

/* ---- a picture laid on the grid, and read into strokes ---- */
{
  const whole = placePicture(1.5, { cols: 32, rows: 22 });
  assert.deepEqual(whole, { x: 1, y: 1, across: 30 }, 'a wide picture fills the grid\'s width inside a margin');
  const tall = placePicture(0.5, { cols: 32, rows: 22 });
  assert.equal(tall.across, 10, 'a tall one its height: 20 squares down is 10 across');
  const reading = readReading({
    grid: { cols: 0, rows: 0 },
    rooms: [
      { id: 'breach', name: 'BREACH', shape: 'rect', box: [400, 100, 600, 300], tags: ['start'] },
      { id: 'reactor', name: 'REACTOR', shape: 'ellipse', box: [100, 500, 400, 800], note: 'fire!' },
      { id: 'hold', name: 'HOLD', shape: 'polygon', box: [600, 500, 900, 800], points: [[600, 500], [600, 800], [900, 800], [900, 650], [750, 650], [750, 500]] }
    ],
    fixtures: [{ type: 'turret', at: [500, 400], confirmed: false }],
    links: [
      { from: 'breach', to: 'reactor', kind: 'locked', via: [[500, 400], [250, 400]] },
      { from: 'breach', to: 'hold', kind: 'open', via: [] },
      { from: 'reactor', to: 'hold', kind: 'crawl', via: [] }
    ],
    unclear: ['the hold might be two rooms']
  });
  const place = placePicture(1, { cols: 30, rows: 30 }, reading);
  assert.ok(place.across > 28, 'the part with something on it fills the grid: ' + place.across);
  const { strokes: got, notes } = strokesFromReading(reading, place, 1);
  assert.deepEqual(got.map((st) => st.pen), [...got.map((st) => st.pen)].sort((p, q) => ['room', 'passage', 'mark'].indexOf(p) - ['room', 'passage', 'mark'].indexOf(q)), 'rooms, then passages, then marks');
  const read = planFromStrokes(got.map(readStroke), { cols: 30, rows: 30 });
  assert.deepEqual(read.rooms.map((r) => [r.name, r.shape]), [['BREACH', 'box'], ['REACTOR', 'blob'], ['HOLD', 'blob']], 'a rectangle a compartment, an oval and an L chambers');
  assert.deepEqual(read.links.map((l) => [l.from, l.to, l.kind]), [['r1', 'r2', 'locked'], ['r1', 'r3', 'open']], 'the lock drawn across its passage, the open one open');
  assert.deepEqual(read.rooms[0].tags, ['start']);
  assert.deepEqual(read.rooms[1].hazards, ['fire'], 'fire! in the reactor is fire');
  assert.ok(read.rooms[1].fixtures.some((f) => f.type === 'vent') && read.rooms[2].fixtures.some((f) => f.type === 'vent'), 'a crawlway a vent in each room');
  assert.deepEqual(read.fixtures.map((f) => [f.type, f.confirmed]), [['turret', false]], 'the turret in the corridor, unsure');
  assert.deepEqual(read.unclear, [], 'everything read lands somewhere: ' + read.unclear.join(' / '));
  assert.ok(notes.includes('the hold might be two rooms') && notes.some((n) => /crawlway from REACTOR to HOLD/.test(n)), notes.join(' / '));
  // Moved with the picture: half the size, from another corner.
  const to = { x: 3, y: 4, across: place.across / 2 };
  const moved = moveStrokes(got, place, to);
  const [x0, y0] = got[0].pts[0], [mx, my] = moved[0].pts[0];
  assert.ok(Math.abs(mx - (3 + (x0 - place.x) / 2)) < 0.02 && Math.abs(my - (4 + (y0 - place.y) / 2)) < 0.02, 'every point moves and scales with it');
  assert.deepEqual(moveStrokes(moved, to, place).map((st) => st.pts.map(([x, y]) => [Math.round(x), Math.round(y)])),
    got.map((st) => st.pts.map(([x, y]) => [Math.round(x), Math.round(y)])), 'and back');
}

console.log('sketchplan.js and sketchread.js OK');
