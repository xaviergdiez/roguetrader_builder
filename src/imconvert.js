/* Imperium Maledictum antagonists, turned into hostiles for this app.

   Imperium Maledictum is a d100 game with the same nine characteristics as
   Rogue Trader (WS, BS, S, T, Ag, Int, Per, WP, Fel), and an ordinary person
   sits at 30-40 in both, so almost everything carries across as it is. That is
   why this file is short, and why it can be compared with wgconvert.js, which
   had to turn a d6 dice pool into percentiles and does not do it as well. The
   few rules, each named below so one number is one change:

     characteristics  as printed
     Toughness Bonus  the tens digit of Toughness
     Wounds           as printed (Imperium Maledictum’s run 12-25 for the people
                      here, where this app’s tiers run 8-28)
     Armour           the printed figure; a "1d5+2" daemon is 2 + 3 (the die’s
                      average, rounded up), so 5
     WS / BS          the skill the creature attacks WITH, which the book prints
                      as a percentile already, taking the best melee and the
                      best ranged; 0 where it has no such attack
     damage           1d10 + (printed damage - 3), the way a printed "6 + SL"
                      lasgun lands near this app’s 1d10+3; Penetrating (n) is Pen n
     range            Short 20 m, Medium 40 m, Long 80 m
     Fear             a Source of Corruption (witnessing it costs Corruption) is
                      Fear (1), or Fear (2) for a daemon
     tier             Troop is Low, Elite Moderate, Leader High; a Leader with 24
                      Wounds or 6 Critical Wounds or more is Lethal

   Pure: see imconvert.check.mjs. */

import { IM_THREATS, IM_BOOK } from './imsource.js';

export { IM_BOOK };

export const IM_RULES = {
  DAMAGE_BASE: 3,
  RANGE_M: { Short: 20, Medium: 40, Long: 80 },
  DEFAULT_RANGE_M: 40,
  LETHAL_WOUNDS: 24, LETHAL_CRITICAL: 6
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export const charOf = (v) => clamp(Math.round(Number(v) || 0), 5, 95);
export const toughnessBonusOf = (tgh) => Math.floor(Number(tgh) / 10);
// A "1d5+2" is a base of 2 plus the average of the die, rounded up.
export const armourOf = ({ base = 0, die = 0 } = {}) => base + (die ? Math.ceil(die / 2) : 0);
export const damageBonus = (n) => Math.max(0, Math.round(Number(n) || 0) - IM_RULES.DAMAGE_BASE);
export const rangeMetres = (band) => IM_RULES.RANGE_M[band] || IM_RULES.DEFAULT_RANGE_M;

const TIERS = { Troop: 1, Elite: 2, Leader: 3 };
export const tierOf = (cls, wounds = 0, crit = 0) => {
  const t = TIERS[cls] || 2;
  return t === 3 && (wounds >= IM_RULES.LETHAL_WOUNDS || crit >= IM_RULES.LETHAL_CRITICAL) ? 4 : t;
};
export const tierIdOf = (tier) => ['minor', 'minor', 'heavy', 'elite', 'named'][tier];

/* ------------------------------ attacks ------------------------------ */

const kindOf = (a) => (/^Melee/i.test(a.skill) ? 'ws'
  : /^Ranged/i.test(a.skill) ? 'bs'
    : /^Psychic/i.test(a.skill) ? (a.rng ? 'bs' : 'ws') : 'ws');

// The kind of damage, which the book does not have and Rogue Trader does.
export function damageType(name, kind) {
  const n = String(name).toLowerCase();
  if (/lasgun|wraithcannon|d-scythe|plasma|blast pistol|baleblast|flames|gaze/.test(n)) return 'E';
  if (/bolt/.test(n)) return 'X';
  if (kind === 'bs') return 'I';
  if (/fist|goad|grasp/.test(n)) return 'I';
  return 'R';
}

// What each of the book’s weapon traits is called here, where it has a name.
export function qualitiesOf(traits) {
  const out = [];
  for (const t of traits || []) {
    const s = String(t).trim();
    if (/^Reliable$/i.test(s)) out.push('Reliable');
    else if (/^Defensive$/i.test(s)) out.push('Balanced');
    else if (/^Spread$/i.test(s)) out.push('Scatter');
    else if (/^Blast$/i.test(s)) out.push('Blast');
  }
  return [...new Set(out)];
}
export const penOf = (traits) => {
  for (const t of traits || []) {
    const m = String(t).match(/^Penetrating \((\d+)\)$/i);
    if (m) return Number(m[1]);
  }
  return 0;
};

// A damaging attack. A psychic attack the book gives no damage for (Smite,
// a Telepath’s powers) is not a weapon; it is named in the abilities.
export const isWeapon = (a) => !(a.fixed && a.d === 0) && a.d > 0;

export function weaponString(a) {
  const kind = kindOf(a);
  const bits = [];
  if (kind === 'bs' && a.rng) bits.push(`${rangeMetres(a.rng)}m`);
  else if (kind === 'bs') bits.push(`${rangeMetres('Long')}m`);
  const b = damageBonus(a.d);
  bits.push(`1d10${b ? `+${b}` : ''} ${damageType(a.n, kind)}`);
  const pen = penOf(a.t);
  if (pen) bits.push(`Pen ${pen}`);
  const q = qualitiesOf(a.t);
  if (q.length) bits.push(q.join(', '));
  return `${a.n} (${bits.join('; ')})`;
}

const power = (a) => a.d + penOf(a.t);
export const primaryWeapon = (attacks) => (attacks || []).filter(isWeapon).sort((x, y) => power(y) - power(x))[0] || null;

/* ------------------------------ the entry ------------------------------ */

const FACTION = (src) => {
  const t = src.type || '';
  if (/Daemon/.test(t) || src.name === 'Daemonhost') return 'Daemon';
  if (/Genestealer/.test(t)) return 'Genestealer Cult';
  if (/Kroot/.test(t)) return 'Kroot';
  if (/Drukhari/.test(t)) return 'Drukhari';
  if (/Votann|Aeldari/.test(t)) return 'Xenos';
  return 'Heretic';
};

export function convertThreat(src) {
  const [ws, bs, str, tgh, ag, int, per, wil, fel] = src.chars;
  const weapons = (src.attacks || []).filter(isWeapon);
  // Only a damaging attack sets Weapon or Ballistic Skill: a Telepath’s 95 in
  // Psychic Mastery is not a gun.
  const bestOf = (kind) => Math.max(0, ...weapons.filter((a) => kindOf(a) === kind).map((a) => a.v));
  const main = primaryWeapon(src.attacks);
  const others = weapons.filter((a) => a !== main).map(weaponString);
  const psychic = (src.attacks || []).filter((a) => !isWeapon(a)).map((a) => a.n);

  const hasWs = weapons.some((a) => kindOf(a) === 'ws');
  const hasBs = weapons.some((a) => kindOf(a) === 'bs');
  const tier = tierOf(src.cls, src.wounds, src.crit);

  const bits = [];
  if (src.traits.includes('Source of Corruption')) bits.push(`Fear (${FACTION(src) === 'Daemon' ? 2 : 1})`);
  if (FACTION(src) === 'Daemon') bits.push('Daemon');
  if (src.fly) bits.push('Flies');
  bits.push(...src.traits.filter((t) => t !== 'Source of Corruption'));
  if (psychic.length) bits.push(`Psychic: ${psychic.join(', ')}`);
  if (others.length) {
    const shown = others.slice(0, 2);
    if (others.length > 2) shown.push(`${others.length - 2} more in the book`);
    bits.push(`Also: ${shown.join('. ')}`);
  }

  const traitAll = [...new Set(weapons.flatMap((a) => a.t || []))]
    .filter((t) => !qualitiesOf([t]).length && !/^Penetrating/.test(t));
  const traits = traitAll.slice(0, 4);
  if (traitAll.length > 4) traits.push('more in the book');

  const note = [
    src.role,
    `Converted from ${IM_BOOK}, p.${src.page}; ${src.cls}.`,
    src.size && src.size !== 'Medium' ? `Size: ${src.size}.` : null,
    traits.length ? `Book weapon traits to apply by hand: ${traits.join(', ')}.` : null,
    src.note || null
  ].filter(Boolean).join(' ');

  return {
    name: src.name,
    group: 'im_inq',
    faction: FACTION(src),
    ws: hasWs ? charOf(bestOf('ws')) : 0,
    bs: hasBs ? charOf(bestOf('bs')) : 0,
    s: charOf(str), t: charOf(tgh), ag: charOf(ag), int: charOf(int), per: charOf(per), wp: charOf(wil), fel: charOf(fel),
    wounds: src.wounds,
    toughnessBonus: toughnessBonusOf(tgh),
    armour: armourOf(src.armour),
    agilityBonus: Math.floor(ag / 10),
    weapon: main ? weaponString(main) : null,
    abilities: bits.join('. ') || null,
    armourNote: null,
    note,
    conflict: null,
    // No damaging attack in the book (the Murmurer works through other people’s
    // bodies): the GM adjudicates it, and the board says so.
    custom: !main,
    threatTier: tier,
    tierId: tierIdOf(tier),
    source: { book: IM_BOOK, page: src.page, class: src.cls }
  };
}

export const IM_CONVERTED = IM_THREATS.map(convertThreat);
