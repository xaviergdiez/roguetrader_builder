import React, { useEffect, useRef, useState } from 'react';
import { MAX_CUES, BUILT_IN, sourceOf, addFileCue, updateCue, removeCue, restoreBuiltIns } from './ambience.js';
import { getBoard, setBoard, playingCues, onAmbience, playCue, stopCue, stopAll } from './ambienceEngine.js';
import { putLocalFile } from './localfiles.js';

/* The board as it stands and what is playing, re-read whenever either
   changes, from anywhere (a trigger on the map, a scene starting). */
export function useAmbience() {
  const [, setTick] = useState(0);
  useEffect(() => onAmbience(() => setTick((t) => t + 1)), []);
  return { board: getBoard(), playing: playingCues() };
}

const AUDIO_TYPES = 'audio/mpeg,audio/mp3,audio/ogg,audio/wav,audio/x-wav,audio/webm,audio/aac,audio/mp4,audio/x-m4a,.mp3,.ogg,.wav,.m4a';

/* The GM's twelve sounds. Played from this computer's speakers; the files
   chosen here stay on this computer, like the deck pictures. */
export default function AmbiencePanel() {
  const { board, playing } = useAmbience();
  const [note, setNote] = useState('');
  const fileRef = useRef(null);

  const addFile = async (file) => {
    if (!file) return;
    if (!/^audio\//.test(file.type) && !/\.(mp3|ogg|wav|m4a)$/i.test(file.name)) {
      setNote(`${file.name} is not a sound this can play.`);
      return;
    }
    if (board.cues.length >= MAX_CUES) { setNote(`The board holds ${MAX_CUES}. Take one off first.`); return; }
    const fileId = 'snd-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    try { await putLocalFile(fileId, file, { name: file.name }); } catch {
      setNote('This browser would not keep the file. A private window keeps nothing.');
      return;
    }
    setBoard(addFileCue(board, { fileId, name: file.name }));
    setNote(`${file.name} is on the board.`);
  };

  const play = async (c) => {
    if (playing.has(c.id)) { stopCue(c.id); return; }
    setNote('');
    if (!(await playCue(c.id))) {
      const file = (sourceOf(c.source) || {}).kind === 'file';
      setNote(`${c.name} would not play${file ? ': its file is not on this computer. Add it again here.' : '.'}`);
    }
  };

  return (
    <div className="rt-amb">
      <div className="rt-conds-h">Ambience</div>
      <p className="rt-vox-hint">
        Sounds for the table, from this computer{'’'}s speakers. A sound that loops is a bed, and one bed plays at
        a time: starting another fades the first out. One that does not loop plays over it.
      </p>
      <div className="rt-btnrow">
        <label className="rt-amb-vol">
          <span>Volume</span>
          <input type="range" min={0} max={100} value={Math.round(board.master * 100)} aria-label="Ambience volume"
            onChange={(e) => setBoard({ ...board, master: Number(e.target.value) / 100 })} />
        </label>
        <button type="button" className="rt-btn ghost" disabled={!playing.size} onClick={() => stopAll()}>Stop all</button>
      </div>
      <div className="rt-amb-grid" role="group" aria-label="Ambience board">
        {board.cues.map((c) => {
          const src = sourceOf(c.source);
          const made = src && src.kind === 'synth' ? BUILT_IN.find((b) => b.id === src.id) : null;
          const on = playing.has(c.id);
          return (
            <button key={c.id} type="button" className={'rt-amb-cue' + (on ? ' on' : '')} aria-pressed={on}
              title={made ? made.note : 'A sound from this computer'}
              onClick={() => play(c)}>
              <span className="rt-amb-name">{c.name}</span>
              <span className="rt-amb-kind">{c.loop ? 'loops' : 'once'}{on ? ' · playing' : ''}</span>
            </button>
          );
        })}
      </div>
      <label className="rt-amb-bs">
        <span>When initiative is rolled for a void battle, sound</span>
        <select value={board.battleStations} aria-label="Battle stations cue"
          onChange={(e) => setBoard({ ...board, battleStations: e.target.value })}>
          <option value="">nothing</option>
          {board.cues.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <details className="rt-amb-edit">
        <summary>Change the board</summary>
        <ul className="rt-list">
          {board.cues.map((c) => (
            <li key={c.id} className="rt-amb-row">
              <input className="rt-field" value={c.name} maxLength={40} aria-label="Name of the sound"
                onChange={(e) => setBoard(updateCue(board, c.id, { name: e.target.value }))} />
              <label><input type="checkbox" checked={c.loop}
                onChange={(e) => setBoard(updateCue(board, c.id, { loop: e.target.checked }))} /> loops</label>
              <input type="range" min={0} max={100} value={Math.round(c.volume * 100)} aria-label={`Volume of ${c.name}`}
                onChange={(e) => setBoard(updateCue(board, c.id, { volume: Number(e.target.value) / 100 }))} />
              <button type="button" className="rt-btn ghost" onClick={() => setBoard(removeCue(board, c.id))}>Take off</button>
            </li>
          ))}
        </ul>
        <div className="rt-btnrow">
          <button type="button" className="rt-btn" disabled={board.cues.length >= MAX_CUES}
            onClick={() => fileRef.current && fileRef.current.click()}>Add a sound from this computer{'…'}</button>
          <input ref={fileRef} type="file" hidden accept={AUDIO_TYPES} aria-label="Sound file for the board"
            onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; addFile(f); }} />
          <button type="button" className="rt-btn ghost" onClick={() => setBoard(restoreBuiltIns(board))}>
            Put back the made sounds
          </button>
        </div>
        <p className="rt-vox-hint">
          MP3, Ogg, WAV or M4A. A file stays in this browser on this computer; on another computer its button stays
          silent until it is added there.
        </p>
      </details>
      {note ? <p className="rt-vox-hint" role="status">{note}</p> : null}
    </div>
  );
}
