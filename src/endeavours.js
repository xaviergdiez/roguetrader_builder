// Endeavours: the campaign's own structure, as a journal.
//
//   Endeavour  ->  Missions  ->  Objectives
//
// Rogue Trader already builds a campaign out of Endeavours, and three rules
// this app carries refer to them without there being one to refer to:
// Stoic reduces the Profit Factor an Endeavour pays, Adventurous turns on
// whether one is running, and Finances in Arrears adds 50 Achievement Points
// to every Objective (see shiphistory.js). This is the thing they point at.
//
// WHAT IS NOT HERE, AND WHY. The printed tables that say how many
// Achievement Points an Objective of a given scale is worth, and how much
// Profit Factor an Endeavour pays out, are not transcribed — the same rule
// this app follows everywhere else: a figure is quoted from the book or it
// is the GM's to set. So an Objective carries the target the GM types, and
// the tracker does the counting. That is what a journal is for; it is not a
// rules engine, and it does not pretend to be one.
//
// Objectives come in kinds because a campaign is not only fights. A combat
// Objective can name an encounter out of the encounter library, which is the
// one place the two halves of GM prep meet.

/* ------------------------------ objective kinds ------------------------------ */

const K = (id, name, note) => ({ id, name, note });

export const OBJECTIVE_KINDS = [
  K('combat', 'Combat', 'A fight. Can name a saved encounter.'),
  K('investigation', 'Investigation',
    'Questioning, evidence, a trail followed. Inquiry, Scrutiny, Search, Logic.'),
  K('puzzle', 'Puzzle',
    'A mechanism, a cipher, a sealed vault. Solved rather than rolled, mostly.'),
  K('social', 'Social', 'An audience, a negotiation, a threat made well.'),
  K('exploration', 'Exploration', 'Surveying, making planetfall, charting what nobody has.'),
  K('acquisition', 'Acquisition', 'Getting hold of something. See the Acquisition test.'),
  K('warp', 'Warp Travel', 'A crossing, and what the Immaterium makes of it.'),
  K('other', 'Other', 'Anything the rest of this list does not cover.')
];

export const kindById = (id) => OBJECTIVE_KINDS.find((k) => k.id === id) || null;

export const STATUSES = [
  { id: 'planned', name: 'Planned' },
  { id: 'active', name: 'Under way' },
  { id: 'done', name: 'Completed' },
  { id: 'abandoned', name: 'Abandoned' }
];

export const statusById = (id) => STATUSES.find((s) => s.id === id) || STATUSES[0];

/* --------------------------------- the shape --------------------------------- */

const newId = (p) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const EMPTY_ENDEAVOUR = {
  id: null, name: '', note: '', status: 'planned',
  profitFactorReward: 0, apModifier: 0, missions: []
};

const str = (v, max) => String(v == null ? '' : v).slice(0, max);
const int = (v, fallback = 0) => {
  if (v === null || v === undefined || v === '') return fallback;
  return Number.isFinite(Number(v)) ? Math.floor(Number(v)) : fallback;
};

export function readObjective(o) {
  const src = o && typeof o === 'object' ? o : null;
  const kind = kindById(src && src.kind) ? src.kind : 'other';
  return {
    id: (src && typeof src.id === 'string' && src.id) || newId('obj'),
    kind,
    name: str(src && src.name, 120),
    note: str(src && src.note, 400),
    // What completing it is worth, and what has been earned so far. Both
    // the GM's to set: see the note at the top of this file.
    achievementPoints: Math.max(0, int(src && src.achievementPoints, 0)),
    earned: Math.max(0, int(src && src.earned, 0)),
    // A combat Objective may name an encounter from the encounter library.
    // Kept as an id rather than a copy, so editing the encounter is enough.
    encounterId: (src && typeof src.encounterId === 'string') ? src.encounterId : null,
    // Set by hand when an Objective is finished some way the points did not
    // capture — which happens, and a tracker that argues is useless.
    done: Boolean(src && src.done),
    // GM-only. A campaign has objectives the party is not told about, and
    // the journal is published to the table — so this is stripped on the
    // server, the same way an unscanned enemy's numbers and a private word
    // are. A client-side filter would ship the secret and hide it.
    hidden: Boolean(src && src.hidden)
  };
}

/* ------------------------------ scenarios ------------------------------
   A Scenario sits inside a Mission: the conflict being played, who is in it,
   and the private sub-plots handed to individual characters. The idea is
   Inquisitor's (a game is built from a conflict, three-sided fights, and
   secret agendas); the numbers are nobody's, so it is a record, not a rules
   engine. Concept names are the book's own, listed as prompts only — read
   the scenario itself in Inquisitor (pp.166-171) before running it. */

export const SCENARIO_CONCEPTS = [
  "It's a Deal", 'Stowaway', 'Triple Jeopardy', 'The Ogragron Hulk',
  'Grox Mutilations', 'Brain Hunt', 'Payment'
];

export const CONFLICT_KINDS = ['object', 'person', 'place', 'situation'];

export function readScenario(sc) {
  const src = sc && typeof sc === 'object' ? sc : null;
  if (!src) return null;
  const sides = Array.isArray(src.sides) ? src.sides : [];
  const subplots = Array.isArray(src.subplots) ? src.subplots : [];
  return {
    concept: str(src.concept, 120),
    conflict: CONFLICT_KINDS.includes(src.conflict) ? src.conflict : 'situation',
    sides: sides.filter((x) => x && typeof x === 'object')
      .map((x) => ({ name: str(x.name, 80), note: str(x.note, 300) })).slice(0, 6),
    // GM-only. One private agenda per character: a deadline, a hidden
    // traitor, a personal target. `delivered` records that it has been sent.
    subplots: subplots.filter((x) => x && typeof x === 'object').map((x) => ({
      id: (typeof x.id === 'string' && x.id) || newId('sub'),
      charId: typeof x.charId === 'string' ? x.charId : null,
      text: str(x.text, 600),
      delivered: Boolean(x.delivered)
    })).slice(0, 40)
  };
}

export function readMission(m) {
  const src = m && typeof m === 'object' ? m : null;
  const objectives = Array.isArray(src && src.objectives) ? src.objectives : [];
  return {
    id: (src && typeof src.id === 'string' && src.id) || newId('mis'),
    name: str(src && src.name, 120),
    note: str(src && src.note, 400),
    objectives: objectives.filter((o) => o && typeof o === 'object').map(readObjective),
    // Only present when the GM has set one up, so a plain Mission is unchanged.
    ...(src && src.scenario ? { scenario: readScenario(src.scenario) } : {})
  };
}

export function readEndeavour(e) {
  const src = e && typeof e === 'object' ? e : null;
  const missions = Array.isArray(src && src.missions) ? src.missions : [];
  return {
    id: (src && typeof src.id === 'string' && src.id) || newId('end'),
    name: str(src && src.name, 120),
    note: str(src && src.note, 600),
    status: statusById(src && src.status).id,
    profitFactorReward: Math.max(0, int(src && src.profitFactorReward, 0)),
    // Finances in Arrears adds 50 Achievement Points to every Objective of
    // an Endeavour. Stored per Endeavour rather than read off the ship, so a
    // GM can apply it (or anything like it) without the ship being to hand.
    apModifier: int(src && src.apModifier, 0),
    missions: missions.filter((m) => m && typeof m === 'object').map(readMission),
    // The campaign diary: one entry per session, GM-only (redactEndeavour).
    ...(Array.isArray(src && src.diary) ? { diary: readDiary(src.diary) } : {})
  };
}

export function readDiary(list) {
  return (Array.isArray(list) ? list : [])
    .filter((x) => x && typeof x === 'object')
    .map((x) => ({
      id: (typeof x.id === 'string' && x.id) || newId('day'),
      at: Number.isFinite(Number(x.at)) ? Number(x.at) : Date.now(),
      title: str(x.title, 120),
      text: str(x.text, 4000),
      // What the GM suggested to themselves; never applied by anything here.
      xp: Math.max(0, int(x.xp, 0))
    }))
    .slice(-200);
}

export const withDiaryEntry = (end, entry) =>
  ({ ...end, diary: readDiary([...(end.diary || []), entry]) });

/* A name is stored exactly as it was typed, EMPTY INCLUDED, and the fallback
   is supplied here when something is drawn.

   These read functions run on every keystroke — an edit rebuilds the whole
   Endeavour and hands it back through readEndeavour — so a default applied
   on read does not fill a blank, it overwrites the GM mid-sentence: clearing
   the field to retype it put "Endeavour" back under the cursor. A name the
   user is halfway through deleting is a legitimate value; only the rendering
   of it needs a word to show. */
export const nameOf = (x, fallback) => {
  const n = x && typeof x.name === 'string' ? x.name.trim() : '';
  return n || fallback;
};
export const endeavourName = (e) => nameOf(e, 'Untitled endeavour');
export const missionName = (m) => nameOf(m, 'Untitled mission');
export const objectiveName = (o) => nameOf(o, 'Untitled objective');

export const readLibrary = (list) =>
  (Array.isArray(list) ? list : []).map(readEndeavour);

export const newEndeavour = (name = 'New endeavour') =>
  readEndeavour({ ...EMPTY_ENDEAVOUR, name });
export const newMission = (name = 'New mission') => readMission({ name });
export const newObjective = (kind = 'other', name = 'New objective') =>
  readObjective({ kind, name });

/* --------------------------------- progress ---------------------------------
   An Objective's target is what the GM set plus the Endeavour's modifier.
   It counts as complete when it is marked done, or when enough Achievement
   Points have been earned against a target that was actually set — a target
   of 0 means "no points on this one", and must not read as instantly done. */

export const objectiveTarget = (obj, apModifier = 0) =>
  Math.max(0, (obj.achievementPoints || 0) + (Number(apModifier) || 0));

export function objectiveComplete(obj, apModifier = 0) {
  if (obj.done) return true;
  const target = objectiveTarget(obj, apModifier);
  return target > 0 && (obj.earned || 0) >= target;
}

export function missionProgress(mission, apModifier = 0) {
  const objs = (mission && mission.objectives) || [];
  const earned = objs.reduce((n, o) => n + (o.earned || 0), 0);
  const target = objs.reduce((n, o) => n + objectiveTarget(o, apModifier), 0);
  const done = objs.filter((o) => objectiveComplete(o, apModifier)).length;
  return {
    earned, target, done, total: objs.length,
    complete: objs.length > 0 && done === objs.length,
    // Withheld rather than guessed when nothing carries points: a bar at
    // 100% on an Endeavour nobody has scored is a lie.
    fraction: target > 0 ? Math.min(1, earned / target) : null
  };
}

export function endeavourProgress(end) {
  const mod = (end && end.apModifier) || 0;
  const missions = (end && end.missions) || [];
  const parts = missions.map((m) => missionProgress(m, mod));
  const earned = parts.reduce((n, p) => n + p.earned, 0);
  const target = parts.reduce((n, p) => n + p.target, 0);
  const objectives = parts.reduce((n, p) => n + p.total, 0);
  const doneObjectives = parts.reduce((n, p) => n + p.done, 0);
  const doneMissions = parts.filter((p) => p.complete).length;
  return {
    earned, target, objectives, doneObjectives,
    missions: missions.length, doneMissions,
    complete: objectives > 0 && doneObjectives === objectives,
    fraction: target > 0 ? Math.min(1, earned / target) : null
  };
}

/* ------------------------------- publishing -------------------------------
   The journal is the GM's, and the party reads a copy of the one that is
   running. What they must not read is an objective marked hidden, so that
   is removed here rather than merely skipped when rendering — the whole
   document reaches every browser, and anything left in it is readable.

   A mission that holds nothing but hidden objectives is dropped whole: its
   name alone ("Betray the Navigator") gives the secret away. */

export function redactEndeavour(end, { isGm = false } = {}) {
  if (!end) return null;
  if (isGm) return end;
  const { diary, ...pub } = end;
  const missions = (end.missions || [])
    .map((m) => {
      const { scenario, ...rest } = m;
      // The sub-plots are secret; sides and concept are what the table plays.
      const shown = scenario ? { ...scenario, subplots: [] } : null;
      return { ...rest, ...(shown ? { scenario: shown } : {}),
        objectives: (m.objectives || []).filter((o) => !o.hidden) };
    })
    .filter((m) => (m.objectives || []).length > 0);
  return { ...pub, missions };
}

/* ---- what a list prints ---- */

export function describeEndeavour(end) {
  const p = endeavourProgress(end);
  if (!p.missions) return 'nothing planned yet';
  const bits = [`${p.doneMissions}/${p.missions} missions`];
  if (p.objectives) bits.push(`${p.doneObjectives}/${p.objectives} objectives`);
  if (p.target) bits.push(`${p.earned}/${p.target} AP`);
  return bits.join(' · ');
}

// Every encounter an Endeavour points at, so a GM can see at a glance which
// of their saved fights are actually spoken for.
export const encounterIdsIn = (end) =>
  ((end && end.missions) || [])
    .flatMap((m) => m.objectives || [])
    .map((o) => o.encounterId)
    .filter(Boolean);

// The message a sub-plot becomes when it is delivered privately to one
// player (bridge sendMessage). Returns null for a sub-plot with nowhere to go.
export const subplotMessage = (mission, subplot) =>
  subplot && subplot.charId && subplot.text
    ? { to: subplot.charId, text: `Secret objective: ${subplot.text}`,
        from: (mission && mission.scenario && mission.scenario.concept) || 'GM' }
    : null;
