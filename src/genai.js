/* GENERATED ART for the maps, from the browser's side: a whole picture to lie
   under a deck or the void chart, that picture brought to life as a looping
   clip, and the void chart's own sheet of tokens. The prompts are built on the
   server (lib/mapprompt.js), the clip is made there too (api/generate-video.js);
   what is here is what only the browser can do: ask in the map's own shape,
   cut the picture to a shape the video model makes, follow a clip that takes a
   minute, and put the parts back together. */

import { nearestAspect, VIDEO_ASPECTS, aspectRatio } from '../lib/mapprompt.js';
import { keyCells, voidKeyOptions, VOID_SLOTS } from './spritesheet.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function failed(res) {
  let why = res.status === 401 ? 'Sign in to generate.' : `Generation failed (${res.status})`;
  try { why = (await res.json()).error || why; } catch { /* not json */ }
  return new Error(why);
}

async function post(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw await failed(res);
  return res;
}

function decode(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That picture would not open.')); };
    img.src = url;
  });
}

const canvasBlob = (c, type, quality) => new Promise((resolve, reject) =>
  c.toBlob((b) => (b ? resolve(b) : reject(new Error('The browser would not encode it.'))), type, quality));

/* A picture for under a map, in the map's own shape (the nearest the model
   makes): `cols` by `rows` squares or VU. A File, so it goes down the same
   road as one the GM chose from disk. */
export async function generatePicture({ target, describe = '', environment = '', cols, rows }) {
  const aspect = nearestAspect(cols, rows);
  const res = await post('/api/generate-texture', { kind: 'backdrop', target, describe, environment, aspect });
  const blob = await res.blob();
  const type = blob.type || 'image/png';
  const ext = /jpe?g/.test(type) ? 'jpg' : /webp/.test(type) ? 'webp' : 'png';
  return new File([blob], `${target === 'void' ? 'Generated sky' : 'Generated floor'}.${ext}`, { type });
}

/* The picture cut to a shape the video model makes (16:9 or 9:16, whichever
   is nearer), from its middle, at 720p. Answers the frame as base64 and
   which part of the picture it is, as fractions, so the clip can be laid over
   exactly the part that moves. */
export async function framedForVideo(blob) {
  const img = await decode(blob);
  const w = img.naturalWidth, h = img.naturalHeight;
  const aspect = nearestAspect(w, h, VIDEO_ASPECTS);
  const r = aspectRatio(aspect);
  let cw = w, ch = h;
  if (w / h > r) cw = h * r; else ch = w / r;
  const cx = (w - cw) / 2, cy = (h - ch) / 2;
  const c = document.createElement('canvas');
  c.width = aspect === '16:9' ? 1280 : 720;
  c.height = aspect === '16:9' ? 720 : 1280;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, cx, cy, cw, ch, 0, 0, c.width, c.height);
  const jpeg = await canvasBlob(c, 'image/jpeg', 0.88);
  const data = await new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).replace(/^data:[^,]*,/, ''));
    fr.readAsDataURL(jpeg);
  });
  return { data, aspect, crop: { fx: cx / w, fy: cy / h, fw: cw / w, fh: ch / h } };
}

// Where a clip made from part of a picture lies: over that part.
export const placeOver = (b, crop) => ({
  x: b.x + crop.fx * b.w, y: b.y + crop.fy * b.h, w: crop.fw * b.w, h: crop.fh * b.h
});

/* The picture, moving. Starts the clip, asks after it every five seconds
   (`onStatus` hears how long it has been), and fetches it in parts when it is
   done. Ten minutes and it gives up asking: the clip may still be made, and
   is lost, which is said. */
export const VIDEO_WAIT_MS = 10 * 60 * 1000;
export async function animatePicture({ blob, target, describe = '', onStatus = () => {} }) {
  onStatus('Sending the picture…');
  const framed = await framedForVideo(blob);
  const { id } = await (await post('/api/generate-video', {
    action: 'start', target, describe, image: framed.data, mime: 'image/jpeg', aspect: framed.aspect
  })).json();
  const t0 = Date.now();
  for (;;) {
    await sleep(5000);
    const st = await (await post('/api/generate-video', { action: 'poll', id })).json();
    if (st.status === 'failed') throw new Error(st.error || 'The clip could not be made.');
    if (st.status === 'completed') {
      const parts = [];
      for (let n = 0; n < st.parts; n++) {
        onStatus(`Fetching the clip (${n + 1} of ${st.parts})…`);
        parts.push(await (await post('/api/generate-video', { action: 'part', id, n })).arrayBuffer());
      }
      const type = st.mime || 'video/mp4';
      return { file: new File(parts, `${target === 'void' ? 'Generated sky' : 'Generated floor'}, moving.mp4`, { type }), crop: framed.crop };
    }
    const secs = Math.round((Date.now() - t0) / 1000);
    onStatus(`Making the clip… ${secs}s (usually under a minute)`);
    if (Date.now() - t0 > VIDEO_WAIT_MS) throw new Error('The clip took too long and was given up on. Try again later.');
  }
}

/* A new sheet of void tokens, keyed here the way the stock set was keyed on a
   desktop (tools/slice-sprites.mjs), cell by cell, and kept as one WebP of
   384px cells, the stock set's size. */
export async function generateVoidSet(describe = '') {
  const res = await post('/api/generate-texture', { kind: 'void_sprites', describe });
  const img = await decode(await res.blob());
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const full = document.createElement('canvas');
  full.width = side; full.height = side;
  const fg = full.getContext('2d', { willReadFrequently: true });
  fg.drawImage(img, 0, 0, side, side, 0, 0, side, side);
  const px = fg.getImageData(0, 0, side, side);
  keyCells(px.data, side, side, (i) => voidKeyOptions(VOID_SLOTS[i].role));
  fg.putImageData(px, 0, 0);
  const out = document.createElement('canvas');
  out.width = Math.min(1536, side); out.height = out.width;
  const og = out.getContext('2d');
  og.imageSmoothingQuality = 'high';
  og.drawImage(full, 0, 0, out.width, out.height);
  return canvasBlob(out, 'image/webp', 0.86);
}
