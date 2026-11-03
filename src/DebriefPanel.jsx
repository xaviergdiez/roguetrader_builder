import React, { useState } from 'react';
import { ORDOS } from './inquisition.js';
import { philosophyById } from './philosophies.js';
import {
  PATRONS, patronById, LIMITLESS_AUTHORITY, extraFor,
  SUBTLETY_MAX, subtletyBand, SUBTLETY_COSTS,
  COMMUNIQUES, SAFEHOUSES, MEETING_PLACES, rollOn,
  STRAYED, strayedById, debriefModifier, DEBRIEF_OUTCOMES, EVIDENCE_BONUS,
  SUPERIORITY_RULE, LEGITIMACY_RULE, superiorityByFoe, legitimacyTotals,
  readInquisitionJournal, readDebrief
} from './patrons.js';

/* An Endeavour run for an Inquisitor, for the GM: the patron's sheet, the
   cell's Subtlety, the briefing tables, and each mission's debriefing with
   the Superiority and Legitimacy it earns. Subtlety and Legitimacy are the
   GM's secrets and are stripped before the journal reaches the table (see
   redactEndeavour). The rules are in patrons.js; this is the screen. */

const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `\u2212${-n}` : '0');
const ordoName = (id) => (ORDOS.find((o) => o.id === id) || {}).name || '';

function Num({ value, onChange, min = 0, max = 99 }) {
  return (
    <input className="rt-field rt-numin" type="number" value={value} min={min} max={max}
      onChange={(e) => onChange(Math.max(min, Math.min(max, parseInt(e.target.value, 10) || 0)))} />
  );
}

export default function DebriefPanel({ journal, endeavours, editMission, putEndeavour }) {
  const inq = journal.inquisition;
  const [extra, setExtra] = useState(null);
  const [rolled, setRolled] = useState({});
  const [missionId, setMissionId] = useState('');

  if (!inq) {
    return (
      <>
        <div className="rt-sechead"><span className="rt-conds-h">The Inquisition</span></div>
        <p className="rt-vox-hint">
          For a campaign run for an Inquisitor: the patron, the cell{'’'}s Subtlety, briefings, and what each
          mission{'’'}s debriefing brings.
        </p>
        <div className="rt-btnrow">
          <button className="rt-btn ghost" onClick={() => putEndeavour({ ...journal, inquisition: readInquisitionJournal({}) })}>
            This endeavour serves an Inquisitor
          </button>
        </div>
      </>
    );
  }

  const setInq = (patch) => putEndeavour({ ...journal, inquisition: readInquisitionJournal({ ...inq, ...patch }) });
  const patron = patronById(inq.patron);
  const ph = patron && philosophyById(patron.philosophy);
  const band = subtletyBand(inq.subtlety);

  const mission = journal.missions.find((m) => m.id === missionId) || journal.missions[journal.missions.length - 1] || null;
  const debrief = mission && mission.debrief;
  const setDebrief = (patch) => editMission(mission.id, (m) => ({ ...m, debrief: readDebrief({ ...(m.debrief || {}), ...patch }) }));
  const mod = debrief ? debriefModifier(debrief) : 0;
  const strayed = debrief ? strayedById(debrief.strayed) : null;
  const held = superiorityByFoe(journal);
  const legit = legitimacyTotals(endeavours);

  const roll = (key, table) => setRolled((r) => ({ ...r, [key]: rollOn(table) }));

  return (
    <>
      <div className="rt-sechead"><span className="rt-conds-h">The Inquisition</span></div>

      <div className="rt-gmmods">
        <label><span className="rt-der-k">Patron</span>
          <select className="rt-sel" value={inq.patron} onChange={(e) => { setExtra(null); setInq({ patron: e.target.value }); }}>
            <option value="">An Inquisitor of your own</option>
            {PATRONS.map((p) => <option key={p.id} value={p.id}>{p.name} ({ordoName(p.ordo)})</option>)}
          </select>
        </label>
        {!patron && (
          <label><span className="rt-der-k">Their name</span>
            <input className="rt-field" value={inq.patronName} onChange={(e) => setInq({ patronName: e.target.value })}
              placeholder="Inquisitor ..." />
          </label>
        )}
      </div>

      {patron ? (
        <div className="rt-inq-ph">
          <div className="rt-inq-h">
            <b>{ordoName(patron.ordo)}</b>
            <span>{ph ? ph.name : ''}</span>
            {ph && <em className={'rt-inq-stance ' + ph.stance.toLowerCase()}>{ph.stance}</em>}
            <span>{patron.demeanour}</span>
          </div>
          <p>{patron.territory}{patron.interrogator ? ` · Interrogator: ${patron.interrogator}` : ' · no Interrogator yet'}</p>
          <ul>{patron.concerns.map((c) => <li key={c}>{c}</li>)}</ul>
          <p><b>Boons.</b></p>
          <ul>
            <li>{LIMITLESS_AUTHORITY}</li>
            {patron.boons.map((b) => <li key={b.name}><b>{b.name}.</b> {b.text}</li>)}
          </ul>
          <p><b>Liabilities.</b></p>
          <ul>{patron.liabilities.map((b) => <li key={b.name}><b>{b.name}.</b> {b.text}</li>)}</ul>
          <p><b>Influence.</b> {Object.entries(patron.influence).map(([f, v]) => `${f} ${signed(v)}`).join(' · ')}</p>
          <div className="rt-btnrow">
            <button className="rt-opt" onClick={() => setExtra(extraFor(patron, 1 + Math.floor(Math.random() * 10)))}>
              Roll a further boon and liability
            </button>
            {extra && <span className="rt-vox-hint">Boon: {extra.boon} {'·'} Liability: {extra.liability} (their effects are Imperium Maledictum{'’'}s)</span>}
          </div>
          <p className="rt-vox-hint">
            Their creed is for the players to learn slowly, from briefings and from what the patron asks of them. Reward
            or dock the patron{'’'}s Influence with each Faction the cell dealt with, by how it went.
          </p>
        </div>
      ) : (
        <div className="rt-inq-ph"><p>{LIMITLESS_AUTHORITY}</p></div>
      )}

      {/* The cell's Subtlety: the GM's alone. */}
      <div className="rt-gmmods">
        <label><span className="rt-der-k">Subtlety (never shown to the party)</span>
          <Num value={inq.subtlety} min={1} max={SUBTLETY_MAX} onChange={(v) => setInq({ subtlety: v })} />
        </label>
        <label><span className="rt-der-k">Which is</span>
          <span className="rt-gmvitals"><b>{band.name.toUpperCase()}</b></span>
        </label>
      </div>
      <details className="rt-inq-fk">
        <summary>What costs Subtlety</summary>
        <div className="rt-inq-ph">
          <ul>{SUBTLETY_COSTS.map((t) => <li key={t}>{t}</li>)}</ul>
          <p>The party has to work to learn where they stand. When the band changes, let the world show it: people react differently, rumours run ahead of them, the quarry goes deeper. How much each thing costs is the Inquisition Player{'’'}s Guide{'’'}s, which this app does not have; until then it is yours.</p>
        </div>
      </details>

      {/* Briefing: how orders arrive, where the cell lies low, where they are met. */}
      <div className="rt-btnrow">
        <button className="rt-opt" onClick={() => roll('com', COMMUNIQUES)}>How orders arrive</button>
        <button className="rt-opt" onClick={() => roll('safe', SAFEHOUSES)}>A safehouse</button>
        <button className="rt-opt" onClick={() => roll('meet', MEETING_PLACES)}>A meeting place</button>
      </div>
      {['com', 'safe', 'meet'].filter((k) => rolled[k]).map((k) => (
        <p key={k} className="rt-vox-hint">{rolled[k].roll}. {rolled[k].text}</p>
      ))}
      <p className="rt-vox-hint">
        A briefing gives an objective (steal, find, learn, not {'“'}investigate{'”'}), a place, a contact, the first clues,
        and any lines not to cross. Breaking one of those can cost Subtlety.
      </p>

      {/* The debriefing, per mission. */}
      {journal.missions.length > 0 && (
        <>
          <div className="rt-conds-h">Debriefing</div>
          <label className="rt-shipsel">
            <span className="rt-shipsel-k">Mission</span>
            <select className="rt-sel" value={mission ? mission.id : ''} onChange={(e) => setMissionId(e.target.value)}>
              {journal.missions.map((m) => <option key={m.id} value={m.id}>{m.name || 'Untitled mission'}</option>)}
            </select>
          </label>
          {!debrief ? (
            <div className="rt-btnrow">
              <button className="rt-opt" onClick={() => setDebrief({})}>Debrief this mission</button>
            </div>
          ) : (
            <>
              <div className="rt-gmmods">
                <label><span className="rt-der-k">Pieces of evidence</span>
                  <Num value={debrief.evidence} max={20} onChange={(v) => setDebrief({ evidence: v })} />
                </label>
                <label><span className="rt-der-k">Against their orders, they</span>
                  <select className="rt-sel" value={debrief.strayed} onChange={(e) => setDebrief({ strayed: e.target.value })}>
                    {STRAYED.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </label>
              </div>
              <p className="rt-vox-hint">
                Fellowship Tests with the patron: <b>{signed(mod)}</b> ({debrief.evidence} {'×'} +{EVIDENCE_BONUS} for the evidence,
                {' '}{strayed.difficulty} to justify what they did; modifiers stop at {'±'}60).
              </p>
              <details className="rt-inq-fk">
                <summary>What a debriefing decides</summary>
                <div className="rt-inq-ph">
                  {DEBRIEF_OUTCOMES.map((o) => <p key={o.id}><b>{o.name}.</b> {o.text}</p>)}
                </div>
              </details>

              <div className="rt-conds-h">Know thy foe: Superiority</div>
              {debrief.superiority.map((x, i) => (
                <div key={i} className="rt-gmmods">
                  <label><span className="rt-der-k">Against</span>
                    <input className="rt-field" value={x.foe} placeholder="The Kabal of the Broken Mirror"
                      onChange={(e) => setDebrief({ superiority: debrief.superiority.map((y, j) => (j === i ? { ...y, foe: e.target.value } : y)) })} />
                  </label>
                  <label><span className="rt-der-k">Points</span>
                    <Num value={x.points} max={10}
                      onChange={(v) => setDebrief({ superiority: debrief.superiority.map((y, j) => (j === i ? { ...y, points: v } : y)) })} />
                  </label>
                  <button className="rt-rm" aria-label="Remove"
                    onClick={() => setDebrief({ superiority: debrief.superiority.filter((_, j) => j !== i) })}>&times;</button>
                </div>
              ))}
              <div className="rt-btnrow">
                <button className="rt-opt" onClick={() => setDebrief({ superiority: [...debrief.superiority, { foe: '', points: 1 }] })}>
                  Add Superiority
                </button>
              </div>

              <div className="rt-conds-h">Legitimacy (never shown to the party)</div>
              {debrief.legitimacy.map((x, i) => (
                <div key={i} className="rt-gmmods">
                  <label><span className="rt-der-k">Who</span>
                    <input className="rt-field" value={x.who} placeholder="The Interrogator's name"
                      onChange={(e) => setDebrief({ legitimacy: debrief.legitimacy.map((y, j) => (j === i ? { ...y, who: e.target.value } : y)) })} />
                  </label>
                  <label><span className="rt-der-k">Gained</span>
                    <Num value={x.gained} min={-5} max={5}
                      onChange={(v) => setDebrief({ legitimacy: debrief.legitimacy.map((y, j) => (j === i ? { ...y, gained: v } : y)) })} />
                  </label>
                  <button className="rt-rm" aria-label="Remove"
                    onClick={() => setDebrief({ legitimacy: debrief.legitimacy.filter((_, j) => j !== i) })}>&times;</button>
                </div>
              ))}
              <div className="rt-btnrow">
                <button className="rt-opt" onClick={() => setDebrief({ legitimacy: [...debrief.legitimacy, { who: '', gained: 1 }] })}>
                  Add Legitimacy
                </button>
              </div>

              <textarea className="rt-ta" rows={3} value={debrief.notes} placeholder="What they reported, what they hid, what the patron made of it"
                onChange={(e) => setDebrief({ notes: e.target.value })} />
            </>
          )}
        </>
      )}

      {Object.keys(held).length > 0 && (
        <div className="rt-inq-ph">
          <p><b>Superiority the party holds.</b> {Object.entries(held).map(([f, n]) => `${f} ${n}`).join(' · ')}</p>
          <p className="rt-vox-hint">{SUPERIORITY_RULE} House rule: Rogue Trader has no Superiority of its own.</p>
        </div>
      )}
      {legit.length > 0 && (
        <div className="rt-inq-ph">
          <p><b>Legitimacy, across every endeavour.</b> {legit.map((x) => `${x.who} ${signed(x.total)}`).join(' · ')}</p>
          <p className="rt-vox-hint">{LEGITIMACY_RULE}</p>
        </div>
      )}
    </>
  );
}
