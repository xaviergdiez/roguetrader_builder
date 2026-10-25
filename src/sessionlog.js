// The session log: what each character did, tallied from the bridge's event
// log at the end of a session, written up as a diary entry, and turned into
// an XP SUGGESTION — never an automatic award.
//
// Inquisitor awards a point per category (survived, scored an objective,
// used a psychic power, fired, fought, wounded an enemy); here those are the
// categories of the diary, so the GM sees at a glance who did what. The XP
// itself is Rogue Trader's own guidance (p.291): 500 xp per four-hour
// session by the Abstract Method, or the Encounter Difficulty table by the
// Detailed Method, plus a 100-500 roleplaying award at the GM's discretion.

export const CATEGORIES = [
  { id: 'survived', name: 'Survived' },
  { id: 'objective', name: 'Scored an objective' },
  { id: 'psychic', name: 'Used a psychic power' },
  { id: 'fired', name: 'Fired a weapon' },
  { id: 'fought', name: 'Fought in melee' },
  { id: 'wounded', name: 'Wounded an enemy' }
];

// Which bridge events count towards which category. An event may carry an
// `actor` (the character who acted); failing that it is the entry's charId.
const EVENT_CATEGORY = {
  player_fired: 'fired',
  player_melee: 'fought',
  psychic_power: 'psychic',
  objective_scored: 'objective'
};

// entries: bridge log lines ({ event, charId, actor }). `survivors` and
// `objectiveChars` are decided by the GM (or read from vitals) rather than
// guessed from the log. Returns { charId: { fired: 1, ... } }.
export function tallySession(entries, { survivors = [], objectiveChars = [] } = {}) {
  const out = {};
  const bump = (id, cat) => {
    if (!id) return;
    out[id] = out[id] || {};
    out[id][cat] = (out[id][cat] || 0) + 1;
  };
  for (const e of entries || []) {
    const who = e && (e.actor || e.charId);
    const cat = EVENT_CATEGORY[e && e.event];
    if (cat) bump(who, cat);
    // A character's own attack on a hostile (npc_damage) is logged with how
    // it was made and whether it landed: shooting is "fired", swinging is
    // "fought", and only a hit "wounded an enemy". A miss still counts as
    // the attempt.
    if (e && e.event === 'npc_damage' && who) {
      if (e.attack === 'ranged') bump(who, 'fired');
      if (e.attack === 'melee') bump(who, 'fought');
      if (e.hit) bump(who, 'wounded');
    }
  }
  for (const id of survivors) bump(id, 'survived');
  for (const id of objectiveChars) bump(id, 'objective');
  return out;
}

// Encounter Difficulty table, RT Table 10-1 (p.291).
export const ENCOUNTER_XP = {
  easy: 50, routine: 70, ordinary: 100, average: 130, challenging: 170, hard: 200, 'very hard': 250
};
export const ABSTRACT_XP_PER_SESSION = 500;
export const SESSION_HOURS = 4;

// A suggestion with its working shown, so the GM can see where it came from.
// `method`: 'abstract' scales 500 xp by hours played; 'detailed' adds up the
// difficulty of each encounter. `roleplaying` is the GM's own 0-500 award.
export function suggestXp({ method = 'abstract', hours = SESSION_HOURS, encounters = [], roleplaying = 0 } = {}) {
  const parts = [];
  if (method === 'detailed') {
    for (const d of encounters) {
      const xp = ENCOUNTER_XP[String(d).toLowerCase()];
      if (xp) parts.push({ label: `Encounter (${d})`, xp });
    }
  } else {
    const h = Math.max(0, Number(hours) || 0);
    parts.push({ label: `Session (${h}h at ${ABSTRACT_XP_PER_SESSION} per ${SESSION_HOURS}h)`,
      xp: Math.round((ABSTRACT_XP_PER_SESSION * h) / SESSION_HOURS) });
  }
  const rp = Math.max(0, Math.min(500, Math.floor(Number(roleplaying) || 0)));
  if (rp) parts.push({ label: 'Roleplaying award', xp: rp });
  return { parts, total: parts.reduce((n, p) => n + p.xp, 0), suggestion: true };
}

// The diary entry: one line per character, in category order.
export function diaryEntry(tally, names = {}, { title = 'Session', xp = null } = {}) {
  const lines = Object.entries(tally || {}).map(([id, t]) => {
    const bits = CATEGORIES.filter((c) => t[c.id]).map((c) => (t[c.id] > 1 ? `${c.name} x${t[c.id]}` : c.name));
    return `${names[id] || id}: ${bits.join(', ') || 'no recorded actions'}`;
  });
  const head = xp && xp.total ? `${title} (suggested XP: ${xp.total} each)` : title;
  return [head, ...lines].join('\n');
}
