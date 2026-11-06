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
  voidState, onVoidState, roster, system, setSystem, onWindow, windowOpen, windowErr, onUseShot,
  library = null, gunnery = null, sharedTools = null, controls = false, setControls = () => {},
  // The fight on the chart and its traps: see VoidMap's own props.
  chartProps = {}
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

  // Building or starting a chart replaces the one on screen: ask first if it
  // has changes the library does not have.
  const replaceOk = () => !(library && library.dirty)
    || window.confirm('The chart on screen has changes that are not saved. Replace it anyway?');

  const build = (seed) => {
    if (!system || !replaceOk()) return;
    const s = seed || seedText.trim() || newSeed();
    // No ship tokens: the ships are models on the table (the Aim tool points at
    // them). The fleet can still be put on as tokens with the button below.
    const m = buildScene(system, chosen.map((e) => ({ zoneId: e.zoneId, index: e.index })), {
      size, seed: s, zoneId: openZone
    });
    onVoidState({ ...state, system, map: m, chartId: null });
    setSeedText(s);
    setNote(`${m.name}. ${describeScene(m)}. Seed ${s}.`);
    setSetupOpen(false);
  };

  const blank = () => {
    if (!replaceOk()) return;
    const m = { ...newVoidMap('Open void', size), seed: newSeed() };
    onVoidState({ ...state, map: m, chartId: null });
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
          <span className="rt-vox-hint">The ships are models on the table, aimed with the chart{'\u2019'}s Aim tool. Tokens are there if you want the chart to keep track of them.</span>
          <button type="button" className="rt-btn ghost" onClick={placeFleet}>
            {missing > 0 ? `Put ${missing} ship token${missing === 1 ? '' : 's'} on the chart` : ''}
            {missing > 0 && stale > 0 ? ' and ' : ''}
            {stale > 0 ? `take off ${stale} that left the fleet` : ''}
          </button>
        </div>
      )}

      {!map ? (
        <>
          <p className="rt-vm-sub">
            No chart open. Roll a star system, pick where the fight is, and build it, start from a blank
            chart, or open one you saved.
          </p>
          {library && library.list.length > 0 && (
            <div className="rt-vm-card">
              <div className="rt-vm-sub">Saved charts</div>
              {library.error && <p className="rt-warn">{library.error}</p>}
              <ul className="rt-vm-saved">
                {library.list.map((c) => (
                  <li key={c.id}>
                    <button type="button" className="rt-vm-open" onClick={() => library.onOpen(c.id)}>
                      <span>{c.name}</span>
                      <span className="rt-vm-dist">{c.cols}{'\u00d7'}{c.rows}{c.ships ? ` \u00b7 ${c.ships} ship${c.ships === 1 ? '' : 's'}` : ''}</span>
                    </button>
                    <button type="button" className="rt-ico-btn" title="Delete this saved chart" aria-label={`Delete ${c.name}`}
                      onClick={() => { if (window.confirm(`Delete \u201c${c.name}\u201d? This cannot be undone.`)) library.onDelete(c.id); }}>
                      <svg className="rt-ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : windowOpen ? (<>
        <div className="rt-vm-bar">
          <p className="rt-vm-sub" style={{ flex: '1 1 auto', margin: 0 }}>
            The chart is running in a second window so this dashboard stays free. Closing that window brings it back.
          </p>
          {/* The chart's tools on the GM's own screen while the only chart is
              in its window. Offered rather than always on: it is a second row
              of toolbars and the chart's window already has one. */}
          <button type="button" className={'rt-btn' + (controls ? ' on' : '')}
            onClick={() => setControls((v) => !v)}
            title="The chart's tools here, with no second chart: pick a tool and the chart in the window obeys">
            {controls ? 'Hide the controls' : 'Show the controls here'}
          </button>
        </div>
        {controls && (
          <VoidMap controlsOnly shared={sharedTools} map={map} onChange={(next) => write({ map: next })}
            fleet={roster} historyKey={`${state.chartId || '-'}|${map.seed}`} onUseShot={onUseShot}
            gunnery={gunnery} library={library} {...chartProps} />
        )}
      </>) : (
        <VoidMap map={map} onChange={(next) => write({ map: next })} fleet={roster}
          shared={sharedTools}
          historyKey={`${state.chartId || '-'}|${map.seed}`} onUseShot={onUseShot}
          gunnery={gunnery} library={library} {...chartProps} />
      )}
    </>
  );
}
