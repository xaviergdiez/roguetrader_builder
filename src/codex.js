/* The Lore tab's catalogue: the rules the app already knows, in one place that
   players and the GM can both read.

   Nothing here is typed in a second time. Every number and every line of
   effect text is read off the table the app itself plays by (the combat
   actions, the conditions, the critical damage tables, the Shock table, the
   psychic modes, the ship actions), so the page a player reads can never say
   something the dice roller does not do. The few lines of connecting prose are
   marked as such in codex.check.mjs, which also checks the figures they quote
   against the code.

   These are plain-language summaries for the table, not the rulebook's own
   wording: the panel says so, as the glossary does.

   Nothing GM-only goes in. No bestiary, no encounter, no hidden ship state:
   this is a book, not a screen.

   Pure: see codex.check.mjs. */

import { SKILLS, TALENTS, MISC, POWERS } from './glossary.js';
import { DIFFICULTIES } from './dice.js';
import { ACTIONS, GROUND_CONDITIONS } from './groundcombat.js';
import { LOCATIONS, DAMAGE_TYPES, critRow, CRIT_MAX } from './crits.js';
import {
  FEAR_LEVELS, SHOCK_TABLE, TRAUMA_TABLE, DISORDER_AT, INSANITY_STEP, MALIGNANCY_STEP, MUTATION_STEP,
  insanityTrack, corruptionTrack
} from './sanity.js';
import { MODES, PSY_RATINGS, DISCIPLINES, MAX_PUSH } from './psychic.js';
import {
  PHASES, PHASE_LABELS, EXTENDED_ACTIONS, EVASION_CAP, REFERENCE_ACTIONS, MANOEUVRES, TURN_LIMITS,
  RANGE_MODIFIERS, DEGREES_PER_LANCE_HIT
} from './voidcombat.js';
import { HULLS, HULL_GROUPS, SP_RESERVE, hullGroup, ESSENTIAL_CATEGORIES } from './ship.js';
import { PROW_WIDE } from './voidmap.js';
import { roleById } from './shiproles.js';

export const CODEX_NOTE = 'Plain-language summaries written for this table, not the rulebook’s own wording. '
  + 'Check the core book before ruling on an edge case.';

const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
const modText = (m, what) => (m ? `${signed(m)} to ${what}` : `no modifier to ${what}`);
const actionKind = { half: 'Half action', full: 'Full action', reaction: 'Reaction', variable: 'Varies' };

/* ------------------------------ sections ------------------------------ */

export const SECTIONS = [
  { id: 'tests', title: 'Tests', blurb: 'Rolling the d100, degrees, and how hard a thing is.' },
  { id: 'combat', title: 'Combat', blurb: 'Actions, movement, hit location and critical damage.' },
  { id: 'conditions', title: 'Conditions', blurb: 'Pinned, Stunned, On Fire and the rest, and what each does.' },
  { id: 'crits', title: 'Critical damage', blurb: 'The tables, by damage type and where the hit landed.' },
  { id: 'mind', title: 'Fear and insanity', blurb: 'Fear tests, the Shock table, and the Insanity track.' },
  { id: 'psychic', title: 'Psychic powers', blurb: 'Manifesting, Psy Rating, and the disciplines.' },
  { id: 'void', title: 'Void combat', blurb: 'The ship turn, manoeuvres, shooting, and what each station can do.' },
  { id: 'building', title: 'Building a voidship', blurb: 'The five steps, power and space, and which hulls take what.' },
  { id: 'skills', title: 'Skills', blurb: 'What each skill is for.' },
  { id: 'talents', title: 'Talents and powers', blurb: 'What each talent and special power does.' }
];

/* ------------------------------ entries ------------------------------ */

// { id, section, title, tag, body, rows: [[label, text], ...] }
const E = (section, id, title, tag, body, rows = []) => ({ id: `${section}:${id}`, section, title, tag, body, rows });

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Names for the flags a critical row carries, so a row reads as a sentence.
function critNote(r) {
  const bits = [];
  if (r.fatigue) bits.push(`${r.fatigue} Fatigue`);
  if (r.stun) bits.push(`Stunned ${r.stun} round${r.stun === '1' ? '' : 's'}`);
  if (r.prone) bits.push('knocked Prone');
  if (r.blood) bits.push('Blood Loss');
  if (r.fire) bits.push('On Fire');
  if (r.helpless) bits.push(r.helpless === true ? 'Helpless' : `Helpless ${r.helpless}`);
  if (r.drop) bits.push('drops what is held');
  if (r.blind) bits.push(r.blind === 'permanently' ? 'permanently Blind' : `Blind ${r.blind}`);
  if (r.deaf) bits.push(`Deaf ${r.deaf}`);
  if (r.mute) bits.push('cannot speak');
  if (r.lost) bits.push(`loses ${r.lost}`);
  if (r.mods) {
    const m = Object.entries(r.mods).map(([k, v]) => `${signed(v)} ${k.toUpperCase()}`).join(', ');
    bits.push(r.until === 'healed' ? `${m} until healed` : `${m} for good`);
  }
  if (r.dying) bits.push(`dies in ${r.dying} without Medicae`);
  if (r.dead) bits.push(r.delay ? `dies at the ${r.delay}` : 'dead');
  return bits.join('; ');
}

// A d100 band as a table prints it: "01-20", "21-40", "171+".
function bands(table) {
  let from = 1;
  return table.map((row) => {
    const label = Number.isFinite(row.max) ? `${String(from).padStart(2, '0')}\u2013${row.max}` : `${from}+`;
    from = row.max + 1;
    return [label, row.text];
  });
}

export function buildCodex() {
  const out = [];

  /* ---- tests ---- */
  out.push(E('tests', 'making-a-test', 'Making a test', 'Core rule',
    'Roll d100 and try to roll equal to or under the target number: the characteristic or skill, plus or minus '
    + 'the difficulty and any situation modifiers. Every full ten points between the roll and the target is a Degree '
    + 'of Success (rolling under) or of Failure (rolling over). A roll of 01–05 always succeeds and 96–00 '
    + 'always fails, whatever the target.'));
  out.push(E('tests', 'difficulty', 'Difficulty', 'Table',
    'Added to the target number before rolling.',
    DIFFICULTIES.map((d) => [d.label, signed(d.mod)])));

  /* ---- combat ---- */
  for (const a of ACTIONS) {
    out.push(E('combat', slug(a.id), a.name, actionKind[a.type] || 'Action', a.effect));
  }
  out.push(E('combat', 'movement', 'Movement', 'Table',
    'All from Agility Bonus (AB). A standing jump is part of a Half Move and needs no test; a running leap follows '
    + 'a Full Move and needs an Acrobatics test.',
    [['Half Move', 'AB'], ['Full Move', '2 × AB'], ['Charge', '3 × AB'], ['Run', '6 × AB'],
      ['Standing jump', 'half AB, rounded down'], ['Running leap', 'AB']]));
  out.push(E('combat', 'hit-location', 'Hit location', 'Table',
    'Reverse the two digits of the attack roll that hit: a 47 is read as 74, which is a leg. 100 reads as 00.',
    [['01–10', LOCATIONS[0].name], ['11–20', LOCATIONS[1].name], ['21–30', LOCATIONS[2].name],
      ['31–70', LOCATIONS[3].name], ['71–85', LOCATIONS[4].name], ['86–00', LOCATIONS[5].name]]));
  out.push(E('combat', 'critical-damage', 'Critical damage', 'Core rule',
    'Damage that runs past 0 Wounds is critical damage, and every row of the table from 1 up to that total applies, '
    + `not only the last. It accumulates across hits. Past row ${CRIT_MAX} the target is dead.`));
  out.push(E('combat', 'righteous-fury', 'Righteous Fury', 'Core rule',
    'A natural 10 on a damage die earns another attack roll. If that hits, roll 1d5 on the critical table and apply '
    + 'that row, even on a target at full Wounds.'));

  /* ---- conditions ---- */
  for (const c of GROUND_CONDITIONS) {
    const per = [c.perRound ? `${c.perRound} Wound each round` : '', c.perRoundDice ? `1d${c.perRoundDice} Wounds each round` : '']
      .filter(Boolean).join('');
    out.push(E('conditions', slug(c.id), c.name, 'Condition', c.note, per ? [['Each round', per]] : []));
  }

  /* ---- critical damage tables ---- */
  const groups = [['head', 'Head'], ['arm', 'Arm'], ['body', 'Body'], ['leg', 'Leg']];
  for (const t of DAMAGE_TYPES) {
    for (const [g, gName] of groups) {
      const loc = LOCATIONS.find((l) => l.group === g);
      const rows = [];
      for (let n = 1; n <= CRIT_MAX; n++) {
        const r = critRow(t.id, loc.id, n);
        const note = critNote(r);
        rows.push([String(n), note ? `${r.effect} ${note[0].toUpperCase()}${note.slice(1)}.` : r.effect]);
      }
      out.push(E('crits', `${t.id}-${g}`, `${t.name} \u2014 ${gName}`, `${t.name} damage`,
        `${g === 'arm' || g === 'leg' ? `Either ${g}` : `A hit to the ${g}`} reads this table, rows 1 to ${CRIT_MAX}.`,
        rows));
    }
  }

  /* ---- fear and insanity ---- */
  out.push(E('mind', 'fear-test', 'Fear', 'Core rule',
    'Meeting something with a Fear rating calls for a Willpower test, modified by that rating. A failure rolls on the '
    + 'Shock table, adding 10 for every Degree of Failure. If the first digit of the character’s Insanity total '
    + 'is double the Fear rating or more, they are unaffected and need not test.',
    FEAR_LEVELS.map((f) => [`${f.rating} — ${f.name}`, `${signed(f.mod)} to the test`])));
  out.push(E('mind', 'shock', 'The Shock table', 'Table',
    'Roll d100 and add 10 per Degree of Failure on the Fear test.', bands(SHOCK_TABLE)));

  const insane = [];
  for (const pts of [0, INSANITY_STEP, 40, 60, 80, 100]) {
    const t = insanityTrack(pts);
    const what = t.retired ? 'retired from play' : modText(t.mod, 'the Trauma Test');
    insane.push([pts >= 100 ? '100+' : `${pts}+`, `${t.degree} \u2014 ${what}`]);
  }
  out.push(E('mind', 'insanity', 'The Insanity track', 'Table',
    `Every ${INSANITY_STEP} Insanity Points gained forces a Trauma Test: Willpower, modified by the track. A mental disorder `
    + `arrives at ${DISORDER_AT.map((d) => `${d.at} (${d.severity.toLowerCase()})`).join(', ')}.`,
    insane));
  out.push(E('mind', 'trauma', 'The Trauma table', 'Table',
    'After a failed Trauma Test, roll d100 and add 10 per Degree of Failure.', bands(TRAUMA_TABLE)));

  const taint = [];
  for (const pts of [0, 31, 61, 91, 100]) {
    const t = corruptionTrack(pts);
    taint.push([pts >= 100 ? '100+' : `${pts}+`, `${t.degree} \u2014 ${t.damned ? 'lost' : modText(t.mod, 'the Malignancy Test')}`]);
  }
  out.push(E('mind', 'corruption', 'The Corruption track', 'Table',
    `A Malignancy Test (Willpower, modified by the track) for every ${MALIGNANCY_STEP} Corruption Points gained, and a `
    + `mutation test for every ${MUTATION_STEP}.`, taint));

  /* ---- psychic ---- */
  for (const m of MODES) {
    out.push(E('psychic', `mode-${m.id}`, m.label, 'Manifesting', `${m.note}`, [['Psy Rating used', m.ratingNote]]));
  }
  out.push(E('psychic', 'pushing', 'Pushing', 'Manifesting',
    `A power can be pushed by up to ${MAX_PUSH} points of Psy Rating. Table 6-2 (Psychic Phenomena) is rolled automatically.`));
  out.push(E('psychic', 'psy-rating', 'Psy Rating', 'Table',
    'The experience cost is for each step, bought in order.',
    PSY_RATINGS.map((p) => [`${p.rating}${p.andAbove ? '+' : ''}`, `${p.effect} (${p.xp} XP)`])));
  for (const d of DISCIPLINES) {
    out.push(E('psychic', `discipline-${d.id}`, d.name, 'Discipline', d.focus,
      [['Basic technique', `${d.basic} — ${d.basicEffect}`], ['Techniques', (d.techniques || []).join(', ')]]));
  }

  /* ---- void combat ---- */
  out.push(E('void', 'turn', 'The ship turn', 'Core rule',
    'A ship’s turn is taken in four phases, in order.',
    PHASES.map((p, i) => [String(i + 1), PHASE_LABELS[p]])));
  for (const a of EXTENDED_ACTIONS) {
    const who = a.roles.map((r) => (roleById(r) ? roleById(r).name : r)).join(' or ');
    out.push(E('void', slug(a.id), a.name, 'Ship action', a.effect, [['Station', who], ['Test', a.skill]]));
  }
  out.push(E('void', 'evasion-cap', 'Evasion', 'Core rule',
    `Incoming attacks suffer \u221210, and a further \u221210 per Degree of Success on the manoeuvre, to a maximum of ${signed(EVASION_CAP)}.`));
  out.push(E('void', 'manoeuvres', 'Manoeuvres', 'Core rule',
    `Each ship\u2019s turn is one Manoeuvre Action and one Shooting Action. The basic Manoeuvre moves the ship forward its Speed in Void Units, `
    + `then it may turn: up to ${TURN_LIMITS.small} degrees for a transport, raider or frigate, and up to ${TURN_LIMITS.large} for a light cruiser or larger. `
    + 'A manoeuvre changes that move, and each is a Pilot (Space Craft) test with the ship\u2019s Manoeuvrability.',
    MANOEUVRES.map((m) => [m.name, m.effect])));
  out.push(E('void', 'shooting', 'Shooting', 'Core rule',
    'One crew member directs every weapon in the Shooting Action, testing Ballistic Skill. Each weapon fires into the arc of its mount.',
    [
      ['Range', `Half the weapon\u2019s range or less is ${signed(RANGE_MODIFIERS.short)}; up to its range is no modifier; up to twice its range is ${signed(RANGE_MODIFIERS.long)}. Past that there is no shot.`],
      ['Hits', `A macrobattery scores a further hit for every Degree of Success; a lance scores one for every ${DEGREES_PER_LANCE_HIT}. The weapon\u2019s Strength caps either.`],
      ['Void shields', 'Each void shield removes one hit before any damage is rolled.'],
      ['Damage', 'The damage of every macrobattery hit is added together and the ship\u2019s Armour comes off the total. A lance\u2019s damage goes straight to Hull Integrity.'],
      ['Prow', `Fore on a ship smaller than a light cruiser. Fore, port and starboard (${PROW_WIDE} degrees) on a light cruiser or larger.`],
      ['Dorsal', 'Fore, port and starboard.'],
      ['Port and starboard', 'That side only.'],
      ['Keel', 'Every direction.']
    ]));
  for (const a of REFERENCE_ACTIONS) {
    out.push(E('void', slug(a.id), a.name, 'Ship action', a.effect,
      [['On the dashboard', 'Not run from here. Resolve it from the core rulebook.']]));
  }

  /* ---- building a voidship ---- */
  const weights = HULL_GROUPS.map((g) => [g.name, HULLS.filter((h) => hullGroup(h.cls) === g.id).map((h) => h.name).join(', ') || 'none in the catalogue']);
  out.push(E('building', 'steps', 'The five steps', 'Drydock',
    'Drydock, the free player\u2019s aid, breaks building a starship into five steps, in this order.',
    [
      ['1  Ship Points', 'Find out how many the Warrant of Trade provides.'],
      ['2  Hull', `Pick one that costs fewer than the Explorers have, and leave at least ${SP_RESERVE} Ship Points to fit it out.`],
      ['3  Personality', 'Roll a Machine Spirit Oddity and a Past History, and note what each does before any component is chosen.'],
      ['4  Essentials', `One component, and only one, from each of the ${ESSENTIAL_CATEGORIES.length} categories.`],
      ['5  Supplementals', 'Any number, within the Ship Points. What Ship Points remain are redeemed for Profit Factor.']
    ]));
  out.push(E('building', 'power-space', 'Power and space', 'Core rule',
    'The Plasma Drive provides the ship\u2019s power and the hull provides its space; both are fixed. Most components need some of each, '
    + 'and the total a ship\u2019s components need must not be more than it has. The penalties for going over are in the core rulebook.'));
  out.push(E('building', 'hull-weights', 'Hull weights', 'Drydock',
    'Drydock sorts hulls into five weights and says which weight each Essential Component is for. The builder notes a component fitted outside its weight; it does not forbid it.',
    weights));
  out.push(E('building', 'once-only', 'Fitted once only', 'Drydock',
    'Armour Plating, the Armoured Prow and the Tenebro-Maze may be fitted only once to a vessel. The builder will not accept a second Tenebro-Maze.'));
  out.push(E('building', 'personality', 'Oddities and histories', 'Core rule',
    'Roll once on each table, d10 each, and write both on the ship\u2019s sheet. They change what the ship can afford and how it behaves, which is why they come before the components.'));

  /* ---- skills, talents ---- */
  for (const [name, text] of Object.entries(SKILLS)) out.push(E('skills', slug(name), name, 'Skill', text));
  for (const [name, text] of Object.entries({ ...TALENTS, ...MISC })) out.push(E('talents', slug(name), name, 'Talent', text));
  for (const [name, text] of Object.entries(POWERS)) out.push(E('talents', 'power-' + slug(name), name, 'Power', text));

  return out;
}

/* ------------------------------ finding things ------------------------------ */

const norm = (s) => String(s || '').toLowerCase();

/* Entries matching every word of `query`, best first: a title that starts with
   the word, then a title that holds it, then the tag, then the body and rows.
   An empty query is every entry, in book order. */
export function searchCodex(entries, query, section = '') {
  const pool = section ? entries.filter((e) => e.section === section) : entries;
  const words = norm(query).split(/[\s,;:.!?()]+/).filter(Boolean);
  if (!words.length) return pool.slice();
  const scored = [];
  pool.forEach((e, i) => {
    const title = norm(e.title);
    const tag = norm(e.tag);
    const rest = norm(`${e.body} ${e.rows.map((r) => r.join(' ')).join(' ')}`);
    let score = 0;
    for (const w of words) {
      let s = 0;
      if (title.startsWith(w)) s = 8;
      else if (title.split(/\s+/).some((t) => t.startsWith(w))) s = 6;
      else if (title.includes(w)) s = 5;
      else if (tag.includes(w)) s = 3;
      else if (rest.includes(w)) s = 1;
      if (!s) return;                       // every word has to be somewhere
      score += s;
    }
    scored.push({ e, score, i });
  });
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).map((x) => x.e);
}

export const sectionCounts = (entries) => {
  const n = {};
  for (const e of entries) n[e.section] = (n[e.section] || 0) + 1;
  return n;
};
