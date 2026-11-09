/* Prints the prompt for the VOID CHART's sheet, ready to paste into an image model.

     node tools/void-prompt.mjs
     node tools/void-prompt.mjs "a dying red giant, its worlds scorched, xenos ruins on the moons"

   Sixteen pictures in one 4x4 image: four kinds of world, a gas giant, a moon,
   an asteroid, a belt rock, wreckage, a station, a space hulk, an Imperial
   cruiser, a raider, a torpedo salvo, a squadron of attack craft and a warp
   rift. Save what comes back as art/sprites/Void_sprite.png (or .jpg) and run
   tools/slice-sprites.mjs; the chart draws with the cut set from then on. The
   prompt itself lives in lib/mapprompt.js and is checked against the cutter by
   mapprompt.check.mjs, so this prints what the app will use. */
import { buildVoidSpritesPrompt } from '../lib/mapprompt.js';

const describe = process.argv.slice(2).join(' ').trim();
console.log(buildVoidSpritesPrompt({ describe: describe || undefined }));
