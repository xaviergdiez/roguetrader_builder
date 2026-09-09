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

export async function getSession(req) {
  const sid = req.cookies?.sid;
  if (!sid) return null;
  return await redis.get(`${NS}session:${sid}`);
}

export async function createSession(res, uid) {
  const token = randomToken();
  await redis.set(`${NS}session:${token}`, uid, { ex: SESSION_TTL });
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

export async function getUser(uid) {
  return (await redis.get(`${NS}user:${uid}`)) ?? null;
}

export async function saveUser(uid, user) {
  await redis.set(`${NS}user:${uid}`, user);
}
