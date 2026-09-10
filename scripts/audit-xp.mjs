// Origin & Elite Advance Tracker for the pre-made characters.
//
//   curl -sL "https://docs.google.com/document/d/<ID>/export?format=txt" -o doc.txt
//   node scripts/audit-xp.mjs doc.txt
//
// WHAT THIS IS FOR
//
// Starting skills, talents, traits and gear in Rogue Trader are 100% free:
// the Origin Path nodes and the starting career package hand them over as the
// 4,500 XP creation baseline. Only the remaining 500 XP is spendable before
// session one. So an entry appearing on a sheet is NOT evidence of spending.
//
// This sorts every listed skill and talent into three buckets:
//
//   FREE        matched to an Origin Path node or the starting career package
//               in the app's own data — costs nothing, by the rules.
//   PURCHASED   matched to the career's Rank 1-4 advance tables and not free —
//               real XP, summed and compared against the SPENDABLE budget.
//   UNCLASSIFIED  in neither. Expected, not an error: an off-table Origin Path
//               grant, a starting career package entry the app's data does not
//               carry, or a GM-approved Elite Advance (200-500 XP each). These
//               are listed for a human to classify, not guessed at.
//
// STILL NOT RECOVERABLE: characteristic advances. They cost 100-1,500 XP each,
// but the premades record only FINAL characteristics, so the starting values —
// and therefore the number bought — cannot be derived. PURCHASED is a floor.

import fs from 'node:fs';
import { advancesFor, baseCareer, MAX_TABLED_RANK } from '../src/advances.js';
import { STARTING_XP, spendableXp, rankForXp } from '../src/xp.js';

const APP = fs.readFileSync('src/RogueTraderBuilder.jsx', 'utf8').split('const CSS =')[0];

/* ---------- what the creation packages hand over free ---------- */

function sliceArray(name) {
  const start = APP.indexOf(`const ${name} = [`);
  if (start < 0) return '';
  const i = APP.indexOf('[', start);
  let depth = 0;
  for (let j = i; j < APP.length; j++) {
    if (APP[j] === '[') depth++;
    else if (APP[j] === ']') { depth--; if (!depth) return APP.slice(i, j + 1); }
  }
  return '';
}

const PACKAGES = new Map();   // node name -> [skills + talents]
for (const arr of ['HOME_WORLDS', 'BIRTHRIGHTS', 'LURES', 'TRIALS', 'MOTIVATIONS', 'CAREERS']) {
  const body = sliceArray(arr);
  const starts = [...body.matchAll(/id: '([a-z0-9_]+)',\s*\n?\s*name: '((?:[^'\\]|\\.)*)'/g)];
  for (let k = 0; k < starts.length; k++) {
    const seg = body.slice(starts[k].index, k + 1 < starts.length ? starts[k + 1].index : body.length);
    const got = [];
    for (const field of ['skills', 'talents']) {
      const m = seg.match(new RegExp(field + ":\\s*\\[([\\s\\S]*?)\\]"));
      if (m) for (const q of m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)) got.push(q[1]);
    }
    PACKAGES.set(starts[k][2], got);
  }
}

/* ---------- normalising so doc and table can be compared ---------- */

// "Dodge (+10)" and "Dodge +10" are the same entry. A multi-specialisation
// entry like "Common Lore (Imperium, Underworld)" is matched on its base name
// and counted once, which keeps PURCHASED a floor.
function norm(s) {
  let t = String(s || '').trim().replace(/\s+/g, ' ');
  const plus = t.match(/\(?\+(\d+)\)?\s*$/);
  t = t.replace(/\(?\+\d+\)?\s*$/, '').trim();
  return t.split('(')[0].trim().toLowerCase() + (plus ? ' +' + plus[1] : '');
}

function splitList(s) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of String(s || '')) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.replace(/\.$/, '').trim()).filter(Boolean);
}

/* ---------- the doc ---------- */

function parseDoc(path) {
  // Split on \r?\n: the Docs export is CRLF, and in JavaScript `.` does not
  // match \r, so a trailing \r stops every `(.*)$` from matching.
  const lines = fs.readFileSync(path, 'utf8').replace(/^﻿/, '').split(/\r?\n/);
  const heads = [];
  lines.forEach((l, i) => {
    const m = l.match(/^(\d+)\.\s+(.*)$/);
    if (m) heads.push({ i, title: m[2].trim() });
  });
  return heads.map((h, k) => {
    const body = lines.slice(h.i + 1, k + 1 < heads.length ? heads[k + 1].i : lines.length);
    const f = {};
    for (const l of body) {
      const m = l.match(/^\s*\*\s*([^:]{1,40}):\s*(.*)$/);
      if (m && !(m[1].trim() in f)) f[m[1].trim()] = m[2].trim();
    }
    return {
      name: h.title.replace(/\s*\([^)]*\)\s*$/, ''),
      career: f['Career'] || '',
      xp: Number((f['XP Total'] || '').replace(/[^\d]/g, '')) || 0,
      path: (f['Origin Path'] || '').split(/[→>]+/)
        .map((p) => p.trim().replace(/\s*\([^)]*\)\s*$/, '')).filter(Boolean),
      skills: splitList(f['Trained'] || f['Skills'] || ''),
      talents: splitList(f['Combat & General'] || f['Talents'] || '')
    };
  });
}

/* ---------- audit ---------- */

const chars = parseDoc(process.argv[2]);
if (!chars.length) {
  console.error('audit-xp: parsed 0 characters from %s — the format has changed, '
    + 'or the file is not the exported document.', process.argv[2]);
  process.exit(1);
}

let overspent = 0, unclassifiedTotal = 0, skipped = 0, outOfRank = 0;

for (const c of chars) {
  const base = baseCareer(c.career);
  console.log('\n%s', '='.repeat(78));
  console.log('%s  —  %s', c.name, c.career || '(no career)');

  if (!base) {
    console.log('  SKIPPED: career is outside the core eight, so it has no advance table.');
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

  // the free creation baseline: every Origin Path node plus the career package
  const free = new Set();
  for (const node of c.path) for (const g of PACKAGES.get(node) || []) free.add(norm(g));
  for (const g of PACKAGES.get(base) || []) free.add(norm(g));

  // A character can only buy from tables at or below their own rank, so this
  // is a separate breach from overspending: at 5,000 XP everyone is Rank 1,
  // and any Rank 2+ purchase is simply out of reach whatever the budget.
  const charRank = rankForXp(c.xp);

  let spent = 0;
  const purchased = [], granted = [], unclassified = [], aboveRank = [];
  for (const entry of [...c.skills, ...c.talents]) {
    const key = norm(entry);
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

  const budget = spendableXp(c.xp);
  const over = spent > budget;
  if (over) overspent++;
  if (aboveRank.length) outOfRank++;
  unclassifiedTotal += unclassified.length;

  console.log('  stated XP %s → Rank %d · spendable %s (%s is the free baseline)',
    c.xp.toLocaleString(), rankForXp(c.xp), budget.toLocaleString(),
    STARTING_XP.baseline.toLocaleString());
  console.log('  FREE          %d from Origin Path + career package', granted.length);
  console.log('  PURCHASED     %s XP from %d table advances%s',
    spent.toLocaleString(), purchased.length,
    over ? `   <-- OVER the ${budget.toLocaleString()} spendable` : '');
  for (const p of purchased) console.log('                  %s', p);
  if (aboveRank.length) {
    console.log('  OUT OF RANK   %d advance(s) above Rank %d: %s',
      aboveRank.length, charRank, aboveRank.join('; '));
  }
  console.log('  UNCLASSIFIED  %d%s', unclassified.length,
    unclassified.length ? ' — classify by hand:' : '');
  for (const u of unclassified) console.log('                  %s', u);
}

console.log('\n%s', '='.repeat(78));
console.log('%d of %d characters purchase more than their spendable XP allows.',
  overspent, chars.length - skipped);
console.log('%d of %d hold advances from a rank above their own — a separate breach,',
  outOfRank, chars.length - skipped);
console.log('   since a table above your rank is unreachable whatever your budget.');
console.log('%d entries are unclassified across the set; %d characters were skipped.',
  unclassifiedTotal, skipped);
console.log('');
console.log('PURCHASED is a floor, not a total: characteristic advances cost 100-1,500 XP');
console.log('each and cannot be recovered, because the premades record only final');
console.log('characteristics. A character within budget here may still be over once');
console.log('those are counted; one over budget here is over regardless.');
console.log('');
console.log('UNCLASSIFIED is expected, not an error. Each is an off-table Origin Path');
console.log('grant, a starting career package entry the app\'s data does not carry, or a');
console.log('GM-approved Elite Advance at 200-500 XP — and an Elite Advance does spend');
console.log('from the same budget, so those need classifying before a total is trustworthy.');
