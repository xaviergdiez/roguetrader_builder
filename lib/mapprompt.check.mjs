// Self-check for the map-texture prompt. Run: node lib/mapprompt.check.mjs
import assert from 'node:assert/strict';
import {
  ENVIRONMENTS, CONDITIONS, environmentById, conditionById, buildTexturePrompt
, MAX_DESCRIBE, buildSpritesPrompt, SHEET_SLOT_ROLES, buildFixturesPrompt, FIXTURE_SLOT_ROLES
} from './mapprompt.js';
// The app's side of the same contract. Imported so the two orders are checked
// against each other rather than kept in step by hand.
import {
  SPRITE_ROLES, SHEET_CELLS, FIXTURE_ROLES, FIXTURE_SLOTS, fixtureRole, cellRect
} from '../src/spritesheet.js';
import { HAZARD_TYPES, MARKER_TYPES, DOOR_KINDS, COVER_TYPES, TERMINAL_STATES } from '../src/battlemap.js';

/* ---- the vocabulary is complete ---- */

{
  assert.ok(ENVIRONMENTS.length >= 10, 'a GM wants more than a handful of grounds');
  const ids = ENVIRONMENTS.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate environment id');
  for (const e of ENVIRONMENTS) {
    assert.ok(e.name, e.id + ': no display name');
    // A name alone means nothing to an image model. Every environment has to
    // carry the phrases, the same way every origin option does next door.
    assert.ok(e.surface && e.surface.length > 20, e.id + ': surface phrase too thin');
    assert.ok(e.detail && e.detail.length > 20, e.id + ': detail phrase too thin');
    assert.equal(/\bgrid\b|\btext\b|\blogo\b/i.test(e.surface + e.detail), false,
      e.id + ': an environment must not reintroduce what the fixed part forbids');
  }

  assert.ok(CONDITIONS.length >= 5);
  const cids = CONDITIONS.map((c) => c.id);
  assert.equal(new Set(cids).size, cids.length, 'duplicate condition id');
  // 'none' exists and is deliberately empty: it is the default, and it must
  // add nothing rather than adding a word that means nothing.
  const none = conditionById('none');
  assert.ok(none, "there must be a 'no condition' option");
  assert.equal(none.phrase, '');
  for (const c of CONDITIONS) {
    assert.ok(c.name, c.id + ': no display name');
    if (c.id !== 'none') assert.ok(c.phrase.length > 10, c.id + ': phrase too thin');
  }

  assert.equal(environmentById('nonsense'), null);
  assert.equal(environmentById(null), null);
  assert.equal(conditionById('nonsense'), null);
}

/* ---- the fixed part is always there ---- */

{
  // These are the clauses that make the image usable as a FLOOR rather than
  // as a picture. If a refactor drops one, the next generated texture is
  // subtly wrong in a way that only shows on a projector.
  const must = [
    'photorealistic',          // the medium, and it LEADS — see the note in mapprompt.js
    'shot straight down from directly overhead',
    'seamless tiling',
    'no grid lines',
    'No text',
    'no perspective',
    'flat even light',
    'Warhammer 40,000'
  ];
  for (const env of ENVIRONMENTS) {
    for (const cond of CONDITIONS) {
      const p = buildTexturePrompt({ environment: env.id, condition: cond.id });
      for (const clause of must) {
        assert.ok(p.includes(clause), `${env.id}/${cond.id}: lost "${clause}"`);
      }
      assert.ok(p.includes(env.surface), `${env.id}: the surface did not reach the prompt`);
      assert.ok(p.length < 1400, `${env.id}/${cond.id}: ${p.length} chars is too long to steer`);
      assert.ok(p.endsWith('.'));
      assert.equal(p.includes(', ,'), false, 'an empty clause left a hole');
    }
  }
}

/* ---- the medium leads ---- */

{
  // An earlier version led with "top-down orthographic floor texture" and left
  // "photorealistic" to the very end, after a run of negations — and what
  // came back was illustration rather than photography. The portrait prompt
  // next door leads with the medium, and this has to as well.
  const p = buildTexturePrompt({ describe: 'a cargo apron' });
  assert.ok(/^A photorealistic/.test(p), 'the prompt must open with the medium');
  assert.ok(p.indexOf('photorealistic') < p.indexOf('cargo apron'),
    'the medium comes before the subject');
  assert.ok(p.indexOf('photorealistic') < 80, 'and it is not buried');
  // And it says what it is NOT, because "game art" is the default register
  // for a 40K prompt and it is the wrong one here.
  assert.ok(p.includes('not illustrated') && p.includes('not rendered as game art'));
  // The prohibitions are their own sentence rather than a mid-sentence aside.
  assert.ok(p.includes('. No text'), 'the prohibitions should start a sentence');
}

/* ---- a described ground ---- */

{
  // The GM's words lead, and the cover goes in behind them.
  const p = buildTexturePrompt({
    describe: 'a flooded promethium refinery floor, oil slick on standing water',
    cover: 'burst drums, fallen gantry sections'
  });
  assert.ok(p.includes('flooded promethium refinery floor'));
  assert.ok(p.includes('scattered across it: burst drums'));

  // A description beats the list entries: it is the specific thing asked for.
  const both = buildTexturePrompt({ describe: 'a frozen parade ground', environment: 'jungle' });
  assert.ok(both.includes('frozen parade ground'));
  assert.equal(both.includes('jungle floor'), false, 'the list entry should not fight the description');

  // A condition still composes with a description, because it is weather
  // rather than a subject.
  const withCond = buildTexturePrompt({ describe: 'a cargo apron', condition: 'battle' });
  assert.ok(withCond.includes('cargo apron') && withCond.includes('cratered'));

  // Capped, so the fixed clauses still steer the result rather than being
  // drowned by a wall of text, and newlines pasted from elsewhere do not
  // break the prompt into pieces.
  const long = buildTexturePrompt({ describe: 'x'.repeat(5000) });
  assert.ok(long.length < 1400 + MAX_DESCRIBE, 'the description is not capped');
  assert.ok(buildTexturePrompt({ describe: 'a\n\nb\tc' }).includes('a b c'));
  assert.ok(buildTexturePrompt({ describe: '   ' }).includes(ENVIRONMENTS[0].surface),
    'blank falls back rather than billing for an empty request');

  // Unknown fields are still ignored — only describe, cover, environment
  // and condition are read.
  const ignored = buildTexturePrompt({ describe: 'a deck', style: 'oil painting', size: '512x1024' });
  assert.equal(/oil painting|512x1024/i.test(ignored), false);

  // THE CLAUSES SURVIVE A DESCRIPTION. This is what free text gives up and
  // what it does not: the GM says what is on the ground, and the shot, the
  // lighting and the prohibitions are still ours.
  for (const clause of ['photorealistic', 'seamless tiling', 'no grid lines', 'no perspective']) {
    assert.ok(p.includes(clause), 'a description displaced "' + clause + '"');
  }

  // An unknown environment falls back to a real one rather than producing a
  // promptless request that bills for nothing.
  const fallback = buildTexturePrompt({ environment: 'nonsense' });
  assert.ok(fallback.includes(ENVIRONMENTS[0].surface));
  assert.ok(buildTexturePrompt(null).length > 100);
  assert.ok(buildTexturePrompt(undefined).includes('seamless tiling'));
  assert.ok(buildTexturePrompt('a string').includes('seamless tiling'));

  // An unknown condition drops out silently; it does not become a word.
  const noCond = buildTexturePrompt({ environment: 'ice', condition: 'nonsense' });
  assert.equal(noCond, buildTexturePrompt({ environment: 'ice', condition: 'none' }));
}

/* ---- the conditions actually change the prompt ---- */

{
  const dry = buildTexturePrompt({ environment: 'ruin', condition: 'none' });
  const wet = buildTexturePrompt({ environment: 'ruin', condition: 'flooded' });
  assert.notEqual(dry, wet, 'a condition that changes nothing is a dead control');
  assert.ok(wet.includes('standing water'));
  // And they compose with every environment rather than only the obvious one.
  assert.ok(buildTexturePrompt({ environment: 'forge', condition: 'overgrown' })
    .includes('roots and creeper'));
}

/* ---- the prop sheet ----

   THE ONE THAT MATTERS is the first: the prompt asks for sixteen things in a
   fixed order and the app cuts the sheet up by position, so if these two
   lists ever drift the app draws the fire where the pillar should be. Nothing
   else would catch it — the image comes back, the cells are full, and only a
   human looking at a deck would notice the pillar is on fire. */
{
  assert.deepEqual(SHEET_SLOT_ROLES, SPRITE_ROLES,
    'the prompt asks for the cells in the order the app cuts them out');
  assert.equal(SHEET_SLOT_ROLES.length, SHEET_CELLS, 'and asks for all of them');

  const p = buildSpritesPrompt({ describe: 'a flooded cargo hold, rusted plate' });

  // The grid, which is what makes it cuttable at all.
  assert.ok(/4x4 grid of 16 separate objects/.test(p), 'it asks for the grid');
  assert.ok(/centred in its own cell/.test(p), 'and for each object to sit in its cell');
  assert.ok(/no cell borders, no grid lines/.test(p),
    'and for no drawn cell edges, which would be cut into every token');

  // The black background, which is what makes it keyable.
  assert.ok(/pitch-black background, pure #000000/.test(p), 'the keyable background');
  assert.ok(/no shadow cast onto the background/.test(p),
    'and no shadow on it, which would key into a grey smear');

  // The negatives the GM asked for by name. Every one of these is a thing an
  // image model adds unasked to anything called a token.
  for (const no of ['no circular token frame', 'no coin border', 'no medallion ring',
    'no plastic miniature base', 'no disc base']) {
    assert.ok(p.toLowerCase().includes(no), `it refuses: ${no}`);
  }
  assert.ok(/100% directly overhead/.test(p), 'and insists on straight down');
  assert.ok(/no isometric angle/i.test(p), 'and refuses isometric');

  // The ground's own description reaches the props, which is the whole point
  // of generating them from it rather than from a fixed list.
  assert.ok(p.includes('a flooded cargo hold, rusted plate'),
    'the props are built of the ground they stand on');

  // Every cell is described, and the door that must show the floor through it
  // says so: an "open" door drawn as a solid leaf is a wall.
  assert.ok(/the opening itself empty black so the floor shows through/.test(p),
    'the open doorway is asked for as an opening');

  // It behaves like the floor prompt on junk input rather than throwing.
  for (const junk of [null, undefined, 42, 'text', { describe: null }, { environment: 'nope' }]) {
    const out = buildSpritesPrompt(junk);
    assert.ok(typeof out === 'string' && out.length > 400, `junk input still builds: ${JSON.stringify(junk)}`);
    assert.ok(/4x4 grid/.test(out), 'and still asks for the grid');
  }
  // An environment with no description still places the props.
  assert.ok(buildSpritesPrompt({ environment: 'ice' }).includes('glacial ice sheet'),
    'the environment list fills in behind an empty description');
  assert.ok(buildSpritesPrompt({ environment: 'ruin', condition: 'flooded' })
    .includes('standing water'), 'and conditions carry through to the props');
  // The description is capped the same way the floor's is: this prompt is
  // built from GM text and goes to the owner's paid key.
  const long = buildSpritesPrompt({ describe: 'x'.repeat(5000) });
  assert.ok(!long.includes('x'.repeat(MAX_DESCRIBE + 1)), 'the description is capped');
}

/* ---- the fixtures sheet: the equipment the map gained after the first sixteen ----

   Same contract as the prop sheet, and checked the same way: the prompt asks
   for the cells in the order the app will cut them. */
{
  assert.deepEqual(FIXTURE_SLOT_ROLES, FIXTURE_ROLES, 'the prompt asks for the cells in the order the app cuts them');
  assert.equal(FIXTURE_SLOT_ROLES.length, SHEET_CELLS, 'and asks for all sixteen');
  assert.equal(new Set(FIXTURE_ROLES).size, SHEET_CELLS, 'no role twice');
  assert.deepEqual(FIXTURE_SLOTS.map((s) => s.slot), [...Array(SHEET_CELLS).keys()], 'slots are 0 to 15 in order');
  // the first sheet's roles are not reused: a name means one picture
  for (const r of FIXTURE_ROLES) assert.ok(!SPRITE_ROLES.includes(r), `${r} is also on the first sheet`);

  const p = buildFixturesPrompt({});
  assert.ok(/4x4 grid of 16 separate objects/.test(p) && /centred in its own cell/.test(p), 'the grid');
  assert.ok(/no cell borders, no grid lines/.test(p), 'no drawn cell edges');
  assert.ok(/pitch-black background, pure #000000/.test(p) && /no shadow cast onto the background/.test(p), 'the keyable background');
  for (const no of ['no circular token frame', 'no coin border', 'no medallion ring', 'no plastic miniature base', 'no disc base']) {
    assert.ok(p.toLowerCase().includes(no), `it refuses: ${no}`);
  }
  assert.ok(/100% directly overhead/.test(p) && /no isometric angle/i.test(p), 'straight down');
  assert.ok(/photorealistic/.test(p) && /grimdark Warhammer 40,000/.test(p), 'the same master style as the first sheet');

  // the three things this sheet says that the first did not
  assert.ok(/only the open airlock may have a pure #000000 opening/.test(p), 'only a true hole may be pure black');
  assert.ok(/never pure black/.test(p), 'every other dark is a colour, so the keyer leaves it solid');
  assert.ok(/lit by its own light and glows brightly against the black/.test(p), 'light is asked for');
  assert.ok(/every turret barrel points straight up the image/.test(p), 'a turret has a known front');
  assert.ok(/terminal screen faces the bottom/.test(p), 'and so does a terminal');

  // each element is in it, by what the GM would call it
  for (const word of ['cogitator terminal', 'sentry gun turret', 'shrine', 'crawlway', 'promethium', 'warp rift',
    'airlock', 'hull breach', 'radiation', 'gravity', 'boarding torpedo']) {
    assert.ok(p.toLowerCase().includes(word), `the sheet asks for: ${word}`);
  }
  // the three terminal screens are told apart by colour, which is the whole point of three
  assert.ok(/red glow, locked/.test(p) && /green data-glow/.test(p) && /burnt out/.test(p));
  // sixteen numbered cells, each exactly once
  for (let i = 1; i <= 16; i++) assert.ok(p.includes(`(${i}) `), `cell ${i} is numbered`);
  assert.ok(!p.includes('(17) '), 'and there is no seventeenth');
  assert.ok(p.length < 6000, 'short enough for an image model to take in: ' + p.length);

  // the place: a ship's deck unless the GM says otherwise, and the ground's own words when they do
  assert.ok(p.includes(environmentById('ship').surface), 'nothing said is a voidship deck, not the jungle');
  assert.ok(!p.includes(ENVIRONMENTS[0].surface), 'not the jungle the first sheet falls back on');
  const dressed = buildFixturesPrompt({ describe: 'a flooded cargo hold, rusted plate', condition: 'flooded' });
  assert.ok(dressed.includes('a flooded cargo hold, rusted plate'), 'the equipment is built of the ground it stands on');
  assert.ok(dressed.includes(conditionById('flooded').phrase));
  assert.ok(buildFixturesPrompt({ environment: 'ice' }).includes('glacial ice sheet'));
  assert.ok(buildFixturesPrompt({ describe: 'x'.repeat(5000) }).length < p.length + 800, 'a long description is cut');
  for (const junk of [undefined, null, 'text', 42, [], { environment: 'nope' }]) {
    const out = buildFixturesPrompt(junk);
    assert.ok(typeof out === 'string' && /4x4 grid/.test(out), `survives ${JSON.stringify(junk)}`);
  }

  // the fixtures sheet cuts with the first sheet's grid
  const r = cellRect(15, 1024);
  assert.deepEqual(r, { x: 768, y: 768, w: 256, h: 256 }, 'the same four by four');

  // turn rules that matter: nothing with a front may be turned by position
  const slot = (role) => FIXTURE_SLOTS.find((s) => s.role === role);
  for (const role of ['turret', 'turret_off', 'terminal_locked', 'terminal_open', 'terminal_dead', 'airlock_closed', 'airlock_open', 'shrine', 'torpedo_breach']) {
    assert.equal(slot(role).turn, false, `${role} has a front`);
  }
  for (const role of ['vent', 'tanks', 'rift_a', 'rift_b', 'breach', 'radiation', 'zero_g']) assert.equal(slot(role).turn, true, `${role} has none`);

  /* The app's side: every element the sheet is for gets its picture, and ids
     that no longer exist in the app cannot sit in the table unnoticed. */
  const hazards = HAZARD_TYPES.map((h) => h.id);
  const markers = MARKER_TYPES.map((m) => m.id);
  const doors = DOOR_KINDS.map((d) => d.id);
  for (const id of ['warp', 'void', 'radiation', 'zerog']) assert.ok(hazards.includes(id), `the app has a hazard ${id}`);
  for (const id of ['cogitator', 'turret', 'shrine', 'vent', 'breach']) assert.ok(markers.includes(id), `the app has a marker ${id}`);
  assert.ok(doors.includes('airlock'), 'the app has an airlock');
  assert.ok(COVER_TYPES.some((c) => c.id === 'tank'), 'and promethium tanks');
  assert.deepEqual(['locked', 'open', 'dead'], TERMINAL_STATES);
  assert.equal(fixtureRole('marker', 'cogitator', 'locked'), 'terminal_locked');
  assert.equal(fixtureRole('marker', 'cogitator', 'open'), 'terminal_open');
  assert.equal(fixtureRole('marker', 'cogitator', 'dead'), 'terminal_dead');
  assert.equal(fixtureRole('marker', 'cogitator'), 'terminal_locked', 'no state is a locked one');
  assert.equal(fixtureRole('marker', 'turret', 'active'), 'turret');
  assert.equal(fixtureRole('marker', 'turret', 'off'), 'turret_off');
  assert.equal(fixtureRole('marker', 'shrine'), 'shrine');
  assert.equal(fixtureRole('marker', 'vent'), 'vent');
  assert.equal(fixtureRole('marker', 'breach'), 'torpedo_breach');
  assert.equal(fixtureRole('marker', 'objective'), null, 'what has no picture here keeps its old one');
  assert.equal(fixtureRole('cover', 'tank'), 'tanks');
  assert.equal(fixtureRole('cover', 'crates'), null);
  assert.equal(fixtureRole('door', 'airlock', 'closed'), 'airlock_closed');
  assert.equal(fixtureRole('door', 'airlock', 'open'), 'airlock_open');
  assert.equal(fixtureRole('door', 'bulkhead', 'open'), null, 'ordinary doors stay on the first sheet');
  assert.equal(fixtureRole('hazard', 'void'), 'breach');
  assert.equal(fixtureRole('hazard', 'radiation'), 'radiation');
  assert.equal(fixtureRole('hazard', 'zerog'), 'zero_g');
  assert.equal(fixtureRole('hazard', 'fire'), null, 'fire is on the first sheet');
  // the warp alternates its two pictures by position, the same way every time
  assert.equal(fixtureRole('hazard', 'warp', null, { x: 0, y: 0 }), 'rift_a');
  assert.equal(fixtureRole('hazard', 'warp', null, { x: 1, y: 0 }), 'rift_b');
  assert.equal(fixtureRole('hazard', 'warp', null, { x: 1, y: 1 }), 'rift_a');
  assert.equal(fixtureRole('hazard', 'warp', null, { x: 4, y: 7 }), fixtureRole('hazard', 'warp', null, { x: 4, y: 7 }));
  assert.equal(fixtureRole('hazard', 'warp'), 'rift_a', 'with no square given it is still a picture');
  assert.equal(fixtureRole('nonsense', 'x'), null);
  // every role the table can return is a real cell
  const returned = new Set([
    ...['locked', 'open', 'dead'].map((s) => fixtureRole('marker', 'cogitator', s)),
    ...['active', 'off'].map((s) => fixtureRole('marker', 'turret', s)),
    ...['shrine', 'vent', 'breach'].map((id) => fixtureRole('marker', id)),
    fixtureRole('cover', 'tank'),
    ...['closed', 'open'].map((s) => fixtureRole('door', 'airlock', s)),
    fixtureRole('hazard', 'warp', null, { x: 0, y: 0 }), fixtureRole('hazard', 'warp', null, { x: 1, y: 0 }),
    ...['void', 'radiation', 'zerog'].map((id) => fixtureRole('hazard', id))
  ]);
  for (const r of returned) assert.ok(FIXTURE_ROLES.includes(r), `${r} is a cell`);
  assert.equal(returned.size, FIXTURE_ROLES.length, 'and every cell is asked for by something');
}

console.log('mapprompt.js OK (%d environments, %d conditions, %d combinations, %d prop cells)',
  ENVIRONMENTS.length, CONDITIONS.length, ENVIRONMENTS.length * CONDITIONS.length,
  SHEET_SLOT_ROLES.length);
