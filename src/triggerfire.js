/* Springing a trigger zone (see triggers.js): what changes on the deck, and
   what the table is told.

   springTriggers compares the deck before a change with the deck after it and
   fires whatever that change set off: a zone the party has just been placed
   in, or one that has just come into view. Only on a deck being played (fog
   on), and only from a deck that was already being played, so switching the
   fog on is not the party seeing everything at once.

   A trigger's effects on the deck are applied here, as one new map; the rest
   (a sound, a handout, the GM's note) are handed back for the caller, which
   has the speakers and the screens.

   Pure: see triggers.check.mjs. */

import {
  readMap, cellKey, parseKey, regionAt, visibleExplored, workRoomDoors,
  LIGHTING_PRESETS, hazardById
} from './battlemap.js';
import { noisePing, noiseById } from './awareness.js';
import { anyArmed } from './triggers.js';

// The squares of the zone that are deck, and the rooms they stand in.
function zoneRooms(m, t) {
  const cells = t.cells.map(parseKey).filter((c) => c && m.floor[cellKey(c.x, c.y)]);
  const room = new Set();
  const reps = [];
  for (const c of cells) {
    const k = cellKey(c.x, c.y);
    if (room.has(k)) continue;
    reps.push(c);
    for (const r of regionAt(m, c)) room.add(cellKey(r.x, r.y));
  }
  return { cells, room, reps };
}

// One trigger's effects, as the deck after them. Spent unless it repeats.
export function fireTrigger(map, t) {
  let m = readMap(map);
  const { cells, room, reps } = zoneRooms(m, t);

  if (t.doors) {
    for (const p of reps) {
      const wp = workRoomDoors(m, p, t.doors);
      if (wp) m = readMap({ ...m, ...wp });
    }
  }
  if (t.reveal) {
    const explored = { ...m.explored };
    for (const k of room) explored[k] = true;
    m = readMap({ ...m, explored });
  }
  if (t.contacts) {
    const contacts = { ...m.contacts };
    const explored = { ...m.explored };
    for (const [k, c] of Object.entries(m.contacts)) {
      if (!room.has(k)) continue;
      contacts[k] = { ...c, state: 'seen' };
      explored[k] = true;
    }
    m = readMap({ ...m, contacts, explored });
  }
  if (t.light && LIGHTING_PRESETS.some((p) => p.id === t.light)) {
    const light = { ...m.light };
    // The deck's own light is the absence of paint.
    for (const k of room) { if (t.light === m.lighting) delete light[k]; else light[k] = t.light; }
    m = readMap({ ...m, light });
  }
  if (t.hazard && hazardById(t.hazard)) {
    const hazards = { ...m.hazards };
    for (const c of cells) hazards[cellKey(c.x, c.y)] = t.hazard;
    m = readMap({ ...m, hazards });
  }
  if (t.noise && noiseById(t.noise) && cells.length) {
    m = readMap({ ...m, contacts: noisePing(m, cells[0], t.noise) });
  }
  if (t.once) {
    m = readMap({ ...m, triggers: m.triggers.map((x) => (x.id === t.id ? { ...x, armed: false } : x)) });
  }
  return m;
}

// What the caller is told of a trigger that went off.
const told = (t) => ({ id: t.id, name: t.name, note: t.note, cue: t.cue, handout: t.handout });

export function springTriggers(prevMap, nextMap) {
  const next = readMap(nextMap);
  if (!next.fog || !anyArmed(next.triggers)) return { map: next, fired: [] };
  const prev = readMap(prevMap);
  if (!prev.fog) return { map: next, fired: [] };
  let nowShown = null, wasShown = null;
  const due = [];
  for (const t of next.triggers) {
    if (!t.armed || !t.cells.length) continue;
    if (t.when === 'entered') {
      const vp = next.viewpoint, was = prev.viewpoint;
      const moved = vp && (!was || was.x !== vp.x || was.y !== vp.y);
      if (moved && t.cells.includes(cellKey(vp.x, vp.y))) due.push(t);
    } else {
      nowShown = nowShown || visibleExplored(next);
      wasShown = wasShown || visibleExplored(prev);
      if (t.cells.some((k) => nowShown[k]) && !t.cells.some((k) => wasShown[k])) due.push(t);
    }
  }
  let m = next;
  for (const t of due) m = fireTrigger(m, t);
  return { map: m, fired: due.map(told) };
}

// Sprung by the GM's own hand, armed or not.
export const springNow = (map, t) => ({ map: fireTrigger(map, t), fired: [told(t)] });
