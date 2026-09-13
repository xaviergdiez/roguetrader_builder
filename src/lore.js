// Builds a placeholder character background from the origin path.
//
// Companion to lib/prompt.js: same identity shape, prose output instead of an
// image-generation prompt. Meant as a starting draft the player overwrites,
// not a final biography — every origin choice becomes a sentence rather than
// a visual phrase, in the third person, past tense throughout (English simple
// past does not inflect for number, so "he/she/they" never needs a matching
// verb form except for the one "is/are" clause, handled by agree()).
//
// Pure. See lore.check.mjs.

import { weaponsFrom } from '../lib/prompt.js';

const HOME_LORE = {
  death: "grew up on a feral death world, where every breath was a negotiation with a hostile ecosystem and adulthood arrived the day the killing started",
  void: "was born and raised in the cramped, recycled air of a void ship's underdecks, with the stars as the only horizon ever known",
  forge: "was raised in the sacred forges of a Mechanicus world, taught the Omnissiah's liturgies before a proper name",
  hive: "grew up in the choking vertical sprawl of a hive city, a life measured in levels climbed and the ever-present fear of falling back down them",
  imperial: "grew up on an unremarkable Imperial world, taught devotion long before doubt",
  noble: "was raised in the gilded halls of a noble household, where every kindness concealed a transaction",
  // Xenos careers use their species as the "home world" step.
  aeldari: "was born to a craftworld adrift in the void, heir to a civilisation that collapsed under its own excess long before humankind first looked to the stars",
  ork: "erupted fully grown from fungal spore into the endless churn of an Ork Waaagh!, a life built for nothing but the fight",
  kroot: "was hatched into a Kroot warspear, one hunter among many consuming the strength of the fallen across a hundred worlds",
  drukhari: "was born beneath the black spires of Commorragh, where mercy was a foreign word and survival was bought with someone else's suffering",
  tau: "was raised on a T'au sept world, taught the calm certainty of the Greater Good before it could be questioned",
};

const CAREER_LORE = {
  roguetrader: "earned a Warrant of Trade — sanction from the High Lords of Terra to explore, exploit and claim the void beyond the Imperium's charted stars in the Emperor's name",
  archmilitant: "turned violence into both a livelihood and an art, becoming the blade and gun-hand at a Rogue Trader's side",
  astropath: "surrendered sight at the Astropathicus, trading the eyes for the gift — and the burden — of psychic communion across the void",
  explorator: "answered the Omnissiah's call to the Explorator fleets, hunting lost and forbidden technology and trading flesh willingly for augmetic certainty",
  missionary: "carried the Imperial Creed to worlds that had never heard the Emperor's word, or had long since forgotten it",
  navigator: "inherited the warp-eye of the Navis Nobilite, a mutation that alone could chart a safe course through the roiling immaterium",
  seneschal: "took up the countless mundane burdens that kept a Rogue Trader's dynasty solvent — ledgers, favours, secrets, and the occasional discreet murder",
  voidmaster: "climbed to the bridge, translating a captain's ambition into vector, thrust and broadside",
  eldarcorsair: "turned from the craftworld's ordained path to raid and trade among the stars, bound to no fixed fate but the pursuit of fleeting experience",
  orkfreebooter: "answered the call of loot and battle beyond the Waaagh!, chasing profit measured in scrap, teeth and unrepentant violence",
  krootmercenary: "took up contract-work for whoever paid in meat and ammunition, one gun among the Kroot mercenary companies hired across a hundred wars",
  drukharikabalitewarrior: "fought beneath a Kabal's banner, one blade among thousands loaned from Commorragh's endless internal war to whichever patron currently profited the Archon",
  taufirewarrior: "served as Fire Caste infantry seconded to alien company, disciplined and coordinated even far from the Water Caste's diplomacy and the Ethereals' guidance",
};

const BIRTHRIGHT_LORE = {
  scavenger: "learned early to want nothing that could not be salvaged, repaired, or stolen",
  scapegrace: "carried the mark of an old disgrace, one the years had never quite let fade",
  stubjack: "grew up settling arguments with fists first, a habit that gang life never fully broke",
  creed: "was raised on scripture before schooling, the Imperial Creed stitched into every early memory",
  savant: "hoarded knowledge the way others hoarded coin, ink-stained fingers never far from a half-finished page",
  vaunted: "carried the bearing of high birth, a poise no amount of hardship since had managed to strip away",
};

const LURE_LORE = {
  tainted: "bore a subtle, unsettling mark the void had left behind — one best kept hidden from Imperial eyes",
  criminal: "left the old world one step ahead of the law, a debt or a body left behind",
  renegade: "wore a defaced Imperial insignia, filed down but never quite erased",
  duty: "swore an oath not even the void's furthest reaches could unmake",
  zealot: "burned with a fervour that unsettled even hardened voidsmen",
  destiny: "carried an uncanny, unshakeable sense of being meant for something larger than one lifetime",
};

const TRIALS_LORE = {
  press: "still bore the scar of the press-gang cuff that once dragged them into service",
  calamity: "survived a disaster that left old burns and older nightmares in equal measure",
  shiplorn: "lost a ship once, and kept its nameplate as a reminder of what the void takes",
  darkvoyage: "returned from a voyage through the warp changed — a thousand-yard stare and hair bleached white by things best not remembered",
  vendetta: "carried a rival's honour-token as a promise not yet settled",
  handofwar: "fought a campaign that left plate cracked, field-welded, and never quite off their back since",
};

const MOTIVATION_LORE = {
  endurance: "little more than sheer endurance — a refusal to stop, whatever the void demands",
  fortune: "the promise of fortune, chased openly and without shame",
  vengeance: "an old and patient vengeance, a debt not yet collected",
  renown: "the hunger to be remembered — a name spoken in awe long after the deed that earned it",
  pride: "a pride that bends for no one",
  prestige: "the need to be seen to matter, every possession chosen to advertise standing",
};

// Display name -> id, mirroring lib/prompt.js's NAMES but extended with the
// five xenos home worlds and careers, which prompt.js's CAREER table has no
// use for (image prompts fall back to a generic phrase there instead).
const NAMES = {
  "Death World": "death", "Void Born": "void", "Forge World": "forge",
  "Hive World": "hive", "Imperial World": "imperial", "Noble Born": "noble",
  Aeldari: "aeldari", Ork: "ork", Kroot: "kroot", Drukhari: "drukhari", "T'au": "tau",
  Scavenger: "scavenger", Scapegrace: "scapegrace", Stubjack: "stubjack",
  "Child of the Creed": "creed", Savant: "savant", Vaunted: "vaunted",
  Tainted: "tainted", Criminal: "criminal", Renegade: "renegade", "Duty Bound": "duty",
  Zealot: "zealot", "Chosen by Destiny": "destiny", "Press-Ganged": "press",
  Calamity: "calamity", "Ship-Lorn": "shiplorn", "Dark Voyage": "darkvoyage",
  "High Vendetta": "vendetta", "The Hand of War": "handofwar",
  Endurance: "endurance", Fortune: "fortune", Vengeance: "vengeance",
  Renown: "renown", Pride: "pride", Prestige: "prestige",
  "Rogue Trader": "roguetrader", "Arch-Militant": "archmilitant",
  "Astropath Transcendent": "astropath", Explorator: "explorator",
  Missionary: "missionary", Navigator: "navigator", Seneschal: "seneschal",
  "Void-Master": "voidmaster",
  "Eldar Corsair": "eldarcorsair", "Ork Freebooter": "orkfreebooter",
  "Kroot Mercenary": "krootmercenary",
  "Drukhari Kabalite Warrior": "drukharikabalitewarrior",
  "T'au Fire Warrior": "taufirewarrior",
};

const byName = (table, names) => {
  const out = {};
  for (const [id, text] of Object.entries(table)) out[id] = text;
  for (const [name, id] of Object.entries(names)) {
    if (table[id]) out[name.toLowerCase()] = table[id];
  }
  return out;
};

const TABLES = {
  homeWorld: byName(HOME_LORE, NAMES),
  home: byName(HOME_LORE, NAMES),
  career: byName(CAREER_LORE, NAMES),
  birthright: byName(BIRTHRIGHT_LORE, NAMES),
  lure: byName(LURE_LORE, NAMES),
  trials: byName(TRIALS_LORE, NAMES),
  motivation: byName(MOTIVATION_LORE, NAMES),
};

const ANY = Object.assign({}, ...Object.values(TABLES));

// A lore clause for one origin choice, or "" when nothing describes it.
export function loreFor(step, value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const table = TABLES[step];
  if (!table) return "";
  const k = raw.toLowerCase();
  return table[raw] || table[k] || ANY[raw] || ANY[k] || "";
}

function pronounsFor(gender) {
  if (gender === "Male") return { Subj: "He", subj: "he", obj: "him", plural: false };
  if (gender === "Female") return { Subj: "She", subj: "she", obj: "her", plural: false };
  return { Subj: "They", subj: "they", obj: "them", plural: true };
}

const agree = (p, singular, plural) => (p.plural ? plural : singular);

export function buildLore(identity = {}) {
  const { name, gender, homeWorld, birthright, lure, trials, motivation, career, gear, concept } = identity;
  const p = pronounsFor(gender);
  const subject = String(name || "").trim() || "This adept";

  const sentences = [];

  const origin = loreFor("homeWorld", homeWorld);
  sentences.push(origin
    ? `${subject} ${origin}.`
    : `${subject} has no recorded origin — a blank space in the file, waiting to be filled in.`);

  const careerLore = loreFor("career", career);
  sentences.push(careerLore
    ? `${p.Subj} ${careerLore}.`
    : career
      ? `${p.Subj} ${agree(p, "serves", "serve")} the dynasty as a ${career}.`
      : `${p.Subj} ${agree(p, "has", "have")} not yet settled into a fixed role aboard ship.`);

  const bRight = loreFor("birthright", birthright);
  if (bRight) sentences.push(`${p.Subj} ${bRight}.`);

  const lureLore = loreFor("lure", lure);
  if (lureLore) sentences.push(`The pull toward the void was never subtle: ${p.subj} ${lureLore}.`);

  const trialsLore = loreFor("trials", trials);
  if (trialsLore) sentences.push(`Along the way, ${p.subj} ${trialsLore}.`);

  const motivLore = loreFor("motivation", motivation);
  if (motivLore) sentences.push(`Now, ${p.subj} ${agree(p, "is", "are")} driven by ${motivLore}.`);

  const weapons = weaponsFrom(gear);
  if (weapons.length) {
    const tail = weapons.length === 1
      ? `a ${weapons[0]}`
      : `a ${weapons[0]}, with a ${weapons[1]} kept close at hand`;
    sentences.push(`${p.Subj} ${agree(p, "carries", "carry")} ${tail} — the tools of a trade that offers little room for the unarmed.`);
  }

  if (concept) sentences.push(String(concept).trim());

  return sentences.join(" ");
}
