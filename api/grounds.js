// Generated battle-map grounds, stored per account.
//
// Split out of the homebrew library, which is ONE blob with ONE budget: a
// ground carries its floor as a data URL, so a handful of them crowded out
// the hulls, encounters and journals that library was sized for.
//
// Shape mirrors api/characters.js, for the same reason it does: a small index
// on the user record — the name and the five numbers a theme needs — and each
// floor under its own key. The picker needs the index on every load; it needs
// a floor only for the ground actually being drawn.
//
//   GET    /api/grounds           -> { grounds: [ {id, name, ...numbers} ] }
//   GET    /api/grounds?g=<id>    -> { id, ..., texture }
//   PUT    /api/grounds?g=<id>    -> { id, ... }   (upsert)
//   DELETE /api/grounds?g=<id>    -> { ok: true }
//   POST   /api/grounds?reindex=1 -> { recovered, grounds, unreadable, remaining }
//                                    lists floors stored under this account's keys
//                                    that the index has lost; adds entries only

import { groundKey, isCharId, redis } from "../lib/storage.js";
import { requireUser, getUser, saveUser } from "../lib/auth.js";
import {
  MAX_TEXTURE_BYTES, MAX_SPRITES_BYTES, MAX_GROUNDS, IMAGE_URL, meta, runGroundsReindex,
} from "../lib/grounds.js";

/* A ground's sixteen props, as ONE sheet, under a key of its own.

   Its own key and not a field on the floor record, for the reason the floor
   is not a field on the user record: the picker reads the index on every
   load, the renderer reads a floor only for the ground it is drawing, and a
   sheet is read only by a deck that actually has props on it. Three sizes of
   thing, three places to keep them. */
const spritesKey = (uid, gid) => `${groundKey(uid, gid)}:sprites`;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const uid = await requireUser(req, res);
  if (!uid) return;

  // Mutated and saved whole, so fields this endpoint knows nothing about
  // (email, chars, homebrew) survive.
  const user = (await getUser(uid)) ?? {};
  if (!Array.isArray(user.grounds)) user.grounds = [];

  const gid = req.query.g;
  if (gid !== undefined && !isCharId(gid)) {
    return res.status(400).json({ error: "bad_ground_id" });
  }

  if (req.method === "GET") {
    if (!gid) return res.status(200).json({ grounds: user.grounds });
    const entry = user.grounds.find((g) => g.id === gid);
    if (!entry) return res.status(404).json({ error: "unknown_ground" });
    // The sheet is only fetched for a ground that says it has one, so a
    // library of plain grounds costs the same round trip it always did.
    const [texture, sprites] = await Promise.all([
      redis.get(groundKey(uid, gid)),
      entry.sprites ? redis.get(spritesKey(uid, gid)) : Promise.resolve(null),
    ]);
    return res.status(200).json({
      ...entry,
      texture: texture ?? null,
      sprites: sprites ?? null,
    });
  }

  if (req.method === "PUT") {
    if (!gid) return res.status(400).json({ error: "ground_id_required" });
    const body = req.body ?? {};

    // A ground with no floor is not a ground: it would sit in the picker
    // and render nothing.
    const texture = body.texture;
    if (typeof texture !== "string" || !IMAGE_URL.test(texture)) {
      return res.status(400).json({ error: "texture_required" });
    }
    if (texture.length > MAX_TEXTURE_BYTES) {
      return res.status(413).json({
        error: `That ground is ${Math.round(texture.length / 1024)}KB, over the ${
          Math.round(MAX_TEXTURE_BYTES / 1024)}KB limit.`,
      });
    }
    const replacing = user.grounds.some((g) => g.id === gid);
    if (!replacing && user.grounds.length >= MAX_GROUNDS) {
      return res.status(413).json({
        error: `That is ${MAX_GROUNDS} grounds, which is the limit. Delete one first.`,
      });
    }

    /* The props, if this ground has been given any. Optional and separately
       validated: a floor is a ground, a sheet is a bonus, and a bad sheet
       must not cost the GM the floor they just generated.

       An omitted `sprites` leaves whatever is already stored alone — saving
       over a ground to rename it should not throw its props away — while an
       explicit null deletes them. */
    const sprites = body.sprites;
    const sendingSprites = sprites !== undefined;
    if (sendingSprites && sprites !== null) {
      if (typeof sprites !== "string" || !IMAGE_URL.test(sprites)) {
        return res.status(400).json({ error: "bad_sprites" });
      }
      if (sprites.length > MAX_SPRITES_BYTES) {
        return res.status(413).json({
          error: `Those props are ${Math.round(sprites.length / 1024)}KB, over the ${
            Math.round(MAX_SPRITES_BYTES / 1024)}KB limit.`,
        });
      }
    }

    // Floor before index, as a character's body is written before its entry:
    // an index entry pointing at a missing floor shows a ground that renders
    // nothing, while an unindexed floor is merely inert.
    await redis.set(groundKey(uid, gid), texture);
    let hasSprites = replacing
      && (user.grounds.find((g) => g.id === gid) || {}).sprites;
    if (sendingSprites) {
      if (sprites === null) { await redis.del(spritesKey(uid, gid)); hasSprites = false; }
      else { await redis.set(spritesKey(uid, gid), sprites); hasSprites = true; }
    }
    const entry = meta(gid, body, hasSprites);
    user.grounds = [...user.grounds.filter((g) => g.id !== gid), entry];
    await saveUser(uid, user);
    return res.status(200).json(entry);
  }

  if (req.method === "DELETE") {
    if (!gid) return res.status(400).json({ error: "ground_id_required" });
    user.grounds = user.grounds.filter((g) => g.id !== gid);
    await saveUser(uid, user);
    // Both records, or a deleted ground's props would sit in Redis for good
    // with nothing left that could ever name them.
    await Promise.all([
      redis.del(groundKey(uid, gid)),
      redis.del(spritesKey(uid, gid)),
    ]);
    return res.status(200).json({ ok: true });
  }

  /* Find floors this account stores that its index has lost. Not a read and
     not a write of one ground, so it is its own action. The prefix is built
     from the signed-in account's id and nothing the caller sends. */
  if (req.method === "POST" && req.query.reindex === "1") {
    const out = await runGroundsReindex({
      user, redis, prefix: groundKey(uid, ""), save: (u) => saveUser(uid, u),
    });
    return res.status(out.status).json(out.json);
  }

  res.setHeader("Allow", "GET, PUT, DELETE, POST");
  return res.status(405).end();
}
