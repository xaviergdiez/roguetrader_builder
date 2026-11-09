// Does a floor tile, and if not quite, making it. Pure, over a raw pixel
// buffer, so the desktop tool (tools/add-floor.mjs) and its check share it.
//
// A floor repeats across the whole deck, so its right edge is drawn against
// its left and its bottom against its top. Image models asked for "seamless"
// mostly get there; when they do not, the miss is a line ruled across the
// deck every tile, the first thing anyone sees on a projector.
//
// MEASURED, NOT JUDGED BY EYE. The jump across the wrap is compared with the
// jump between neighbouring columns (or rows) inside the image: a busy
// plate has big jumps everywhere and a seam no bigger than those is lost in
// them, while the same jump on a smooth floor is a line. So the number that
// matters is the ratio. Measured on the eight floors added in November 2026,
// tiled and looked at: the ones that read clean sit at 0.7-1.53, the visible
// seams at 1.85-4.6.

export const SEAM_OK = 1.6;

const at = (rgba, w, ch, x, y, k) => rgba[(y * w + x) * ch + k];

function colJump(rgba, w, h, ch, a, b) {
  let s = 0;
  for (let y = 0; y < h; y++) for (let k = 0; k < 3; k++) s += Math.abs(at(rgba, w, ch, a, y, k) - at(rgba, w, ch, b, y, k));
  return s / (h * 3);
}
function rowJump(rgba, w, h, ch, a, b) {
  let s = 0;
  for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) s += Math.abs(at(rgba, w, ch, x, a, k) - at(rgba, w, ch, x, b, k));
  return s / (w * 3);
}

export function seamScores(rgba, w, h, ch = 4) {
  let inCols = 0, inRows = 0, n = 0;
  for (let j = 1; j < Math.min(w, h); j += 7) { inCols += colJump(rgba, w, h, ch, j - 1, j); inRows += rowJump(rgba, w, h, ch, j - 1, j); n++; }
  inCols = n ? inCols / n : 0; inRows = n ? inRows / n : 0;
  const lr = colJump(rgba, w, h, ch, w - 1, 0);
  const tb = rowJump(rgba, w, h, ch, h - 1, 0);
  return {
    lr, tb, inCols, inRows,
    ratioLR: inCols ? lr / inCols : (lr ? Infinity : 0),
    ratioTB: inRows ? tb / inRows : (tb ? Infinity : 0)
  };
}

/* Makes the image wrap by overlapping its two ends: the last `band` columns
   are cross-faded into the first, and the tile comes out `band` narrower.
   Its new last column is the old column just before the band, and its new
   first column is the old first column of the band, which were neighbours,
   so the wrap is now a step the image already takes. The same down the rows.
   The cost is a strip, `band` wide, where two bits of the floor show through
   each other, which on a busy plate reads as wear and on a smooth one as
   haze: kept narrow, and used only where the seam was worse. */
export function wrapBlend(rgba, w, h, ch = 4, { bandX = 0, bandY = 0 } = {}) {
  let src = rgba, W = w, H = h;
  if (bandX > 0 && bandX < W / 2) {
    const nw = W - bandX;
    const out = new Uint8ClampedArray(nw * H * ch);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < nw; x++) {
        const o = (y * nw + x) * ch;
        if (x < bandX) {
          const t = (x + 0.5) / bandX;              // 0 at the left: all the old right end
          const a = (y * W + (nw + x)) * ch, b = (y * W + x) * ch;
          for (let k = 0; k < ch; k++) out[o + k] = src[a + k] * (1 - t) + src[b + k] * t;
        } else {
          const a = (y * W + x) * ch;
          for (let k = 0; k < ch; k++) out[o + k] = src[a + k];
        }
      }
    }
    src = out; W = nw;
  }
  if (bandY > 0 && bandY < H / 2) {
    const nh = H - bandY;
    const out = new Uint8ClampedArray(W * nh * ch);
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * ch;
        if (y < bandY) {
          const t = (y + 0.5) / bandY;
          const a = ((nh + y) * W + x) * ch, b = (y * W + x) * ch;
          for (let k = 0; k < ch; k++) out[o + k] = src[a + k] * (1 - t) + src[b + k] * t;
        } else {
          const a = (y * W + x) * ch;
          for (let k = 0; k < ch; k++) out[o + k] = src[a + k];
        }
      }
    }
    src = out; H = nh;
  }
  return { data: src, w: W, h: H };
}

// The floor's average colour and how bright it reads, for the theme's numbers.
export function floorSample(rgba, w, h, ch = 4) {
  let r = 0, g = 0, b = 0;
  const n = w * h;
  for (let p = 0; p < n; p++) { r += rgba[p * ch]; g += rgba[p * ch + 1]; b += rgba[p * ch + 2]; }
  r /= n; g /= n; b /= n;
  return { r, g, b, luminance: 0.2126 * r + 0.7152 * g + 0.0722 * b };
}
