/* ============================ EQUIPMENT ============================
   Gear is stored as one prose string per career. It parses reliably because
   the grammar is consistent: sentences, then "; " groups, then ", " items,
   with " or " marking a choice between them.
   Stats are summarised from the 2009 core rulebook and are a table aid, not
   the rulebook — check the book before a ruling. Items with no stats line
   simply have no combat profile. */

export const CRAFT = {
  poor: 'Poor craftsmanship — less accurate in the hand, or thinner protection than the mark suggests.',
  common: 'Common craftsmanship — the standard article, no modifier.',
  good: 'Good craftsmanship — noticeably better made; a weapon of this quality is easier to hit with.',
  best: 'Best craftsmanship — a masterwork. More accurate and harder hitting, or better protection at less weight.'
};

import { AUGMETIC_GEAR } from './augmetics.js';

export const GEAR = {
  // Bionics and power armour, so an implant on a sheet shows its specs like
  // any other item. Their grade rides in the craftsmanship prefix that
  // gearInfo already strips, so "Good Bionic Arm" resolves here unaided.
  ...AUGMETIC_GEAR,

  /* ---- pistols ---- */
  'laspistol': { avail: 'Common', kind: 'Pistol', stats: '30m · S/–/– · 1d10+2 E · Pen 0 · Clip 30 · Reliable', desc: 'The Imperium’s workhorse sidearm. Weak, but it almost never jams and a charge pack lasts.' },
  'hand cannon': { avail: 'Average', kind: 'Pistol', stats: '35m · S/–/– · 1d10+4 I · Pen 2 · Clip 5', desc: 'A heavy solid-slug pistol. Hits hard, holds little, and is slow to reload.' },
  'plasma pistol': { avail: 'Very Rare', kind: 'Pistol', stats: '30m · S/2/– · 1d10+6 E · Pen 6 · Clip 10 · Overheats, Recharge', desc: 'Bottled starfire. Devastating and quietly willing to maim the person holding it.' },
  'bolt pistol': { avail: 'Rare', kind: 'Pistol', stats: '30m · S/2/– · 1d10+5 X · Pen 4 · Clip 8 · Tearing', desc: 'Fires self-propelled mass-reactive shells that detonate inside the target.' },
  'hellpistol': { avail: 'Very Rare', kind: 'Pistol', stats: '35m · S/2/– · 1d10+4 E · Pen 7 · Clip 40', desc: 'A militarised laspistol running at lethal charge. Punches through armour a laspistol would scorch.' },
  'inferno pistol': { avail: 'Very Rare', kind: 'Pistol', stats: '10m · S/–/– · 2d10+4 E · Pen 13 · Clip 3', desc: 'A melta sidearm. Almost no range, and almost nothing survives being inside it.' },
  'stub automatic': { avail: 'Plentiful', kind: 'Pistol', stats: '30m · S/3/– · 1d10+3 I · Pen 0 · Clip 9', desc: 'Cheap, ubiquitous, and utterly unremarkable — which is often the point.' },

  /* ---- basic weapons ---- */
  'lasgun': { avail: 'Common', kind: 'Basic', stats: '100m · S/3/– · 1d10+3 E · Pen 0 · Clip 60 · Reliable', desc: 'The rifle that holds the Imperium together. Unglamorous and nearly unbreakable.' },
  'boltgun': { avail: 'Very Rare', kind: 'Basic', stats: '90m · S/2/4 · 1d10+5 X · Pen 4 · Clip 24 · Tearing', desc: 'A holy weapon and a heavy one. Rare enough that carrying it says something about you.' },
  'hellgun': { avail: 'Very Rare', kind: 'Basic', stats: '110m · S/3/– · 1d10+4 E · Pen 7 · Clip 40', desc: 'Storm trooper issue — a lasgun rebuilt for penetration, fed by a backpack cell.' },
  'hunting rifle': { avail: 'Average', kind: 'Basic', stats: '200m · S/–/– · 1d10+3 I · Pen 0 · Clip 5', desc: 'A long-barrelled solid-slug rifle. Reaches far further than anything else at this price.' },
  'flamer': { avail: 'Rare', kind: 'Basic', stats: '20m · S/–/– · 1d10+4 E · Pen 2 · Clip 2 · Flame', desc: 'Ignites everything in a cone. Feared out of proportion to its damage, and rightly so.' },

  /* ---- melee ---- */
  'mono-sword': { avail: 'Average', kind: 'Melee', stats: '1d10+2 R · Pen 2 · Balanced', desc: 'A blade with a monomolecular edge — the standard duelling sword of the void-borne.' },
  'power sword': { avail: 'Very Rare', kind: 'Melee', stats: '1d10+5 E · Pen 5 · Balanced, Power Field', desc: 'A disruption field sheathes the blade, parting armour like cloth. A mark of real status.' },
  'power axe': { avail: 'Very Rare', kind: 'Melee', stats: '1d10+7 E · Pen 7 · Unbalanced, Power Field', desc: 'All of the power sword’s ferocity, none of its finesse. Heavy and hard to recover.' },
  'chainsword': { avail: 'Rare', kind: 'Melee', stats: '1d10+2 R · Pen 2 · Balanced, Tearing', desc: 'Motorised teeth on a sword blade. As much a terror weapon as a practical one.' },
  'force sword': { avail: 'Very Rare', kind: 'Melee', stats: '1d10+3 E · Pen 3 · Balanced, Force', desc: 'A psycrystalline blade that a psyker can charge with their own Willpower, turning a hit into a blast of raw warp energy.' },
  'force staff': { avail: 'Very Rare', kind: 'Melee', stats: '1d10+3 I · Pen 0 · Balanced, Force', desc: 'A psy-focus and a weapon in one shaft — the traditional arm of an Astropath or sanctioned psyker.' },
  'shock staff': { avail: 'Rare', kind: 'Melee', stats: '1d10+3 I · Pen 0 · Shocking', desc: 'A staff that delivers a stunning discharge — favoured where a corpse is the wrong outcome.' },
  'metal staff': { avail: 'Plentiful', kind: 'Melee', stats: '1d10+2 I · Pen 0 · Primitive', desc: 'A plain metal staff. A badge of office that also works as a club.' },
  'staff': { avail: 'Abundant', kind: 'Melee', stats: '1d10 I · Pen 0 · Primitive, Balanced', desc: 'A length of wood or metal. Ubiquitous, unremarkable, always to hand.' },
  'primitive melee weapon': { avail: 'Abundant', kind: 'Melee', stats: 'Primitive', desc: 'A blade or club of pre-industrial make. A mono upgrade puts a monomolecular edge on it, which lifts it out of the Primitive bracket.' },

  /* ---- eldar weapons ---- */
  'shuriken pistol': { avail: 'Extremely Rare', kind: 'Pistol', stats: '30m · S/3/5 · 1d10+3 R · Pen 4 · Clip 35 · Razor Sharp', desc: 'Fires monofilament discs at lethal velocity. Punches through armour with ease and shreds anything it passes through.' },
  'shuriken catapult': { avail: 'Extremely Rare', kind: 'Basic', stats: '60m · S/3/10 · 1d10+3 R · Pen 4 · Clip 100 · Razor Sharp', desc: 'The standard Aeldari long-arm. Storms the target with a blizzard of razor-edged monofilament discs.' },
  'eldar power sword': { avail: 'Near Unique', kind: 'Melee', stats: '1d10+5 E · Pen 6 · Balanced, Power Field', desc: 'An Aeldari disruption blade of exquisite craftsmanship. Cuts through armour as easily as a standard power sword, but lighter and perfectly balanced.' },
  'aeldari mesh armour': { avail: 'Near Unique', kind: 'Armour', stats: 'AP 3 · all · negligible weight', desc: 'Woven from psycho-reactive Eldar mesh. Absorbs and disperses kinetic and energy impacts almost without encumbrance.' },
  'waystone': { avail: 'Unique', desc: 'A spirit stone attuned to its bearer. Upon death the wearer\'s soul is drawn into the stone rather than cast into the warp to be consumed by Slaanesh.' },
  'waystone (spirit stone)': { avail: 'Unique', desc: 'A spirit stone attuned to its bearer. Upon death the wearer\'s soul is drawn into the stone rather than cast into the warp to be consumed by Slaanesh.' },
  'eldar jump pack': { avail: 'Near Unique', desc: 'A grav-propulsion harness of Eldar design. Lighter and more manoeuvrable than Imperial equivalents; allows short bursts of flight and extended leaping.' },

  /* ---- armour ---- */
  'guard flak armour': { avail: 'Common', kind: 'Armour', stats: 'AP 4 · body, arms, legs', desc: 'Layered ablative plate over bodyglove. What most of the Imperium’s soldiery dies in.' },
  'guard flak': { avail: 'Common', kind: 'Armour', stats: 'AP 4 · body, arms, legs', desc: 'Layered ablative plate over bodyglove. What most of the Imperium’s soldiery dies in.' },
  'enforcer light carapace': { avail: 'Scarce', kind: 'Armour', stats: 'AP 5 · body, arms, legs', desc: 'Rigid moulded plate. Markedly better than flak, and markedly more restrictive.' },
  'storm trooper carapace': { avail: 'Rare', kind: 'Armour', stats: 'AP 6 · body, arms, legs', desc: 'Full military carapace. Heavy, obvious, and very hard to shoot through.' },
  'xeno-mesh armour': { avail: 'Very Rare', kind: 'Armour', stats: 'AP 4 · body, arms, legs', desc: 'Alien-woven mesh. Light, quiet, and quietly illegal to be seen wearing.' },
  'synskin': { avail: 'Very Rare', kind: 'Armour', stats: 'AP 3 · all · aids concealment', desc: 'A skin-tight bodysuit that dulls heat and sound as well as blades.' },

  /* ---- kit ---- */
  'micro-bead': { avail: 'Common', desc: 'Short-range earpiece vox. The default way a landing party stays in contact.' },
  'void suit': { avail: 'Common', desc: 'Sealed pressure suit with its own air. The difference between a hull breach and a funeral.' },
  're-breather': { avail: 'Average', desc: 'Filters and recycles air against smoke, fumes and thin atmosphere.' },
  'medikit': { avail: 'Average', desc: 'Field surgery kit. Required to get the most out of the Medicae skill.' },
  'injector': { avail: 'Common', desc: 'Delivers a dose fast, through armour if it must be.' },
  'combi-tool': { avail: 'Average', desc: 'A folding cluster of every tool a tech-adept regularly needs.' },
  'dataslate': { avail: 'Common', desc: 'Portable slate for reading, writing and storing records.' },
  'autoquill': { avail: 'Average', desc: 'Copies dictation or duplicates a document in a neat scribe’s hand.' },
  'multikey': { avail: 'Rare', desc: 'Defeats common Imperial mechanical and electronic locks. Its legality depends entirely on who is asking.' },
  'chrono': { avail: 'Common', desc: 'A timepiece. Unremarkable until the moment it is not.' },
  'pict-recorder': { avail: 'Average', desc: 'Captures images and moving pict. Evidence, or leverage.' },
  'vox-caster': { avail: 'Average', desc: 'Long-range backpack vox — reaches orbit, unlike a micro-bead.' },
  'manacles': { avail: 'Plentiful', desc: 'Restraints for a prisoner you intend to deliver alive.' },
  'psy-focus': { avail: 'Scarce', desc: 'An object that steadies a psyker’s concentration when channelling.' },
  'sacred unguent': { avail: 'Scarce', desc: 'Blessed oils for anointing machines. The rite matters as much as the lubricant.' },
  'cameleoline cloak': { avail: 'Rare', desc: 'Shifts colour to match its surroundings, greatly aiding concealment when still.' },
  'xeno-pelt cloak': { avail: 'Very Rare', desc: 'The hide of something that was not human. Worn to be noticed.' },
  'fine clothing': { avail: 'Average', desc: 'Cut and cloth that opens doors in polite society.' },
  'ecclesiarchal robe': { avail: 'Average', desc: 'Vestments of the Imperial Creed, and the authority that comes with them.' },
  'robe': { avail: 'Plentiful', desc: 'Plain robes. Anonymous, which is frequently the point.' },
  'aquila pendant': { avail: 'Plentiful', desc: 'The two-headed eagle worn at the throat. A statement of faith.' },
  'censer': { avail: 'Average', desc: 'Swings burning incense through a rite — and masks other smells.' },
  'charm': { avail: 'Plentiful', desc: 'A luck token. Whether it works is between you and the Emperor.' },
  'bolt shell keepsake': { avail: 'Scarce', desc: 'A single spent bolt shell, kept. Someone survived what it was fired at.' },
  'blessed ship token': { avail: 'Average', desc: 'A sanctified fragment of a voidship, carried against the warp.' },
  'navy uniform': { avail: 'Average', desc: 'Imperial Navy dress. Rank made visible, with all that follows.' },
  'silk headscarf': { avail: 'Average', desc: 'Fine silk, worn in the Nobilite manner.' },
  'nobilite signet': { avail: 'Near Unique', desc: 'A house seal. Proof of bloodline, and a target for those who resent it.' },
  'nobilite warp eye obscura': { avail: 'Near Unique', desc: 'A finely crafted warded blindfold concealing the Navigator\u2019s third eye. +10 to Willpower Tests to suppress involuntary warp-sight.' },
  'empyrean astrolabe': { avail: 'Extremely Rare', desc: 'An ancient Nobilite instrument for reading warp currents. +10 to Navigation (Warp) Tests when used to divine the tides.' },
  'nobilite force staff': { avail: 'Near Unique', kind: 'Melee', stats: '1d10+2 I \u00B7 Pen 0 \u00B7 Balanced, Special', desc: 'A bonded Navigator\u2019s staff, tuned to the warp-eye. Treats the wielder as having the Melee Weapon Training (Primitive) Talent.' },
  'void-suit of the nobilite': { avail: 'Very Rare', kind: 'Armour', stats: 'AP 3 \u00B7 all', desc: 'Sealed void armour crafted to Nobilite standards, incorporating warp-shielding around the third eye and micro-bead vox.' },
  'charting chrono': { avail: 'Very Rare', desc: 'A precision timepiece calibrated for warp travel. Allows accurate dead-reckoning; +5 to Navigation (Stellar) Tests during translation phases.' },
  'emperor’s tarot deck': { avail: 'Scarce', desc: 'Cards read for guidance. The Imperium takes their readings seriously.' },
  'servo-skull familiar': { avail: 'Very Rare', desc: 'A hovering, machine-spirited skull that follows you and carries out simple tasks.' },

  /* ---- ork weapons & kit ---- */
  'choppa': { avail: 'Very Rare', kind: 'Melee', stats: '1d10+2 R · Pen 0 · Primitive, Tearing', desc: 'A crude Ork cleaver of heavy iron. More meat-clever than sword, and exactly as subtle as it looks.' },
  'slugga': { avail: 'Very Rare', kind: 'Pistol', stats: '20m · S/3/– · 1d10+4 I · Pen 0 · Clip 18 · Inaccurate, Unreliable', desc: 'A chunky Ork sidearm. Fires enthusiastically in roughly the right direction.' },
  'shoota': { avail: 'Very Rare', kind: 'Basic', stats: '60m · S/3/– · 1d10+3 I · Pen 0 · Clip 30 · Inaccurate, Unreliable', desc: 'An Ork automatic rifle cobbled from scavenged parts. Loud, unreliable, and deeply satisfying to fire.' },
  'stikkbomb': { avail: 'Very Rare', kind: 'Thrown', stats: 'SB×3 · S/–/– · 2d10 X · Pen 0 · Blast (3)', desc: 'A crude grenade packed with scrap metal and low-grade explosive. Orks throw them the way humans throw insults.' },
  'stikkbombs': { avail: 'Very Rare', kind: 'Thrown', stats: 'SB×3 · S/–/– · 2d10 X · Pen 0 · Blast (3)', desc: 'Crude grenades packed with scrap metal and explosive. Always thrown in quantity.' },
  'heavy leather armour': { avail: 'Plentiful', kind: 'Armour', stats: 'AP 3 · body, legs', desc: 'Thick hides stitched together with wire and faith. Not pretty, but it stops a blade and nobody complains.' },
  'squig-hide armour': { avail: 'Extremely Rare', kind: 'Armour', stats: 'AP 3 · body, legs', desc: 'Cured hide from a squig. Tough, pungent, and entirely characteristic of its wearer.' },
  'shiny gubbinz': { avail: 'Extremely Rare', desc: 'A collection of trophies, shiny trinkets and scavenged machine parts. Meaningless to others; priceless to an Ork.' },

  /* ---- kroot gear ---- */
  'kroot rifle': { avail: 'Extremely Rare', kind: 'Basic', stats: '80m · S/2/– · 1d10+3 R · Pen 2 · Clip 8 · Primitive', desc: 'A long-barrelled rifle grown and shaped from kroot biotechnology, fitted with a mono-edged blade for close combat.' },
  'kroot leather armour': { avail: 'Extremely Rare', kind: 'Armour', stats: 'AP 2 · body, arms, legs', desc: 'Trophies and hide sewn into a functional harness. Light, flexible, and decorated with the bones of the fallen.' },
  'meat hook': { avail: 'Plentiful', desc: 'A curved blade on a length of cord or chain. Used to drag prey, scale rough surfaces or threaten a captive.' },

  /* ---- drukhari gear ---- */
  'kabalite armour': { avail: 'Near Unique', kind: 'Armour', stats: 'AP 4 · all', desc: 'Living polymer mesh bonded to shards of hardened dark matter. Light as silk and harder than ceramite.' },
  'splinter rifle': { avail: 'Extremely Rare', kind: 'Basic', stats: '80m · S/3/5 · 1d10+3 R · Pen 4 · Clip 40 · Toxic (2)', desc: 'Fires crystallised toxin shards refined in Commorragh. Each sliver carries a paralytic or lethal compound.' },
  'splinter pistol': { avail: 'Extremely Rare', kind: 'Pistol', stats: '30m · S/3/– · 1d10+3 R · Pen 4 · Clip 35 · Toxic (2)', desc: 'The standard Drukhari sidearm. Compact, elegant, and laced with suffering in every shard.' },
  'agoniser': { avail: 'Near Unique', kind: 'Melee', stats: '1d10+3 E · Pen 0 · Flexible, Shocking', desc: 'A whip or blade wreathed in tortured energies. Every contact sends agony through the target, ignoring armour.' },
  'combat drug injector': { avail: 'Very Rare', desc: 'A wrist-mounted reservoir of Drukhari combat stimulants administered mid-fight to enhance speed, strength or pain tolerance.' },
  'dark silk void robes': { avail: 'Extremely Rare', desc: 'Woven from material predating the Fall. Provides modest vacuum protection and some resistance to warp radiation.' },

  /* ---- t'au gear ---- */
  /* ---- the T'au (Tau Character Guide, pp.26-43) ----
     Weapons, armour and equipment as the guide prints them. The guide has no
     Reload column here, so the reload times are not carried; everything else is. */
  'tau combat armour': { avail: 'Near Unique', kind: 'Armour', stats: 'AP 6 · all', desc: 'The Fire caste’s body armour: impact-resistant synthetic plates over a loose durable bodysuit, built like carapace. Its helmet sensors take upgrades such as a blacksun filter or target lock, and its vision slots are set up to see markerlights.' },
  'tau recon armour': { avail: 'Near Unique', kind: 'Armour', stats: 'AP 4 · all · +10 to Concealment and Silent Move', desc: 'A lighter combat armour, popular with Pathfinder teams: less protection for more mobility, with a full sensor suite and a micro-bead in the helmet. +10 to Concealment and Silent Move Tests.' },
  'tau recon combat armour': { avail: 'Near Unique', kind: 'Armour', stats: 'AP 6 · all', desc: 'An older name on saved sheets for the Fire Warrior’s combat armour (AP 6). The guide names two: Tau combat armour (AP 6) and Tau recon armour (AP 4).' },
  'pulse rifle': { avail: 'Very Rare', kind: 'Basic', stats: '150m · S/2/4 · 2d10+3 E · Pen 4 · Clip 36 · Gyro-Stabilised', desc: 'The standard arm of the Fire caste: a plasma pulse flung down an induction field, with a gyro-stabilised sight that keeps it accurate at long range.' },
  'pulse carbine': { avail: 'Very Rare', kind: 'Basic', stats: '60m · S/–/3 · 2d10+2 E · Pen 4 · Clip 24 · Gyro-Stabilised', desc: 'A shorter pulse weapon with a grenade launcher slung under the barrel, which works as a Mezoa grenade launcher (core rulebook, p.125).' },
  'pulse pistol': { avail: 'Very Rare', kind: 'Pistol', stats: '40m · S/2/– · 2d10+2 E · Pen 4 · Clip 16 · Gyro-Stabilised', desc: 'A compact pulse weapon, carried by officers and as a Fire Warrior’s sidearm.' },
  'longshot pulse rifle': { avail: 'Near Unique', kind: 'Basic', stats: '200m · S/2/– · 2d10+3 E · Pen 4 · Clip 12 · Accurate, Tearing', desc: 'A sniper pulse rifle, directed by markerlights, which has become a feared presence in the Eastern Rim wars. Also the long gun of a sniper drone.' },
  'ion rifle': { avail: 'Near Unique', kind: 'Basic', stats: '110m · S/2/4 · 2d10+5 E · Pen 5 · Clip 24 · Overcharge (6)', desc: 'An experimental man-portable ion weapon carried by Pathfinder teams as a sniper rifle. Its safeties can be switched off for a far stronger shot, at the risk of the wielder.' },
  'kroot hunting rifle': { avail: 'Extremely Rare', kind: 'Basic', stats: '150m · S/–/– · 1d10+5 E · Pen 3 · Clip 8 · Accurate', desc: 'A Kroot rifle modified by their T’au allies for range and a far quieter report, used to kill key enemy personnel before an assault.' },
  'rail rifle': { avail: 'Near Unique', kind: 'Basic', stats: '150m · S/–/– · 3d10+2 I · Pen 12 · Clip 12 · Felling, Proven (2)', desc: 'A linear accelerator that hurls a slug at huge speed. A sniper weapon of Pathfinders and sniper drones, able to kill an Ogryn or a Tyranid Warrior in a single shot.' },
  'tau photon grenade': { avail: 'Rare', kind: 'Thrown', stats: 'SB×3 · S/–/– · Blast (12)', desc: 'A defensive grenade that blinds the attackers it is thrown among. Anyone in the blast makes a Challenging Toughness Test or is Blinded for a Round, and a Round more per Degree of Failure.' },
  'bonding knife': { avail: 'Extremely Rare', kind: 'Melee', stats: '1d5 R · Pen 0 · Primitive', desc: "A ritual blade carried by bonded Fire Caste warriors. Worn as a mark of honour and used only in extremis." },
  'markerlight': { avail: 'Extremely Rare', desc: 'A target designator, the keystone of T’au firepower. As a Full Action, a Routine Ballistic Skill Test marks a target until the user’s next Turn, and anyone shooting the Marked target counts as having taken a Full Action Aim.' },
  'blacksun filter': { avail: 'Very Rare', desc: 'Sensor lenses that boost ambient light for limited night vision and shut out dazzle. Gives the Dark Sight Trait and immunity to photon flash grenades, T’au photon grenades and the like.' },
  'drone controller': { avail: 'Very Rare', desc: 'A control unit that lets one warrior direct drones within 50 m. It takes a Challenging Tech-Use Test and two Full Actions to calibrate; drones then act right after the user’s Turn, and once a Round he may take personal control of one with a Routine Tech-Use Test, so it fires with his Ballistic Skill.' },
  'gravity wave projector': { avail: 'Near Unique', desc: 'A defensive device that sends a burst of gravitons through a 90-degree arc out to 20 m. Targets make a Hard Strength Test or lose 1d5 from their Agility Bonus for movement, and go Prone on three or more Degrees of Failure.' },
  'kroot sniper rounds': { avail: 'Extremely Rare', desc: 'Specialist sniper ammunition for Kroot rifles: a rifle loaded with them fires single shots for 1d10+7 E with Pen 5, a clip of 1, and the Accurate Quality.' },
  'pulse accelerator': { avail: 'Near Unique', desc: 'An attachment for a pulse carbine, pistol or rifle that raises its range by half.' },
  'positional relay': { avail: 'Near Unique', desc: 'A bulky tight-burst radio that works as a long-range vox out to 10 km. Subverting it or listening in with a vox thief is −30.' },
  'target lock': { avail: 'Extremely Rare', desc: 'A firing-plan tracker that lets the user keep the benefit of an Aim Action when he takes a Reaction.' },
  'translator unit': { avail: 'Rare', desc: 'A device that renders T’au speech into Low Gothic and back. (The guide issues it to every Fire Warrior but gives it no availability; Rare is this app’s.)' },
  'gun drone': { avail: 'Rare', desc: 'A T’au combat drone: Wounds 12, Armour 4, Toughness Bonus 4, Hoverer (6), with twin-linked pulse carbines (60m, S/–/3, 2d10+2 E, Pen 4) or a longshot pulse rifle. Out of 50 m of a controller it can only take a Half Action a Turn and cannot make Reactions. Its availability is the app’s; the guide gives none.' },
  'markerlight drone': { avail: 'Rare', desc: 'A drone carrying a markerlight instead of a gun, with a gun drone’s profile. Its availability is the app’s; the guide gives none.' },
  'shield drone': { avail: 'Rare', desc: 'A drone carrying a shield generator instead of a gun, with a gun drone’s profile, to follow and protect its handler. Its availability is the app’s; the guide gives none.' },
  'xv25 stealth battlesuit': { avail: 'Near Unique', kind: 'Armour', stats: 'AP 8 · all · Hard Points 2 · Size Hulking · Strength 45', desc: 'The lightest, nimblest battlesuit, for infiltration and flank strikes. Its stealth field generator removes the Size penalty to Concealment and scores two extra Degrees of Success on Concealment, Dodge, Shadowing and Stealth Tests. Recommended: burst cannon or fusion blaster, target lock. Worn as armour; Strength and Size become the suit’s while it is worn.' },
  'xv8 crisis battlesuit': { avail: 'Near Unique', kind: 'Armour', stats: 'AP 10 · all · Hard Points 3 · Size Enormous · Strength 55', desc: 'The iconic mass-production battlesuit of the Fire caste. Recommended: fusion blaster, plasma rifle or burst cannon; burst cannon or flamer; target lock or vectored retro-thrusters. Worn as armour; Strength and Size become the suit’s while it is worn.' },
  'xv9 hazard battlesuit': { avail: 'Near Unique', kind: 'Armour', stats: 'AP 14 · all · Hard Points 4 · Size Enormous · Strength 65', desc: 'A close-support suit that blasts foes apart and dazzles them with knee-mounted photon casters (a Routine Ballistic Skill Test as a Half Action or Reaction sets off a photon grenade centred on itself). Recommended: two fusion cascades, twin-linked burst cannons or phased ion guns, vectored retro-thrusters, a drone controller or target lock. Worn as armour; Strength and Size become the suit’s while it is worn.' },
  'xv8-05 enforcer crisis battlesuit': { avail: 'Unique', kind: 'Armour', stats: 'AP 11 · all · Hard Points 4 · Size Enormous · Strength 60', desc: 'A larger XV8 favoured by Commanders. Recommended: fusion blaster, plasma rifle or cyclic ion blaster; burst cannon or flamer; target lock; a shield generator or vectored retro-thrusters. Worn as armour; Strength and Size become the suit’s while it is worn.' },
  'xv8-02 iridium crisis battlesuit': { avail: 'Unique', kind: 'Armour', stats: 'AP 15 · all · Hard Points 3 · Size Enormous · Strength 55', desc: 'An XV8 shielded with a prototype iridium alloy for unmatched protection, given to valuable leaders. Recommended: twin-linked fusion blaster or plasma rifle; burst cannon or flamer; shield generator or stimulant injectors. Worn as armour; Strength and Size become the suit’s while it is worn.' },
  'xv88 broadside battlesuit': { avail: 'Near Unique', kind: 'Armour', stats: 'AP 15 · all · Hard Points 3 · Size Enormous · Strength 65', desc: 'A heavy suit built for massive weapons, sacrificing speed for firepower and durability. It has no jet pack. Recommended: twin-linked heavy rail rifle or high-yield missile pod; twin-linked smart missile system or plasma rifle; target lock or velocity tracker. Worn as armour; Strength and Size become the suit’s while it is worn.' },
  'xv104 riptide': { avail: 'Unique', kind: 'Armour', stats: 'AP 14 · all · Hard Points 3 · Size Massive · Strength 80', desc: 'The largest battlesuit in use, powered by an experimental nova reactor. Once a Round, as a Half Action or Reaction, the pilot may overload it with a Difficult Tech-Use Test for a force field, a storm or overcharged weapon, or more flight, and takes damage if he fails. Recommended: heavy burst cannon or ion accelerator; twin-linked smart missile system, plasma rifle or fusion blaster; a shield generator. Worn as armour; Strength and Size become the suit’s while it is worn.' },
  // Battlesuit weapons systems (Tau Character Guide, table 1-7). Only a battlesuit mounts them.
  'airbursting fragmentation projector': { avail: 'Near Unique', kind: 'Heavy', stats: '60m · S/–/– · 2d10 X · Pen 3 · Clip 12 · Blast (4)', desc: 'Launches an airburst fragmentation round. Attacks ignore all Armour Points of the target’s cover.' },
  'burst cannon': { avail: 'Very Rare', kind: 'Basic', stats: '60m · –/3/6 · 2d10+3 E · Pen 4 · Clip 40', desc: 'A multi-barrel plasma pulse weapon with a very high rate of fire, usually carried by Stealth suits.' },
  'heavy burst cannon': { avail: 'Very Rare', kind: 'Heavy', stats: '80m · –/6/12 · 2d10+7 E · Pen 6 · Clip 120 · Tearing', desc: 'An oversized burst cannon that cannot be mounted on anything smaller than a Riptide.' },
  'cyclic ion blaster': { avail: 'Near Unique', kind: 'Heavy', stats: '50m · S/3/6 · 2d10+5 E · Pen 6 · Clip 100 · Overcharge (4)', desc: 'A four-barrel ion weapon with a stable rate of fire and uneven performance against armour.' },
  'phased ion gun': { avail: 'Near Unique', kind: 'Heavy', stats: '40m · S/4/8 · 1d10+9 E · Pen 4 · Clip 150 · Overcharge (6)', desc: 'A battlesuit-sized ion weapon, usually underslung from an XV9’s arms.' },
  'ion accelerator': { avail: 'Near Unique', kind: 'Heavy', stats: '200m · S/3/6 · 3d10+5 E · Pen 10 · Clip 90 · Overcharge (8)', desc: 'A massive ion weapon that melts its targets. Only a Riptide can carry it.' },
  'fusion blaster': { avail: 'Very Rare', kind: 'Basic', stats: '20m · S/–/– · 2d10+8 E · Pen 12 · Clip 8', desc: 'A short-ranged anti-armour melta weapon.' },
  'fusion cascade': { avail: 'Near Unique', kind: 'Heavy', stats: '16m · –/3/6 · 1d10+12 E · Pen 12 · Clip 16', desc: 'A rapid-firing fusion weapon for close support.' },
  'fusion blade': { avail: 'Unique', kind: 'Melee', stats: '2d10+8 E · Pen 12 · Unstable', desc: 'A melta blade.' },
  'high yield missile pod': { avail: 'Near Unique', kind: 'Heavy', stats: '200m · S/–/6 · 3d10+3 X · Pen 6 · Clip 72 · Blast (3)', desc: 'Shatters heavier armoured vehicles and tears aircraft from the sky.' },
  'missile pod': { avail: 'Extremely Rare', kind: 'Heavy', stats: '200m · S/–/3 · 2d10+4 X · Pen 6 · Clip 36 · Blast (2)', desc: 'For engaging light vehicles.' },
  'plasma rifle': { avail: 'Extremely Rare', kind: 'Heavy', stats: '90m · S/2/4 · 2d10+4 E · Pen 10 · Clip 16', desc: 'A T’au plasma weapon: safer than the Imperial kind, and a little weaker. Only ever mounted on battlesuits.' },
  'heavy rail rifle': { avail: 'Near Unique', kind: 'Heavy', stats: '300m · S/–/– · 4d10+8 I · Pen 12 · Clip 12 · Felling, Proven (3), Tearing', desc: 'The Broadside’s main gun.' },
  'onager gauntlet': { avail: 'Unique', kind: 'Melee', stats: '3d10+10 E · Pen 10 · Power Field, Unwieldy, Shocking', desc: 'A battlesuit gauntlet, one of twelve made.' },
  'smart missile system': { avail: 'Very Rare', kind: 'Heavy', stats: '150m · S/–/6 · 2d10+4 X · Pen 4 · Clip 48 · Blast (2)', desc: 'Self-guiding missiles. Against a target whose location he knows, the firer needs no line of sight and tests Intelligence instead of Ballistic Skill.' },

  /* ---- low-tech & Inquisitorial gear (Dark Heresy) ----
     Priced in the same Throne-price source Rogue Trader's own catalogue is
     summarised from, but no Throne figure is carried here: this app keeps no
     wallet on the sheet, so only the Availability rating that feeds the
     Acquisition test in acquisition.js survives the conversion — see its own
     "PROFIT FACTOR IS THE CURRENCY" note for why. */
  'flintlock pistol': { avail: 'Plentiful', kind: 'Pistol', stats: '15m · S/–/– · 1d10+2 I · Pen 0 · Clip 1 · Inaccurate, Primitive, Unreliable', desc: 'A muzzle-loading antique, one shot and a slow reload. Carried where a modern weapon would draw the wrong attention.' },
  'stub revolver': { avail: 'Plentiful', kind: 'Pistol', stats: '30m · S/–/– · 1d10+3 I · Pen 0 · Clip 6 · Reliable', desc: 'A break-action solid-slug revolver. Unglamorous, and almost impossible to make jam.' },
  'autopistol': { avail: 'Average', kind: 'Pistol', stats: '30m · S/–/6 · 1d10+2 I · Pen 0 · Clip 18', desc: 'A compact automatic sidearm, standard issue where a lasgun would be too conspicuous to carry.' },
  'hand flamer': { avail: 'Rare', kind: 'Pistol', stats: '10m · S/–/– · 1d10+4 E · Pen 2 · Clip 2 · Flame', desc: 'A stub-nosed promethium sidearm. Close, brutal, and entirely indiscriminate about what catches fire.' },
  'autogun': { avail: 'Average', kind: 'Basic', stats: '90m · S/3/10 · 1d10+3 I · Pen 0 · Clip 30', desc: 'A solid-slug automatic rifle. Cheaper and louder than a lasgun, and just as common in a hive militia armoury.' },
  'shotgun': { avail: 'Common', kind: 'Basic', stats: '30m · S/–/– · 1d10+4 I · Pen 0 · Clip 8 · Scatter', desc: 'A pump-action close-range weapon. Forgiving of a bad shot, unforgiving of anything it actually hits.' },
  'long las': { avail: 'Scarce', kind: 'Basic', stats: '150m · S/–/– · 1d10+4 E · Pen 1 · Clip 40 · Accurate, Reliable', desc: 'A lasgun rebuilt for range and a long optical sight. The Guard’s answer to a sniper’s rifle.' },
  'plasma gun': { avail: 'Very Rare', kind: 'Basic', stats: '90m · S/2/– · 1d10+6 E · Pen 6 · Clip 40 · Overheats', desc: 'Bottled starfire scaled up to a two-handed weapon. Devastating, and always one bad roll from venting into the wielder’s hands.' },
  'meltagun': { avail: 'Very Rare', kind: 'Basic', stats: '20m · S/–/– · 2d10+4 E · Pen 12', desc: 'A short-ranged thermal weapon that reduces its target to vapour and slag. Nothing survives being caught inside its cone.' },
  'heavy stubber': { avail: 'Rare', kind: 'Heavy', stats: '120m · –/–/10 · 1d10+4 I · Pen 3 · Clip 75', desc: 'A belt-fed automatic weapon, crew-served or tripod-mounted. Volume of fire over precision, every time.' },
  'heavy bolter': { avail: 'Very Rare', kind: 'Heavy', stats: '120m · –/–/6 · 1d10+8 X · Pen 5 · Clip 60 · Tearing', desc: 'A tripod-mounted bolter scaled up to squad-suppression fire. Each round is a small explosive shell in its own right.' },
  'heavy flamer': { avail: 'Very Rare', kind: 'Heavy', stats: '30m · S/–/– · 2d10+4 E · Pen 4 · Clip 10 · Flame', desc: 'A squad-support flamer with a backpack promethium tank. Washes a corridor end to end in one pull.' },
  'plasma cannon': { avail: 'Extremely Rare', kind: 'Heavy', stats: '150m · S/–/– · 2d10+10 E · Pen 10 · Clip 6 · Blast (1), Overheats, Recharge', desc: 'A crew-served plasma weapon. Takes a long moment to cycle between shots, and erases what it is aimed at.' },
  'multi-melta': { avail: 'Extremely Rare', kind: 'Heavy', stats: '60m · S/–/– · 4d10+6 E · Pen 12 · Clip 10 · Blast (1)', desc: 'A multi-barrelled thermal weapon built to open armour. Bulkheads, tanks and anything behind them.' },
  'lascannon': { avail: 'Extremely Rare', kind: 'Heavy', stats: '300m · S/–/– · 5d10+10 E · Pen 10 · Clip 5 · Recharge', desc: 'The Imperium’s standard anti-armour las weapon. One shot, a long recharge, and very little left to shoot at.' },
  'knife': { avail: 'Plentiful', kind: 'Melee', stats: '1d5 R · Pen 0 · Primitive', desc: 'A plain blade. Concealable, deniable, and always within reach.' },
  'sword': { avail: 'Common', kind: 'Melee', stats: '1d8+1 R · Pen 0 · Primitive, Balanced', desc: 'An honest steel blade, no monomolecular edge or power field to speak of.' },
  'great weapon': { avail: 'Average', kind: 'Melee', stats: '2d10 R · Pen 0 · Primitive, Unwieldy', desc: 'An oversized two-handed blade or axe. Slow to bring to bear, and devastating when it lands.' },
  'chainaxe': { avail: 'Scarce', kind: 'Melee', stats: '1d10+4 R · Pen 2 · Tearing', desc: 'A motorised axe blade, heavier and crueller than its sword cousin.' },
  'power fist': { avail: 'Extremely Rare', kind: 'Melee', stats: '2d10 E · Pen 8 · Power Field, Unwieldy', desc: 'A disruption field wrapped around a hydraulic gauntlet. Slow, and capable of crushing a bulkhead.' },
  'thunder hammer': { avail: 'Extremely Rare', kind: 'Melee', stats: '2d10+4 E · Pen 10 · Power Field, Shocking, Unwieldy', desc: 'A war-hammer sheathed in disruptive energies, heavy enough to level a wall and leave the target convulsing.' },
  'shock maul': { avail: 'Scarce', kind: 'Melee', stats: '1d10 I · Pen 0 · Shocking', desc: 'An Arbites baton wired for a stunning discharge. Meant to subdue, not to kill.' },
  'eviscerator': { avail: 'Very Rare', kind: 'Melee', stats: '2d10+2 R · Pen 5 · Tearing, Unbalanced, Unwieldy', desc: 'A two-handed chain weapon the length of a man, carried by zealots who expect to end the fight in one swing.' },
  'shock whip': { avail: 'Scarce', kind: 'Melee', stats: '1d10 I · Pen 0 · Flexible, Shocking', desc: 'A braided lash threaded with discharge filaments. A slaver’s tool, and a duellist’s affectation.' },
  'heavy leathers': { avail: 'Plentiful', kind: 'Armour', stats: 'AP 1 · arms, body, legs', desc: 'Thick, cured hide. Barely armour at all, but better than the clothes underneath.' },
  'grox-hide vest': { avail: 'Common', kind: 'Armour', stats: 'AP 2 · body', desc: 'A stiff hide vest, tanned from void-grazing grox. Cheap, durable, and smells like it.' },
  'flak helmet': { avail: 'Average', kind: 'Armour', stats: 'AP 2 · head', desc: 'A basic ablative helmet, usually the first piece of a flak kit anyone actually wears.' },
  'flak cloak': { avail: 'Rare', kind: 'Armour', stats: 'AP 3 · arms, body, legs', desc: 'A hooded flak cloak, worn loose enough to pass for civilian dress at a glance.' },
  'flak vest': { avail: 'Average', kind: 'Armour', stats: 'AP 3 · body', desc: 'A sleeveless flak jacket over the torso alone — mobility over full coverage.' },
  'mesh vest': { avail: 'Rare', kind: 'Armour', stats: 'AP 4 · body', desc: 'Fine metal mesh worn under clothing. Protective and, worn right, entirely invisible.' },
  'carapace chestplate': { avail: 'Rare', kind: 'Armour', stats: 'AP 6 · body', desc: 'A single rigid carapace plate over the torso, without the rest of a full suit’s weight or expense.' },
  'power armour': { avail: 'Extremely Rare', kind: 'Armour', stats: 'AP 8 · all', desc: 'Powered ceramite plate, sealed and servo-assisted. Rarely issued, and never without a reason.' },
  /* ---- force fields ----
     A field is not armour and is deliberately not given an AP line: it never
     reduces damage, it either stops a hit outright or it does not. When the
     wearer is hit, roll d100 against the Protection Rating — on or under, the
     hit is negated entirely, armour and Toughness untouched; a roll inside the
     Overload band burns the generator out until it is repaired.
     ponytail: display-only. The combat engine subtracts armour and knows
     nothing about fields, so the GM rolls the save. Wire it in when someone
     actually fields one often enough to resent the dice. */
  'refractor field': { avail: 'Rare', kind: 'Field', stats: 'Protection Rating 30 · Overload 01–05', desc: 'A shimmering distortion that bends incoming fire aside. The cheapest field worth owning, and the most commonly faked.' },
  'displacer field': { avail: 'Very Rare', kind: 'Field', stats: 'Protection Rating 30 · Overload 01–10 · displaces 1d10 m', desc: 'Rather than stopping the blow, it moves the wearer — a short, nauseating jump to somewhere the blow is not. Where you land is not up to you.' },
  'conversion field': { avail: 'Very Rare', kind: 'Field', stats: 'Protection Rating 40 · Overload 01–15 · blinds nearby', desc: 'Converts the energy of a hit into a blinding flash. Protects its wearer admirably and ruins the night vision of everyone beside them.' },
  'kustom force field': { avail: 'Near Unique', kind: 'Field', stats: 'Protection Rating 45 · aura, 5 m · Overload 01–20', desc: 'A Mek’s bodged field projector that covers everything near it. Nobody, the Mek included, knows precisely why it works.' },

  /* ---- xenos arms the bestiary already fields ----
     The creature entries carry their own damage lines, which include the
     wielder's Strength Bonus and psychic ratings; these are the base profiles
     for a GM arming anyone else with them. */
  'witchblade': { avail: 'Near Unique', kind: 'Melee', stats: '1d10+4 E · Pen 6 · Balanced, Force', desc: 'An Eldar rune-blade carried by Warlocks and Farseers. Its edge is sharpened by the wielder’s own mind.' },
  'singing spear': { avail: 'Near Unique', kind: 'Melee', stats: '1d10+5 R · Pen 6 · Balanced, Force, Thrown (SB×3)', desc: 'A psychically attuned spear that keens as it flies and returns to the hand that cast it.' },
  'shard carbine': { avail: 'Extremely Rare', kind: 'Basic', stats: '60m · S/3/6 · 1d10+2 R · Pen 3 · Clip 40 · Toxic (2)', desc: 'A compact Drukhari splinter weapon. Shorter-ranged than the rifle, and no less unpleasant to be hit by.' },
  'rad axe': { avail: 'Extremely Rare', kind: 'Melee', stats: '1d10+5 E · Pen 7 · Power Field, Toxic (2)', desc: 'A Rak’Gol butcher’s tool that sheds hard radiation with every swing. The wound it leaves does not stop at the cut.' },
  'howler rifle': { avail: 'Extremely Rare', kind: 'Basic', stats: '30m · –/–/12 · 1d10+3 I · Pen 4 · Clip 60 · Storm, Inaccurate', desc: 'A Rak’Gol automatic that shrieks as it fires. Hopeless at range and devastating across a boarding deck.' },
  'ceres pattern bolt pistol': { avail: 'Near Unique', kind: 'Pistol', stats: '30m · S/2/– · 1d10+6 X · Pen 4 · Clip 8 · Tearing, Accurate', desc: 'A master-crafted bolt pistol of the Ceres pattern, built to a standard the Imperium no longer routinely reaches.' },
  'aspect armour': { avail: 'Near Unique', kind: 'Armour', stats: 'AP 6 · all', desc: 'The wraithbone-ribbed plate of an Eldar Aspect Warrior, shaped to a single way of making war.' },
  'augur array': { avail: 'Rare', desc: 'An auspex built into the skull rather than carried. Grants the same bonus to Awareness Tests for hidden threats, gas and radiation, and cannot be dropped or confiscated.' },

  'auspex': { avail: 'Scarce', desc: 'A hand-held scanner. Grants a bonus to Awareness Tests made to detect hidden threats, gas or radiation.' },
  'clip harness': { avail: 'Common', desc: 'A grapnel line and drop harness. Grants a bonus to Climb Tests and arrests a fall before it becomes fatal.' },
  'glow-globe': { avail: 'Plentiful', desc: 'A portable light source, throwing a wide, steady glow for hours on a single charge.' },
  'las-cutter': { avail: 'Average', kind: 'Melee', stats: '1d10+5 E · Pen 4 · Unwieldy', desc: 'A heavy industrial cutting tool, slow but capable of parting armour plate — and, in a pinch, an improvised weapon.' },
  'magnoculars': { avail: 'Average', desc: 'High-powered optics with range-finding readouts, good for scouting a target at distance.' },
  'photo-visor': { avail: 'Scarce', desc: 'Advanced low-light opticals that erase the penalties of fighting in darkness.' },
  'stimm': { avail: 'Rare', desc: 'A combat stimulant. Masks Fatigue, Stun and injury for a short, violent while — with a debt of Fatigue due when it wears off.' },

  /* ---- issued kit that had no entry, so it showed as a bare name ----
     No stats are invented for these. Where the book gives a number the GM
     sets it at the table, and the description says so. */
  'fine mesh robes': { avail: 'Scarce', desc: 'Robes of fine woven mesh, worn for display first. Whether they turn a blade is for the GM to say; they carry no Armour Points here.' },
  'power blade': { avail: 'Near Unique', kind: 'Melee', desc: 'A Drukhari blade sheathed in a disruption field, the same principle as a power sword, cut to a crueller edge. Its profile is the GM\u2019s to set.' },
  'shamanic gubbinz and trophies': { avail: 'Average', desc: 'The bones, feathers and fetishes a Kroot shaper carries, each one a reminder of something eaten. Dress and ritual, not a weapon.' }
};

export const QUALITY_RE = /^(poor|common|good|best)\s+/i;

/* "Best laspistol or good hand cannon; micro-bead, void suit." ->
   [['Best laspistol','good hand cannon'], ['micro-bead'], ['void suit']] */
export function parseGear(str) {
  /* A bracket can hold commas, a semicolon or a full stop of its own: "Heavy
     Leather Armour (AP 3 body, legs)". Split on those and the armour became
     "Heavy Leather Armour (AP 3 body" and "legs)", neither of which is in the
     catalogue, so the piece lost its description and its AP. They are hidden
     inside brackets while the string is cut up and put back after. */
  const hidden = String(str).replace(/\([^)]*\)/g, (m) => m
    .replace(/,/g, '\u0001').replace(/;/g, '\u0002').replace(/\.(\s)/g, '\u0003$1'));
  const shown = (s) => s.replace(/\u0001/g, ',').replace(/\u0002/g, ';').replace(/\u0003/g, '.');
  return hidden
    .replace(/\.\s*$/, '')
    .split(/[;.]\s+/)
    .flatMap((chunk) => chunk.split(/,\s*/))
    .map((s) => shown(s).trim())
    .filter(Boolean)
    .map((s) => s.split(/\s+or\s+/i).map((x) => x.trim()).filter(Boolean));
}

/* The availability rating for a gear label, for the Acquisition test in
   acquisition.js. Craftsmanship is a separate modifier there, not a step up
   the rarity ladder, so the quality prefix on the label is ignored here and
   reported alongside instead. */
export function availabilityOf(label) {
  const { entry, quality } = gearInfo(label);
  return {
    // Unrated means unrated, not Average by fiat — the caller shows it as
    // "unrated" and the GM sets the rating.
    rating: entry && entry.avail ? entry.avail : null,
    craftsmanship: quality ? quality[0].toUpperCase() + quality.slice(1) : null,
    entry: entry || null
  };
}

/* Strips articles, counts and craftsmanship to find the catalogue entry. */
export function gearInfo(label) {
  // The articles and counts come off FIRST, then the craftsmanship: "a Good
  // Refractor Field" wears its quality behind the article, and reading the
  // prefix off the raw label would miss it and report the field as common.
  const counted = String(label).toLowerCase().trim()
    .replace(/^(?:a|an)\s+/, '')
    .replace(/^two sets of\s+/, '')
    .replace(/^two\s+/, '')
    .replace(/^begins play owning one\s+/, '')
    .replace(/^\d+d\d+\s+/, '')       // "1d5 stikkbombs"
    .replace(/^\d+\s+/, '');           // "3 frag grenades"
  const quality = (counted.match(QUALITY_RE) || [])[1];
  let base = counted
    .replace(QUALITY_RE, '')
    .replace(/\s+with mono upgrade$/, '');
  let entry = GEAR[base];
  if (!entry && base.endsWith('s')) entry = GEAR[base.slice(0, -1)];
  // Strip trailing parenthetical (e.g. "Shuriken Pistol (3 spare magazines)") and retry.
  if (!entry) {
    const stripped = base.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (stripped !== base) {
      entry = GEAR[stripped] || (stripped.endsWith('s') ? GEAR[stripped.slice(0, -1)] : null);
    }
  }
  return { entry: entry || null, quality: quality ? quality.toLowerCase() : null };
}
