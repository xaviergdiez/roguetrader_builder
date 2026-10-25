import assert from 'node:assert/strict';
import { tallySession, suggestXp, diaryEntry, ENCOUNTER_XP } from './sessionlog.js';

const log = [
  { event: 'npc_damage', charId: 'c1', attack: 'melee', hit: true },
  { event: 'npc_damage', actor: 'c2', charId: null, attack: 'ranged', hit: true },
  { event: 'npc_damage', charId: 'c2', attack: 'ranged', hit: false },
  { event: 'player_melee', charId: 'c1' },
  { event: 'player_fired', charId: 'c1' },
  { event: 'psychic_power', charId: 'c2' },
  { event: 'ground_advance' },
  { event: 'npc_damage' }
];
const t = tallySession(log, { survivors: ['c1', 'c2'], objectiveChars: ['c2'] });
assert.deepEqual(t.c1, { fought: 2, wounded: 1, fired: 1, survived: 1 });
assert.deepEqual(t.c2, { fired: 2, wounded: 1, psychic: 1, survived: 1, objective: 1 });
assert.equal(Object.keys(t).length, 2, 'unattributed events are ignored');

// RT p.291
assert.equal(ENCOUNTER_XP.easy, 50);
assert.equal(ENCOUNTER_XP['very hard'], 250);
assert.equal(suggestXp({}).total, 500);
assert.equal(suggestXp({ hours: 2 }).total, 250, 'shorter sessions scale');
assert.equal(suggestXp({ hours: 8 }).total, 1000);
assert.equal(suggestXp({ method: 'detailed', encounters: ['Easy', 'Hard', 'Average'] }).total, 50 + 200 + 130);
assert.equal(suggestXp({ roleplaying: 900 }).total, 1000, 'roleplaying capped at 500');
assert.equal(suggestXp({ roleplaying: 100 }).total, 600);
assert.equal(suggestXp({}).suggestion, true);

const d = diaryEntry(t, { c1: 'Grak' }, { title: 'The Cloud-Fane', xp: suggestXp({}) });
assert.match(d, /The Cloud-Fane \(suggested XP: 500 each\)/);
assert.match(d, /Grak: Survived, Fired a weapon, Fought in melee x2, Wounded an enemy/);

console.log('sessionlog.check.mjs: all assertions passed');
