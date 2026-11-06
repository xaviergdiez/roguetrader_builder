// Self-check for scenes.js and a mission's scenes. Run: node src/scenes.check.mjs
import assert from 'node:assert/strict';
import { readScene, readScenes, newScene, moveScene, sceneDoes, describeScene, readTonight, MAX_SCENES } from './scenes.js';
import { readMission, readEndeavour, redactEndeavour } from './endeavours.js';

{
  const s = newScene(2);
  assert.match(s.id, /^s[a-z0-9]+$/);
  assert.equal(s.name, 'Scene 2');
  assert.equal(sceneDoes(s), false, 'a new scene changes nothing until told to');
}
assert.equal(readScene({ id: 'nope' }), null);
assert.deepEqual(readScene({ id: 'sabc1', name: 'The vault', deck: 'bmap-1', chart: '../x', handout: 'hmanifest', cue: 'cue-engines', note: 'n'.repeat(500), extra: 1 }),
  { id: 'sabc1', name: 'The vault', deck: 'bmap-1', chart: '', handout: 'hmanifest', cue: 'cue-engines', note: 'n'.repeat(400) });
assert.equal(readScenes(Array.from({ length: 30 }, (_, i) => ({ id: 's' + String(i).padStart(4, '0') }))).length, MAX_SCENES);
{
  const list = readScenes([{ id: 'saaa1' }, { id: 'sbbb2' }, { id: 'sccc3' }]);
  assert.deepEqual(moveScene(list, 'sccc3', -1).map((s) => s.id), ['saaa1', 'sccc3', 'sbbb2']);
  assert.deepEqual(moveScene(list, 'saaa1', -1).map((s) => s.id), ['saaa1', 'sbbb2', 'sccc3'], 'the first stays first');
}
assert.equal(describeScene(readScene({ id: 'sabc1', deck: 'd1', cue: 'c9' }), { decks: [{ id: 'd1', name: 'Hulk deck' }], cues: [] }),
  'deck: Hulk deck · sound: missing');
assert.equal(describeScene(readScene({ id: 'sabc1' })), 'nothing changes');
assert.deepEqual(readTonight({ endId: 'end-1', missionId: 'mis-2', index: '3' }), { endId: 'end-1', missionId: 'mis-2', index: 3 });
assert.equal(readTonight({ endId: 'e', missionId: 'm', index: -1 }), null);

/* ---- kept with the mission, never shown to the table ---- */
{
  const m = readMission({ id: 'mis-1', name: 'The vault', scenes: [{ id: 'saaa1', name: 'Arrival', deck: 'bmap-1' }] });
  assert.equal(m.scenes.length, 1);
  assert.equal('scenes' in readMission({ id: 'mis-2', name: 'Plain' }), false, 'a mission with none is unchanged');
  const end = readEndeavour({ id: 'end-1', name: 'E', missions: [{ ...m, objectives: [{ id: 'o1', name: 'Get in', kind: 'other' }] }] });
  const told = redactEndeavour(end, { isGm: false });
  assert.equal('scenes' in told.missions[0], false, 'the party never reads the GM’s running order');
  assert.equal(redactEndeavour(end, { isGm: true }).missions[0].scenes.length, 1);
}
console.log('scenes.js OK');
