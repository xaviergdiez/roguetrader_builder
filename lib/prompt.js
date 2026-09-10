// Builds the portrait prompt from a character's origin path.
//
// The whole point is that two Explorators with different origins do not get the
// same picture, so every one of the 38 origin options carries a visual phrase.
// A name alone ("Scapegrace") means nothing to an image model; "a branded mark
// of past disgrace half-hidden by the collar" does.
//
// Keyed by the option id, with the display name as a fallback key so a sheet
// imported by name still resolves. Unknown values degrade to the bare name
// rather than dropping out — a slightly flat prompt beats a wrong one.
//
// No pronouns anywhere: the app is not told the character's gender, and "they"
// makes image models render a crowd. Participles ("Wielding…", "…slung across
// the back") carry the same sentences without either problem.
//
// Pure, and outside /api so Vercel does not count it against the function cap.
// See prompt.check.mjs.

const SETTING = {
  death: "a predatory jungle-choked ruin under a bruised alien sky, venomous flora crowding fallen stone",
  void: "the cramped, cable-strewn interior of a void ship, hard starlight through scarred armourglass",
  forge: "a gargantuan archeotech megastructure resembling a holy cathedral of forgotten logic, cogitator banks and sacred machinery rising into the dark",
  hive: "a vertiginous hive-city canyon, rusted ductwork and smog-lit walkways stacked endlessly overhead",
  imperial: "a soot-stained Imperial cathedral plaza, aquila statuary and hanging banners above pilgrim crowds",
  noble: "a decaying baroque palace hall, gilt mouldings and dust-heavy velvet under a shattered skylight",
};

const CAREER = {
  explorator:
    "heavily augmented and clad in oil-stained crimson and black Mechanicus robes, the cowl pulled low over a predominantly mechanical head, multiple glowing green optical lenses, vox-grilles and data-ports piercing the cowl in place of human eyes, a multi-jointed servo-arm extending from the back",
  roguetrader:
    "wearing a magnificent long coat of void-silk and gold brocade, rings of office on gauntleted fingers, a Warrant of Trade sealed in a scroll case at the hip",
  archmilitant:
    "a scarred veteran in layered flak and trophy-hung carapace plate, bandoliers crossed over the chest",
  astropath:
    "soul-bound and hollow-cheeked, the eyes burned to blind sockets, warp-frost riming heavy sanctioned robes",
  missionary:
    "in weather-beaten ecclesiastical vestments, a heavy rosarius and a chained tome at the belt",
  navigator:
    "of a great Navigator House, the warp-eye hidden behind a warded blindfold, high stiff collar above mutant-pale skin",
  seneschal:
    "in immaculate dark formal dress, a cogitator monocle at one eye and ledgers chained at the waist",
  voidmaster:
    "in a worn flight jacket and rebreather rig, an augmetic targeting lens over one eye",
};

// Membership below matches STEPS in the app, checked against SHEET_CATALOG by
// scripts/audit-parse.mjs. Two were filed under the wrong step at first —
// Tainted is a Lure of the Void, not a Birthright, and Press-Ganged is a Trial,
// not a Lure — and each silently produced no art direction.
const BIRTHRIGHT = {
  scavenger: "wiry and underfed, salvaged trinkets wired to the gear",
  scapegrace: "a branded mark of past disgrace half-hidden by the collar",
  stubjack: "knuckles broken and re-set, gang ink showing under the cuffs",
  creed: "devotional scripture stitched into every seam",
  savant: "ink-stained fingers and a bundle of annotated parchment",
  vaunted: "carrying the polished bearing and fine cut of high birth",
};

const LURE = {
  tainted: "a subtle, unsettling mutation at the hairline",
  criminal: "a concealed blade and a wary, sidelong watchfulness",
  renegade: "a defaced Imperial insignia, filed down but still legible",
  duty: "an oath-scroll wax-sealed to the breastplate",
  zealot: "a fervent, fever-bright intensity",
  destiny: "a faint and uncanny air of inevitability",
};

const TRIALS = {
  press: "an iron press-gang cuff still locked on one wrist",
  calamity: "old burn-scars and ingrained ash across one side of the face",
  shiplorn: "the salvaged nameplate of a lost ship worn as a talisman",
  darkvoyage: "a thousand-yard stare and warp-bleached hair",
  vendetta: "a rival's honour-token nailed to the belt",
  handofwar: "a campaign's worth of battle plate, cracked and field-welded",
};

const MOTIVATION = {
  endurance: "a grim, unbreakable set to the jaw",
  fortune: "avarice barely veiled, wealth displayed on every finger",
  vengeance: "a cold and fixed hatred in the gaze",
  renown: "a practised heroic bearing held for an unseen audience",
  pride: "imperious disdain, the chin raised",
  prestige: "every surface ornamented to advertise standing",
};

// Display name -> id, so a sheet that carries "Void Born" resolves like "void".
const byName = (table, names) => {
  const out = {};
  for (const [id, text] of Object.entries(table)) out[id] = text;
  for (const [name, id] of Object.entries(names)) {
    if (table[id]) out[name.toLowerCase()] = table[id];
  }
  return out;
};

const NAMES = {
  "Death World": "death", "Void Born": "void", "Forge World": "forge",
  "Hive World": "hive", "Imperial World": "imperial", "Noble Born": "noble",
  Scavenger: "scavenger", Scapegrace: "scapegrace", Stubjack: "stubjack",
  "Child of the Creed": "creed", Savant: "savant", Vaunted: "vaunted",
  Tainted: "tainted",
  Criminal: "criminal", Renegade: "renegade", "Duty Bound": "duty",
  Zealot: "zealot", "Chosen by Destiny": "destiny", "Press-Ganged": "press",
  Calamity: "calamity", "Ship-Lorn": "shiplorn", "Dark Voyage": "darkvoyage",
  "High Vendetta": "vendetta", "The Hand of War": "handofwar",
  Endurance: "endurance", Fortune: "fortune", Vengeance: "vengeance",
  Renown: "renown", Pride: "pride", Prestige: "prestige",
  "Rogue Trader": "roguetrader", "Arch-Militant": "archmilitant",
  "Astropath Transcendent": "astropath", Explorator: "explorator",
  Missionary: "missionary", Navigator: "navigator", Seneschal: "seneschal",
  "Void-Master": "voidmaster",
};

const TABLES = {
  homeWorld: byName(SETTING, NAMES),
  home: byName(SETTING, NAMES),        // the app's step id for the same thing
  career: byName(CAREER, NAMES),
  birthright: byName(BIRTHRIGHT, NAMES),
  lure: byName(LURE, NAMES),
  trials: byName(TRIALS, NAMES),
  motivation: byName(MOTIVATION, NAMES),
};

// Every option name is unique across the six steps, so a value can be resolved
// without knowing its step. Consulted only after the named step misses: it is
// what keeps a mis-filed option from silently losing its phrase, which is how
// Tainted and Press-Ganged went missing.
const ANY = Object.assign({}, ...Object.values(TABLES));

// A phrase for one origin choice, or "" when nothing describes it.
export function phraseFor(step, value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const table = TABLES[step];
  if (!table) return "";               // an unknown step is a caller error
  const key = raw.toLowerCase();
  return table[raw] || table[key] || ANY[raw] || ANY[key] || "";
}

// Deliberately unanchored: 40k weapon names compound, so \bgun\b would miss
// Hellgun, Lasgun, Boltgun and Autopistol. "power", "chain" and "las" are left
// out as prefixes — they match Power Pack and Chain Coif, and the weapons that
// carry them (Power Axe, Chainsword, Lasgun) are caught by their noun anyway.
const WEAPON_WORDS = /(axe|sword|blade|knife|gun|pistol|rifle|bolt|stub|flamer|melta|plasma|staff|maul|hammer|spear|whip|lance|cannon|launcher|revolver)/i;

// The two most characterful weapons, longest name first: "good-craftsmanship
// Power Axe" says more than "knife".
export function weaponsFrom(gear) {
  return (Array.isArray(gear) ? gear : [])
    .map((g) => String(g || "").trim())
    .filter((g) => g && WEAPON_WORDS.test(g))
    .sort((a, b) => b.length - a.length)
    .slice(0, 2);
}

export function buildPrompt(identity = {}) {
  const { name, homeWorld, birthright, lure, trials, motivation, career, gear, concept } = identity;

  const setting = phraseFor("homeWorld", homeWorld)
    || "a vast, grime-caked Imperial interior of black iron and worn brass";

  // Career phrase reads as an apposition after the name; a career the table
  // does not know still gets named so the model has the archetype.
  const careerPhrase = phraseFor("career", career)
    || (career ? `a ${career} of the Imperium` : "an Imperial voidfarer");

  const details = [
    phraseFor("birthright", birthright),
    phraseFor("lure", lure),
    phraseFor("trials", trials),
    phraseFor("motivation", motivation),
  ].filter(Boolean);

  const weapons = weaponsFrom(gear);
  const arms = weapons.length === 0 ? ""
    : weapons.length === 1
      ? ` Wielding a ${weapons[0]}.`
      : ` Wielding a massive ${weapons[0]}, with a ${weapons[1]} slung across the back.`;

  const subject = String(name || "").trim() || "a nameless Imperial explorer";

  return [
    "A cinematic, highly detailed photorealistic render in the grimdark aesthetic ",
    `of Warhammer 40,000, set in ${setting}.`,
    ` A single central figure: ${subject}, ${careerPhrase}.`,
    details.length ? ` Distinguishing details: ${details.join("; ")}.` : "",
    arms,
    concept ? ` ${String(concept).trim().slice(0, 300)}` : "",
    " The primary lighting is harsh, cold green and amber illumination from",
    " scattered cogitator screens and sacred unguent candles, struggling against",
    " deep, oppressive shadows. Grime, ancient dust, sacred etchings and",
    " corrosion blanket every surface; the air is thick with smoke and heavy dust.",
    " Portrait orientation, head and shoulders filling the upper half, cinematic",
    " depth of field focused tightly on the figure, heavy grain and visible",
    " texture. No text, no watermark, no border, no additional figures.",
  ].join("");
}
