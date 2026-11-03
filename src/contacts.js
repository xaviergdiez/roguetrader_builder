/* An agent's contacts: the people who get things done without going through
   the front door.

   From the Imperium Maledictum Inquisition GM's Guide (Inquisition Contacts),
   in this app's own words. A contact carries their own Influence with the
   character, and whatever the character's standing is with the contact's
   Faction counts with it, for better and worse: a preacher who likes you at
   +2, of a Ministorum that holds you at -1, deals with you at +1. The GM keeps
   both; the player learns them by looking into the contact.

   Cell Handler (elite.js) is the advance that makes a roster a standing one,
   but anyone may keep one. Pure: see contacts.check.mjs. */

// What a contact can do for you.
export const PROVIDES = [
  { id: 'access', name: 'Access', text: 'Into restricted places, often without anyone watching.' },
  { id: 'equipment', name: 'Equipment', text: 'Restricted gear, sooner than a requisition would bring it.' },
  { id: 'information', name: 'Information', text: 'Specialist or forbidden knowledge, and what is moving inside their Faction.' },
  { id: 'protection', name: 'Protection', text: 'Shelter in their Faction’s places, or its people watching your back.' },
  { id: 'services', name: 'Services', text: 'Their Faction’s services, sooner or more quietly: medicae, guides, hirelings, transport.' }
];

// Finding one in the field, with this app's skills for the book's.
export const FINDING = 'Inquiry, Scrutiny, Logic or Common Lore (Adeptus Terra), at a difficulty the GM sets: '
  + 'easier where your standing with their Faction is good, harder where the cell is exposed and people '
  + 'would rather not be seen with it. Between missions, downtime spent cultivating a network will do.';

// What raises a contact's Influence, and what wears it down.
export const PROVEN = [
  'Protecting them from enemies inside their own Faction.',
  'Protecting them from enemies outside it, the rest of the Inquisition included.',
  'Doing what they personally ask of you.',
  'Using your Influence with others on their behalf.',
  'Raising their station, at work or in life.'
];
export const TOO_MUCH = [
  'Asking them to risk their standing in their own Faction.',
  'Asking them to break the law.',
  'Asking more than their Influence with you will bear.',
  'Putting them in danger.',
  'Lying to them, or being suspected of hiding something.',
  'Letting them learn, or guess, who you really serve.',
  'Blackmail: it holds their Influence where it is until they find a way out, rather than wearing it down.'
];
export const NEGLECT = 'A contact you never visit cools: meet them now and then even with nothing to ask. '
  + 'One who feels betrayed goes to ground, runs to their Faction’s leaders, or turns on you.';

export const INFLUENCE_MIN = -5;
export const INFLUENCE_MAX = 5;
const clampInf = (v) => Math.max(INFLUENCE_MIN, Math.min(INFLUENCE_MAX, Math.round(Number(v) || 0)));
const str = (v, max) => String(v == null ? '' : v).slice(0, max);
const newId = () => `con-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const MAX_CONTACTS = 30;

export function readContact(v) {
  const src = v && typeof v === 'object' ? v : {};
  const ids = PROVIDES.map((p) => p.id);
  return {
    id: (typeof src.id === 'string' && src.id) || newId(),
    name: str(src.name, 80),
    faction: str(src.faction, 80),
    provides: [...new Set((Array.isArray(src.provides) ? src.provides : []).filter((p) => ids.includes(p)))],
    // Their own feeling for you, and your standing with their Faction.
    influence: clampInf(src.influence),
    standing: clampInf(src.standing),
    // Spent on something they should not have known (Cell Handler), or lost.
    burned: Boolean(src.burned),
    note: str(src.note, 400)
  };
}

export const readContacts = (list) =>
  (Array.isArray(list) ? list : []).filter((x) => x && typeof x === 'object').map(readContact).slice(0, MAX_CONTACTS);

// What the contact will actually do for you: theirs and their Faction's together.
export const effectiveInfluence = (c) => clampInf((c && c.influence) + (c && c.standing));

export const newContact = (name = '') => readContact({ name });
