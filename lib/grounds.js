// What the ground store keeps, and the one thing besides the endpoint that
// writes to it: finding grounds the index has lost. Lives outside /api for the
// same reason decks.js and storage.js do: every .js under /api becomes a
// serverless function, and the Hobby plan caps a deployment at twelve.

import { isCharId } from "./storage.js";

export const MAX_NAME = 60;
// Upstash rejects a record over 1MB. A ground is shrunk to 512px client-side,
// which lands near 60KB as a data URL, so anything approaching this is a
// surprise worth reporting rather than an opaque failure from the driver.
export const MAX_TEXTURE_BYTES = 900_000;
/* A sheet is sixteen tokens in one image, kept at 1024px: four times the area
   of a floor and mostly transparent, which WebP packs well. Its own ceiling
   because it is its own record. */
export const MAX_SPRITES_BYTES = 900_000;
// Enough for a campaign's worth without the index itself becoming a payload.
export const MAX_GROUNDS = 60;

export const IMAGE_URL = /^data:image\/(png|jpeg|webp);base64,/;

export const text = (v, fallback = "", max = MAX_NAME) => {
  const s = String(v ?? "").trim().slice(0, max);
  return s || fallback;
};

export const colour = (v, fallback) =>
  (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)) ? v : fallback;

export const num = (v, fallback, lo, hi) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

// The index entry: everything the picker and the renderer need EXCEPT the
// floor itself. Kept narrow on purpose: this is fetched on every load.
export const meta = (gid, body, hasSprites, now = Date.now()) => ({
  id: gid,
  name: text(body.name, "Saved ground"),
  subtitle: text(body.subtitle, "", 120),
  prompt: text(body.prompt, "", 800),
  grid: colour(body.grid, "#8fe0a8"),
  accent: colour(body.accent, "#8a7442"),
  fallback: colour(body.fallback, "#2a2a24"),
  wash: num(body.wash, 0.2, 0, 0.5),
  gridAlpha: num(body.gridAlpha, 0.35, 0.11, 1),
  // Whether this ground has props, not the props themselves: the picker wants
  // to say so, and the renderer wants to know whether to ask for the sheet.
  sprites: !!hasSprites,
  updatedAt: now,
});

/* ------------------------------ finding lost grounds ------------------------------

   A floor is written under a key of its own BEFORE its entry is added to the
   index, so an entry never points at nothing. A floor with no entry is merely
   inert, and stays so for ever: signing in used to replace the whole user
   record (see signInRecord in auth.js), which dropped every entry and left
   every floor stored and unlisted.

   This lists them again, the way runReindex does for decks, with the same
   limits: only this account's own keys, only entries added, nothing changed or
   removed. What the entry held (the name, the prompt that made the floor, its
   colours) lived only in the lost entry, so a recovered ground is called
   "Recovered environment N" and takes the ordinary defaults; the floor itself
   is untouched and renders as it always did. A ground's props sheet is under
   `<ground key>:sprites`, which the same walk finds and which sets the
   sprites flag; a sheet with no floor is not a ground and is left alone. */
export const REINDEX_MAX = 50;
const SCAN_ROUNDS = 100;
const SPRITES_SUFFIX = ":sprites";

const list = (v) => (Array.isArray(v) ? v : []);

/* `user` is a snapshot; the change itself goes through `update(fn)`, which runs
   `fn` on the account record as it is at that moment (see updateUser in auth.js). */
export async function runGroundsReindex({ user, redis, prefix, update, now = Date.now() }) {
  if (typeof prefix !== "string" || !prefix || /[*?\[\]\\]/.test(prefix)) {
    return { status: 400, json: { error: "bad_prefix" } };
  }
  if (typeof redis.scan !== "function") return { status: 501, json: { error: "scan_unavailable" } };
  if (!Array.isArray(user.grounds)) user.grounds = [];

  const indexed = new Set(user.grounds.map((g) => g.id));
  const floors = new Set();
  const sheets = new Set();
  let cursor = "0";
  for (let round = 0; round < SCAN_ROUNDS; round++) {
    const [next, keys] = await redis.scan(cursor, { match: prefix + "*", count: 200 });
    for (const k of keys || []) {
      if (typeof k !== "string" || !k.startsWith(prefix)) continue;
      const rest = k.slice(prefix.length);
      if (rest.endsWith(SPRITES_SUFFIX)) {
        const base = rest.slice(0, -SPRITES_SUFFIX.length);
        if (isCharId(base)) sheets.add(base);
      } else if (isCharId(rest)) {
        floors.add(rest);
      }
    }
    cursor = String(next);
    if (cursor === "0") break;
  }

  const ids = [...floors].filter((id) => !indexed.has(id)).sort();
  const room = Math.max(0, MAX_GROUNDS - user.grounds.length);
  const take = ids.slice(0, Math.min(room, REINDEX_MAX));
  let n = user.grounds.filter((g) => /^Recovered environment \d+$/.test(g.name || "")).length;
  const added = [];
  let unreadable = 0;
  for (const id of take) {
    const floor = await redis.get(prefix + id);
    if (typeof floor !== "string" || !IMAGE_URL.test(floor)) { unreadable++; continue; }
    added.push(meta(id, { name: `Recovered environment ${++n}` }, sheets.has(id), now));
  }
  // listed on the record as it is now: another save may have indexed one of these since the scan began
  let listed = [];
  if (added.length) {
    await update((u) => {
      const have = new Set(list(u.grounds).map((g) => g.id));
      const room = Math.max(0, MAX_GROUNDS - list(u.grounds).length);
      listed = added.filter((e) => !have.has(e.id)).slice(0, room);
      if (!listed.length) return false;
      u.grounds = [...list(u.grounds), ...listed];
    });
  }
  return {
    status: 200,
    json: {
      recovered: listed.length,
      grounds: listed,
      unreadable,
      remaining: Math.max(0, ids.length - take.length),
    },
  };
}
