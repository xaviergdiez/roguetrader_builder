// Self-check for triggers.js and triggerfire.js. Run: node src/triggers.check.mjs
import assert from 'node:assert/strict';
import {
  TRIGGER_WHEN, readTrigger, readTriggers, newTrigger, triggerAt, paintTrigger, updateTrigger, rearmAll, anyArmed,
  MAX_TRIGGERS, MAX_TRIGGER_CELLS
} from './triggers.js';
import { fireTrigger, springTriggers, springNow } from './triggerfire.js';
import { readMap, cellKey, playDoor, publishMap, rotateMap, expandMap, packMap, visibleExplored } from './battlemap.js';

/* ---- the record ---- */
assert.equal(TRIGGER_WHEN.length, 2);
{
  const t = newTrigger(3);
  assert.match(t.id, /^t[a-z0-9]+$/);
  assert.equal(t.name, 'Trigger 3');
  assert.equal(t.when, 'entered');
  assert.equal(t.armed, true);
  assert.equal(t.once, true, 'a trap goes off once unless it is told otherwise');
}
assert.equal(readTrigger({ id: 'bad' }), null);
{
  const t = readTrigger({ id: 'tabc1', cells: ['1,1', '1,1', 'x', '2,1'], when: 'nope', doors: 'explode', light: 'Dark!', cue: '../x', handout: 'hzz99', note: 'n'.repeat(900) });
  assert.deepEqual(t.cells, ['1,1', '2,1']);
  assert.equal(t.when, 'entered');
  assert.equal(t.doors, '');
  assert.equal(t.light, '');
  assert.equal(t.cue, '');
  assert.equal(t.handout, 'hzz99');
  assert.equal(t.note.length, 600);
}
assert.equal(readTriggers(Array.from({ length: 60 }, (_, i) => ({ id: 'tx' + String(i).padStart(4, '0') }))).length, MAX_TRIGGERS);
assert.equal(readTrigger({ id: 'tabc1', cells: Array.from({ length: 900 }, (_, i) => `${i % 30},${Math.floor(i / 30)}`) }).cells.length, MAX_TRIGGER_CELLS);
{
  let list = [readTrigger({ id: 'taaa1', cells: ['1,1'] }), readTrigger({ id: 'tbbb2', cells: ['5,5'] })];
  list = paintTrigger(list, 'tbbb2', ['1,1', '6,5']);
  assert.deepEqual(list[0].cells, [], 'a square belongs to one trigger at a time');
  assert.deepEqual(list[1].cells, ['5,5', '1,1', '6,5']);
  assert.equal(triggerAt(list, '6,5').id, 'tbbb2');
  list = paintTrigger(list, 'tbbb2', ['5,5'], false);
  assert.deepEqual(list[1].cells, ['1,1', '6,5']);
  list = updateTrigger(list, 'tbbb2', { armed: false, id: 'hijack' });
  assert.equal(list[1].id, 'tbbb2');
  assert.equal(anyArmed([list[1]]), false);
  assert.equal(rearmAll(list).every((t) => t.armed), true);
}

/* ---- a deck: a corridor west, a door, and the ambush room east ---- */
const floor = {};
for (let x = 0; x <= 4; x++) floor[cellKey(x, 2)] = true;          // corridor
for (let x = 6; x <= 10; x++) for (let y = 0; y <= 4; y++) floor[cellKey(x, y)] = true;
floor['5,2'] = true;                                              // the doorway
const base = {
  cols: 12, rows: 6, floor, fog: true, start: { x: 0, y: 2 }, viewpoint: { x: 0, y: 2 },
  explored: { '0,2': true, '1,2': true, '2,2': true, '3,2': true, '4,2': true, '5,2': true },
  doors: { '5,2': { kind: 'bulkhead', state: 'closed' } },
  contacts: { '9,1': { name: 'Cultist', state: 'hidden' }, '9,3': { name: 'Cultist', state: 'hidden' }, '1,2': { name: 'Rat', state: 'hidden' } }
};

// A pressure plate at the corridor's end: stepping on it seals the door ahead and kills the lights.
{
  const plate = readTrigger({ id: 'tplate1', cells: ['4,2'], when: 'entered', doors: 'jammed', light: 'dark', note: 'Click. Awareness (+0).', cue: 'cue-slam' });
  const m = readMap({ ...base, triggers: [plate] });
  // Placing the party anywhere else does nothing.
  assert.deepEqual(springTriggers(m, readMap({ ...m, viewpoint: { x: 3, y: 2 } })).fired, []);
  const s = springTriggers(m, readMap({ ...m, viewpoint: { x: 4, y: 2 } }));
  assert.deepEqual(s.fired, [{ id: 'tplate1', name: '', note: 'Click. Awareness (+0).', cue: 'cue-slam', handout: '' }]);
  assert.equal(s.map.doors['5,2'].state, 'jammed', 'the door ahead is sealed');
  assert.equal(s.map.light['2,2'], 'dark', 'its room goes dark');
  assert.equal(s.map.triggers[0].armed, false, 'and it is spent');
  // Spent, it does not go off again.
  const again = springTriggers(readMap({ ...s.map, viewpoint: { x: 3, y: 2 } }), readMap({ ...s.map, viewpoint: { x: 4, y: 2 } }));
  assert.deepEqual(again.fired, []);
  // Standing still on it is not stepping in again.
  const rearmed = readMap({ ...s.map, triggers: rearmAll(s.map.triggers) });
  assert.deepEqual(springTriggers(rearmed, readMap({ ...rearmed, explored: { ...rearmed.explored } })).fired, []);
}

// The ambush: the moment the room comes into view, the cultists are there.
{
  const ambush = readTrigger({ id: 'tambush', cells: ['8,2'], when: 'seen', contacts: true, reveal: true, noise: 'shot', handout: 'habcd1' });
  const m = readMap({ ...base, triggers: [ambush] });
  // Opening the door brings the room into view.
  const opened = readMap({ ...m, ...playDoor(m, { x: 5, y: 2 }) });
  assert.ok(visibleExplored(opened)['8,2'], 'the room is in view once the door opens');
  const s = springTriggers(m, opened);
  assert.equal(s.fired.length, 1);
  assert.equal(s.fired[0].handout, 'habcd1');
  assert.equal(s.map.contacts['9,1'].state, 'seen', 'what lay in wait is there');
  assert.equal(s.map.contacts['9,3'].state, 'seen');
  assert.equal(s.map.contacts['1,2'].state, 'ping', 'and the shot is heard down the corridor');
  assert.ok(s.map.explored['10,4'], 'the whole room is lit');
  // Switching the fog on is not the party seeing everything at once.
  const dark = readMap({ ...m, fog: false });
  assert.deepEqual(springTriggers(dark, readMap({ ...dark, fog: true, explored: { '8,2': true } })).fired, []);
  // A repeating trigger stays armed.
  const loud = readMap({ ...m, triggers: [{ ...ambush, once: false }] });
  assert.equal(springTriggers(loud, readMap({ ...loud, ...playDoor(loud, { x: 5, y: 2 }) })).map.triggers[0].armed, true);
}

// Set off by hand, and a fire on its own squares.
{
  const t = readTrigger({ id: 'tfire1', cells: ['7,1', '7,2'], hazard: 'fire', armed: false });
  const s = springNow(readMap({ ...base, triggers: [t] }), t);
  assert.equal(s.map.hazards['7,1'], 'fire');
  assert.equal(s.map.hazards['7,2'], 'fire');
  assert.equal(s.fired[0].id, 'tfire1');
}

/* ---- kept with the deck ---- */
{
  const t = readTrigger({ id: 'tkeep1', cells: ['8,2', '9,2'], armed: false });
  const m = readMap({ ...base, triggers: [t] });
  assert.deepEqual(readMap(packMap(m)).triggers, m.triggers, 'through storage');
  assert.equal(readMap(publishMap({ map: m })).triggers[0].armed, true, 'set again when the deck is put on the table');
  const turned = rotateMap(readMap({ ...m, cols: 20, rows: 20 }), 1);
  assert.equal(turned.triggers[0].cells.length, 2);
  assert.ok(turned.triggers[0].cells.every((k) => turned.floor[k]), 'still on the same squares of deck');
  assert.deepEqual(expandMap(m, 8, 6).triggers[0].cells, [], 'cropped with the deck');
}

console.log('triggers OK');
