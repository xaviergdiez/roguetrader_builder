# Battle map textures

How a generated image becomes a map theme, and what it has to look like to
belong beside the ones already there.

A theme is one floor texture plus five numbers. The texture is a tiling image
of the **ground seen from directly above**; the numbers say how the app draws
over it.

---

## Two ways in

**From inside the app**, which is the one a GM uses: **Ground** on the battle
map's toolbar opens a window. Describe the ground and the terrain and cover on
it in your own words, **Generate**, and judge the result in the preview — which
is tiled 2x2 on purpose, because a floor is judged on how it repeats and a
single copy hides every seam. **Generate again** until it is right, then name
it and **Save to my grounds**: it joins the ground picker beside the nine built
in, and this deck switches to it.

Nothing is written to the deck until you save, because the first attempt is
rarely the one you keep. **Try it on this deck** puts a preview on the map
without saving it.

It goes through `/api/generate-texture` — the same Gemini key and the same
shape as the portrait endpoint — and the result is shrunk client-side and kept
on the saved record as a data URL. No build, no deploy: a fen generated for
tonight is usable tonight.

**The fixed clauses are wrapped around your description, never replaced by
it.** `lib/mapprompt.js` adds the shot, the lighting, the palette and the
prohibitions; what is ON the ground is yours to say. So the rules below are
still enforced in code rather than left to whoever is typing.

What that gives up, stated plainly: the portrait endpoint next door builds its
prompt entirely from the character sheet, so a signed-in caller cannot turn the
owner's Gemini key into a general-purpose image generator. Accepting a
description gives that up — the wrapper constrains the shot, not the subject.
Sign-in and a 600-character cap are the limit of what the code can do about it;
the real control is setting `OWNER_EMAIL`, so signing in is not open to anyone.

**The five numbers are read off the image.** A GM who just described a ground
should not then be asked for a grid colour and a wash, so `themeNumbersFor()`
derives them from the generated floor's average — a dark grid on a bright
floor and a pale one on a dark floor, less knock-back where the deck is
already bright. Switch theme afterwards if you want a built-in's numbers
instead.

**From the command line**, for a texture that is to ship with the app as one
of the built-in themes:

## The pipeline

1. **Generate** a 1024² or larger square image, using the prompt skeleton
   below.
2. **Install it.** `scripts/add-map-texture.sh <image> <theme-id> [crop-px]`
   — resamples to 1024, encodes at q85, writes `public/maps/<theme-id>.jpg`.
   The third argument trims the bottom, which is where generators put their
   watermark. Tiled, one watermark becomes a grid of them.
3. **Register the theme** in `src/battlemap.js`, in `MAP_THEMES`.
4. **`node src/battlemap.check.mjs`.** It fails if the file is missing, under
   20KB, or over 900KB.

### Why 1024 and not more

The texture *tiles*. At a normal px/square a 1024 tile already covers the
whole canvas once, and what a 2048 version buys is sub-panel detail and
label text — decor on a floor that then gets a wash and a grid drawn over
it. It would be paid for on every session load, by a GM who is usually
projecting over someone else's wifi. 1024/q85 lands at 300–480KB, which is
where every deck in the set sits.

---

## What the image has to be

- **Top-down, flat, no perspective.** It is a floor. A photograph taken at an
  angle tiles into a floor that leans.
- **Evenly lit.** A bright spot or a cast shadow repeats across the deck and
  reads as a lighting fault rather than as the floor.
- **No grid.** The app draws the grid, calibrated to the table. A texture
  with its own grid fights it and the two will never line up.
- **Busy at panel scale, quiet at square scale.** A square is ~34px on
  screen. Detail finer than that turns to noise and then to mush under the
  wash.
- **Mid values, not extremes.** Tokens, templates and the grid are drawn
  over this. Pure black loses the walls; pure white glares on a projector
  and washes out the overlays.
- **Nothing that must stay upright.** Lettering and logos tile into an
  obvious repeat and give the eye a grid of their own.

---

## The five numbers

| Field | What it is |
| :-- | :-- |
| `grid` | The grid line colour. It has to read **on the floor**, so a pale deck takes a dark line and a dark deck a bright one. |
| `accent` | The hairline along derived walls, and the cone/beam edges. Pick it out of the texture, not off a colour wheel. |
| `fallback` | The flat colour painted if the file 404s. The texture's average, roughly. |
| `wash` | How far the deck is knocked back before the grid and the overlays are drawn, 0–0.5. A dim cluttered plate takes the full `0.25`; a scrubbed bright deck takes `0.14` or it just goes grey. |
| `gridAlpha` | How hard the grid is drawn, 0.1–1. A dark line over a bright floor needs more ink than a bright line over a dim one: `0.3` for the dim decks, `0.55` for the bright station. |

Set `wash` and `gridAlpha` by looking at the thing on a map with a few rooms
stamped, not by reasoning about it. The failure mode is a grid you cannot
see from across the table.

---

## The aesthetic

Everything here is 41st-millennium, and the grimdark register is specific:
**lived-in, over-built, and indifferent to whoever is standing on it.** Not
sleek, not clean — except where cleanliness is itself the characterisation,
as with the T'au.

Shared rules, whatever the environment:

- **Human-made things are too heavy for their job.** Plate where sheet would
  do, rivets in rows, structure that is visibly stronger than it needs to be.
- **Everything is old and still in service.** Wear comes from use and
  repair, not from ruin: patches, re-welds, mismatched replacement panels.
- **Ornament is religious, not decorative.** Aquilas, skulls, litanies,
  purity seals — stamped into the structure, not applied to it.
- **Colour is drab, with one saturated note.** Rust, bone, gunmetal,
  oxidised brass, and then a single hazard orange or warning red.
- **No clean geometry on Imperial work.** Panels are irregular, seams do not
  align, nothing was laid out by a designer.

The exceptions earn their contrast. **T'au** is flat composite, soft
chamfers, clean seams and bright light — it reads as alien precisely because
nothing else in the set is maintained. **Eldar** is one continuous curved
surface, no fasteners. **Tyranid** is chitin and secretion: no straight line
anywhere.

---

## Prompt skeleton

Fill the two bracketed parts and keep the rest:

> Top-down orthographic floor texture, seamless tiling, **[SURFACE]**,
> **[DETAIL]**, Warhammer 40,000 grimdark aesthetic, heavy industrial
> gothic, worn and repaired, drab palette with a single hazard-orange
> accent, even flat lighting with no cast shadows and no highlights,
> no grid lines, no text, no logos, no perspective, photorealistic
> material detail, 1024x1024

Worked examples for the environments to come:

| Theme | SURFACE | DETAIL |
| :-- | :-- | :-- |
| Jungle | dense equatorial jungle floor, wet leaf litter over dark soil | strangling roots, rotting fronds, standing water, creeper vines over a broken rockcrete slab |
| Desert | wind-scoured desert hardpan and drift sand | ridged dunes, cracked pan, half-buried ferrocrete debris, dust over an old roadway |
| Ice | glacial ice sheet over frozen rock | pressure ridges, meltwater refrozen in sheets, snow drift in the lee of buried wreckage |
| Hive city | hive-bottom street level, stained rockcrete and steel plate | drainage grates, pipework, fused cabling, refuse packed into the gutters, flickering sodium stain |

Planetside themes are worth saying out loud: the tile and bulkhead tools
still work on them, but a "wall" there is terrain and a "bulkhead" is a
gate or a cave mouth. Nothing in the app needs changing for that — it is a
matter of what the GM calls it at the table.

---

## Overlay and terrain art

Overlay art — the blast, the cone, the shield, the beam — is **drawn in
canvas, not generated**. A template has to be whatever radius the weapon
says, and a bitmap stretched from a three-metre Blast to a sixty-metre one
goes soft exactly where the GM is reading an edge. Generated reference
images are useful to design against; see `drawBlast`, `drawShield`,
`drawCone` and `drawBeam` in `src/BattleMap.jsx` for what shipped from the
last set of references.

Cover and hazards are drawn for the same reason, and because they have to
recolour per theme.
