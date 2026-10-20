// Encounters: a named list of hostiles assembled BEFORE play, weighed
// against the party that will meet them, and pushed onto the board as one
// action when the moment comes.
//
// The board itself already exists — ground.npcs on the shared ship, filled
// one hostile at a time by npc_add. That works at the table but gives a GM
// nowhere to prepare, and no answer to the only question that matters while
// preparing: is this too much for them?
//
// WHERE AN ENCOUNTER IS STORED. On the user record, through /api/homebrew,
// beside the hulls and components. Not its own route: the Hobby plan allows
// twelve serverless functions and six are already spent, and an encounter
// library is the same kind of thing as a homebrew library — a few hundred
// bytes an entry, authored by one account, followed between devices. The
// route's own guards (entry count, byte ceiling) cover it unchanged.
//
// A hostile inside an encounter is stored in exactly the shape npc_add
// takes, so pushing one to the board is a copy rather than a conversion.

import { THREAT_TIERS, tierById, rollNpc } from './npcgen.js';

/* ------------------------------ threat weight ------------------------------
   One formula, used for a hostile and for a player character alike. Using
   the same one on both sides is the point: a ratio between two numbers
   produced different ways would mean nothing.

   Two things decide how much a combatant is worth in a fight:

     durability  how much punishment it absorbs. Wounds, plus armour and
                 Toughness Bonus — those two subtract from EVERY hit rather
                 than once, so a point of either is worth several Wounds.
     offence     how reliably it lands a hit, as a fraction of a baseline
                 trained combatant.

   The numbers below are a yardstick for comparing one side against the
   other, not a simulation. They are deliberately crude, and the band they
   produce is advice. */

// A point of soak applies to every hit that lands, so it is worth more than
// a point of Wounds. Three is the ratio that makes a lightly-armoured brawler
// and a heavily-armoured one weigh about what they feel like at the table.
export const SOAK_WEIGHT = 3;

// Weapon Skill / Ballistic Skill of a competent trained fighter. A starting
// Explorer sits near here, so a party of them scores about 1.0 for offence.
export const BASELINE_SKILL = 35;

export function threatWeight({ wounds = 0, armour = 0, toughnessBonus = 0, ws = 0, bs = 0 } = {}) {
  const n = (x) => Math.max(0, Number(x) || 0);
  const durability = n(wounds) + (n(armour) + n(toughnessBonus)) * SOAK_WEIGHT;
  // A combatant with no skill on file still soaks damage, so it is not
  // weightless — it is scored as half a baseline rather than zero.
  const skill = Math.max(n(ws), n(bs)) || BASELINE_SKILL / 2;
  return Math.round(durability * (skill / BASELINE_SKILL));
}

// Has this hostile enough on it to be worth weighing? A placeholder out of
// the page index has a name, a citation and nothing else; counting it as the
// one Wound it was created with would drag an encounter's whole reckoning
// down and report Trivial for a fight nobody has statted yet.
// Checked against null rather than through Number(): Number(null) is 0,
// which is finite, so a finiteness test reads "no skill on file" as "a skill
// of zero" and the placeholder gets weighed after all.
const absent = (v) => v === null || v === undefined || v === '';
export const isUnweighed = (h) => Boolean(h && h.custom) && absent(h.ws) && absent(h.bs);

// A roster hostile carries its own numbers, so it is weighed directly.
export const hostileWeight = (h) => (isUnweighed(h) ? 0 : threatWeight({
  wounds: h && h.max, armour: h && h.armour,
  toughnessBonus: h && h.toughnessBonus, ws: h && h.ws, bs: h && h.bs
}));

// A tier's own ranges, for weighing something not yet rolled — the midpoint
// of each range, which is what "a Heavy" is worth on average.
export function tierWeight(tierId) {
  const t = tierById(tierId);
  if (!t) return 0;
  const mid = ([a, b]) => (a + b) / 2;
  return threatWeight({
    wounds: mid(t.wounds), armour: mid(t.armour),
    // The tier table carries Toughness, not its Bonus.
    toughnessBonus: Math.floor(mid(t.t) / 10), ws: mid(t.wsBs), bs: mid(t.wsBs)
  });
}

export const encounterWeight = (enc) =>
  ((enc && enc.hostiles) || []).reduce((n, h) => n + hostileWeight(h), 0);

/* ------------------------------ the party side ------------------------------
   Weighed the same way, from what the table has actually published. A
   character who has published nothing cannot be weighed, and is counted as
   a baseline Explorer rather than as nothing — a party of four is a party
   of four whether or not all four have filled in a crew card. */

export const BASELINE_PC = { wounds: 11, armour: 4, toughnessBonus: 3, ws: 35, bs: 35 };

export function partyMemberWeight({ card = null, vitals = null } = {}) {
  const ch = (card && card.characteristics) || {};
  const wounds = (vitals && Number(vitals.max)) || BASELINE_PC.wounds;
  const bonus = (v) => Math.floor((Number(v) || 0) / 10);
  const known = Number(ch.ws) || Number(ch.bs) || Number(ch.t);
  if (!known) return threatWeight({ ...BASELINE_PC, wounds });
  return threatWeight({
    wounds,
    // Armour is not on the card as a number — it is a list of gear labels
    // the GM's terminal resolves. Rather than resolve it here and make this
    // module depend on gear.js, a published character is credited the same
    // flak-jacket 4 the baseline assumes.
    armour: BASELINE_PC.armour,
    toughnessBonus: bonus(ch.t),
    ws: Number(ch.ws) || 0,
    bs: Number(ch.bs) || 0
  });
}

export const partyWeight = (members) =>
  (members || []).reduce((n, m) => n + partyMemberWeight(m), 0);

/* -------------------------------- difficulty --------------------------------
   The ratio of one side's weight to the other's, in bands. Ordered hardest
   first so the first match wins. */

export const DIFFICULTY_BANDS = [
  { min: 2.0, id: 'deadly', name: 'Deadly',
    note: 'Expect casualties. Fate Points will be burned, and may not be enough.' },
  { min: 1.3, id: 'hard', name: 'Hard',
    note: 'A real fight. The party should expect to spend resources to win it.' },
  { min: 0.85, id: 'even', name: 'Even',
    note: 'An even match. Tactics and the dice decide it.' },
  { min: 0.5, id: 'straightforward', name: 'Straightforward',
    note: 'The party should win, but not for free.' },
  { min: 0, id: 'trivial', name: 'Trivial',
    note: 'A speed bump. Worth running only for pace or flavour.' }
];

export function difficulty(enc, members) {
  const hostiles = (enc && enc.hostiles) || [];
  const unweighed = hostiles.filter(isUnweighed).length;
  const threat = encounterWeight(enc);
  const party = partyWeight(members);
  // Nothing statted at all: there is a fight here but no way to weigh it,
  // so the band is withheld and the count is reported instead of a 0.01x
  // that reads as harmless.
  if (!threat) return unweighed ? { threat: 0, party, ratio: null, band: null, unweighed } : null;
  // Nobody to weigh it against: the threat is real but the ratio is not,
  // so the band is withheld rather than guessed from a party of zero.
  if (!party) return { threat, party: 0, ratio: null, band: null, unweighed };
  const ratio = threat / party;
  return {
    threat, party, ratio, unweighed,
    band: DIFFICULTY_BANDS.find((b) => ratio >= b.min) || DIFFICULTY_BANDS[DIFFICULTY_BANDS.length - 1]
  };
}

/* -------------------------------- the shape -------------------------------- */

export const MAX_HOSTILES = 24;

const newId = () => `enc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const EMPTY_ENCOUNTER = { id: null, name: '', note: '', hostiles: [], source: null };

// Anything absent or the wrong shape reads as an empty encounter rather than
// throwing — this comes from storage, another device, or a hand-edited blob,
// the same rule homebrew.js already follows.
export function readEncounter(e) {
  const src = e && typeof e === 'object' ? e : null;
  const hostiles = Array.isArray(src && src.hostiles)
    ? src.hostiles.filter((h) => h && typeof h === 'object').slice(0, MAX_HOSTILES)
    : [];
  return {
    id: (src && typeof src.id === 'string' && src.id) || newId(),
    name: String((src && src.name) || '').slice(0, 80),
    note: String((src && src.note) || '').slice(0, 300),
    hostiles: hostiles.map(readHostile),
    source: (src && src.source && typeof src.source === 'object') ? src.source : null
  };
}

// Stored in npc_add's own shape, so pushing to the board is a copy. The
// event re-validates everything anyway — this is about not storing junk,
// not about trusting it later.
export function readHostile(h) {
  // null, undefined and '' are ABSENT, not zero. Number(null) is 0 and
  // Number('') is 0, both of which are finite — so a plain isFinite check
  // turns "no armour value on file" into "armour 0", and npc_add reads those
  // two differently: null means the GM adjudicates, 0 means unarmoured.
  const num = (v, fallback = null) => {
    if (v === null || v === undefined || v === '') return fallback;
    return Number.isFinite(Number(v)) ? Math.floor(Number(v)) : fallback;
  };
  return {
    name: String((h && h.name) || 'Hostile').slice(0, 60) || 'Hostile',
    max: Math.max(1, num(h && h.max, 1)),
    ws: num(h && h.ws), bs: num(h && h.bs),
    toughnessBonus: num(h && h.toughnessBonus), armour: num(h && h.armour),
    weapon: (h && h.weapon) ? String(h.weapon).slice(0, 80) : null,
    agilityBonus: num(h && h.agilityBonus, 3),
    // Kept for the GM's own reference; npc_add ignores what it does not know.
    tier: (h && typeof h.tier === 'string') ? h.tier : null,
    behaviour: (h && h.behaviour) ? String(h.behaviour).slice(0, 200) : null,
    // A creature taken from the page index arrives named and cited with no
    // numbers at all — the index has none. It is carried here so the
    // difficulty reckoning can leave it out rather than weigh a blank as
    // though it were a real combatant.
    custom: Boolean(h && h.custom),
    note: (h && h.note) ? String(h.note).slice(0, 200) : null
  };
}

export const readLibrary = (list) =>
  (Array.isArray(list) ? list : []).map(readEncounter);

export const newEncounter = (name = 'New encounter') => ({ ...EMPTY_ENCOUNTER, id: newId(), name });

// The npc_add payload for one hostile. The board gives every arrival its own
// id, so none is sent: pushing the same encounter twice puts two separate
// groups on the board rather than colliding.
export const toNpcAdd = (h, encounterName) => ({
  id: 'npc_add',
  name: h.name, max: h.max, ws: h.ws, bs: h.bs,
  toughnessBonus: h.toughnessBonus, armour: h.armour,
  weapon: h.weapon, agilityBonus: h.agilityBonus,
  text: encounterName ? `${h.name} joins from ${encounterName}.` : `${h.name} joins.`
});

/* ------------------------- drafts from a star system -------------------------
   stargen.js names the places in a system that something lives in — a
   derelict station, a starship graveyard, an inhabited world, a pirate den —
   and leaves them for the GM to stock. Those are encounters waiting to be
   written, so they are offered as drafts here.

   The dependency runs this way deliberately: encounters knows about systems,
   systems knows nothing about encounters. A generator that had to produce
   encounter-shaped output would be answerable to this module's shape every
   time either changed. */

// Which antagonist origin suits a species a world rolled.
const ORIGIN_FOR_SPECIES = {
  eldar: 'eldar', human: 'renegade', kroot: 'kroot',
  ork: 'ork', rakgol: 'xenos_hybrid', other_xenos: 'xenos_hybrid'
};

// A draft is a PLACE, not a fight: it names somewhere something lives and
// carries what to roll if the GM wants it stocked. It is kept empty until
// then, because a GM who only wanted the name should not be handed six
// hostiles they did not ask for.
//
// suggest.count is the range of rank-and-file to roll; suggest.leaderTierId,
// where a place warrants one, rolls a single tougher hostile on top. Six
// identical Heavies is a wall, not an encounter.
const draft = (name, note, suggest, source) => ({
  ...EMPTY_ENCOUNTER, id: newId(), name, note, suggest, source
});

export function stockDraft(dft, { rng = Math.random } = {}) {
  if (!dft) return null;
  const sug = dft.suggest || {};
  const [lo, hi] = Array.isArray(sug.count) ? sug.count : [2, 4];
  const n = Math.max(1, lo + Math.floor(rng() * (Math.max(lo, hi) - lo + 1)));

  const hostiles = Array.from({ length: n }, () => readHostile(
    rollNpc({ rng, tierId: sug.tierId || null, originId: sug.originId || null })
  ));
  if (sug.leaderTierId) {
    hostiles.push(readHostile(
      rollNpc({ rng, tierId: sug.leaderTierId, originId: sug.originId || null })
    ));
  }
  return { ...dft, hostiles: hostiles.slice(0, MAX_HOSTILES) };
}

export function draftsFromSystem(system) {
  if (!system || !Array.isArray(system.zones)) return [];
  const out = [];

  if ((system.features || []).some((f) => f.id === 'pirate_den')) {
    out.push(draft('Pirate Den',
      'Somebody is using this system and not declaring themselves.',
      { tierId: 'heavy', originId: 'renegade', count: [3, 6], leaderTierId: 'elite' },
      { kind: 'system_feature', feature: 'pirate_den' }));
  }

  for (const zone of system.zones) {
    for (const el of zone.elements || []) {
      if (el.id === 'derelict_station') {
        out.push(draft(`Derelict Station — ${zone.name}`,
          'Whatever is still aboard has had a long time to get used to the dark.',
          { tierId: 'minor', originId: 'xenos_hybrid', count: [1, 4] },
          { kind: 'element', element: 'derelict_station', zone: zone.id }));
      } else if (el.id === 'starship_graveyard') {
        out.push(draft(`Starship Graveyard — ${zone.name}`,
          'Hulls enough to hide a fleet, and scavengers who got here first.',
          { tierId: 'heavy', originId: 'renegade', count: [2, 5], leaderTierId: 'elite' },
          { kind: 'element', element: 'starship_graveyard', zone: zone.id }));
      } else if (el.kind === 'planet' && el.planet && el.planet.inhabitants) {
        const sp = el.planet.inhabitants;
        out.push(draft(`${sp.name} — ${el.planet.climate.name}`,
          `A ${el.planet.habitability.name.toLowerCase()} world in the ${zone.name}, and it is not empty.`,
          { tierId: 'heavy', originId: ORIGIN_FOR_SPECIES[sp.id] || 'xenos_hybrid',
            count: [3, 6], leaderTierId: 'elite' },
          { kind: 'inhabitants', species: sp.id, zone: zone.id }));
      }
    }
  }
  return out;
}

/* ---- a line for a list ---- */

export function describeEncounter(enc) {
  const n = ((enc && enc.hostiles) || []).length;
  if (!n) return 'empty';
  const byTier = {};
  for (const h of enc.hostiles) {
    const key = h.tier || 'unranked';
    byTier[key] = (byTier[key] || 0) + 1;
  }
  const order = [...THREAT_TIERS.map((t) => t.id), 'unranked'];
  return order.filter((k) => byTier[k])
    .map((k) => `${byTier[k]} ${(tierById(k) || { name: 'unranked' }).name}`)
    .join(', ');
}
