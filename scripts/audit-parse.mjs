// Does every character sheet actually parse?
//
//   node scripts/audit-parse.mjs <dir-of-csvs>
//
// Written after all 13 tabs of the shared Google Sheet came back empty. The
// parser was fine; the sheet was flattened on the way in — each tab's whole
// IDENTITY and ORIGIN PATH block sat inside cell A1, so there was no "Name"
// row, no origin path, and the "# — FINAL CHARACTERISTICS —" marker that tells
// final values from 2d10+25 rolls had been swallowed with it.
//
// Regenerate clean CSVs from the intact workbook first:
//   python3 scripts/xlsx-to-csv.py characters.xlsx out/
//
// It also cross-checks lib/prompt.js against the app's own SHEET_CATALOG: two
// origin options were filed under the wrong step there and silently lost their
// art direction, which nothing else would have caught.

import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';
import { parseCsv, parseCharacterSheet, looksFlattened } from '../src/sheet.js';
import { phraseFor } from '../lib/prompt.js';

const ROOT = new URL('..', import.meta.url).pathname;

// SHEET_CATALOG lives in the .jsx, so it is compiled to plain JS and imported
// rather than copied here — a copy would drift from what the app matches on.
async function loadCatalog() {
  const src = fs.readFileSync(path.join(ROOT, 'src/RogueTraderBuilder.jsx'), 'utf8');
  const { code } = esbuild.transformSync(src, { loader: 'jsx', format: 'esm' });
  // written beside the original so its relative imports still resolve
  const tmp = path.join(ROOT, 'src/.audit-catalog.mjs');
  fs.writeFileSync(tmp, code);
  try {
    return (await import(tmp)).SHEET_CATALOG;
  } finally {
    fs.unlinkSync(tmp);
  }
}

/* ------------------------- prompt coverage ------------------------- */

function auditPrompts(catalog) {
  const missing = [];
  let n = 0;
  for (const [step, options] of Object.entries(catalog.steps)) {
    for (const o of options) {
      n++;
      if (!phraseFor(step, o.id) || !phraseFor(step, o.name)) {
        missing.push(`${step}/${o.id} (${o.name})`);
      }
    }
  }
  console.log(`\nPORTRAIT PROMPTS — ${n - missing.length}/${n} origin options carry a phrase`);
  for (const m of missing) console.log(`  MISSING  ${m}`);
  return missing.length;
}

/* --------------------------- sheet parsing --------------------------- */

function auditSheet(file, catalog) {
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  const name = path.basename(file, '.csv');

  // the same predicate the importer refuses on, not a second copy of it
  if (looksFlattened(rows)) {
    console.log(`\n${name}\n  BROKEN   this tab is flattened — the identity and origin`);
    console.log('           rows are inside one cell. Re-import it from a clean CSV.');
    return { ok: false, flat: true };
  }

  const { state, warnings } = parseCharacterSheet(rows, catalog);
  const steps = Object.keys(state.sel).length;
  const lists = Object.entries(state.extras)
    .filter(([, v]) => v.length)
    .map(([k, v]) => `${k}:${v.length}`);

  const problems = [];
  if (!state.name) problems.push('no name');
  if (steps < 6) problems.push(`${steps}/6 origin steps`);
  if (!state.finalTotals && !state.rolls) problems.push('no characteristics');
  // The dangerous one: finals landing in the roll fields means the app applies
  // origin modifiers to numbers that already include them.
  if (state.rolls && !state.finalTotals) {
    const high = Object.entries(state.rolls).filter(([, v]) => v > 45 || v < 27);
    if (high.length) {
      problems.push(`characteristics read as ROLLS but ${high.length} are outside 2d10+25`);
    }
  }

  console.log(`\n${name}`);
  console.log(`  ${problems.length ? 'FAIL    ' : 'ok      '}${state.name || '(unnamed)'}`);
  console.log(`  origin   ${steps}/6${steps === 6 ? '' : '  ' + JSON.stringify(state.sel)}`);
  console.log(`  chars    ${state.finalTotals ? 'final (used verbatim)'
    : state.rolls ? 'rolls (origin modifiers will be applied)' : 'NONE'}`);
  console.log(`  lists    ${lists.join(' ') || 'none'}`);
  console.log(`  xp       ${state.xp ?? '(none)'}   psy ${state.psyRating}`);
  for (const p of problems) console.log(`  PROBLEM  ${p}`);
  for (const w of warnings) console.log(`  warn     ${w}`);

  return { ok: problems.length === 0, flat: false };
}

/* -------------------------------- main -------------------------------- */

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/audit-parse.mjs <dir-of-csvs>');
  process.exit(2);
}

const catalog = await loadCatalog();
const missingPhrases = auditPrompts(catalog);

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.csv')).sort();
const results = files.map((f) => auditSheet(path.join(dir, f), catalog));

const good = results.filter((r) => r.ok).length;
const flat = results.filter((r) => r.flat).length;
console.log(`\n${'='.repeat(64)}`);
console.log(`${good}/${files.length} parse cleanly` + (flat ? `, ${flat} flattened` : ''));
if (missingPhrases) console.log(`${missingPhrases} origin option(s) have no portrait phrase`);
process.exit(good === files.length && !missingPhrases ? 0 : 1);
