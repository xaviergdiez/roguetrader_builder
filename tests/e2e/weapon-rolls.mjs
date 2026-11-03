// A WS/BS roll with the carried weapons: rounds, bursts, jams, overheating, damage, persistence.
import { launch } from './cdp.mjs';
import { tmpdir } from 'node:os';
const SP = process.argv[2] || tmpdir();
const b = await launch({ width: 1300, height: 2300, port: 9601 });
const { evaluate, shot, sleep } = b;
let failed = false;
const check = (c, m) => { if (!c) { failed = true; console.log('  FAIL', m); } else console.log('  ok  ', m); };
const clickText = (sel, re) => evaluate(`(() => { const e=[...document.querySelectorAll(${JSON.stringify(sel)})].find(x=>new RegExp(${JSON.stringify(re)},'i').test(x.textContent)); if(!e) return false; e.click(); return true; })()`);
const dice = (v) => evaluate(`Math.random = () => ${v}; true`);
const roller = () => evaluate(`document.querySelector('.rt-roller')?.innerText.replace(/\\s+/g,' ')||''`);
const setSel = (sel, label) => evaluate(`(() => { const s=document.querySelector(${JSON.stringify(sel)}); if(!s) return false; const o=[...s.options].find(o=>o.textContent.trim()===${JSON.stringify(label)}); if(!o) return false; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value); s.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
const rollBtn = () => clickText('.rt-roller .rt-rollbtn', 'Roll attack|Roll d100');
const openRoller = async (label) => {
  await evaluate(`document.querySelector('.rt-roller') && document.querySelector('.rt-dice.on')?.click()`); await sleep(150);
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

  console.log('--- the Ballistic Skill roller offers the weapons carried');
  await openRoller('Ballistic Skill');
  let opts = await evaluate(`[...document.querySelectorAll('.rt-roller .rt-wpn-opt b')].map(o=>o.textContent.trim())`);
  console.log('   ', opts);
  check(opts.includes('Good Pulse Rifle') && opts.includes('Good Pulse Carbine') && opts.includes('Best Pulse Pistol'), 'the three guns are listed');
  check(!opts.some((o) => /Knife|Armour|Grenade|Markerlight/.test(o)), 'and nothing that is not a gun');
  check(opts.some((o) => /No weapon/.test(o)), 'with a way to roll the bare skill');
  let t = await roller();
  check(/Rounds 36\/36/.test(t), 'a fresh rifle is full: 36/36');
  check(/Standard Attack/.test(t) && /Semi-Auto Burst/.test(t) && /Full-Auto Burst/.test(t), 'single, semi and full auto for a rifle');
  check(/Roll attack with the Good Pulse Rifle/i.test(t), 'the button names the weapon');

  console.log('--- a hit: a round spent, the weapon’s own damage ready');
  await dice(0.02);                       // a 3: an automatic success
  await rollBtn(); await sleep(400);
  t = await roller();
  check(/Rounds 35\/36/.test(t), 'one round spent: 35/36');
  check(/Success/.test(t), 'it hit');
  let hit = await evaluate(`(() => { const h=document.querySelector('.rt-hit'); if(!h) return null; const n=[...h.querySelectorAll('.rt-num')].map(l=>[l.textContent.trim().replace(/\\s+/g,' '), l.querySelector('input').value]); return { head: h.querySelector('.rt-hit-h').innerText.replace(/\\s+/g,' '), nums: Object.fromEntries(n.map(([k,v])=>[k.replace(/\\s*\\d.*/,'').trim()||k,v])), btn: h.querySelector('.rt-rollbtn').textContent.trim() }; })()`);
  console.log('   ', JSON.stringify(hit));
  check(hit && /Good Pulse Rifle/i.test(hit.head), 'the hit panel names the weapon');
  check(hit && hit.btn === 'Roll 2d10+3 damage', 'it rolls the rifle’s 2d10+3: ' + (hit && hit.btn));
  check(hit && hit.nums.Pen === '4', 'with its Penetration of 4');
  check(await evaluate(`[...document.querySelectorAll('.rt-hit .rt-pick.on')].map(x=>x.textContent).join('|')`).then((v) => /Energy/.test(v)), 'and its damage type, Energy');
  await clickText('.rt-hit .rt-rollbtn', 'Roll 2d10'); await sleep(300);
  check(/damage \(/.test(await evaluate(`document.querySelector('.rt-hit .rt-hitline')?.innerText||''`)), 'and the damage can be rolled');

  console.log('--- a burst: three rounds, a hit per two degrees, one panel per hit');
  await clickText('.rt-roller .rt-diff', 'Semi-Auto Burst'); await sleep(200);
  check(/TARGET\s*\d+/.test(await roller()), 'the target includes the burst bonus');
  const tgtBefore = Number((await roller()).match(/TARGET\s*(\d+)/)[1]);
  await clickText('.rt-roller .rt-diff', 'Standard Attack'); await sleep(200);
  const tgtSingle = Number((await roller()).match(/TARGET\s*(\d+)/)[1]);
  check(tgtBefore - tgtSingle === 10, 'a burst is +10 to hit (' + tgtSingle + ' -> ' + tgtBefore + ')');
  await clickText('.rt-roller .rt-diff', 'Semi-Auto Burst'); await sleep(200);
  await dice(0.02); await rollBtn(); await sleep(400);
  t = await roller();
  check(/Rounds 33\/36/.test(t), 'a semi-auto burst spends the rifle\u2019s two: 33/36');
  check(/hit 1 of 2/.test(t), 'two hits scored, the pistol-rifle’s semi-auto rate: ' + (t.match(/hit \d of \d/) || ['none'])[0]);
  await clickText('.rt-hit .rt-rollbtn', 'Roll 2d10'); await sleep(300);
  check(await clickText('.rt-hit .rt-opt', 'Next hit'), 'the second hit is a click away');
  await sleep(300);
  t = await roller();
  check(/hit 2 of 2/.test(t), 'hit 2 of 2');
  await clickText('.rt-hit .rt-rollbtn', 'Roll 2d10'); await sleep(300);
  check(/That was the last hit: \d+ Wounds lost across 2 hits/.test(await roller()), 'and the last says what the burst cost in all');
  await shot(SP + '/atk-1.png');

  console.log('--- a jam: 98 on a gun, an automatic miss, and it will not fire again');
  await clickText('.rt-roller .rt-diff', 'Standard Attack'); await sleep(200);
  await dice(0.97);                       // a 98, and a 10 on the Reliable die
  await rollBtn(); await sleep(400);
  t = await roller();
  check(/JAMMED/.test(t) && /automatic miss/i.test(t), 'JAMMED, an automatic miss');
  check(/Rounds 32\/36 · JAMMED/.test(t), 'the round was spent: 32/36');
  check(!(await evaluate(`!!document.querySelector('.rt-hit')`)), 'and there is no hit to roll');
  await rollBtn(); await sleep(300);
  check(/is jammed\. Clear the jam first/.test(await roller()), 'it will not fire while jammed');
  check(/Rounds 32\/36/.test(await roller()), 'and nothing more was spent');
  await dice(0.02);
  await clickText('.rt-roller .rt-opt', 'Clear jam'); await sleep(300);
  t = await roller();
  check(/Jam cleared\. The weapon needs reloading and its ammo is lost/.test(t), 'a BS Test clears the jam');
  check(/Rounds 0\/36(?! · JAMMED)/.test(t), 'leaving it empty, and no longer jammed (the log keeps its history)');
  check(!(await evaluate(`!!document.querySelector('.rt-roller .rt-warn')`)), 'and the jam warning is gone');
  await rollBtn(); await sleep(300);
  check(/has 0 rounds; that needs 1\. Reload\./.test(await roller()), 'an empty weapon will not fire');
  await clickText('.rt-roller .rt-opt', '^Reload$'); await sleep(300);
  check(/Rounds 36\/36/.test(await roller()), 'Reload fills the clip');

  console.log('--- the clip survives a reload of the page');
  await dice(0.02); await rollBtn(); await sleep(300);
  check(/Rounds 35\/36/.test(await roller()), 'one more fired: 35/36');
  await sleep(900);                       // the autosave
  await b.send('Page.navigate', { url: 'http://localhost:5201/' }); await sleep(1800);
  await toDossier();
  await openRoller('Ballistic Skill');
  check(/Rounds 35\/36/.test(await roller()), 'still 35/36 after a reload');

  console.log('--- a weapon that overheats');
  await evaluate(`(() => { const j=JSON.parse(localStorage.getItem('rt:current')); j.extras.gear=[...(j.extras.gear||[]),'Plasma Gun','Chainsword']; localStorage.setItem('rt:current', JSON.stringify(j)); })()`);
  await b.send('Page.navigate', { url: 'http://localhost:5201/' }); await sleep(1800);
  await toDossier(); await openRoller('Ballistic Skill');
  check(await clickText('.rt-roller .rt-wpn-opt', '^Plasma Gun'), 'a plasma gun can be picked');
  await sleep(200);
  await evaluate(`(() => { const x=[...document.querySelectorAll('.rt-roller .rt-diff')].find(e=>/^Easy/.test(e.textContent.trim())); x && x.click(); })()`);   // +30
  await dice(0.91);                       // a 92: over 91, under 96
  await rollBtn(); await sleep(400);
  t = await roller();
  check(/OVERHEATS/.test(t), 'a 92 overheats it');
  check(!/JAMMED/.test(t), 'which is not a jam');
  await clickText('.rt-roller .rt-opt', 'Roll the overheat damage'); await sleep(300);
  t = await roller();
  check(/\d+ Energy damage \(\d+\) \+ 6\) to an arm|\d+ E damage \(\d+ \+ 6\) to an arm|damage \(\d+ \+ 6\) to an arm/.test(t), 'its own damage can be rolled, to an arm: ' + (t.match(/\d+ \w+ damage \([^)]*\) to an arm/) || ['?'])[0]);
  await shot(SP + '/atk-2.png');

  console.log('--- melee: the chainsword, and the wielder’s Strength Bonus');
  await openRoller('Weapon Skill');
  opts = await evaluate(`[...document.querySelectorAll('.rt-roller .rt-wpn-opt b')].map(o=>o.textContent.trim())`);
  check(opts.includes('Chainsword'), 'the Weapon Skill roller offers the chainsword: ' + opts.join(', '));
  check(!opts.some((o) => /Pulse/.test(o)), 'and no guns');
  t = await roller();
  check(/All-Out Attack/.test(t) && /Charge/.test(t) && /Guarded Attack/.test(t), 'melee stances are the choices');
  check(!/Rounds/.test(t), 'a blade has no clip');
  await dice(0.02); await rollBtn(); await sleep(400);
  hit = await evaluate(`(() => { const h=document.querySelector('.rt-hit'); return h && { head: h.querySelector('.rt-hit-h').innerText.replace(/\\s+/g,' '), btn: h.querySelector('.rt-rollbtn').textContent.trim() }; })()`);
  const strength = await evaluate(`(() => { const els=[...document.querySelectorAll('*')].filter(e=>e.children.length===0 && /^Strength$/i.test(e.textContent.trim())); for (const e of els) { let n=e; for (let i=0;i<4&&n;i++,n=n.parentElement) { const m=(n.innerText||'').replace(/\\s+/g,' ').match(/Strength\\s*(\\d{1,3})\\b/i); if (m) return Number(m[1]); } } return null; })()`);
  const sb = strength == null ? null : Math.floor(strength / 10);
  console.log('   ', JSON.stringify(hit), 'SB', sb);
  const sbSaid = hit && (hit.head.match(/includes \+(\d+) Strength Bonus/i) || [])[1];
  check(Boolean(sbSaid) && (sb == null || Number(sbSaid) === sb), 'the panel says it includes the Strength Bonus: +' + sbSaid + ' (Strength ' + strength + ' -> ' + sb + ')');
  check(hit && hit.btn === `Roll 1d10+${2 + Number(sbSaid)} damage`, 'a chainsword\u2019s 1d10+2 plus its wielder\u2019s Strength Bonus +' + sbSaid + ': ' + (hit && hit.btn));

  console.log('--- with no weapon chosen it is the plain skill test it always was');
  await openRoller('Ballistic Skill');
  await clickText('.rt-roller .rt-wpn-opt', '^No weapon'); await sleep(200);
  check(/Roll d100/i.test(await roller()), 'the plain button');
  await dice(0.02); await rollBtn(); await sleep(300);
  hit = await evaluate(`(() => { const h=document.querySelector('.rt-hit'); return h && h.querySelector('.rt-rollbtn').textContent.trim(); })()`);
  check(hit === 'Roll 1d10 damage', 'and the hit panel is the manual one: ' + hit);
} catch (e) { failed = true; console.log('FAIL', e.stack || e.message); }
console.log('errors', b.errors.filter((e) => !/Maximum update depth|createRoot|Failed to load resource/.test(e)).slice(0, 3));
await b.close(); process.exit(failed ? 1 : 0);
