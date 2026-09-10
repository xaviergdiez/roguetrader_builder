// Audits the pre-made characters against the career advance tables.
//
//   curl -sL "https://docs.google.com/document/d/<ID>/export?format=txt" -o doc.txt
//   node scripts/audit-xp.mjs doc.txt
//
// WHAT THIS CAN AND CANNOT ESTABLISH
//
// It computes a FLOOR on XP spent, not a total. Three things put real XP on a
// sheet, and only one of them is recoverable here:
//
//   1. Skill and talent purchases  — recoverable: matched against the career's
//      Rank 1-4 tables, with origin-path grants subtracted because those are
//      free.
//   2. Characteristic advances     — NOT recoverable. They cost 100-1,500 XP
//      each, but the premades record only FINAL characteristics, so the
//      starting values, and therefore the number of advances bought, are
//      unknown.
//   3. Psy Rating and psychic techniques — partly recoverable, and counted
//      when they appear in the career table.
//
// So the floor UNDERSTATES the true spend. If the floor alone already exceeds
// the 5,000 XP budget, that is a definite breach. If it does not, the sheet is
// merely "not disproven" — characteristic advances could still push it over.

import fs from 'node:fs';
import { CAREER_ADVANCES, advancesFor, baseCareer, MAX_TABLED_RANK } from '../src/advances.js';
import { STARTING_XP } from '../src/xp.js';

const APP = fs.readFileSync('src/RogueTraderBuilder.jsx', 'utf8').split('const CSS =')[0];

/* ---------- what the origin path hands over free ---------- */

function sliceArray(name) {
  const start = APP.indexOf(`const ${name} = [`);
  if (start < 0) return '';
  let i = APP.indexOf('[', start), depth = 0;
  for (let j = i; j < APP.length; j++) {
    if (APP[j] === '[') depth++;
    else if (APP[j] === ']') { depth--; if (!depth) return APP.slice(i, j + 1); }
  }
  return '';
}

const ORIGIN_GRANTS = new Map();   // item name -> [skills+talents]
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
    ORIGIN_GRANTS.set(starts[k][2], got);
  }
}

/* ---------- normalising names so doc and table can be compared ---------- */

// "Dodge (+10)" and "Dodge +10" are the same purchase; "Common Lore (Imperium,
// Underworld)" is matched on its base name, counted once. That undercounts a
// multi-specialisation entry, which keeps the result a floor.
function norm(s) {
  let t = String(s || '').trim().replace(/\s+/g, ' ');
  const plus = t.match(/\(?\+(\d+)\)?\s*$/);
  t = t.replace(/\(?\+\d+\)?\s*$/, '').trim();
  const base = t.split('(')[0].trim().toLowerCase();
  return base + (plus ? ' +' + plus[1] : '');
}

// split a comma list without breaking inside parentheses
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
  // Split on \r?\n, not \n. The Docs export is CRLF, and in JavaScript `.`
  // does not match \r — it is a line terminator — so a trailing \r stops
  // `(.*)$` from reaching end-of-string and every line-anchored regex here
  // silently matches nothing.
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
      path: (f['Origin Path'] || '').split(/[→>]+/).map((p) => p.trim().replace(/\s*\([^)]*\)\s*$/, '')).filter(Boolean),
      skills: splitList(f['Trained'] || f['Skills'] || ''),
      talents: splitList(f['Combat & General'] || f['Talents'] || '')
    };
  });
}

/* ---------- audit ---------- */

const chars = parseDoc(process.argv[2]);

// A parse that finds nothing must fail loudly. Reporting "0 of 0 characters
// exceed the budget" reads like a pass and is worse than an error.
if (!chars.length) {
  console.error('audit-xp: parsed 0 characters from %s — the format has changed, '
    + 'or the file is not the exported document.', process.argv[2]);
  process.exit(1);
}

let breaches = 0;

for (const c of chars) {
  const base = baseCareer(c.career);
  console.log('\n%s', '='.repeat(78));
  console.log('%s  —  %s', c.name, c.career || '(no career)');

  if (!base) {
    console.log('  SKIPPED: no advance table for this career (outside the core eight).');
    continue;
  }

  // everything the career could sell, across the tabled ranks
  const table = new Map();
  for (let r = 1; r <= MAX_TABLED_RANK; r++) {
    for (const a of advancesFor(base, r) || []) {
      const key = norm(a.name);
      if (!table.has(key)) table.set(key, { ...a, rank: r });
    }
  }

  // what the origin path already gave, free
  const free = new Set();
  for (const step of c.path) {
    for (const g of ORIGIN_GRANTS.get(step) || []) free.add(norm(g));
  }

  let floor = 0;
  const bought = [], granted = [], unknown = [];
  for (const entry of [...c.skills, ...c.talents]) {
    const key = norm(entry);
    if (free.has(key)) { granted.push(entry); continue; }
    const hit = table.get(key);
    if (hit) { floor += hit.cost; bought.push(`${entry} (r${hit.rank}, ${hit.cost})`); }
    else unknown.push(entry);
  }

  const over = floor > STARTING_XP.max;
  console.log('  stated XP        %s', c.xp ? c.xp.toLocaleString() : '—');
  console.log('  XP floor         %s  from %d table advances%s',
    floor.toLocaleString(), bought.length, over ? '   <-- OVER the 5,000 budget' : '');
  console.log('  origin-granted   %d (free, not counted)', granted.length);
  console.log('  not in tables    %d%s', unknown.length,
    unknown.length ? ': ' + unknown.slice(0, 6).join('; ') + (unknown.length > 6 ? ' …' : '') : '');
  if (over) breaches++;
}

console.log('\n%s', '='.repeat(78));
console.log('%d of %d characters are PROVEN over the %s XP budget by skills and talents alone.',
  breaches, chars.length, STARTING_XP.max.toLocaleString());
console.log('');
console.log('READ THAT AS "not disproven", NOT as "compliant". This audit cannot');
console.log('settle the XP question, for three reasons:');
console.log('');
console.log('  1. Characteristic advances are unknowable. They cost 100-1,500 XP each,');
console.log('     but the premades record only FINAL characteristics, so the starting');
console.log('     values — and the number of advances bought — cannot be recovered.');
console.log('     This is almost certainly where most of the XP went.');
console.log('  2. The career is itself an origin-path step, so its starting skills and');
console.log('     talents are treated as granted free and never matched against the');
console.log('     purchase tables. That is why the floors below are so low. Whether');
console.log('     RT gives career skills free or charges Rank 1 XP for them decides');
console.log('     whether these floors mean anything at all.');
console.log('  3. Entries listed as "not in tables" cannot be costed — they come from');
console.log('     alternate ranks, other books, or supplements not supplied here.');
console.log('');
console.log('The useful output above is the "not in tables" lists: those name entries');
console.log('that come from neither the character\'s career tables nor its origin path.');
