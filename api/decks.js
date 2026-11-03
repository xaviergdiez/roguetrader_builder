// Saved battle-map decks, stored per account.
//
// Split out of the homebrew library, which is ONE blob with ONE budget (900KB):
// a deck is a record per square, and a big one — up to 500 x 500 now — took a
// large part of that on its own. Two of them filled the library and everything
// else in it, the hulls and encounters and journals, stopped saving.
//
// Shaped like api/grounds.js, for the same reason it is: a small index on the
// user record — name and size — and each deck under its own key. The picker
// needs the index on every load; a deck itself is fetched only when it is
// opened or loaded onto the map. The logic is in lib/decks.js (runDecks) so it
// can be checked without Redis; this is only the wiring.
//
//   GET    /api/decks            -> { decks: [ {id, name, cols, rows, squares, bytes} ] }
//   GET    /api/decks?d=<id>     -> { id, name, ..., map }
//   PUT    /api/decks?d=<id>     -> { id, ... }   upsert; body { name, map }
//                                   or { name } alone to rename without re-sending the map
//   DELETE /api/decks?d=<id>     -> { ok: true }
//   POST   /api/decks?reindex=1  -> { recovered, decks, unreadable, remaining }
//                                   lists decks stored under this account's keys
//                                   that the index has lost; adds entries only

import { deckKey, redis } from "../lib/storage.js";
import { requireUser, getUser, updateUser, answerBusy } from "../lib/auth.js";
import { runDecks } from "../lib/decks.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const uid = await requireUser(req, res);
  if (!uid) return;

  // A snapshot, for reads and early refusals. Every change goes through
  // updateUser, which makes it on the record as it is at that moment, so a
  // save made at the same time by another endpoint is not overwritten.
  const user = (await getUser(uid)) ?? {};
  let out;
  try {
    out = await runDecks({
      method: req.method,
      did: req.query.d,
      body: req.body,
      user,
      redis,
      key: (did) => deckKey(uid, did),
      update: (fn) => updateUser(uid, fn),
      reindex: req.query.reindex === "1",
    });
  } catch (e) {
    if (answerBusy(res, e)) return;
    throw e;
  }

  if (out.status === 405) {
    res.setHeader("Allow", "GET, PUT, DELETE, POST");
    return res.status(405).end();
  }
  return res.status(out.status).json(out.json);
}
