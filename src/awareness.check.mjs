import assert from 'node:assert/strict';
import { SURPRISE, lightingById, opposedAwareness, noisePing, NOISE, noiseById, sightBlockedByObscuring }
  from './awareness.js';
import { SITUATION_MODIFIERS } from './groundcombat.js';

assert.equal(SURPRISE.attackBonus, 30);
assert.equal(SITUATION_MODIFIERS.find((m) => m.id === 'target_unaware').mod, 30);
assert.equal(SITUATION_MODIFIERS.find((m) => m.id === 'poor_visibility').mod, -20);
assert.equal(SITUATION_MODIFIERS.find((m) => m.id === 'bad_weather').mod, -20);
for (const p of ['clear', 'dim', 'smoke', 'rain', 'dark']) {
  for (const id of lightingById(p).situationIds) {
    assert.ok(SITUATION_MODIFIERS.find((m) => m.id === id), `${p} -> ${id} is a real modifier`);
  }
}
assert.equal(lightingById('nonsense').id, 'clear');

// opposed Awareness
assert.equal(opposedAwareness({ awareness: 40, awarenessRoll: 30, hiding: 40, hidingRoll: 90 }).spotted, true, 'watcher passes, hider fails');
assert.equal(opposedAwareness({ awareness: 40, awarenessRoll: 90, hiding: 40, hidingRoll: 30 }).spotted, false);
assert.equal(opposedAwareness({ awareness: 40, awarenessRoll: 90, hiding: 40, hidingRoll: 90 }).spotted, false, 'neither passes');
assert.equal(opposedAwareness({ awareness: 60, awarenessRoll: 10, hiding: 60, hidingRoll: 40 }).spotted, true, 'more degrees wins');
assert.equal(opposedAwareness({ awareness: 60, awarenessRoll: 40, hiding: 60, hidingRoll: 40 }).spotted, false, 'a tie goes to the hider');
assert.equal(opposedAwareness({ awareness: 60, awarenessRoll: 40, hiding: 60, hidingRoll: 40, tieGoesTo: 'watcher' }).spotted, true);

// noise rings
const map = { metresPerSquare: 1, contacts: {
  '0,5': { name: 'near', state: 'hidden' },
  '0,40': { name: 'mid', state: 'hidden' },
  '0,200': { name: 'far', state: 'hidden' },
  '3,0': { name: 'seen', state: 'seen' }
} };
const shot = noisePing(map, { x: 0, y: 0 }, 'shot');
assert.equal(shot['0,5'].state, 'ping');
assert.equal(shot['0,40'].state, 'ping', 'a shot carries 60 m');
assert.equal(shot['0,200'].state, 'hidden');
assert.equal(shot['3,0'].state, 'seen', 'seen stays seen');
const steps = noisePing(map, { x: 0, y: 0 }, 'footsteps');
assert.equal(steps['0,5'].state, 'ping');
assert.equal(steps['0,40'].state, 'hidden', 'footsteps do not');
assert.ok(noiseById('door').radiusM > noiseById('footsteps').radiusM);
assert.equal(noisePing(map, { x: 0, y: 0 }, 'nope')['0,5'].state, 'hidden');
assert.ok(NOISE.every((n) => n.radiusM > 0));

assert.equal(sightBlockedByObscuring(8, 'light'), true);
assert.equal(sightBlockedByObscuring(5, 'light'), false);
assert.equal(sightBlockedByObscuring(5, 'heavy'), true, 'denser stops sight sooner');
assert.equal(sightBlockedByObscuring(99, 'unknown'), false);

console.log('awareness.check.mjs: all assertions passed');
