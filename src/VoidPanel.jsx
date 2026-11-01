import React, { useEffect, useMemo, useState } from 'react';
import VoidMap from './VoidMap.jsx';
import { rollSystem, describeSystem } from './stargen.js';
import { newSeed } from './mapgen.js';
import {
  chartableElements, buildScene, placeShips, pruneShips, readVoidMap, newVoidMap,
  describeScene, VOID_SIZES
} from './voidmap.js';

/* The GM's side of the void chart: pick what the fight is among, build the
   scene from the star system, and run it.

   The scene is built from a rolled system (the same one the Systems tab
   shows), so a belt, a dust cloud or a graveyard the GM rolled is a place a
   fight can happen, under the star its zone sits beneath. The system itself
   stays on the GM's screen; only the chart is shared. */

export default function VoidPanel({
  voidState, onVoidState, roster, system, setSystem, onWindow, windowOpen, windowErr, onUseShot
}) {
  const state = voidState || {};
  const map = state.map ? readVoidMap(state.map) : null;
  const elements = useMemo(() => chartableElements(system), [system]);
  const [picked, setPicked] = useState({});
  const [size, setSize] = useState('standard');
  const [seedText, setSeedText] = useState('');
  const [openZone, setOpenZone] = useState('primary_biosphere');
  const [note, setNote] = useState('');
  // The setup is wanted once to build a scene and then gets in the way of the
  // chart, so it folds away after a build and stays one click off.
  const [setupOpen, setSetupOpen] = useState(!(voidState && voidState.map));

  // A new system has new elements; the old picks point at nothing.
  useEffect(() => { setPicked({}); }, [system]);

  const keyOf = (e) => `${e.zoneId}:${e.index}`;
  const chosen = elements.filter((e) => picked[keyOf(e)]);
  const zones = [...new Set(elements.map((e) => e.zoneId))];

  const write = (next) => onVoidState({ ...state, system: state.system || system || undefined, ...next });

  const build = (seed) => {
    if (!system) return;
    const s = seed || seedText.trim() || newSeed();
    let m = buildScene(system, chosen.map((e) => ({ zoneId: e.zoneId, index: e.index })), {
      size, seed: s, zoneId: openZone
    });
    m = placeShips(m, roster);
    onVoidState({ ...state, system, map: m });
    setSeedText(s);
    setNote(`${m.name}. ${describeScene(m)}. Seed ${s}.`);
    setSetupOpen(false);
  };

  const blank = () => {
    let m = newVoidMap('Open void', size);
    m = placeShips({ ...m, seed: newSeed() }, roster);
    onVoidState({ ...state, map: m });
    setNote('A blank chart. Add worlds and fields from the panel beside it.');
  };

  const placeFleet = () => {
    if (!map) return;
    const live = new Set(roster.map((r) => r.id));
    onVoidState({ ...state, map: placeShips(pruneShips(map, [...live]), roster) });
  };

  const missing = map ? roster.filter((r) => !map.ships.some((s) => s.id === r.id)).length : 0;
  const stale = map ? map.ships.filter((s) => !roster.some((r) => r.id === s.id)).length : 0;

  return (
    <>
      <div className="rt-sechead">
        <h4>Void chart</h4>
        <button type="button" className="rt-btn" onClick={onWindow} disabled={windowOpen || !map}>
          {windowOpen ? 'Running in its own window' : 'Open in its own window'}
        </button>
      </div>
      {windowErr ? <p className="rt-warn">{windowErr}</p> : null}
      <p className="rt-vox-hint">
        A fight's worth of a star system, in Void Units: one square is one VU, the unit every range and
        Speed here is priced in. Build it from what the system rolled, put the ships on it, and the
        distance, what is in the way and whether a target is silhouetted come off the chart.
      </p>

      <details className="rt-vm-setup" open={setupOpen} onToggle={(e) => setSetupOpen(e.currentTarget.open)}>
        <summary className="rt-vm-sub" style={{ cursor: 'pointer' }}>
          {map ? `Build a different scene \u2014 now showing ${map.name}` : 'Build a scene'}
        </summary>
        <div className="rt-btnrow">
          <button type="button" className="rt-btn" onClick={() => setSystem(rollSystem())}>
            {system ? 'Roll another system' : 'Roll a system'}
          </button>
          <button type="button" className="rt-btn ghost" onClick={blank}>Blank chart</button>
          {system && <span className="rt-vox-hint">{describeSystem(system)}{system.star.detail ? ` · ${system.star.detail}` : ''}</span>}
        </div>

        {system && elements.length > 0 && (
          <>
            <div className="rt-vm-sub">
              Pick what the fight is among (several is fine), or none for open void.
            </div>
            <div className="rt-vm-elements">
              {zones.map((zid) => (
                <React.Fragment key={zid}>
                  <div className="rt-vm-zone">{elements.find((e) => e.zoneId === zid).zoneName}</div>
                  {elements.filter((e) => e.zoneId === zid).map((e) => (
                    <label key={keyOf(e)} className={'rt-vm-chip' + (picked[keyOf(e)] ? ' on' : '')}>
                      <input type="checkbox" checked={Boolean(picked[keyOf(e)])}
                        onChange={(ev) => setPicked({ ...picked, [keyOf(e)]: ev.target.checked })} />
                      {e.label}
                    </label>
                  ))}
                </React.Fragment>
              ))}
            </div>
          </>
        )}
        {system && elements.length === 0 && (
          <p className="rt-vox-hint">Nothing in this system to fight among. Build open void below.</p>
        )}

        {system && (
          <div className="rt-btnrow">
            {chosen.length === 0 && (
              <label className="rt-bm-num">Open void in
                <select className="rt-sel" value={openZone} onChange={(e) => setOpenZone(e.target.value)}>
                  {system.zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </label>
            )}
            <label className="rt-bm-num">Size
              <select className="rt-sel" value={size} onChange={(e) => setSize(e.target.value)}>
                {VOID_SIZES.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.cols}{'×'}{s.rows} VU)</option>)}
              </select>
            </label>
            <label className="rt-bm-num">Seed
              <input className="rt-field" style={{ width: 90 }} value={seedText}
                placeholder="random" onChange={(e) => setSeedText(e.target.value.toUpperCase())} />
            </label>
            <button type="button" className="rt-btn" onClick={() => build()}>
              {map ? 'Build a new scene' : 'Build the scene'}
            </button>
            {map && state.system && (
              <button type="button" className="rt-btn ghost" title="Same picks, a new arrangement"
                onClick={() => build(newSeed())}>Lay it out again</button>
            )}
          </div>
        )}
        {note && <p className="rt-vox-hint">{note}</p>}
      </details>

      {map && (missing > 0 || stale > 0) && (
        <div className="rt-btnrow">
          <button type="button" className="rt-btn" onClick={placeFleet}>
            {missing > 0 ? `Put ${missing} ship${missing === 1 ? '' : 's'} on the chart` : ''}
            {missing > 0 && stale > 0 ? ' and ' : ''}
            {stale > 0 ? `take off ${stale} that left the fleet` : ''}
          </button>
        </div>
      )}

      {!map ? (
        <p className="rt-vm-sub">
          No chart yet. Roll a star system, pick where the fight is, and build it, or start from a blank chart.
        </p>
      ) : windowOpen ? (
        <p className="rt-vm-sub">
          The chart is running in a second window so this dashboard stays free. Closing that window brings it back.
        </p>
      ) : (
        <VoidMap map={map} onChange={(next) => write({ map: next })} fleet={roster}
          historyKey={`${map.seed}|${map.cols}x${map.rows}`} onUseShot={onUseShot} />
      )}
    </>
  );
}
