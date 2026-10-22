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
