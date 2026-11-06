/* TONIGHT'S SCENES: a mission's evening, laid out in order beforehand.

   A scene is what the table should be looking at and hearing when the story
   gets somewhere:

     { id, name, deck, chart, handout, cue, note }

   `deck` is a saved deck, put on the table as Publish for play would (fog on,
   the party in its starting room); `chart` a saved void chart; `handout` one
   of the GM's handouts, up on the table's screen; `cue` a sound from the
   ambience board. Any may be empty: a scene that only changes the music is a
   scene. `note` is the GM's own reminder of what happens here.

   A mission keeps its scenes with it (endeavours.js), GM-only. Running them
   is one button: the next scene, with the table's screen fading to black
   while the map is changed under it.

   Pure: see scenes.check.mjs. */

export const MAX_SCENES = 20;
const ID = /^s[a-z0-9]{3,40}$/;
const REF = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const ref = (v) => (typeof v === 'string' && REF.test(v) ? v : '');

let seq = 0;
export const newSceneId = () => 's' + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 5);

export function readScene(v) {
  if (!v || typeof v !== 'object' || typeof v.id !== 'string' || !ID.test(v.id)) return null;
  return {
    id: v.id,
    name: String(v.name == null ? '' : v.name).slice(0, 60),
    deck: ref(v.deck),
    chart: ref(v.chart),
    handout: typeof v.handout === 'string' && /^h[a-z0-9]{4,40}$/.test(v.handout) ? v.handout : '',
    cue: ref(v.cue),
    note: String(v.note == null ? '' : v.note).slice(0, 400)
  };
}

export function readScenes(list) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const s = readScene(raw);
    if (!s || seen.has(s.id) || out.length >= MAX_SCENES) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out;
}

export const newScene = (n = 1) => readScene({ id: newSceneId(), name: `Scene ${n}` });

// One scene moved up (-1) or down (+1) the evening.
export function moveScene(list, id, by) {
  const out = readScenes(list);
  const i = out.findIndex((s) => s.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= out.length) return out;
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

// Whether a scene changes anything at all.
export const sceneDoes = (s) => Boolean(s && (s.deck || s.chart || s.handout || s.cue));

/* What a scene does, in words, from the names the GM gave things. A name no
   longer found (a deck deleted since) is said to be missing rather than
   silently skipped. */
export function describeScene(s, { decks = [], charts = [], handouts = [], cues = [] } = {}) {
  if (!s) return '';
  const named = (list, id) => (list.find((x) => x.id === id) || {}).name;
  const bits = [];
  if (s.deck) bits.push('deck: ' + (named(decks, s.deck) || 'missing'));
  if (s.chart) bits.push('void chart: ' + (named(charts, s.chart) || 'missing'));
  if (s.handout) bits.push('handout: ' + (named(handouts, s.handout) || 'missing'));
  if (s.cue) bits.push('sound: ' + (named(cues, s.cue) || 'missing'));
  return bits.length ? bits.join(' · ') : 'nothing changes';
}

/* Where the evening is: which endeavour, which mission, which scene. Kept by
   this browser so a reload mid-session comes back to the same place. */
export const TONIGHT_KEY = 'rt:tonight';
export function readTonight(v) {
  if (!v || typeof v !== 'object') return null;
  const i = Math.round(Number(v.index));
  if (typeof v.endId !== 'string' || typeof v.missionId !== 'string' || !Number.isFinite(i) || i < 0) return null;
  return { endId: v.endId.slice(0, 80), missionId: v.missionId.slice(0, 80), index: Math.min(i, MAX_SCENES - 1) };
}
