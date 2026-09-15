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
