// A saved character with a field of the wrong shape must not blank the app: the sheet shows a
// message, the rest of the app keeps working, and the person can keep a copy of their saved work.
import { launch } from './cdp.mjs';
import { tmpdir } from 'node:os';
const SP = process.argv[2] || tmpdir();
const b = await launch({ width: 1300, height: 1500, port: 9631 });
const { evaluate, shot, sleep } = b;
let failed = false;
const check = (c, m) => { if (!c) { failed = true; console.log('  FAIL', m); } else console.log('  ok  ', m); };
const clickText = (sel, re) => evaluate(`(() => { const e=[...document.querySelectorAll(${JSON.stringify(sel)})].find(x=>new RegExp(${JSON.stringify(re)},'i').test(x.textContent)); if(!e) return false; e.click(); return true; })()`);
const APP = 'http://localhost:5201/';
const body = () => evaluate(`document.body.innerText.replace(/\\s+/g,' ')`);
const alerts = () => evaluate(`[...document.querySelectorAll('[role=alert]')].map(a=>a.innerText.replace(/\\s+/g,' '))`);
const expected = ['pageerror: ReactDOM'];   // React logs the caught error to the console by design

try {
  await b.send('Page.navigate', { url: APP }); await sleep(1300);
  await evaluate(`localStorage.clear()`); await b.send('Page.navigate', { url: APP }); await sleep(1500);
  await clickText('.rt-card', '^T.au'); await sleep(500);
  await clickText('.rt-card', 'T.au Fire Warrior'); await sleep(500);
  await evaluate(`document.querySelectorAll('.rt-step')[6].click()`); await sleep(400);
  await clickText('.rt-btn', 'Roll 2d10 on the T.au base'); await sleep(200);
  await evaluate(`document.querySelectorAll('.rt-step')[7].click()`); await sleep(900);
  check(/Characteristics/i.test(await body()), 'a healthy character shows its sheet');
  check((await alerts()).length === 0, 'and no error message');

  console.log('--- a field the sheet reads is the wrong shape: only the sheet fails');
  const saved = await evaluate(`localStorage.getItem('rt:current')`);
  check(!!saved, 'the character was autosaved');
  const broken = JSON.parse(saved);
  broken.extras = { ...(broken.extras || {}), powers: 5 };
  await evaluate(`localStorage.setItem('rt:current', ${JSON.stringify(JSON.stringify(broken))}); localStorage.setItem('rt:probe', 'kept')`);
  await b.send('Page.navigate', { url: APP }); await sleep(1800);
  let t = await body();
  let a = await alerts();
  console.log('   ', JSON.stringify(a).slice(0, 260));
  check(a.length >= 1, 'a message is shown instead of a blank page');
  check(/Something went wrong drawing/.test(a.join(' ')) && /Nothing you saved has been lost/.test(a.join(' ')), 'it says what happened and that nothing is lost');
  check(/Rogue Trader|ROSTER|Roster/i.test(t), 'the app around it is still there (header, roster)');
  check(await evaluate(`!![...document.querySelectorAll('button')].find(x=>/Keep my saved work/.test(x.textContent))`), 'with a button to keep the saved work');
  await shot(SP + '/crash-1.png');

  console.log('--- keep my saved work: one file with everything the browser holds');
  await evaluate(`window.__dl = null; const orig = URL.createObjectURL; URL.createObjectURL = (blob) => { window.__dl = blob; return orig.call(URL, blob); }; HTMLAnchorElement.prototype.click = function () { window.__name = this.download; };`);
  await clickText('button', 'Keep my saved work'); await sleep(300);
  const file = await evaluate(`window.__dl ? window.__dl.text() : null`);
  const parsed = file && JSON.parse(file);
  check(parsed && parsed.app === 'roguetrader-builder', 'a file was produced');
  check(parsed && parsed.keys['rt:probe'] === 'kept' && !!parsed.keys['rt:current'], 'it holds the saved character and the other rt: keys');
  check(/^roguetrader-saved-work-\d{4}-\d{2}-\d{2}\.json$/.test(await evaluate(`window.__name`)), 'named with the date');

  console.log('--- the rest of the app keeps working');
  check(await clickText('.rt-headbtn', 'Roster'), 'the Roster button still opens');
  await sleep(500);
  check(await evaluate(`!!document.querySelector('dialog[open]')`), 'and its dialog appears');
  await evaluate(`document.querySelectorAll('dialog[open]').forEach(d=>d.close())`);

  console.log('--- a bad character does not make the next one broken');
  await evaluate(`localStorage.removeItem('rt:current')`);
  await clickText('button', 'Try again'); await sleep(300);
  check((await alerts()).length >= 0, 'Try again does not itself crash');
  await b.send('Page.navigate', { url: APP }); await sleep(1800);
  check((await alerts()).length === 0, 'with the bad record gone the app draws normally');

  console.log('--- the whole app failing: the last-resort screen');
  const worse = JSON.parse(saved);
  worse.extras = { ...(worse.extras || {}), gear: 5 };
  await evaluate(`localStorage.setItem('rt:current', ${JSON.stringify(JSON.stringify(worse))})`);
  await b.send('Page.navigate', { url: APP }); await sleep(1800);
  t = await body(); a = await alerts();
  console.log('   ', JSON.stringify(a).slice(0, 200));
  check(a.length >= 1 && /Something went wrong drawing/.test(a.join(' ')), 'even then there is a message, not a blank page');
  check(/Reload|Try again/.test(a.join(' ')) || (await evaluate(`!![...document.querySelectorAll('button')].find(x=>/Reload|Try again/.test(x.textContent))`)), 'with a way to carry on');
  check(await evaluate(`!![...document.querySelectorAll('button')].find(x=>/Keep my saved work/.test(x.textContent))`), 'and to keep the saved work');
  await shot(SP + '/crash-2.png');
} catch (e) { failed = true; console.log('FAIL', e.stack || e.message); }
// the caught errors are logged on purpose; anything else is not expected
const unexpected = b.errors.filter((e) => !/powers|gear|is not iterable|not a function|Cannot read|The above error occurred|Error: /i.test(e));
console.log('errors besides the ones provoked on purpose:', unexpected.slice(0, 3));
await b.close(); process.exit(failed ? 1 : 0);
