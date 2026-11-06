/* TRIGGER ZONES: squares on the deck that do something when the party gets
   there. A tripwire, a sensor field, a pressure plate, the room where the
   ambush waits.

   The fight is played with miniatures, so nothing here knows where a model
   is standing. What the map does know is what the GM tells it as the party
   moves: the square they have got to (the viewpoint, set by revealing where
   they are or by opening a door from it), and what is in view on the table's
   screen. A trigger listens for one of those:

     entered   the party is placed on one of its squares
     seen      one of its squares comes into view on the table

   and the GM can spring any trigger by hand.

   What it does, any of:

     reveal    the fog lifts off its room
     contacts  what lies in wait in its room is brought out: seen
     doors     its room's doors slam shut, seal (shut and jammed), or open
     light     its room goes to that light: the lumens die, or come on
     hazard    its own squares catch fire, fill with gas...
     noise     a noise from it, which pings anything hidden within earshot
     cue       a sound from the ambience board
     handout   a handout up on the table's screen
     note      words for the GM alone: what happened, and what to roll

   This module is the record only, and imports nothing from the map: the map's
   own reader keeps triggers with it. Springing one is triggerfire.js.

   Pure: see triggers.check.mjs. */

export const TRIGGER_WHEN = [
  { id: 'entered', name: 'When the party steps in' },
  { id: 'seen', name: 'When the party first sees it' }
];
export const TRIGGER_DOORS = [
  { id: '', name: 'Leave the doors' },
  { id: 'closed', name: 'Slam its room’s doors shut' },
  { id: 'jammed', name: 'Seal them: shut and jammed' },
  { id: 'open', name: 'Open them' }
];
export const MAX_TRIGGERS = 40;
export const MAX_TRIGGER_CELLS = 400;

const ID = /^t[a-z0-9]{3,40}$/;
const WORD = /^[a-z_]{1,24}$/;
const REF = /^[a-z0-9][a-z0-9-]{0,47}$/i;
const KEY = /^-?\d{1,4},-?\d{1,4}$/;

let seq = 0;
export const newTriggerId = () => 't' + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 5);

export function readTrigger(v) {
  if (!v || typeof v !== 'object' || typeof v.id !== 'string' || !ID.test(v.id)) return null;
  const cells = [...new Set((Array.isArray(v.cells) ? v.cells : []).filter((k) => typeof k === 'string' && KEY.test(k)))]
    .slice(0, MAX_TRIGGER_CELLS);
  const word = (x) => (typeof x === 'string' && WORD.test(x) ? x : '');
  return {
    id: v.id,
    name: String(v.name == null ? '' : v.name).slice(0, 40),
    cells,
    when: TRIGGER_WHEN.some((w) => w.id === v.when) ? v.when : 'entered',
    armed: v.armed !== false,
    once: v.once !== false,
    note: String(v.note == null ? '' : v.note).slice(0, 600),
    reveal: Boolean(v.reveal),
    contacts: Boolean(v.contacts),
    doors: TRIGGER_DOORS.some((d) => d.id === v.doors) ? v.doors : '',
    light: word(v.light),
    hazard: word(v.hazard),
    noise: word(v.noise),
    cue: typeof v.cue === 'string' && REF.test(v.cue) ? v.cue : '',
    handout: typeof v.handout === 'string' && /^h[a-z0-9]{4,40}$/.test(v.handout) ? v.handout : ''
  };
}

export function readTriggers(list) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const t = readTrigger(raw);
    if (!t || seen.has(t.id) || out.length >= MAX_TRIGGERS) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}

export const newTrigger = (n = 1) => readTrigger({ id: newTriggerId(), name: `Trigger ${n}` });

export const triggerById = (list, id) => (list || []).find((t) => t.id === id) || null;

// The trigger a square belongs to, the first that claims it.
export const triggerAt = (list, key) => (list || []).find((t) => t.cells.includes(key)) || null;

// Squares added to a trigger, or taken off it. A square belongs to one trigger
// at a time: painting it into one takes it out of any other.
export function paintTrigger(list, id, keys, on = true) {
  const add = new Set(keys);
  return readTriggers((list || []).map((t) => {
    if (t.id === id) {
      const cells = on ? [...new Set([...t.cells, ...keys])] : t.cells.filter((k) => !add.has(k));
      return { ...t, cells: cells.slice(0, MAX_TRIGGER_CELLS) };
    }
    return on ? { ...t, cells: t.cells.filter((k) => !add.has(k)) } : t;
  }));
}

export const updateTrigger = (list, id, patch) =>
  readTriggers((list || []).map((t) => (t.id === id ? { ...t, ...patch, id: t.id } : t)));

// Every trigger ready again: a deck put on the table afresh, or a GM resetting.
export const rearmAll = (list) => readTriggers((list || []).map((t) => ({ ...t, armed: true })));

// Whether anything on the deck is waiting to go off, asked before any work.
export const anyArmed = (list) => (list || []).some((t) => t.armed && t.cells.length);
