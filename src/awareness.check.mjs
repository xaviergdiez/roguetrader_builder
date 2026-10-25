import assert from 'node:assert/strict';
import { SURPRISE, lightingById, situationFor, opposedAwareness, noisePing, NOISE, noiseById, sightBlockedByObscuring }
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

// what an attack inherits from the scene
assert.deepEqual(situationFor({}).ids, []);
const both = situationFor({ targetConditions: [{ id: 'unaware' }], lighting: 'dim' });
assert.deepEqual(both.ids.sort(), ['poor_visibility', 'target_unaware']);
assert.ok(both.labels.some((l) => /Unaware.*\+30/.test(l)));
assert.ok(both.labels.some((l) => /-20/.test(l)));
assert.deepEqual(situationFor({ lighting: 'smoke' }).ids, ['poor_visibility'], 'smoke and fog are one penalty, not two');

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

/* ---- obscuring terrain folded into the line of sight (battlemap.js) ---- */
{
  const { lineBlocked, readMap, visibleCells, unobstructed, reachBetween, blockedText, lightingById: lb } =
    await import('./battlemap.js');
  const open = (extra) => ({ cols: 30, rows: 10, metresPerSquare: 1, ...extra });
  const row = (cells) => Object.fromEntries(cells.map(([x, y, d]) => [`${x},${y}`, d]));

  assert.equal(lineBlocked(open({}), { x: 0, y: 5 }, { x: 20, y: 5 }), null, 'open ground blocks nothing');

  // Heavy stops sight after 4 m: a screen 5 squares deep is too much, 3 is not.
  const heavy5 = open({ obscuring: row([[5, 5, 'heavy'], [6, 5, 'heavy'], [7, 5, 'heavy'], [8, 5, 'heavy'], [9, 5, 'heavy']]) });
  const hit = lineBlocked(heavy5, { x: 0, y: 5 }, { x: 20, y: 5 });
  assert.equal(hit.reason, 'obscured');
  assert.equal(hit.density, 'heavy');
  assert.equal(blockedText(hit), 'foliage or smoke');
  const heavy3 = open({ obscuring: row([[5, 5, 'heavy'], [6, 5, 'heavy'], [7, 5, 'heavy']]) });
  assert.equal(lineBlocked(heavy3, { x: 0, y: 5 }, { x: 20, y: 5 }), null, 'a thin screen can be seen through');

  // Light reaches further than heavy: 6 squares of light foliage is fine, of heavy is not.
  const six = (d) => open({ obscuring: row([0, 1, 2, 3, 4, 5].map((i) => [5 + i, 5, d])) });
  assert.equal(lineBlocked(six('light'), { x: 0, y: 5 }, { x: 20, y: 5 }), null);
  assert.equal(lineBlocked(six('heavy'), { x: 0, y: 5 }, { x: 20, y: 5 }).reason, 'obscured');

  // Mixed densities: the thicker stuff's limit applies to everything crossed so far
  // (two light + three heavy = 5 m through, past heavy's 4 m, though neither alone is).
  const mixed = open({ obscuring: row([[5, 5, 'light'], [6, 5, 'light'], [7, 5, 'heavy'], [8, 5, 'heavy'], [9, 5, 'heavy']]) });
  assert.equal(lineBlocked(mixed, { x: 0, y: 5 }, { x: 20, y: 5 }).reason, 'obscured');

  // The target's own square counts (hiding in the reeds); the firer's does not.
  const hidden = open({ obscuring: row([[12, 5, 'heavy'], [13, 5, 'heavy'], [14, 5, 'heavy'], [15, 5, 'heavy'], [16, 5, 'heavy']]) });
  assert.equal(lineBlocked(hidden, { x: 10, y: 5 }, { x: 16, y: 5 }).reason, 'obscured');
  assert.equal(lineBlocked(hidden, { x: 12, y: 5 }, { x: 0, y: 5 }), null, 'shooting out of cover is not blind');

  // Square size scales it: at 2 m a square, three squares of heavy is 6 m.
  const coarse = open({ metresPerSquare: 2, obscuring: row([[5, 5, 'heavy'], [6, 5, 'heavy'], [7, 5, 'heavy']]) });
  assert.equal(lineBlocked(coarse, { x: 0, y: 5 }, { x: 20, y: 5 }).reason, 'obscured');

  // Templates are not stopped by smoke, and the ruler and sight overlay are.
  const centre = { x: 0, y: 5 };
  const cells = [{ x: 20, y: 5 }];
  assert.equal(unobstructed(heavy5, centre, cells).length, 1, 'a grenade crosses smoke');
  assert.equal(visibleCells(heavy5, centre, null).some((c) => c.x === 20 && c.y === 5), false, 'but the eye does not');
  assert.equal(reachBetween({ from: centre, to: { x: 20, y: 5 }, map: heavy5 }).blocked.reason, 'obscured');

  // The map keeps what it is given, and drops junk.
  const kept = readMap({ obscuring: { '1,1': 'heavy', '2,2': 'nonsense', bad: 'light' }, lighting: 'rain' });
  assert.deepEqual(kept.obscuring, { '1,1': 'heavy' });
  assert.equal(kept.lighting, 'rain');
  assert.equal(readMap({ lighting: 'nonsense' }).lighting, 'clear');
  assert.equal(lb('dark').situationIds[0], 'total_darkness');
}
console.log('awareness.check.mjs: obscuring terrain in lineBlocked passed');
