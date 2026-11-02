/* Forbidden Knowledge: what an Inquisitor’s agents learn that they were never
   meant to, and what it costs.

   From the Imperium Maledictum Inquisition GM’s Guide (Radical Methods). The
   book sorts it by the Ordo that cares and by how grave it is, and says what
   follows from having it: who comes after you, what it does to you, and what
   it is worth. Written here in this app’s own words as a table for the GM to
   read, with the page; the book has the long guidance on handing it out.

   GM material, not for the Lore tab. Pure: see forbidden.check.mjs. */

export const FORBIDDEN_BOOK = 'Imperium Maledictum: Inquisition GM’s Guide';
export const FORBIDDEN_PAGE = 78;

export const FORBIDDEN_ORDOS = [
  {
    id: 'hereticus', name: 'Ordo Hereticus',
    minor: 'Contact with known infractionists: hereteks, rogue psykers and smugglers who work with Radical agents.',
    major: 'Warp sorcery and forbidden psychic powers from outside the Imperium’s bounds.',
    negative: 'Cult knowledge, an infractionist’s tools and dealing with abhumans weaken faith in the Imperium and stain the soul much like Corruption. Using recidivist resources can get about and cost Subtlety.',
    positive: 'Knowing cults apart and how they differ gives an edge, as Superiority, when fighting them.'
  },
  {
    id: 'malleus', name: 'Ordo Malleus',
    minor: 'Identifying knowledge of daemons, Chaos and cults that would otherwise be censored.',
    major: 'How to summon and bind daemons, such as daemonhosts and daemonblades.',
    negative: 'Tomes of Chaos and warp lore bring Corruption. Daemonic activity nearby can cause Psychic Phenomena, which costs Subtlety.',
    positive: 'Knowing how to banish daemons, and what they can do, gives an edge when fighting them.'
  },
  {
    id: 'xenos', name: 'Ordo Xenos',
    minor: 'Xenos wargear: what it is, how to get it, how to use it.',
    major: 'Xenos services and how to reach them, such as xenos bounty hunters or guides through frontier space.',
    negative: 'Xenos creatures and wargear can break the mind or leave a stain much like Corruption. Word that agents consort with xenos can spread and cost Subtlety.',
    positive: 'Knowing their tactics, weapons and capabilities gives an edge when fighting them.'
  }
];

// What happens to anyone, whichever Ordo, who is known to hold it.
export const FORBIDDEN_SOCIETAL = [
  'Imperial authorities (the Arbites, Ministorum investigators, in the end other Inquisitors) come to wipe the knowledge out and cleanse everyone who has it, the characters included.',
  'The characters’ enemies take notice: they want the knowledge, or want to tempt the holders away, as daemons who will bargain and Aeldari who will manipulate.'
];

export const ordoKnowledge = (id) => FORBIDDEN_ORDOS.find((o) => o.id === id) || null;
export const SEVERITIES = ['minor', 'major'];
