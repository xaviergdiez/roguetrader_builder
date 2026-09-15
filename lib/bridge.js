// The shared bridge: a dynasty, its ship, and who may change what.
//
// One dynasty has one ship and one GM, who is the account that created it.
// Players join with a character and take a station; the station decides which
// fields of the ship state they may write. Every check here runs on the server
// as well as the client, because a client-side check is decoration — anyone
// can post the payload.
//
// REDACTION IS THE POINT
//
// The GM's NPC ships live in the same document as the crew's ship, so the
// players' copy is redacted on the way out: an enemy's Hull Integrity, shields
// and weapons are hidden until somebody spends an Active Augury on it. That is
// what a separate GM app was supposed to buy and could not — both apps would
// read the same API, so the secrecy has to live here.
//
// Pure. The Redis calls are in api/bridge.js. See bridge.check.mjs.

import { deniedWrites, canTriggerEvent } from "../src/shiproles.js";

/* ---------------------------------- keys ---------------------------------- */

// Namespaced like everything else in this app so one Upstash database can hold
// the Shadowrun and D&D builds alongside it. See lib/storage.js.
export const dynastyKey = (code) => `rt:dyn:${code}`;
export const shipKey = (code) => `rt:ship:${code}`;

// A table code, not a uuid: someone reads it aloud and four people type it.
// I, O, 0 and 1 are left out because they are the ones that get misheard.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

export function newCode(random = Math.random) {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return out;
}

// Typed by hand, so it is normalised before use and validated strictly: the
// code is concatenated into a Redis key.
export const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export function normaliseCode(input) {
  const s = String(input || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return CODE_RE.test(s) ? s : null;
}

/* -------------------------------- dynasty -------------------------------- */

export function newDynasty({ code, name, ownerUid, ownerEmail }) {
  return {
    code,
    name: String(name || "").trim().slice(0, 60) || "An unnamed dynasty",
    // The creator is the GM, permanently. Nothing in the API transfers it.
    ownerUid,
    ownerEmail: ownerEmail || null,
    members: [],
    createdAt: Date.now()
  };
}

export const isGm = (dynasty, uid) =>
  Boolean(dynasty && uid && dynasty.ownerUid === uid);

export const memberOf = (dynasty, uid) =>
  ((dynasty && dynasty.members) || []).find((m) => m.uid === uid) || null;

export function roleOf(dynasty, uid) {
  const m = memberOf(dynasty, uid);
  return m ? m.role || "" : "";
}

// Joining twice updates the seat rather than adding a second one: a player who
// switches character or station is the same person at the same table.
export function joinDynasty(dynasty, { uid, charId, name, role }) {
  const members = ((dynasty && dynasty.members) || []).filter((m) => m.uid !== uid);
  return {
    ...dynasty,
    members: [...members, {
      uid,
      charId: charId || null,
      name: String(name || "").trim().slice(0, 60) || "An unnamed adept",
      role: role || "",
      joinedAt: Date.now()
    }]
  };
}

export function leaveDynasty(dynasty, uid) {
  return {
    ...dynasty,
    members: ((dynasty && dynasty.members) || []).filter((m) => m.uid !== uid)
  };
}

/* ------------------------------ authorisation ------------------------------ */

// A bridge write has two surfaces, and they are not governed the same way.
//
//   vitals   the live ship state — morale, hullIntegrity, phase, evasion.
//            Each key is owned by a station, per the role matrix.
//   doc      the ship as authored — the blueprint, the NPC fleet, the turn
//            record. Nobody's station owns these: they are the GM's.
//
// Collapsing the two is what broke the first version of the push: it sent
// `blueprint` and `fleet` as if they were state fields, and the field check
// refused them for everyone — the GM included, since an unknown field is
// refused rather than waved through.
export const GM_DOC_FIELDS = ["blueprint", "fleet", "combat"];

// May this account make this write? The GM is checked first and needs no
// station, which is the normal case for one running NPC ships. A non-member is
// refused outright — being signed in is not being at the table.
export function authorizeWrite(dynasty, uid, { vitals = [], doc = [] } = {}) {
  const gm = isGm(dynasty, uid);
  if (!gm && !memberOf(dynasty, uid)) {
    return {
      ok: false, reason: "not_a_member",
      denied: [...vitals, ...doc], isGm: false, role: ""
    };
  }
  const role = roleOf(dynasty, uid);

  const deniedVitals = deniedWrites(role, vitals, { isGm: gm });
  // An unrecognised document field is refused even for the GM: the ship has a
  // known shape and a typo should not add a key to it.
  const deniedDoc = doc.filter((f) => !GM_DOC_FIELDS.includes(f) || !gm);

  const denied = [...deniedVitals, ...deniedDoc];
  return {
    // All or nothing: a half-applied order leaves the ship in a state no
    // player chose.
    ok: denied.length === 0,
    reason: denied.length ? (gm ? "forbidden_fields" : "not_your_station") : null,
    denied,
    isGm: gm,
    role
  };
}

export function authorizeEvent(dynasty, uid, eventId) {
  const gm = isGm(dynasty, uid);
  return {
    ok: canTriggerEvent(eventId, gm),
    reason: gm ? (canTriggerEvent(eventId, gm) ? null : "unknown_event") : "gm_only",
    isGm: gm
  };
}

/* --------------------------------- the ship --------------------------------- */

export function newShip(code) {
  return {
    code,
    rev: 1,
    blueprint: null,
    vitals: null,
    combat: { phase: "extended", order: [], playerVitals: null },
    fleet: [],
    log: [],
    updatedAt: Date.now()
  };
}

// Every write bumps rev, which is what lets a client poll cheaply: it sends
// the rev it has and gets nothing back when nothing has changed.
export function applyPatch(ship, patch) {
  const base = ship || newShip(null);
  return {
    ...base,
    ...(patch || null),
    code: base.code,
    rev: (Number(base.rev) || 0) + 1,
    updatedAt: Date.now()
  };
}

// Applies the two surfaces. Vitals are merged key by key, because two stations
// writing different vitals in the same turn must not clobber each other —
// sending the whole object would make the later write win outright.
export function applyWrite(ship, { vitals = null, doc = null } = {}) {
  const base = ship || newShip(null);
  const patch = {};
  if (doc) for (const k of GM_DOC_FIELDS) if (k in doc) patch[k] = doc[k];
  if (vitals) patch.vitals = { ...(base.vitals || null), ...vitals };
  return applyPatch(base, patch);
}

export const LOG_MAX = 50;

export function appendLog(ship, entry) {
  const base = ship || newShip(null);
  const line = {
    at: Date.now(),
    ...entry
  };
  return { ...base, log: [line, ...(base.log || [])].slice(0, LOG_MAX) };
}

/* -------------------------------- redaction -------------------------------- */

// What a player is allowed to see of an enemy ship before anyone scans it.
const ENEMY_PUBLIC = ["id", "name", "hullId", "scanned"];

// An enemy the crew has scanned gives up its real numbers; one they have not
// gives up its name and hull and nothing else. The GM sees everything.
//
// A scan can come from either side: the GM may mark an enemy `scanned`, or the
// Master of Etherics may have spent an Active Augury on it, which lands in
// vitals.scans. The crew's own augur readings are held there rather than on
// the enemy, because the fleet is the GM's to edit and a scan is only
// something the crew has learned.
export function redactShip(ship, { isGm: gm = false } = {}) {
  if (!ship) return null;
  if (gm) return ship;
  const scans = (ship.vitals && Array.isArray(ship.vitals.scans))
    ? ship.vitals.scans : [];
  return {
    ...ship,
    fleet: (ship.fleet || []).map((enemy) => {
      if (enemy && (enemy.scanned || scans.includes(enemy.id))) return enemy;
      const out = {};
      for (const k of ENEMY_PUBLIC) if (enemy && k in enemy) out[k] = enemy[k];
      // Named so the crew's terminal can say WHY it has no numbers, rather
      // than rendering an enemy with zero hull and looking broken.
      out.unscanned = true;
      return out;
    })
  };
}

// The seat list a player needs: who is on which station. Emails are the GM's
// business, not the table's.
export function redactDynasty(dynasty, { isGm: gm = false } = {}) {
  if (!dynasty) return null;
  const base = {
    code: dynasty.code,
    name: dynasty.name,
    members: (dynasty.members || []).map((m) => ({
      charId: m.charId, name: m.name, role: m.role
    }))
  };
  return gm
    ? { ...base, ownerEmail: dynasty.ownerEmail,
        members: dynasty.members || [] }
    : base;
}
