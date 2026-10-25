// The player's nerve: Pinning, Fear, Shock, Trauma and Malignancy tests, one
// tap each, in the bridge's ground-combat section.
//
// Every roll is made here and the outcome sent as an ordinary ground event
// (player_condition / player_response), so the table sees it in the log and
// on the character's condition chips. The rules live in sanity.js and
// groundcombat.js — Rogue Trader pp.248 and 294-300 — this is only the
// buttons.

import React, { useState } from 'react';
import { DIFFICULTIES, resolveTest } from './dice.js';
import {
  pinningTest, pinEscapeTest, pinnedCondition
} from './groundcombat.js';
import {
  fearTest, snapOutTest, traumaTest, traumaResult, malignancyTest,
  addInsanity, addCorruption, warpShockCorruption, insanityTrack, corruptionTrack, FEAR_LEVELS
} from './sanity.js';

const d = (n) => 1 + Math.floor(Math.random() * n);

// Conditions a snap-out Willpower Test ends (Shock table "snap out of it").
const SNAPPABLE = ['shaken', 'frozen', 'fleeing', 'frenzied'];

export default function NervePanel({
  willpower = 0, charId, name = 'A player', conditions = [], hostiles = [],
  insanity = 0, corruption = 0, onInsanity, onCorruption, emit, busy = false
}) {
  const [source, setSource] = useState('1');          // a hostile's id, or a manual 1-4
  const [combat, setCombat] = useState(true);
  const [warp, setWarp] = useState(false);
  const [underFire, setUnderFire] = useState(true);
  const [inMelee, setInMelee] = useState(false);
  const [result, setResult] = useState(null);         // last line shown
  const [pending, setPending] = useState({ trauma: 0, malignancy: 0 });

  const isPinned = conditions.some((c) => c.id === 'pinned');
  const snappable = conditions.filter((c) => SNAPPABLE.includes(c.id));
  const fearsome = hostiles.filter((n) => Number(n.fear) > 0);
  const picked = fearsome.find((n) => n.id === source) || null;
  const rating = picked ? picked.fear : Number(source) || 1;
  const fearless = false; // a character's own Fearless comes off their sheet, not here

  const setCond = (condition, text) => emit({ id: 'player_condition', charId, condition, text }, null);
  const clearCond = (id, text) => emit({ id: 'player_condition', charId, clear: id, text }, null);
  const note = (text) => emit({ id: 'player_response', charId, text }, null);

  const pinning = async () => {
    const t = pinningTest({ willpower, roll: d(100) });
    setResult(`Pinning Test (Hard -20): rolled ${t.roll} vs ${t.target} — ${t.pinned ? 'PINNED' : 'holds'}.`);
    if (t.pinned) await setCond(pinnedCondition(), `${name} is Pinned (rolled ${t.roll} vs ${t.target}).`);
    else await note(`${name} keeps their head up under fire (rolled ${t.roll} vs ${t.target}).`);
  };

  const escape = async () => {
    const t = pinEscapeTest({ willpower, roll: d(100), underFire, inMelee });
    setResult(t.automatic
      ? 'In melee: no longer Pinned.'
      : `Escape Pinning${underFire ? '' : ' (Easy +30)'}: rolled ${t.roll} vs ${t.target} — ${t.escaped ? 'free' : 'still Pinned'}.`);
    if (t.escaped) await clearCond('pinned', `${name} recovers from Pinning.`);
  };

  const fear = async () => {
    const t = fearTest({
      willpower, rating, roll: d(100), shockRoll: d(100), combat, fearless,
      insanityPoints: insanity
    });
    if (t.skipped) {
      setResult('Unaffected: no Fear Test needed.');
      return;
    }
    if (t.passed) {
      setResult(`Fear (${rating}) Test: rolled ${t.roll} vs ${t.target} — passed.`);
      await note(`${name} steels their nerve against Fear (${rating}).`);
      return;
    }
    const line = t.shock
      ? `Failed (rolled ${t.roll} vs ${t.target}). Shock ${t.shock.score}: ${t.shock.text}`
      : `Failed (rolled ${t.roll} vs ${t.target}). Unnerved: -10 to concentration while near it.`;
    const gained = t.insanity;
    const warpCp = warp ? warpShockCorruption(rating) : 0;
    const ins = gained ? addInsanity(insanity, gained) : null;
    const cor = warpCp ? addCorruption(corruption, warpCp) : null;
    setResult(`${line}${gained ? ` +${gained} Insanity.` : ''}${warpCp ? ` +${warpCp} Corruption.` : ''}`);
    setPending((p) => ({
      trauma: p.trauma + (ins ? ins.traumaTests : 0),
      malignancy: p.malignancy + (cor ? cor.malignancyTests : 0)
    }));
    if (gained && onInsanity) onInsanity(gained);
    if (warpCp && onCorruption) onCorruption(warpCp);
    await note(`${name} fails a Fear (${rating}) Test. ${t.shock ? t.shock.text : ''}`.trim());
    for (const c of t.conditions) await setCond(c, `${name}: ${c.id}.`);
  };

  const snap = async () => {
    const t = snapOutTest({ willpower, roll: d(100) });
    setResult(`Snap out of it: rolled ${t.roll} vs ${t.target} — ${t.snappedOut ? 'recovered' : 'still gripped'}.`);
    if (t.snappedOut) for (const c of snappable) await clearCond(c.id, `${name} snaps out of it.`);
  };

  const trauma = () => {
    const t = traumaTest({ willpower, insanityPoints: insanity, roll: d(100) });
    let line = `Trauma Test (${t.track.degree}, ${t.track.mod >= 0 ? '+' : ''}${t.track.mod || 0}): rolled ${t.roll} vs ${t.target}`;
    if (t.passed) line += ' — copes.';
    else line += ` — ${traumaResult(d(100), t.degrees).text}`;
    setResult(line);
    setPending((p) => ({ ...p, trauma: Math.max(0, p.trauma - 1) }));
  };

  const malignancy = () => {
    const t = malignancyTest({ willpower, corruptionPoints: corruption, roll: d(100) });
    setResult(`Malignancy Test (${t.track.degree}): rolled ${t.roll} vs ${t.target} — ${t.passed ? 'resists.' : 'a Malignancy manifests: roll on Table 10-8.'}`);
    setPending((p) => ({ ...p, malignancy: Math.max(0, p.malignancy - 1) }));
  };

  const ins = insanityTrack(insanity);
  const cor = corruptionTrack(corruption);

  return (
    <>
      <div className="rt-conds-h">Nerve</div>
      <p className="rt-vox-hint">
        Insanity {insanity} ({ins.degree}) {'·'} Corruption {corruption} ({cor.degree}) {'·'} Willpower {willpower}
      </p>
      <div className="rt-btnrow">
        <button className="rt-btn" disabled={busy} onClick={pinning}>Pinning Test</button>
        {isPinned && <button className="rt-btn" disabled={busy} onClick={escape}>Escape Pinning</button>}
        {snappable.length > 0 && <button className="rt-btn" disabled={busy} onClick={snap}>Snap out of it</button>}
      </div>
      {isPinned && (
        <div className="rt-gmmods">
          <label><input type="checkbox" checked={underFire} onChange={(e) => setUnderFire(e.target.checked)} /> still under fire</label>
          <label><input type="checkbox" checked={inMelee} onChange={(e) => setInMelee(e.target.checked)} /> in melee</label>
        </div>
      )}

      <div className="rt-gmmods">
        <label><span className="rt-der-k">Fear from</span>
          <select className="rt-sel" value={source} onChange={(e) => setSource(e.target.value)}>
            {fearsome.map((n) => <option key={n.id} value={n.id}>{n.name} (Fear {n.fear})</option>)}
            {FEAR_LEVELS.map((f) => <option key={f.rating} value={String(f.rating)}>{f.name} ({f.rating}) {f.mod}</option>)}
          </select>
        </label>
        <label><input type="checkbox" checked={combat} onChange={(e) => setCombat(e.target.checked)} /> in combat</label>
        <label><input type="checkbox" checked={warp} onChange={(e) => setWarp(e.target.checked)} /> warp entity</label>
      </div>
      <div className="rt-btnrow">
        <button className="rt-btn" disabled={busy} onClick={fear}>Fear Test</button>
        {pending.trauma > 0 && <button className="rt-btn" disabled={busy} onClick={trauma}>Trauma Test ({pending.trauma})</button>}
        {pending.malignancy > 0 && <button className="rt-btn" disabled={busy} onClick={malignancy}>Malignancy Test ({pending.malignancy})</button>}
      </div>
      {result && <p className="rt-vox-hint" role="status">{result}</p>}
    </>
  );
}

// A spotting roll: an Awareness Test against Perception, at a difficulty the
// GM calls out (fog, shadow and the like make it harder; a noise makes it
// easier). The result goes to the log; whether it beats whatever is hiding is
// the GM's opposed roll (awareness.js opposedAwareness).
export function SpotPanel({ perception = 0, charId, name = 'A player', emit, busy = false }) {
  const [diff, setDiff] = useState('0');
  const [result, setResult] = useState(null);
  const look = async () => {
    const roll = d(100);
    const t = resolveTest(perception, Number(diff) || 0, roll);
    const line = `Awareness: rolled ${roll} vs ${t.target} \u2014 ${t.success ? `sees something (${t.degrees} degree${t.degrees === 1 ? '' : 's'})` : 'nothing'}.`;
    setResult(line);
    await emit({ id: 'player_response', charId, text: `${name} looks and listens. ${line}` }, null);
  };
  return (
    <>
      <div className="rt-conds-h">Spotting</div>
      <div className="rt-gmmods">
        <label><span className="rt-der-k">Difficulty</span>
          <select className="rt-sel" value={diff} onChange={(e) => setDiff(e.target.value)}>
            {DIFFICULTIES.map((x) => <option key={x.label} value={String(x.mod)}>{x.label} ({x.mod >= 0 ? '+' : ''}{x.mod})</option>)}
          </select>
        </label>
        <button className="rt-btn" disabled={busy} onClick={look}>Awareness Test</button>
      </div>
      {result && <p className="rt-vox-hint" role="status">{result}</p>}
    </>
  );
}
