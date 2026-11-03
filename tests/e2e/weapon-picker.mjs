// The weapon picker: several guns, one jams and another is taken up; a sheet with no weapon is told so and can add one.
import { launch } from './cdp.mjs';
import { tmpdir } from 'node:os';
const SP = process.argv[2] || tmpdir();
const b = await launch({ width: 1300, height: 2300, port: 9611 });
const { evaluate, shot, sleep } = b;
let failed = false;
const check = (c, m) => { if (!c) { failed = true; console.log('  FAIL', m); } else console.log('  ok  ', m); };
const clickText = (sel, re) => evaluate(`(() => { const e=[...document.querySelectorAll(${JSON.stringify(sel)})].find(x=>new RegExp(${JSON.stringify(re)},'i').test(x.textContent)); if(!e) return false; e.click(); return true; })()`);
const dice = (v) => evaluate(`Math.random = () => ${v}; true`);
const roller = () => evaluate(`document.querySelector('.rt-roller')?.innerText.replace(/\\s+/g,' ')||''`);
const chips = () => evaluate(`[...document.querySelectorAll('.rt-roller .rt-wpn-opt')].map(e=>({ t: e.innerText.replace(/\\s+/g,' ').trim(), on: e.getAttribute('aria-checked')==='true', bad: e.classList.contains('bad') }))`);
const setSel = (sel, label) => evaluate(`(() => { const s=document.querySelector(${JSON.stringify(sel)}); if(!s) return false; const o=[...s.options].find(o=>o.textContent.trim()===${JSON.stringify(label)}); if(!o) return false; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value); s.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
const rollBtn = () => clickText('.rt-roller .rt-rollbtn', 'Roll attack|Roll d100');
const openRoller = async (label) => {
  await evaluate(`document.querySelector('.rt-dice.on')?.click()`); await sleep(150);
  await evaluate(`document.querySelector('.rt-dice[aria-label=${JSON.stringify('Roll a ' + label + ' test')}]').click()`); await sleep(300);
};
const toDossier = async () => { await evaluate(`document.querySelectorAll('.rt-step')[7].click()`); await sleep(600); };
try {
  await b.send('Page.navigate', { url: 'http://localhost:5201/' }); await sleep(1300);
  await evaluate(`localStorage.clear()`); await b.send('Page.navigate', { url: 'http://localhost:5201/' }); await sleep(1500);
  await clickText('.rt-card', '^T.au'); await sleep(500);
  await clickText('.rt-card', 'T.au Fire Warrior'); await sleep(500);
  await clickText('.rt-opt', '^Precise Hunter$'); await sleep(200);
  await evaluate(`document.querySelectorAll('.rt-step')[6].click()`); await sleep(400);
  await clickText('.rt-btn', 'Roll 2d10 on the T.au base'); await sleep(200);
  await toDossier();

  console.log('--- three guns: each its own button, with its rounds, the first ready one chosen');
  await openRoller('Ballistic Skill');
  let c = await chips();
  console.log('   ', JSON.stringify(c.map((x) => x.t + (x.on ? ' [on]' : ''))));
  check(c.length === 4, 'three guns and a no-weapon button: ' + c.length);
  check(c[0].on && /Good Pulse Rifle 36\/36/.test(c[0].t), 'the rifle is chosen, and shows 36/36');
  check(/Good Pulse Carbine \d+\/\d+/.test(c[1].t) && /Best Pulse Pistol \d+\/\d+/.test(c[2].t), 'the carbine and the pistol show theirs');
  check(c[3].t === 'No weapon plain test' && !c[3].on, 'No weapon is the last, unchosen');
  await shot(SP + '/pick-1.png');

  console.log('--- the rifle jams on a 100');
  await dice(0.995);                       // roll 100, and the Reliable d10 comes up 10
  await rollBtn(); await sleep(400);
  c = await chips();
  check(c[0].t.includes('JAMMED') && c[0].bad, 'the rifle’s button says JAMMED');
  check(c[0].on, 'and it is still the one chosen (nothing switched behind the player’s back)');
  let t = await roller();
  const useBtn = await evaluate(`[...document.querySelectorAll('.rt-roller .rt-warn button')].map(x=>x.textContent.trim())`);
  console.log('   ', JSON.stringify(useBtn));
  check(useBtn.length === 1 && /Use the Good Pulse Carbine instead/.test(useBtn[0]), 'the warning offers the carbine');
  await shot(SP + '/pick-2.png');

  console.log('--- trying the jammed rifle again is refused, and the way out is named');
  await rollBtn(); await sleep(300);
  t = await roller();
  check(/Good Pulse Rifle is jammed/i.test(t) && /Or use the Good Pulse Carbine/i.test(t), 'it says so and points at the carbine');
  check((await chips())[0].t.includes('JAMMED'), 'nothing was spent or changed');

  console.log('--- switch to the carbine and fire it');
  await clickText('.rt-roller .rt-warn button', 'Use the Good Pulse Carbine');
  await sleep(200);
  c = await chips();
  check(c[1].on && !c[0].on, 'the carbine is chosen');
  check(/Roll attack with the Good Pulse Carbine/i.test(await roller()), 'the button names it');
  await dice(0.02);
  await rollBtn(); await sleep(400);
  c = await chips();
  const clip = Number((c[1].t.match(/\/(\d+)/) || [])[1]);
  check(new RegExp(`${clip - 1}/${clip}`).test(c[1].t), 'a round came out of the carbine: ' + c[1].t);
  check(c[0].t.includes('JAMMED'), 'the rifle is still jammed');
  check(/Success/.test(await roller()) && (await evaluate(`!!document.querySelector('.rt-hit')`)), 'and the carbine hit, with its damage panel');

  console.log('--- reopening the roller starts on a gun that can fire');
  await evaluate(`document.querySelector('.rt-dice.on').click()`); await sleep(200);
  await openRoller('Ballistic Skill');
  c = await chips();
  check(c[1].on && !c[0].on, 'the carbine, not the jammed rifle');

  console.log('--- picking the rifle on purpose still works, and clearing the jam frees it');
  await clickText('.rt-roller .rt-wpn-opt', '^Good Pulse Rifle'); await sleep(200);
  check(/Clear jam/.test(await roller()), 'Clear jam is offered for it');
  await dice(0.02);
  await clickText('.rt-roller .rt-btnrow button', 'Clear jam'); await sleep(300);
  c = await chips();
  check(/Good Pulse Rifle EMPTY/.test(c[0].t) && !/JAMMED/.test(c[0].t), 'cleared: no longer JAMMED, but empty, as the rules have it: ' + c[0].t);

  console.log('--- a sheet with no melee weapon says so, and a weapon can be added');
  await evaluate(`document.querySelector('.rt-dice.on').click()`); await sleep(200);
  await openRoller('Weapon Skill');
  t = await roller();
  check(/No melee weapon on this character.s gear list/i.test(t), 'it says there is no melee weapon');
  check((await chips()).length === 0, 'with no buttons to choose from');
  check(/Roll d100/i.test(t) && !/Roll attack with/i.test(t), 'the plain roll is still there');
  const cat = await evaluate(`[...document.querySelectorAll('.rt-roller .rt-wpn select option')].map(o=>o.textContent.trim())`);
  check(cat.length > 5 && cat.includes('Chainsword') && !cat.includes('Laspistol'), 'the catalogue offers melee weapons only: ' + cat.length);
  await shot(SP + '/pick-3.png');
  check(await setSel('.rt-roller .rt-wpn select', 'Chainsword'), 'the chainsword is chosen from the catalogue');
  await sleep(400);
  c = await chips();
  check(c.length === 2 && c[0].on && /^Chainsword/.test(c[0].t), 'it is now a button, and chosen');
  check(/Roll attack with the Chainsword/i.test(await roller()), 'the button names it');
  const inGear = await evaluate(`(JSON.parse(localStorage.getItem('rt:current')||'{}').extras||{}).gear||[]`);
  check(inGear.includes('Chainsword'), 'and it was put on the gear list: ' + JSON.stringify(inGear));

  console.log('--- all of it survives a reload');
  await b.send('Page.navigate', { url: 'http://localhost:5201/' }); await sleep(1800);
  await toDossier();
  await openRoller('Weapon Skill');
  check((await chips()).some((x) => /^Chainsword/.test(x.t)), 'the chainsword is still carried');
  await evaluate(`document.querySelector('.rt-dice.on').click()`); await sleep(200);
  await openRoller('Ballistic Skill');
  c = await chips();
  console.log('   ', JSON.stringify(c.map((x) => x.t + (x.on ? ' [on]' : ''))));
  check(/Good Pulse Carbine/.test(c.find((x) => x.on).t), 'the ready carbine is the default');
  check(/Good Pulse Rifle EMPTY/.test(c[0].t) && /Carbine 23\/24/.test(c[1].t), 'rounds were kept: ' + c[0].t + ', ' + c[1].t);
} catch (e) { failed = true; console.log('FAIL', e.stack || e.message); }
console.log('errors', b.errors.slice(0, 3));
await b.close(); process.exit(failed ? 1 : 0);
