#!/usr/bin/env python3
"""
Checks the pre-made characters against the rules the app already encodes.

Only two things are fully derivable without the rulebooks, and both are checked
here: starting Wounds (2 x Toughness Bonus + the Home World's die + origin
bonuses) and Fate Points (the Home World's 1d10 table + origin bonuses). Both
come from the core rulebook via src/RogueTraderBuilder.jsx, so this is a real
rules check rather than a guess.

Wounds may legitimately exceed the creation maximum through the Sound
Constitution talent (+1 each), so an excess is reported as "needs N x Sound
Constitution" and only called a breach when the talent is absent.

Usage: python3 scripts/audit-premades.py doc.txt
"""
import re
import sys

APP = open('src/RogueTraderBuilder.jsx', encoding='utf-8').read().split('const CSS =')[0]

# --- home world rules, read out of the app data -----------------------------
HOME_ORDER = ['Death World', 'Void Born', 'Forge World', 'Hive World',
              'Imperial World', 'Noble Born']
wound_txt = re.findall(r"woundText: '2 × Toughness Bonus \+ 1d(\d)(?:\+(\d))?'", APP)
fate_tabs = re.findall(r"fateTable: (\[\[.*?\]\])", APP)

HOMES = {}
for i, name in enumerate(HOME_ORDER):
    die, off = wound_txt[i]
    off = int(off or 0)
    tab = [[int(x) for x in pair] for pair in re.findall(r"\[(\d+), (\d+)\]", fate_tabs[i])]
    HOMES[name] = {
        'wound_min': 1 + off, 'wound_max': int(die) + off,
        'wound_text': '1d%s%s' % (die, '+%d' % off if off else ''),
        'fate_values': sorted({v for _, v in tab}),
    }

WOUND_BONUS = {'Endurance': 1}
FATE_BONUS = {'Fortune': 1, 'Chosen by Destiny': 1}


def parse_doc(path):
    lines = open(path, encoding='utf-8-sig').read().split('\n')
    heads = [(i, m.group(2).strip()) for i, l in enumerate(lines)
             for m in [re.match(r'^(\d+)\.\s+(.*)$', l)] if m]
    out = []
    for k, (i, title) in enumerate(heads):
        end = heads[k + 1][0] if k + 1 < len(heads) else len(lines)
        body = lines[i + 1:end]
        f = {}
        for l in body:
            m = re.match(r'^\s*\*\s*([^:]{1,40}):\s*(.*)$', l)
            if m and m.group(1).strip() not in f:
                f[m.group(1).strip()] = m.group(2).strip()
        vals, started = [], False
        for l in body:
            t = l.strip().lstrip('\t').strip()
            if t == 'Characteristics':
                started = True; continue
            if not started:
                continue
            if re.fullmatch(r'(WS|BS|S|T|Ag|Int|Per|WP|Fel)', t):
                continue
            m = re.match(r'^(\d{1,3})\b', t)
            if m:
                vals.append(int(m.group(1)))
                if len(vals) == 9:
                    break
            elif vals:
                break
        talents = (f.get('Combat & General', '') + ' ' + f.get('Talents', ''))
        out.append({
            'name': re.sub(r'\s*\([^)]*\)\s*$', '', title),
            'path': [p.strip() for p in re.split(r'[→>]+', f.get('Origin Path', '')) if p.strip()],
            'stats': vals,
            'wounds': f.get('Wounds', ''),
            'fate': f.get('Fate Points', ''),
            'psy': f.get('Psy Rating', ''),
            'talents': talents,
        })
    return out


def main():
    chars = parse_doc(sys.argv[1])
    issues = []
    print('%-31s %-8s %-18s %-18s' % ('CHARACTER', 'T / TB', 'WOUNDS', 'FATE'))
    print('-' * 80)
    for c in chars:
        if not c['path'] or not c['stats']:
            print('%-31s %s' % (c['name'][:31], '— no origin path / stats: not checkable here'))
            issues.append((c['name'], 'no origin path in the doc; needs Into the Storm to validate'))
            continue

        home = next((h for h in HOME_ORDER if h in c['path'][0]), None)
        if not home:
            print('%-31s unrecognised home world %r' % (c['name'][:31], c['path'][0]))
            issues.append((c['name'], 'home world %r is not one of the six' % c['path'][0]))
            continue

        rules = HOMES[home]
        T = c['stats'][3]
        TB = T // 10
        wb = sum(WOUND_BONUS.get(p, 0) for p in c['path'])
        fb = sum(FATE_BONUS.get(p, 0) for p in c['path'])
        lo, hi = 2 * TB + rules['wound_min'] + wb, 2 * TB + rules['wound_max'] + wb
        fates = [v + fb for v in rules['fate_values']]

        w = int(re.sub(r'\D', '', c['wounds']) or 0)
        fp = int(re.sub(r'\D', '', c['fate']) or 0)

        wnote = 'ok'
        if w > hi:
            over = w - hi
            has_sc = 'Sound Constitution' in c['talents']
            wnote = '+%d over max %d %s' % (over, hi, '(Sound Constitution)' if has_sc else 'NO Sound Constitution')
            if not has_sc:
                issues.append((c['name'], 'Wounds %d exceeds creation max %d by %d with no Sound Constitution talent listed' % (w, hi, over)))
        elif w < lo:
            wnote = 'below min %d' % lo
            issues.append((c['name'], 'Wounds %d is below the minimum %d' % (w, lo)))

        fnote = 'ok'
        if fp not in fates:
            fnote = 'not in %s' % fates
            issues.append((c['name'], 'Fate %d is not attainable for %s (%s)' % (fp, home, fates)))

        print('%-31s %-8s %-18s %-18s' % (
            c['name'][:31], '%d / %d' % (T, TB),
            '%d (%d-%d) %s' % (w, lo, hi, wnote if wnote != 'ok' else ''),
            '%d %s' % (fp, fnote if fnote != 'ok' else '')))

    print('\n%d issue(s):' % len(issues))
    for n, i in issues:
        print('  - %-30s %s' % (n[:30], i))


if __name__ == '__main__':
    main()
