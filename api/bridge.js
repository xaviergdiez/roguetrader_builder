// The shared bridge. One dynasty, one ship, one GM.
//
//   POST /api/bridge  {action:"create", name}          -> {dynasty, ship}
//   POST /api/bridge  {action:"join", code, charId, name, role}
//   POST /api/bridge  {action:"leave", code}
//   GET  /api/bridge?code=<code>[&since=<rev>]         -> {dynasty, ship} | 204
//   POST /api/bridge  {action:"write", code, vitals, doc, log}
//   POST /api/bridge  {action:"event", code, event}
//
// WHY POLLING
//
// A Vercel function is request-scoped: it answers and dies, so there is no
// process to hold a socket or a room. For a turn-based bridge that is fine —
// the GET carries the rev the client already has and answers 204 when nothing
// has changed, which costs one Redis read.
//
// ponytail: 5-second polling while the bridge view is open. Upstash's free
// tier is 10k commands/day and five players at 5s is ~3.6k per hour of play,
// so a long session needs a longer interval or the paid tier. Raise
// POLL_SECONDS before reaching for a realtime service.
//
// Permissions are enforced here, not only in the client. The client greys out
// controls with the same functions; only this copy counts.

import { redis } from "../lib/storage.js";
import { requireSession, getUser, saveUser } from "../lib/auth.js";
import {
  dynastyKey, shipKey, newCode, normaliseCode,
  newDynasty, isGm, memberOf, joinDynasty, leaveDynasty,
  authorizeWrite, authorizeEvent,
  newShip, applyPatch, applyWrite, appendLog, redactShip, redactDynasty
} from "../lib/bridge.js";
import { applyEvent } from "../src/voidcombat.js";

export const POLL_SECONDS = 5;

// Codes are short, so a collision is possible rather than merely theoretical:
// 32^6 is a billion, but a few hundred tries beats a duplicated table.
const CODE_TRIES = 5;

const load = async (code) => ({
  dynasty: await redis.get(dynastyKey(code)),
  ship: await redis.get(shipKey(code))
});

// The dynasties an account belongs to, kept on the user record next to chars
// so a player can find their table again without remembering the code.
async function remember(uid, code) {
  const user = (await getUser(uid)) ?? {};
  const codes = Array.isArray(user.dynasties) ? user.dynasties : [];
  if (!codes.includes(code)) {
    user.dynasties = [...codes, code].slice(-20);
    await saveUser(uid, user);
  }
}

async function forget(uid, code) {
  const user = (await getUser(uid)) ?? {};
  const codes = Array.isArray(user.dynasties) ? user.dynasties : [];
  if (codes.includes(code)) {
    user.dynasties = codes.filter((c) => c !== code);
    await saveUser(uid, user);
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const session = await requireSession(req, res);
  if (!session) return;
  const { uid } = session;

  /* ------------------------------- reading ------------------------------- */

  if (req.method === "GET") {
    const code = normaliseCode(req.query.code);
    if (!code) return res.status(400).json({ error: "bad_code" });

    const { dynasty, ship } = await load(code);
    if (!dynasty) return res.status(404).json({ error: "unknown_dynasty" });

    const gm = isGm(dynasty, uid);
    if (!gm && !memberOf(dynasty, uid)) {
      // Not a member: the table's existence is not a secret, its state is.
      return res.status(403).json({ error: "not_a_member" });
    }

    // Nothing has changed since the client last looked, so send no body.
    const since = Number(req.query.since);
    if (Number.isFinite(since) && ship && Number(ship.rev) === since) {
      return res.status(204).end();
    }

    return res.status(200).json({
      dynasty: redactDynasty(dynasty, { isGm: gm }),
      ship: redactShip(ship, { isGm: gm }),
      isGm: gm,
      pollSeconds: POLL_SECONDS
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).end();
  }

  const body = req.body ?? {};
  const action = String(body.action || "");

  /* ------------------------------- creating ------------------------------- */

  if (action === "create") {
    // Only a GM session may open a table. Checked here and not merely hidden
    // in the UI, because the UI is not a gate: the button being absent stops
    // nobody from posting this.
    if (!session.gm) {
      return res.status(403).json({ error: "gm_session_required" });
    }
    let code = null;
    for (let i = 0; i < CODE_TRIES && !code; i++) {
      const candidate = newCode();
      // eslint-disable-next-line no-await-in-loop
      if (!(await redis.get(dynastyKey(candidate)))) code = candidate;
    }
    if (!code) return res.status(503).json({ error: "no_code_available" });

    const user = (await getUser(uid)) ?? {};
    const dynasty = newDynasty({
      code, name: body.name, ownerUid: uid, ownerEmail: user.email || null
    });
    const ship = newShip(code);

    // Ship first: a dynasty pointing at a ship that is not there would show an
    // empty bridge, where an unreferenced ship is merely inert.
    await redis.set(shipKey(code), ship);
    await redis.set(dynastyKey(code), dynasty);
    await remember(uid, code);

    return res.status(200).json({
      dynasty: redactDynasty(dynasty, { isGm: true }),
      ship,
      isGm: true,
      pollSeconds: POLL_SECONDS
    });
  }

  const code = normaliseCode(body.code);
  if (!code) return res.status(400).json({ error: "bad_code" });

  const { dynasty, ship } = await load(code);
  if (!dynasty) return res.status(404).json({ error: "unknown_dynasty" });

  /* -------------------------------- joining -------------------------------- */

  if (action === "join") {
    const next = joinDynasty(dynasty, {
      uid, charId: body.charId, name: body.name, role: body.role
    });
    await redis.set(dynastyKey(code), next);
    await remember(uid, code);
    const gm = isGm(next, uid);
    return res.status(200).json({
      dynasty: redactDynasty(next, { isGm: gm }),
      ship: redactShip(ship, { isGm: gm }),
      isGm: gm,
      pollSeconds: POLL_SECONDS
    });
  }

  if (action === "leave") {
    // The GM cannot leave their own table: nothing transfers the role, so the
    // dynasty would be left with no one able to run it.
    if (isGm(dynasty, uid)) return res.status(409).json({ error: "gm_cannot_leave" });
    await redis.set(dynastyKey(code), leaveDynasty(dynasty, uid));
    await forget(uid, code);
    return res.status(200).json({ ok: true });
  }

  /* -------------------------------- writing -------------------------------- */

  if (action === "write") {
    const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
    const vitals = obj(body.vitals);
    const doc = obj(body.doc);
    if (!vitals && !doc) return res.status(400).json({ error: "nothing_to_write" });

    const auth = authorizeWrite(dynasty, uid, {
      vitals: vitals ? Object.keys(vitals) : [],
      doc: doc ? Object.keys(doc) : []
    });
    if (!auth.ok) {
      return res.status(403).json({ error: auth.reason, denied: auth.denied });
    }

    let next = applyWrite(ship, { vitals, doc });
    if (body.log) {
      next = appendLog(next, {
        by: auth.isGm ? "gm" : (auth.role || "crew"),
        text: String(body.log).slice(0, 300)
      });
    }
    await redis.set(shipKey(code), next);

    return res.status(200).json({
      ship: redactShip(next, { isGm: auth.isGm }),
      rev: next.rev
    });
  }

  if (action === "event") {
    const event = body.event && typeof body.event === "object" ? body.event : null;
    if (!event) return res.status(400).json({ error: "event_required" });

    const auth = authorizeEvent(dynasty, uid, event.id);
    if (!auth.ok) return res.status(403).json({ error: auth.reason });

    // The event decides what it writes; the client does not get to say.
    const target = event.target === "fleet" ? null : (ship && ship.vitals) || {};
    if (!target) {
      return res.status(400).json({ error: "fleet_events_not_supported" });
    }
    const { patch, unknown } = applyEvent(target, event);
    if (unknown) return res.status(400).json({ error: "unknown_event" });

    let next = applyPatch(ship, { vitals: { ...target, ...patch } });
    next = appendLog(next, { by: "gm", event: event.id,
      text: String(event.text || event.id).slice(0, 300) });
    await redis.set(shipKey(code), next);

    return res.status(200).json({ ship: next, rev: next.rev, patch });
  }

  return res.status(400).json({ error: "unknown_action" });
}
