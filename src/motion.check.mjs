// Self-check for motion.js. Run: node src/motion.check.mjs
import assert from 'node:assert/strict';
import { deckMoves, seedOf, rainStreaks, drift, flicker, sparkArc, rush, MOTION_FRAME_MS, VIDEO_FRAME_MS } from './motion.js';
import { readMap } from './battlemap.js';

/* ---- what moves ---- */
assert.equal(deckMoves(readMap({})), false, 'a bare deck costs nothing');
assert.equal(deckMoves(readMap({ lighting: 'rain' })), true);
assert.equal(deckMoves(readMap({ lighting: 'rain', motion: false })), false, 'switched off');
assert.equal(deckMoves(readMap({ light: { '1,1': 'smoke' } })), true);
// Painted with the deck's own light is no paint at all, and does not move.
assert.equal(deckMoves(readMap({ lighting: 'smoke', light: { '1,1': 'smoke' } })), false);
assert.equal(deckMoves(readMap({ light: { '1,1': 'dark' } })), false, 'darkness is still');
assert.equal(deckMoves(readMap({ obscuring: { '1,1': 'medium' } })), true);
assert.equal(deckMoves(readMap({ hazards: { '1,1': 'fire' } })), true);
assert.equal(deckMoves(readMap({ hazards: { '1,1': 'warp' } })), false, 'the warp has its own loop');
assert.equal(readMap({}).motion, true, 'on unless switched off');
assert.ok(MOTION_FRAME_MS >= 33 && VIDEO_FRAME_MS <= MOTION_FRAME_MS);

/* ---- the same square at the same moment is drawn the same ---- */
assert.equal(seedOf(3, 4), seedOf(3, 4));
assert.notEqual(seedOf(3, 4), seedOf(4, 3));
for (let i = 0; i < 200; i++) {
  const s = seedOf(i * 7, -i, i);
  assert.ok(s >= 0 && s < 1);
}
assert.deepEqual(rainStreaks(2, 5, 1.25), rainStreaks(2, 5, 1.25));
assert.notDeepEqual(rainStreaks(2, 5, 1.25), rainStreaks(2, 5, 1.5), 'and it falls');
for (const r of rainStreaks(9, 9, 3.3, 5)) {
  assert.ok(r.y1 > r.y0, 'downward');
  assert.ok(r.y1 >= 0 && r.y1 <= 1 && r.x0 >= 0 && r.x0 <= 1, 'ends inside its square');
}
assert.equal(rainStreaks(0, 0, 0, 4).length, 4);
for (let t = 0; t < 20; t += 0.37) {
  const d = drift(1, 2, t), f = flicker(1, 2, t), r = rush(t);
  assert.ok(d >= 0 && d <= 1 && f >= 0 && f <= 1 && r >= 0 && r < 1);
}
// Current arcs some of the time, not all of it.
{
  let arcs = 0;
  for (let i = 0; i < 400; i++) if (sparkArc(4, 4, i / 10)) arcs++;
  assert.ok(arcs > 40 && arcs < 300, `arcs ${arcs} of 400`);
  const a = [...Array(400).keys()].map((i) => sparkArc(4, 4, i / 10)).find(Boolean);
  assert.ok(a.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1));
}

console.log('motion.js OK');
