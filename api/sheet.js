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

import { workbookNames, sheetRows, toCsv } from "../lib/xlsx.js";

const ID_RE = /^[A-Za-z0-9_-]{20,}$/;
const MAX_BYTES = 20 * 1024 * 1024;

// Everything comes from the xlsx export, tab listing and CSV alike.
//
// The CSV endpoints cannot be used: gviz/tq serves a stale snapshot (it went on
// returning a sheet's previous contents long after it was re-imported, and a
// cache-buster changed nothing), and export?format=csv ignores `sheet` and
// always hands back the first tab. See lib/xlsx.js.
const xlsxUrl = (id) =>
  `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`;

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
    const got = await fetchLimited(xlsxUrl(id));
    if (!got.ok) {
      // Google answers 404 for a private sheet as readily as a missing one.
      return res.status(got.status === 404 ? 404 : 502)
        .json({ error: "fetch_failed", status: got.status });
    }

    if (tabs) {
      const names = workbookNames(got.buf);
      if (!names.length) return res.status(502).json({ error: "workbook_unreadable" });
      return res.status(200).json({ tabs: names });
    }

    const rows = sheetRows(got.buf, tab ? String(tab) : null);
    // Distinguishable from an unreadable sheet: the workbook loaded, the tab is
    // simply not in it — usually a typo or a renamed tab.
    if (rows === null) {
      return res.status(404).json({ error: "tab_not_found", tabs: workbookNames(got.buf) });
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    return res.status(200).send(toCsv(rows));
  } catch (e) {
    console.error("[sheet] ", e && e.message);
    return res.status(502).json({ error: "fetch_failed" });
  }
}
