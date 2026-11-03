// A device's local copy goes back into an account that lost it, without disturbing what other devices added.
// Real api handlers on a fake Upstash (sim-api2.mjs), the app on :5201 proxying /api to it.
import { launch } from './cdp.mjs';
import { tmpdir } from 'node:os';
const SP = process.argv[2] || tmpdir();
const A = await launch({ width: 1300, height: 1500, port: 9561 });
const { evaluate, send, sleep } = A;
let failed = false;
const check = (c, m) => { if (!c) { failed = true; console.log('  FAIL', m); } else console.log('  ok  ', m); };
const peek = async (q) => (await fetch('http://127.0.0.1:5292/?' + q)).json();
const APP = 'http://localhost:5201/';
const ids = (xs) => (xs || []).map((x) => x.id).sort();

// the account's homebrew library, as another device or the app itself would read it
const cloudLib = () => evaluate(`fetch('/api/homebrew',{credentials:'same-origin'}).then(r=>r.json()).then(j=>j.homebrew)`);
const putLib = (lib) => evaluate(`fetch('/api/homebrew',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({homebrew:${JSON.stringify(lib)}})}).then(r=>r.status)`);
const localLib = () => evaluate(`JSON.parse(localStorage.getItem('rt:homebrew')||'null')`);
const reload = async (ms = 2600) => { await send('Page.navigate', { url: APP }); await sleep(ms); };
const accountRecord = async () => JSON.parse(await peek('k=rt%3Auser%3Au1'));
const openHomebrewNote = async () => {
  await evaluate(`document.querySelector('.rt-headbtn.ship').click()`); await sleep(500);
  await evaluate(`[...document.querySelectorAll('dialog.rt-ship button')].find(b=>/^Homebrew/.test(b.textContent.trim())).click()`); await sleep(500);
  const out = await evaluate(`(() => { const n=[...document.querySelectorAll('dialog[open] .rt-note[role=status]')].find(x=>/browser/.test(x.textContent)); return n ? { text: n.innerText.replace(/\\s+/g,' '), button: [...n.querySelectorAll('button')].map(b=>b.textContent.trim()) } : null; })()`);
  return out;
};
const closeDialogs = () => evaluate(`document.querySelectorAll('dialog[open]').forEach(d=>d.close())`);

try {
  await send('Network.enable');
  await send('Network.setCookie', { name: 'sid', value: 'SIM1', domain: 'localhost', path: '/' });
  await send('Page.navigate', { url: APP }); await sleep(1800);
  await evaluate(`localStorage.clear()`);

  console.log('--- setup: an account with a library, and this device keeping its own copy');
  const L = {
    hulls: [{ id: 'h1', name: 'Kestrel' }, { id: 'h2', name: 'Wren' }],
    components: [], encounters: [{ id: 'e1', name: 'Ambush' }], endeavours: [],
    battlemaps: [], mapgrounds: [], voidcharts: [{ id: 'v1', name: 'Derelict' }]
  };
  check(await putLib(L) === 200, 'the account holds the library');
  await reload();
  check(ids((await localLib()).hulls).join() === 'h1,h2', 'this device kept its own copy');
  const snap = await evaluate(`JSON.parse(localStorage.getItem('rt:synced')||'{}')`);
  check(JSON.stringify(snap.u1 && snap.u1['hb.hulls'] ? snap.u1['hb.hulls'].sort() : null) === '["h1","h2"]', 'and recorded what the account holds');

  console.log('--- 1. a sign-in on another device wipes the account (what the old callback did)');
  await peek('wipe=1');
  check(ids((await cloudLib()).hulls).length === 0, 'the account really is empty');
  await reload();
  const back = await cloudLib();
  check(ids(back.hulls).join() === 'h1,h2', 'the hulls are back in the account: ' + ids(back.hulls).join());
  check(ids(back.encounters).join() === 'e1' && ids(back.voidcharts).join() === 'v1', 'and the encounter and the chart');
  check(ids((await localLib()).hulls).join() === 'h1,h2', 'this device’s own copy was not overwritten by the empty one');
  const note = await openHomebrewNote();
  console.log('   note:', note && note.text);
  check(note && /Put 4 entries from this browser back into your account/.test(note.text), 'it says what it did');
  check(note && note.button.length === 0, 'and offers nothing further');
  await closeDialogs();

  console.log('--- 2. another device added its own, and removed one: nothing is forced back, nothing is lost');
  await putLib({ ...L, hulls: [{ id: 'phone-hull', name: 'Added on the phone' }], encounters: [{ id: 'e1', name: 'Ambush' }] });
  await reload();
  const after = await cloudLib();
  check(ids(after.hulls).join() === 'phone-hull', 'the account keeps just what the other device left: ' + ids(after.hulls).join());
  const backup = await evaluate(`JSON.parse(localStorage.getItem('rt:homebrew:backup')||'null')`);
  check(backup && ids(backup.hulls).join() === 'h1,h2', 'this browser’s copy is kept as a backup');
  const note2 = await openHomebrewNote();
  console.log('   note:', note2 && note2.text);
  check(note2 && /2 entries in this browser's copy are no longer in your account/.test(note2.text), 'it says two were removed elsewhere');
  check(note2 && note2.button.join() === 'Put them back', 'and offers to put them back');
  await evaluate(`[...document.querySelectorAll('dialog[open] .rt-note[role=status] button')].find(b=>/Put them back/.test(b.textContent)).click()`);
  await sleep(1500);
  const put = await cloudLib();
  check(ids(put.hulls).join() === 'h1,h2,phone-hull', 'one click puts them back beside the phone’s: ' + ids(put.hulls).join());
  await closeDialogs();

  console.log('--- 3. the account cannot be reached: this browser’s copy must not overwrite it');
  await peek('fail=homebrew');
  await evaluate(`(() => { const l=JSON.parse(localStorage.getItem('rt:homebrew')); l.hulls.push({id:'offline-hull',name:'Made offline'}); localStorage.setItem('rt:homebrew', JSON.stringify(l)); })()`);
  await peek('log=clear');
  await reload(2800);
  const log = await peek('log=1');
  check(!log.some((r) => r.startsWith('PUT /api/homebrew')), 'no upload while the account could not be read');
  check(ids((await localLib()).hulls).includes('offline-hull'), 'and the offline copy is still here');
  await peek('fail=');
  check(!ids((await cloudLib()).hulls).includes('offline-hull'), 'the account was not touched');
  await reload();
  check(ids((await cloudLib()).hulls).includes('offline-hull'), 'once it can be reached, what was made offline goes up');
  check(ids((await cloudLib()).hulls).includes('phone-hull'), 'beside what was already there');

  console.log('--- 4. decks drawn while signed out, already marked moved, when the account has lost its decks');
  const made = await evaluate(`(async () => { const m = await import('/src/battlemap.js'); const d = m.newBattleMap('Drawn signed out'); localStorage.setItem('rt:decks', JSON.stringify([{ id: d.id, name: d.name, map: m.packMap(d.map) }])); localStorage.setItem('rt:localmoved', JSON.stringify({ u1: { d: [d.id] } })); return d.id; })()`);
  await reload();
  let rec = await accountRecord();
  check((rec.decks || []).some((d) => d.id === made), 'the deck is back in the account’s index');
  check(await peek('k=' + encodeURIComponent('rt:deck:u1:' + made)) !== null, 'and its body is stored');

  console.log('--- 5. ...but not when the account still has decks and one was deleted elsewhere');
  const gone = await evaluate(`(async () => { const m = await import('/src/battlemap.js'); const d = m.newBattleMap('Deleted on the phone'); const kept = JSON.parse(localStorage.getItem('rt:decks')||'[]'); kept.push({ id: d.id, name: d.name, map: m.packMap(d.map) }); localStorage.setItem('rt:decks', JSON.stringify(kept)); const mv = JSON.parse(localStorage.getItem('rt:localmoved')); mv.u1.d.push(d.id); localStorage.setItem('rt:localmoved', JSON.stringify(mv)); return d.id; })()`);
  await reload();
  rec = await accountRecord();
  check(!(rec.decks || []).some((d) => d.id === gone), 'a deck the account used to hold, removed elsewhere, is not forced back');
  check((rec.decks || []).some((d) => d.id === made), 'while the one it still holds stays');
} catch (e) { failed = true; console.log('FAIL', e.stack || e.message); }
console.log('errors', A.errors.filter((e) => !/Maximum update depth|createRoot|simulated outage|500|Failed to load resource/.test(e)).slice(0, 3));
await A.close(); process.exit(failed ? 1 : 0);
