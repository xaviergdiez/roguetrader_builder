/* THE AMBIENCE BOARD: twelve named sounds the GM can start and stop at the
   table, as a VTT's music cue board does.

   A cue is a sound with a name, a volume, and whether it loops:

     { id, name, source, loop, volume }

   `source` is either one of the sounds made here, with nothing to download
   ('synth:engines', 'synth:klaxon', ...), or a file the GM chose from their
   own computer ('file:<id>'), which is kept in this browser (localfiles.js)
   beside the deck pictures. The board belongs to the computer the speakers
   are plugged into, so it is kept in that browser too, not in the account.

   A LOOP IS A BED and only one bed plays at a time: starting the bridge's hum
   fades out the rain. A cue that does not loop is an effect, and plays over
   whatever bed there is.

   `battleStations` is the cue that sounds when initiative is rolled for a
   void battle, or none.

   Pure: see ambience.check.mjs. The sound itself is in ambienceEngine.js. */

export const MAX_CUES = 12;
export const AMBIENCE_KEY = 'rt:ambience';

// The sounds made here, from noise and tones, so the board works out of the
// box and offline.
export const BUILT_IN = [
  { id: 'engines', name: 'Ship’s engines', loop: true, note: 'The plasma drives: a low throb, felt more than heard.' },
  { id: 'klaxon', name: 'Battle stations', loop: true, note: 'Two tones, sounding and stopping, until someone silences it.' },
  { id: 'static', name: 'Vox static', loop: true, note: 'An open channel: hiss and crackle.' },
  { id: 'warp', name: 'Warp whispers', loop: true, note: 'Voices that are not voices, under a drone that will not settle.' },
  { id: 'rain', name: 'Rain on the hull', loop: true, note: 'Drops on plating, and the wash of a storm behind them.' },
  { id: 'cogitator', name: 'Cogitator hum', loop: true, note: 'A machine-spirit at its work: a hum, and relays clicking.' },
  { id: 'slam', name: 'Bulkhead slam', loop: false, note: 'A blast door coming down, once.' }
];
export const builtInById = (id) => BUILT_IN.find((b) => b.id === id) || null;

const ID_RE = /^[a-z0-9][a-z0-9-]{0,47}$/i;
const clamp01 = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
};

export function sourceOf(s) {
  const v = String(s || '');
  const m = /^(synth|file):(.+)$/.exec(v);
  if (!m) return null;
  if (m[1] === 'synth') return builtInById(m[2]) ? { kind: 'synth', id: m[2] } : null;
  return ID_RE.test(m[2]) ? { kind: 'file', id: m[2] } : null;
}

export function readCue(v) {
  if (!v || typeof v !== 'object' || typeof v.id !== 'string' || !ID_RE.test(v.id)) return null;
  const src = sourceOf(v.source);
  if (!src) return null;
  return {
    id: v.id,
    name: String(v.name == null ? '' : v.name).trim().slice(0, 40) || 'A sound',
    source: `${src.kind}:${src.id}`,
    loop: Boolean(v.loop),
    volume: clamp01(v.volume, 0.8)
  };
}

const builtInCue = (b) => ({ id: 'cue-' + b.id, name: b.name, source: 'synth:' + b.id, loop: b.loop, volume: 0.8 });

export const DEFAULT_BOARD = Object.freeze({
  master: 0.7,
  cues: BUILT_IN.map(builtInCue),
  battleStations: 'cue-klaxon'
});

export function readBoard(v) {
  if (!v || typeof v !== 'object' || !Array.isArray(v.cues)) {
    return { master: DEFAULT_BOARD.master, cues: DEFAULT_BOARD.cues.map((c) => ({ ...c })), battleStations: DEFAULT_BOARD.battleStations };
  }
  const seen = new Set();
  const cues = [];
  for (const raw of v.cues) {
    const c = readCue(raw);
    if (!c || seen.has(c.id) || cues.length >= MAX_CUES) continue;
    seen.add(c.id);
    cues.push(c);
  }
  return {
    master: clamp01(v.master, DEFAULT_BOARD.master),
    cues,
    battleStations: typeof v.battleStations === 'string' && seen.has(v.battleStations) ? v.battleStations : ''
  };
}

export const cueById = (board, id) => (board && board.cues.find((c) => c.id === id)) || null;

let seq = 0;
const newCueId = () => 'cue-' + Date.now().toString(36) + (seq++).toString(36);

// A file the GM chose, added to the end of the board; the board unchanged
// when it is full.
export function addFileCue(board, { fileId, name, loop = true }) {
  const b = readBoard(board);
  if (b.cues.length >= MAX_CUES || !ID_RE.test(String(fileId || ''))) return b;
  const cleaned = String(name || '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_-]+/g, ' ').trim();
  return readBoard({ ...b, cues: [...b.cues, { id: newCueId(), name: cleaned || 'A sound', source: 'file:' + fileId, loop, volume: 0.8 }] });
}

export const updateCue = (board, id, patch) => {
  const b = readBoard(board);
  return readBoard({ ...b, cues: b.cues.map((c) => (c.id === id ? { ...c, ...patch, id: c.id, source: c.source } : c)) });
};

export const removeCue = (board, id) => {
  const b = readBoard(board);
  return readBoard({ ...b, cues: b.cues.filter((c) => c.id !== id) });
};

// The made sounds that have been taken off the board, put back while there is room.
export function restoreBuiltIns(board) {
  const b = readBoard(board);
  const have = new Set(b.cues.map((c) => c.source));
  const missing = BUILT_IN.filter((x) => !have.has('synth:' + x.id)).map(builtInCue);
  return readBoard({ ...b, cues: [...b.cues, ...missing].slice(0, MAX_CUES) });
}

/* --------------------------- the made sounds' raw stuff ---------------------------
   Noise with things in it, as samples from -1 to 1, so the engine can loop
   a few seconds of it: crackle for a vox channel, drops for rain, the relays
   of a cogitator. Seeded, so a check can hold it still. */

export function seeded(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function noiseSamples({ seconds = 2, rate = 44100, rng = Math.random, bed = 1, crackle = 0, drops = 0, ticks = 0 } = {}) {
  const n = Math.max(1, Math.round(seconds * rate));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (rng() * 2 - 1) * bed;
  // Crackle: short bursts, a few to the second.
  const burst = (at, len, amp, decay) => {
    for (let j = 0; j < len && at + j < n; j++) out[at + j] += (rng() * 2 - 1) * amp * Math.exp(-j / decay);
  };
  for (let k = 0; k < Math.round(crackle * seconds * 12); k++) burst(Math.floor(rng() * n), Math.round(rate * 0.012), 0.9, rate * 0.003);
  // Drops: tiny bright clicks, many to the second.
  for (let k = 0; k < Math.round(drops * seconds * 180); k++) burst(Math.floor(rng() * n), Math.round(rate * 0.004), 0.5 + rng() * 0.5, rate * 0.0008);
  // Ticks: relays, irregular but steady.
  let at = 0;
  while (ticks > 0 && at < n) {
    burst(at, Math.round(rate * 0.003), 0.8, rate * 0.0006);
    at += Math.round(rate / ticks * (0.5 + rng()));
  }
  // Kept inside -1..1, and the ends faded together so the loop has no click.
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const scale = peak > 1 ? 1 / peak : 1;
  const edge = Math.min(Math.round(rate * 0.02), Math.floor(n / 4));
  for (let i = 0; i < n; i++) {
    let v = out[i] * scale;
    if (i < edge) v *= i / edge;
    if (i >= n - edge) v *= (n - 1 - i) / edge;
    out[i] = v;
  }
  return out;
}
