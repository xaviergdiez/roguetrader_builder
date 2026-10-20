# -*- coding: utf-8 -*-
"""Turn 40krpgtools' bestiary index into src/bestiaryindex.js.

The source is an INDEX, not a stat database: name, type, affiliation, book
and page, nothing more. So what this produces is a lookup — "where is the
Rak'Gol Abomination printed" — and not a creature the app can roll for you.
Run:  python3 -I scripts/build-bestiary-index.py <saved-html> > src/bestiaryindex.js
"""
import re, sys, html, json, collections

SETTING = 'Rogue Trader'
# Starships and vehicles are a different system entirely — the app builds
# voidships from hulls and components — so only what a boarding party could
# meet comes through.
CREATURE_TYPES = {'Xenos', 'Human', 'Beast', 'Daemon', 'Warp Entity',
                  'Servitor', 'Mutant', 'Space Marine', 'Techpriest', 'Machine'}

def clean(s):
    s = html.unescape(re.sub(r'<[^>]+>', '', s)).strip()
    return re.sub(r'\s+', ' ', s)

def main(path):
    raw = open(path, encoding='utf-8', errors='replace').read()
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', raw, re.S)
    by_name = collections.OrderedDict()
    for r in rows:
        cells = [clean(c) for c in re.findall(r'<td[^>]*>(.*?)</td>', r, re.S)]
        if len(cells) != 6:
            continue
        name, kind, affil, setting, book, page = cells
        if setting != SETTING or kind not in CREATURE_TYPES:
            continue
        rec = by_name.setdefault(name, {'name': name, 'type': kind,
                                        'affiliation': affil, 'sources': []})
        src = {'book': book, 'page': int(page)} if page.isdigit() else {'book': book}
        if src not in rec['sources']:
            rec['sources'].append(src)
    entries = list(by_name.values())

    out = []
    out.append('// Where a creature is printed. Generated from 40krpgtools.com’s bestiary')
    out.append('// index by scripts/build-bestiary-index.py — do not edit by hand.')
    out.append('//')
    out.append('// THIS IS A LOOKUP, NOT A STAT BLOCK. The source is an index of book and')
    out.append('// page numbers and carries no characteristics, Wounds or weapons, which is')
    out.append('// deliberate on its part: it tells a GM where to find a creature in their')
    out.append('// own books rather than reproducing what is in them. So an entry here can')
    out.append('// answer "which book is the Rak’Gol Abomination in" and can put a named')
    out.append('// placeholder on the board, and it cannot roll one for you — the numbers')
    out.append('// are typed in from the page it names.')
    out.append('//')
    out.append('// npcgen.js’s BESTIARY is the other thing: a short list that DOES carry')
    out.append('// numbers, and can be spawned ready to fight.')
    out.append('//')
    out.append('// Starships and vehicles are left out: this app builds voidships from')
    out.append('// hulls and components, and a tank is not a boarding-action combatant.')
    out.append('')
    out.append('export const BESTIARY_INDEX = [')
    for e in entries:
        out.append('  ' + json.dumps(e, ensure_ascii=False) + ',')
    out.append('];')
    out.append('')
    out.append('export const TYPES = [...new Set(BESTIARY_INDEX.map((e) => e.type))].sort();')
    out.append('')
    out.append('export const indexEntry = (name) => BESTIARY_INDEX.find(')
    out.append('  (e) => e.name.toLowerCase() === String(name || \'\').toLowerCase()) || null;')
    out.append('')
    out.append('// Where to look it up, as one line.')
    out.append('export const citation = (e) => (e && e.sources || [])')
    out.append('  .map((s) => s.page ? `${s.book} p. ${s.page}` : s.book).join(\'; \');')
    out.append('')
    out.append('// Substring search over the name, with an optional type filter. Capped')
    out.append('// because the caller renders every hit and there are hundreds of them.')
    out.append('export function searchBestiary(query, { type = null, limit = 40 } = {}) {')
    out.append('  const q = String(query || \'\').trim().toLowerCase();')
    out.append('  if (!q && !type) return [];')
    out.append('  return BESTIARY_INDEX')
    out.append('    .filter((e) => (!type || e.type === type)')
    out.append('      && (!q || e.name.toLowerCase().includes(q)')
    out.append('        || e.affiliation.toLowerCase().includes(q)))')
    out.append('    .slice(0, limit);')
    out.append('}')
    out.append('')
    out.append('// A placeholder for the board. No numbers, because the index has none:')
    out.append('// it arrives named and cited, and the GM fills in what the book says.')
    out.append('export function indexToNpc(name) {')
    out.append('  const e = indexEntry(name);')
    out.append('  if (!e) return null;')
    out.append('  return {')
    out.append('    name: e.name, max: 1, ws: null, bs: null,')
    out.append('    toughnessBonus: null, armour: null, weapon: null,')
    out.append('    custom: true, note: citation(e)')
    out.append('  };')
    out.append('}')
    print('\n'.join(out))
    print(f'// {len(entries)} creatures across '
          f'{len({s["book"] for e in entries for s in e["sources"]})} books',
          file=sys.stderr)

main(sys.argv[1])
