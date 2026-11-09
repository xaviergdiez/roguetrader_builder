/* Installs a floor as one of the built-in grounds, after checking it tiles.

     node tools/add-floor.mjs <image> <theme-id>            # measure, install
     node tools/add-floor.mjs <image> <theme-id> --blend    # and make it wrap
     node tools/add-floor.mjs <image> --check               # measure only

   What scripts/add-map-texture.sh does (1024px, JPEG q85, public/maps/<id>.jpg),
   with what it cannot: the seam measured across both wraps (lib/seam.js), the
   edges cross-faded when asked to and the seam was worse than the image's own
   texture, and the five numbers suggested from the floor's average colour
   (themeNumbersFor in src/battlemap.js) to start the theme's entry from.
   Judge the numbers on a deck before keeping them; see TEXTURES.md. */
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { seamScores, wrapBlend, floorSample, SEAM_OK } from '../lib/seam.js';
import { themeNumbersFor } from '../src/battlemap.js';

const ROOT = resolve(import.meta.dirname, '..');
const [src, id] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const CHECK = process.argv.includes('--check');
const BLEND = process.argv.includes('--blend');
if (!src || (!id && !CHECK)) { console.error('usage: node tools/add-floor.mjs <image> <theme-id> [--blend] | <image> --check'); process.exit(2); }
if (id && !/^[a-z0-9_]+$/.test(id)) { console.error('theme id must be lower-case letters, digits and _'); process.exit(2); }

const SIZE = 1024, QUALITY = 85;
const f2 = (v) => v.toFixed(2);

// Square first, from the middle: a floor tiles, and a 4:3 photo repeats as bands.
const meta = await sharp(src).metadata();
const side = Math.min(meta.width, meta.height);
let { data, info } = await sharp(src)
  .extract({ left: Math.floor((meta.width - side) / 2), top: Math.floor((meta.height - side) / 2), width: side, height: side })
  .removeAlpha().raw().toBuffer({ resolveWithObject: true });
let w = info.width, h = info.height;
const before = seamScores(data, w, h, 3);
console.log(`${src.split('/').pop()}: ${meta.width}x${meta.height}, seams ${f2(before.ratioLR)} across, ${f2(before.ratioTB)} down (${SEAM_OK} and under tiles cleanly)`);
if (CHECK) process.exit(0);

if (BLEND && (before.ratioLR > SEAM_OK || before.ratioTB > SEAM_OK)) {
  // A band a twentieth of the tile: wide enough to hide the cliff, narrow
  // enough that the cross-fade reads as wear.
  const band = Math.round(side / 20);
  const out = wrapBlend(data, w, h, 3, { bandX: before.ratioLR > SEAM_OK ? band : 0, bandY: before.ratioTB > SEAM_OK ? band : 0 });
  data = Buffer.from(out.data.buffer, out.data.byteOffset, out.data.length); w = out.w; h = out.h;
  const after = seamScores(data, w, h, 3);
  console.log(`  blended ${band}px: seams now ${f2(after.ratioLR)} across, ${f2(after.ratioTB)} down`);
}

const jpg = await sharp(data, { raw: { width: w, height: h, channels: 3 } })
  .resize(SIZE, SIZE, { fit: 'fill', kernel: 'lanczos3' })
  .jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer();
const out = join(ROOT, 'public', 'maps', `${id}.jpg`);
await writeFile(out, jpg);
const small = await sharp(jpg).resize(256, 256).raw().toBuffer({ resolveWithObject: true });
const sample = floorSample(small.data, 256, 256, small.info.channels);
console.log(`  wrote public/maps/${id}.jpg (${Math.round(jpg.length / 1024)}KB); average ${themeNumbersFor(sample).fallback}, luminance ${Math.round(sample.luminance)}`);
console.log('  suggested numbers:', JSON.stringify(themeNumbersFor(sample)));
