// The account's homebrew library: hulls and components of its own.
//
//   GET /api/homebrew  -> { homebrew: { hulls, components } }
//   PUT /api/homebrew  -> { homebrew }        (replaces the whole library)
//
// Kept on the user record next to chars and dynasties rather than under its
// own key: a catalogue is a few hundred bytes an entry, so the index/body
// split that characters need (portraits push a record past Upstash's 1MB) buys
// nothing here.
//
// Invalid entries are STORED, not rejected. A half-finished hull is a draft,
// and the editor already lists it as unusable — dropping it on save would lose
// the player's work for the crime of not having finished. What is refused is a
// payload large or numerous enough to be storage abuse rather than a library.

import { requireUser, getUser, saveUser } from "../lib/auth.js";

const MAX_ENTRIES = 200;
const MAX_BYTES = 100_000;

const list = (v) => (Array.isArray(v) ? v : []);

// Only the two known keys, and only objects within them, so the stored shape
// cannot drift into something the client will choke on.
function clean(homebrew) {
  const h = homebrew && typeof homebrew === "object" ? homebrew : {};
  const entries = (arr) => list(arr).filter((x) => x && typeof x === "object");
  return { hulls: entries(h.hulls), components: entries(h.components) };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const uid = await requireUser(req, res);
  if (!uid) return;

  if (req.method === "GET") {
    const user = (await getUser(uid)) ?? {};
    return res.status(200).json({ homebrew: clean(user.homebrew) });
  }

  if (req.method === "PUT") {
    const homebrew = clean((req.body ?? {}).homebrew);

    const count = homebrew.hulls.length + homebrew.components.length;
    if (count > MAX_ENTRIES) {
      return res.status(413).json({
        error: `That is ${count} entries, over the ${MAX_ENTRIES} limit.`
      });
    }
    const size = JSON.stringify(homebrew).length;
    if (size > MAX_BYTES) {
      return res.status(413).json({
        error: `That library is ${Math.round(size / 1024)}KB, over the ${
          Math.round(MAX_BYTES / 1024)}KB limit.`
      });
    }

    // Mutated and saved whole, so chars and dynasties survive.
    const user = (await getUser(uid)) ?? {};
    user.homebrew = homebrew;
    await saveUser(uid, user);

    return res.status(200).json({ homebrew });
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).end();
}
