// Reads a Google Sheets .xlsx export: tab names, and one tab as CSV.
//
// WHY NOT JUST ASK GOOGLE FOR CSV
//
// Google has two CSV endpoints and neither works:
//
//   gviz/tq?tqx=out:csv&sheet=<name>   serves a STALE snapshot. After the
//     shared sheet was re-imported it kept returning the previous contents —
//     25 flattened rows instead of 41 correct ones — and a cache-busting
//     parameter made no difference. Every character imported blank because of
//     it, long after the sheet itself was fixed.
//   export?format=csv&sheet=<name>     is fresh but ignores `sheet` and always
//     returns the FIRST tab, which is worse: plausible data from the wrong
//     character. It only honours `gid`, and gids are not discoverable from the
//     sheet without authentication.
//
// export?format=xlsx is fresh and carries every tab with its name, so the tab
// is picked here instead. One request also covers a bulk import of all tabs.
//
// No xlsx dependency: this needs sheet names and two columns of text, which is
// a small amount of zip and XML work. Pure apart from zlib — see xlsx.check.mjs.

import zlib from "node:zlib";

/* --------------------------------- zip --------------------------------- */

// Pulls one file out of a zip via the central directory, which is where the
// authoritative sizes live — local headers may defer them to a data descriptor.
export function unzipEntry(buf, wanted) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;

  let n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  while (n-- > 0 && p + 46 <= buf.length) {
    if (buf.readUInt32LE(p) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString("utf8");

    if (name === wanted) {
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const data = buf.slice(start, start + compSize);
      return method === 0 ? data : zlib.inflateRawSync(data);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

/* --------------------------------- XML --------------------------------- */

export function unescapeXml(s) {
  return String(s)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");            // last, so &amp;lt; does not become <
}

// All the <t> text inside one element, concatenated. Rich text splits a single
// string across several runs, and dropping the later ones would truncate it.
function textOf(xml) {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
    .map((m) => unescapeXml(m[1])).join("");
}

export function parseSharedStrings(xml) {
  if (!xml) return [];
  return [...String(xml).matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)]
    .map((m) => textOf(m[1]));
}

// "BC" -> 55. Column letters are base-26 with A=1.
export function colToIndex(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

// Walks <tag …>…</tag> and <tag …/> elements, handing each one its attributes
// and body.
//
// Not a regex with an alternation for the self-closing form: `[^>]*` is happy
// to swallow the `/` of `<c r="A1"/>`, which then reads as an open tag and
// absorbs the following cell. Google emits a self-closing cell for every empty
// one, so that quietly merged real columns.
function eachTag(xml, tag, fn) {
  const open = new RegExp(`<${tag}\\b([^>]*)>`, "g");
  const closeTag = `</${tag}>`;
  const s = String(xml || "");
  let m;
  while ((m = open.exec(s))) {
    let attrs = m[1] || "";
    if (attrs.endsWith("/")) {
      fn(attrs.slice(0, -1), "");
      continue;
    }
    const close = s.indexOf(closeTag, open.lastIndex);
    if (close === -1) { fn(attrs, ""); continue; }
    fn(attrs, s.slice(open.lastIndex, close));
    open.lastIndex = close + closeTag.length;
  }
}

// Worksheet XML -> array of rows, each an array of cell strings.
//
// Row and column positions come from the `r` references rather than document
// order, because a sparse sheet omits empty cells entirely: reading them in
// order would shift every value left into the wrong column.
export function parseSheetXml(xml, shared = []) {
  const rows = [];
  let maxRow = 0;

  eachTag(xml, "row", (attrs, body) => {
    const rAttr = /\br="(\d+)"/.exec(attrs);
    // Without r, rows are sequential from where the last one left off.
    const rowIx = rAttr ? Number(rAttr[1]) : maxRow + 1;
    maxRow = Math.max(maxRow, rowIx);

    const cells = [];
    eachTag(body, "c", (cAttrs, cBody) => {
      const ref = /\br="([A-Z]+)\d+"/.exec(cAttrs);
      const type = (/\bt="([^"]+)"/.exec(cAttrs) || [])[1] || "n";
      const col = ref ? colToIndex(ref[1]) : cells.length + 1;

      let value = "";
      if (type === "s") {
        const v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(cBody);
        const ix = v ? Number(unescapeXml(v[1])) : NaN;
        value = Number.isInteger(ix) && shared[ix] !== undefined ? shared[ix] : "";
      } else if (type === "inlineStr") {
        value = textOf(cBody);
      } else {
        // numbers, "str" formula results, booleans — all read as their text
        const v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(cBody);
        value = v ? unescapeXml(v[1]) : "";
        // Google writes whole numbers as "28.0". Canonicalised here so a
        // reader downstream sees 28: the CSV endpoint this replaced emitted
        // plain integers, and "28.0" reaching a parser that strips
        // non-digits became 280.
        if (type === "n" && value !== "" && Number.isFinite(Number(value))) {
          value = String(Number(value));
        }
      }
      cells[col - 1] = value;
    });

    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = "";
    rows[rowIx - 1] = cells;
  });

  for (let i = 0; i < rows.length; i++) if (rows[i] === undefined) rows[i] = [];

  // Google pads an exported sheet out to 1000 rows; the trailing empties are
  // not data and would swamp anything reading the result.
  while (rows.length && rows[rows.length - 1].every((c) => !String(c).trim())) rows.pop();
  return rows;
}

/* ------------------------------- workbook ------------------------------- */

// [{ name, part }] in workbook order, resolved through the rels file because a
// sheet's XML part is not reliably sheet<N>.xml in the order listed.
export function readWorkbook(buf) {
  const wb = unzipEntry(buf, "xl/workbook.xml");
  if (!wb) return null;
  const relsXml = unzipEntry(buf, "xl/_rels/workbook.xml.rels");

  const rels = new Map();
  for (const m of String(relsXml || "").matchAll(/<Relationship\s[^>]*>/g)) {
    const id = (/\bId="([^"]+)"/.exec(m[0]) || [])[1];
    const target = (/\bTarget="([^"]+)"/.exec(m[0]) || [])[1];
    if (id && target) rels.set(id, target);
  }

  const sheets = [];
  for (const m of String(wb.toString("utf8")).matchAll(/<sheet\s[^>]*\/?>/g)) {
    const name = (/\bname="([^"]*)"/.exec(m[0]) || [])[1];
    const rid = (/\br:id="([^"]+)"/.exec(m[0]) || [])[1];
    if (name === undefined) continue;
    let target = rels.get(rid) || "";
    target = target.replace(/^\/?xl\//, "").replace(/^\//, "");
    sheets.push({
      name: unescapeXml(name),
      part: target ? `xl/${target}` : null
    });
  }
  return sheets;
}

export const workbookNames = (buf) => (readWorkbook(buf) || []).map((s) => s.name);

// Rows of one tab by name, or null when the workbook has no such tab.
// Falls back to position when the rels lookup came up empty.
export function sheetRows(buf, wantedName) {
  const sheets = readWorkbook(buf);
  if (!sheets) return null;

  const ix = wantedName
    ? sheets.findIndex((s) => s.name === wantedName)
    : 0;
  if (ix < 0) return null;

  const part = sheets[ix].part || `xl/worksheets/sheet${ix + 1}.xml`;
  const xml = unzipEntry(buf, part);
  if (!xml) return null;

  const shared = parseSharedStrings(
    (unzipEntry(buf, "xl/sharedStrings.xml") || Buffer.alloc(0)).toString("utf8")
  );
  return parseSheetXml(xml.toString("utf8"), shared);
}

/* --------------------------------- CSV --------------------------------- */

// RFC4180: quote anything holding a comma, quote, or newline; double the quotes.
export function toCsv(rows) {
  return (rows || []).map((row) => (row || []).map((cell) => {
    const s = cell == null ? "" : String(cell);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\r\n");
}
