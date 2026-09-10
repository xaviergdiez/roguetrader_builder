#!/usr/bin/env python3
"""
Converts the pre-made characters in the shared Google Doc into the sheet import
format — one tab per character — and writes them as a single .xlsx so the whole
set can be brought into Google Sheets in one upload.

Usage:
    curl -sL "https://docs.google.com/document/d/<ID>/export?format=txt" -o doc.txt
    python3 scripts/convert-doc.py doc.txt characters.xlsx

Why these characters need extra rows that character-template.csv does not have:
they are 5,000-7,500 XP builds, so their characteristics are FINAL values after
origin modifiers and advances. Several sit above 45, which no 2d10+25 roll can
produce. Feeding them into the roll rows would make the app add origin modifiers
a second time, so they go in a separate "final characteristics" block that is
used verbatim.
"""
import re
import sys
import zipfile
from xml.sax.saxutils import escape

CHARS = [
    ("WS", "Weapon Skill"), ("BS", "Ballistic Skill"), ("S", "Strength"),
    ("T", "Toughness"), ("Ag", "Agility"), ("Int", "Intelligence"),
    ("Per", "Perception"), ("WP", "Willpower"), ("Fel", "Fellowship"),
]
STEP_LABELS = ["Home World", "Birthright", "Lure of the Void", "Trials",
               "Motivation", "Career (origin step)"]


def bullet(line):
    """'   * Key: Value' -> (indent, 'Key', 'Value'), else None."""
    m = re.match(r"^(\s*)\*\s*([^:]{1,40}):\s*(.*)$", line)
    return (len(m.group(1)), m.group(2).strip(), m.group(3).strip()) if m else None


# The document's own field names. Anything else at bullet level is the content
# of the heading above it.
KNOWN_FIELDS = {
    "XP Total", "Career", "Role in Crew", "Concept", "Origin Path",
    "Wounds", "Fate Points", "Psy Rating", "Secret (GM Only)", "Favour Owed",
    "Trained", "Combat & General", "Skills", "Talents",
    "Origin / Trait Modifiers", "Origin / Race",
    "Biomancy", "Pyromancy",
}


def collect_fields(lines):
    """Bullets into a dict.

    Some headings carry no value of their own and put the content in the
    bullets beneath them:

        * Special Abilities:
        * Pure Faith: Immune to Daemonic Presence; ...
        * Rage of the Zealot: Inflicts Righteous Fury ...

    The Google Docs text export FLATTENS that nesting — parent and children
    come out at the same indent — so depth cannot identify the children.
    What distinguishes them is that their keys are not field names, so an
    empty heading absorbs following bullets until a known field or a bare
    section heading turns up.
    """
    fields = {}
    for i, l in enumerate(lines):
        b = bullet(l)
        if not b:
            continue
        indent, key, val = b
        if not val:
            kids = []
            for l2 in lines[i + 1:]:
                b2 = bullet(l2)
                if not b2:
                    if l2.strip():     # a bare heading ends the group
                        break
                    continue
                if b2[0] < indent or b2[1] in KNOWN_FIELDS:
                    break
                kids.append("%s: %s" % (b2[1], b2[2]) if b2[2] else b2[1])
            if kids:
                val = "; ".join(kids)
        if key not in fields or (not fields[key] and val):
            fields[key] = val
    return fields


def split_characters(lines):
    """Slice the doc at 'N. Title' headings."""
    heads = [(i, m.group(1), m.group(2).strip())
             for i, l in enumerate(lines)
             for m in [re.match(r"^(\d+)\.\s+(.*)$", l)] if m]
    out = []
    for k, (i, num, title) in enumerate(heads):
        end = heads[k + 1][0] if k + 1 < len(heads) else len(lines)
        out.append({"num": int(num), "title": title, "lines": lines[i + 1:end]})
    return out


def parse_characteristics(lines):
    """The 9 abbreviations then 9 numbers, one per line, tab-indented.

    The last value often has the next bullet glued onto the same line
    ('\t48   * Wounds: 11'), so numbers are taken with a search rather than a
    full-line match.
    """
    values, seen_header = [], False
    for l in lines:
        s = l.strip().lstrip("\t").strip()
        if s == "Characteristics":
            seen_header = True
            continue
        if not seen_header:
            continue
        if re.fullmatch(r"(WS|BS|S|T|Ag|Int|Per|WP|Fel)", s):
            continue
        m = re.match(r"^(\d{1,3})\b", s)
        if m:
            values.append(int(m.group(1)))
            if len(values) == 9:
                break
            continue
        if values:            # a non-numeric line after numbers started
            break
    return values if len(values) == 9 else []


def parse_origin_path(text):
    """'A -> B (choice) -> C ...' into six segments plus their parentheticals."""
    if not text:
        return [], []
    parts = [p.strip() for p in re.split(r"[→>]+", text) if p.strip()]
    steps, choices = [], []
    for p in parts:
        m = re.match(r"^(.*?)\s*\(([^)]*)\)\s*$", p)
        if m:
            steps.append(m.group(1).strip())
            choices.append((m.group(1).strip(), m.group(2).strip()))
        else:
            steps.append(p)
    return steps, choices


def section_body(lines, *headings):
    """Lines following a bare heading, until the next heading or bullet block."""
    for i, l in enumerate(lines):
        if l.strip() in headings:
            body = []
            for j in range(i + 1, len(lines)):
                s = lines[j].strip()
                if not s:
                    continue
                if s in ("Skills", "Talents", "Wargear", "Characteristics",
                         "Skills & Talents", "Psychic Disciplines & Powers"):
                    break
                body.append(s.lstrip("*").strip())
            return " ".join(body).strip()
    return ""


def convert(ch):
    L = ch["lines"]
    fields = collect_fields(L)

    steps, choices = parse_origin_path(fields.get("Origin Path", ""))
    stats = parse_characteristics(L)

    # 'The Swashbuckling Dynasty Heir (Rogue Trader)' -> name, career hint
    m = re.match(r"^(.*?)\s*\(([^)]*)\)\s*$", ch["title"])
    name, hint = (m.group(1).strip(), m.group(2).strip()) if m else (ch["title"], "")

    rows = [("Field", "Value")]
    add = rows.append

    add(("# — IDENTITY —", ""))
    add(("Name", name))
    add(("Career", fields.get("Career", hint)))
    add(("Concept", fields.get("Concept", "")))
    add(("Role in crew", fields.get("Role in Crew", "")))
    add(("XP total", fields.get("XP Total", "")))
    add(("Portrait URL", ""))

    add(("# — ORIGIN PATH —", "blank where the character has none (xenos)"))
    for i, label in enumerate(STEP_LABELS):
        add((label, steps[i] if i < len(steps) else ""))
    add(("Origin path choices", "; ".join("%s: %s" % c for c in choices)))

    add(("# — FINAL CHARACTERISTICS —",
         "already include origin modifiers and advances — do NOT reapply"))
    for i, (_, label) in enumerate(CHARS):
        add((label, stats[i] if i < len(stats) else ""))

    add(("# — DERIVED —", ""))
    add(("Final wounds", fields.get("Wounds", "")))
    add(("Final fate points", fields.get("Fate Points", "")))
    add(("Psy rating", fields.get("Psy Rating", "")))

    add(("# — ABILITIES —", ""))
    # The doc names this field five different ways ("Special Ability",
    # "Special Abilities", "Special Trait", "Special Traits", "Special Traits
    # & Abilities"), so match the prefix rather than chase the variants. Warp
    # Eye is the Navigator equivalent and sits under its own heading.
    ability = "; ".join(
        v for k, v in fields.items()
        if v and (k.startswith("Special") or k == "Warp Eye")
    )
    add(("Special ability", ability))
    add(("Origin / trait modifiers", fields.get("Origin / Trait Modifiers")
         or fields.get("Origin / Race", "")))
    add(("Psychic powers", section_body(L, "Psychic Disciplines & Powers")))

    add(("# — SKILLS, TALENTS, WARGEAR —", "semicolon separated"))
    add(("Skills", fields.get("Skills") or fields.get("Trained")
         or section_body(L, "Skills")))
    add(("Talents", fields.get("Talents") or fields.get("Combat & General")
         or section_body(L, "Talents")))
    add(("Wargear", section_body(L, "Wargear")))

    add(("# — GM —", ""))
    add(("Secret", fields.get("Secret (GM Only)", "")))
    add(("Favour owed", fields.get("Favour Owed", "")))

    return name, rows


# ---------------------------------------------------------------- xlsx writer
def col(n):
    s = ""
    while n >= 0:
        s = chr(ord("A") + n % 26) + s
        n = n // 26 - 1
    return s


def sheet_xml(rows):
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
           '<cols><col min="1" max="1" width="34" customWidth="1"/>',
           '<col min="2" max="2" width="88" customWidth="1"/></cols><sheetData>']
    for r, row in enumerate(rows, 1):
        out.append('<row r="%d">' % r)
        for c, v in enumerate(row):
            if v == "" or v is None:
                continue
            ref = "%s%d" % (col(c), r)
            if isinstance(v, int):
                out.append('<c r="%s"><v>%d</v></c>' % (ref, v))
            else:
                out.append('<c r="%s" t="inlineStr"><is><t xml:space="preserve">%s</t></is></c>'
                           % (ref, escape(str(v))))
        out.append("</row>")
    out.append("</sheetData></worksheet>")
    return "".join(out)


def tab_name(name, used):
    # Excel/Sheets: max 31 chars, no : \ / ? * [ ]
    n = re.sub(r"[:\\/?*\[\]]", "-", name)[:31].strip() or "Sheet"
    base, i = n, 2
    while n.lower() in used:
        suffix = " %d" % i
        n = base[:31 - len(suffix)] + suffix
        i += 1
    used.add(n.lower())
    return n


def write_xlsx(path, tabs):
    ct = ['<?xml version="1.0" encoding="UTF-8"?>',
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
          '<Default Extension="xml" ContentType="application/xml"/>',
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>']
    for i in range(len(tabs)):
        ct.append('<Override PartName="/xl/worksheets/sheet%d.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' % (i + 1))
    ct.append("</Types>")

    wb = ['<?xml version="1.0" encoding="UTF-8"?>',
          '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
          'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>']
    rels = ['<?xml version="1.0" encoding="UTF-8"?>',
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">']
    for i, (nm, _) in enumerate(tabs, 1):
        wb.append('<sheet name="%s" sheetId="%d" r:id="rId%d"/>' % (escape(nm), i, i))
        rels.append('<Relationship Id="rId%d" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet%d.xml"/>' % (i, i))
    wb.append("</sheets></workbook>")
    rels.append("</Relationships>")

    root_rels = ('<?xml version="1.0" encoding="UTF-8"?>'
                 '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                 '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
                 '</Relationships>')

    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", "".join(ct))
        z.writestr("_rels/.rels", root_rels)
        z.writestr("xl/workbook.xml", "".join(wb))
        z.writestr("xl/_rels/workbook.xml.rels", "".join(rels))
        for i, (_, rows) in enumerate(tabs, 1):
            z.writestr("xl/worksheets/sheet%d.xml" % i, sheet_xml(rows))


def main():
    doc, out = sys.argv[1], sys.argv[2]
    lines = open(doc, encoding="utf-8-sig").read().split("\n")
    chars = split_characters(lines)
    used, tabs, problems = set(), [], []
    for ch in chars:
        name, rows = convert(ch)
        stats = [r for r in rows if r[0] == "Fellowship"]
        if not stats or stats[0][1] == "":
            problems.append("%s: characteristics not parsed" % name)
        if not any(r[0] == "Home World" and r[1] for r in rows):
            problems.append("%s: no origin path (xenos or non-standard)" % name)
        tabs.append((tab_name(name, used), rows))
    write_xlsx(out, tabs)
    print("wrote %s — %d tabs" % (out, len(tabs)))
    for nm, _ in tabs:
        print("  %s" % nm)
    if problems:
        print("\nneeds a human decision:")
        for p in problems:
            print("  - %s" % p)


if __name__ == "__main__":
    main()
