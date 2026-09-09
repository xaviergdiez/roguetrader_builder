import {
  randomToken,
  setCookie,
  clearCookie,
  getSession,
  createSession,
  destroySession,
  getUser,
  saveUser,
} from "../../lib/auth.js";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";

function origin(req) {
  const proto = req.headers["x-forwarded-proto"] ?? "http";
  return `${proto}://${req.headers.host}`;
}

const redirectUri = (req) => `${origin(req)}/api/auth/callback`;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const { action } = req.query;

  if (action === "google") {
    const state = randomToken();
    setCookie(res, "gstate", state, 600);
    const url = new URL(GOOGLE_AUTH);
    url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID);
    url.searchParams.set("redirect_uri", redirectUri(req));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("prompt", "select_account");
    return res.redirect(302, url.toString());
  }

  if (action === "callback") {
    const { code, state } = req.query;
    // CSRF: the state we minted is in an HttpOnly cookie the attacker cannot read.
    if (!code || !state || state !== req.cookies?.gstate) {
      return res.status(400).send("Invalid OAuth state");
    }
    clearCookie(res, "gstate");

    const tokenRes = await fetch(GOOGLE_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri(req),
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      console.error("[auth] token exchange failed:", await tokenRes.text());
      return res.status(502).send("Sign-in failed");
    }

    // No JWKS signature check: this id_token came straight from Google's token
    // endpoint over TLS, so it is trusted by transport. Never do this with a
    // token supplied by the browser.
    const { id_token } = await tokenRes.json();
    const claims = JSON.parse(Buffer.from(id_token.split(".")[1], "base64url"));
    const { sub, email, name, email_verified } = claims;

    // Google will hand back unverified addresses. Without this, someone could
    // hold an unverified account bearing the owner's address.
    if (!email || email_verified === false) {
      return res.status(403).send("That Google account has no verified email address.");
    }

    // Single-owner gate. Unset OWNER_EMAIL and any Google account may sign in.
    if (process.env.OWNER_EMAIL && email !== process.env.OWNER_EMAIL) {
      return res.status(403).send("This app is not open for signups yet.");
    }

    const existing = await getUser(sub);
    await saveUser(sub, { email, name, chars: existing?.chars ?? [] });
    await createSession(res, sub);
    return res.redirect(302, "/");
  }

  if (action === "logout") {
    await destroySession(req, res);
    return res.status(200).json({ ok: true });
  }

  if (action === "me") {
    const uid = await getSession(req);
    if (!uid) return res.status(401).json({ error: "unauthenticated" });
    const user = await getUser(uid);
    return res.status(200).json({ uid, email: user?.email, name: user?.name });
  }

  return res.status(404).json({ error: "unknown_action" });
}
