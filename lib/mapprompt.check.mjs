// Self-check for the map-texture prompt. Run: node lib/mapprompt.check.mjs
import assert from 'node:assert/strict';
import {
  ENVIRONMENTS, CONDITIONS, environmentById, conditionById, buildTexturePrompt
, MAX_DESCRIBE
} from './mapprompt.js';

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
    'top-down orthographic',
    'seamless tiling',
    'no grid lines',
    'no text',
    'no perspective',
    'even flat lighting',
    'Warhammer 40,000 grimdark'
  ];
  for (const env of ENVIRONMENTS) {
    for (const cond of CONDITIONS) {
      const p = buildTexturePrompt({ environment: env.id, condition: cond.id });
      for (const clause of must) {
        assert.ok(p.includes(clause), `${env.id}/${cond.id}: lost "${clause}"`);
      }
      assert.ok(p.includes(env.surface), `${env.id}: the surface did not reach the prompt`);
      assert.ok(p.length < 1200, `${env.id}/${cond.id}: ${p.length} chars is too long to steer`);
      assert.ok(p.endsWith('.'));
      assert.equal(p.includes(', ,'), false, 'an empty clause left a hole');
    }
  }
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
  assert.ok(long.length < 1200 + MAX_DESCRIBE, 'the description is not capped');
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
  for (const clause of ['top-down orthographic', 'seamless tiling', 'no grid lines', 'no perspective']) {
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

console.log('mapprompt.js OK (%d environments, %d conditions, %d combinations)',
  ENVIRONMENTS.length, CONDITIONS.length, ENVIRONMENTS.length * CONDITIONS.length);
