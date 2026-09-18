// The Rogue Trader Acquisition test: what a dynasty can GET, not what it can
// pay.
//
// PROFIT FACTOR IS THE CURRENCY. Rogue Trader deliberately keeps no coin on
// the character sheet — a dynasty's means are one number, and buying is a
// test against it rather than a subtraction from it. So the Throne prices the
// tables print are not a wallet here. They are converted into the test's
// SCALE modifier, because what decides a purchase is the price measured
// against the buyer: ten thousand Thrones is a rounding error at Profit
// Factor 80 and a year's work at Profit Factor 5.
//
//   target = Profit Factor
//          + Availability    how hard the thing is to find at all
//          + Scale           the price, against what the dynasty can raise
//          + Craftsmanship   better made is harder to source
//          + standing        a requisition route, an owed favour, a bribe
//
// Failure does not mean "roll again next round": the thing is not to be had
// here, and when that changes is the GM's call. Success on something of real
// significance costs Profit Factor until the endeavour ends, which is as
// close as this system comes to spending money.

import { resolveTest } from './dice.js';

/* ------------------------------ availability ------------------------------ */

export const AVAILABILITY = [
  { rating: 'Ubiquitous', mod: 50 },
  { rating: 'Abundant', mod: 30 },
  { rating: 'Plentiful', mod: 20 },
  { rating: 'Common', mod: 10 },
  { rating: 'Average', mod: 0 },
  { rating: 'Scarce', mod: -10 },
  { rating: 'Rare', mod: -20 },
  { rating: 'Very Rare', mod: -30 },
  { rating: 'Extremely Rare', mod: -40 },
  { rating: 'Near Unique', mod: -50 },
  { rating: 'Unique', mod: -60 }
];

export const availabilityMod = (rating) => {
  const hit = AVAILABILITY.find((a) => a.rating === rating);
  return hit ? hit.mod : 0;
};

// One step rarer, for a better-made version of the same article. Kept here
// because it is a fact about the ladder, not about any one item.
export function rarer(rating, steps = 1) {
  const i = AVAILABILITY.findIndex((a) => a.rating === rating);
  if (i === -1) return rating;
  return AVAILABILITY[Math.min(AVAILABILITY.length - 1, i + Math.max(0, steps))].rating;
}

/* --------------------------------- scale ---------------------------------
   THE BRIDGE FROM THRONES TO PROFIT FACTOR. A price alone says nothing; the
   ratio of price to means says everything. One point of Profit Factor is
   taken as a hundred Thrones of spending nobody notices, so a PF 20 dynasty
   moves 2,000 Thrones without comment, and the bands below fall out of that.

   Change YARDSTICK and the whole economy tightens or loosens with one number,
   which is the point of keeping it here rather than baked into the bands. */

export const YARDSTICK = 100;

export const SCALE = [
  { id: 'negligible', name: 'Negligible', mod: 30, upTo: 0.1 },
  { id: 'trivial', name: 'Trivial', mod: 20, upTo: 0.5 },
  { id: 'minor', name: 'Minor', mod: 10, upTo: 1 },
  { id: 'standard', name: 'Standard', mod: 0, upTo: 3 },
  { id: 'major', name: 'Major', mod: -10, upTo: 8 },
  { id: 'vast', name: 'Vast', mod: -30, upTo: Infinity }
];

export const scaleById = (id) => SCALE.find((s) => s.id === id) || null;

/* ---------------------------- scale by quantity ----------------------------
   Rogue Trader prints no Throne price for most equipment, and for one rifle
   the price was never the question — the question is HOW MANY. So Scale has a
   second face: buying one lasgun is Negligible, arming a regiment with them
   is Vast, and the same availability rating sits behind both.

   The modifiers come off SCALE rather than being restated, so there is one
   ladder in this file and not two that can drift apart. */

const QUANTITY_WORDS = {
  negligible: ['One', 'a single personal item'],
  trivial: ['A handful', 'two to five'],
  minor: ['A squad', 'six to twenty'],
  standard: ['A company', 'a hundred, or an away team fully kitted'],
  major: ['A regiment', 'a thousand'],
  vast: ['A crusade', 'ten thousand and upward']
};

export const QUANTITY = SCALE.map((s) => ({
  id: s.id,
  mod: s.mod,
  name: QUANTITY_WORDS[s.id][0],
  detail: QUANTITY_WORDS[s.id][1]
}));

export const quantityById = (id) => QUANTITY.find((q) => q.id === id) || QUANTITY[0];

export function scaleFor(price, profitFactor) {
  const p = Math.max(0, Math.floor(Number(price) || 0));
  if (!p) return { ...SCALE[0], ratio: 0 };
  // A dynasty with no Profit Factor still has one point of means, or every
  // purchase divides by zero and reads as Vast.
  const means = Math.max(1, Math.floor(Number(profitFactor) || 0)) * YARDSTICK;
  const ratio = p / means;
  return { ...(SCALE.find((s) => ratio <= s.upTo) || SCALE[SCALE.length - 1]), ratio };
}

// Buying something of real significance costs Profit Factor until the
// endeavour ends. Small purchases cost nothing — they are noise against a
// dynasty's income, and tracking them is what Profit Factor exists to avoid.
export const PF_COST = { major: 1, vast: 2 };
export const pfCost = (scaleId) => PF_COST[scaleId] || 0;

/* ----------------------------- craftsmanship -----------------------------
   Better made is harder to source. Not applied to items whose rating already
   accounts for the grade — see augmetics.js, where the table states the
   Good-grade article's rarity outright and stepping it again would charge
   twice for the same thing. */

export const CRAFTSMANSHIP = { Poor: 10, Common: 0, Good: -10, Best: -30 };
export const craftsmanshipMod = (grade) => CRAFTSMANSHIP[grade] || 0;

/* --------------------------------- standing ---------------------------------
   An institution will issue what it will not sell. A Missionary's Order, an
   Inquisitorial writ, a debt someone owes the dynasty: none of it lowers the
   price, and all of it opens a door that money alone does not. */

export const STANDING = 30;

/* ------------------------------- the test ------------------------------- */

export function acquisitionTarget({
  profitFactor = 0, availability = 'Average', price = 0, scale: scaleId = null,
  craftsmanship = null, standing = false, modifier = 0
} = {}) {
  const pf = Math.floor(Number(profitFactor) || 0);
  // Named scale wins over a derived one: a price implies a scale, but a
  // quantity states it outright, and most equipment has no printed price.
  const scale = scaleId
    ? { ...(scaleById(scaleId) || SCALE[0]), ratio: null }
    : scaleFor(price, pf);
  const parts = [{ label: 'Profit Factor', value: pf }];
  const add = (label, value) => { if (value) parts.push({ label, value }); };

  add(availability, availabilityMod(availability));
  add(scale.name + ' scale', scale.mod);
  if (craftsmanship) add(craftsmanship + ' craftsmanship', craftsmanshipMod(craftsmanship));
  if (standing) add('standing', STANDING);
  add('circumstance', Math.floor(Number(modifier) || 0));

  return {
    target: parts.reduce((n, p) => n + p.value, 0),
    parts,
    scale,
    pfCost: pfCost(scale.id)
  };
}

// The roll. Reuses the d100 ladder every other test on the sheet uses, so
// 01-05 still succeeds against an impossible target and 96-00 still fails
// against a certain one — which is the only reason a relic is ever acquired.
export function attempt(target, roll, { scale = null } = {}) {
  const test = resolveTest(0, target.target != null ? target.target : target, roll);
  const band = scale || (target && target.scale) || null;
  return {
    ...test,
    pfCost: test.success ? pfCost(band && band.id) : 0,
    // Extra degrees are the GM's to spend: a better craftsmanship, a spare, a
    // shorter wait. Reported rather than applied.
    surplus: test.success ? test.degrees : 0
  };
}

export const describe = (t) => t.parts
  .map((p, i) => (i === 0 ? String(p.value)
    : (p.value > 0 ? ' + ' : ' − ') + Math.abs(p.value) + ' ' + p.label.toLowerCase()))
  .join('');
