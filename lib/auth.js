import crypto from "node:crypto";
import { redis, NS } from "./storage.js";

const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days

export function randomToken() {
  return crypto.randomBytes(32).toString("hex");
}

// Secure only on Vercel — `vercel dev` serves plain http and would drop the cookie.
// SameSite=Lax (not Strict) so the cookie survives the Google OAuth redirect back.
export function setCookie(res, name, value, maxAge) {
  const parts = [
    `${name}=${value}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (process.env.VERCEL) parts.push("Secure");
  const prev = res.getHeader("Set-Cookie");
  const cookie = parts.join("; ");
  res.setHeader("Set-Cookie", prev ? [].concat(prev, cookie) : cookie);
}

export function clearCookie(res, name) {
  setCookie(res, name, "", 0);
}

// A session is { uid, gm }. gm records which door they came in through: the
// GM sign-in or the player one.
//
// Older sessions stored a bare uid string, so those are read as a player
// session rather than crashing or logging everyone out on deploy.
export function readSessionRecord(value) {
  if (!value) return null;
  if (typeof value === "string") return { uid: value, gm: false };
  return { uid: value.uid, gm: Boolean(value.gm) };
}

export async function getSessionRecord(req) {
  const sid = req.cookies?.sid;
  if (!sid) return null;
  return readSessionRecord(await redis.get(`${NS}session:${sid}`));
}

// Kept returning the uid, because that is what every existing caller expects.
export async function getSession(req) {
  const rec = await getSessionRecord(req);
  return rec ? rec.uid : null;
}

export async function createSession(res, uid, { gm = false } = {}) {
  const token = randomToken();
  await redis.set(`${NS}session:${token}`, { uid, gm: Boolean(gm) }, { ex: SESSION_TTL });
  setCookie(res, "sid", token, SESSION_TTL);
}

export async function destroySession(req, res) {
  const sid = req.cookies?.sid;
  if (sid) await redis.del(`${NS}session:${sid}`);
  clearCookie(res, "sid");
}

// Returns uid, or sends 401 and returns null. Callers:
// `const uid = await requireUser(req, res); if (!uid) return;`
export async function requireUser(req, res) {
  const uid = await getSession(req);
  if (!uid) {
    res.status(401).json({ error: "unauthenticated" });
    return null;
  }
  return uid;
}

// The same, for the handlers that need to know which door they came in
// through. Returns { uid, gm }.
export async function requireSession(req, res) {
  const rec = await getSessionRecord(req);
  if (!rec || !rec.uid) {
    res.status(401).json({ error: "unauthenticated" });
    return null;
  }
  return rec;
}

export async function getUser(uid) {
  return (await redis.get(`${NS}user:${uid}`)) ?? null;
}

export async function saveUser(uid, user) {
  await redis.set(`${NS}user:${uid}`, user);
}

/* CHANGING THE ACCOUNT RECORD WITHOUT LOSING SOMEONE ELSE'S CHANGE.

   Every endpoint used to read the whole record, change its own field, and
   write the whole record back. Two of those running at once (a deck saved
   while a ground was, a character while the library) each wrote back a copy
   that lacked the other's entry, and the loser's index entry was gone. The
   body stayed in Redis, unlisted: the same picture the sign-in wipe left.
   Measured on the real handlers, four saves fired together lost an entry
   every time.

   updateUser does it as a compare-and-set. It reads the record with its
   version (MGET, so the two come from one instant), runs `mutate` on a copy,
   and writes only if the version is still the one it read; if another save
   got in first it reads again and runs `mutate` again on the newer record.
   So `mutate` must be a function of the record it is given and nothing else:
   it is run more than once when saves collide. Anything slow or with side
   effects (writing a body, scanning keys) belongs before the call.

   `mutate(user)` changes the copy it is handed; returning false means "nothing
   to write" and leaves the record untouched. The version lives under a key of
   its own, so the record's shape (and every reader of it, old code included)
   is exactly what it was.

   Returns { written, user, value }, where `value` is what `mutate` returned. */
export const userKey = (uid) => `${NS}user:${uid}`;
export const versionKey = (uid) => `${NS}user:${uid}:v`;

export const CAS_SCRIPT = `
local cur = redis.call('GET', KEYS[2])
if (cur == false and ARGV[1] == '') or cur == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[2])
  redis.call('SET', KEYS[2], ARGV[3])
  return 1
end
return 0`;

export class AccountBusy extends Error {
  constructor() { super("account_busy"); this.code = "account_busy"; }
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// For a handler's catch: answers 503 (and says to retry) when the account was too
// contended to save, and returns true; anything else is for the caller to rethrow.
export function answerBusy(res, err) {
  if (!err || err.code !== "account_busy") return false;
  res.setHeader("Retry-After", "1");
  res.status(503).json({ error: "account_busy" });
  return true;
}

export async function updateUser(uid, mutate, { client = redis, tries = 8, wait = pause } = {}) {
  for (let attempt = 0; attempt < tries; attempt++) {
    const [raw, ver] = await client.mget(userKey(uid), versionKey(uid));
    const seen = ver == null ? "" : String(ver);
    const base = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const draft = structuredClone(base);
    const value = await mutate(draft);
    if (value === false) return { written: false, user: base, value };
    const next = String((Number(seen) || 0) + 1);
    let won;
    try {
      won = await client.eval(CAS_SCRIPT, [userKey(uid), versionKey(uid)], [seen, JSON.stringify(draft), next]);
    } catch (err) {
      // The database refused the script (a plan or permission that does not allow EVAL).
      // Saving must not stop working because of that: write the record plainly, as it
      // was written before, and say so in the log so it is not silent.
      console.error("[updateUser] compare-and-set unavailable, writing plainly:", err && err.message);
      await client.set(userKey(uid), draft);
      await client.set(versionKey(uid), next);
      return { written: true, user: draft, value };
    }
    if (Number(won) === 1) return { written: true, user: draft, value };
    // Someone else's save landed between the read and the write. A short,
    // growing, jittered pause so two retrying saves do not collide again in step.
    await wait(Math.round((8 + Math.random() * 24) * (attempt + 1)));
  }
  throw new AccountBusy();
}

/* What signing in writes to the account record: the identity refreshed, and
   EVERYTHING ELSE LEFT ALONE.

   The callback used to save { email, name, chars } as the whole record. That
   was right when chars was all there was; since then the record has also held
   the saved-deck index, the ground index, the homebrew library (hulls,
   encounters, endeavours, void charts) and the tables the account belongs to,
   and every sign-in on any device quietly erased all of them. The deck and
   ground bodies are under their own keys and survived, but nothing pointed at
   them any more, so a second device signing in to the same account found the
   first one's maps gone. Pure so auth.check.mjs can pin it. */
export function signInRecord(existing, { email, name }) {
  const base = existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {};
  return { ...base, email, name, chars: Array.isArray(base.chars) ? base.chars : [] };
}
