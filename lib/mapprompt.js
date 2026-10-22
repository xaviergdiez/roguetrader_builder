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
const FIXED = [
  'top-down orthographic floor texture, seamless tiling, photographed from directly above',
  'Warhammer 40,000 grimdark aesthetic: lived-in, over-built, worn by use and repair rather than by ruin',
  'drab desaturated palette with at most a single hazard-orange or warning-red accent',
  'even flat lighting, no cast shadows, no highlights, no vignette',
  'mid-tone values, nothing pure black and nothing pure white',
  'no grid lines, no text, no lettering, no logos, no insignia, no perspective, no horizon',
  'photorealistic material detail, square 1:1 image'
];

// Long enough for a paragraph of terrain and cover, short enough that the
// fixed clauses still steer the result rather than being drowned by it.
export const MAX_DESCRIBE = 600;

const clean = (v) => String(v == null ? '' : v)
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, MAX_DESCRIBE);

/* Takes either a free description, or an environment/condition pair, or both.
   The description leads, because it is the specific thing the GM asked for;
   the list entries fill in behind it when they were used. */
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

  const parts = [
    FIXED[0],
    ground,
    cover ? `scattered across it: ${cover}` : null,
    // 'none' carries an empty phrase and drops out rather than adding a comma.
    cond && cond.phrase ? cond.phrase : null,
    ...FIXED.slice(1)
  ];
  return parts.filter(Boolean).join(', ') + '.';
}
