/* A COMPARTMENT, MAPPED: the deck a boarding action or a damage-control
   party fights through when the ship plan says where (shipplan.js).

   Made by the deck generator (mapgen.js) in the ground that compartment is:
   the plasma decks in the Enginarium's orange-lit pipework, the bridge in
   the Command Deck's marble, the holds as the big chambers of the Cargo
   Lanes, the crew quarters as a warren of cells on the Lower Decks. Sized by
   the Space the component takes and shaped like its compartment on the
   plan, so the spine is long and the drive room is big. And dressed with a
   little of what belongs there: terminals on a bridge, machinery and fuel
   tanks round a drive, crates in a hold, a shrine by the Geller field.

   Seeded by the ship and the compartment, so the same compartment always
   maps the same way and a deck lost is a deck made again. Named
   "<ship>: <compartment>", which is how the plan finds the deck it made. */

import { generateDeck } from './mapgen.js';
import { makeRng } from './mapgen.js';
import { readMap, EMPTY_MAP, cellKey, MIN_GRID } from './battlemap.js';

const K = (theme, style, cover, markers = []) => ({ theme, style, cover, markers });
// What a compartment is called, both ways: its label and its component's name.
const said = (r) => `${r.label || ''} ${r.name || ''}`;

// What each kind of compartment is, in order: the first that fits.
const KINDS = [
  [(r) => r.category === 'plasmaDrive', K('enginarium', 'decks', ['machinery', 'tank', 'machinery'], ['cogitator'])],
  [(r) => r.category === 'warpEngine', K('enginarium', 'hulk', ['machinery', 'pillar'], ['shrine'])],
  [(r) => r.category === 'gellerField', K('forge_sanctum', 'decks', ['pillar', 'machinery'], ['shrine', 'cogitator'])],
  [(r) => r.category === 'voidShield', K('cogitator_vault', 'decks', ['machinery'], ['cogitator', 'cogitator'])],
  [(r) => r.category === 'bridge', K('command_deck', 'decks', ['low', 'pillar'], ['cogitator', 'cogitator', 'cogitator', 'shrine'])],
  [(r) => r.category === 'augurArray', K('cogitator_vault', 'decks', ['machinery'], ['cogitator', 'cogitator'])],
  [(r) => r.category === 'lifeSustainer', K('enginarium', 'decks', ['machinery', 'tank'], ['cogitator'])],
  [(r) => r.category === 'crewQuarters', K('lower_decks', 'warren', ['low', 'crates'], [])],
  [(r) => r.category === 'weapon', K('cargo_lanes', 'decks', ['crates', 'machinery'], ['objective'])],
  [(r) => /hangar|launch|bay\b/i.test(said(r)), K('hangar_bay', 'hulk', ['crates', 'tank'], ['deploy'])],
  [(r) => /munitorum|armou?ry|magazine/i.test(said(r)), K('cargo_lanes', 'decks', ['crates', 'tank'], [])],
  [(r) => /medic|infirm|sanitor|hospital|apothec/i.test(said(r)), K('medicae', 'decks', ['low'], ['cogitator'])],
  [(r) => /chapel|shrine|cathedral|temple|reliquar|ecclesi/i.test(said(r)), K('command_deck', 'hulk', ['pillar'], ['shrine'])],
  [(r) => /maze/i.test(said(r)), K('lower_decks', 'warren', ['low'], [])],
  // The spaces every ship of a size has (shipplan.js), and what a GM adds.
  [(r) => /navigator|sanctum|trophy|observator|gallery|stateroom|throne/i.test(said(r)), K('command_deck', 'decks', ['low', 'pillar'], ['shrine'])],
  [(r) => /\bcells?\b|brig|prison|gaol/i.test(said(r)), K('lower_decks', 'warren', ['low'], [])],
  [(r) => /manufactor|forge|workshop|teleport/i.test(said(r)), K('forge_sanctum', 'decks', ['machinery', 'tank'], ['cogitator'])],
  [(r) => /troop|barrack|armsmen/i.test(said(r)), K('lower_decks', 'warren', ['crates', 'low'], [])],
  [(r) => /librar|cogitat|lab|archive|astropath/i.test(said(r)), K('cogitator_vault', 'decks', ['machinery'], ['cogitator', 'cogitator'])],
  [(r) => /hold|cargo|smuggl|storage|vault/i.test(said(r)), K('cargo_lanes', 'hulk', ['crates', 'crates', 'tank'], [])],
  // What the hull is where no component is.
  [(r) => r.label === 'Crew decks', K('lower_decks', 'warren', ['low', 'crates'], [])],
  [(r) => r.label === 'Gun decks', K('cargo_lanes', 'decks', ['crates', 'machinery'], [])],
  [(r) => /Officers/.test(r.label), K('command_deck', 'decks', ['low'], [])],
  [(r) => r.label === 'Engineering', K('enginarium', 'decks', ['machinery', 'tank'], [])],
  [(r) => r.label === 'Command tower', K('command_deck', 'decks', ['low'], ['cogitator'])],
  [(r) => r.label === 'Main spine', K('rogue_trader', 'decks', ['crates'], [])]
];
const DEFAULT_KIND = K('rogue_trader', 'decks', ['crates', 'low'], []);

export const kindOf = (room) => {
  const hit = KINDS.find(([test]) => test(room || {}));
  return hit ? hit[1] : DEFAULT_KIND;
};

export const deckNameFor = (shipName, room) => `${shipName || 'The ship'}: ${room.label}`;

/* How big: a room's worth of squares for a component of no Space, more for
   each Space it takes, in the compartment's own proportions on the plan. */
export function deckSizeFor(room) {
  const area = Math.max(320, Math.min(1400, 320 + 55 * (Number(room.space) || 0) + (room.filler ? 240 : 0)));
  const aspect = Math.max(0.8, Math.min(2.6, room.w && room.h ? room.w / room.h : 1.5));
  const cols = Math.max(14, Math.min(64, Math.round(Math.sqrt(area * aspect))));
  const rows = Math.max(Math.max(10, MIN_GRID), Math.min(44, Math.round(area / cols)));
  return { cols, rows };
}

/* The props, inside the generated rooms and a square clear of their walls,
   never on a door and never two on one square. Cover cycles through the
   kind's list, a few to a room; each marker goes to a room of its own, the
   biggest first, so the bridge's terminals stand apart. */
function dress(gen, kind, rng) {
  const cover = {};
  const markers = {};
  const taken = new Set(Object.keys(gen.doors || {}));
  const spots = (r) => {
    const out = [];
    for (let x = r.x0 + 1; x <= r.x1 - 1; x++) {
      for (let y = r.y0 + 1; y <= r.y1 - 1; y++) {
        const k = cellKey(x, y);
        if (gen.floor[k] && !taken.has(k)) out.push(k);
      }
    }
    return out;
  };
  const pickFrom = (list) => {
    const free = list.filter((k) => !taken.has(k));
    if (!free.length) return null;
    const k = free[Math.floor(rng() * free.length)];
    taken.add(k);
    return k;
  };
  const rooms = [...(gen.rooms || [])].sort((a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0));
  kind.markers.forEach((type, i) => {
    const r = rooms[i % Math.max(1, rooms.length)];
    const k = r ? pickFrom(spots(r)) : null;
    if (k) markers[k] = { type, label: '' };
  });
  let n = 0;
  for (const r of rooms) {
    const area = (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
    const want = Math.min(4, Math.max(1, Math.round(area / 30)));
    const s = spots(r);
    for (let i = 0; i < want; i++) {
      const k = pickFrom(s);
      if (k) cover[k] = kind.cover[n++ % kind.cover.length];
    }
  }
  return { cover, markers };
}

/* { name, theme, style, seed, cols, rows, map } for a compartment of a ship.
   `room` is a room off the ship plan. */
export function compartmentDeck(room, { shipName = 'The ship' } = {}) {
  const kind = kindOf(room);
  const { cols, rows } = deckSizeFor(room);
  const seed = `${shipName}|${room.id || room.key}|${room.label}`;
  const gen = generateDeck({ cols, rows, style: kind.style, seed });
  const { cover, markers } = dress(gen, kind, makeRng(seed + '|dress'));
  const map = readMap({ ...EMPTY_MAP, theme: kind.theme, cols: gen.cols, rows: gen.rows, floor: gen.floor, doors: gen.doors, cover, markers });
  return { name: deckNameFor(shipName, room), theme: kind.theme, style: kind.style, seed, cols: gen.cols, rows: gen.rows, map };
}
