/* What a character's armour adds up to, location by location.

   The catalogue already says what each piece gives ("AP 4 · body, arms, legs",
   "AP 8 (9 body)", "AP 1 body (Good: AP 2) · stacks with worn armour"). Until
   now nothing read those lines for the sheet, so a character in flak armour
   and a helmet had no Armour Points to look at anywhere on it.

   The rule applied here, which is the one the catalogue's own wording implies:

     worn armour   does not stack. Where two pieces cover the same location the
                   better one counts and the other is spare. Gear that offers a
                   choice ("flak or carapace") is therefore safe to leave listed
                   until one is dropped.
     stacking kit  (sub-dermal armour, which the catalogue says "stacks with
                   worn armour") is added on top.
     bionic limbs  a Good limb is +1 AP to itself, but the sheet does not record
                   which side, so it is reported in `notes` rather than guessed
                   into a location.

   If your table rules that layers add, that is a GM call; the spare pieces are
   listed per location so the number is easy to adjust by hand.

   Pure: see armour.check.mjs. */

import { gearInfo } from './gear.js';

export const SLOTS = [
  { id: 'head', name: 'Head', short: 'HEAD' },
  { id: 'rarm', name: 'Right arm', short: 'R ARM' },
  { id: 'larm', name: 'Left arm', short: 'L ARM' },
  { id: 'body', name: 'Body', short: 'BODY' },
  { id: 'rleg', name: 'Right leg', short: 'R LEG' },
  { id: 'lleg', name: 'Left leg', short: 'L LEG' }
];
const ALL = SLOTS.map((s) => s.id);

const WORDS = [
  [/\ball\b/, ALL],
  [/\bhead\b/, ['head']],
  [/\bbody\b|\btorso\b/, ['body']],
  [/\barms?\b/, ['rarm', 'larm']],
  [/\blegs?\b/, ['rleg', 'lleg']]
];

// The locations a phrase names, in sheet order.
function coverOf(text) {
  const t = String(text || '').toLowerCase();
  const got = new Set();
  for (const [re, ids] of WORDS) if (re.test(t)) ids.forEach((id) => got.add(id));
  return ALL.filter((id) => got.has(id));
}

/* Reads one catalogue stats line. Null when it carries no "AP n".

     "AP 4 · body, arms, legs"                  cover in the next part
     "AP 7 all · +10 Strength"                  cover beside the number
     "AP 8 (9 body) · +20 Strength"             all of it, 9 on the body
     "AP 1 body (Good: AP 2) · stacks with ..." a stacker, 2 when Good

   Cover that is not stated at all is the whole body: a bare "AP 8" is a suit. */
export function parseArmour(stats) {
  const text = String(stats || '');
  const parts = text.split('·').map((s) => s.trim());
  const at = parts.findIndex((s) => /^AP\s*\d+/i.test(s));
  if (at < 0) return null;
  const head = parts[at];
  const ap = Number(head.match(/^AP\s*(\d+)/i)[1]);

  const overrides = {};
  for (const m of head.matchAll(/\((\d+)\s+(head|body|arms?|legs?)\)/gi)) {
    for (const id of coverOf(m[2])) overrides[id] = Number(m[1]);
  }
  const good = head.match(/\(Good:\s*AP\s*(\d+)\)/i);

  const inline = head.replace(/^AP\s*\d+/i, '').replace(/\([^)]*\)/g, ' ');
  let covers = coverOf(inline);
  if (!covers.length) covers = coverOf(parts[at + 1]);
  if (!covers.length) covers = ALL.slice();

  return {
    ap, covers, overrides,
    stacks: /stacks with worn armour/i.test(text),
    goodAp: good ? Number(good[1]) : null
  };
}

const ARMOUR_KINDS = new Set(['Armour', 'Power Armour', 'Bionic']);
const BETTER = new Set(['good', 'best']);

/* Everything on the sheet that gives Armour Points, resolved. `labels` is the
   whole gear list as the sheet shows it (issued kit still held, plus anything
   added), so the number follows what is actually listed.

   Returns
     slots   one per location: { id, name, short, ap, from, spare }
               from  the labels that make up ap (the best piece, then stackers)
               spare labels covering it that are not counted
     pieces  each armour piece: { label, ap, covers, stacks, counted }
     bodyAp  the headline number
     notes   things worth saying that are not in a number                    */
export function armourSummary(labels) {
  const pieces = [];
  const notes = [];
  for (const label of labels || []) {
    const { entry, quality } = gearInfo(label);
    if (!entry || !ARMOUR_KINDS.has(entry.kind)) continue;
    const a = parseArmour(entry.stats);
    if (!a) {
      if (entry.kind === 'Bionic' && /\+1 AP/i.test(entry.stats || '') && BETTER.has(quality)) {
        notes.push(`${label}: +1 AP on that limb. Add it to the right side by hand; the sheet does not record which.`);
      }
      continue;
    }
    // A stacker's own grade sets its number; a worn piece's craftsmanship is a
    // matter of feel in the book, not a figure.
    const ap = a.stacks && BETTER.has(quality) && a.goodAp != null ? a.goodAp : a.ap;
    pieces.push({ label, ap, covers: a.covers, overrides: a.overrides, stacks: a.stacks, counted: false });
  }

  const slots = SLOTS.map((slot) => {
    const worn = pieces.filter((p) => !p.stacks && p.covers.includes(slot.id));
    const valueOf = (p) => (p.overrides[slot.id] != null ? p.overrides[slot.id] : p.ap);
    let best = null;
    for (const p of worn) if (!best || valueOf(p) > valueOf(best)) best = p;
    const stackers = pieces.filter((p) => p.stacks && p.covers.includes(slot.id));
    const from = [];
    let total = 0;
    if (best) { total += valueOf(best); from.push(best.label); best.counted = true; }
    for (const p of stackers) { total += p.ap; from.push(p.label); p.counted = true; }
    return {
      ...slot, ap: total, from,
      spare: worn.filter((p) => p !== best).map((p) => p.label)
    };
  });

  return {
    slots, pieces, notes,
    bodyAp: slots.find((s) => s.id === 'body').ap,
    any: pieces.length > 0
  };
}

// What a hit has to get through: armour and Toughness Bonus together, per location.
export const soakAt = (slot, toughnessBonus) => (slot ? slot.ap : 0) + (Number(toughnessBonus) || 0);
