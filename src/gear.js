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
  'tau recon combat armour': { avail: 'Extremely Rare', kind: 'Armour', stats: 'AP 5 · all', desc: 'Lightweight Earth Caste composite armour integrating tactical systems and full environmental sealing.' },
  'pulse rifle': { avail: 'Extremely Rare', kind: 'Basic', stats: "150m · S/2/– · 2d10+4 E · Pen 4 · Clip 36 · Reliable", desc: "The signature weapon of the T'au Fire Caste. Fires hyper-accelerated plasma pulses at remarkable range." },
  'pulse carbine': { avail: 'Extremely Rare', kind: 'Basic', stats: '60m · S/2/4 · 2d10+4 E · Pen 4 · Clip 24 · Reliable', desc: 'A shorter pulse weapon for mobile troops. Sacrifices range for rate of fire and easier handling.' },
  'pulse pistol': { avail: 'Extremely Rare', kind: 'Pistol', stats: '30m · S/2/– · 2d10+2 E · Pen 4 · Clip 12 · Reliable', desc: 'A compact pulse weapon for officers and frontline specialists.' },
  'bonding knife': { avail: 'Extremely Rare', kind: 'Melee', stats: '1d5 R · Pen 0 · Primitive', desc: "A ritual blade carried by bonded Fire Caste warriors. Worn as a mark of honour and used only in extremis." },
  'markerlight': { avail: 'Extremely Rare', desc: "A target designator that paints enemies with a tracking beam. Other T'au weapons guided by the beam gain significant accuracy bonuses." },

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
  'knife': { avail: 'Plentiful', kind: 'Melee', stats: '1d5 R · Pen 0 · Primitive', desc: 'A plain blade. Concealable, deniable, and always within reach.' },
  'sword': { avail: 'Common', kind: 'Melee', stats: '1d8+1 R · Pen 0 · Primitive, Balanced', desc: 'An honest steel blade, no monomolecular edge or power field to speak of.' },
  'great weapon': { avail: 'Average', kind: 'Melee', stats: '2d10 R · Pen 0 · Primitive, Unwieldy', desc: 'An oversized two-handed blade or axe. Slow to bring to bear, and devastating when it lands.' },
  'chainaxe': { avail: 'Scarce', kind: 'Melee', stats: '1d10+4 R · Pen 2 · Tearing', desc: 'A motorised axe blade, heavier and crueller than its sword cousin.' },
  'power fist': { avail: 'Extremely Rare', kind: 'Melee', stats: '2d10 E · Pen 8 · Power Field, Unwieldy', desc: 'A disruption field wrapped around a hydraulic gauntlet. Slow, and capable of crushing a bulkhead.' },
  'thunder hammer': { avail: 'Extremely Rare', kind: 'Melee', stats: '2d10+4 E · Pen 10 · Power Field, Shocking, Unwieldy', desc: 'A war-hammer sheathed in disruptive energies, heavy enough to level a wall and leave the target convulsing.' },
  'shock maul': { avail: 'Scarce', kind: 'Melee', stats: '1d10 I · Pen 0 · Shocking', desc: 'An Arbites baton wired for a stunning discharge. Meant to subdue, not to kill.' },
  'heavy leathers': { avail: 'Plentiful', kind: 'Armour', stats: 'AP 1 · arms, body, legs', desc: 'Thick, cured hide. Barely armour at all, but better than the clothes underneath.' },
  'grox-hide vest': { avail: 'Common', kind: 'Armour', stats: 'AP 2 · body', desc: 'A stiff hide vest, tanned from void-grazing grox. Cheap, durable, and smells like it.' },
  'flak helmet': { avail: 'Average', kind: 'Armour', stats: 'AP 2 · head', desc: 'A basic ablative helmet, usually the first piece of a flak kit anyone actually wears.' },
  'flak cloak': { avail: 'Rare', kind: 'Armour', stats: 'AP 3 · arms, body, legs', desc: 'A hooded flak cloak, worn loose enough to pass for civilian dress at a glance.' },
  'flak vest': { avail: 'Average', kind: 'Armour', stats: 'AP 3 · body', desc: 'A sleeveless flak jacket over the torso alone — mobility over full coverage.' },
  'mesh vest': { avail: 'Rare', kind: 'Armour', stats: 'AP 4 · body', desc: 'Fine metal mesh worn under clothing. Protective and, worn right, entirely invisible.' },
  'carapace chestplate': { avail: 'Rare', kind: 'Armour', stats: 'AP 6 · body', desc: 'A single rigid carapace plate over the torso, without the rest of a full suit’s weight or expense.' },
  'power armour': { avail: 'Extremely Rare', kind: 'Armour', stats: 'AP 8 · all', desc: 'Powered ceramite plate, sealed and servo-assisted. Rarely issued, and never without a reason.' },
  'auspex': { avail: 'Scarce', desc: 'A hand-held scanner. Grants a bonus to Awareness Tests made to detect hidden threats, gas or radiation.' },
  'clip harness': { avail: 'Common', desc: 'A grapnel line and drop harness. Grants a bonus to Climb Tests and arrests a fall before it becomes fatal.' },
  'glow-globe': { avail: 'Plentiful', desc: 'A portable light source, throwing a wide, steady glow for hours on a single charge.' },
  'las-cutter': { avail: 'Average', kind: 'Melee', stats: '1d10+5 E · Pen 4 · Unwieldy', desc: 'A heavy industrial cutting tool, slow but capable of parting armour plate — and, in a pinch, an improvised weapon.' },
  'magnoculars': { avail: 'Average', desc: 'High-powered optics with range-finding readouts, good for scouting a target at distance.' },
  'photo-visor': { avail: 'Scarce', desc: 'Advanced low-light opticals that erase the penalties of fighting in darkness.' },
  'stimm': { avail: 'Rare', desc: 'A combat stimulant. Masks Fatigue, Stun and injury for a short, violent while — with a debt of Fatigue due when it wears off.' }
};

export const QUALITY_RE = /^(poor|common|good|best)\s+/i;

/* "Best laspistol or good hand cannon; micro-bead, void suit." ->
   [['Best laspistol','good hand cannon'], ['micro-bead'], ['void suit']] */
export function parseGear(str) {
  return String(str)
    .replace(/\.\s*$/, '')
    .split(/[;.]\s+/)
    .flatMap((chunk) => chunk.split(/,\s*/))
    .map((s) => s.trim())
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
  const quality = (label.match(QUALITY_RE) || [])[1];
  let base = label.toLowerCase().trim()
    .replace(/^(?:a|an)\s+/, '')
    .replace(/^two sets of\s+/, '')
    .replace(/^two\s+/, '')
    .replace(/^begins play owning one\s+/, '')
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
