/* The Inquisition’s philosophies: what an Inquisitor believes, and so what an
   Inquisitor does.

   From the Imperium Maledictum Inquisition GM’s Guide (Cubicle 7), which sets
   fourteen of them between Puritan and Radical and gives a d100 table to roll
   one. The page of each is kept so the book can be opened at it. The summaries
   are written for this app in its own words, short enough to read at the table;
   they are not the book’s text, and the book has far more on each (its
   Modus Operandi, how to roleplay one, and mission hooks).

   This is GM material: the book is for the GM’s eyes, and so is this. Nothing
   here is in the Lore tab.

   Pure: see philosophies.check.mjs. */

export const PHILOSOPHY_BOOK = 'Imperium Maledictum: Inquisition GM’s Guide';

// stance: Puritan (guards the Imperium as it is) or Radical (will use the
// forbidden, or change the Imperium, to save it).
const P = (id, name, stance, page, from, to, tenets, aim, play) => ({ id, name, stance, page, from, to, tenets, aim, play });

export const PHILOSOPHIES = [
  P('amalathian', 'Amalathian', 'Puritan', 16, 1, 7,
    ['The Emperor’s plan is unfolding as it should.', 'Keep the Imperium as it is, at any cost.', 'Strength comes from unity.'],
    'Strike down heresy inside the Imperium, Radical Inquisitors above all, and keep its factions cooperating.',
    'Holier than thou, and expert in the Imperium’s bureaucracy. Punishes anyone who tries to change its laws or institutions.'),
  P('horusian', 'Horusian', 'Radical', 17, 8, 14,
    ['The Emperor will return and need a vessel worthy of Him.', 'Warp power can make a divine avatar.', 'Daemons can be used, then banished.'],
    'Appear a model Inquisitor while researching in secret, and gather trusted acolytes to the real cause.',
    'Extremists who hide it, masters of self-control. They test their acolytes’ loyalty constantly.'),
  P('isstvanism', 'Isstvanism', 'Radical', 18, 15, 21,
    ['War is vital to the Imperium’s survival.', 'Adversity strengthens Mankind.', 'Humanity’s greatest deeds come from conflict.'],
    'Stir up war across the Imperium by working on people’s fears and prejudices until they march.',
    'Agitators who treat everyone as a piece in a game. They only act when they know their side can win.'),
  P('libricar', 'Libricar', 'Radical', 19, 22, 28,
    ['Keep the Imperium running at any cost.', 'Nobody is beyond reproach, governor or hab rat.', 'Death to the infractionist, the revolutionary and the heretic.'],
    'Find corruption in the Imperium’s ruling classes and purge it widely, because rot at the top is the worst threat.',
    'Unyielding and ruthless, and unpopular for it. Quick to reach for drastic measures such as Exterminatus.'),
  P('monodominant', 'Monodominant', 'Puritan', 20, 29, 36,
    ['Humanity should dominate the galaxy.', 'The Imperium survives only if everything opposed to it is destroyed.', 'Every impurity within it must be burned out.'],
    'Purge xenos, mutants and witches without compromise and spread the message of a dominant Humanity.',
    'Seldom secretive. They use their reputation and the fear it brings, and they turn on their own at the first suspicion.'),
  P('oblationist', 'Oblationist', 'Radical', 21, 37, 43,
    ['Taking up the enemy’s weapons is necessary to win.', 'Doing so means damnation, and that is the price.', 'Other Radicals are impure and must be purged.'],
    'Swear the Oath of Oblation and take a new name, then use daemons, forbidden knowledge and damned psykers.',
    'They look like model Inquisitors while using damned tools, and are merciless to anyone else who does the same.'),
  P('ocularian', 'Ocularian', 'Radical', 22, 44, 50,
    ['Perfect knowledge of the future is the greatest power.', 'Protect the future from those who would change fate.', 'Treat foresight as forbidden knowledge.'],
    'Collate every divination, work out the likeliest outcome, and nudge events at the critical moment.',
    'Rare and obsessed with the future, uninterested in the Inquisition’s petty present. Many look down on everyone else.'),
  P('phaenonite', 'Phaenonite', 'Radical', 23, 51, 57,
    ['Both the Imperium and the Ruinous Powers must fall.', 'The Imperium should be reborn under Phaenonite rule.', 'The future is man and machine fused by the warp.'],
    'Find technology to master the warp and its daemons, gather hereteks, and bring the Imperium down.',
    'Declared Excommunicate Traitoris, so any agent who meets one is meant to kill it. They use forbidden weapons and Chaos cultists.'),
  P('plutonian', 'Plutonian', 'Radical', 24, 58, 64,
    ['Controlled possession makes warriors resistant to daemons.', 'What possession teaches can be turned on daemonkind.', 'The Exorcists’ secrets must be kept.'],
    'Work with the Exorcists Space Marines to capture daemons and study possession and exorcism.',
    'Secretive. Other Inquisitors would execute them for it. They take a special interest in daemonhosts that hold many daemons.'),
  P('polypsykana', 'Polypsykana', 'Radical', 25, 65, 71,
    ['Mankind is destined to become a psychic species.', 'That change must be guided and protected.', 'Psykers, young ones above all, must be protected and trained.'],
    'Find psykers across the sector to protect them, and experiment with awakening and strengthening psychic power.',
    'Many are psykers themselves. They watch for Inquisitors who burn psykers they could have kept, and work at the edges of civilisation.'),
  P('recongregationism', 'Recongregationism', 'Radical', 26, 72, 78,
    ['The Imperium has stagnated and its survival is at risk.', 'It must be audited and rebuilt from the ground up.', 'Tradition and authority only hold it back.'],
    'Investigate noble houses and ruling bodies for corruption and failure, and remove the corrupt, or arm the downtrodden.',
    'They hide their real purpose, most of all from Amalathians, whose beliefs are the opposite.'),
  P('seculos-attendous', 'Seculos Attendous', 'Radical', 27, 79, 85,
    ['The Ministorum is corrupting and hampering the Imperium.', 'The Emperor does not need it to reach those who love Him.', 'The Imperial Cult must be removed from power.'],
    'Infiltrate and take apart the Ministorum from within, especially on shrine worlds and on frontier worlds it reaches.',
    'Devoted to the Emperor, which keeps them from being branded heretics. Peers think the Ministorum a lesser concern.'),
  P('thorian', 'Thorian', 'Puritan', 28, 86, 93,
    ['The Emperor’s spirit wanders the warp, showing in chosen vessels.', 'One day He will return and need an avatar.', 'Finding such a vessel hastens that day.'],
    'Look for pure vessels, or the means to make one, and follow signs of the Emperor’s divinity through the sector.',
    'Amalathians find them dangerous and other factions dislike how readily they destroy psykers they judge unworthy.'),
  P('xanthism', 'Xanthism', 'Radical', 29, 94, 100,
    ['The warp and its powers can be bent to Humanity’s will.', 'Chaos cannot be beaten, but it can be understood and tamed.', 'Use the forbidden to fight it better.'],
    'Investigate warp breaches and Chaos activity, and capture daemons and warp-touched artefacts for study.',
    'Puritans oppose their methods, which break the rule of locking such things away. Horusianism grew out of it.')
];

export const philosophyById = (id) => PHILOSOPHIES.find((p) => p.id === id) || null;

// The book’s d100 table: 01-07 Amalathian ... 94-00 Xanthism. 100 reads as 00.
export function philosophyForRoll(roll) {
  const n = Math.max(1, Math.min(100, Math.round(Number(roll) || 0)));
  return PHILOSOPHIES.find((p) => n >= p.from && n <= p.to) || null;
}

export const STANCES = ['Puritan', 'Radical'];
