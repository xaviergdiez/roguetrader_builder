import React, { useState } from 'react';
import { readScenes, readScene, newScene, moveScene, describeScene, MAX_SCENES } from './scenes.js';

/* A MISSION'S EVENING, in scenes (scenes.js): what the table sees and hears
   as the story moves, laid out beforehand so that at the table it is one
   button. `sources` names what a scene may use: { decks, charts, handouts,
   cues }, each a list of { id, name }. */
export default function ScenesPanel({ journal, editMission, sources, running = null, onRun }) {
  const missions = (journal && journal.missions) || [];
  const [missionId, setMissionId] = useState(missions.length ? missions[0].id : '');
  const mission = missions.find((m) => m.id === missionId) || missions[0] || null;
  if (!mission) return null;
  const scenes = readScenes(mission.scenes);
  const save = (next) => editMission(mission.id, (x) => ({ ...x, scenes: next }));
  const update = (id, patch) => save(scenes.map((s) => (s.id === id ? readScene({ ...s, ...patch, id: s.id }) : s)));
  const pick = (label, value, list, onSet, none) => (
    <label className="rt-shipsel">
      <span className="rt-shipsel-k">{label}</span>
      <select className="rt-sel" value={value} aria-label={label} onChange={(e) => onSet(e.target.value)}>
        <option value="">{none}</option>
        {list.map((x) => <option key={x.id} value={x.id}>{x.name || 'Untitled'}</option>)}
        {value && !list.some((x) => x.id === value) ? <option value={value}>(missing)</option> : null}
      </select>
    </label>
  );
  return (
    <div className="rt-scenes">
      <div className="rt-conds-h">Tonight{'’'}s scenes</div>
      <p className="rt-vox-hint">
        The evening laid out beforehand: for each scene, the deck the table plays on, the void chart, the handout on the
        table{'’'}s screen and the sound. Running it is one button, and the table{'’'}s screen fades to black
        while the map is changed under it. The players never see this list.
      </p>
      {missions.length > 1 && (
        <label className="rt-shipsel">
          <span className="rt-shipsel-k">Mission</span>
          <select className="rt-sel" value={mission.id} aria-label="Mission for the scenes" onChange={(e) => setMissionId(e.target.value)}>
            {missions.map((m) => <option key={m.id} value={m.id}>{m.name || 'Untitled mission'}</option>)}
          </select>
        </label>
      )}
      <ol className="rt-scene-list">
        {scenes.map((s, i) => {
          const live = running && running.missionId === mission.id && running.index === i;
          return (
            <li key={s.id} className={'rt-scene' + (live ? ' live' : '')}>
              <div className="rt-btnrow">
                <input className="rt-field" value={s.name} maxLength={60} aria-label={`Scene ${i + 1} name`}
                  onChange={(e) => update(s.id, { name: e.target.value })} />
                <button type="button" className="rt-btn" onClick={() => onRun(mission.id, i)}
                  title="Put this scene on the table now, and run the evening on from it">
                  {live ? 'On the table' : 'Run from here'}
                </button>
                <button type="button" className="rt-btn ghost" disabled={i === 0} aria-label="Earlier"
                  onClick={() => save(moveScene(scenes, s.id, -1))}>{'↑'}</button>
                <button type="button" className="rt-btn ghost" disabled={i === scenes.length - 1} aria-label="Later"
                  onClick={() => save(moveScene(scenes, s.id, 1))}>{'↓'}</button>
                <button type="button" className="rt-btn ghost" onClick={() => save(scenes.filter((x) => x.id !== s.id))}>Take out</button>
              </div>
              <div className="rt-btnrow">
                {pick('Deck', s.deck, sources.decks, (v) => update(s.id, { deck: v }), 'keep the deck')}
                {pick('Void chart', s.chart, sources.charts, (v) => update(s.id, { chart: v }), 'keep the chart')}
                {pick('Handout', s.handout, sources.handouts, (v) => update(s.id, { handout: v }), 'nothing on the screen')}
                {pick('Sound', s.cue, sources.cues, (v) => update(s.id, { cue: v }), 'keep the sound')}
              </div>
              <input className="rt-field rt-scene-note" value={s.note} maxLength={400} aria-label={`Scene ${i + 1} note`}
                placeholder="Your reminder: what happens here" onChange={(e) => update(s.id, { note: e.target.value })} />
              <p className="rt-vox-hint">{describeScene(s, sources)}</p>
            </li>
          );
        })}
      </ol>
      <div className="rt-btnrow">
        <button type="button" className="rt-btn" disabled={scenes.length >= MAX_SCENES}
          onClick={() => save([...scenes, newScene(scenes.length + 1)])}>Add a scene</button>
      </div>
    </div>
  );
}
