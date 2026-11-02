/* Wrath & Glory threats, turned into hostiles this app can put on the board.

   Wrath & Glory is a d6 dice-pool game; this app plays on d100 with Rogue
   Trader numbers. Nothing in wgsource.js can be used at the table until it is
   converted, and there is no exact conversion, so this file does it by a
   handful of plain rules, all named below, so anyone who thinks a number is
   wrong knows which rule to argue with and can change it in one place.

   The rules were chosen to land where the app's own antagonist tiers already
   sit (encounters.js, npcgen.js THREAT_TIERS) rather than to be faithful to
   the dice: a Cultist should come out as a Minor, a Bloodletter as an Elite,
   and the book's own Threat tiers (Troop, Elite, Adversary, by party Tier)
   say which of the app's four tiers a creature belongs to.

     characteristic  10 x attribute + 5, to 95   (an average human, 3, is 35)
     Toughness Bonus the Toughness attribute itself (3 for a human, as the app
                     already has it; a greater daemon's 10+ is a heavy soak)
     Armour          the book's AR; a daemon, which has none, has none
     Wounds          x 2   (the book's 5, 8 and 10 for a Cultist, Demagogue and
                     Bloodletter become 10, 16 and 20, the top of the Minor,
                     Heavy and Elite bands)
     WS / BS         15 + 4.5 x the dice pool; a pool the creature does not
                     use (no gun, no blade) is left at 0, as a dash is
     damage          1d10 + (damage - 3 + half the ED, rounded down); AP is Pen
     range           2.5 x the long range, to 5 m
     Fear            the DN of its Fear test, to a rating of 1-4
     tier            the mean of its Threat letters (T 1, E 2, A 3) by party
                     Tier, banded: under 1.4 Low, under 2.2 Moderate, under 2.8
                     High, else Lethal

   An engine (the book prints those as vehicles, with no attributes, no skills
   and no Threat tier) is a Toughness Bonus 8 body whose Resilience above that
   is armour, that shoots and strikes as 40 because the book gives no crew
   skill, and whose tier comes from its Wounds.

   Pure: see wgconvert.check.mjs. */

import { WG_THREATS, WG_BOOK } from './wgsource.js';

export { WG_BOOK };

export const RULES = {
  WOUND_FACTOR: 2,
  CHAR_BASE: 5, CHAR_STEP: 10, CHAR_CAP: 95,
  SKILL_BASE: 15, SKILL_STEP: 4.5, SKILL_MIN: 10, SKILL_MAX: 95,
  DAMAGE_BASE: 3,
  RANGE_FACTOR: 2.5,
  ENGINE_TB: 8, ENGINE_SKILL: 40
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export const charOf = (attr) => clamp(RULES.CHAR_STEP * attr + RULES.CHAR_BASE, 5, RULES.CHAR_CAP);
export const skillPct = (pool) => clamp(Math.round(RULES.SKILL_BASE + RULES.SKILL_STEP * pool), RULES.SKILL_MIN, RULES.SKILL_MAX);
export const damageBonus = (dmg, ed) => Math.max(0, dmg - RULES.DAMAGE_BASE + Math.floor(ed / 2));
export const rangeMetres = (long) => Math.max(5, Math.round((long * RULES.RANGE_FACTOR) / 5) * 5);
export const fearRating = (dn) => (dn > 0 ? clamp(dn, 1, 4) : 0);

/* ------------------------------ threat tiers ------------------------------ */

const WEIGHT = { T: 1, E: 2, A: 3 };
export const threatScore = (threat) => {
  const letters = String(threat || '').split('|').filter(Boolean);
  if (!letters.length) return 0;
  return letters.reduce((s, l) => s + (WEIGHT[l] || 0), 0) / letters.length;
};
// The bestiary's 1-4 (Low to Lethal) and npcgen's four tiers, from one score.
export const tierOf = (score) => (score < 1.4 ? 1 : score < 2.2 ? 2 : score < 2.8 ? 3 : 4);
export const tierIdOf = (score) => ['minor', 'minor', 'heavy', 'elite', 'named'][tierOf(score)];
// An engine has no Threat letters: its Wounds stand in for them.
export const engineTier = (wounds) => (wounds >= 24 ? 4 : wounds >= 14 ? 3 : 2);

/* ------------------------------ weapons ------------------------------ */

const isRanged = (w) => Boolean(w && w.r && (w.r.length === 3 || w.r[0] > 4));

// The kind of damage, which the book does not have and Rogue Trader does.
export function damageType(name, ranged) {
  const n = String(name).toLowerCase();
  if (/bolt|inferno|boltgun|hellfire|ectoplasma|autocannon|havoc|cannon/.test(n) && ranged) {
    return /plasma|melta|las|fire|flame|ecto|magma/.test(n) ? 'E' : 'X';
  }
  if (/plasma|melta|lascannon|flamer|fire|flame|warpflame|coruscating|magma|baleflamer|pistol.*las|sonic|euphonic|melody|blast/.test(n)) return 'E';
  if (ranged) return 'I';
  if (/\b(?:fist|fists|hammer|crozius|stave|forcestave|staff|crushing|horn|axle)\b/.test(n)) return 'I';
  return 'R';
}

// The book's weapon traits that have a plain Rogue Trader name. The rest stay
// in the note, for the GM to apply by hand.
const TRAIT_MAP = [
  [/^Parry$/i, 'Balanced'],
  [/^Flamer$/i, 'Flame'],
  [/^Blast \((\d+)\)$/i, (m) => `Blast (${m[1]})`],
  [/^Inflict \(Poison/i, 'Toxic']
];
export function qualitiesOf(traits) {
  const out = [];
  for (const t of traits || []) {
    for (const [re, to] of TRAIT_MAP) {
      const m = String(t).trim().match(re);
      if (m) { out.push(typeof to === 'function' ? to(m) : to); break; }
    }
  }
  return [...new Set(out)];
}

export function weaponString(w) {
  const ranged = isRanged(w);
  const bits = [];
  if (ranged) bits.push(`${rangeMetres(w.r[w.r.length - 1])}m`);
  const bonus = damageBonus(w.d, w.e);
  bits.push(`1d10${bonus ? `+${bonus}` : ''} ${damageType(w.n, ranged)}`);
  if (w.ap) bits.push(`Pen ${w.ap}`);
  const q = qualitiesOf(w.t);
  if (q.length) bits.push(q.join(', '));
  return `${w.n} (${bits.join('; ')})`;
}

// The weapon it fights with: the hardest hitter it has. The others are named.
const power = (w) => w.d + w.e;
const unmounted = (w) => !(w.t || []).some((x) => /^Mounted/i.test(x));
export function primaryWeapon(weps) {
  const list = (weps || []).filter(unmounted);
  const pool = list.length ? list : weps || [];
  return pool.slice().sort((a, b) => power(b) - power(a))[0] || null;
}

/* ------------------------------ the entry ------------------------------ */

// Titles that mean something only to the Wrath & Glory rules (Ruin, Champions,
// the Marks and implants that are already in the numbers).
const BOOK_ONLY = new Set([
  'architect of ruin', 'champion', 'mark of chaos', 'space marine implants', 'herald of ruin',
  'daemonic machine spirit', 'devotion', 'warp touched', 'frightful form'
]);

const FACTION = {
  mortal: 'Heretics and cultists', astartes: 'Heretic Astartes', tzeentch: 'Daemons of Tzeentch',
  nurgle: 'Daemons of Nurgle', khorne: 'Daemons of Khorne', slaanesh: 'Daemons of Slaanesh',
  engine: 'Chaos engines'
};
export const FACTIONS = Object.entries(FACTION).map(([id, name]) => ({ id, name }));

const SIZE_NOTE = { tiny: 'Tiny', average: null, large: 'Large', huge: 'Huge', gargantuan: 'Gargantuan' };

export function convertThreat(src) {
  const engine = src.kind === 'engine';
  const weps = src.weps || [];
  const main = primaryWeapon(weps);
  const ranged = weps.some(isRanged);
  const melee = weps.some((w) => !isRanged(w));
  const score = engine ? 0 : threatScore(src.threat);
  const tier = engine ? engineTier(src.def.wounds) : tierOf(score);

  let stats;
  if (engine) {
    const res = src.def.resilience;
    stats = {
      ws: melee ? RULES.ENGINE_SKILL : 0, bs: ranged ? RULES.ENGINE_SKILL : 0,
      s: 0, t: 0, ag: 0, int: 0, per: 0, wp: 0, fel: 0,
      wounds: src.def.wounds * RULES.WOUND_FACTOR,
      toughnessBonus: RULES.ENGINE_TB, armour: Math.max(0, res - RULES.ENGINE_TB)
    };
  } else {
    const [S, T, A, I, Wil, Int, Fel] = src.attr;
    const sk = src.skills;
    const base = sk.def != null ? sk.def : 3;
    stats = {
      // A creature whose only attack is borrowed (the Changeling's staff copies
      // whatever weapon it has seen) fights as well as its dice say, either way.
      ws: melee || sk.ws != null || src.weaponNote ? skillPct(sk.ws != null ? sk.ws : base) : 0,
      bs: ranged || src.weaponNote ? skillPct(sk.bs != null ? sk.bs : base) : 0,
      s: charOf(S), t: charOf(T), ag: charOf(A), int: charOf(Int), per: charOf(I), wp: charOf(Wil), fel: charOf(Fel),
      wounds: src.def.wounds * RULES.WOUND_FACTOR,
      toughnessBonus: T, armour: src.def.ar
    };
  }

  const others = weps.filter((w) => w !== main).map((w) => weaponString(w));
  const titles = [...new Set((src.titles || []).filter((t) => !BOOK_ONLY.has(t.toLowerCase())
    && !weps.some((w) => w.n.toLowerCase() === t.toLowerCase())))];
  const bits = [];
  if (src.fear) bits.push(`Fear (${fearRating(src.fear)})`);
  if (src.kw && src.kw.includes('DAEMON')) bits.push('Daemon');
  if (src.cv.fly) bits.push('Flies');
  bits.push(...titles);
  // Two more are plenty to read on the board; a Helbrute has seven arms to
  // choose from, and the page it is on matters more than all of them.
  if (others.length) {
    const shown = others.slice(0, 2);
    if (others.length > 2) shown.push(`${others.length - 2} more in the book`);
    bits.push(`Also: ${shown.join('. ')}`);
  }

  // The book spells the same trait two ways ("Unwieldy (2)", "Unwieldy(2)").
  const traitAll = [...new Set(weps.flatMap((w) => w.t || []).map((t) => t.replace(/\s*\(/, ' (').trim()))]
    .filter((t) => !qualitiesOf([t]).length);
  const traits = traitAll.slice(0, 4);
  if (traitAll.length > 4) traits.push('more in the book');
  const size = SIZE_NOTE[src.cv.size];
  const note = [
    src.role,
    `Converted from ${WG_BOOK}, p.${src.page}${src.threat ? `; Threat ${src.threat}` : '; no Threat tier given, set from its Wounds'}.`,
    size ? `Size: ${size}.` : null,
    traits.length ? `Book weapon traits to apply by hand: ${traits.join(', ')}.` : null,
    engine ? `Resilience ${src.def.resilience}; the book gives no crew skill, so 40 is assumed.` : null
  ].filter(Boolean).join(' ');

  return {
    name: src.name,
    group: 'chaos',
    faction: src.group,
    ...stats,
    agilityBonus: engine ? 0 : Math.floor(charOf(src.attr[2]) / 10),
    weapon: main ? weaponString(main) : (src.weaponNote || null),
    abilities: bits.join('. ') || null,
    armourNote: null,
    note,
    conflict: null,
    custom: false,
    threatTier: tier,
    tierId: engine ? ['minor', 'minor', 'heavy', 'elite', 'named'][tier] : tierIdOf(score),
    source: { book: WG_BOOK, page: src.page, threat: src.threat || null }
  };
}

export const CHAOS_THREATS = WG_THREATS.map(convertThreat);
