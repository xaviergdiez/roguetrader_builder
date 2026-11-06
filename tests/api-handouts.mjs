// Handouts through the real bridge endpoint: only the GM hands them over, each
// player is sent only what is for them, and a picture is fetched only by those
// it is for, never carried in the document everyone polls.
import { call, peek, check, finish } from './lib.mjs';

const PIC = 'data:image/jpeg;base64,' + 'QUJD'.repeat(50);

let r = await call('POST', '/api/bridge', { action: 'create', name: 'Handout table' });
const code = r.json.dynasty.code;
r = await call('POST', '/api/bridge', { action: 'join', code, name: 'Vex', charId: 'c-vex', role: 'first_officer' }, 'SIM2');
check(r.status === 200, 'a player joins');

console.log('--- the GM hands a data-slate with a pict to one player');
r = await call('POST', '/api/bridge', { action: 'handout', code, to: ['c-vex'], kind: 'dataslate', title: 'Manifest', text: 'Shipment diverted', image: PIC });
check(r.status === 200 && r.json.handout && r.json.handout.hasImage, 'it is handed over: ' + r.status);
const id = r.json.handout.id;
const stored = await peek('k=' + encodeURIComponent(`rt:handout:${code}:${id}`));
check(typeof stored === 'string' && stored.includes('QUJD'), 'the picture is kept under a key of its own');
const shipRaw = await peek('k=' + encodeURIComponent(`rt:ship:${code}`));
check(!String(shipRaw).includes('QUJD'), 'and is not in the ship document');

console.log('--- a player cannot hand things over');
r = await call('POST', '/api/bridge', { action: 'handout', code, to: 'all', title: 'Forged orders' }, 'SIM2');
check(r.status === 403, 'refused: ' + r.status);

console.log('--- what the player is sent');
r = await call('GET', `/api/bridge?code=${code}`, undefined, 'SIM2');
check(r.status === 200 && r.json.ship.handouts.length === 1 && r.json.ship.handouts[0].title === 'Manifest', 'the handout, in the poll');
r = await call('GET', `/api/bridge?code=${code}&handout=${id}`, undefined, 'SIM2');
check(r.status === 200 && r.json.image === PIC, 'and its picture, when opened');

console.log('--- refused');
r = await call('POST', '/api/bridge', { action: 'handout', code, to: 'all', title: 'x', image: 'data:image/svg+xml;base64,PHN2Zz4=' });
check(r.status === 400, 'an SVG for a picture: ' + r.status);
r = await call('POST', '/api/bridge', { action: 'handout', code, to: 'all', title: 'x', image: 'data:image/png;base64,' + 'A'.repeat(800000) });
check(r.status === 413, 'a picture too big for the table: ' + r.status);
r = await call('POST', '/api/bridge', { action: 'handout', code, to: ['c-nobody'], title: 'x' });
check(r.status === 400 && r.json.error === 'not_at_this_table', 'to someone not at the table');
r = await call('GET', `/api/bridge?code=${code}&handout=../../etc`, undefined, 'SIM2');
check(r.status === 400, 'a handout id that is not one');

console.log('--- the GM takes it back');
r = await call('POST', '/api/bridge', { action: 'handout_withdraw', code, id });
check(r.status === 200 && r.json.ship.handouts.length === 0, 'gone from the document');
check((await peek('k=' + encodeURIComponent(`rt:handout:${code}:${id}`))) == null, 'and its picture with it');
r = await call('GET', `/api/bridge?code=${code}&handout=${id}`, undefined, 'SIM2');
check(r.status === 404, 'the player can no longer fetch it');
finish();
