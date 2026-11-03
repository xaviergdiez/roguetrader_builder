// The heavy screens (Lore, battle map, void map) are fetched when first opened. They must still
// open, and a download that fails must offer Try again and recover, not leave a dead button.
import { launch } from './cdp.mjs';
import { tmpdir } from 'node:os';
const SP = process.argv[2] || tmpdir();
const b = await launch({ width: 1400, height: 1200, port: 9641 });
const { evaluate, shot, sleep, send } = b;
let failed = false;
const check = (c, m) => { if (!c) { failed = true; console.log('  FAIL', m); } else console.log('  ok  ', m); };
const clickText = (sel, re) => evaluate(`(() => { const e=[...document.querySelectorAll(${JSON.stringify(sel)})].find(x=>new RegExp(${JSON.stringify(re)},'i').test(x.textContent)); if(!e) return false; e.click(); return true; })()`);
const APP = 'http://localhost:5201/';
const text = () => evaluate(`document.body.innerText.replace(/\\s+/g,' ')`);
const closeAll = () => evaluate(`document.querySelectorAll('dialog[open]').forEach(d=>d.close())`);
// GM -> Battle map -> New deck: the map component itself is drawn once a deck is open.
const openBattleMap = async () => {
  await evaluate(`document.querySelector('.rt-headbtn.gm').click()`); await sleep(500);
  await clickText('.rt-gm button', '^battle map'); await sleep(700);
  await clickText('.rt-gm button', '^new deck$'); await sleep(1500);
};
const mapDrawn = () => evaluate(`document.querySelectorAll('.rt-gm canvas').length > 0`);

try {
  await send('Network.enable');
  await b.send('Page.navigate', { url: APP }); await sleep(1300);
  await evaluate(`localStorage.clear()`); await b.send('Page.navigate', { url: APP }); await sleep(1500);

  console.log('--- Lore opens');
  await clickText('.rt-headbtn', '^lore'); await sleep(1200);
  check(await evaluate(`!!document.querySelector('dialog[open]')`), 'the Lore dialog is open');
  check(/Lore/i.test(await evaluate(`document.querySelector('dialog[open]')?.innerText||''`)), 'and holds its pages');
  await closeAll(); await sleep(200);

  console.log('--- the battle map opens');
  await openBattleMap();
  check(await mapDrawn(), 'the map itself is drawn (a canvas inside the GM dashboard)');
  check(!/Something went wrong/.test(await text()), 'with no error');
  await shot(SP + '/lazy-1.png');
  await closeAll(); await sleep(200);

  console.log('--- a failed download: the map code cannot be fetched');
  await b.send('Page.navigate', { url: APP }); await sleep(1500);
  await send('Network.setBlockedURLs', { urls: ['*BattleMap*'] });
  await openBattleMap();
  let t = await text();
  check(/Something went wrong drawing the battle map/.test(t), 'it says so, instead of doing nothing: ' + (t.match(/Something went wrong[^.]*\./) || [''])[0]);
  check(await evaluate(`!![...document.querySelectorAll('button')].find(x=>/Try again/.test(x.textContent))`), 'and offers Try again');
  await shot(SP + '/lazy-2.png');

  console.log('--- the connection comes back and Try again recovers');
  await send('Network.setBlockedURLs', { urls: [] });
  await clickText('button', 'Try again'); await sleep(1500);
  t = await text();
  check(!/Something went wrong drawing the battle map/.test(t), 'the message is gone');
  check(await mapDrawn(), 'and the map is drawn');
} catch (e) { failed = true; console.log('FAIL', e.stack || e.message); }
const unexpected = b.errors.filter((e) => !/BattleMap|Failed to fetch|dynamically imported|ERR_BLOCKED|net::|The above error|Error: /i.test(e));
console.log('errors besides the provoked ones:', unexpected.slice(0, 3));
await b.close(); process.exit(failed ? 1 : 0);
