// Self-check for the skill/talent/power glossary. Run: node src/glossary.check.mjs
import assert from 'node:assert/strict';
import { SKILLS, TALENTS, MISC, POWERS, GLOSSARY, explainEntry, charGroup } from './glossary.js';
import { CAREER_ADVANCES } from './advances.js';

/* ---- basic lookups ---- */

assert.match(explainEntry('Dodge').body, /Reaction/);
assert.equal(explainEntry('Dodge (Ag)').char, 'Ag');
assert.equal(explainEntry('Common Lore (Imperium) (Int)').spec, 'Imperium');
assert.equal(explainEntry('Common Lore (Imperium) (Int)').body, GLOSSARY['Common Lore']);
assert.equal(explainEntry('Nonsense Made Up Thing').body, null);

// "Name: effect" traits carry their own inline body and skip the glossary.
const trait = explainEntry('Made Up Trait: does a made up thing.');
assert.equal(trait.title, 'Made Up Trait');
assert.equal(trait.body, 'does a made up thing.');

assert.equal(charGroup('WS'), 'phys');
assert.equal(charGroup('Int'), 'mind');
assert.equal(charGroup(''), null);

/* ---- every Power-type advance resolves to a real description ----
   describePower() (psychic.js) already self-describes a psychic discipline's
   basic technique or named technique; anything else it returns unchanged, so
   the glossary is what makes it expandable in the Powers tab. A Navigator's
   Warp Eye Powers and Astropath's Astral Telepathy fall into that second
   case — this check means a future Power-type advance added without a
   matching POWERS entry fails loudly instead of silently un-expanding. */

const CHAR_TAG = /\s*\((WS|BS|S|T|Ag|Int|Per|WP|Fel)\)\s*$/;
const baseNameOf = (entry) => {
  const stripped = entry.replace(CHAR_TAG, '').trim();
  const paren = stripped.match(/^([^(]+)\((.*)\)$/);
  return (paren ? paren[1] : stripped).trim();
};

// Names describePower() already handles via the psychic disciplines — these
// legitimately have no glossary entry of their own.
const SELF_DESCRIBING = new Set([
  'Thought Sending', 'Aura Reading', 'Holocaust / Incinerate', 'Invigorate', 'Telekinetic Force',
  'Mind Link', 'Mind Probe', 'Psychic Scream', 'Compel', 'Telepathic Jamming',
  'Prescience', 'Invocations of the Warp', 'Scrying', 'Psychic Sight',
  'Spontaneous Combustion', 'Fire Shield', 'Wall of Fire',
  'Iron Arm', 'Warp Speed', 'Regeneration', 'Enfeeble',
  'Psychic Crush', 'Force Bolt', 'Deflect Missiles',
]);

let checked = 0;
for (const ranks of Object.values(CAREER_ADVANCES)) {
  for (const list of Object.values(ranks)) {
    for (const a of list) {
      if (a.type !== 'Power') continue;
      const base = baseNameOf(a.name);
      if (SELF_DESCRIBING.has(base)) continue;
      assert.ok(explainEntry(a.name).body, `Power "${a.name}" (base "${base}") has no glossary entry`);
      checked++;
    }
  }
}
assert.ok(checked >= 18, `expected to check at least 18 non-self-describing Power advances, checked ${checked}`);

/* ---- POWERS entries are keyed by base name, no stray tier suffixes ---- */

for (const key of Object.keys(POWERS)) {
  assert.doesNotMatch(key, /\((Novice|Adept|Master)\)/,
    `POWERS key "${key}" should be the base name — the tier is stripped and shown as spec`);
}

console.log('glossary.js OK (%d skills, %d talents, %d misc, %d powers, %d Power-advances checked)',
  Object.keys(SKILLS).length, Object.keys(TALENTS).length, Object.keys(MISC).length,
  Object.keys(POWERS).length, checked);
