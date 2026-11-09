/* Prints the prompt for a ground's PROP sheet, ready to paste into an image model.

     node tools/props-prompt.mjs <theme-id>          # e.g. enginarium
     node tools/props-prompt.mjs                     # lists the grounds still borrowing

   Sixteen props (doors, a hatch, barriers, crates, machinery, a pillar, fire,
   gas, current, smoke, foliage, a grate, a low wall) in one 4x4 image, made of
   the ground's own materials so they belong on it. Save what comes back as
   art/sprites/<Sheet>_sprite.jpg (the sheet name is SHEET_FOR_THEME in
   src/spritesheet.js), run tools/slice-sprites.mjs, and take the ground out of
   TOKENS_BORROWED. The prompt is the app's own (buildSpritesPrompt in
   lib/mapprompt.js), so this prints what the in-app generator would ask. */
import { buildSpritesPrompt } from '../lib/mapprompt.js';
import { MAP_THEMES } from '../src/battlemap.js';
import { SHEET_FOR_THEME, TOKENS_BORROWED } from '../src/spritesheet.js';

const id = process.argv[2];
const theme = MAP_THEMES.find((t) => t.id === id);
if (!theme) {
  console.log('Grounds still wearing another’s props, and their sheet files:');
  for (const [t, lender] of Object.entries(TOKENS_BORROWED)) {
    console.log(`  ${t.padEnd(16)} (borrows ${lender})  ->  art/sprites/${SHEET_FOR_THEME[t]}_sprite.jpg`);
  }
  process.exit(id ? 1 : 0);
}
console.log(buildSpritesPrompt({ describe: `${theme.subtitle.toLowerCase()}; ${theme.desc.replace(/[.\s]+$/, "")}` }));
