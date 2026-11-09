// Self-check for the video request and reply. Run: node lib/omni.check.mjs
import assert from 'node:assert/strict';
import {
  omniRequest, videoOf, stateOf, isInteractionId, partsIn, partOf, PART_BYTES, OMNI_MODEL, whyFailed
} from './omni.js';

{
  const r = omniRequest({ prompt: 'loop it', image: 'AAAA', mime: 'image/jpeg', aspect: '16:9', seconds: 8 });
  assert.equal(r.model, OMNI_MODEL);
  assert.equal(r.background, true, 'started in the background, polled after');
  assert.equal(r.input.length, 3);
  assert.deepEqual(r.input[0], { type: 'image', data: 'AAAA', mime_type: 'image/jpeg' }, 'the picture is the first frame');
  assert.deepEqual(r.input[1], r.input[0], 'and the last, which is what makes it loop');
  assert.notEqual(r.input[1], r.input[0], 'as its own object');
  assert.deepEqual(r.input[2], { type: 'text', text: 'loop it' });
  assert.deepEqual(r.response_format, { type: 'video', duration: '8s', aspect_ratio: '16:9', resolution: '720p' });
}

{
  const done = { status: 'completed', steps: [
    { type: 'user_input', content: [{ type: 'text', text: 'x' }] },
    { type: 'thought', content: [] },
    { type: 'model_output', content: [{ type: 'video', mime_type: 'video/mp4', data: 'AAAAIGZ0' }] }
  ] };
  assert.deepEqual(videoOf(done), { data: 'AAAAIGZ0', mime: 'video/mp4' }, 'the clip is read from the model_output step');
  assert.equal(stateOf(done), 'completed');
  assert.equal(videoOf({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: 'no' }] }] }), null);
  assert.deepEqual(videoOf({ output_video: { data: 'QQ', mime_type: 'video/webm' } }), { data: 'QQ', mime: 'video/webm' }, 'the SDK shape too');
  for (const junk of [null, undefined, {}, { steps: 'x' }, { steps: [null] }]) assert.equal(videoOf(junk), null);
  assert.equal(stateOf({ status: 'in_progress' }), 'working');
  assert.equal(stateOf({}), 'working');
  for (const s of ['failed', 'cancelled', 'requires_action']) assert.equal(stateOf({ status: s }), 'failed', s);
  assert.match(whyFailed({ error: { message: 'Blocked by safety' } }), /Blocked by safety/);
  assert.match(whyFailed({}), /could not make that one/);
}

{
  assert.ok(isInteractionId('v1_abc123'));
  for (const bad of ['', 'a', '../x', 'v1/abc', 'a b', 'x'.repeat(201), 42, null]) assert.equal(isInteractionId(bad), false, String(bad));
  assert.equal(partsIn(1), 1);
  assert.equal(partsIn(PART_BYTES), 1);
  assert.equal(partsIn(PART_BYTES + 1), 2);
  assert.ok(PART_BYTES < 4.5 * 1024 * 1024, 'a part fits under what a function may answer with');
  const buf = Buffer.alloc(PART_BYTES * 2 + 10, 7);
  assert.equal(partOf(buf, 0).length, PART_BYTES);
  assert.equal(partOf(buf, 2).length, 10);
  assert.equal(Buffer.concat([0, 1, 2].map((n) => partOf(buf, n))).length, buf.length, 'the parts are the whole');
}

console.log('omni.js OK');
