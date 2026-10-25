// The Inquisition as an antagonist faction for a Rogue Trader dynasty.
//
// Data and a roller, same shape as npcgen.js: the retinue is built from
// bestiary entries that already carry Rogue Trader numbers, so nothing here
// invents a stat line. Whether a faction counts as Puritan or Radical is
// left to the GM's table — it is a campaign decision, not a stat.

import { bestiaryEntry, bestiaryToNpc } from './npcgen.js';

export const ORDOS = [
  { id: 'hereticus', name: 'Ordo Hereticus', remit: 'Heresy, witch-hunting, corruption inside the Imperium.' },
  { id: 'malleus', name: 'Ordo Malleus', remit: 'Daemons and the warp.' },
  { id: 'xenos', name: 'Ordo Xenos', remit: 'Alien threats and xenos artefacts.' }
];

export const INQUISITION_FACTIONS = [
  { id: 'thorian', name: 'Thorian' },
  { id: 'monodominant', name: 'Monodominant' },
  { id: 'amalathian', name: 'Amalathian' },
  { id: 'xanthite', name: 'Xanthite' },
  { id: 'recongregator', name: 'Recongregator' }
];

export const ordoById = (id) => ORDOS.find((o) => o.id === id) || null;
export const factionById = (id) => INQUISITION_FACTIONS.find((f) => f.id === id) || null;

// Names of existing bestiary entries. The check file asserts every one of
// them resolves, so renaming a bestiary entry cannot silently empty this.
export const INQUISITOR_ENTRY = 'Inquisitor Havelock Blackheel';
export const RETINUE = [
  { id: 'bodyguard', role: 'Bodyguard', entry: 'Oathsworn Bodyguard' },
  { id: 'gun', role: 'Hired gun', entry: 'Hired Gun' },
  { id: 'servitor', role: 'Battle servitor', entry: 'Battle Servitor' },
  { id: 'psyker', role: 'Psyker', entry: 'Warp Witch' },
  { id: 'assassin', role: 'Assassin', entry: 'Culexus Assassin' },
  { id: 'skull', role: 'Familiar', entry: 'Servo Skull' }
];

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

// A rolled Inquisitor and retinue, each member ready for npc_add.
export function rollInquisitor({ rng = Math.random, ordoId = null, factionId = null, retinueSize = null } = {}) {
  const ordo = ordoById(ordoId) || pick(ORDOS, rng);
  const faction = factionById(factionId) || pick(INQUISITION_FACTIONS, rng);
  const size = Number.isFinite(retinueSize) ? Math.max(0, Math.min(6, retinueSize)) : 2 + Math.floor(rng() * 3);

  const pool = RETINUE.slice();
  const retinue = [];
  for (let i = 0; i < size && pool.length; i++) {
    const m = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    retinue.push({ ...bestiaryToNpc(m.entry), role: m.role });
  }
  return {
    ordo: ordo.name, faction: faction.name,
    inquisitor: { ...bestiaryToNpc(INQUISITOR_ENTRY), name: `Inquisitor (${ordo.name}, ${faction.name})` },
    retinue
  };
}

// HOUSE CONVERSION. Inquisitor profiles run on a hotter scale than Rogue
// Trader's — an average soldier sits at WS/BS 50-60 where an RT guardsman
// has 30-35 — so an imported characteristic is scaled by 0.6 and rounded to
// the nearest 5. One line, so a different table's ratio is a one-line change.
export const INQUISITOR_TO_RT = 0.6;
export const convertInquisitorStat = (v) =>
  Math.max(0, Math.round(((Number(v) || 0) * INQUISITOR_TO_RT) / 5) * 5);
