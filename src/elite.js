// Named Elite Advances: off-table upgrades the GM grants for XP.
//
// The Elite Advance dialog has always taken free text, because the whole
// point of one is that it is NOT on a career table — a GM invents it at the
// table. What free text cannot hold is a requirement: "Executioner, if you
// are a Bladedancer" has nowhere to live when the only fields are a name, a
// type and a number.
//
// So this is a short catalogue of the ones worth offering by name, each
// carrying what it costs and what it asks of the character. It is a
// shortcut, never a gate: meetsRequirement() reports, and the dialog shows
// what it reports, but the GM may still grant any of these to anyone. Elite
// Advances are the one place the rank ladder deliberately does not apply —
// see addEliteAdvance in the app — and a requirement printed here must not
// quietly become a lock.

export const ELITE_ADVANCES = [
  {
    id: 'executioner',
    name: 'Executioner',
    type: 'Trait',
    cost: 500,
    // The CRPG enters this at level 15 from the Warrior, Operative or
    // Bladedancer lines. Of those only the Bladedancer exists here; Warrior
    // is rendered as the Arch-Militant, which is this app's career for
    // someone who fights for a living.
    careers: ['Bladedancer', 'Arch-Militant'],
    minRank: 4,
    requires: 'Bladedancer or Arch-Militant, Rank IV',
    effect: 'Scourging Strikes: a living target you wound in melee keeps bleeding, '
      + 'taking 1 damage at the start of each of its turns, stacking to a maximum of '
      + 'your Perception Bonus + Strength Bonus. It stops on a successful Challenging '
      + '(+0) Toughness Test at the end of its turn, or on any First Aid.',
    note: 'A Tier II archetype from the Rogue Trader CRPG, converted. The GM sets the '
      + 'cost and may grant it to anyone — the requirement is advice, not a lock.'
  },

  /* ---- Tier I and II archetype conversions ----
     Written against Action Dice, tiles and a touch table rather than this
     app's d100, metres and Fate Points. Kept as supplied: they are the
     table's own homebrew and the effect text is theirs to word. Only the
     career lists were changed, because a career this app does not have can
     never be matched and the entry would read as permanently out of reach —
     see the check. */

  {
    id: 'grand-strategist-combat-zones',
    name: 'Grand Strategist: Combat Zones',
    type: 'Talent',
    cost: 500,
    careers: ['Seneschal', 'Explorator', 'Rogue Trader'],
    minRank: 3,
    requires: 'Seneschal, Explorator, or Rogue Trader, Rank III, Scholastic Lore (Tactica Imperialis)',
    effect: 'At the start of combat, define up to three 3x3 tile sectors on the digital tabletop '
      + 'as designated Combat Zones: Frontline (+2 Damage to allies inside), Backline (+10 Dodge and Cover bonus), '
      + 'or Rear (+10 Ballistic Skill and +2 Range to shots originating here). Zones remain active for the encounter.',
    note: 'Converted from the Grand Strategist archetype (Rogue Trader CRPG). '
      + 'Players can designate and drag their zone grids directly onto the touch table or assign them via '
      + 'the companion app before the first round initiates.'
  },
  {
    id: 'master-tactician-press-the-advantage',
    name: 'Master Tactician: Press the Advantage',
    type: 'Talent',
    cost: 500,
    careers: ['Rogue Trader', 'Missionary', 'Seneschal'],
    minRank: 3,
    requires: 'Rogue Trader, Missionary, or Seneschal, Rank III, Command +10',
    effect: 'Whenever an ally within sight kills a hostile or spends a Destiny Die, you accumulate 1 stack of '
      + 'Tactical Advantage (up to a max equal to your Fellowship Bonus). Spend an Action Die (3+) to consume all stacks, '
      + 'granting your next attack or an ally\u2019s attack +2 bonus damage per stack consumed.',
    note: 'Converted from the Master Tactician archetype (Rogue Trader CRPG). '
      + 'Tactical Advantage stacks are displayed digitally around your mini\u2019s base aura on the screen.'
  },
  {
    id: 'vanguard-unyielding-beacon',
    name: 'Vanguard: Unyielding Beacon',
    type: 'Trait',
    cost: 500,
    careers: ['Arch-Militant', 'Missionary'],
    minRank: 3,
    requires: 'Arch-Militant or Missionary, Rank III, Toughness 40+',
    effect: 'You project a 3-tile threat aura on the board. Hostile AI prioritizing targets must engage you if in range. '
      + 'Whenever an enemy hits you, gain temporary Wounds equal to your Toughness Bonus (these absorb damage first and '
      + 'expire at the end of the combat round).',
    note: 'Converted from the Vanguard archetype (Rogue Trader CRPG). '
      + 'The digital table renders a pulsing taunt boundary under your physical miniature.'
  },
  {
    id: 'bounty-hunter-claim-bounty',
    name: 'Bounty Hunter: Claim Bounty',
    type: 'Talent',
    cost: 500,
    careers: ['Arch-Militant', 'Void-Master'],
    minRank: 3,
    requires: 'Arch-Militant or Void-Master, Rank III, Inquiry or Survival',
    effect: 'At the start of combat, select up to 3 hostiles as your "Prey" via the touch screen. '
      + 'You gain +10 Ballistic Skill/Weapon Skill and +2 Penetration against marked targets. '
      + 'When a marked Prey target is eliminated, immediately recover 1 spent Action Die (value of 4).',
    note: 'Converted from the Bounty Hunter archetype (Rogue Trader CRPG). '
      + 'Prey targets are visibly highlighted with digital reticles beneath their bases on the screen.'
  },
  {
    id: 'assassin-killing-edge',
    name: 'Assassin: Killing Edge',
    type: 'Talent',
    cost: 500,
    careers: ['Eldar Corsair', 'Seneschal', 'Arch-Militant'],
    minRank: 3,
    requires: 'Eldar Corsair, Seneschal, or Arch-Militant, Rank III, Agility 45+',
    effect: 'Whenever you attack a target from its flank or rear relative to its facing vector arrow, '
      + 'your attack gains +20 Critical Hit chance and inflicts bonus damage equal to your (Agility Bonus + Perception Bonus). '
      + 'You may move through hostile-occupied squares without provoking free attacks.',
    note: 'Converted from the Assassin archetype (Rogue Trader CRPG). '
      + 'Flanking openings appear as illuminated arcs projected onto the digital tabletop behind enemy miniatures.'
  },
  {
    id: 'operative-exploit-analysis',
    name: 'Operative: Exploit Analysis',
    type: 'Trait',
    cost: 500,
    // 'Sanctioned Psyker' is not a career here; the Astropath Transcendent
    // is this app's sanctioned psyker, and was already on the list.
    careers: ['Explorator', 'Seneschal', 'Astropath Transcendent'],
    minRank: 2,
    requires: 'Explorator, Seneschal, or Psyker, Rank II, Logic or Scrutiny',
    effect: 'At the start of each round, all hostiles within your Line of Sight gain 1 digital "Exploit" marker. '
      + 'Spend an Action Die (2+) to trigger "Expose Weakness", consuming all Exploits on a target to reduce its '
      + 'Armor Points by 1 and Dodge by -10% per Exploit marker until the end of the round.',
    note: 'Converted from the Operative archetype (Rogue Trader CRPG). '
      + 'Exploit counters render as small pips directly under the hostile miniatures on the display surface.'
  },
  {
    id: 'officer-bring-it-down',
    name: 'Officer: Bring It Down!',
    type: 'Talent',
    cost: 500,
    careers: ['Rogue Trader', 'Missionary'],
    minRank: 2,
    requires: 'Rogue Trader or Missionary, Rank II, Fellowship 40+',
    effect: 'Spend a 3+ Action Die to command an ally within 6 tiles to act immediately out of turn order. '
      + 'The ally receives an immediate bonus turn with 2 Action Dice and 0 movement points. '
      + 'This ability can only be used on an ally once per combat round.',
    note: 'Converted from the Officer archetype (Rogue Trader CRPG). '
      + 'Pushes a priority alert directly to the target player\u2019s companion app prompting their extra action.'
  },
  {
    id: 'soldier-run-and-gun',
    name: 'Soldier: Run and Gun',
    type: 'Talent',
    cost: 500,
    careers: ['Arch-Militant', 'Void-Master'],
    minRank: 2,
    requires: 'Arch-Militant or Void-Master, Rank II, Ballistic Skill 40+',
    effect: 'Spend a 2+ Action Die to enter a sprint state: gain +3 tiles of tactical movement and '
      + 'make an extra ranged attack this turn, ignoring standard single-attack limitations. '
      + 'You cannot use basic interactions or terminals in the same turn this ability is activated.',
    note: 'Converted from the Soldier archetype (Rogue Trader CRPG). '
      + 'Expands the highlighted movement grid on the digital tabletop to show the extended sprint radius.'
  },
  {
    id: 'exemplar-apex-resolve',
    name: 'Exemplar: Apex Resolve',
    type: 'Talent',
    cost: 500,
    // Open to everyone, as its own requirement says. The supplied list named
    // eleven careers, two of which this app does not have and five of which
    // it does but they were left off — an empty list is what "Any Career"
    // actually means, and it cannot go stale as careers are added.
    careers: [],
    minRank: 5,
    requires: 'Any Career, Rank V',
    effect: 'Whenever you spend or burn a Fate Point, roll a D10; on a 7+, the Fate Point is not depleted. '
      + 'Additionally, your character rolls 5 Action Dice instead of 4 at the start of every combat round permanently.',
    note: 'Converted from the Tier III Exemplar archetype (Rogue Trader CRPG). '
      + 'Represents pinnacle mastery of both tactical combat and Dynasty leadership across the Koronus Expanse.'
  },

  /* ---- the Inquisition, after Dark Heresy ----
     The Inquisitor's Handbook models this as an ALTERNATE CAREER RANK: not a
     career you start in, but a detour taken mid-career with the GM's leave —
     "you won't swap Career Paths, but rather your character's fate simply
     takes an unusual detour along the way" (p. 53). That is this app's Elite
     Advance almost word for word, which is why the Inquisition arrives here
     rather than as a fourteenth career.

     Legate Investigator is the book's own entry, Rank 4+, open to the Adept,
     Arbitrator, Cleric, Guardsman and Psyker — rendered here as the
     Seneschal, Arch-Militant, Missionary and Astropath. The Explorator is
     left off deliberately: the Tech-Priest is the one career the book bars
     from this path, having the Magos road instead.

     The two rungs above it are Ascension's, where a Legate who does well is
     "popularly viewed as a sign that the recipient may be headed for an
     Inquisitorial rosette themselves one day" — so they stand on each other
     rather than being three unrelated purchases. */

  {
    id: 'ciphers-of-the-ordos',
    name: 'Ciphers (Inquisition)',
    type: 'Skill',
    cost: 200,
    careers: ['Seneschal', 'Missionary', 'Arch-Militant', 'Astropath Transcendent'],
    minRank: 2,
    requires: 'Seneschal, Missionary, Arch-Militant or Astropath, Rank II',
    effect: 'You read and write the coded tongues the Ordos use among themselves — '
      + 'Augustinian\u2019s phrases and pictograms, Cryptos Cognos and the rest. A sentence '
      + 'in one of them means nothing to anyone outside the Inquisition and its agents.',
    note: 'An advance on the Legate Investigator\u2019s own list (Inquisitor\u2019s Handbook). '
      + 'The cheapest way to start looking like somebody\u2019s Acolyte.'
  },
  {
    id: 'talented-interrogation',
    name: 'Talented (Interrogation)',
    type: 'Talent',
    cost: 200,
    careers: ['Seneschal', 'Missionary', 'Arch-Militant', 'Astropath Transcendent'],
    minRank: 3,
    requires: 'Rank III, and the Interrogation skill',
    effect: '+10 to all Interrogation Tests. Where the subject is already broken, frightened '
      + 'or in your custody, the GM may rule that no test is needed at all.',
    note: 'An advance on the Legate Investigator\u2019s own list (Inquisitor\u2019s Handbook).'
  },
  {
    id: 'legate-investigator',
    name: 'Legate Investigator',
    type: 'Trait',
    cost: 300,
    careers: ['Seneschal', 'Missionary', 'Arch-Militant', 'Astropath Transcendent'],
    minRank: 4,
    requires: 'Seneschal, Missionary, Arch-Militant or Astropath, Rank IV',
    effect: 'Bearing the Sigil of Question: you carry a carta of inquiry naming one locale and '
      + 'one focus of concern, and a silver chalice sigil bearing the mark of the Inquisition, '
      + 'code-keyed for verification. Within that remit you hold the absolute right to question '
      + 'and examine whoever you wish, and command authority over local law enforcement, '
      + 'detention and requisition. The authority ends formally when the enquiry does.',
    note: 'An Alternate Career Rank from the Inquisitor\u2019s Handbook, Rank 4+. The Ordos '
      + 'Calixis call them cult breakers, hounds, and brothers of question. Misuse of the office '
      + 'carries censure and harsh punishment \u2014 the GM should hold you to the remit.'
  },
  {
    id: 'interrogator',
    name: 'Interrogator',
    type: 'Trait',
    cost: 500,
    careers: ['Seneschal', 'Missionary', 'Arch-Militant', 'Astropath Transcendent'],
    minRank: 6,
    prereqElite: 'Legate Investigator',
    requires: 'Rank VI, and Legate Investigator before it',
    effect: 'An apprentice Inquisitor, no longer merely seconded authority: you speak with your '
      + 'master\u2019s voice outside any single enquiry, may field a cell of Acolytes of your own, '
      + 'and may requisition from Inquisitorial stores without petitioning a higher power. '
      + 'Your master remains answerable for what you do with it.',
    note: 'Ascension\u2019s stepping stone. A Legate who does well is held to be headed for a '
      + 'rosette; some reach it quickly, and some never do.'
  },
  {
    id: 'inquisitorial-rosette',
    name: 'Inquisitorial Rosette',
    type: 'Trait',
    cost: 1000,
    // Open to any career by the time anyone gets here: the rosette is granted
    // for what a character has done, not for the path they began on.
    careers: [],
    minRank: 8,
    prereqElite: 'Interrogator',
    requires: 'Rank VIII, and Interrogator before it',
    effect: 'The rosette is yours. You answer to no authority in the Imperium save the Ordos '
      + 'themselves, may commandeer any Imperial asset including a voidship and its crew, and '
      + 'your word alone is sufficient warrant to detain, question or execute. Few live long '
      + 'enough to use it well.',
    note: 'The end of the road the Legature starts. Granting this changes a campaign\u2019s '
      + 'shape \u2014 an Inquisitor outranks the dynasty they sail with.'
  },

  /* ---- campaign conversions, generalised ----
     These arrived written around named characters, a named ship and its
     named bridge officers. Folded in as career advances instead: a talent
     keyed to one person is a GM note, not something a builder can offer the
     next character who takes that career. The mechanics are untouched; only
     the names are gone. */

  {
    id: 'kasrkin-fire-discipline',
    name: 'Kasrkin Fire Discipline',
    type: 'Talent',
    cost: 500,
    careers: ['Arch-Militant'],
    minRank: 2,
    requires: 'Arch-Militant, Rank II, Ballistic Skill 40+',
    effect: 'When firing in Semi-Auto or Full-Auto burst mode at targets within 6 tiles, '
      + 'every Degree of Success scores an extra hit (up to weapon maximum), and your shots '
      + 'ignore the penalty for firing into melee combat without risking friendly fire.',
    note: 'Drilled into storm troopers of the Kasrkin pattern. Armsmen led in person by a '
      + 'character with this talent fight at +10 to their combat characteristics.'
  },
  {
    id: 'hymns-of-the-empty-vial',
    name: 'Hymns of the Empty Vial',
    type: 'Talent',
    cost: 500,
    careers: ['Missionary'],
    minRank: 2,
    requires: 'Missionary, Rank II, Pure Faith',
    effect: 'Spend a 3+ Action Die as a Free Action to sing the holy hymns of your fallen sisters. '
      + 'For 2 rounds, all allies within hearing range ignore the effects of Fatigue, Pinning, and Fear. '
      + 'Daemons and warp-entities within 4 tiles suffer a -10 penalty to all tests and treat the area as difficult terrain.',
    note: 'Sung by those who carry the ashes of an order that did not survive them. While the hymn '
      + 'is active, the companion app plays ambient liturgical chants through connected player devices.'
  },
  {
    id: 'curious-servo-skull-network',
    name: 'Curious Servo-Skull Network',
    type: 'Trait',
    cost: 500,
    careers: ['Explorator'],
    minRank: 2,
    requires: 'Explorator, Rank II, Tech-Use',
    effect: 'Your unique Servo-Skull gains an independent digital base marker on the tabletop display. '
      + 'It can move up to 4 tiles per round through air vents and over cover. It can perform Tech-Use, '
      + 'Security, and Search checks using your characteristics without exposing your miniature to line of sight.',
    note: 'An enigmatic construct of unknown provenance. Interfacing with foreign xenos technology '
      + 'through the Servo-Skull eliminates the risk of feedback shock to the Magos.'
  },
  {
    id: 'privateers-opportunism',
    name: 'Privateer\u2019s Opportunism',
    type: 'Talent',
    cost: 500,
    careers: ['Void-Master'],
    minRank: 2,
    requires: 'Void-Master, Rank II, Agility 40+',
    effect: 'Whenever an enemy is killed or a container is breached on your tile, you can spend a 1+ Action Die '
      + 'to immediately loot the target as a Free Action and gain +2 tiles of free tactical movement. '
      + 'You suffer no penalty when dual-wielding pistols or compact boarding weapons.',
    note: 'Driven by the pursuit of glorious booty. Crates looted through this talent quietly credit '
      + 'bonus Cold Trade currency to the character\u2019s companion app ledger.'
  },
  {
    id: 'dynasty-mandate',
    name: 'Dynasty Mandate',
    type: 'Talent',
    cost: 500,
    careers: ['Rogue Trader'],
    minRank: 2,
    requires: 'Rogue Trader, Rank II, Command +10',
    effect: 'Spend a 4+ Action Die to issue a Dynasty Command to your voidship. You can trigger any one '
      + 'Bridge Officer ability without spending the standard Destiny Die requirement. '
      + 'Usable once per encounter.',
    note: 'The authority of a warrant held rather than merely inherited. Unlocks priority bridge '
      + 'communication channels on the mobile companion app.'
  },
  {
    id: 'hive-fleet-survivor-prescience',
    name: 'Hive Fleet Survivor Prescience',
    type: 'Trait',
    cost: 500,
    // 'Sanctioned Psyker' is not a career here; the Astropath Transcendent is
    // this app's sanctioned psyker and was already on the list.
    careers: ['Astropath Transcendent', 'Eldar Corsair'],
    minRank: 2,
    requires: 'Psyker, Rank II, Perception 40+',
    effect: 'Honed by surviving a Tyranid invasion. You cannot be Surprised by ambushes. '
      + 'Whenever an enemy declares an attack against you, you may spend an Action Die (2+) to make an immediate '
      + 'Evasion roll with a +10 bonus before the attack roll is made; on success, the enemy loses their attack.',
    note: 'The companion app warns the player of incoming wave reinforcements 1 round before '
      + 'they appear on the physical table monitor.'
  }
];

export const eliteById = (id) => ELITE_ADVANCES.find((e) => e.id === id) || null;

// Does this character match what the entry asks for? Reported so the dialog
// can mark it, never used to disable the button.
export function meetsRequirement(entry, { careerName = '', rank = 0, owned = [] } = {}) {
  if (!entry) return false;
  const careerOk = !entry.careers || entry.careers.length === 0
    || entry.careers.includes(careerName);
  const rankOk = !entry.minRank || (Number(rank) || 0) >= entry.minRank;
  // A ladder: an entry may stand on another. Matched by NAME because that is
  // what a bought advance stores — {name, type, cost} and nothing else.
  const belowOk = !entry.prereqElite || (owned || []).includes(entry.prereqElite);
  return Boolean(careerOk && rankOk && belowOk);
}

// Everything, each tagged with whether this character matches it, with the
// ones that fit first. The list is never filtered: a GM looking for
// something to grant should see the whole catalogue. Sorting is how that
// stays usable as the catalogue grows — hiding is not.
export const elitePresets = (who) => ELITE_ADVANCES
  .map((e, i) => ({ ...e, met: meetsRequirement(e, who), i }))
  // stable: equal-met entries keep catalogue order
  .sort((a, b) => (b.met - a.met) || (a.i - b.i))
  .map(({ i, ...e }) => e);
