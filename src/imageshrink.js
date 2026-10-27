/* Shrinks a generated or uploaded image to a data URL.

   Shared by the portrait plate and the battle map, which both take image
   bytes from /api and keep the result on a saved document rather than on
   disk. BattleMap.jsx cannot import this from RogueTraderBuilder.jsx —
   that file imports BattleMap, and the cycle is the kind of thing that
   works until a bundler decides otherwise. */
export async function shrinkToDataUrl(blob, max = 768, quality = 0.82) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  if (bitmap.close) bitmap.close();
  return canvas.toDataURL('image/jpeg', quality);
}

/* Prepares an uploaded image to sit beside the shipped floors: optionally
   centre-cropped square, scaled to the same 512 a generated ground is shrunk
   to, and encoded at the same quality. Returns the source size too, so the
   caller can say what it did rather than silently changing the file.

   512 is not a guess: a floor TILES, so one copy already spans a dozen
   squares at a normal zoom, and the library it is stored in has a real byte
   ceiling. */
export async function prepareTexture(blob, { max = 512, quality = 0.75, square = true } = {}) {
  const bitmap = await createImageBitmap(blob);
  const sw = bitmap.width;
  const sh = bitmap.height;

  // The middle is the part someone framed; the edges are where the letterbox
  // and the stray caption live.
  const side = Math.min(sw, sh);
  const sx = square ? Math.round((sw - side) / 2) : 0;
  const sy = square ? Math.round((sh - side) / 2) : 0;
  const cw = square ? side : sw;
  const ch = square ? side : sh;

  const scale = Math.min(1, max / Math.max(cw, ch));
  const w = Math.max(1, Math.round(cw * scale));
  const h = Math.max(1, Math.round(ch * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, sx, sy, cw, ch, 0, 0, w, h);
  if (bitmap.close) bitmap.close();

  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return { dataUrl, width: w, height: h, sourceWidth: sw, sourceHeight: sh, bytes: dataUrl.length };
}
