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

export async function runDecks({ method, did, body, user, redis, key, save }) {
  if (!Array.isArray(user.decks)) user.decks = [];
  if (did !== undefined && !isDeckId(did)) return { status: 400, json: { error: "bad_deck_id" } };

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
      user.decks = user.decks.map((d) => (d.id === did ? entry : d));
      await save(user);
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
    user.decks = [...user.decks.filter((d) => d.id !== did), entry];
    await save(user);
    return { status: 200, json: entry };
  }

  if (method === "DELETE") {
    if (!did) return { status: 400, json: { error: "deck_id_required" } };
    // The index first, so a failure between the two leaves an inert body
    // rather than an entry that cannot be opened.
    user.decks = user.decks.filter((d) => d.id !== did);
    await save(user);
    await redis.del(key(did));
    return { status: 200, json: { ok: true } };
  }

  return { status: 405, json: null };
}
