// The crew roster, stored per Google account so it follows you between
// devices. Before this the roster was localStorage only, which is per-browser
// by definition — characters saved on a laptop were invisible on a phone.
//
// Shape mirrors api/characters.js in dnd_multi-user: a small {id, name, career}
// index on the user record, and each character's body under its own key. See
// charKey in lib/storage.js for why it is split that way.
//
//   GET    /api/characters          -> { chars: [ {id, name, career, updatedAt} ] }
//   GET    /api/characters?c=<id>   -> { id, name, career, updatedAt, state }
//   PUT    /api/characters?c=<id>   -> { id, ... }   (upsert)
//   DELETE /api/characters?c=<id>   -> { ok: true }

import { charKey, isCharId, redis } from "../lib/storage.js";
import { requireUser, getUser, saveUser } from "../lib/auth.js";

const MAX_NAME = 60;
// Upstash rejects a record over 1MB. A generated portrait is ~250KB as a data
// URL and the client shrinks uploads to match, so anything near this is a
// surprise worth reporting rather than an opaque failure from the driver.
const MAX_STATE_BYTES = 900_000;

const text = (v, fallback = "") => {
  const s = String(v ?? "").trim().slice(0, MAX_NAME);
  return s || fallback;
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const uid = await requireUser(req, res);
  if (!uid) return;

  // Mutated and saved whole, so fields this endpoint knows nothing about
  // (email, name) survive. The auth callback preserves chars the same way.
  const user = (await getUser(uid)) ?? {};
  if (!Array.isArray(user.chars)) user.chars = [];

  const cid = req.query.c;
  if (cid !== undefined && !isCharId(cid)) {
    return res.status(400).json({ error: "bad_character_id" });
  }

  if (req.method === "GET") {
    if (!cid) return res.status(200).json({ chars: user.chars });
    const entry = user.chars.find((c) => c.id === cid);
    if (!entry) return res.status(404).json({ error: "unknown_character" });
    const state = await redis.get(charKey(uid, cid));
    return res.status(200).json({ ...entry, state: state ?? null });
  }

  if (req.method === "PUT") {
    if (!cid) return res.status(400).json({ error: "character_id_required" });
    const body = req.body ?? {};
    if (!body.state || typeof body.state !== "object") {
      return res.status(400).json({ error: "state_required" });
    }
    const size = JSON.stringify(body.state).length;
    if (size > MAX_STATE_BYTES) {
      return res.status(413).json({
        error: `That character is ${Math.round(size / 1024)}KB, over the ${
          Math.round(MAX_STATE_BYTES / 1024)}KB limit. A large portrait is the usual cause.`,
      });
    }

    const meta = {
      id: cid,
      name: text(body.name, "Unnamed adept"),
      career: body.career ? text(body.career) : null,
      updatedAt: Date.now(),
    };

    // Body before index: an index entry pointing at a missing body would show
    // an un-openable character, while an unindexed body is merely inert.
    await redis.set(charKey(uid, cid), body.state);
    user.chars = [...user.chars.filter((c) => c.id !== cid), meta];
    await saveUser(uid, user);
    return res.status(200).json(meta);
  }

  if (req.method === "DELETE") {
    if (!cid) return res.status(400).json({ error: "character_id_required" });
    user.chars = user.chars.filter((c) => c.id !== cid);
    await saveUser(uid, user);
    await redis.del(charKey(uid, cid));
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, PUT, DELETE");
  return res.status(405).end();
}
