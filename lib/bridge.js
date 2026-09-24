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

import { deniedWrites, canTriggerEvent, isGmOnlyRole } from "../src/shiproles.js";
import { authorizeGroundEvent as authoriseGroundEventCore } from "../src/groundcombat.js";

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

/* ---------------------------------- seats ----------------------------------
   A bridge holds two kinds of seat, and they are counted differently.

     player  one per ACCOUNT. A person plays one character, so joining again
             replaces the seat rather than adding a second.
     npc     one per CHARACTER, all belonging to the GM. A GM runs a bridge
             full of officers, so these are keyed by charId and there may be
             many from the same account — and a GM's roster may hold others
             that are not on this bridge at all.

   Keying every seat by uid alone is what made those mutually exclusive: the
   GM's second NPC replaced the first. */

export const isNpcSeat = (m) => Boolean(m && m.npc);

// The account's own seat. NPC seats are skipped: an account's membership is
// about the person, not about which officers they happen to be running.
export const memberOf = (dynasty, uid) =>
  ((dynasty && dynasty.members) || [])
    .find((m) => m.uid === uid && !isNpcSeat(m)) || null;

export const npcSeats = (dynasty) =>
  ((dynasty && dynasty.members) || []).filter(isNpcSeat);

export const playerSeats = (dynasty) =>
  ((dynasty && dynasty.members) || []).filter((m) => !isNpcSeat(m));

export const seatForChar = (dynasty, charId) =>
  ((dynasty && dynasty.members) || []).find((m) => m.charId === charId) || null;

export function roleOf(dynasty, uid) {
  const m = memberOf(dynasty, uid);
  return m ? m.role || "" : "";
}

// A GM could otherwise seat hundreds of officers, each polled by every player.
export const MAX_NPC_SEATS = 20;

// charId is stored rather than concatenated into a key, but it is still
// checked: a seat whose id is an object would break every comparison.
const cleanCharId = (v) =>
  (typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null);

const seatName = (v) =>
  String(v || "").trim().slice(0, 60) || "An unnamed adept";

/* ------------------------------- crew cards -------------------------------
   The GM needs a quick reference for every character on the crew, secrets and
   favours included. Those sheets live per account, under keys only their owner
   can read, so the GM cannot fetch them — instead a player publishes a card
   when they join, and the card rides on their seat.

   A card is GM-ONLY. It carries a Secret, and players must not read each
   other's. redactDynasty strips it for everybody else, which is the whole
   reason this is a separate field rather than more of the seat. */

const line = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

export const CARD_MAX_ENTRIES = 24;

// Clamped rather than trusted: this arrives from a player's browser, is stored
// on the dynasty, and is then shown to the GM.
export function cleanCard(card) {
  const c = card && typeof card === "object" ? card : null;
  if (!c) return null;
  const list = (v) => (Array.isArray(v) ? v : [])
    .map((x) => line(x, 120)).filter(Boolean).slice(0, CARD_MAX_ENTRIES);
  const chars = {};
  if (c.characteristics && typeof c.characteristics === "object") {
    for (const [k, v] of Object.entries(c.characteristics)) {
      if (/^[a-z]{1,3}$/.test(k) && Number.isFinite(Number(v))) {
        chars[k] = Math.round(Number(v));
      }
    }
  }
  return {
    career: line(c.career, 60),
    homeWorld: line(c.homeWorld, 60),
    characteristics: chars,
    wounds: line(c.wounds, 20),
    fate: Number.isFinite(Number(c.fate)) ? Math.round(Number(c.fate)) : null,
    skills: list(c.skills),
    talents: list(c.talents),
    traits: list(c.traits),
    // Gear labels, same spelling as gear.js — see groundcombat.js's
    // weaponProfile()/armourProfile() for what actually resolves them into
    // stats. Kept separate from traits so the GM's terminal knows which list
    // to run an attack roll against.
    weapons: list(c.weapons),
    armour: list(c.armour),
    // The two the GM actually reaches for at the table.
    secret: line(c.secret, 600),
    favour: line(c.favour, 600),
    updatedAt: Date.now()
  };
}

// Joining twice updates the seat rather than adding a second one: a player who
// switches character or station is the same person at the same table.
// Joining twice takes the same seat rather than adding a second one: a player
// who switches character or station is the same person at the same table. Only
// their own PLAYER seat is replaced — the GM's NPC seats are left alone, which
// is why this filters on the seat kind as well as the account.
export function joinDynasty(dynasty, { uid, charId, name, role, card }) {
  // The Rogue Trader is the GM's character, so a player cannot take that
  // station. Refused rather than quietly downgraded: someone who chose it
  // should be told, not seated somewhere else without being asked.
  if (isGmOnlyRole(role) && !isGm(dynasty, uid)) {
    return { dynasty, error: "gm_only_role" };
  }
  const members = ((dynasty && dynasty.members) || [])
    .filter((m) => isNpcSeat(m) || m.uid !== uid);
  return {
    dynasty: {
    ...dynasty,
    members: [...members, {
      uid,
      charId: cleanCharId(charId),
      name: seatName(name),
      role: role || "",
      card: cleanCard(card),
      joinedAt: Date.now()
    }]
    },
    error: null
  };
}

// Seats one of the GM's characters at a station. Keyed by charId, so a GM may
// seat as many as they like; assigning the same character again moves it to a
// different station rather than duplicating it.
export function assignNpc(dynasty, { uid, charId, name, role, card }) {
  const id = cleanCharId(charId);
  if (!id) return { dynasty, error: "bad_character_id" };

  const existing = ((dynasty && dynasty.members) || []).filter((m) => m.charId !== id);
  const wasSeated = existing.length !== ((dynasty && dynasty.members) || []).length;
  if (!wasSeated && npcSeats(dynasty).length >= MAX_NPC_SEATS) {
    return { dynasty, error: "too_many_npcs" };
  }

  return {
    dynasty: {
      ...dynasty,
      members: [...existing, {
        uid, charId: id, name: seatName(name), role: role || "",
        card: cleanCard(card),
        npc: true, joinedAt: Date.now()
      }]
    },
    error: null
  };
}

// Removes an NPC seat. Refuses to touch a player's seat, so a stray charId
// cannot eject someone from the table.
export function unassignNpc(dynasty, charId) {
  const id = cleanCharId(charId);
  return {
    ...dynasty,
    members: ((dynasty && dynasty.members) || [])
      .filter((m) => !(isNpcSeat(m) && m.charId === id))
  };
}

// Only the caller's own player seat. A GM's NPCs are not evicted because
// somebody left, and leaving does not strip the officers off the bridge.
export function leaveDynasty(dynasty, uid) {
  return {
    ...dynasty,
    members: ((dynasty && dynasty.members) || [])
      .filter((m) => isNpcSeat(m) || m.uid !== uid)
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
    messages: [],
    // playerVitals: charId -> { max, damage, critSoFar }, mirrored in from
    // the player's own sheet on join (see mirrorPlayerWounds) and then owned
    // by ground combat events from there — see groundcombat.js.
    // ground: { npcs: [] } is the GM's roster of ground-combat combatants,
    // separate from `fleet` (enemy SHIPS, a different shape entirely).
    combat: { phase: "extended", order: [], playerVitals: {}, ground: { npcs: [] } },
    fleet: [],
    log: [],
    updatedAt: Date.now()
  };
}

/* ------------------------- ground combat wounds mirror -------------------------
   A PC's Wounds live on the player's own character sheet, which the GM
   cannot read. For the GM to damage them in a live encounter, the CURRENT
   state has to be mirrored onto the shared ship, the same way a crew card is
   published on join — publishing is the player's own act, not a read the
   server performs on their private data. */

export function cleanWounds(w) {
  const src = w && typeof w === "object" ? w : null;
  if (!src) return null;
  const max = Math.max(0, Math.floor(Number(src.max) || 0));
  const damage = Math.min(max, Math.max(0, Math.floor(Number(src.damage) || 0)));
  const critSoFar = Math.max(0, Math.floor(Number(src.critSoFar) || 0));
  return { max, damage, critSoFar, updatedAt: Date.now() };
}

// Called alongside joinDynasty(), against the ship rather than the dynasty —
// combat.playerVitals lives there. A charId with no wounds payload is left
// untouched rather than zeroed, so re-joining to change station doesn't wipe
// an in-progress encounter's damage.
export function mirrorPlayerWounds(ship, charId, wounds) {
  const id = cleanCharId(charId);
  const clean = cleanWounds(wounds);
  if (!id || !clean) return ship;
  const base = ship || newShip(null);
  const combat = base.combat || { phase: "extended", order: [], playerVitals: {}, ground: { npcs: [] } };
  return applyPatch(base, {
    combat: { ...combat, playerVitals: { ...(combat.playerVitals || {}), [id]: clean } }
  });
}

// The ground-combat twin of authorizeEvent(): the permission logic itself
// lives in groundcombat.js next to the event catalogue it checks against —
// this just supplies the dynasty-shaped facts (isGm, membership, which
// charIds this account holds a seat for) that authorizeGroundEvent() needs.
export function authorizeGroundEvent(dynasty, uid, event) {
  const gm = isGm(dynasty, uid);
  const member = Boolean(memberOf(dynasty, uid));
  const ownCharIds = charIdsFor(dynasty, uid);
  const result = authoriseGroundEventCore(event, { isGm: gm, isMember: member, ownCharIds });
  return { ...result, isGm: gm };
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

/* ---------------------------- secret messages ----------------------------
   A word from the GM to one character alone. Stored on the ship because that
   is the document everyone already polls, and filtered on the way out: a
   player sees only what is addressed to a character they hold.

   Appended server-side rather than written as a field, so a client with a
   stale copy cannot drop somebody else's messages by sending the whole list
   back. */

export const MESSAGE_MAX = 60;

export function addMessage(ship, { to, text, from = "gm" }) {
  const base = ship || newShip(null);
  const charId = cleanCharId(to);
  if (!charId) return { ship: base, error: "bad_character_id" };
  const body = String(text == null ? "" : text).trim().slice(0, 1000);
  if (!body) return { ship: base, error: "empty_message" };

  const message = {
    id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    to: charId, from, text: body, at: Date.now()
  };
  // applyPatch, not a bare spread: it bumps rev, and the poll only refetches
  // when rev differs. Without that a message would sit in the document and
  // never reach the player it was written for.
  return {
    ship: applyPatch(base, {
      messages: [message, ...(base.messages || [])].slice(0, MESSAGE_MAX)
    }),
    error: null
  };
}

// The characters an account holds a seat for. A player holds one; a GM may
// hold several through their officers.
export function charIdsFor(dynasty, uid) {
  return ((dynasty && dynasty.members) || [])
    .filter((m) => m.uid === uid && m.charId)
    .map((m) => m.charId);
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
export function redactShip(ship, { isGm: gm = false, charIds = [] } = {}) {
  if (!ship) return null;
  if (gm) return ship;
  const scans = (ship.vitals && Array.isArray(ship.vitals.scans))
    ? ship.vitals.scans : [];
  const mine = Array.isArray(charIds) ? charIds : [];
  return {
    ...ship,
    // A secret message goes to one character. Everyone polls the same
    // document, so the filtering has to happen here — a client-side filter
    // would ship every player everyone else's private word from the GM.
    messages: (ship.messages || []).filter((m) => m && mine.includes(m.to)),
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
    // Seats are public: the crew needs to know who holds which station, NPC
    // officers included. Account ids are not, and neither are crew cards —
    // a card carries a Secret, and players must not read each other's.
    members: (dynasty.members || []).map((m) => ({
      charId: m.charId, name: m.name, role: m.role, npc: Boolean(m.npc),
      hasCard: Boolean(m.card)
    }))
  };
  return gm
    ? { ...base, ownerEmail: dynasty.ownerEmail,
        members: dynasty.members || [] }
    : base;
}
