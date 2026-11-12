// Reading a picture of a map into a sketch plan: the real endpoint, with Google stood in for by the
// simulator (an image allowance of 3 a day). The reading comes back as JSON, kept only where it fits.
import { peek, check, finish, API } from './lib.mjs';

const read = (body, cookie = 'sid=SIM1') => fetch(API + '/api/generate-texture', {
  method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body)
}).then(async (r) => ({ status: r.status, json: (r.headers.get('content-type') || '').includes('json') ? await r.json() : null }));
const used = async () => {
  const keys = (await peek('')).filter((k) => k.startsWith('rt:quota:images:u1:'));
  return keys.length ? Number(await peek('k=' + encodeURIComponent(keys[0]))) : 0;
};
const PIC = Buffer.from('a small picture of a map, as far as the simulator knows').toString('base64');

console.log('--- a picture read into a plan');
let r = await read({ kind: 'read_sketch', image: PIC, mime: 'image/jpeg', source: 'sketch', note: 'deck 3' });
check(r.status === 200 && r.json && r.json.reading, 'it answers with a reading: ' + r.status);
const reading = r.json.reading;
check(reading.rooms.length === 2 && reading.rooms[0].name === 'BREACH', 'the rooms read');
check(reading.rooms[0].hazards.length === 0, 'a hazard the map does not have is not kept');
check(reading.rooms[1].hazards.includes('toxic'), '"gas!" written in a room is its hazard');
check(reading.links.length === 1 && reading.links[0].kind === 'locked', 'the link to a room not read is left out');
check(reading.unclear.some((u) => /names a room that was not read/.test(u)) && reading.unclear.includes('the bridge door may be two'), 'and said, beside what the model said');
check(await used() === 1, 'one of the day\'s allowance: ' + await used());

console.log('--- what is not a picture is refused before anything is spent');
r = await read({ kind: 'read_sketch', image: 'not base64!', mime: 'image/jpeg' });
check(r.status === 400 && /JPEG, PNG or WebP/.test(r.json.error), 'junk: 400');
r = await read({ kind: 'read_sketch', image: PIC, mime: 'image/gif' });
check(r.status === 400, 'a GIF: 400');
r = await read({ kind: 'read_sketch', image: 'A'.repeat(4_000_004), mime: 'image/jpeg' });
check(r.status === 400 || r.status === 413, 'too big: ' + r.status);
check(await used() === 1, 'and none of it counted');
r = await read({ kind: 'read_sketch', image: PIC, mime: 'image/jpeg' }, '');
check(r.status === 401, 'signed out: 401');

console.log('--- a reading that fails is handed back');
await peek('gemini=fail');
r = await read({ kind: 'read_sketch', image: PIC, mime: 'image/png' });
check(r.status === 502, 'the service failing answers 502');
check(await used() === 1, 'and costs nothing');
await peek('gemini=');

finish();
