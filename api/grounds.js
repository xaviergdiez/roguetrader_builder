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

import { groundKey, isCharId, redis } from "../lib/storage.js";
import { requireUser, getUser, saveUser } from "../lib/auth.js";

/* A ground's sixteen props, as ONE sheet, under a key of its own.

   Its own key and not a field on the floor record, for the reason the floor
   is not a field on the user record: the picker reads the index on every
   load, the renderer reads a floor only for the ground it is drawing, and a
   sheet is read only by a deck that actually has props on it. Three sizes of
   thing, three places to keep them. */
const spritesKey = (uid, gid) => `${groundKey(uid, gid)}:sprites`;

const MAX_NAME = 60;
// Upstash rejects a record over 1MB. A ground is shrunk to 512px client-side,
// which lands near 60KB as a data URL, so anything approaching this is a
// surprise worth reporting rather than an opaque failure from the driver.
const MAX_TEXTURE_BYTES = 900_000;
/* A sheet is sixteen tokens in one image, kept at 1024px — four times the
   area of a floor and mostly transparent, which WebP packs well. Its own
   ceiling because it is its own record: were it sharing the floor's budget,
   a ground with props would be refused for a floor that is perfectly fine. */
const MAX_SPRITES_BYTES = 900_000;
// Enough for a campaign's worth without the index itself becoming a payload.
const MAX_GROUNDS = 60;

const text = (v, fallback = "", max = MAX_NAME) => {
  const s = String(v ?? "").trim().slice(0, max);
  return s || fallback;
};

const colour = (v, fallback) =>
  (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)) ? v : fallback;

const num = (v, fallback, lo, hi) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

// The index entry: everything the picker and the renderer need EXCEPT the
// floor itself. Kept narrow on purpose — this is fetched on every load.
const meta = (gid, body, hasSprites) => ({
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
  updatedAt: Date.now(),
});

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
    if (typeof texture !== "string"
      || !/^data:image\/(png|jpeg|webp);base64,/.test(texture)) {
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
      if (typeof sprites !== "string"
        || !/^data:image\/(png|jpeg|webp);base64,/.test(sprites)) {
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

  res.setHeader("Allow", "GET, PUT, DELETE");
  return res.status(405).end();
}
