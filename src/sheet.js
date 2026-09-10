// Reading a character out of an import sheet.
//
// TWO SHAPES ARE ACCEPTED, and they are not interchangeable:
//
//   TEMPLATE  (character-template.csv) — a sheet you fill in by hand.
//     Characteristics are the PRE-MODIFIER 2d10+25 rolls; the app applies
//     origin modifiers itself. Wounds and Fate are the dice rolled for them.
//     Origin choices carry "choice id: xxx" in the notes column.
//
//   CONVERTED (scripts/convert-doc.py) — an existing character brought across.
//     Characteristics are FINAL, already including origin modifiers and
//     advances, and routinely fall outside the 27-45 a roll can produce.
//     Wounds and Fate are final values, not dice.
//
// Feeding final characteristics into the roll fields would make the app apply
// origin modifiers a second time, so the two land in different places and the
// caller decides which to honour. The discriminator is the section header the
// row sits under, which both formats carry.
//
// Pure; the catalogue of origin names is injected rather than imported.
// See sheet.check.mjs.

/* ------------------------------- CSV parsing -------------------------------
   RFC4180: quoted fields may hold commas, newlines and doubled quotes.
   Handles CRLF, because a Google Sheets export is CRLF. */

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false, i = 0;
  const s = String(text || '');
  const endField = () => { row.push(field); field = ''; };
  const endRow = () => { endField(); rows.push(row); row = []; };

  while (i < s.length) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { quoted = true; i++; continue; }
    if (c === ',') { endField(); i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { endRow(); i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length) endRow();
  return rows.filter((r) => r.some((v) => v !== ''));
}

/* --------------------------------- helpers --------------------------------- */

const key = (s) => String(s || '').trim().toLowerCase();

const num = (v) => {
  const n = parseInt(String(v || '').replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
};

// Splits on ; or , without breaking inside parentheses, so
// "Common Lore (Imperium, Underworld)" stays one entry.
export function splitEntries(v) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of String(v || '')) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if ((ch === ';' || ch === ',') && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.replace(/\.$/, '').trim()).filter(Boolean);
}

const STEP_FIELDS = {
  'home world': 'home',
  'birthright': 'birthright',
  'lure of the void': 'lure',
  'trials': 'trials',
  'motivation': 'motivation',
  'career (origin step)': 'career'
};

const CHAR_FIELDS = {
  'weapon skill': 'ws', 'ballistic skill': 'bs', 'strength': 's',
  'toughness': 't', 'agility': 'ag', 'intelligence': 'int',
  'perception': 'per', 'willpower': 'wp', 'fellowship': 'fel'
};

const LIST_FIELDS = {
  'extra skills': 'skills', 'skills': 'skills',
  'extra talents': 'talents', 'talents': 'talents',
  'extra traits': 'traits',
  'extra gear': 'gear', 'wargear': 'gear',
  'dropped gear': 'gearDropped',
  'psychic powers': 'powers',
  'notes': 'notes'
};

// Prose with no home in the app's state. Kept as notes rather than dropped —
// losing a GM secret on import is worse than an untidy notes list.
const NOTE_FIELDS = {
  'concept': 'Concept',
  'role in crew': 'Role in crew',
  'special ability': 'Special ability',
  'origin / trait modifiers': 'Origin / trait modifiers',
  'origin path choices': 'Origin path choices',
  'secret': 'Secret (GM only)',
  'favour owed': 'Favour owed',
  'career': 'Career'
};

/* --------------------------------- parsing --------------------------------- */

export function parseCharacterSheet(rows, catalog) {
  const steps = (catalog && catalog.steps) || {};
  const warnings = [];

  // Pass one: collect rows with the section each sits under. Section headers
  // are the "# — NAME —" rows both formats emit.
  const entries = [];
  let section = '';
  for (const row of rows) {
    const field = String(row[0] || '').trim();
    const value = String(row[1] || '').trim();
    const note = String(row[2] || '').trim();
    if (!field) continue;
    if (field.startsWith('#')) { section = key(field.replace(/[#—–-]/g, '')); continue; }
    if (key(field) === 'field') continue;
    if (!value) continue;
    entries.push({ field, value, note, section });
  }

  const state = {
    name: '', sel: {}, choices: {},
    rolls: null,          // pre-modifier 2d10+25, template sheets only
    finalTotals: null,    // final characteristics, converted sheets only
    woundRoll: null, fateRoll: null,
    finalWounds: null, finalFate: null,
    damage: 0, woundBonus: 0, psyRating: 0, xp: null, avatar: null,
    extras: { skills: [], talents: [], traits: [], gear: [], notes: [],
      gearDropped: [], powers: [], advances: [] }
  };

  const rolls = {}, finals = {};
  const seen = new Set(entries.map((e) => key(e.field)));

  for (const { field, value, note, section } of entries) {
    const k = key(field);

    const choiceId = (note.match(/choice id:\s*([a-z0-9_]+)/i) || [])[1];
    if (choiceId) { state.choices[choiceId] = value; continue; }

    if (k === 'name') { state.name = value; continue; }
    if (k === 'portrait url') { state.avatar = { src: value, framing: null }; continue; }

    // "Career" is the step in a template sheet, but a descriptive label in a
    // converted one, which carries "Career (origin step)" separately.
    if (k === 'career' && !seen.has('career (origin step)')) {
      const options = steps.career || [];
      const hit = options.find((o) => key(o.name) === key(value));
      if (hit) { state.sel.career = hit.id; continue; }
      state.extras.notes.push(`Career: ${value}`);
      warnings.push(`Career: "${value}" is not one of the ${options.length} careers`);
      continue;
    }

    if (STEP_FIELDS[k]) {
      const stepId = STEP_FIELDS[k];
      const options = steps[stepId] || [];
      const hit = options.find((o) => key(o.name) === key(value));
      if (hit) state.sel[stepId] = hit.id;
      else warnings.push(`${field}: "${value}" is not one of the ${options.length} options`);
      continue;
    }

    if (CHAR_FIELDS[k]) {
      const n = num(value);
      if (n == null) { warnings.push(`${field}: "${value}" is not a number`); continue; }
      if (section.includes('final')) finals[CHAR_FIELDS[k]] = n;
      else rolls[CHAR_FIELDS[k]] = n;
      continue;
    }

    if (LIST_FIELDS[k]) {
      const bucket = LIST_FIELDS[k];
      state.extras[bucket] = state.extras[bucket].concat(splitEntries(value));
      continue;
    }

    if (NOTE_FIELDS[k]) { state.extras.notes.push(`${NOTE_FIELDS[k]}: ${value}`); continue; }

    if (k === 'wound roll') { state.woundRoll = num(value); continue; }
    if (k === 'fate roll') { state.fateRoll = num(value); continue; }
    if (k === 'final wounds') { state.finalWounds = num(value); continue; }
    if (k === 'final fate points') { state.finalFate = num(value); continue; }
    if (k === 'damage taken') { state.damage = num(value) || 0; continue; }
    if (k === 'wound bonus') { state.woundBonus = num(value) || 0; continue; }
    if (k === 'psy rating') { state.psyRating = num(value) || 0; continue; }
    if (k === 'xp total') { state.xp = num(value); continue; }
    if (k === 'psychic disciplines') continue;      // reference column only

    warnings.push(`Unrecognised field "${field}"`);
  }

  const nRolls = Object.keys(rolls).length;
  const nFinal = Object.keys(finals).length;

  // A partial block would produce a quietly broken sheet, so it is refused.
  if (nRolls && nRolls < 9) {
    warnings.push(`Only ${nRolls} of 9 characteristics were filled in — ignoring them`);
  } else if (nRolls === 9) state.rolls = rolls;

  if (nFinal && nFinal < 9) {
    warnings.push(`Only ${nFinal} of 9 final characteristics were filled in — ignoring them`);
  } else if (nFinal === 9) state.finalTotals = finals;

  if (state.finalTotals && state.rolls) {
    warnings.push('Sheet has both rolled and final characteristics; the final values win');
    state.rolls = null;
  }

  return { state, warnings };
}

// Accepts a bare id or any Google Sheets URL, and refuses anything else so a
// stray string can never reach the network.
export function sheetIdFrom(input) {
  const s = String(input || '').trim();
  const fromUrl = s.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/);
  if (fromUrl) return fromUrl[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(s) ? s : null;
}
