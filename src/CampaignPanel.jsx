// The campaign between fights, for the GM: a scenario with secret sub-plots,
// the session log and its XP suggestion, and downtime healing.
//
// All three read the table's live state off the bridge (members, their
// Wounds, the event log), so this fetches it itself rather than threading it
// through the GM dashboard. The rules are in endeavours.js, sessionlog.js
// and wounds.js; this is the screen.

import React, { useEffect, useState } from 'react';
import { readBridge, sendMessage, emitGroundEvent } from './bridge.js';
import {
  SCENARIO_CONCEPTS, CONFLICT_KINDS, readScenario, subplotMessage, withDiaryEntry
} from './endeavours.js';
import { CATEGORIES, tallySession, suggestXp, diaryEntry, ENCOUNTER_XP } from './sessionlog.js';
import { downtimeHealing, damageState } from './wounds.js';

const CONFLICT_LABELS = { object: 'an object', person: 'a person', place: 'a place', situation: 'a situation' };
const newSubId = () => `sub-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export default function CampaignPanel({ code, journal, editMission, putEndeavour }) {
  const [st, setSt] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    if (!code) return undefined;
    return readBridge({ code, since: 0 })
      .then((s) => { setSt(s); setErr(''); })
      .catch((e) => setErr(e.message || 'Could not read the table.'));
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [code]);

  const members = ((st && st.dynasty && st.dynasty.members) || []).filter((m) => m.charId && !m.npc);
  const vitals = (st && st.ship && st.ship.combat && st.ship.combat.playerVitals) || {};
  const log = (st && st.ship && st.ship.log) || [];
  const nameOf = (id) => (members.find((m) => m.charId === id) || {}).name || id;

  const run = async (fn, ok) => {
    setBusy(true); setErr(''); setNote('');
    try { await fn(); if (ok) setNote(ok); } catch (e) { setErr(e.message || 'That failed.'); } finally { setBusy(false); }
  };

  /* ------------------------------ scenario ------------------------------ */

  const [missionId, setMissionId] = useState('');
  const mission = journal.missions.find((m) => m.id === missionId) || journal.missions[0] || null;
  const scenario = mission && mission.scenario;
  const setScenario = (fn) => editMission(mission.id, (m) => ({ ...m, scenario: readScenario(fn(m.scenario || readScenario({}))) }));
  const [spChar, setSpChar] = useState('');
  const [spText, setSpText] = useState('');
  const [sideName, setSideName] = useState('');

  const deliver = (sp) => run(async () => {
    const msg = subplotMessage(mission, sp);
    if (!msg) throw new Error('That sub-plot has no character to send it to.');
    await sendMessage({ code, to: msg.to, text: msg.text });
    setScenario((sc) => ({ ...sc, subplots: sc.subplots.map((x) => (x.id === sp.id ? { ...x, delivered: true } : x)) }));
  }, 'Sent, to that character alone.');

  /* ------------------------------ session log ------------------------------ */

  const [hours, setHours] = useState(4);
  const [method, setMethod] = useState('abstract');
  const [difficulties, setDifficulties] = useState([]);
  const [roleplay, setRoleplay] = useState(0);
  const [manual, setManual] = useState({});       // { charId: { psychic, objective } }
  const [title, setTitle] = useState('');

  const survivors = members.filter((m) => {
    const v = vitals[m.charId];
    return !v || (v.max || 0) === 0 || (v.damage || 0) < v.max;
  }).map((m) => m.charId);
  const flagged = (key) => members.filter((m) => manual[m.charId] && manual[m.charId][key]).map((m) => m.charId);

  const tally = tallySession(log, { survivors, objectiveChars: flagged('objective') });
  for (const id of flagged('psychic')) {
    tally[id] = { ...(tally[id] || {}), psychic: ((tally[id] || {}).psychic || 0) + 1 };
  }
  const xp = suggestXp({ method, hours, encounters: difficulties, roleplaying: roleplay });
  const names = Object.fromEntries(members.map((m) => [m.charId, m.name]));
  const diaryText = diaryEntry(tally, names, { title: title || 'Session', xp });

  const writeDiary = () => putEndeavour(withDiaryEntry(journal, {
    title: title || `Session ${((journal.diary || []).length || 0) + 1}`,
    text: diaryText, xp: xp.total
  }));

  /* ------------------------------ downtime ------------------------------ */

  const [days, setDays] = useState(7);
  const [rest, setRest] = useState(true);
  const [medical, setMedical] = useState(false);

  const healing = members
    .filter((m) => vitals[m.charId] && vitals[m.charId].max)
    .map((m) => {
      const v = vitals[m.charId];
      const tb = Math.floor(((m.card && m.card.characteristics && m.card.characteristics.t) || 30) / 10);
      const after = downtimeHealing({
        damage: v.damage || 0, critical: v.critSoFar || 0, toughnessBonus: tb, days, rest, medical
      });
      return { m, v, tb, after, before: damageState(v.damage || 0, tb, v.critSoFar || 0) };
    });

  const applyDowntime = () => run(async () => {
    for (const h of healing) {
      const amount = (h.v.damage || 0) - h.after.damage;
      const critHeal = (h.v.critSoFar || 0) - h.after.critical;
      if (amount <= 0 && critHeal <= 0) continue;
      await emitGroundEvent({ code, event: {
        id: 'player_heal', charId: h.m.charId, amount, critHeal,
        text: `${h.m.name} recovers over ${days} day${days === 1 ? '' : 's'} of downtime.`
      } });
    }
    await refresh();
  }, 'Downtime applied.');

  if (!code) {
    return <p className="rt-vox-hint">Open a bridge to run the campaign tools: they read the table's members and log.</p>;
  }

  return (
    <>
      <div className="rt-sechead">
        <span className="rt-conds-h">Campaign tools</span>
        <button className="rt-opt" disabled={busy} onClick={refresh}>Refresh</button>
      </div>
      {err && <p className="rt-warn">{err}</p>}
      {note && <p className="rt-vox-hint" role="status">{note}</p>}

      {/* ---- scenario ---- */}
      <div className="rt-conds-h">Scenario</div>
      {!mission ? (
        <p className="rt-vox-hint">Add a mission first; a scenario lives inside one.</p>
      ) : (
        <>
          <label className="rt-shipsel">
            <span className="rt-shipsel-k">Mission</span>
            <select className="rt-sel" value={mission.id} onChange={(e) => setMissionId(e.target.value)}>
              {journal.missions.map((m) => <option key={m.id} value={m.id}>{m.name || 'Untitled mission'}</option>)}
            </select>
          </label>
          {!scenario ? (
            <div className="rt-btnrow">
              <button className="rt-btn" onClick={() => setScenario((sc) => sc)}>Set up a scenario</button>
            </div>
          ) : (
            <>
              <div className="rt-gmmods">
                <label><span className="rt-der-k">Concept</span>
                  <input className="rt-field" list="rt-scenario-concepts" value={scenario.concept}
                    onChange={(e) => setScenario((sc) => ({ ...sc, concept: e.target.value }))}
                    placeholder="Pick or type one" />
                  <datalist id="rt-scenario-concepts">
                    {SCENARIO_CONCEPTS.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </label>
                <label><span className="rt-der-k">The fight is over</span>
                  <select className="rt-sel" value={scenario.conflict}
                    onChange={(e) => setScenario((sc) => ({ ...sc, conflict: e.target.value }))}>
                    {CONFLICT_KINDS.map((k) => <option key={k} value={k}>{CONFLICT_LABELS[k]}</option>)}
                  </select>
                </label>
              </div>

              <div className="rt-conds-h">Sides</div>
              <ul className="rt-list">
                {scenario.sides.map((sd, i) => (
                  <li key={i} className="rt-entry">
                    <span className="rt-entry-t">{sd.name || 'A side'}</span>
                    <button className="rt-rm" aria-label={'Remove ' + sd.name}
                      onClick={() => setScenario((sc) => ({ ...sc, sides: sc.sides.filter((_, j) => j !== i) }))}>&times;</button>
                  </li>
                ))}
              </ul>
              <div className="rt-gmmods">
                <input className="rt-field" value={sideName} placeholder="Add a side (a third party makes it Triple Jeopardy)"
                  onChange={(e) => setSideName(e.target.value)} />
                <button className="rt-opt" disabled={!sideName.trim()}
                  onClick={() => { setScenario((sc) => ({ ...sc, sides: [...sc.sides, { name: sideName.trim(), note: '' }] })); setSideName(''); }}>
                  Add
                </button>
              </div>

              <div className="rt-conds-h">Secret sub-plots</div>
              <p className="rt-vox-hint">
                A private agenda for one character: a deadline, a hidden traitor, a personal
                target. It is stripped from the party's copy of the journal and goes out only
                as a message to that character.
              </p>
              <ul className="rt-list">
                {scenario.subplots.map((sp) => (
                  <li key={sp.id} className="rt-entry">
                    <span className="rt-entry-t">{nameOf(sp.charId) || 'Nobody'}: {sp.text}</span>
                    <span className="rt-entry-c">{sp.delivered ? 'sent' : 'not sent'}</span>
                    <div className="rt-btnrow">
                      <button className="rt-opt" disabled={busy || !sp.charId} onClick={() => deliver(sp)}>
                        {sp.delivered ? 'Send again' : 'Send privately'}
                      </button>
                      <button className="rt-opt" onClick={() => setScenario((sc) => ({ ...sc, subplots: sc.subplots.filter((x) => x.id !== sp.id) }))}>
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="rt-gmmods">
                <label><span className="rt-der-k">For</span>
                  <select className="rt-sel" value={spChar} onChange={(e) => setSpChar(e.target.value)}>
                    <option value="">{'— pick a character —'}</option>
                    {members.map((m) => <option key={m.charId} value={m.charId}>{m.name}</option>)}
                  </select>
                </label>
                <input className="rt-field" value={spText} placeholder="What only they know"
                  onChange={(e) => setSpText(e.target.value)} />
                <button className="rt-opt" disabled={!spChar || !spText.trim()}
                  onClick={() => {
                    setScenario((sc) => ({ ...sc, subplots: [...sc.subplots, { id: newSubId(), charId: spChar, text: spText.trim(), delivered: false }] }));
                    setSpText('');
                  }}>Add</button>
              </div>
            </>
          )}
        </>
      )}

      {/* ---- session log ---- */}
      <div className="rt-conds-h">Session log</div>
      <p className="rt-vox-hint">
        Tallied from the table's event log ({log.length} entr{log.length === 1 ? 'y' : 'ies'}).
        XP is a suggestion from Rogue Trader's own guidance; nothing is awarded for you.
      </p>
      <div className="rt-gmmods">
        <label><span className="rt-der-k">Method</span>
          <select className="rt-sel" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="abstract">Abstract: 500 xp per 4 hours</option>
            <option value="detailed">Detailed: per encounter</option>
          </select>
        </label>
        {method === 'abstract' ? (
          <label><span className="rt-der-k">Hours played</span>
            <input className="rt-field rt-numin" type="number" min="0" max="24" value={hours}
              onChange={(e) => setHours(Math.max(0, Number(e.target.value) || 0))} />
          </label>
        ) : (
          <label><span className="rt-der-k">Add an encounter</span>
            <select className="rt-sel" value="" onChange={(e) => e.target.value && setDifficulties((d) => [...d, e.target.value])}>
              <option value="">{'— difficulty —'}</option>
              {Object.entries(ENCOUNTER_XP).map(([k, v]) => <option key={k} value={k}>{k} ({v} xp)</option>)}
            </select>
          </label>
        )}
        <label><span className="rt-der-k">Roleplaying (0-500)</span>
          <input className="rt-field rt-numin" type="number" min="0" max="500" step="50" value={roleplay}
            onChange={(e) => setRoleplay(Math.max(0, Math.min(500, Number(e.target.value) || 0)))} />
        </label>
      </div>
      {method === 'detailed' && difficulties.length > 0 && (
        <p className="rt-vox-hint">
          Encounters: {difficulties.join(', ')}{' '}
          <button className="rt-opt" onClick={() => setDifficulties([])}>Clear</button>
        </p>
      )}
      <ul className="rt-list">
        {members.map((m) => {
          const t = tally[m.charId] || {};
          return (
            <li key={m.charId} className="rt-entry">
              <span className="rt-entry-t">{m.name}</span>
              <span className="rt-entry-c">
                {CATEGORIES.filter((c) => t[c.id]).map((c) => `${c.name}${t[c.id] > 1 ? ' x' + t[c.id] : ''}`).join(' · ') || 'nothing recorded'}
              </span>
              <div className="rt-gmmods">
                <label><input type="checkbox" checked={Boolean(manual[m.charId] && manual[m.charId].objective)}
                  onChange={(e) => setManual((x) => ({ ...x, [m.charId]: { ...x[m.charId], objective: e.target.checked } }))} /> scored an objective</label>
                <label><input type="checkbox" checked={Boolean(manual[m.charId] && manual[m.charId].psychic)}
                  onChange={(e) => setManual((x) => ({ ...x, [m.charId]: { ...x[m.charId], psychic: e.target.checked } }))} /> used a psychic power</label>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="rt-vox-hint">Suggested: <b>{xp.total} xp</b> each ({xp.parts.map((p) => `${p.label}: ${p.xp}`).join('; ') || 'nothing yet'}).</p>
      <div className="rt-gmmods">
        <input className="rt-field" value={title} placeholder="Diary entry title" onChange={(e) => setTitle(e.target.value)} />
        <button className="rt-btn" disabled={!members.length} onClick={writeDiary}>Write to the diary</button>
      </div>
      {(journal.diary || []).length > 0 && (
        <ul className="rt-list">
          {journal.diary.slice().reverse().slice(0, 5).map((d) => (
            <li key={d.id} className="rt-entry">
              <span className="rt-entry-t">{d.title}</span>
              <span className="rt-entry-c">{new Date(d.at).toLocaleDateString()} {'·'} {d.xp} xp suggested</span>
              <pre className="rt-entry-s" style={{ whiteSpace: 'pre-wrap' }}>{d.text}</pre>
            </li>
          ))}
        </ul>
      )}

      {/* ---- downtime ---- */}
      <div className="rt-conds-h">Downtime</div>
      <p className="rt-vox-hint">
        Natural healing from Rogue Trader p.262: Lightly Damaged heals 1 a day (Toughness Bonus with a
        day's bed rest); Heavily Damaged 1 a week (Toughness Bonus with a week's rest); Critical Damage
        needs rest and medical attention, 1 a week.
      </p>
      <div className="rt-gmmods">
        <label><span className="rt-der-k">Days</span>
          <input className="rt-field rt-numin" type="number" min="0" max="365" value={days}
            onChange={(e) => setDays(Math.max(0, Math.min(365, Number(e.target.value) || 0)))} />
        </label>
        <label><input type="checkbox" checked={rest} onChange={(e) => setRest(e.target.checked)} /> bed rest</label>
        <label><input type="checkbox" checked={medical} onChange={(e) => setMedical(e.target.checked)} /> medical attention</label>
      </div>
      {healing.length === 0 ? (
        <p className="rt-vox-hint">No one has published Wounds to the table yet.</p>
      ) : (
        <ul className="rt-list">
          {healing.map((h) => (
            <li key={h.m.charId} className="rt-entry">
              <span className="rt-entry-t">{h.m.name}</span>
              <span className="rt-entry-c">
                {h.v.damage || 0} damage{h.v.critSoFar ? ` + ${h.v.critSoFar} critical` : ''} ({h.before})
                {' → '}{h.after.damage}{h.after.critical ? ` + ${h.after.critical} critical` : ''} ({h.after.state})
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="rt-btnrow">
        <button className="rt-btn" disabled={busy || healing.length === 0 || days === 0} onClick={applyDowntime}>
          Apply downtime
        </button>
      </div>
    </>
  );
}
