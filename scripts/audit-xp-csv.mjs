// Origin & Advance Tracker for the pre-made characters, working directly off
// characters.xlsx (via its CSV export) rather than the original Google Doc
// scripts/audit-xp.mjs was written against — that doc predates the current
// 13-career, corrected-cost advance tables and is no longer the live source.
//
//   python3 scripts/xlsx-to-csv.py characters.xlsx /tmp/chars/
//   node audit-xp-csv.mjs /tmp/chars/
//
// Same classification as scripts/audit-xp.mjs: FREE (Origin Path node or
// starting career package), PURCHASED (matches the career's Rank 1-8 advance
// table, now with this session's corrected costs), UNCLASSIFIED (neither —
// an off-table grant or a GM Elite Advance, not an error by itself).

import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { parseCsv, parseCharacterSheet } from '../src/sheet.js';
import { advancesFor, baseCareer, MAX_TABLED_RANK } from '../src/advances.js';
import { STARTING_XP, spendableXp, rankForXp } from '../src/xp.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

async function loadAppExports() {
  const src = fs.readFileSync(path.join(ROOT, 'src/RogueTraderBuilder.jsx'), 'utf8');
  const { code } = esbuild.transformSync(src, { loader: 'jsx', format: 'esm' });
  const tmp = path.join(ROOT, 'src/.audit-catalog2.mjs');
  fs.writeFileSync(tmp, code);
  try {
    const mod = await import(tmp);
    return { catalog: mod.SHEET_CATALOG, appSrc: src.split('const CSS =')[0] };
  } finally {
    fs.unlinkSync(tmp);
  }
}

/* ---------- what the creation packages hand over free (same as audit-xp.mjs) ---------- */

function sliceArray(appSrc, name) {
  const start = appSrc.indexOf(`const ${name} = [`);
  if (start < 0) return '';
  const i = appSrc.indexOf('[', start);
  let depth = 0;
  for (let j = i; j < appSrc.length; j++) {
    if (appSrc[j] === '[') depth++;
    else if (appSrc[j] === ']') { depth--; if (!depth) return appSrc.slice(i, j + 1); }
  }
  return '';
}

function buildPackages(appSrc) {
  const packages = new Map();
  for (const arr of ['HOME_WORLDS', 'BIRTHRIGHTS', 'LURES', 'TRIALS', 'MOTIVATIONS', 'CAREERS']) {
    const body = sliceArray(appSrc, arr);
    const starts = [...body.matchAll(/id: '([a-z0-9_]+)',\s*\n?\s*name: '((?:[^'\\]|\\.)*)'/g)];
    for (let k = 0; k < starts.length; k++) {
      const seg = body.slice(starts[k].index, k + 1 < starts.length ? starts[k + 1].index : body.length);
      const got = [];
      for (const field of ['skills', 'talents']) {
        const m = seg.match(new RegExp(field + ":\\s*\\[([\\s\\S]*?)\\]"));
        if (m) for (const q of m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)) got.push(q[1]);
      }
      packages.set(starts[k][2], got);
    }
  }
  return packages;
}

/* ---------- normalising so sheet and table can be compared ---------- */

function norm(s) {
  let t = String(s || '').trim().replace(/\s+/g, ' ');
  const plus = t.match(/\(?\+(\d+)\)?\s*$/);
  t = t.replace(/\(?\+\d+\)?\s*$/, '').trim();
  return t.split('(')[0].trim().toLowerCase() + (plus ? ' +' + plus[1] : '');
}

/* -------------------------------- main -------------------------------- */

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node audit-xp-csv.mjs <dir-of-csvs>');
  process.exit(2);
}

const { catalog, appSrc } = await loadAppExports();
const packages = buildPackages(appSrc);

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.csv')).sort();
let overspent = 0, outOfRank = 0, unclassifiedTotal = 0, skipped = 0;

for (const file of files) {
  const rows = parseCsv(fs.readFileSync(path.join(dir, file), 'utf8'));
  const { state } = parseCharacterSheet(rows, catalog);
  const name = state.name || path.basename(file, '.csv');
  const careerName = (catalog.steps.career.find((c) => c.id === state.sel.career) || {}).name || '';

  console.log('\n' + '='.repeat(78));
  console.log('%s  —  %s', name, careerName || '(no career)');

  const base = baseCareer(careerName);
  if (!base) {
    console.log('  SKIPPED: career "%s" has no advance table.', careerName);
    skipped++;
    continue;
  }

  const table = new Map();
  for (let r = 1; r <= MAX_TABLED_RANK; r++) {
    for (const a of advancesFor(base, r) || []) {
      const key = norm(a.name);
      if (!table.has(key)) table.set(key, { ...a, rank: r });
    }
  }

  // free baseline: every picked origin-path step's package, plus the career's own
  const free = new Set();
  for (const stepId of Object.keys(state.sel)) {
    const optId = state.sel[stepId];
    const opt = (catalog.steps[stepId] || []).find((o) => o.id === optId);
    if (opt) for (const g of packages.get(opt.name) || []) free.add(norm(g));
  }
  for (const g of packages.get(base) || []) free.add(norm(g));

  const xp = state.xp ?? STARTING_XP.total;
  const charRank = rankForXp(xp);
  const budget = spendableXp(xp);

  // A GM-approved Elite Advance is priced by the GM, not looked up on the
  // career table, and is never rank-gated — it was never on that table to
  // begin with. Matched by name so it is pulled out of UNCLASSIFIED rather
  // than double-counted if it happens to share a name with a table entry.
  const eliteByName = new Map(state.extras.eliteAdvances.map((a) => [norm(a.name), a]));

  let spent = 0, eliteSpent = 0;
  const purchased = [], granted = [], unclassified = [], aboveRank = [], elite = [];
  for (const entry of [...state.extras.skills, ...state.extras.talents]) {
    const key = norm(entry);
    const eliteHit = eliteByName.get(key);
    if (eliteHit) {
      eliteSpent += eliteHit.cost;
      elite.push(`${entry} — ${eliteHit.type}, ${eliteHit.cost} XP`);
      continue;
    }
    if (free.has(key)) { granted.push(entry); continue; }
    const hit = table.get(key);
    if (hit) {
      spent += hit.cost;
      const tooHigh = hit.rank > charRank;
      if (tooHigh) aboveRank.push(`${entry} (Rank ${hit.rank})`);
      purchased.push(`${entry} — Rank ${hit.rank}, ${hit.cost} XP`
        + (tooHigh ? `   <-- Rank ${hit.rank} advance, character is Rank ${charRank}` : ''));
    } else unclassified.push(entry);
  }
  // Elite Advances not named among Skills/Talents (e.g. a Trait) still spend.
  for (const a of state.extras.eliteAdvances) {
    if (![...state.extras.skills, ...state.extras.talents].some((e) => norm(e) === norm(a.name))) {
      eliteSpent += a.cost;
      elite.push(`${a.name} — ${a.type}, ${a.cost} XP`);
    }
  }

  const totalSpent = spent + eliteSpent;
  const over = totalSpent > budget;
  if (over) overspent++;
  if (aboveRank.length) outOfRank++;
  unclassifiedTotal += unclassified.length;

  console.log('  stated XP %s → Rank %d · spendable %s (%s is the free baseline)',
    xp.toLocaleString(), charRank, budget.toLocaleString(), STARTING_XP.baseline.toLocaleString());
  console.log('  FREE          %d from Origin Path + career package', granted.length);
  console.log('  PURCHASED     %s XP from %d table advances%s',
    spent.toLocaleString(), purchased.length,
    over ? `   <-- OVER the ${budget.toLocaleString()} spendable` : '');
  for (const p of purchased) console.log('                  %s', p);
  if (elite.length) {
    console.log('  ELITE         %s XP from %d GM-approved advance(s)', eliteSpent.toLocaleString(), elite.length);
    for (const e of elite) console.log('                  %s', e);
  }
  if (aboveRank.length) {
    console.log('  OUT OF RANK   %d advance(s) above Rank %d: %s',
      aboveRank.length, charRank, aboveRank.join('; '));
  }
  console.log('  UNCLASSIFIED  %d%s', unclassified.length,
    unclassified.length ? ' — classify by hand:' : '');
  for (const u of unclassified) console.log('                  %s', u);
}

console.log('\n' + '='.repeat(78));
console.log('%d of %d characters purchase more than their spendable XP allows.',
  overspent, files.length - skipped);
console.log('%d of %d hold advances from a rank above their own.', outOfRank, files.length - skipped);
console.log('%d entries unclassified across the set; %d characters skipped.', unclassifiedTotal, skipped);
