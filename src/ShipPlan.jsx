import React, { useId, useMemo, useState } from 'react';
import {
  fitLabel, STATUSES, STATUS_LABEL, ZONE_IDS, ZONE_LABEL, SHAPE_LABEL,
  editRoom, resetRoom, addExtra, removeExtra, setShape, readPlanEdits, planEdited
} from './shipplan.js';
import { ESSENTIAL_LABELS } from './ship.js';

/* A ship's plan, drawn (shipplan.js lays it out): the hull side-on in black
   with a white outline, a white-ruled compartment for each component, and on
   each one what the fight has done to it. Click a compartment for what it is;
   the GM can mark it damaged, offline or destroyed and set it burning or put
   it out, which writes the ship's vitals exactly as a critical would.

   The outline is every zone drawn twice: first stroked wide in white, then
   filled black on top, which leaves the white only round the outside of the
   whole, the way a cutaway is inked. */

const FILL = {
  working: '#0b0e13', damaged: '#4a3209', offline: '#1d2129', destroyed: '#3d0c0c'
};
const TAG = { damaged: '#ffcf6a', offline: '#9aa6b5', destroyed: '#ff6a5a' };
const FLAG = { adrift: 'Adrift', collapsed: 'Collapsed', blind: 'Blind', smashed: 'Smashed' };

/* `mapOf(room)`, when given, says whether a compartment has a deck of its
   own yet ({ deck, hint }), and `onMap(room)` makes it or opens it: the GM's
   way from the plan to the battle map (compartmentdeck.js).

   `edits` and `onEdits`, when given, make the LAYOUT the GM's to change
   (shipplan.js): a compartment renamed, moved to another part of the hull,
   made bigger or smaller, a standard space hidden, compartments of their own
   added, the silhouette chosen. Where the damage can be marked too, the two
   are separate modes, so a click meant to mark a fire never moves a room. */
export default function ShipPlan({ plan, title = '', editable = false, onStatus = null, onFire = null, mapOf = null, onMap = null,
  edits = null, onEdits = null }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [selKey, setSelKey] = useState(null);
  const [mode, setMode] = useState(editable ? 'damage' : 'layout');
  const [addName, setAddName] = useState('');
  const [addZone, setAddZone] = useState('upper');
  const sel = plan.rooms.find((r) => r.key === selKey) || null;
  const layout = Boolean(onEdits) && (mode === 'layout' || !editable);
  const ed = readPlanEdits(edits);
  const change = (next) => onEdits && onEdits(planEdited(next) ? next : null);

  const tally = useMemo(() => {
    const ids = new Map();
    for (const r of plan.rooms) if (r.id) ids.set(r.id, r);
    const list = [...ids.values()];
    return {
      damaged: list.filter((r) => r.status === 'damaged').length,
      offline: list.filter((r) => r.status === 'offline').length,
      destroyed: list.filter((r) => r.status === 'destroyed').length,
      fires: plan.rooms.filter((r) => r.burning).length + plan.unplacedFires
    };
  }, [plan]);
  const driveLive = plan.rooms.some((r) => r.category === 'plasmaDrive' && r.status === 'working' && !r.flags.includes('adrift'));

  const sayTally = [
    tally.damaged ? `${tally.damaged} damaged` : '', tally.offline ? `${tally.offline} offline` : '',
    tally.destroyed ? `${tally.destroyed} destroyed` : '',
    tally.fires ? `${tally.fires} fire${tally.fires === 1 ? '' : 's'} aboard${plan.unplacedFires ? ` (${plan.unplacedFires} not placed)` : ''}` : ''
  ].filter(Boolean).join(' · ') || 'Nothing damaged';

  const pick = (r) => setSelKey((k) => (k === r.key ? null : r.key));

  return (
    <div className="rt-plan">
      {(title || (editable && onEdits)) && (
        <div className="rt-plan-title">{title}<span className="rt-plan-tally">{sayTally}</span>
          {editable && onEdits && (
            <span className="rt-plan-modes" role="group" aria-label="What a click does">
              <button type="button" className={'rt-btn' + (mode === 'damage' ? ' on' : ' ghost')} aria-pressed={mode === 'damage' ? 'true' : 'false'} onClick={() => setMode('damage')}>Damage</button>
              <button type="button" className={'rt-btn' + (mode === 'layout' ? ' on' : ' ghost')} aria-pressed={mode === 'layout' ? 'true' : 'false'} onClick={() => setMode('layout')}>Layout</button>
            </span>
          )}
        </div>
      )}
      <svg className="rt-plan-svg" viewBox={`-30 -14 1040 ${plan.height + 28}`} role="group"
        aria-label={`${title || 'Ship'} plan: ${sayTally}`}>
        <defs>
          <pattern id={`${uid}-hatch`} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="9" stroke="rgba(255,106,90,.55)" strokeWidth="3.5" />
          </pattern>
          <radialGradient id={`${uid}-fire`}>
            <stop offset="0" stopColor="rgba(255,190,80,.85)" />
            <stop offset=".6" stopColor="rgba(255,110,30,.45)" />
            <stop offset="1" stopColor="rgba(255,60,20,0)" />
          </radialGradient>
          <radialGradient id={`${uid}-drive`}>
            <stop offset="0" stopColor="rgba(170,215,255,.95)" />
            <stop offset="1" stopColor="rgba(80,140,255,0)" />
          </radialGradient>
        </defs>
        {/* The drive's light at the stern, while it burns. */}
        {driveLive && plan.nozzles.map((n, i) => (
          <ellipse key={`g${i}`} cx={n.x - 6} cy={n.y + n.h / 2} rx="30" ry="16" fill={`url(#${uid}-drive)`} />
        ))}
        <g fill="#e8ecf2" stroke="#e8ecf2" strokeWidth="9" strokeLinejoin="round">
          {plan.zones.map((z) => <rect key={z.zone} x={z.x} y={z.y} width={z.w} height={z.h} />)}
          <polygon points={plan.ram.map((p) => p.join(',')).join(' ')} />
          {plan.nozzles.map((n, i) => <rect key={i} x={n.x} y={n.y} width={n.w} height={n.h} />)}
        </g>
        <g fill="#07090c">
          {plan.zones.map((z) => <rect key={z.zone} x={z.x} y={z.y} width={z.w} height={z.h} />)}
          <polygon points={plan.ram.map((p) => p.join(',')).join(' ')} />
          {plan.nozzles.map((n, i) => <rect key={i} x={n.x} y={n.y} width={n.w} height={n.h} />)}
        </g>
        {plan.rooms.map((r) => {
          const tag = r.status && r.status !== 'working' ? STATUS_LABEL[r.status] : r.flags.length ? FLAG[r.flags[0]] : r.burning ? 'On fire' : '';
          // The tag's line comes out of the room the label is fitted to.
          const fit = fitLabel(r.label, r.w, tag ? r.h - Math.min(16, r.h * 0.32) : r.h);
          const tagColour = TAG[r.status] || (r.burning ? '#ffb15a' : '#ffcf6a');
          const lines = fit ? fit.lines : [];
          const size = fit ? fit.size : 0;
          const block = lines.length * size * 1.15 + (tag && fit ? size * 0.95 : 0);
          const top = r.y + r.h / 2 - block / 2 + size * 0.85;
          const name = `${r.label}${r.name && r.name !== r.label ? ` — ${r.name}` : ''}${tag ? ` (${tag})` : ''}`;
          return (
            <g key={r.key} className={'rt-plan-room' + (r.filler ? ' filler' : '') + (sel && sel.key === r.key ? ' on' : '')}
              role="button" tabIndex={0} aria-label={name} aria-pressed={sel && sel.key === r.key ? 'true' : 'false'}
              onClick={() => pick(r)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(r); } }}>
              <title>{name}</title>
              <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={r.filler ? '#07090c' : FILL[r.status] || FILL.working}
                stroke="#e8ecf2" strokeWidth="1.6" />
              {r.status === 'destroyed' && <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={`url(#${uid}-hatch)`} />}
              {r.burning && <rect className="rt-plan-fire" x={r.x} y={r.y} width={r.w} height={r.h} fill={`url(#${uid}-fire)`} />}
              {lines.map((ln, i) => (
                <text key={i} x={r.x + r.w / 2} y={top + i * size * 1.15} textAnchor="middle" fontSize={size}
                  className="rt-plan-label">{ln}</text>
              ))}
              {tag && fit && (
                <text x={r.x + r.w / 2} y={top + lines.length * size * 1.15 - size * 0.1} textAnchor="middle"
                  fontSize={Math.max(7, size * 0.62)} fill={tagColour} className="rt-plan-tag">{tag.toUpperCase()}</text>
              )}
              {mapOf && mapOf(r).deck && r.w > 24 && r.h > 20 && (
                // Mapped: a small gold grid in the corner.
                <g className="rt-plan-mapped" transform={`translate(${r.x + r.w - 14} ${r.y + 4})`}>
                  <rect width="10" height="10" fill="none" stroke="#f5c542" strokeWidth="1.3" />
                  <path d="M5 0V10M0 5H10" stroke="#f5c542" strokeWidth="1" />
                </g>
              )}
              {sel && sel.key === r.key && <rect x={r.x + 1.5} y={r.y + 1.5} width={r.w - 3} height={r.h - 3} fill="none" stroke="#f5c542" strokeWidth="3" />}
            </g>
          );
        })}
      </svg>

      <div className="rt-plan-legend" aria-hidden="true">
        {STATUSES.map((s) => <span key={s}><i style={{ background: FILL[s], borderColor: TAG[s] || '#e8ecf2' }} />{STATUS_LABEL[s]}</span>)}
        <span><i className="fire" />On fire</span>
        <span className="rt-plan-hint">Click a compartment{layout ? ' to rename, move or resize it' : editable ? ' to mark it' : ' for what it is'}.</span>
      </div>

      {sel && layout && (
        <div className="rt-plan-card">
          <div className="rt-plan-card-h">{sel.label}{sel.edited ? <span className="rt-plan-sub"> {'\u00b7'} changed</span> : null}</div>
          {sel.kind === 'spine' || sel.kind === 'filler' || sel.kind === 'free' ? (
            <p className="rt-plan-sub">{sel.kind === 'free' ? 'The hull\u2019s unused Space: it shrinks as components are fitted.' : 'Hull with nothing in it. Move a compartment here, or add one of your own.'}</p>
          ) : (<>
            <div className="rt-plan-edit">
              <label>Name
                <input className="rt-field" maxLength={40} aria-label="Compartment name"
                  value={sel.kind === 'extra' ? sel.label : ((ed.rooms[sel.key] && ed.rooms[sel.key].label) || '')}
                  placeholder={sel.defaultLabel}
                  onChange={(e) => change(editRoom(edits, sel.key, { label: e.target.value }))} />
              </label>
              <label>Where
                <select className="rt-sel" aria-label="Where it goes" value={sel.zone}
                  onChange={(e) => change(editRoom(edits, sel.key, { zone: e.target.value }))}>
                  {ZONE_IDS.filter((z) => plan.zones.some((zz) => zz.zone === z)).map((z) => <option key={z} value={z}>{ZONE_LABEL[z]}</option>)}
                </select>
              </label>
              <span className="rt-plan-size" role="group" aria-label="Size">
                <button type="button" className="rt-btn ghost" aria-label="Smaller" disabled={sel.weight <= 1}
                  onClick={() => change(editRoom(edits, sel.key, { weight: Math.max(1, (sel.weight || 1) - 1) }))}>{'\u2212'}</button>
                <span className="rt-plan-sub">Size {sel.weight}</span>
                <button type="button" className="rt-btn ghost" aria-label="Bigger" disabled={sel.weight >= 30}
                  onClick={() => change(editRoom(edits, sel.key, { weight: Math.min(30, (sel.weight || 1) + 1) }))}>+</button>
              </span>
            </div>
            {sel.kind === 'extra' && (
              <textarea className="rt-field" rows={2} maxLength={300} aria-label="Compartment note" value={sel.note}
                placeholder="What it is and what is in it."
                onChange={(e) => change(editRoom(edits, sel.key, { note: e.target.value }))} />
            )}
            <div className="rt-plan-actions">
              {sel.kind === 'standard' && (
                <button type="button" className="rt-btn ghost" onClick={() => { change(editRoom(edits, sel.key, { hidden: true })); setSelKey(null); }}>Hide it</button>
              )}
              {sel.kind === 'extra' && (
                <button type="button" className="rt-btn ghost" onClick={() => { change(removeExtra(edits, sel.key)); setSelKey(null); }}>Take it off the plan</button>
              )}
              {sel.edited && sel.kind !== 'extra' && (
                <button type="button" className="rt-btn ghost" onClick={() => change(resetRoom(edits, sel.key))}>Back to how it was</button>
              )}
            </div>
            <p className="rt-plan-sub">
              {sel.kind === 'component' ? 'A component: it stays aboard wherever it is drawn, and criticals still find it.'
                : sel.kind === 'standard' ? 'A space every ship of this size has. Hide it if this one does not.' : 'One of your own.'}
            </p>
          </>)}
        </div>
      )}

      {layout && (
        <div className="rt-plan-layout">
          <label className="rt-plan-sub">Silhouette
            <select className="rt-sel" aria-label="Silhouette" value={ed.shape || ''} onChange={(e) => change(setShape(edits, e.target.value))}>
              <option value="">By its class</option>
              {Object.entries(SHAPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <span className="rt-plan-add">
            <input className="rt-field" maxLength={40} aria-label="New compartment" placeholder="A compartment of your own: Trophy room, Teleportarium\u2026"
              value={addName} onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && addName.trim()) { change(addExtra(edits, { label: addName.trim(), zone: addZone })); setAddName(''); } }} />
            <select className="rt-sel" aria-label="Where the new one goes" value={addZone} onChange={(e) => setAddZone(e.target.value)}>
              {ZONE_IDS.filter((z) => plan.zones.some((zz) => zz.zone === z)).map((z) => <option key={z} value={z}>{ZONE_LABEL[z]}</option>)}
            </select>
            <button type="button" className="rt-btn" disabled={!addName.trim()}
              onClick={() => { change(addExtra(edits, { label: addName.trim(), zone: addZone })); setAddName(''); }}>Add</button>
          </span>
          {plan.hiddenSpaces.length > 0 && (
            <span className="rt-plan-sub">Hidden: {plan.hiddenSpaces.map((h) => (
              <button key={h.key} type="button" className="rt-plan-chip" title="Put it back"
                onClick={() => change(editRoom(edits, h.key, { hidden: false }))}>{h.label} {'\u21ba'}</button>
            ))}</span>
          )}
          {planEdited(edits) && (
            <button type="button" className="rt-btn ghost" onClick={() => {
              if (window.confirm('Put the whole plan back as the ship would be by itself? Every name, move and compartment of your own goes.')) { change(null); setSelKey(null); }
            }}>Reset the plan</button>
          )}
        </div>
      )}

      {sel && !layout && (
        <div className="rt-plan-card">
          <div className="rt-plan-card-h">{sel.label}</div>
          {onMap && mapOf && (() => {
            const m = mapOf(sel);
            return (
              <div className="rt-plan-actions">
                <button type="button" className="rt-btn" onClick={() => onMap(sel)}>
                  {m.deck ? 'Open its deck' : 'Map this compartment'}
                </button>
                <span className="rt-plan-sub">{m.deck ? `\u201c${m.deck.name}\u201d, in the deck library.` : m.hint}</span>
              </div>
            );
          })()}
          {sel.filler || !sel.id ? (
            <p className="rt-plan-sub">{sel.key === 'free' ? `${sel.name} of the hull: holds, stores and room to carry cargo.`
              : sel.key === 'spine' ? 'The spine that runs the length of the ship: freight lines, the artillery decks’ lifts and the long corridors every compartment opens off.'
                : sel.kind === 'standard' || sel.kind === 'extra' ? `${sel.note || 'One of your own.'} Not a component, so no critical lands on it.`
                  : 'Part of the hull with no component of its own in it.'}</p>
          ) : (<>
            <div className="rt-plan-sub">
              {sel.name}{sel.category && ESSENTIAL_LABELS[sel.category] && sel.label !== ESSENTIAL_LABELS[sel.category] ? ` · ${ESSENTIAL_LABELS[sel.category]}` : ''}
              {' · '}{sel.space} Space{sel.power ? ` · ${sel.power > 0 ? `generates ${sel.power}` : `draws ${-sel.power}`} Power` : ''}
            </div>
            {sel.note && <p className="rt-plan-sub">{sel.note}</p>}
            {sel.implied && <p className="rt-plan-sub">Implied by the hull: an NPC ship lists only its guns, so this is the one the catalogue gives a ship of its weight.</p>}
            {sel.flags.length > 0 && <p className="rt-plan-sub">{sel.flags.map((f) => FLAG[f]).join(', ')}: left by a critical on the ship.</p>}
            {sel.noCrit && <p className="rt-plan-sub">It cannot be critically hit.</p>}
            {editable ? (
              <div className="rt-plan-actions">
                {STATUSES.map((s) => (
                  <button key={s} type="button" className={'rt-btn' + (sel.status === s ? ' on' : ' ghost')}
                    aria-pressed={sel.status === s ? 'true' : 'false'}
                    onClick={() => onStatus && onStatus(sel.id, s)}>{STATUS_LABEL[s]}</button>
                ))}
                <button type="button" className={'rt-btn' + (sel.burning ? ' on' : ' ghost')}
                  onClick={() => onFire && onFire(sel.id, !sel.burning)}>{sel.burning ? 'Put the fire out' : 'Set it burning'}</button>
              </div>
            ) : (
              <p className="rt-plan-sub">{STATUS_LABEL[sel.status] || 'Working'}{sel.burning ? ', and burning' : ''}.</p>
            )}
            {sel.slot && sel.id && <p className="rt-plan-sub">A {sel.slot} mount. Damage to a gun is kept by the gun, so every mount carrying it shows it.</p>}
          </>)}
        </div>
      )}
    </div>
  );
}
