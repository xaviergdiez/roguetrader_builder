/* Clues for an investigation: what the party finds when they find a sign of
   Chaos or of xenos.

   From the Imperium Maledictum Inquisition GM’s Guide (Running Inquisition
   Adventures: Signs of Chaos, Signs of Xenos), which suggests that the tell-tale
   things a cult or an alien agent leaves behind are what an investigation is
   built from. The motifs of each Chaos god, the book’s table of Marks of Chaos,
   and what each xenos species leaves behind. Written here as short lines in
   this app’s own words, with the page; the book has more of each, and the
   mechanical effects of a Mark, which are Imperium Maledictum’s, are left to it.

   A clue is only worth giving if the players can come to understand it, so
   each carries the thing to look for. GM material, not for the Lore tab.

   Pure: see clues.check.mjs. */

export const CLUES_BOOK = 'Imperium Maledictum: Inquisition GM’s Guide';

/* ------------------------------ the gods ------------------------------ */

// Each god has a sacred number cults arrange things by, and recurring motifs.
export const GODS = [
  { id: 'khorne', name: 'Khorne', page: 49, number: 8,
    domain: 'War, hatred and bloodshed. Found on battlefields, in arenas and at murders.',
    motifs: ['Skulls and severed heads, often with more sigils on them.', 'Blood sacrifice, bloodletting, blood-painted sigils.',
      'Swords and axes, shown or used.', 'Gates, shaped like the teeth of his icon.', 'Brass and black iron.'] },
  { id: 'nurgle', name: 'Nurgle', page: 49, number: 7,
    domain: 'Plague, decay and despair. Festers among the sick and the ailing.',
    motifs: ['Marks that show as symptoms of disease.', 'Three-lobed designs: bloated spheres in a lopsided triangle.', 'Flies, worms and grubs.',
      'Bile, pus and other sickly fluids.', 'Verdigrised bronze and rusting steel.'] },
  { id: 'slaanesh', name: 'Slaanesh', page: 49, number: 6,
    domain: 'Excess, desire and debasement. Found in noble courts and wherever masters and servants are unequal.',
    motifs: ['The symbol itself, or grown into living flesh: iridescent scales, a knot of veins, twisted pupils.', 'Garish colour and clashing materials, finery beside foulness.',
      'A brand as a sign of ownership.', 'Excess and vanity all around.'] },
  { id: 'tzeentch', name: 'Tzeentch', page: 49, number: 9,
    domain: 'Sorcery, trickery and mutation. Found where knowledge gathers and where people long for change.',
    motifs: ['Staring eyes, stylised, or any means of watching.', 'Barbed serpentine curves.', 'Things that keep changing: fire, chemicals, light.',
      'Numerology and cryptonumeracy.', 'Silver and liquid metals.'] },
  { id: 'undivided', name: 'Chaos Undivided', page: 48, number: 8,
    domain: 'All four at once, which is rare and very strong. Keep it for extraordinary villains.',
    motifs: ['An eight-pointed star, for Chaos’s many paths.', 'Elements of all four gods’ marks together.'] }
];
export const godById = (id) => GODS.find((g) => g.id === id) || null;

/* ------------------------------ Marks of Chaos ------------------------------ */

// What the party would notice. The book gives each a game effect too (page 50).
const M = (from, to, name, sign) => ({ from, to, name, sign });
export const MARKS_OF_CHAOS = [
  M(1, 5, 'Beak', 'The flesh around the mouth has hardened and twisted into a bird’s beak.'),
  M(6, 10, 'Bizarre Colouration', 'Patches of skin in strange colours (green, deep blue, lurid purple) in random places.'),
  M(11, 15, 'Bone Spikes', 'Spikes of bone push through the elbows and knees, and the clothing is cut to let them out.'),
  M(16, 20, 'Chaos Organ', 'A throbbing, unnatural cyst on the neck.'),
  M(21, 25, 'Cloud of Flies', 'A swarm of flies that never leaves.'),
  M(26, 30, 'Cloven Hooves', 'The feet have become hardened cloven hooves. Ordinary leg armour does not fit.'),
  M(31, 35, 'Crown of Flesh', 'A ring of fleshy growths round the head: polyps, fingers, toes, tongues or small tentacles.'),
  M(36, 40, 'Evil Eye', 'One eye glitters with malice: many-faceted, two warring pupils, or a roiling pearl-crimson.'),
  M(41, 45, 'Featureless Face', 'A smooth mask of blank skin where the face was, though they still see, smell and speak.'),
  M(46, 50, 'Pincer', 'A hand and forearm have hardened into a crab-like claw.'),
  M(51, 55, 'Prehensile Tail', 'A sinuous tail from the base of the spine, which works as an extra arm.'),
  M(56, 60, 'Radiant Skin', 'Skin that gives off a soft, diffuse, alluring glow.'),
  M(61, 65, 'Serpent’s Tongue', 'A long, sinuous, forked tongue.'),
  M(66, 70, 'Snout', 'The nose has become a gnarled, pig-like snout.'),
  M(71, 75, 'Tentacle Fingers', 'Fingers softened into pliant, writhing tentacles.'),
  M(76, 80, 'Trails of Slime', 'Slimy footprints, whatever the footwear. Anyone tracking them has it easy.'),
  M(81, 85, 'Transparent Skin', 'Patches of skin gone translucent, showing the tissue beneath.'),
  M(86, 90, 'Unnatural Appetite', 'A compulsion to eat one disgusting thing, such as spiders, flies, vermin or mould, and illness if it is denied.'),
  M(91, 95, 'Warty Skin', 'Large, hairy warts across much of the body.'),
  M(96, 100, 'Weeping Sores', 'Weeping sores, at least one somewhere obvious like the face or the back of a hand.')
];
export const MARKS_PAGE = 50;
export function markForRoll(roll) {
  const n = Math.max(1, Math.min(100, Math.round(Number(roll) || 0)));
  return MARKS_OF_CHAOS.find((m) => n >= m.from && n <= m.to) || null;
}

/* ------------------------------ signs of xenos ------------------------------ */

export const XENOS = [
  { id: 'aeldari', name: 'Aeldari', page: 51,
    signs: ['Trade goods and services offered as contacts or mercenaries, where every deal is a foothold for them.', 'A contempt for Humanity, and a sense that they are working to a plan of their own.'] },
  { id: 'drukhari', name: 'Drukhari', page: 51,
    signs: ['Collaborators who are usually unwilling, and who bear painful marks: brands, amputations.', 'Combat drugs made for Drukhari bodies that leave Humans addicted and crippled.'] },
  { id: 'votann', name: 'Leagues of Votann', page: 51,
    signs: ['“Squats” taken for harmless citizens, with technology the Imperium does not sanction.', 'Mercenary and trade contracts that also gather intelligence on Imperial assets.'] },
  { id: 'necrons', name: 'Necrons', page: 52,
    signs: ['A stiff, stilted manner in someone who is not themselves, and implanted mindshackle scarabs to prove it.', 'Hereteks drawn to their strange technology, playing with powers they do not understand.'] },
  { id: 'tau', name: 'T’au Empire', page: 52,
    signs: ['Suspiciously advanced technology in citizens’ hands: scanners, recorders, clandestine comms, pulse weapons.', 'Talk of the “greater good” and a strange open-mindedness.', 'Pheromone-based control being tried on other species.'] },
  { id: 'orks', name: 'Orks', page: 52,
    signs: ['Effigies made of scrap, with gubbins welded or bolted on.', 'Brutish glyphs painted or scratched into the original item.'] },
  { id: 'genestealer', name: 'Genestealer Cult', page: 52,
    signs: ['A coiling, insecto-serpentine glyph (the wyrm-form), hidden in tattoos or sprayed to mark territory.', 'The glyph carried in weapons, the curve sharpened into a blade.', 'Imperial icons defaced with the cult’s own, a sign the uprising is near.'] }
];
export const xenosById = (id) => XENOS.find((x) => x.id === id) || null;

/* ------------------------------ rolling ------------------------------ */

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];
const pickMany = (arr, n, rng) => {
  const pool = arr.slice(); const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
};

/* One clue, as { title, lines, page }:
     chaos  a god (given, or rolled): its sacred number and two of its motifs
     mark   a Mark of Chaos, by the book’s d100 table
     xenos  a species (given, or rolled): one or two of its signs */
export function rollClue({ kind = 'chaos', id = null, rng = Math.random } = {}) {
  if (kind === 'mark') {
    const m = markForRoll(1 + Math.floor(rng() * 100));
    return { kind, title: `Mark of Chaos: ${m.name}`, lines: [m.sign], page: MARKS_PAGE, id: m.name };
  }
  if (kind === 'xenos') {
    const x = xenosById(id) || pick(XENOS, rng);
    return { kind, title: `Signs of xenos: ${x.name}`, lines: pickMany(x.signs, Math.min(2, x.signs.length), rng), page: x.page, id: x.id };
  }
  const gods = GODS.filter((g) => g.id !== 'undivided');
  const g = godById(id) || pick(gods, rng);
  return {
    kind: 'chaos', title: `Signs of ${g.name}`, id: g.id, page: g.page,
    lines: [`Sacred number ${g.number}: cults arrange things in it, knowingly or not.`, ...pickMany(g.motifs, Math.min(2, g.motifs.length), rng)]
  };
}
