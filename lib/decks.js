// What the deck store keeps, and how. Lives outside /api for the same reason
// storage.js does: every .js under /api becomes a serverless function, and
// the Hobby plan caps a deployment at twelve.
//
// A deck is a battle map (src/battlemap.js). It is stored PACKED — the dense
// layers as runs along their rows — and then gzipped, because the packed form
// is JSON full of small numbers and compresses roughly five to one. That is
// what lets one deck have a record of its own that is bigger than the whole
// library used to be allowed to be: Upstash rejects a record over 1MB, and
// what is measured against that is the stored (compressed) string.
//
// The server normalises and packs whatever it is sent rather than trusting the
// client to have done it: a deck written by an older build, or by a hand-made
// request, comes out the same shape as one written by this one.

import { gzipSync, gunzipSync } from "node:zlib";
import { readMap, packMap } from "../src/battlemap.js";

export const MAX_DECKS = 100;
export const MAX_NAME = 80;
// The stored (compressed, base64) size. Under Upstash's 1MB record.
export const MAX_STORED_BYTES = 900_000;

export const deckName = (v, fallback = "Saved deck") => {
  const s = String(v ?? "").trim().slice(0, MAX_NAME);
  return s || fallback;
};

/* A map as it is kept: normalised, packed, gzipped, base64. Returns the string
   and the facts the index entry needs, or an error naming the size. */
export function encodeDeck(map, limit = MAX_STORED_BYTES) {
  if (!map || typeof map !== "object") return { error: "map_required" };
  const m = readMap(map);
  const json = JSON.stringify(packMap(m));
  const stored = gzipSync(Buffer.from(json), { level: 9 }).toString("base64");
  if (stored.length > limit) {
    return {
      error: `That deck is ${Math.round(stored.length / 1024)}KB once packed, over the ${
        Math.round(limit / 1024)}KB a deck may take.`,
      tooBig: true
    };
  }
  return {
    stored,
    cols: m.cols,
    rows: m.rows,
    squares: Object.keys(m.floor).length,
    bytes: stored.length
  };
}

/* The other way: the stored string back to a packed map object, or null when
   it is not one this can read (a damaged record is a missing deck, not a
   500). */
export function decodeDeck(stored) {
  if (typeof stored !== "string" || !stored) return null;
  try {
    return JSON.parse(gunzipSync(Buffer.from(stored, "base64")).toString("utf8"));
  } catch {
    return null;
  }
}

// The index entry: what the picker needs without the deck itself. Fetched on
// every load, so kept to a few numbers.
export const deckEntry = (id, name, facts, now = Date.now()) => ({
  id,
  name: deckName(name),
  cols: facts.cols,
  rows: facts.rows,
  squares: facts.squares,
  bytes: facts.bytes,
  updatedAt: now
});

/* ------------------------------ the endpoint ------------------------------

   The whole of api/decks.js apart from the wiring, so it can be run against a
   map standing in for Redis. `user` is the account record (its `decks` is the
   index), `redis` anything with get/set/del, `key(did)` the record a deck's
   body lives under, and `save(user)` writes the account record back.

   Deck ids reach this from the client and are concatenated into a Redis key,
   so they are checked, not trusted. */
export const isDeckId = (v) => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);

/* `user` is a snapshot, for answering reads and for turning away what cannot
   work before anything is written. Every change to the account goes through
   `update(fn)`, which runs `fn` on the CURRENT record (and again on a newer one
   if another save got in first), so `fn` may depend on nothing but the record
   it is given. It returns { written }; `fn` returning false means "nothing to
   write". See updateUser in auth.js. */
const list = (v) => (Array.isArray(v) ? v : []);

export async function runDecks({ method, did, body, user, redis, key, update, reindex = false, now }) {
  if (!Array.isArray(user.decks)) user.decks = [];
  if (did !== undefined && !isDeckId(did)) return { status: 400, json: { error: "bad_deck_id" } };

  // Find decks stored under this account's keys that the index has lost.
  // Not a read and not a write of one deck, so it is its own action.
  if (method === "POST" && reindex) return runReindex({ user, redis, prefix: key(""), update, now });

  if (method === "GET") {
    if (!did) return { status: 200, json: { decks: user.decks } };
    const entry = user.decks.find((d) => d.id === did);
    if (!entry) return { status: 404, json: { error: "unknown_deck" } };
    const map = decodeDeck(await redis.get(key(did)));
    if (!map) return { status: 404, json: { error: "deck_unreadable" } };
    return { status: 200, json: { ...entry, map } };
  }

  if (method === "PUT") {
    if (!did) return { status: 400, json: { error: "deck_id_required" } };
    const b = body && typeof body === "object" ? body : {};
    const existing = user.decks.find((d) => d.id === did);

    // A rename leaves the map alone: it would otherwise re-send and rewrite
    // megabytes to change a name.
    if (b.map === undefined) {
      if (!existing) return { status: 400, json: { error: "map_required" } };
      const entry = { ...existing, name: deckName(b.name, existing.name), updatedAt: Date.now() };
      await update((u) => {
        u.decks = list(u.decks).map((d) => (d.id === did ? { ...d, name: entry.name, updatedAt: entry.updatedAt } : d));
      });
      return { status: 200, json: entry };
    }

    if (!existing && user.decks.length >= MAX_DECKS) {
      return {
        status: 413,
        json: { error: `That is ${MAX_DECKS} decks, which is the limit. Delete one first.` }
      };
    }
    const enc = encodeDeck(b.map);
    if (enc.error) return { status: enc.tooBig ? 413 : 400, json: { error: enc.error } };

    // The deck before the index, as a ground's floor is written before its
    // entry: an entry pointing at a missing deck shows something that cannot
    // be opened, while an unindexed deck is merely inert.
    await redis.set(key(did), enc.stored);
    const entry = deckEntry(did, b.name ?? (existing && existing.name), enc);
    const done = await update((u) => {
      const have = list(u.decks);
      // the limit again, on the record as it is now: another save may have filled it
      if (!have.some((d) => d.id === did) && have.length >= MAX_DECKS) return false;
      u.decks = [...have.filter((d) => d.id !== did), entry];
    });
    if (done && done.written === false) {
      if (!existing) await redis.del(key(did));        // a body nothing will ever list
      return { status: 413, json: { error: `That is ${MAX_DECKS} decks, which is the limit. Delete one first.` } };
    }
    return { status: 200, json: entry };
  }

  if (method === "DELETE") {
    if (!did) return { status: 400, json: { error: "deck_id_required" } };
    // The index first, so a failure between the two leaves an inert body
    // rather than an entry that cannot be opened.
    await update((u) => { u.decks = list(u.decks).filter((d) => d.id !== did); });
    await redis.del(key(did));
    return { status: 200, json: { ok: true } };
  }

  return { status: 405, json: null };
}

/* ------------------------------ finding lost decks ------------------------------

   A deck is written under a key of its own BEFORE its entry is added to the
   index on the user record, so that an entry never points at nothing. The
   cost of that order is the other half of it: a body with no entry is merely
   inert, and it stays inert for ever. Signing in used to replace the whole
   user record (see signInRecord in auth.js), which dropped every entry and
   left every deck exactly like that: stored, unreachable, and unlisted on
   the next device.

   This lists them again. It reads only the keys under THIS account's own
   prefix, adds an entry for each body the index lacks and that can be read,
   and changes nothing else: no deck's body, no existing entry, no other
   field of the account. The name a deck had lived only in the lost entry, so
   a recovered one is called "Recovered deck N" for the person to rename.

   A deck deleted on purpose has no body to find (DELETE removes it), so this
   cannot bring one back unless the deletion itself failed halfway. */
export const REINDEX_MAX = 50;          // entries added per request
const SCAN_ROUNDS = 100;                // a ceiling on the walk, not an expectation

export async function runReindex({ user, redis, prefix, update, now = Date.now() }) {
  // The prefix is built from the signed-in account's id, but it is a pattern,
  // so anything that would widen it is refused rather than escaped.
  if (typeof prefix !== "string" || !prefix || /[*?\[\]\\]/.test(prefix)) {
    return { status: 400, json: { error: "bad_prefix" } };
  }
  if (typeof redis.scan !== "function") return { status: 501, json: { error: "scan_unavailable" } };
  if (!Array.isArray(user.decks)) user.decks = [];

  const indexed = new Set(user.decks.map((d) => d.id));
  const lost = new Set();
  let cursor = "0";
  for (let round = 0; round < SCAN_ROUNDS; round++) {
    const [next, keys] = await redis.scan(cursor, { match: prefix + "*", count: 200 });
    for (const k of keys || []) {
      if (typeof k !== "string" || !k.startsWith(prefix)) continue;
      const id = k.slice(prefix.length);
      if (isDeckId(id) && !indexed.has(id)) lost.add(id);
    }
    cursor = String(next);
    if (cursor === "0") break;
  }

  const ids = [...lost].sort();
  const room = Math.max(0, MAX_DECKS - user.decks.length);
  const take = ids.slice(0, Math.min(room, REINDEX_MAX));
  let n = user.decks.filter((d) => /^Recovered deck \d+$/.test(d.name || "")).length;
  const added = [];
  let unreadable = 0;
  for (const id of take) {
    const stored = await redis.get(prefix + id);
    const packed = decodeDeck(stored);
    if (!packed) { unreadable++; continue; }
    const m = readMap(packed);
    added.push(deckEntry(id, `Recovered deck ${++n}`, {
      cols: m.cols, rows: m.rows, squares: Object.keys(m.floor).length, bytes: String(stored).length
    }, now));
  }
  /* Listed on the record as it is now, not the snapshot the scan started from:
     another save may have indexed one of these, or filled the library, since. */
  let listed = [];
  if (added.length) {
    await update((u) => {
      const have = new Set(list(u.decks).map((d) => d.id));
      const room = Math.max(0, MAX_DECKS - list(u.decks).length);
      listed = added.filter((e) => !have.has(e.id)).slice(0, room);
      if (!listed.length) return false;
      u.decks = [...list(u.decks), ...listed];
    });
  }
  return {
    status: 200,
    json: {
      recovered: listed.length,
      decks: listed,
      unreadable,
      // found but not listed: a full library, or more than one request's worth
      remaining: Math.max(0, ids.length - take.length)
    }
  };
}
