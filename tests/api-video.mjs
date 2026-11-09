// A picture floor brought to life: started, asked after, fetched in parts, held to its own
// daily allowance, handed back when it fails, and only ever the account's own.
// The real endpoint, with Google's video service stood in for by the simulator (limit set to 2).
import { check, finish, peek, API } from './lib.mjs';

const post = (body, sid = 'SIM1') => fetch(API + '/api/generate-video', {
  method: 'POST', headers: { 'Content-Type': 'application/json', cookie: 'sid=' + sid }, body: JSON.stringify(body)
});
const asJson = async (r) => ({ status: r.status, json: await r.json().catch(() => null) });
const used = async (kind) => {
  const keys = (await peek('')).filter((k) => k.startsWith(`rt:quota:${kind}:u1:`));
  return keys.length ? Number(await peek('k=' + encodeURIComponent(keys[0]))) : 0;
};
const start = (extra = {}) => post({ action: 'start', target: 'deck', image: 'QUJD', mime: 'image/jpeg', aspect: '16:9', ...extra }).then(asJson);

console.log('--- a clip is started, made, and fetched in parts');
let r = await start();
check(r.status === 200 && /^v1_sim\d+$/.test(r.json && r.json.id), 'started: ' + JSON.stringify(r.json));
const id = r.json.id;
check(await used('videos') === 1 && await used('images') === 0, 'counted as a video, not an image');
r = await asJson(await post({ action: 'poll', id }));
check(r.status === 200 && r.json.status === 'working', 'the first time asked, it is being made');
r = await asJson(await post({ action: 'poll', id }));
check(r.json.status === 'completed' && r.json.parts === 2 && r.json.bytes === 3 * 1024 * 1024 + 4096, 'then done, in two parts: ' + JSON.stringify(r.json));
const p0 = await post({ action: 'part', id, n: 0 });
const p1 = await post({ action: 'part', id, n: 1 });
const b0 = Buffer.from(await p0.arrayBuffer()), b1 = Buffer.from(await p1.arrayBuffer());
check(p0.status === 200 && p0.headers.get('content-type') === 'video/mp4', 'a part is video');
check(b0.length + b1.length === 3 * 1024 * 1024 + 4096 && b0.length === 3 * 1024 * 1024, 'and the parts make the whole');
r = await asJson(await post({ action: 'part', id, n: 2 }));
check(r.status === 400, 'there is no third part');

console.log('--- only the account that started it');
r = await asJson(await post({ action: 'poll', id }, 'SIM2'));
check(r.status === 404, 'another account is told there is no such clip');
r = await asJson(await post({ action: 'poll', id: '../x' }));
check(r.status === 400, 'an id that is not one is refused');
const anon = await fetch(API + '/api/generate-video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
check(anon.status === 401, 'and signing in comes first');

console.log('--- what is sent is checked');
for (const [what, extra] of [['no picture', { image: '' }], ['a GIF', { mime: 'image/gif' }], ['a square', { aspect: '1:1' }], ['not base64', { image: 'abc<script>' }]]) {
  r = await start(extra);
  check(r.status === 400, `${what} is refused`);
}
check(await used('videos') === 1, 'and refusals cost nothing');
await peek('gemini=fail');
r = await start();
check(r.status === 502 && await used('videos') === 1, 'a start the service refuses costs nothing: ' + await used('videos'));
await peek('gemini=');

console.log('--- its own daily allowance, and a failure handed back');
await peek('video=fail');
r = await start();
const bad = r.json.id;
check(r.status === 200 && await used('videos') === 2, 'a second clip is started (the last allowed)');
r = await start();
check(r.status === 429 && /limit of 2 generated videos/.test(r.json.error), 'a third is refused: ' + (r.json && r.json.error));
r = await asJson(await post({ action: 'poll', id: bad }));
check(r.json.status === 'failed' && /sim: blocked/.test(r.json.error), 'the failed one says why: ' + JSON.stringify(r.json));
check(await used('videos') === 1, 'and is handed back');
await post({ action: 'poll', id: bad });
check(await used('videos') === 1, 'once, however often it is asked after');
await peek('video=');
r = await start();
check(r.status === 200, 'so another can be made');
finish();
