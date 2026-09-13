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

export const GEAR = {
  /* ---- pistols ---- */
  'laspistol': { kind: 'Pistol', stats: '30m · S/–/– · 1d10+2 E · Pen 0 · Clip 30 · Reliable', desc: 'The Imperium’s workhorse sidearm. Weak, but it almost never jams and a charge pack lasts.' },
  'hand cannon': { kind: 'Pistol', stats: '35m · S/–/– · 1d10+4 I · Pen 2 · Clip 5', desc: 'A heavy solid-slug pistol. Hits hard, holds little, and is slow to reload.' },
  'plasma pistol': { kind: 'Pistol', stats: '30m · S/2/– · 1d10+6 E · Pen 6 · Clip 10 · Overheats, Recharge', desc: 'Bottled starfire. Devastating and quietly willing to maim the person holding it.' },
  'bolt pistol': { kind: 'Pistol', stats: '30m · S/2/– · 1d10+5 X · Pen 4 · Clip 8 · Tearing', desc: 'Fires self-propelled mass-reactive shells that detonate inside the target.' },
  'hellpistol': { kind: 'Pistol', stats: '35m · S/2/– · 1d10+4 E · Pen 7 · Clip 40', desc: 'A militarised laspistol running at lethal charge. Punches through armour a laspistol would scorch.' },
  'inferno pistol': { kind: 'Pistol', stats: '10m · S/–/– · 2d10+4 E · Pen 13 · Clip 3', desc: 'A melta sidearm. Almost no range, and almost nothing survives being inside it.' },
  'stub automatic': { kind: 'Pistol', stats: '30m · S/3/– · 1d10+3 I · Pen 0 · Clip 9', desc: 'Cheap, ubiquitous, and utterly unremarkable — which is often the point.' },

  /* ---- basic weapons ---- */
  'lasgun': { kind: 'Basic', stats: '100m · S/3/– · 1d10+3 E · Pen 0 · Clip 60 · Reliable', desc: 'The rifle that holds the Imperium together. Unglamorous and nearly unbreakable.' },
  'boltgun': { kind: 'Basic', stats: '90m · S/2/4 · 1d10+5 X · Pen 4 · Clip 24 · Tearing', desc: 'A holy weapon and a heavy one. Rare enough that carrying it says something about you.' },
  'hellgun': { kind: 'Basic', stats: '110m · S/3/– · 1d10+4 E · Pen 7 · Clip 40', desc: 'Storm trooper issue — a lasgun rebuilt for penetration, fed by a backpack cell.' },
  'hunting rifle': { kind: 'Basic', stats: '200m · S/–/– · 1d10+3 I · Pen 0 · Clip 5', desc: 'A long-barrelled solid-slug rifle. Reaches far further than anything else at this price.' },
  'flamer': { kind: 'Basic', stats: '20m · S/–/– · 1d10+4 E · Pen 2 · Clip 2 · Flame', desc: 'Ignites everything in a cone. Feared out of proportion to its damage, and rightly so.' },

  /* ---- melee ---- */
  'mono-sword': { kind: 'Melee', stats: '1d10+2 R · Pen 2 · Balanced', desc: 'A blade with a monomolecular edge — the standard duelling sword of the void-borne.' },
  'power sword': { kind: 'Melee', stats: '1d10+5 E · Pen 5 · Balanced, Power Field', desc: 'A disruption field sheathes the blade, parting armour like cloth. A mark of real status.' },
  'power axe': { kind: 'Melee', stats: '1d10+7 E · Pen 7 · Unbalanced, Power Field', desc: 'All of the power sword’s ferocity, none of its finesse. Heavy and hard to recover.' },
  'chainsword': { kind: 'Melee', stats: '1d10+2 R · Pen 2 · Balanced, Tearing', desc: 'Motorised teeth on a sword blade. As much a terror weapon as a practical one.' },
  'shock staff': { kind: 'Melee', stats: '1d10+3 I · Pen 0 · Shocking', desc: 'A staff that delivers a stunning discharge — favoured where a corpse is the wrong outcome.' },
  'metal staff': { kind: 'Melee', stats: '1d10+2 I · Pen 0 · Primitive', desc: 'A plain metal staff. A badge of office that also works as a club.' },
  'staff': { kind: 'Melee', stats: '1d10 I · Pen 0 · Primitive, Balanced', desc: 'A length of wood or metal. Ubiquitous, unremarkable, always to hand.' },
  'primitive melee weapon': { kind: 'Melee', stats: 'Primitive', desc: 'A blade or club of pre-industrial make. A mono upgrade puts a monomolecular edge on it, which lifts it out of the Primitive bracket.' },

  /* ---- eldar weapons ---- */
  'shuriken pistol': { kind: 'Pistol', stats: '30m · S/3/5 · 1d10+3 R · Pen 4 · Clip 35 · Razor Sharp', desc: 'Fires monofilament discs at lethal velocity. Punches through armour with ease and shreds anything it passes through.' },
  'shuriken catapult': { kind: 'Basic', stats: '60m · S/3/10 · 1d10+3 R · Pen 4 · Clip 100 · Razor Sharp', desc: 'The standard Aeldari long-arm. Storms the target with a blizzard of razor-edged monofilament discs.' },
  'eldar power sword': { kind: 'Melee', stats: '1d10+5 E · Pen 6 · Balanced, Power Field', desc: 'An Aeldari disruption blade of exquisite craftsmanship. Cuts through armour as easily as a standard power sword, but lighter and perfectly balanced.' },
  'aeldari mesh armour': { kind: 'Armour', stats: 'AP 3 · all · negligible weight', desc: 'Woven from psycho-reactive Eldar mesh. Absorbs and disperses kinetic and energy impacts almost without encumbrance.' },
  'waystone': { desc: 'A spirit stone attuned to its bearer. Upon death the wearer\'s soul is drawn into the stone rather than cast into the warp to be consumed by Slaanesh.' },
  'waystone (spirit stone)': { desc: 'A spirit stone attuned to its bearer. Upon death the wearer\'s soul is drawn into the stone rather than cast into the warp to be consumed by Slaanesh.' },
  'eldar jump pack': { desc: 'A grav-propulsion harness of Eldar design. Lighter and more manoeuvrable than Imperial equivalents; allows short bursts of flight and extended leaping.' },

  /* ---- armour ---- */
  'guard flak armour': { kind: 'Armour', stats: 'AP 4 · body, arms, legs', desc: 'Layered ablative plate over bodyglove. What most of the Imperium’s soldiery dies in.' },
  'guard flak': { kind: 'Armour', stats: 'AP 4 · body, arms, legs', desc: 'Layered ablative plate over bodyglove. What most of the Imperium’s soldiery dies in.' },
  'enforcer light carapace': { kind: 'Armour', stats: 'AP 5 · body, arms, legs', desc: 'Rigid moulded plate. Markedly better than flak, and markedly more restrictive.' },
  'storm trooper carapace': { kind: 'Armour', stats: 'AP 6 · body, arms, legs', desc: 'Full military carapace. Heavy, obvious, and very hard to shoot through.' },
  'xeno-mesh armour': { kind: 'Armour', stats: 'AP 4 · body, arms, legs', desc: 'Alien-woven mesh. Light, quiet, and quietly illegal to be seen wearing.' },
  'synskin': { kind: 'Armour', stats: 'AP 3 · all · aids concealment', desc: 'A skin-tight bodysuit that dulls heat and sound as well as blades.' },

  /* ---- kit ---- */
  'micro-bead': { desc: 'Short-range earpiece vox. The default way a landing party stays in contact.' },
  'void suit': { desc: 'Sealed pressure suit with its own air. The difference between a hull breach and a funeral.' },
  're-breather': { desc: 'Filters and recycles air against smoke, fumes and thin atmosphere.' },
  'medikit': { desc: 'Field surgery kit. Required to get the most out of the Medicae skill.' },
  'injector': { desc: 'Delivers a dose fast, through armour if it must be.' },
  'combi-tool': { desc: 'A folding cluster of every tool a tech-adept regularly needs.' },
  'dataslate': { desc: 'Portable slate for reading, writing and storing records.' },
  'autoquill': { desc: 'Copies dictation or duplicates a document in a neat scribe’s hand.' },
  'multikey': { desc: 'Defeats common Imperial mechanical and electronic locks. Its legality depends entirely on who is asking.' },
  'chrono': { desc: 'A timepiece. Unremarkable until the moment it is not.' },
  'pict-recorder': { desc: 'Captures images and moving pict. Evidence, or leverage.' },
  'vox-caster': { desc: 'Long-range backpack vox — reaches orbit, unlike a micro-bead.' },
  'manacles': { desc: 'Restraints for a prisoner you intend to deliver alive.' },
  'psy-focus': { desc: 'An object that steadies a psyker’s concentration when channelling.' },
  'sacred unguent': { desc: 'Blessed oils for anointing machines. The rite matters as much as the lubricant.' },
  'cameleoline cloak': { desc: 'Shifts colour to match its surroundings, greatly aiding concealment when still.' },
  'xeno-pelt cloak': { desc: 'The hide of something that was not human. Worn to be noticed.' },
  'fine clothing': { desc: 'Cut and cloth that opens doors in polite society.' },
  'ecclesiarchal robe': { desc: 'Vestments of the Imperial Creed, and the authority that comes with them.' },
  'robe': { desc: 'Plain robes. Anonymous, which is frequently the point.' },
  'aquila pendant': { desc: 'The two-headed eagle worn at the throat. A statement of faith.' },
  'censer': { desc: 'Swings burning incense through a rite — and masks other smells.' },
  'charm': { desc: 'A luck token. Whether it works is between you and the Emperor.' },
  'bolt shell keepsake': { desc: 'A single spent bolt shell, kept. Someone survived what it was fired at.' },
  'blessed ship token': { desc: 'A sanctified fragment of a voidship, carried against the warp.' },
  'navy uniform': { desc: 'Imperial Navy dress. Rank made visible, with all that follows.' },
  'silk headscarf': { desc: 'Fine silk, worn in the Nobilite manner.' },
  'nobilite signet': { desc: 'A house seal. Proof of bloodline, and a target for those who resent it.' },
  'emperor’s tarot deck': { desc: 'Cards read for guidance. The Imperium takes their readings seriously.' },
  'servo-skull familiar': { desc: 'A hovering, machine-spirited skull that follows you and carries out simple tasks.' },

  /* ---- ork weapons & kit ---- */
  'choppa': { kind: 'Melee', stats: '1d10+2 R · Pen 0 · Primitive, Tearing', desc: 'A crude Ork cleaver of heavy iron. More meat-clever than sword, and exactly as subtle as it looks.' },
  'slugga': { kind: 'Pistol', stats: '20m · S/3/– · 1d10+4 I · Pen 0 · Clip 18 · Inaccurate, Unreliable', desc: 'A chunky Ork sidearm. Fires enthusiastically in roughly the right direction.' },
  'shoota': { kind: 'Basic', stats: '60m · S/3/– · 1d10+3 I · Pen 0 · Clip 30 · Inaccurate, Unreliable', desc: 'An Ork automatic rifle cobbled from scavenged parts. Loud, unreliable, and deeply satisfying to fire.' },
  'stikkbomb': { kind: 'Thrown', stats: 'SB×3 · S/–/– · 2d10 X · Pen 0 · Blast (3)', desc: 'A crude grenade packed with scrap metal and low-grade explosive. Orks throw them the way humans throw insults.' },
  'stikkbombs': { kind: 'Thrown', stats: 'SB×3 · S/–/– · 2d10 X · Pen 0 · Blast (3)', desc: 'Crude grenades packed with scrap metal and explosive. Always thrown in quantity.' },
  'heavy leather armour': { kind: 'Armour', stats: 'AP 3 · body, legs', desc: 'Thick hides stitched together with wire and faith. Not pretty, but it stops a blade and nobody complains.' },
  'squig-hide armour': { kind: 'Armour', stats: 'AP 3 · body, legs', desc: 'Cured hide from a squig. Tough, pungent, and entirely characteristic of its wearer.' },
  'shiny gubbinz': { desc: 'A collection of trophies, shiny trinkets and scavenged machine parts. Meaningless to others; priceless to an Ork.' },

  /* ---- kroot gear ---- */
  'kroot rifle': { kind: 'Basic', stats: '80m · S/2/– · 1d10+3 R · Pen 2 · Clip 8 · Primitive', desc: 'A long-barrelled rifle grown and shaped from kroot biotechnology, fitted with a mono-edged blade for close combat.' },
  'kroot leather armour': { kind: 'Armour', stats: 'AP 2 · body, arms, legs', desc: 'Trophies and hide sewn into a functional harness. Light, flexible, and decorated with the bones of the fallen.' },
  'meat hook': { desc: 'A curved blade on a length of cord or chain. Used to drag prey, scale rough surfaces or threaten a captive.' },

  /* ---- drukhari gear ---- */
  'kabalite armour': { kind: 'Armour', stats: 'AP 4 · all', desc: 'Living polymer mesh bonded to shards of hardened dark matter. Light as silk and harder than ceramite.' },
  'splinter rifle': { kind: 'Basic', stats: '80m · S/3/5 · 1d10+3 R · Pen 4 · Clip 40 · Toxic (2)', desc: 'Fires crystallised toxin shards refined in Commorragh. Each sliver carries a paralytic or lethal compound.' },
  'splinter pistol': { kind: 'Pistol', stats: '30m · S/3/– · 1d10+3 R · Pen 4 · Clip 35 · Toxic (2)', desc: 'The standard Drukhari sidearm. Compact, elegant, and laced with suffering in every shard.' },
  'agoniser': { kind: 'Melee', stats: '1d10+3 E · Pen 0 · Flexible, Shocking', desc: 'A whip or blade wreathed in tortured energies. Every contact sends agony through the target, ignoring armour.' },
  'combat drug injector': { desc: 'A wrist-mounted reservoir of Drukhari combat stimulants administered mid-fight to enhance speed, strength or pain tolerance.' },
  'dark silk void robes': { desc: 'Woven from material predating the Fall. Provides modest vacuum protection and some resistance to warp radiation.' },

  /* ---- t'au gear ---- */
  'tau recon combat armour': { kind: 'Armour', stats: 'AP 5 · all', desc: 'Lightweight Earth Caste composite armour integrating tactical systems and full environmental sealing.' },
  'pulse rifle': { kind: 'Basic', stats: "150m · S/2/– · 2d10+4 E · Pen 4 · Clip 36 · Reliable", desc: "The signature weapon of the T'au Fire Caste. Fires hyper-accelerated plasma pulses at remarkable range." },
  'pulse carbine': { kind: 'Basic', stats: '60m · S/2/4 · 2d10+4 E · Pen 4 · Clip 24 · Reliable', desc: 'A shorter pulse weapon for mobile troops. Sacrifices range for rate of fire and easier handling.' },
  'pulse pistol': { kind: 'Pistol', stats: '30m · S/2/– · 2d10+2 E · Pen 4 · Clip 12 · Reliable', desc: 'A compact pulse weapon for officers and frontline specialists.' },
  'bonding knife': { kind: 'Melee', stats: '1d5 R · Pen 0 · Primitive', desc: "A ritual blade carried by bonded Fire Caste warriors. Worn as a mark of honour and used only in extremis." },
  'markerlight': { desc: "A target designator that paints enemies with a tracking beam. Other T'au weapons guided by the beam gain significant accuracy bonuses." }
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
