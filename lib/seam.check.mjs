// Self-check for the floor-tiling measures. Run: node lib/seam.check.mjs
import assert from 'node:assert/strict';
import { seamScores, wrapBlend, floorSample, SEAM_OK } from './seam.js';

const W = 64, H = 48;
const img = (fn) => {
  const a = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = fn(x, y), i = (y * W + x) * 4;
    a[i] = a[i + 1] = a[i + 2] = v; a[i + 3] = 255;
  }
  return a;
};
// A pattern with a whole number of periods across: it wraps perfectly.
const wraps = img((x, y) => 128 + 60 * Math.cos((x / W) * Math.PI * 4) * Math.cos((y / H) * Math.PI * 2));
// A ramp: smooth inside, a cliff from its right edge back to its left.
const ramp = img((x) => 40 + x * 3);
// A ramp down the rows too.
const vramp = img((x, y) => 40 + y * 3);

{
  const s = seamScores(wraps, W, H);
  assert.ok(s.ratioLR < SEAM_OK && s.ratioTB < SEAM_OK, 'a pattern that wraps has no seam: ' + JSON.stringify(s));
  const r = seamScores(ramp, W, H);
  assert.ok(r.ratioLR > 10, 'a ramp has a cliff where it wraps: ' + r.ratioLR);
  assert.ok(r.ratioTB < SEAM_OK, 'but not top to bottom');
  const v = seamScores(vramp, W, H);
  assert.ok(v.ratioTB > 10 && v.ratioLR < SEAM_OK, 'and the other way round');
}

{
  const out = wrapBlend(ramp, W, H, 4, { bandX: 16 });
  assert.equal(out.w, W - 16, 'the tile comes out a band narrower');
  assert.equal(out.h, H);
  const s = seamScores(out.data, out.w, out.h);
  assert.ok(s.ratioLR < SEAM_OK, 'and now wraps: ' + s.ratioLR.toFixed(2));
  // The middle is untouched.
  assert.equal(out.data[(10 * out.w + 30) * 4], ramp[(10 * W + 30) * 4]);
  const both = wrapBlend(img((x, y) => 40 + x * 2 + y * 2), W, H, 4, { bandX: 12, bandY: 10 });
  assert.equal(both.w, W - 12); assert.equal(both.h, H - 10);
  const b = seamScores(both.data, both.w, both.h);
  assert.ok(b.ratioLR < SEAM_OK && b.ratioTB < SEAM_OK, 'both ways at once: ' + JSON.stringify(b));
  const none = wrapBlend(ramp, W, H, 4, {});
  assert.equal(none.data, ramp, 'no band, no change');
  assert.equal(wrapBlend(ramp, W, H, 4, { bandX: W }).w, W, 'a band over half the tile is refused');
}

{
  const s = floorSample(img(() => 100), W, H);
  assert.equal(Math.round(s.r), 100);
  assert.equal(Math.round(s.luminance), 100);
}

console.log('seam.js OK');
