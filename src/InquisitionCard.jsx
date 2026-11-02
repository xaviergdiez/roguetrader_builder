import React, { useState } from 'react';
import { ORDOS, PHILOSOPHIES, philosophyById, rollInquisitor } from './inquisition.js';
import { PHILOSOPHY_BOOK } from './philosophies.js';
import { GODS, XENOS, rollClue, CLUES_BOOK } from './clues.js';
import { FORBIDDEN_ORDOS, FORBIDDEN_SOCIETAL, FORBIDDEN_BOOK, FORBIDDEN_PAGE } from './forbidden.js';

/* An Inquisitor and the people with them, for the GM to put in an encounter.

   Choose the Ordo and the philosophy, or leave either to the dice (the
   philosophy rolls on the book's own d100 table), and roll. What comes up is
   a ready Inquisitor and retinue, each of them one click from the encounter,
   and the philosophy written out so the table can be told what this Inquisitor
   believes. GM material: it lives on the dashboard, never on the Lore tab. */

export default function InquisitionCard({ onAdd, canAdd }) {
  const [ordoId, setOrdoId] = useState('');
  const [philId, setPhilId] = useState('');
  const [size, setSize] = useState('');
  const [rolled, setRolled] = useState(null);
  const [clueKind, setClueKind] = useState('chaos');
  const [clueId, setClueId] = useState('');
  const [clue, setClue] = useState(null);

  const roll = () => setRolled(rollInquisitor({
    ordoId: ordoId || null,
    philosophyId: philId || null,
    retinueSize: size === '' ? null : Number(size)
  }));
  const rollOneClue = () => setClue(rollClue({ kind: clueKind, id: clueId || null }));
  const ph = rolled && rolled.philosophy;
  const members = rolled ? [{ role: 'Inquisitor', npc: rolled.inquisitor }, ...rolled.retinue.map((m) => ({ role: m.role, npc: m }))] : [];

  return (
    <div className="rt-inq">
      <div className="rt-sechead"><h4>An Inquisitor and retinue</h4></div>
      <p className="rt-vox-hint">
        A rolled Inquisitor with a retinue, from the bestiary. The philosophy is the one thing that tells the table
        what this Inquisitor wants, so it is rolled with them.
      </p>
      <div className="rt-btnrow">
        <label className="rt-shipsel">
          <span className="rt-shipsel-k">Ordo</span>
          <select className="rt-sel" value={ordoId} onChange={(e) => setOrdoId(e.target.value)}>
            <option value="">{'— roll one —'}</option>
            {ORDOS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <label className="rt-shipsel">
          <span className="rt-shipsel-k">Philosophy</span>
          <select className="rt-sel" value={philId} onChange={(e) => setPhilId(e.target.value)}>
            <option value="">{'— roll one —'}</option>
            {PHILOSOPHIES.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.stance})</option>)}
          </select>
        </label>
        <label className="rt-shipsel">
          <span className="rt-shipsel-k">Retinue</span>
          <select className="rt-sel" value={size} onChange={(e) => setSize(e.target.value)}>
            <option value="">{'— 2 to 4 —'}</option>
            {[0, 1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button type="button" className="rt-btn" onClick={roll}>{rolled ? 'Roll again' : 'Roll'}</button>
      </div>

      {rolled && (
        <>
          <div className="rt-inq-h">
            <b>{rolled.ordo}</b>
            <span>{rolled.faction}</span>
            {ph && <em className={'rt-inq-stance ' + ph.stance.toLowerCase()}>{ph.stance}</em>}
          </div>
          {ph && (
            <div className="rt-inq-ph">
              <ul>{ph.tenets.map((t) => <li key={t}>{t}</li>)}</ul>
              <p><b>Wants.</b> {ph.aim}</p>
              <p><b>At the table.</b> {ph.play}</p>
              <p className="rt-inq-src">{PHILOSOPHY_BOOK}, p.{ph.page}</p>
            </div>
          )}
          <ul className="rt-list">
            {members.map(({ role, npc }, i) => (
              <li key={i} className="rt-entry">
                <span className="rt-entry-t">{npc.name}</span>
                <span className="rt-entry-c">{role} {'·'} {npc.max} Wounds</span>
                {npc.weapon && <div className="rt-entry-d"><p className="rt-gear-s">{npc.weapon}</p></div>}
                <button type="button" className="rt-opt" disabled={!canAdd}
                  onClick={() => onAdd(npc)}>Add</button>
              </li>
            ))}
          </ul>
          <div className="rt-btnrow">
            <button type="button" className="rt-btn ghost" disabled={!canAdd}
              onClick={() => members.forEach(({ npc }) => onAdd(npc))}>Add all to the encounter</button>
            {!canAdd && <span className="rt-vox-hint">Open or build an encounter first.</span>}
          </div>
        </>
      )}

      {/* A clue for an investigation: what the party finds when they find a sign. */}
      <div className="rt-sechead"><h4>An investigation clue</h4></div>
      <div className="rt-btnrow">
        <label className="rt-shipsel">
          <span className="rt-shipsel-k">Of</span>
          <select className="rt-sel" value={clueKind} onChange={(e) => { setClueKind(e.target.value); setClueId(''); }}>
            <option value="chaos">A Chaos god</option>
            <option value="mark">A Mark of Chaos on someone</option>
            <option value="xenos">Xenos at work</option>
          </select>
        </label>
        {clueKind === 'chaos' && (
          <label className="rt-shipsel">
            <span className="rt-shipsel-k">God</span>
            <select className="rt-sel" value={clueId} onChange={(e) => setClueId(e.target.value)}>
              <option value="">{'\u2014 roll one \u2014'}</option>
              {GODS.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
        )}
        {clueKind === 'xenos' && (
          <label className="rt-shipsel">
            <span className="rt-shipsel-k">Species</span>
            <select className="rt-sel" value={clueId} onChange={(e) => setClueId(e.target.value)}>
              <option value="">{'\u2014 roll one \u2014'}</option>
              {XENOS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
        )}
        <button type="button" className="rt-btn" onClick={rollOneClue}>{clue ? 'Another clue' : 'Roll a clue'}</button>
      </div>
      {clue && (
        <div className="rt-inq-ph rt-inq-clue">
          <p><b>{clue.title}</b></p>
          <ul>{clue.lines.map((l) => <li key={l}>{l}</li>)}</ul>
          <p className="rt-inq-src">{CLUES_BOOK}, p.{clue.page}</p>
        </div>
      )}

      {/* The book's table of what the Ordos care about and what holding it costs. */}
      <details className="rt-inq-fk">
        <summary>Forbidden knowledge: what it is and what it costs</summary>
        {FORBIDDEN_ORDOS.map((o) => (
          <div key={o.id} className="rt-inq-ph">
            <p><b>{o.name}</b></p>
            <p><b>Minor.</b> {o.minor}</p>
            <p><b>Major.</b> {o.major}</p>
            <p><b>Costs.</b> {o.negative}</p>
            <p><b>Gains.</b> {o.positive}</p>
          </div>
        ))}
        <div className="rt-inq-ph">
          <p><b>Whichever Ordo.</b></p>
          <ul>{FORBIDDEN_SOCIETAL.map((t) => <li key={t}>{t}</li>)}</ul>
          <p className="rt-inq-src">{FORBIDDEN_BOOK}, p.{FORBIDDEN_PAGE}</p>
        </div>
      </details>
    </div>
  );
}
