/* The ambience board's sound: one AudioContext for the page, the board kept
   in this browser, and what is playing.

   Module-level, not a component's: closing the GM dashboard must not stop the
   rain, and a trigger on the map or a scene starting sounds a cue without
   the board being on screen. Anything showing the board subscribes with
   onAmbience() and re-reads.

   Fades are scheduled on the audio clock (a gain ramp), which is what it is
   for: the browser runs them sample-accurately on its audio thread, where no
   frame loop can reach. See ambience.js for the board itself. */

import {
  AMBIENCE_KEY, readBoard, cueById, sourceOf, noiseSamples, seeded
} from './ambience.js';
import { getLocalFile } from './localfiles.js';

let board = null;
let ctx = null;
let master = null;
const playing = new Map();     // cue id -> { gain, stop, loop }
const decoded = new Map();     // file id -> Promise<AudioBuffer|null>
const listeners = new Set();

const notify = () => { for (const fn of listeners) { try { fn(); } catch { /* a listener's own trouble */ } } };
export const onAmbience = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function getBoard() {
  if (board) return board;
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(AMBIENCE_KEY) || 'null'); } catch { raw = null; }
  board = readBoard(raw);
  return board;
}

export function setBoard(next) {
  board = readBoard(next);
  try { localStorage.setItem(AMBIENCE_KEY, JSON.stringify(board)); } catch { /* full, or private */ }
  if (master && ctx) master.gain.setTargetAtTime(board.master, ctx.currentTime, 0.05);
  // A cue taken off the board stops; one whose volume moved follows it.
  for (const [id, p] of playing) {
    const c = cueById(board, id);
    if (!c) stopCue(id);
    else if (ctx) p.gain.gain.setTargetAtTime(c.volume, ctx.currentTime, 0.1);
  }
  notify();
  return board;
}

export const playingCues = () => new Set(playing.keys());

function audio() {
  if (ctx) return ctx;
  const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!Ctx) return null;
  ctx = new Ctx();
  master = ctx.createGain();
  master.gain.value = getBoard().master;
  master.connect(ctx.destination);
  return ctx;
}

/* ------------------------------ the made sounds ------------------------------
   Each builds its nodes into `out` and returns a function that stops them. */

const looped = (a, samples) => {
  const buf = a.createBuffer(1, samples.length, a.sampleRate);
  buf.getChannelData(0).set(samples);
  const src = a.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  return src;
};
const filter = (a, type, freq, q = 0.7) => {
  const f = a.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  return f;
};
const osc = (a, type, freq) => { const o = a.createOscillator(); o.type = type; o.frequency.value = freq; return o; };
const gainOf = (a, v) => { const g = a.createGain(); g.gain.value = v; return g; };
// An LFO swinging a parameter by `depth` around where it already is.
const wobble = (a, param, rate, depth, type = 'sine') => {
  const l = osc(a, type, rate);
  const d = gainOf(a, depth);
  l.connect(d); d.connect(param);
  return l;
};

const SYNTHS = {
  engines(a, out) {
    const noise = looped(a, noiseSamples({ seconds: 4, rate: a.sampleRate, rng: seeded(11) }));
    const lp = filter(a, 'lowpass', 110, 0.5);
    const ng = gainOf(a, 0.9);
    noise.connect(lp); lp.connect(ng); ng.connect(out);
    const o1 = osc(a, 'sine', 42), o2 = osc(a, 'sine', 63.5);
    const og = gainOf(a, 0.35);
    o1.connect(og); o2.connect(og); og.connect(out);
    const lfo = wobble(a, og.gain, 0.23, 0.15);
    const nodes = [noise, o1, o2, lfo];
    nodes.forEach((n) => n.start());
    return () => nodes.forEach((n) => n.stop());
  },
  klaxon(a, out) {
    // Two tones a third apart, swapping twice a second, sounding for a beat
    // and stopping for one.
    const o = osc(a, 'sawtooth', 385);
    const swap = wobble(a, o.frequency, 1, 55, 'square');
    const lp = filter(a, 'lowpass', 1400, 1);
    const gate = gainOf(a, 0.5);
    const beat = wobble(a, gate.gain, 0.45, 0.5, 'square');
    const g = gainOf(a, 0.35);
    o.connect(lp); lp.connect(gate); gate.connect(g); g.connect(out);
    const nodes = [o, swap, beat];
    nodes.forEach((n) => n.start());
    return () => nodes.forEach((n) => n.stop());
  },
  static(a, out) {
    const noise = looped(a, noiseSamples({ seconds: 3, rate: a.sampleRate, rng: seeded(23), bed: 0.35, crackle: 1 }));
    const bp = filter(a, 'bandpass', 1900, 0.6);
    const g = gainOf(a, 1.4);
    noise.connect(bp); bp.connect(g); g.connect(out);
    const swell = wobble(a, g.gain, 0.17, 0.4);
    noise.start(); swell.start();
    return () => { noise.stop(); swell.stop(); };
  },
  warp(a, out) {
    const noise = looped(a, noiseSamples({ seconds: 5, rate: a.sampleRate, rng: seeded(31) }));
    const f1 = filter(a, 'bandpass', 620, 9), f2 = filter(a, 'bandpass', 1240, 11);
    const s1 = wobble(a, f1.frequency, 0.13, 260), s2 = wobble(a, f2.frequency, 0.21, 420);
    const vg = gainOf(a, 0.9);
    const trem = wobble(a, vg.gain, 0.31, 0.5);
    noise.connect(f1); noise.connect(f2); f1.connect(vg); f2.connect(vg); vg.connect(out);
    const d1 = osc(a, 'sawtooth', 55), d2 = osc(a, 'sawtooth', 55.7);
    const dl = filter(a, 'lowpass', 220, 0.8);
    const dg = gainOf(a, 0.12);
    d1.connect(dl); d2.connect(dl); dl.connect(dg); dg.connect(out);
    const nodes = [noise, s1, s2, trem, d1, d2];
    nodes.forEach((n) => n.start());
    return () => nodes.forEach((n) => n.stop());
  },
  rain(a, out) {
    const drops = looped(a, noiseSamples({ seconds: 4, rate: a.sampleRate, rng: seeded(41), bed: 0.25, drops: 1 }));
    const hp = filter(a, 'highpass', 900, 0.5);
    const lp = filter(a, 'lowpass', 7000, 0.5);
    drops.connect(hp); hp.connect(lp); lp.connect(out);
    drops.start();
    return () => drops.stop();
  },
  cogitator(a, out) {
    const o1 = osc(a, 'sine', 120), o2 = osc(a, 'triangle', 240);
    const hg = gainOf(a, 0.18);
    o1.connect(hg); o2.connect(hg); hg.connect(out);
    const ticks = looped(a, noiseSamples({ seconds: 3, rate: a.sampleRate, rng: seeded(53), bed: 0.02, ticks: 7 }));
    const bp = filter(a, 'bandpass', 2600, 1.5);
    const tg = gainOf(a, 0.8);
    ticks.connect(bp); bp.connect(tg); tg.connect(out);
    const nodes = [o1, o2, ticks];
    nodes.forEach((n) => n.start());
    return () => nodes.forEach((n) => n.stop());
  },
  slam(a, out, done) {
    const t = a.currentTime;
    const thud = osc(a, 'sine', 70);
    thud.frequency.setValueAtTime(90, t);
    thud.frequency.exponentialRampToValueAtTime(38, t + 0.6);
    const tg = gainOf(a, 0);
    tg.gain.setValueAtTime(0.9, t);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    thud.connect(tg); tg.connect(out);
    const crash = a.createBufferSource();
    const n = noiseSamples({ seconds: 0.6, rate: a.sampleRate, rng: seeded(61) });
    const buf = a.createBuffer(1, n.length, a.sampleRate);
    buf.getChannelData(0).set(n);
    crash.buffer = buf;
    const lp = filter(a, 'lowpass', 900, 0.7);
    const cg = gainOf(a, 0);
    cg.gain.setValueAtTime(0.7, t);
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    crash.connect(lp); lp.connect(cg); cg.connect(out);
    thud.start(t); crash.start(t);
    thud.stop(t + 1); crash.stop(t + 0.6);
    thud.onended = done;
    return () => { try { thud.stop(); crash.stop(); } catch { /* ended */ } };
  }
};

function decodeFile(fileId) {
  if (!decoded.has(fileId)) {
    decoded.set(fileId, getLocalFile(fileId)
      .then((rec) => (rec && rec.blob ? rec.blob.arrayBuffer() : null))
      .then((bytes) => (bytes ? audio().decodeAudioData(bytes) : null))
      .catch(() => null)
      .then((buf) => { if (!buf) decoded.delete(fileId); return buf; }));
  }
  return decoded.get(fileId);
}

/* Starts a cue, or does nothing if it is already playing. A bed fades in and
   fades out whatever bed was playing; an effect plays over it. Resolves to
   false when the sound cannot be made (no audio, or a file this computer
   does not have). */
export async function playCue(cueOrId, { fade = 1.5 } = {}) {
  const cue = typeof cueOrId === 'string' ? cueById(getBoard(), cueOrId) : cueOrId;
  const a = audio();
  if (!cue || !a) return false;
  if (a.state === 'suspended') { try { await a.resume(); } catch { /* needs a click first */ } }
  if (playing.has(cue.id)) return true;
  const src = sourceOf(cue.source);
  if (!src) return false;
  if (cue.loop) for (const [id, p] of playing) if (p.loop) stopCue(id, { fade });

  const g = a.createGain();
  g.gain.setValueAtTime(0, a.currentTime);
  g.gain.linearRampToValueAtTime(cue.volume, a.currentTime + (cue.loop ? fade : 0.02));
  g.connect(master);
  const entry = { gain: g, stop: () => {}, loop: cue.loop };
  playing.set(cue.id, entry);
  notify();
  const ended = () => { if (playing.get(cue.id) === entry) { playing.delete(cue.id); g.disconnect(); notify(); } };

  if (src.kind === 'synth') {
    entry.stop = SYNTHS[src.id](a, g, ended);
    return true;
  }
  const buf = await decodeFile(src.id);
  if (playing.get(cue.id) !== entry) return false;      // stopped while it loaded
  if (!buf) { ended(); return false; }
  const node = a.createBufferSource();
  node.buffer = buf;
  node.loop = cue.loop;
  node.connect(g);
  if (!cue.loop) node.onended = ended;
  node.start();
  entry.stop = () => { try { node.stop(); } catch { /* ended */ } };
  return true;
}

export function stopCue(id, { fade = 1.5 } = {}) {
  const p = playing.get(id);
  if (!p || !ctx) return;
  playing.delete(id);
  const t = ctx.currentTime;
  p.gain.gain.cancelScheduledValues(t);
  p.gain.gain.setValueAtTime(p.gain.gain.value, t);
  p.gain.gain.linearRampToValueAtTime(0, t + fade);
  setTimeout(() => { try { p.stop(); } catch { /* gone */ } p.gain.disconnect(); }, fade * 1000 + 100);
  notify();
}

export const toggleCue = (id) => (playing.has(id) ? (stopCue(id), false) : playCue(id));

export function stopAll(opts) { for (const id of [...playing.keys()]) stopCue(id, opts); }
