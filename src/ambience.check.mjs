// Self-check for ambience.js. Run: node src/ambience.check.mjs
import assert from 'node:assert/strict';
import {
  MAX_CUES, BUILT_IN, builtInById, DEFAULT_BOARD, readBoard, readCue, sourceOf, cueById,
  addFileCue, updateCue, removeCue, restoreBuiltIns, noiseSamples, seeded
} from './ambience.js';

/* ---- the default board works out of the box: every made sound on it ---- */
const b0 = readBoard(null);
assert.equal(b0.cues.length, BUILT_IN.length);
assert.ok(b0.cues.length <= MAX_CUES);
assert.equal(b0.battleStations, 'cue-klaxon');
assert.ok(cueById(b0, 'cue-klaxon').loop, 'battle stations goes on until silenced');
assert.equal(cueById(b0, 'cue-slam').loop, false, 'a slam is once');
assert.notEqual(b0.cues, DEFAULT_BOARD.cues, 'a copy, not the frozen default');
assert.equal(new Set(BUILT_IN.map((b) => b.id)).size, BUILT_IN.length);
assert.ok(BUILT_IN.every((b) => b.name && b.note));

/* ---- sources ---- */
assert.deepEqual(sourceOf('synth:rain'), { kind: 'synth', id: 'rain' });
assert.equal(sourceOf('synth:bagpipes'), null, 'only sounds made here');
assert.deepEqual(sourceOf('file:snd-abc'), { kind: 'file', id: 'snd-abc' });
assert.equal(sourceOf('file:../x'), null);
assert.equal(sourceOf('http://example.com/a.mp3'), null, 'nothing fetched from anywhere');

/* ---- cues are read, not trusted ---- */
assert.equal(readCue({ id: 'x', source: 'synth:none' }), null);
assert.deepEqual(readCue({ id: 'c1', name: '  Hum ', source: 'synth:cogitator', loop: 1, volume: 7 }),
  { id: 'c1', name: 'Hum', source: 'synth:cogitator', loop: true, volume: 1 });
{
  const many = Array.from({ length: 20 }, (_, i) => ({ id: 'c' + i, source: 'synth:rain', name: 'r' + i }));
  const b = readBoard({ master: 2, cues: [...many, many[0]], battleStations: 'nope' });
  assert.equal(b.cues.length, MAX_CUES, 'twelve and no more');
  assert.equal(b.master, 1);
  assert.equal(b.battleStations, '', 'a cue that is not on the board sounds nothing');
}

/* ---- changing the board ---- */
{
  let b = addFileCue(b0, { fileId: 'snd-1', name: 'imperial_choir-loop.mp3' });
  const added = b.cues[b.cues.length - 1];
  assert.equal(added.name, 'imperial choir loop');
  assert.equal(added.source, 'file:snd-1');
  assert.equal(added.loop, true);
  assert.equal(addFileCue(b, { fileId: 'bad id!', name: 'x' }).cues.length, b.cues.length);
  b = updateCue(b, added.id, { name: 'Choir', loop: false, volume: 0.3, source: 'synth:rain', id: 'hijack' });
  assert.deepEqual(cueById(b, added.id), { ...added, name: 'Choir', loop: false, volume: 0.3 }, 'the source and id stay');
  b = removeCue(b, 'cue-klaxon');
  assert.equal(cueById(b, 'cue-klaxon'), null);
  assert.equal(b.battleStations, '', 'taking battle stations off silences it');
  b = restoreBuiltIns(b);
  assert.ok(cueById(b, 'cue-klaxon'), 'put back');
  let full = b0;
  for (let i = 0; i < 20; i++) full = addFileCue(full, { fileId: 'snd-' + i, name: 'f' + i });
  assert.equal(full.cues.length, MAX_CUES);
}

/* ---- the made sounds' raw stuff ---- */
{
  const a = noiseSamples({ seconds: 0.5, rate: 8000, rng: seeded(5), crackle: 1, drops: 1, ticks: 6 });
  const b = noiseSamples({ seconds: 0.5, rate: 8000, rng: seeded(5), crackle: 1, drops: 1, ticks: 6 });
  assert.equal(a.length, 4000);
  assert.deepEqual(a, b, 'seeded, so it holds still');
  let peak = 0;
  for (const v of a) peak = Math.max(peak, Math.abs(v));
  assert.ok(peak <= 1 && peak > 0.1, 'loud enough and never clipping');
  assert.equal(a[0], 0, 'the loop starts from silence');
  assert.ok(Math.abs(a[a.length - 1]) < 1e-6, 'and ends there, so it does not click');
}
assert.ok(builtInById('warp') && !builtInById('nope'));

console.log('ambience.js OK');
