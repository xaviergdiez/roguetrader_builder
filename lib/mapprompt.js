// Builds the battle-map floor-texture prompt.
//
// The GM describes the ground in their own words; the FIXED clauses below are
// wrapped around that description, never replaced by it. So the thing that
// keeps the set coherent is still enforced here in code — flat top-down,
// evenly lit, no grid of its own, mid values, nothing that must stay upright
// (see TEXTURES.md) — while what is ON the ground is theirs to say.
//
// A NOTE ON WHAT THIS GIVES UP. The portrait endpoint next door assembles its
// prompt entirely from the character sheet, so a signed-in caller cannot turn
// the owner's Gemini key into a general-purpose image generator. Accepting a
// description gives that up: the wrapper constrains the SHOT, not the
// subject. It is behind sign-in and the description is length-capped, which
// is the limit of what can be done here — the real control is
// OWNER_EMAIL, so that signing in is not open to the world.
//
// The environment and condition lists are kept as starting points: they fill
// the box rather than restrict it.
//
// Pure, and outside /api so Vercel does not count it against the function cap.
// See mapprompt.check.mjs.

const E = (id, name, surface, detail) => ({ id, name, surface, detail });

export const ENVIRONMENTS = [
  E('jungle', 'Death world jungle',
    'dense equatorial jungle floor, wet leaf litter over dark soil',
    'strangling roots, rotting fronds, standing water, creeper vines over a broken rockcrete slab'),
  E('desert', 'Desert waste',
    'wind-scoured desert hardpan and drift sand',
    'ridged dunes, cracked pan, half-buried ferrocrete debris, dust drifted over an old roadway'),
  E('ice', 'Ice shelf',
    'glacial ice sheet over frozen rock',
    'pressure ridges, meltwater refrozen in sheets, snow drifted in the lee of buried wreckage'),
  E('hive', 'Hive underlevels',
    'hive-bottom street level, stained rockcrete and riveted steel plate',
    'drainage grates, pipework, fused cabling, refuse packed into the gutters, hazard striping'),
  E('ship', 'Voidship deck',
    'the armoured deck plating of an Imperial voidship',
    'oversized rivets, mismatched replacement panels, brass inlay, stencilled litanies worn illegible'),
  E('ash', 'Ash waste',
    'volcanic ash waste, fine grey drift over fractured basalt',
    'wind-carved ripples, slag clinker, the rusted ribs of something that broke down and was left'),
  E('cave', 'Cavern floor',
    'a natural rock cavern floor, damp and uneven',
    'flowstone, rubble, mineral staining, pooled water in the low ground'),
  E('marsh', 'Fen and marsh',
    'brackish marsh, peat and standing water',
    'reed beds, sunken timber, algal scum, a half-submerged ferrocrete footing'),
  E('agri', 'Agri-world ground',
    'ploughed agri-world soil in worked rows',
    'crop stubble, irrigation channels, tractor ruts baked hard, blight at the margins'),
  E('forge', 'Forge-world floor',
    'a forge-world manufactorum floor, oil-dark and scarred',
    'swarf and cable runs, inspection plates, coolant staining, scorch marks around a machine footing'),
  E('tundra', 'Frozen tundra',
    'frozen tundra, hard ground under thin snow',
    'frost-heaved stone, dead scrub, wind-scoured ice in the hollows'),
  E('ruin', 'Ruined settlement',
    'the rubble-strewn floor of a bombed-out settlement',
    'shattered rockcrete, twisted rebar, broken glass, drifts of pulverised masonry')
];

export const environmentById = (id) =>
  ENVIRONMENTS.find((e) => e.id === id) || null;

const C = (id, name, phrase) => ({ id, name, phrase });

// Conditions are additive weather and damage, not new environments. Each has
// to make sense on any of the surfaces above, or the two combine into
// something the model cannot picture.
export const CONDITIONS = [
  C('none', 'As it stands', ''),
  C('flooded', 'Flooded', 'standing water pooled across it, reflecting flat grey light'),
  C('burning', 'Burnt over', 'scorched and burnt over, ash and charred debris, heat-cracked ground'),
  C('overgrown', 'Overgrown', 'reclaimed by growth, roots and creeper forcing through every seam'),
  C('frozen', 'Frozen over', 'glazed in ice, snow packed into every hollow'),
  C('battle', 'Fought over', 'cratered and shell-torn, spent casings and blast scarring'),
  C('derelict', 'Long abandoned', 'dust-layered and undisturbed, everything settled and still'),
  C('irradiated', 'Irradiated', 'chemically bleached and stained, nothing living on it')
];

export const conditionById = (id) =>
  CONDITIONS.find((c) => c.id === id) || null;

/* The fixed part. Every clause here earns its place against a real failure:

   - "top-down orthographic", "no perspective": it is a floor. A floor shot at
     an angle tiles into a floor that leans.
   - "seamless tiling": it repeats across the whole deck.
   - "even flat lighting, no cast shadows, no highlights": a bright spot
     repeats and reads as a lighting fault rather than as the ground.
   - "no grid": the app draws the grid, calibrated to the table. A texture
     with its own grid fights it and the two will never line up.
   - "no text, no logos, no insignia": lettering tiles into an obvious repeat
     and hands the eye a grid of its own.
   - "mid-tone values": tokens, templates and the grid are drawn over this.
     Pure black loses the walls, pure white glares on a projector. */
/* The fixed parts, and the ORDER is the point. The portrait prompt next door
   leads with the medium and the quality — "A cinematic, highly detailed
   photorealistic render in the grimdark aesthetic of Warhammer 40,000" — and
   only then says what is in the picture. An earlier version of this file led
   with "top-down orthographic floor texture" and left "photorealistic" to the
   very end, after a run of negations; what came back was illustration, not
   photography. Medium first.

   Every clause after the subject earns its place against a real failure:

   - shot straight down, no perspective, no horizon: it is a floor. A floor
     photographed at an angle tiles into a floor that leans.
   - seamless tiling: it repeats across the whole deck.
   - flat even light, no cast shadows, no highlights: a bright spot repeats
     and reads as a lighting fault rather than as the ground.
   - no grid: the app draws the grid, calibrated to the table. A texture with
     its own grid fights it and the two will never line up.
   - no text, no logos, no insignia: lettering tiles into an obvious repeat
     and hands the eye a grid of its own.
   - mid-tone values: tokens, templates and the grid are drawn over this.
     Pure black loses the walls, pure white glares on a projector.
   - no figures: a battle map is where the miniatures stand. */
const LEAD =
  'A photorealistic, highly detailed overhead photograph of ground, in the grimdark '
  + 'aesthetic of Warhammer 40,000.';

const TAIL = [
  'Physically based materials with fine surface grain and real depth: lived-in,'
  + ' over-built, worn by use and repair rather than by ruin',
  'drab desaturated palette with at most a single hazard-orange or warning-red accent',
  'shot straight down from directly overhead, flat even light, no cast shadows,'
  + ' no highlights, no vignette, seamless tiling',
  'mid-tone values, nothing pure black and nothing pure white',
  'photographic, not illustrated, not painted, not rendered as game art',
  'No text, no lettering, no logos, no insignia, no grid lines, no perspective,'
  + ' no horizon, no figures, no watermark, no border. Square 1:1 image.'
];

export const MAX_DESCRIBE = 600;

const clean = (v) => String(v == null ? '' : v)
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, MAX_DESCRIBE);

/* Takes either a free description, or an environment/condition pair, or both.
   The description leads, because it is the specific thing the GM asked for;
   the list entries fill in behind it when they were used. */
/* ---- the props that stand on that ground ----

   Sixteen tokens — doors, cover, hazards, foliage — asked for as ONE 4x4
   sheet rather than sixteen calls. Three reasons, in order of how much they
   matter:

   1. They have to match each other. Generated separately the crates come back
      in a different light, a different degree of wear and a slightly
      different palette from the pillar beside them, and a deck dressed in
      them looks like a collage. In one image the model is composing a set.
   2. They have to match the floor. The ground's own description is repeated
      here, so the props are of the same place as the surface they stand on.
   3. One image is one call.

   THE ORDER IS LOAD-BEARING. The app slices this sheet by position — cell 0
   is the closed door, cell 4 the crates — so SHEET_SLOTS below must stay in
   step with SPRITE_SLOTS in src/spritesheet.js. They are checked against each
   other in mapprompt.check.mjs; if the lists ever disagree the app cuts the
   fire out of the cell holding the pillar, and nothing else would catch it. */
const SHEET_SLOTS = [
  ['door_closed', 'a heavy closed door, both leaves shut, seen from directly above'],
  ['door_open', 'the same doorway standing open: only the frame and the open threshold,'
    + ' the opening itself empty black so the floor shows through it'],
  ['hatch', 'a small round or octagonal access hatch set flush, closed'],
  ['barrier', 'a low barrier or railing about waist height, running across the cell,'
    + ' the kind a soldier crouches behind and shoots over'],
  ['crates', 'a stack of cargo crates and containers, piled head-high'],
  ['machinery', 'a bank of machinery: pipework, cogitator housings, loose hull plate'],
  ['pillar', 'a single structural pillar or column, massive, part of the building'],
  ['fire', 'an open fire burning on the ground, flame and glowing embers'],
  ['gas', 'a drifting cloud of toxic gas, coloured and semi-transparent'],
  ['energy', 'arcing electrical discharge, raw current over the ground'],
  ['smoke', 'a bank of thick grey smoke, soft-edged and semi-transparent'],
  ['scrub', 'sparse low scrub and small plants, scattered, mostly bare ground between'],
  ['thicket', 'a dense thicket of tall plants, thick enough to hide a man'],
  ['tangle', 'a tangle of creeper and vine across the ground'],
  ['grate', 'a floor grating or vent set into the ground, seen from above'],
  ['wall_low', 'a low broken wall or bench, chest height, running across the cell']
];

export const SHEET_SLOT_ROLES = SHEET_SLOTS.map(([role]) => role);

/* The master token style. The GM's own words, kept verbatim as the fixed
   wrapper, because the sheets that already ship were generated with it and a
   generated set has to sit beside them without looking generated:

     - 100% orthographic 90-degree top-down, which is the only angle that can
       be dropped onto a square of a battle map.
     - photoreal render, hyper-detailed materials, grimdark 40K, battle-worn,
       rim lighting.
     - pitch-black background, which is what makes the token cuttable: the app
       turns that black into transparency (see src/spritesheet.js).
     - NO token frame, coin border, medallion ring or miniature base. Every
       one of those is a thing image models add unasked to anything called a
       "token", and every one of them is a ring of plastic around a crate.
     - no perspective tilt, no isometric, no front-facing portrait, no cartoon
       or pixel art. */
const SHEET_STYLE = [
  'A 4x4 grid of 16 separate objects on one square image, each object centred in its'
  + ' own cell with even spacing, every cell filled, no object touching another',
  '100% orthographic 90-degree top-down overhead view of each object, as laid on a'
  + ' tabletop battle map',
  'photorealistic 3D render, hyper-detailed physically based materials, 4K texture'
  + ' detail, grimdark Warhammer 40,000, battle-worn and over-built, specular metallic'
  + ' highlights, dramatic rim lighting',
  'every object isolated on a seamless solid pitch-black background, pure #000000,'
  + ' with no shadow cast onto the background',
  'No circular token frame, no coin border, no medallion ring, no plastic miniature'
  + ' base, no disc base, no cell borders, no grid lines, no dividing lines between'
  + ' cells, no text, no lettering, no numbering, no watermark.',
  'No 3D perspective tilt, no isometric angle, no front-facing or side-on view —'
  + ' every object must be seen from 100% directly overhead.',
  'Not 2D cartoon art, not pixel art, not low-poly, not anime illustration.'
];

/* The same description the floor was made from, so the props belong to it. */
export function buildSpritesPrompt(input) {
  const src = input && typeof input === 'object' ? input : {};
  const describe = clean(src.describe);
  const env = environmentById(src.environment);
  const cond = conditionById(src.condition);

  const place = describe || (env ? `${env.surface}, ${env.detail}` : null)
    || `${ENVIRONMENTS[0].surface}, ${ENVIRONMENTS[0].detail}`;

  const setting = [
    `Every object belongs to this place and is built of its materials: ${place}`,
    cond && cond.phrase ? cond.phrase : null
  ].filter(Boolean).join(', ') + '.';

  const list = 'Reading left to right, top to bottom, the sixteen cells are: '
    + SHEET_SLOTS.map(([, text], i) => `(${i + 1}) ${text}`).join('; ') + '.';

  return [SHEET_STYLE[0] + '.', setting, list, SHEET_STYLE.slice(1, 4).join(', ') + '.',
    ...SHEET_STYLE.slice(4)].join(' ');
}

export function buildTexturePrompt(input) {
  const src = input && typeof input === 'object' ? input : {};
  const describe = clean(src.describe);
  const cover = clean(src.cover);
  const env = environmentById(src.environment);
  const cond = conditionById(src.condition);

  // Nothing said at all still produces a usable floor rather than billing for
  // an empty request.
  const ground = describe || (env ? `${env.surface}, ${env.detail}` : null)
    || `${ENVIRONMENTS[0].surface}, ${ENVIRONMENTS[0].detail}`;

  const subject = [
    `The ground is ${ground}`,
    cover ? `scattered across it: ${cover}` : null,
    // 'none' carries an empty phrase and drops out rather than adding a comma.
    cond && cond.phrase ? cond.phrase : null
  ].filter(Boolean).join(', ') + '.';

  // The prohibitions are their own sentence; run into the list with a comma
  // they read as a mid-sentence aside and get weighted like one.
  const body = TAIL.slice(0, -1).join(', ') + '.';
  return [LEAD, subject, body, TAIL[TAIL.length - 1]].join(' ');
}
