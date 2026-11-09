import { useEffect, useRef, useState } from 'react';
import { getLocalFile } from './localfiles.js';
import { VOID_SLOTS, cellRect } from './spritesheet.js';

/* The void chart's tokens, decoded for drawing (spritesheet.js says what the
   sixteen are, voidmap.js's readVoidArt which set a chart asks for).

   Each picture is kept as a canvas with the box its art fills, measured once
   here, because the art does not fill its cell the same way twice: a world is
   a disc nearly to the edge, a belt rock a speck in the middle. The chart
   sizes a picture by that box, so a planet of radius r is drawn r across
   whatever the cell around it was.

   THE STOCK SET is asked for once a page, by its set.json, and shared by every
   chart and window: a deployment without one (or a dev server that answers
   every path with the page) answers something that is not that file, and the
   chart draws as it always did. A SET THE GM GENERATED is in this browser's
   own store, a keyed sheet under the id the chart carries; one that is not on
   this computer falls back to the stock set, and says so.

   Answers { artRef, state, tick }: the pictures by role (or null to draw
   plain), 'plain' | 'loading' | 'ready' | 'none' | 'missing', and a number
   that changes when they arrive. */

const STOCK_DIR = '/maps/tokens/void/';
let stockOnce = null;

function imageFrom(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image'));
    img.src = src;
  });
}

// A canvas of the picture and the box its opaque art fills.
function measured(c) {
  const g = c.getContext('2d', { willReadFrequently: true });
  const { data } = g.getImageData(0, 0, c.width, c.height);
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (data[(y * c.width + x) * 4 + 3] > 40) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  return { c, bx: x0, by: y0, bw: x1 - x0 + 1, bh: y1 - y0 + 1, tints: new Map() };
}

function canvasOf(img, sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight) {
  const c = document.createElement('canvas');
  c.width = sw; c.height = sh;
  c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return c;
}

function loadStock() {
  if (stockOnce) return stockOnce;
  stockOnce = (async () => {
    try {
      const res = await fetch(STOCK_DIR + 'set.json', { cache: 'force-cache' });
      if (!res.ok || !/json/.test(res.headers.get('content-type') || '')) return null;
      const set = await res.json();
      const roles = Array.isArray(set.roles) ? set.roles : [];
      const out = {};
      await Promise.all(VOID_SLOTS.filter((s) => roles.includes(s.role)).map(async (s) => {
        try { const m = measured(canvasOf(await imageFrom(STOCK_DIR + s.role + '.webp'))); if (m) out[s.role] = m; } catch { /* that one draws plain */ }
      }));
      return Object.keys(out).length ? out : null;
    } catch { return null; }
  })();
  return stockOnce;
}

// A keyed sheet (already transparent: keySheet did that) cut by the void slots.
export async function cutVoidSheet(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await imageFrom(url);
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const out = {};
    for (const s of VOID_SLOTS) {
      const r = cellRect(s.slot, side, side);
      const m = measured(canvasOf(img, r.x, r.y, r.w, r.h));
      if (m) out[s.role] = m;
    }
    return out;
  } finally { URL.revokeObjectURL(url); }
}

export default function useVoidArt(art) {
  const artRef = useRef(null);
  const [state, setState] = useState('loading');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let gone = false;
    const done = (set, st) => { if (gone) return; artRef.current = set; setState(st); setTick((n) => n + 1); };
    if (art === 'plain') { done(null, 'plain'); return undefined; }
    setState('loading');
    (async () => {
      if (art && art !== 'stock') {
        try {
          const rec = await getLocalFile(art);
          if (rec && rec.blob) { done(await cutVoidSheet(rec.blob), 'ready'); return; }
        } catch { /* fall back to the stock set */ }
        const stock = await loadStock();
        done(stock, 'missing');
        return;
      }
      const stock = await loadStock();
      done(stock, stock ? 'ready' : 'none');
    })();
    return () => { gone = true; };
  }, [art]);
  return { artRef, state, tick };
}

/* A picture with a colour laid over it: the scene's colour on a gas giant or a
   rock world, so the same painted giant is ochre in one system and violet in
   the next. The light and shade stay the picture's; only the hue is laid on,
   and the art's own edge is kept. Cached on the picture, by colour. */
export function tintedArt(sp, tone, amount) {
  if (!amount || !tone) return sp.c;
  const key = `${tone}|${amount}`;
  const hit = sp.tints.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = sp.c.width; c.height = sp.c.height;
  const g = c.getContext('2d');
  g.drawImage(sp.c, 0, 0);
  g.globalCompositeOperation = 'color';
  g.globalAlpha = amount;
  g.fillStyle = tone;
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in';
  g.globalAlpha = 1;
  g.drawImage(sp.c, 0, 0);
  sp.tints.set(key, c);
  return c;
}
