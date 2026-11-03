// Image generation is limited per account per day, and a generation that fails is not charged.
// The real endpoints, with Google's image service stood in for by the simulator (limit set to 3).
import { call, peek, check, finish, API } from './lib.mjs';

const gen = (path, body = {}) => fetch(API + path, {
  method: 'POST', headers: { 'Content-Type': 'application/json', cookie: 'sid=SIM1' }, body: JSON.stringify(body)
}).then(async (r) => ({ status: r.status, type: r.headers.get('content-type') || '', retry: r.headers.get('retry-after'),
  json: (r.headers.get('content-type') || '').includes('json') ? await r.json() : null }));
const used = async () => {
  const keys = (await peek('')).filter((k) => k.startsWith('rt:quota:images:u1:'));
  return keys.length ? Number(await peek('k=' + encodeURIComponent(keys[0]))) : 0;
};

console.log('--- portraits and floors share one daily allowance of three');
let r = await gen('/api/generate-avatar', { name: 'Zed', career: 'Arch-Militant' });
check(r.status === 200 && r.type.startsWith('image/'), 'a portrait is made');
r = await gen('/api/generate-texture', { describe: 'rust', cover: 'plain', condition: 'worn' });
check(r.status === 200 && r.type.startsWith('image/'), 'a floor is made');
r = await gen('/api/generate-avatar', { name: 'Zed' });
check(r.status === 200, 'a third is made (the last allowed)');
check(await used() === 3, 'and three are counted');
r = await gen('/api/generate-avatar', { name: 'Zed' });
check(r.status === 429, 'the fourth is refused with 429');
check(r.json && /limit of 3 generated images/.test(r.json.error) && /midnight UTC/.test(r.json.error), 'in words the screen can show: ' + (r.json && r.json.error));
check(Number(r.retry) > 0 && Number(r.retry) <= 86400, 'with a Retry-After: ' + r.retry);
r = await gen('/api/generate-texture', { describe: 'rust' });
check(r.status === 429, 'the floor endpoint is held to the same allowance');
check(await used() === 3, 'and refusals are not counted as generations: ' + await used());

console.log('--- a generation that fails is handed back');
await peek('wipe=1');
const keys = (await peek('')).filter((k) => k.startsWith('rt:quota:'));
for (const k of keys) await peek('set=' + encodeURIComponent(k) + '&v=0');
await peek('gemini=fail');
r = await gen('/api/generate-avatar', { name: 'Zed' });
check(r.status === 502, 'the service failing answers 502');
check(await used() === 0, 'and the allowance is back to what it was: ' + await used());
await peek('gemini=');
r = await gen('/api/generate-avatar', { name: 'Zed' });
check(r.status === 200 && await used() === 1, 'then generating works again and is counted');

console.log('--- the sheet importer is behind sign-in');
const anon = await fetch(API + '/api/sheet?id=' + 'a'.repeat(30));
check(anon.status === 401, 'no session: 401, not a free proxy');
finish();
