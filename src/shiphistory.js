// A voidship's personality: the Machine Spirit Oddity it has picked up, and
// the Past History it carries.
//
// Rogue Trader makes this Step 3 of starship creation — after the hull is
// chosen and BEFORE components are bought, because some results change what
// the ship can afford. Fantasy Flight's own Drydock aid lays the steps out
// that way:
//
//   1. Determine Ship Points        4. Selecting Essential Components
//   2. Select starship hull         5. Selecting Supplemental Components
//   3. DEVELOPING PERSONALITY
//
// The twenty entries below are Table 8-1 (Machine Spirit Oddities, Core
// Rulebook p. 197) and Table 8-2 (Past Histories, p. 198), with the roll
// numbers as printed. Both tables are 1d10.
//
// WHAT IS MISSING, AND WHY IT IS BLANK RATHER THAN GUESSED: the NAMES and
// roll numbers here are quoted from Drydock, which is an official FFG
// supplement. Drydock is a cheat sheet, so it prints the names and points
// back at pp. 197-198 for what each one DOES. Those effects are not online
// in any form worth trusting — the fan transcriptions that exist disagree
// with each other on the numbers and even on the spelling ("Wrothful" vs
// "Wrathful"). This app states its rules as printed everywhere else, so an
// invented modifier would be worse than an honest gap: a GM reading
// "Stoic: -1 Profit Factor" off this screen has no way to know it came from
// a forum post rather than the book.
//
// So `effect` is empty, and the UI shows the name with its page reference —
// which is exactly what Drydock itself does, and is usable with the book
// open. Filling `effect` in is a pure data edit; `mechanical` is the hook
// for the ones that actually move a number (ship.js's budget already has
// everywhere such a modifier would need to land).

const ODDITY_PAGE = 197;
const HISTORY_PAGE = 198;

// roll: as printed on the 1d10 table. effect: the printed text, once sourced.
// mechanical: a patch the builder can apply, for the entries that carry one.
const entry = (roll, name, page) => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
  roll, name, page, effect: '', mechanical: null
});

/* ---- Table 8-1: Machine Spirit Oddities (Core Rulebook p. 197) ---- */

export const MACHINE_SPIRIT_ODDITIES = [
  entry(1, 'A Nose for Trouble', ODDITY_PAGE),
  entry(2, 'Blasphemous Tendencies', ODDITY_PAGE),
  entry(3, 'Martial Hubris', ODDITY_PAGE),
  entry(4, 'Rebellious', ODDITY_PAGE),
  entry(5, 'Stoic', ODDITY_PAGE),
  entry(6, 'Skittish', ODDITY_PAGE),
  entry(7, 'Wrothful', ODDITY_PAGE),
  entry(8, 'Resolute', ODDITY_PAGE),
  entry(9, 'Adventurous', ODDITY_PAGE),
  entry(10, 'Ancient and Wise', ODDITY_PAGE)
];

/* ---- Table 8-2: Past Histories (Core Rulebook p. 198) ---- */

export const PAST_HISTORIES = [
  entry(1, 'Reliquary of Mars', HISTORY_PAGE),
  entry(2, 'Haunted', HISTORY_PAGE),
  entry(3, 'Emissary of the Imperator', HISTORY_PAGE),
  entry(4, 'Wolf in Sheep’s Clothing', HISTORY_PAGE),
  entry(5, 'Turbulent Past', HISTORY_PAGE),
  entry(6, 'Death Cult', HISTORY_PAGE),
  entry(7, 'Wrested from a Space Hulk', HISTORY_PAGE),
  entry(8, 'Temperamental Warp Engine', HISTORY_PAGE),
  entry(9, 'Finances in Arrears', HISTORY_PAGE),
  entry(10, 'Xenophilous', HISTORY_PAGE)
];

/* ---- lookup and rolling ---- */

const byId = (table) => (id) => table.find((e) => e.id === id) || null;
export const oddityById = byId(MACHINE_SPIRIT_ODDITIES);
export const historyById = byId(PAST_HISTORIES);

// A roll outside 1-10 is a caller bug rather than a table gap, so it comes
// back null instead of silently landing on the nearest entry.
const byRoll = (table) => (roll) => table.find((e) => e.roll === Number(roll)) || null;
export const oddityForRoll = byRoll(MACHINE_SPIRIT_ODDITIES);
export const historyForRoll = byRoll(PAST_HISTORIES);

// Dice injected, as everywhere else in this app, so the roll is testable and
// the server can roll it when a GM rolls a ship for the table.
export const EMPTY_HISTORY = { oddityId: null, historyId: null };

export function rollShipPersonality(d10 = () => 1 + Math.floor(Math.random() * 10)) {
  const oddity = oddityForRoll(d10());
  const history = historyForRoll(d10());
  return {
    oddityId: oddity ? oddity.id : null,
    historyId: history ? history.id : null
  };
}

// Anything absent is defaulted rather than trusted: a blueprint saved before
// this existed arrives without the field, same rule as readBlueprint's.
export const readHistory = (h) => ({
  oddityId: (h && oddityById(h.oddityId)) ? h.oddityId : null,
  historyId: (h && historyById(h.historyId)) ? h.historyId : null
});

// What the sheet prints for a ship. An unrolled ship says so rather than
// rendering two blanks.
export function describeHistory(h) {
  const { oddityId, historyId } = readHistory(h);
  const o = oddityById(oddityId);
  const p = historyById(historyId);
  if (!o && !p) return null;
  return {
    oddity: o, history: p,
    line: [o && o.name, p && p.name].filter(Boolean).join(' · ')
  };
}
