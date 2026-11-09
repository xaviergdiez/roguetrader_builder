import React, { useId, useMemo, useState } from 'react';
import { fitLabel, STATUSES, STATUS_LABEL } from './shipplan.js';
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

export default function ShipPlan({ plan, title = '', editable = false, onStatus = null, onFire = null }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [selKey, setSelKey] = useState(null);
  const sel = plan.rooms.find((r) => r.key === selKey) || null;

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
      {title && <div className="rt-plan-title">{title}<span className="rt-plan-tally">{sayTally}</span></div>}
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
              {sel && sel.key === r.key && <rect x={r.x + 1.5} y={r.y + 1.5} width={r.w - 3} height={r.h - 3} fill="none" stroke="#f5c542" strokeWidth="3" />}
            </g>
          );
        })}
      </svg>

      <div className="rt-plan-legend" aria-hidden="true">
        {STATUSES.map((s) => <span key={s}><i style={{ background: FILL[s], borderColor: TAG[s] || '#e8ecf2' }} />{STATUS_LABEL[s]}</span>)}
        <span><i className="fire" />On fire</span>
        <span className="rt-plan-hint">Click a compartment{editable ? ' to mark it' : ' for what it is'}.</span>
      </div>

      {sel && (
        <div className="rt-plan-card">
          <div className="rt-plan-card-h">{sel.label}</div>
          {sel.filler ? (
            <p className="rt-plan-sub">{sel.key === 'free' ? `${sel.name} of the hull: holds, stores and room to carry cargo.`
              : sel.key === 'spine' ? 'The spine that runs the length of the ship: freight lines, the artillery decks’ lifts and the long corridors every compartment opens off.'
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
