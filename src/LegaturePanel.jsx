import React from 'react';
import { ORDOS } from './inquisition.js';
import { PHILOSOPHIES, philosophyById } from './philosophies.js';
import { PATRONS } from './patrons.js';
import { ROSETTE_FORMS, ROSETTE_TABLES, ROSETTE_FUNCTIONS, EMBLEMS, rollRosette, describeRosette } from './rosettes.js';
import { PROVIDES, PROVEN, TOO_MUCH, NEGLECT, FINDING, INFLUENCE_MIN, INFLUENCE_MAX, effectiveInfluence, newContact } from './contacts.js';
import { FORBIDDEN_ORDOS, FORBIDDEN_SOCIETAL } from './forbidden.js';
import { legatureParts } from './legature.js';

/* A character's place in the Inquisition, on the Advances tab: whose agent
   they are, the enquiry they hold, the sigil or rosette they carry, the creed
   they declare, the forbidden things they know and the people they run.
   Which parts show depends on what the character holds (legatureParts). The
   rules are in legature.js, rosettes.js and contacts.js; this is the screen. */

const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `\u2212${-n}` : '0');

function Step({ value, onChange, label }) {
  return (
    <span className="rt-leg-step" aria-label={label}>
      <button type="button" className="rt-adv-b" disabled={value <= INFLUENCE_MIN}
        onClick={() => onChange(value - 1)} aria-label={label + ' down'}>{'−'}</button>
      <b>{signed(value)}</b>
      <button type="button" className="rt-adv-b" disabled={value >= INFLUENCE_MAX}
        onClick={() => onChange(value + 1)} aria-label={label + ' up'}>+</button>
    </span>
  );
}

function Creed({ id }) {
  const p = philosophyById(id);
  if (!p) return null;
  return (
    <div className="rt-leg-creed">
      <p><b>{p.name}</b> <em className={'rt-leg-stance ' + p.stance.toLowerCase()}>{p.stance}</em></p>
      <ul>{p.tenets.map((t) => <li key={t}>{t}</li>)}</ul>
      <p>{p.aim}</p>
    </div>
  );
}

export default function LegaturePanel({ legature: l, held, onChange }) {
  const parts = legatureParts(held);
  const set = (patch) => onChange(patch);
  const rosette = describeRosette(l.rosette);
  const rosetteTable = (l.rosette && l.rosette.table) || l.ordo || 'universal';
  const setContact = (id, patch) => set({ contacts: l.contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const heldForbidden = (ordo, severity) => l.forbidden.some((x) => x.ordo === ordo && x.severity === severity);
  const toggleForbidden = (ordo, severity) => set({
    forbidden: heldForbidden(ordo, severity)
      ? l.forbidden.filter((x) => !(x.ordo === ordo && x.severity === severity))
      : [...l.forbidden, { ordo, severity }]
  });

  return (
    <div className="rt-advrank rt-leg">
      <div className="rt-sect-h">The Inquisition</div>

      <div className="rt-leg-grid">
        <label><span className="rt-leg-k">Ordo</span>
          <select className="rt-select" value={l.ordo} onChange={(e) => set({ ordo: e.target.value })}>
            <option value="">Not yet chosen</option>
            {ORDOS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <label><span className="rt-leg-k">Your master</span>
          <select className="rt-select" value={l.master} onChange={(e) => set({ master: e.target.value })}>
            <option value="">Another Inquisitor (name below)</option>
            {PATRONS.map((p) => <option key={p.id} value={p.id}>Inquisitor {p.name}</option>)}
          </select>
        </label>
        {!l.master && (
          <label><span className="rt-leg-k">Their name</span>
            <input className="rt-field rt-leg-in" value={l.masterName}
              onChange={(e) => set({ masterName: e.target.value })} placeholder="Inquisitor ..." />
          </label>
        )}
        <label><span className="rt-leg-k">What you know of their creed</span>
          <select className="rt-select" value={l.learned} onChange={(e) => set({ learned: e.target.value })}>
            <option value="">Nothing yet</option>
            {PHILOSOPHIES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>
      <p className="rt-psynote">
        An Inquisitor{'’'}s creed is learned slowly, mission by mission. Record it here when your GM lets it slip, not before.
      </p>

      {(parts.legate || parts.interrogator) && (
        <>
          <div className="rt-choice-l">The carta of inquiry</div>
          <div className="rt-leg-grid">
            <label><span className="rt-leg-k">Where</span>
              <input className="rt-field rt-leg-in" value={l.locale}
                onChange={(e) => set({ locale: e.target.value })} placeholder="Hive Valios, the lower spires" />
            </label>
            <label><span className="rt-leg-k">Concerning</span>
              <input className="rt-field rt-leg-in" value={l.focus}
                onChange={(e) => set({ focus: e.target.value })} placeholder="The disappearances in the Iron Sprawl" />
            </label>
            <label><span className="rt-leg-k">You carry</span>
              <select className="rt-select" value={l.emblem} onChange={(e) => set({ emblem: e.target.value })}>
                <option value="">Nothing yet</option>
                {EMBLEMS.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </label>
          </div>
          <p className="rt-psynote">
            Your authority holds within this remit and ends with the enquiry. Showing the sigil where people can see it tells them the Inquisition is here.
          </p>
        </>
      )}

      {parts.rosette && (
        <>
          <div className="rt-choice-l">Your rosette</div>
          <div className="rt-psyrow">
            <select className="rt-select rt-leg-narrow" value={rosetteTable} aria-label="Rosette table"
              onChange={(e) => set({ rosette: l.rosette ? { ...l.rosette, table: e.target.value } : rollRosette({ table: e.target.value }) })}>
              {ROSETTE_TABLES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button type="button" className="rt-adv-b" onClick={() => set({ rosette: rollRosette({ table: rosetteTable }) })}>
              {l.rosette ? 'Roll again' : 'Roll it'}
            </button>
          </div>
          {rosette && (
            <div className="rt-leg-creed">
              <p><b>Made of.</b> {rosette.form}</p>
              <p><b>{rosette.fn.name}.</b> {rosette.fn.text}</p>
              <div className="rt-psyrow">
                <select className="rt-select rt-leg-narrow" value={l.rosette.form} aria-label="What it is made of"
                  onChange={(e) => set({ rosette: { ...l.rosette, form: Number(e.target.value) } })}>
                  {ROSETTE_FORMS.map((f, i) => <option key={i} value={i + 1}>{i + 1}. {f.split(/[,.]/)[0]}</option>)}
                </select>
                <select className="rt-select rt-leg-narrow" value={rosette.fn.from} aria-label="What it does"
                  onChange={(e) => set({ rosette: { ...l.rosette, fn: Number(e.target.value) } })}>
                  {(ROSETTE_FUNCTIONS[l.rosette.table] || []).map((f) => (
                    <option key={f.from} value={f.from}>{f.from}{'–'}{f.to}. {f.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <label className="rt-leg-full"><span className="rt-leg-k">The creed you serve by</span>
            <select className="rt-select" value={l.philosophy} onChange={(e) => set({ philosophy: e.target.value })}>
              <option value="">Not declared</option>
              {PHILOSOPHIES.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.stance})</option>)}
            </select>
          </label>
          <Creed id={l.philosophy} />
          <p className="rt-psynote">Choose or roll; the GM may well have a rosette in mind. Every Ordo&apos;s Inquisitors lend lesser copies to their agents, rarely the real thing.</p>
        </>
      )}

      {(parts.forbidden || l.forbidden.length > 0) && (
        <>
          <div className="rt-choice-l">What you should not know</div>
          {FORBIDDEN_ORDOS.map((o) => (
            <div key={o.id} className="rt-leg-fk">
              <p><b>{o.name}</b></p>
              {['minor', 'major'].map((sev) => (
                <label key={sev} className="rt-leg-check">
                  <input type="checkbox" checked={heldForbidden(o.id, sev)} onChange={() => toggleForbidden(o.id, sev)} />
                  <span><b>{sev === 'minor' ? 'Minor.' : 'Major.'}</b> {o[sev]}</span>
                </label>
              ))}
              {(heldForbidden(o.id, 'minor') || heldForbidden(o.id, 'major')) && (
                <>
                  <p><b>What it costs.</b> {o.negative}</p>
                  <p><b>What it gives.</b> {o.positive}</p>
                </>
              )}
            </div>
          ))}
          {l.forbidden.length > 0 && (
            <ul className="rt-leg-list">{FORBIDDEN_SOCIETAL.map((t) => <li key={t}>{t}</li>)}</ul>
          )}
        </>
      )}

      <div className="rt-choice-l">Contacts</div>
      <p className="rt-psynote">
        {parts.handler
          ? 'Cell Handler: three of these are a standing roster, each to be called on once an enquiry without a Fellowship Test.'
          : 'Every agent cultivates people. Cell Handler makes three of them a standing roster.'}
        {' '}Their own Influence with you and your standing with their Faction count together.
      </p>
      {l.contacts.map((c) => (
        <div key={c.id} className={'rt-leg-contact' + (c.burned ? ' burned' : '')}>
          <div className="rt-leg-grid">
            <label><span className="rt-leg-k">Name</span>
              <input className="rt-field rt-leg-in" value={c.name} onChange={(e) => setContact(c.id, { name: e.target.value })} />
            </label>
            <label><span className="rt-leg-k">Faction</span>
              <input className="rt-field rt-leg-in" value={c.faction} onChange={(e) => setContact(c.id, { faction: e.target.value })}
                placeholder="Administratum" />
            </label>
          </div>
          <div className="rt-psyrow">
            {PROVIDES.map((p) => {
              const on = c.provides.includes(p.id);
              return (
                <button key={p.id} type="button" title={p.text} aria-pressed={on}
                  className={'rt-adv-b rt-leg-tag' + (on ? ' on' : '')}
                  onClick={() => setContact(c.id, { provides: on ? c.provides.filter((x) => x !== p.id) : [...c.provides, p.id] })}>
                  {p.name}
                </button>
              );
            })}
          </div>
          <div className="rt-psyrow">
            <span className="rt-leg-k">Them</span>
            <Step value={c.influence} label={'Influence with ' + (c.name || 'this contact')} onChange={(v) => setContact(c.id, { influence: v })} />
            <span className="rt-leg-k">Their Faction</span>
            <Step value={c.standing} label="Standing with their Faction" onChange={(v) => setContact(c.id, { standing: v })} />
            <span className="rt-leg-k">Together <b>{signed(effectiveInfluence(c))}</b></span>
            <label className="rt-leg-check">
              <input type="checkbox" checked={c.burned} onChange={(e) => setContact(c.id, { burned: e.target.checked })} /> burned
            </label>
            <button type="button" className="rt-adv-b" onClick={() => set({ contacts: l.contacts.filter((x) => x.id !== c.id) })}
              aria-label={'Remove ' + (c.name || 'contact')}>Remove</button>
          </div>
          <input className="rt-field rt-leg-in" value={c.note} onChange={(e) => setContact(c.id, { note: e.target.value })}
            placeholder="What they want, what they fear, where to find them" />
        </div>
      ))}
      <button type="button" className="rt-addbtn" onClick={() => set({ contacts: [...l.contacts, newContact()] })}>
        + Add a contact
      </button>
      <details className="rt-leg-more">
        <summary>Keeping them</summary>
        <p><b>Finding one.</b> {FINDING}</p>
        <p><b>What earns their trust</b></p>
        <ul className="rt-leg-list">{PROVEN.map((t) => <li key={t}>{t}</li>)}</ul>
        <p><b>What wears it down</b></p>
        <ul className="rt-leg-list">{TOO_MUCH.map((t) => <li key={t}>{t}</li>)}</ul>
        <p>{NEGLECT}</p>
      </details>
    </div>
  );
}
