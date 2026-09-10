// Reads a Google Sheet on the browser's behalf.
//
// This has to be a server hop: Google's export endpoints send no CORS headers,
// so a browser cannot fetch a sheet directly however public it is.
//
//   GET /api/sheet?id=<sheetId>              -> CSV of the first tab
//   GET /api/sheet?id=<sheetId>&tab=<name>   -> CSV of that tab
//   GET /api/sheet?id=<sheetId>&tabs=1       -> {"tabs":["...","..."]}
//
// The id is validated against a strict pattern and the URL is built here, so
// this cannot be turned into a general-purpose proxy for arbitrary hosts.

import zlib from "node:zlib";

const ID_RE = /^[A-Za-z0-9_-]{20,}$/;
const MAX_BYTES = 20 * 1024 * 1024;

const csvUrl = (id, tab) =>
  tab
    ? `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`
    : `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`;

const xlsxUrl = (id) =>
  `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`;

/* Pulls one file out of a zip via the central directory, which is where the
   authoritative sizes live — local headers may defer them to a data
   descriptor. Only used for xl/workbook.xml, which is small. */
function unzipEntry(buf, wanted) {
  // End of Central Directory: scan back for the signature
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

async function fetchLimited(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) return { ok: false, status: res.status };
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) return { ok: false, status: 413 };
  return { ok: true, buf };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const { id, tab, tabs } = req.query;
  if (!ID_RE.test(String(id || ""))) {
    return res.status(400).json({ error: "bad_sheet_id" });
  }

  try {
    if (tabs) {
      const got = await fetchLimited(xlsxUrl(id));
      if (!got.ok) {
        return res.status(got.status === 404 ? 404 : 502)
          .json({ error: "fetch_failed", status: got.status });
      }
      const wb = unzipEntry(got.buf, "xl/workbook.xml");
      if (!wb) return res.status(502).json({ error: "workbook_unreadable" });
      const names = [...wb.toString("utf8").matchAll(/<sheet[^>]*name="([^"]*)"/g)]
        .map((m) => m[1]
          .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
      return res.status(200).json({ tabs: names });
    }

    const got = await fetchLimited(csvUrl(id, tab));
    if (!got.ok) {
      // Google answers 404 for a private sheet as readily as a missing one.
      return res.status(got.status === 404 ? 404 : 502)
        .json({ error: "fetch_failed", status: got.status });
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    return res.status(200).send(got.buf.toString("utf8"));
  } catch (e) {
    console.error("[sheet] ", e && e.message);
    return res.status(502).json({ error: "fetch_failed" });
  }
}
