// The homebrew library moved off the account record to a key of its own: a library saved
// the old way is still read, and moves on the next save.
import { call, record, peek, check, finish, library } from './lib.mjs';

const legacy = { email: 'sim@example.com', name: 'Sim GM', chars: [{ id: 'c1', name: 'Zed' }], dynasties: ['ABCD23'],
  homebrew: library('old1', 'old2') };
await peek('set=' + encodeURIComponent('rt:user:u1') + '&v=' + encodeURIComponent(JSON.stringify(legacy)));

console.log('--- a library saved before it had a key of its own');
let r = await call('GET', '/api/homebrew');
check(r.status === 200 && r.json.homebrew.hulls.map((h) => h.id).join() === 'old1,old2', 'is still read from the account record');
check((await peek('k=' + encodeURIComponent('rt:homebrew:u1'))) === null, 'and nothing is under the new key yet');

console.log('--- the next save moves it');
r = await call('PUT', '/api/homebrew', { homebrew: library('new1') });
check(r.status === 200, 'the save is accepted');
const stored = await peek('k=' + encodeURIComponent('rt:homebrew:u1'));
check(stored && JSON.parse(stored).hulls.map((h) => h.id).join() === 'new1', 'the library is under its own key');
const rec = await record();
check(!('homebrew' in rec), 'the record no longer carries it');
check(rec.chars.length === 1 && rec.chars[0].id === 'c1' && rec.dynasties[0] === 'ABCD23' && rec.email === 'sim@example.com', 'everything else on the record is as it was');
r = await call('GET', '/api/homebrew');
check(r.json.homebrew.hulls.map((h) => h.id).join() === 'new1', 'and reads back from the new key');

console.log('--- a second save, with nothing left to tidy');
const version = await peek('k=' + encodeURIComponent('rt:user:u1:v'));
await call('PUT', '/api/homebrew', { homebrew: library('new2') });
check((await peek('k=' + encodeURIComponent('rt:user:u1:v'))) === version, 'does not touch the account record at all');
check((await call('GET', '/api/homebrew')).json.homebrew.hulls[0].id === 'new2', 'and is saved');

console.log('--- a brand-new account');
await peek('set=' + encodeURIComponent('rt:user:u1') + '&v=' + encodeURIComponent(JSON.stringify({ email: 'e', name: 'n', chars: [] })));
await peek('set=' + encodeURIComponent('rt:homebrew:u1') + '&v=' + encodeURIComponent('null'));
check((await call('GET', '/api/homebrew')).json.homebrew.hulls.length === 0, 'an account with no library reads an empty one');
finish();
