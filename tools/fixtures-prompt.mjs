/* Prints the prompt for the FIXTURES sheet, ready to paste into an image model.

     node tools/fixtures-prompt.mjs
     node tools/fixtures-prompt.mjs "a flooded cargo hold, rusted plate"
     node tools/fixtures-prompt.mjs --environment ice --condition frozen

   The sheet is sixteen pieces of equipment (terminals, a turret, a vent, a
   shrine, fuel tanks, the warp, an airlock, a breach, radiation, dead gravity
   and a boarding torpedo) in one 4x4 image. See "The fixtures sheet" in
   TEXTURES.md for what to do with the picture. The prompt itself lives in
   lib/mapprompt.js and is checked against the slicer by mapprompt.check.mjs,
   so this prints what the app will use and cannot drift from it. */
import { buildFixturesPrompt } from '../lib/mapprompt.js';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : undefined;
};
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
console.log(buildFixturesPrompt({
  describe: positional.join(' ') || undefined,
  environment: flag('environment'),
  condition: flag('condition')
}));
