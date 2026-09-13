// Self-check for the background/lore builder. Run: node src/lore.check.mjs
import assert from 'node:assert/strict';
import { buildLore, loreFor } from './lore.js';

/* ---- origin clauses resolve by id and by display name ---- */

assert.match(loreFor('homeWorld', 'forge'), /sacred forges/);
assert.equal(loreFor('homeWorld', 'Forge World'), loreFor('homeWorld', 'forge'));
assert.equal(loreFor('career', 'Void-Master'), loreFor('career', 'voidmaster'));
assert.equal(loreFor('home', 'Forge World'), loreFor('homeWorld', 'forge'));

// Xenos "home worlds" and xenos careers, absent from the image-prompt table,
// resolve here.
assert.match(loreFor('homeWorld', 'Aeldari'), /craftworld/);
assert.match(loreFor('career', 'Eldar Corsair'), /craftworld's ordained path/);
assert.match(loreFor('career', "T'au Fire Warrior"), /Fire Caste infantry/);

// Unknown and empty values are distinct: nothing to say vs nothing given.
assert.equal(loreFor('homeWorld', 'Ryza'), '');
assert.equal(loreFor('homeWorld', ''), '');
assert.equal(loreFor('nonsense', 'forge'), '');

/* ---- the assembled background ---- */

const magos = buildLore({
  name: 'Magos Linus-Theta 7',
  homeWorld: 'Forge World', birthright: 'Savant', lure: 'Duty Bound',
  trials: 'Dark Voyage', motivation: 'Endurance', career: 'Explorator',
  gear: ['Power Axe', 'Hellgun', 'Servo-skull']
});

assert.match(magos, /Magos Linus-Theta 7 was raised in the sacred forges/);
assert.match(magos, /answered the Omnissiah's call/);
assert.match(magos, /ink-stained fingers/);
assert.match(magos, /oath not even the void's furthest reaches/);
assert.match(magos, /thousand-yard stare/);
assert.match(magos, /driven by little more than sheer endurance/);
assert.match(magos, /carry a Power Axe, with a Hellgun kept close at hand/);

// No gender given: defaults to they/them, grammatically plural throughout.
assert.doesNotMatch(magos, /\b(he|she|his|her|him)\b/i);

/* ---- gendered pronouns pick the right word without breaking agreement ---- */

const male = buildLore({ name: 'Kaidan', career: 'Rogue Trader', motivation: 'Pride', gender: 'Male' });
assert.match(male, /\bHe\b/);
assert.match(male, /is driven by a pride that bends/);
assert.doesNotMatch(male, /\bthey\b/i);

const female = buildLore({ name: 'Yseult', career: 'Navigator', motivation: 'Vengeance', gender: 'Female' });
assert.match(female, /\bShe\b/);
assert.match(female, /is driven by an old and patient vengeance/);
assert.doesNotMatch(female, /\bthey\b/i);

/* ---- degrades gracefully with a sparse or xenos-only identity ---- */

const bare = buildLore({});
assert.match(bare, /This adept has no recorded origin/);
assert.match(bare, /not yet settled into a fixed role/);
assert.doesNotMatch(bare, /undefined|null|\[object/);

// Xenos careers skip the human origin path (no birthright/lure/trials/motivation)
// but still produce a complete, well-formed background.
const kroot = buildLore({ name: 'Skarrow', homeWorld: 'Kroot', career: 'Kroot Mercenary' });
assert.match(kroot, /Skarrow was hatched into a Kroot warspear/);
assert.match(kroot, /contract-work for whoever paid in meat and ammunition/);
assert.doesNotMatch(kroot, /undefined|null|\[object/);

// An unrecognised career is still named rather than dropped.
assert.match(buildLore({ career: 'Xenos Savant' }), /serve the dynasty as a Xenos Savant/);
assert.match(buildLore({ career: 'Xenos Savant', gender: 'Male' }), /serves the dynasty as a Xenos Savant/);

// Two characters differing in one step produce different backgrounds.
const a = buildLore({ name: 'A', career: 'Seneschal', homeWorld: 'Hive World', motivation: 'Pride' });
const b = buildLore({ name: 'A', career: 'Seneschal', homeWorld: 'Hive World', motivation: 'Fortune' });
assert.notEqual(a, b);

console.log('lore.js OK');
