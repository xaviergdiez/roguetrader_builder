/* A playable character's place in the Inquisition: whose agent they are, what
   enquiry they hold, what they carry to prove it, and, if they come so far,
   their own rosette and creed.

   The rank itself is elsewhere: the Legate Investigator is an alternate career
   rank (advances.js) and the rungs above it are Elite Advances (elite.js).
   This is what those leave nowhere to write down.

   What the player sees of their master is what the player has been TOLD. The
   GM's Guide is firm that a patron's philosophy is a mystery peeled back over
   many missions, so the master's own creed is never read off the patron data
   here: `learned` is what the player records once the GM has let it slip. The
   patron's whole sheet is the GM's, in the Endeavour journal.

   Pure: see legature.check.mjs. */

import { ORDOS } from './inquisition.js';
import { philosophyById } from './philosophies.js';
import { patronById } from './patrons.js';
import { readRosette, emblemById } from './rosettes.js';
import { readContacts } from './contacts.js';
import { FORBIDDEN_ORDOS, SEVERITIES } from './forbidden.js';
import { ELITE_ADVANCES } from './elite.js';

export const LEGATE = 'Legate Investigator';

const str = (v, max) => String(v == null ? '' : v).slice(0, max);
const ordoOk = (id) => ORDOS.some((o) => o.id === id);

export function readLegature(v) {
  const src = v && typeof v === 'object' ? v : {};
  const forbidden = (Array.isArray(src.forbidden) ? src.forbidden : [])
    .filter((x) => x && FORBIDDEN_ORDOS.some((o) => o.id === x.ordo) && SEVERITIES.includes(x.severity))
    .map((x) => ({ ordo: x.ordo, severity: x.severity }));
  return {
    ordo: ordoOk(src.ordo) ? src.ordo : '',
    // One of the GM's Guide's Inquisitors, or a name of the table's own.
    master: patronById(src.master) ? src.master : '',
    masterName: str(src.masterName, 80),
    // What the player has been told of their master's philosophy ('' unknown).
    learned: philosophyById(src.learned) ? src.learned : '',
    // The carta of inquiry: one place, one concern.
    locale: str(src.locale, 120),
    focus: str(src.focus, 200),
    emblem: emblemById(src.emblem) ? src.emblem : '',
    rosette: readRosette(src.rosette),
    // The character's own creed, declared with the rosette.
    philosophy: philosophyById(src.philosophy) ? src.philosophy : '',
    // Each held once: the same Ordo's knowledge at both weights is two entries.
    forbidden: forbidden.filter((x, i) => forbidden.findIndex((y) => y.ordo === x.ordo && y.severity === x.severity) === i),
    contacts: readContacts(src.contacts)
  };
}

export const EMPTY_LEGATURE = readLegature({});

// The master's name, from the book's six or the table's own.
export const masterName = (l) => {
  const p = l && patronById(l.master);
  return p ? `Inquisitor ${p.name}` : str(l && l.masterName, 80).trim();
};

// Whether the panel has anything to say: the character is on the path, or holds
// something from it. `held` is every name they hold (elite.js heldNames).
const INQUISITION_NAMES = new Set([LEGATE, ...ELITE_ADVANCES.filter((e) => e.inquisition).map((e) => e.name)]);
export const onTheInquisitionPath = (held) => (held || []).some((n) => INQUISITION_NAMES.has(n));

// Which parts of the panel apply, by what is held.
export function legatureParts(held) {
  const has = (n) => (held || []).includes(n);
  return {
    legate: has(LEGATE),
    interrogator: has('Interrogator'),
    rosette: has('Inquisitorial Rosette'),
    handler: has('Cell Handler'),
    forbidden: has('Forbidden Knowledge')
  };
}
