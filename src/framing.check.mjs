// Self-check for the portrait crop maths. Run: node src/framing.check.mjs
import assert from 'node:assert/strict';
import { clamp, framingStyle, panFraming, DEFAULT_FRAMING } from './framing.js';

const box = { width: 200, height: 400 };

// clamp holds the ends
assert.equal(clamp(5, 0, 100), 5);
assert.equal(clamp(-20, 0, 100), 0);
assert.equal(clamp(180, 0, 100), 100);

// defaults survive a missing framing object
assert.equal(framingStyle(undefined).objectPosition, '50% 50%');
assert.equal(framingStyle(undefined).transform, 'scale(1)');
assert.equal(framingStyle({ x: 10, y: 20, zoom: 2 }).objectPosition, '10% 20%');

// dragging right moves the visible window left, so x decreases
const right = panFraming(DEFAULT_FRAMING, 20, 0, box);
assert.equal(right.x, 40);   // 20/200 = 10% of the box
assert.equal(right.y, 50);

// dragging down decreases y by the same rule on the other axis
assert.equal(panFraming(DEFAULT_FRAMING, 0, 40, box).y, 40);  // 40/400 = 10%

// zooming in makes the same cursor travel move the crop less
const zoomed = panFraming({ zoom: 2, x: 50, y: 50 }, 20, 0, box);
assert.equal(zoomed.x, 45);

// a drag past the edge clamps instead of running away
assert.equal(panFraming(DEFAULT_FRAMING, 9999, 0, box).x, 0);
assert.equal(panFraming(DEFAULT_FRAMING, -9999, 0, box).x, 100);

console.log('framing: all checks passed');
