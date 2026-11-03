// Decks made while signed in, whose index was wiped by a sign-in: found again.
// Real api handlers on a fake Upstash (sim-api2.mjs), the app on :5201 proxying /api to it.
import { launch } from './cdp.mjs';
import { tmpdir } from 'node:os';
const SP = process.argv[2] || tmpdir();
const A = await launch({ width: 1400, height: 1500, port: 9571 });
const { evaluate, send, sleep } = A;
let failed = false;
const check = (c, m) => { if (!c) { failed = true; console.log('  FAIL', m); } else console.log('  ok  ', m); };
const peek = async (q) => (await fetch('http://127.0.0.1:5292/?' + q)).json();
const APP = 'http://localhost:5201/';
const reload = async (ms = 2800) => { await send('Page.navigate', { url: APP }); await sleep(ms); };
const index = () => evaluate(`fetch('/api/decks',{credentials:'same-origin'}).then(r=>r.json()).then(j=>j.decks)`);
const reindexCalls = async (clear) => (await peek('log=' + (clear ? 'clear' : '1'))).filter((r) => r.startsWith('POST /api/decks?reindex=1')).length;
// make a deck the way the app does, and save it to the account over the real API
const saveDeck = (name, seedX) => evaluate(`(async () => { const m = await import('/src/battlemap.js'); const d = m.newBattleMap(${JSON.stringify(name)});
  const map = { ...d.map, cols: 30 + ${seedX}, rows: 20 + ${seedX}, floor: Object.fromEntries(Array.from({ length: 5 + ${seedX} }, (_, i) => [i + ',1', true])) };
  const r = await fetch('/api/decks?d=' + encodeURIComponent(d.id), { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: ${JSON.stringify(name)}, map: m.packMap(m.readMap(map)) }) });
  return { id: d.id, status: r.status }; })()`);

try {
  await send('Network.enable');
  await send('Network.setCookie', { name: 'sid', value: 'SIM1', domain: 'localhost', path: '/' });
  await send('Page.navigate', { url: APP }); await sleep(1800);
  await evaluate(`localStorage.clear()`);

  console.log('--- setup: three decks saved while signed in, in the account');
  const made = [];
  for (const [n, x] of [['Hulk deck', 0], ['Bridge', 2], ['Cargo hold', 4]]) made.push(await saveDeck(n, x));
  check(made.every((m) => m.status === 200), 'saved over the real API');
  check((await index()).length === 3, 'the index lists them');

  console.log('--- a sign-in elsewhere wipes the account record, as the old callback did');
  await peek('wipe=1');
  check((await index()).length === 0, 'the index is empty');
  const keys = await peek('');
  for (const m of made) check(keys.includes('rt:deck:u1:' + m.id), 'but the body of ' + m.id.slice(0, 8) + ' is still stored');

  // other things that must not be picked up
  await evaluate(`fetch('/api/decks?d=other',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.status)`);
  const { store } = { store: null };
  await peek('log=clear');

  console.log('--- a fresh browser opens the app signed in (nothing local): the decks come back');
  await reload();
  const after = await index();
  check(after.length === 3, 'the index lists three again: ' + after.map((d) => d.name).join(', '));
  check(after.every((d) => /^Recovered deck \d$/.test(d.name)), 'under generic names');
  check(made.every((m) => after.some((d) => d.id === m.id)), 'the very same decks, by id');
  check(after.every((d) => d.cols >= 30 && d.rows >= 20 && d.squares >= 5), 'with their real sizes read back');
  const asked = await reindexCalls(false);
  console.log('   reindex requests:', asked, JSON.stringify((await peek('log=1')).filter((r) => /decks|homebrew|grounds/.test(r)).slice(0, 12)));
  check(asked === 1, 'it asked the account once');

  // open the library: they are there, with their size, and the note says so
  await evaluate(`document.querySelector('.rt-headbtn.gm').click()`); await sleep(500);
  await evaluate(`[...document.querySelectorAll('.rt-gm button')].find(e=>e.textContent.trim().toLowerCase().startsWith('battle map')).click()`); await sleep(700);
  await evaluate(`[...document.querySelectorAll('.rt-gm button')].find(e=>/^Library/.test(e.textContent.trim())).click()`); await sleep(700);
  const lib = await evaluate(`document.querySelector('.rt-gm')?.innerText.replace(/\\s+/g,' ')||''`);
  check((lib.match(/Recovered deck/g) || []).length >= 3, 'the library lists them');
  check(/Found 3 decks stored in your account/.test(lib), 'and says what happened');
  check(/find lost decks/i.test(lib), 'with a button to look again');

  console.log('--- it is not asked again on every load');
  await peek('log=clear');
  await reload();
  check(await reindexCalls(false) === 0, 'a second load does not scan');
  check((await index()).length === 3, 'and nothing was added or doubled');

  console.log('--- the button: a deck that drops out later is found on request');
  const later = await saveDeck('Drop pod', 1);
  await peek('wipe=1');
  check((await index()).length === 0, 'the index is wiped again');
  await reload();
  check((await index()).length === 0, 'a plain load does not look (already looked once)');
  await evaluate(`document.querySelector('.rt-headbtn.gm').click()`); await sleep(500);
  await evaluate(`[...document.querySelectorAll('.rt-gm button')].find(e=>e.textContent.trim().toLowerCase().startsWith('battle map')).click()`); await sleep(700);
  await evaluate(`[...document.querySelectorAll('.rt-gm button')].find(e=>/^Library/.test(e.textContent.trim())).click()`); await sleep(700);
  await evaluate(`[...document.querySelectorAll('.rt-gm button')].find(e=>/Find lost decks/.test(e.textContent)).click()`); await sleep(1800);
  const idx = await index();
  check(idx.length === 4, 'one press lists all four: ' + idx.length);
  const note = await evaluate(`document.querySelector('.rt-gm')?.innerText.replace(/\\s+/g,' ')||''`);
  check(/Found 4 decks that had dropped out of the list/.test(note), 'and says so');
  check(idx.some((d) => d.id === later.id), 'including the newest');

  console.log('--- pressing it with nothing lost says so and changes nothing');
  await evaluate(`[...document.querySelectorAll('.rt-gm button')].find(e=>/Find lost decks/.test(e.textContent)).click()`); await sleep(1500);
  const none = await evaluate(`document.querySelector('.rt-gm')?.innerText.replace(/\\s+/g,' ')||''`);
  check(/Nothing lost: every deck stored in your account is already in this list/.test(none), 'it says nothing was lost');
  check((await index()).length === 4, 'and the list is the same');

  console.log('--- a recovered deck opens');
  const first = idx[0];
  const opened = await evaluate(`fetch('/api/decks?d=${first.id}',{credentials:'same-origin'}).then(r=>r.status)`);
  check(opened === 200, 'its body reads back whole');
} catch (e) { failed = true; console.log('FAIL', e.stack || e.message); }
console.log('errors', A.errors.filter((e) => !/Maximum update depth|createRoot|Failed to load resource/.test(e)).slice(0, 3));
await A.close(); process.exit(failed ? 1 : 0);
