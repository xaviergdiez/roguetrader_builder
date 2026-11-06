/* THE DECK MOVING: rain falling, smoke drifting, fire and lumens flickering.

   Everything here is a number for the drawing code to use, worked out from a
   square and a time, so the same square at the same moment is drawn the same
   in the projector's window and the GM's own, and a check can hold the time
   still. Nothing is stored: a deck says only whether it moves at all
   (map.motion), and what moves is read off what is already on it — the light
   it is lit by, its smoke and foliage, its hazards.

   Pure: see motion.check.mjs. */

// Twenty frames a second is smooth for rain and smoke, and a deck redrawn at
// sixty would cost three times as much to show the same drizzle.
export const MOTION_FRAME_MS = 50;
// A video floor is drawn at its own rate, near enough.
export const VIDEO_FRAME_MS = 33;
// Past this many squares on screen the GM is looking at the whole deck from
// far off, and the motion is too small to see and too dear to draw.
export const MOTION_MAX_SQUARES = 6000;

// Light that moves, and the hazards that do.
export const MOVING_LIGHT = ['rain', 'smoke', 'dim', 'clear'];
export const MOVING_HAZARDS = ['fire', 'electrical', 'toxic', 'radiation', 'void'];

const has = (layer, pred) => {
  for (const k in layer || {}) if (pred(layer[k])) return true;
  return false;
};

/* Whether anything on this deck moves, so a deck with nothing to animate
   costs nothing: the redraw loop only runs when this is true. */
export function deckMoves(m) {
  if (!m || m.motion === false) return false;
  if (m.lighting === 'rain') return true;
  if (has(m.light, (v) => MOVING_LIGHT.includes(v) && v !== m.lighting)) return true;
  if (has(m.obscuring, Boolean)) return true;
  return has(m.hazards, (v) => MOVING_HAZARDS.includes(v));
}

// A number from 0 to 1 for a square, the same every time it is asked.
export function seedOf(x, y, salt = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(salt | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const frac = (v) => v - Math.floor(v);

/* Rain on a square: short slanting streaks falling through it, each at its
   own place and pace so a field of rain does not fall in step. In fractions of
   the square, top-left at 0,0; t is seconds. */
export function rainStreaks(x, y, t, count = 3) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const s = seedOf(x, y, i + 1);
    const speed = 1.6 + s * 1.2;            // squares a second
    const fx = 0.1 + frac(s * 7.31) * 0.8;
    const fy = frac(s * 3.7 + t * speed);
    const len = 0.22 + s * 0.12;
    out.push({ x0: fx, y0: fy - len, x1: fx - len * 0.35, y1: fy });
  }
  return out;
}

// A slow swell between 0 and 1: smoke thickening and thinning.
export function drift(x, y, t, period = 6) {
  const s = seedOf(x, y, 11);
  return 0.5 + 0.5 * Math.sin((t / period + s) * Math.PI * 2);
}

/* A flame's or a failing lumen's flicker, between 0 and 1: three waves of
   different speed added, which never settles into a beat the way one does. */
export function flicker(x, y, t) {
  const s = seedOf(x, y, 23);
  const v = Math.sin(t * 7.1 + s * 6.3) * 0.5 + Math.sin(t * 12.7 + s * 2.1) * 0.3 + Math.sin(t * 2.3 + s * 4.7) * 0.2;
  return Math.max(0, Math.min(1, 0.5 + v * 0.5));
}

/* Live current: an arc across the square now and then, never all the time.
   Null between arcs; otherwise a jagged line of points, in fractions of the
   square. The arc moves each tenth of a second. */
export function sparkArc(x, y, t) {
  const tick = Math.floor(t * 10);
  const s = seedOf(x, y, tick);
  if (s > 0.35) return null;
  const pts = [];
  const steps = 5;
  const y0 = 0.2 + seedOf(x, y, tick + 1) * 0.6;
  for (let i = 0; i <= steps; i++) {
    pts.push({ x: 0.1 + (0.8 * i) / steps, y: Math.max(0.05, Math.min(0.95, y0 + (seedOf(x + i, y, tick + 2) - 0.5) * 0.35)) });
  }
  return pts;
}

// How far along a chevron of rushing air has travelled, 0 to 1, so a breach
// visibly pulls rather than showing a still arrow.
export const rush = (t, speed = 1.5) => frac(t * speed);
