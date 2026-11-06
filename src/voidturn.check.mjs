// Self-check for voidturn.js and the chart's new parts. Run: node src/voidturn.check.mjs
import assert from 'node:assert/strict';
import {
  moveAlong, sweeps, courseAhead, strikesAhead, endVoidTurn, springVoidEnter, springVoidNow, fireVoidTrigger,
  shipsInZone, rollStrike, strikeText, SHIP_PAD
} from './voidturn.js';
import { readVoidMap, readCourse, readStrike, readVoidTrigger, redactVoidForTable, rotateScene, MAX_COURSE } from './voidmap.js';

/* ---- the records ---- */
assert.equal(readCourse(null), null);
assert.equal(readCourse([0, 0]), null, 'standing still is no course');
assert.deepEqual(readCourse([1.234, -99]), [1.2, -MAX_COURSE]);
assert.deepEqual(readStrike({ n: 9, d: 7, bonus: 3, armour: false }), { n: 6, d: 10, bonus: 3, armour: false });
assert.deepEqual(readStrike({}), { n: 1, d: 10, bonus: 0, armour: true });
assert.equal(readStrike(null), null);
{
  const t = readVoidTrigger({ id: 'z1', x: 10, y: 5, r: 3, sides: ['enemy', 'bogus', 'enemy'], when: 'nope', cue: '../x' });
  assert.deepEqual(t.sides, ['enemy']);
  assert.equal(t.when, 'enter');
  assert.equal(t.cue, '');
  assert.equal(t.armed, true);
  assert.equal(readVoidTrigger({ id: 'z2' }).sides[0], 'player', 'watches the crew unless told otherwise');
}
assert.equal(readVoidMap({}).turn, 0);
assert.equal(readVoidMap({}).motion, true);
assert.deepEqual(readVoidMap({}).triggers, []);

/* ---- a swarm crossing the chart ---- */
const base = {
  cols: 40, rows: 20,
  fields: [
    { id: 'sw', kind: 'asteroid_cluster', name: 'Tumbling swarm', shape: 'circle', x: 5, y: 10, r: 2, course: [3, 0], strike: { n: 2, d: 10, bonus: 2 } },
    { id: 'rt', kind: 'gravity_riptide', name: 'Riptide', shape: 'band', x: 0, y: 2, x2: 40, y2: 2, w: 2, drift: [2, 0] }
  ],
  bodies: [{ id: 'hk', kind: 'hulk', name: 'Hulk adrift', x: 30, y: 15, r: 1, course: [0, -2] }],
  ships: [
    { id: 'player', name: 'Fortune', side: 'player', x: 10.5, y: 10.5 },   // in the swarm's path, two turns out
    { id: 'e1', name: 'Raider', side: 'enemy', x: 20.5, y: 2.5 },           // in the riptide
    { id: 'e2', name: 'Picket', side: 'enemy', x: 30.5, y: 5.5 }            // out of everything
  ],
  triggers: [
    { id: 'mine', name: 'Minefield', x: 30, y: 6, r: 2, when: 'enter', sides: ['player'], reveal: true, strike: { n: 1, d: 10, bonus: 5 } },
    { id: 'ambush', name: 'Ambush', x: 36, y: 10, r: 3, when: 'turn', turn: 2, reveal: true, note: 'Raiders out from behind the moon.' }
  ]
};
const m = readVoidMap(base);
assert.deepEqual(moveAlong(m.fields[0], 2).x, 11);
assert.deepEqual(courseAhead(m.fields[0], 3).map((f) => f.x), [8, 11, 14]);
assert.equal(sweeps(m.fields[0], moveAlong(m.fields[0], 1), { x: 10.5, y: 10.5 }), false, 'not yet on its first turn');
assert.equal(sweeps(moveAlong(m.fields[0], 1), moveAlong(m.fields[0], 2), { x: 10.5, y: 10.5 }), true, 'on its second');
assert.equal(sweeps(m.fields[0], moveAlong(m.fields[0], 1), { x: 20, y: 10 }), false);
assert.equal(sweeps(m.fields[0], moveAlong(m.fields[0], 1), { x: 6, y: 10 + 2 + SHIP_PAD - 0.01 }), true, 'a ship it starts on');
// Warned before it happens: the crew's ship is in the swarm's path.
{
  const ahead = strikesAhead(m, 3);
  assert.deepEqual(ahead, [{ shipId: 'player', name: 'Fortune', inTurns: 2, by: 'Tumbling swarm' }]);
}

// The turn ends.
const t1 = endVoidTurn(m);
assert.equal(t1.map.turn, 1);
assert.deepEqual(t1.drifted.map((d) => d.id), ['e1'], 'the riptide carried the raider');
assert.equal(t1.map.ships.find((s) => s.id === 'e1').x, 22.5);
assert.equal(t1.map.fields.find((f) => f.id === 'sw').x, 8, 'the swarm moved three VU');
assert.equal(t1.map.bodies.find((b) => b.id === 'hk').y, 13, 'the hulk drifted');
assert.deepEqual(t1.struck, [], 'not reached yet');
assert.deepEqual(t1.moved.map((x) => x.id).sort(), ['hk', 'sw']);
assert.deepEqual(t1.fired, []);
// Turn two: the ambush goes off at its end, and only then.
const t2 = endVoidTurn(t1.map);
assert.equal(t2.map.turn, 2);
assert.deepEqual(t2.struck.map((s) => [s.shipId, s.by]), [['player', 'Tumbling swarm']], 'the ship that held still is hit');
assert.deepEqual(t2.struck[0].strike, { n: 2, d: 10, bonus: 2, armour: true });
assert.deepEqual(t2.fired.map((f) => f.id), ['ambush']);
assert.equal(t2.fired[0].note, 'Raiders out from behind the moon.');
assert.equal(t2.map.triggers.find((t) => t.id === 'ambush').armed, false, 'spent');
assert.deepEqual(endVoidTurn(t2.map).fired, []);
// A ship that moved out of the way is not hit.
{
  const dodged = readVoidMap({ ...base, ships: base.ships.map((s) => (s.id === 'player' ? { ...s, y: 16.5 } : s)) });
  assert.deepEqual(endVoidTurn(endVoidTurn(dodged).map).struck, []);
}

/* ---- a ship moved into a minefield ---- */
{
  const into = readVoidMap({ ...base, ships: base.ships.map((s) => (s.id === 'player' ? { ...s, x: 30.5, y: 6.5 } : s)) });
  const s = springVoidEnter(m, into);
  assert.deepEqual(s.fired.map((f) => [f.id, f.shipIds.join()]), [['mine', 'player']]);
  assert.deepEqual(s.fired[0].strike, { n: 1, d: 10, bonus: 5, armour: true });
  assert.equal(s.map.triggers.find((t) => t.id === 'mine').armed, false);
  // The picket the mine does not watch for came no closer, and nothing else went off.
  assert.deepEqual(springVoidEnter(into, into).fired, [], 'standing in it is not moving into it');
  // An enemy moved in is not what it watches for.
  const enemyIn = readVoidMap({ ...base, ships: base.ships.map((x) => (x.id === 'e2' ? { ...x, y: 6.5, x: 30.5 } : x)) });
  assert.deepEqual(springVoidEnter(m, enemyIn).fired, []);
  assert.deepEqual(shipsInZone(into, into.triggers[0]).map((x) => x.id), ['player']);
}
// Reveal: what is hidden inside comes into the open.
{
  const hidden = readVoidMap({ ...base, ships: [...base.ships, { id: 'e3', name: 'Lurker', side: 'enemy', x: 36.5, y: 10.5, state: 'hidden' }] });
  const amb = hidden.triggers.find((t) => t.id === 'ambush');
  assert.equal(fireVoidTrigger(hidden, amb).ships.find((s) => s.id === 'e3').state, 'seen');
  assert.equal(springVoidNow(hidden, amb).fired[0].id, 'ambush');
}

/* ---- the dice ---- */
assert.equal(strikeText({ n: 2, d: 10, bonus: 2 }), '2d10+2');
assert.equal(strikeText({ n: 1, d: 5, armour: false }), '1d5, ignoring armour');
{
  const seq = [0, 0.95, 0.5];
  let i = 0;
  const r = rollStrike({ n: 3, d: 10, bonus: 4 }, () => seq[i++]);
  assert.deepEqual(r.rolls, [1, 10, 6]);
  assert.equal(r.total, 21);
}

/* ---- what the table is sent, and turning the chart ---- */
{
  const told = redactVoidForTable({ ...base, backdrop: { id: 'pic-a', kind: 'video', w: 40, h: 20 } });
  assert.deepEqual(told.triggers, [], 'the GM’s traps stay with the GM');
  assert.equal(told.backdrop, null);
  assert.deepEqual(told.fields.find((f) => f.id === 'sw').course, [3, 0], 'but the table sees where a swarm is going');
  const turned = rotateScene(m, 1);
  assert.deepEqual(turned.fields.find((f) => f.id === 'sw').course, [0, 3]);
  assert.deepEqual(turned.triggers.find((t) => t.id === 'mine').x, 20 - 6);
}
console.log('voidturn.js OK');
