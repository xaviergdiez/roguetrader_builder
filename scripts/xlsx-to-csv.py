#!/usr/bin/env python3
"""
Splits characters.xlsx into one CSV per character.

    python3 scripts/xlsx-to-csv.py characters.xlsx out/

Why this exists: the Google Sheet the app imports from had every tab flattened
on the way in — the whole IDENTITY and ORIGIN PATH block ended up inside a
single cell, so A1 read "Field # — IDENTITY — Name Career Concept ..." and the
character carried no name, no origin path and no gear. The workbook in this repo
is intact, so these CSVs are the repair: import one per tab, or re-upload the
workbook itself.

Emits the same two-column shape as character-template.csv, including the
"# — SECTION —" marker rows. Those markers are not decoration: parseCharacterSheet
uses them to tell FINAL characteristics from 2d10+25 rolls, and a sheet that
loses them has its final values treated as rolls with origin modifiers applied
a second time.
"""
import csv
import os
import re
import sys
import zipfile
from xml.etree import ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def read_workbook(path):
    """-> [(tab name, [[cell, ...], ...]), ...] in workbook order."""
    z = zipfile.ZipFile(path)

    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(NS + "si"):
            shared.append("".join(t.text or "" for t in si.iter(NS + "t")))

    rels = {r.get("Id"): r.get("Target")
            for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    wb = ET.fromstring(z.read("xl/workbook.xml"))

    out = []
    for sheet in wb.iter(NS + "sheet"):
        target = rels[sheet.get(REL_NS + "id")].lstrip("/")
        if not target.startswith("xl/"):
            target = "xl/" + target
        out.append((sheet.get("name"), read_sheet(z, target, shared)))
    return out


def cell_text(c, shared):
    v, is_ = c.find(NS + "v"), c.find(NS + "is")
    if c.get("t") == "s" and v is not None:
        return shared[int(v.text)]
    if is_ is not None:
        return "".join(t.text or "" for t in is_.iter(NS + "t"))
    return v.text if v is not None else ""


def read_sheet(z, target, shared):
    rows = []
    for row in ET.fromstring(z.read(target)).iter(NS + "row"):
        cells = {}
        width = 0
        for c in row.iter(NS + "c"):
            col = re.match(r"[A-Z]+", c.get("r")).group()
            n = 0
            for ch in col:                      # A->1, B->2, ... AA->27
                n = n * 26 + (ord(ch) - 64)
            cells[n] = (cell_text(c, shared) or "").strip()
            width = max(width, n)
        rows.append([cells.get(i, "") for i in range(1, width + 1)])
    return rows


def safe_name(name):
    return re.sub(r"[^\w .\-]", "_", name).strip() or "character"


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__.strip())
    src, outdir = sys.argv[1], sys.argv[2]
    os.makedirs(outdir, exist_ok=True)

    tabs = read_workbook(src)
    for name, rows in tabs:
        path = os.path.join(outdir, safe_name(name) + ".csv")
        with open(path, "w", newline="", encoding="utf-8") as fh:
            # QUOTE_ALL, because a value like "Common Lore (Imperium, Underworld)"
            # holds the delimiter and splitEntries relies on it arriving whole.
            csv.writer(fh, quoting=csv.QUOTE_ALL).writerows(rows)
        filled = sum(1 for r in rows if len(r) > 1 and r[1].strip())
        print(f"{path}  {len(rows)} rows, {filled} filled")

    print(f"\n{len(tabs)} character(s) written to {outdir}")


if __name__ == "__main__":
    main()
