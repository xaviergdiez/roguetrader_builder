import assert from 'node:assert/strict';
import { ORDOS, INQUISITION_FACTIONS, RETINUE, INQUISITOR_ENTRY, rollInquisitor, convertInquisitorStat, ordoById }
  from './inquisition.js';
import { bestiaryEntry } from './npcgen.js';

assert.deepEqual(ORDOS.map((o) => o.id), ['hereticus', 'malleus', 'xenos']);
assert.equal(INQUISITION_FACTIONS.length, 5);
assert.ok(bestiaryEntry(INQUISITOR_ENTRY), 'the Inquisitor template exists');
for (const m of RETINUE) assert.ok(bestiaryEntry(m.entry), `${m.entry} is a bestiary entry`);

let i = 0;
const rng = () => [0.1, 0.9, 0.5, 0.2, 0.7, 0.4, 0.3][i++ % 7];
const r = rollInquisitor({ rng, ordoId: 'malleus', factionId: 'thorian', retinueSize: 3 });
assert.equal(r.ordo, 'Ordo Malleus');
assert.equal(r.faction, 'Thorian');
assert.equal(r.retinue.length, 3);
assert.equal(new Set(r.retinue.map((m) => m.name)).size, 3, 'no duplicate retinue members');
assert.ok(r.inquisitor.max > 0 && r.inquisitor.ws > 0, 'ready for npc_add');
assert.equal(rollInquisitor({ retinueSize: 0 }).retinue.length, 0);
assert.ok(ordoById('xenos'));

assert.equal(convertInquisitorStat(55), 35, 'an Inquisitor average soldier lands in the RT range');
assert.equal(convertInquisitorStat(100), 60);
assert.equal(convertInquisitorStat(0), 0);

console.log('inquisition.check.mjs: all assertions passed');
