// Self-check for the portrait prompt builder. Run: node lib/prompt.check.mjs
import assert from 'node:assert/strict';
import { buildPrompt, phraseFor, weaponsFrom } from './prompt.js';

/* ---- origin phrases resolve by id and by display name ---- */

assert.match(phraseFor('homeWorld', 'forge'), /cathedral of forgotten logic/);
assert.equal(phraseFor('homeWorld', 'Forge World'), phraseFor('homeWorld', 'forge'));
assert.equal(phraseFor('career', 'Void-Master'), phraseFor('career', 'voidmaster'));
assert.equal(phraseFor('trials', 'The Hand of War'), phraseFor('trials', 'handofwar'));

// 'home' is the app's step id, 'homeWorld' the identity field name; both resolve
assert.equal(phraseFor('home', 'Forge World'), phraseFor('homeWorld', 'forge'));

// Option names are unique across steps, so a value still resolves when the
// caller names the wrong step. Tainted (a Lure) and Press-Ganged (a Trial) were
// both filed under the wrong step and silently lost their phrase.
assert.match(phraseFor('lure', 'Tainted'), /mutation/);
assert.match(phraseFor('trials', 'Press-Ganged'), /press-gang cuff/);
assert.equal(phraseFor('birthright', 'Tainted'), phraseFor('lure', 'Tainted'));
assert.equal(phraseFor('lure', 'Press-Ganged'), phraseFor('trials', 'Press-Ganged'));

// Unknown and empty values are distinct: nothing to say vs nothing given.
assert.equal(phraseFor('homeWorld', 'Ryza'), '');
assert.equal(phraseFor('homeWorld', ''), '');
assert.equal(phraseFor('nonsense', 'forge'), '');

/* ---- every one of the 38 options carries a phrase ---- */

// Step membership as STEPS actually declares it — six options per step, not the
// 6/7/6/5/6/8 first assumed here. scripts/audit-parse.mjs checks this against
// the app's own SHEET_CATALOG so the two cannot drift again.
const OPTIONS = {
  home: ['death', 'void', 'forge', 'hive', 'imperial', 'noble'],
  birthright: ['scavenger', 'scapegrace', 'stubjack', 'creed', 'savant', 'vaunted'],
  lure: ['tainted', 'criminal', 'renegade', 'duty', 'zealot', 'destiny'],
  trials: ['press', 'calamity', 'shiplorn', 'darkvoyage', 'vendetta', 'handofwar'],
  motivation: ['endurance', 'fortune', 'vengeance', 'renown', 'pride', 'prestige'],
  career: ['roguetrader', 'archmilitant', 'astropath', 'explorator', 'missionary',
    'navigator', 'seneschal', 'voidmaster']
};
let count = 0;
for (const [step, ids] of Object.entries(OPTIONS)) {
  for (const id of ids) {
    assert.ok(phraseFor(step, id), `${step}/${id} has no phrase`);
    count++;
  }
}
assert.equal(count, 38, 'all six origin steps are covered');

/* ---- weapons ---- */

assert.deepEqual(
  weaponsFrom(['Power Axe', 'Void Suit', 'Hellgun', 'Rations']),
  ['Power Axe', 'Hellgun']              // longest first, non-weapons dropped
);
assert.deepEqual(weaponsFrom(['Micro-bead', 'Chrono']), []);
assert.deepEqual(weaponsFrom(null), []);
assert.equal(weaponsFrom(['Axe', 'Knife', 'Sword', 'Stub Revolver']).length, 2);

/* ---- the assembled prompt ---- */

const magos = buildPrompt({
  name: 'Magos Linus-Theta 7',
  homeWorld: 'Forge World', birthright: 'Savant', lure: 'Duty Bound',
  trials: 'Dark Voyage', motivation: 'Endurance', career: 'Explorator',
  gear: ['Power Axe', 'Hellgun', 'Servo-skull']
});

assert.match(magos, /Magos Linus-Theta 7/);
assert.match(magos, /cathedral of forgotten logic/);
assert.match(magos, /Mechanicus robes/);
assert.match(magos, /Wielding a massive Power Axe, with a Hellgun slung across the back\./);
assert.match(magos, /No text, no watermark, no border, no additional figures\./);

// The four origin details all land, so two characters differing only in
// birthright get different prompts.
for (const frag of [/annotated parchment/, /oath-scroll/, /warp-bleached/, /set to the jaw/]) {
  assert.match(magos, frag);
}

// No pronouns: "they" makes image models render more than one person, and the
// app is never told the character's gender.
assert.doesNotMatch(magos, /\b(he|she|they|his|her|their|hers|them)\b/i);

/* ---- degrades without an origin path ---- */

const bare = buildPrompt({});
assert.match(bare, /a nameless Imperial explorer/);
assert.match(bare, /grimdark aesthetic/);
assert.doesNotMatch(bare, /Distinguishing details/);
assert.doesNotMatch(bare, /Wielding/);
assert.doesNotMatch(bare, /undefined|null|\[object/);

// An unknown career is still named rather than dropped.
assert.match(buildPrompt({ career: 'Xenos Savant' }), /a Xenos Savant of the Imperium/);

// Two characters differing in one step produce different prompts.
const a = buildPrompt({ name: 'A', career: 'Seneschal', homeWorld: 'hive', motivation: 'pride' });
const b = buildPrompt({ name: 'A', career: 'Seneschal', homeWorld: 'hive', motivation: 'fortune' });
assert.notEqual(a, b);

console.log('prompt.js OK');
