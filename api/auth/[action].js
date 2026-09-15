import {
  randomToken,
  setCookie,
  clearCookie,
  getSession,
  getSessionRecord,
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

// `vercel env pull` writes variables it has no value for as "" rather than
// omitting them, and Vercel env vars are per-environment — so a name can be
// present on the deployment and still be blank. An empty client_id sends the
// user to Google with `client_id=`, which it reports as "Missing required
// parameter: client_id" — an error that points at Google rather than at the
// deployment. Treat empty as missing and say so plainly instead.
const envValue = (name) => {
  const v = process.env[name];
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

function missingEnv(res, ...names) {
  const missing = names.filter((n) => !envValue(n));
  if (!missing.length) return false;
  console.error("[auth] not configured, missing/empty:", missing.join(", "));
  res
    .status(500)
    .send(
      "Sign-in is not configured on this deployment: " +
        missing.join(", ") +
        " is missing or empty. Set it in the Vercel project's environment " +
        "variables for this environment, then redeploy."
    );
  return true;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const { action } = req.query;

  if (action === "google") {
    if (missingEnv(res, "GOOGLE_CLIENT_ID")) return;
    // Which door: /api/auth/google is a player, ?gm=1 is the GM. The intent
    // rides inside `state` rather than a second cookie, so it is still the
    // one value compared on the way back and cannot drift from it.
    //
    // It is self-asserted: anyone may use the GM door. It decides which
    // surface you get and whether you may open a table — authority over a
    // particular table stays bound to the account that created it, so a
    // player signing in this way cannot seize someone else's game.
    const wantsGm = req.query.gm === "1";
    const state = `${randomToken()}.${wantsGm ? "1" : "0"}`;
    setCookie(res, "gstate", state, 600);
    const url = new URL(GOOGLE_AUTH);
    url.searchParams.set("client_id", envValue("GOOGLE_CLIENT_ID"));
    url.searchParams.set("redirect_uri", redirectUri(req));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("prompt", "select_account");
    return res.redirect(302, url.toString());
  }

  if (action === "callback") {
    if (missingEnv(res, "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET")) return;
    const { code, state } = req.query;
    // CSRF: the state we minted is in an HttpOnly cookie the attacker cannot read.
    if (!code || !state || state !== req.cookies?.gstate) {
      return res.status(400).send("Invalid OAuth state");
    }
    clearCookie(res, "gstate");
    // Only meaningful because the whole string was compared above.
    const asGm = String(state).endsWith(".1");

    const tokenRes = await fetch(GOOGLE_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: envValue("GOOGLE_CLIENT_ID"),
        client_secret: envValue("GOOGLE_CLIENT_SECRET"),
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

    // Allowlist gate. OWNER_EMAIL takes a comma-separated list, because a
    // table needs more than one account: with a single address set, nobody but
    // the owner could ever sign in and the shared bridge was unusable.
    // Unset or blank lets any Google account in, which is why envValue treats
    // "" as absent rather than as a value to match.
    const allowed = (envValue("OWNER_EMAIL") || "")
      .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (allowed.length && !allowed.includes(String(email).toLowerCase())) {
      return res.status(403).send("This app is not open for signups yet.");
    }

    const existing = await getUser(sub);
    await saveUser(sub, { email, name, chars: existing?.chars ?? [] });
    await createSession(res, sub, { gm: asGm });
    return res.redirect(302, "/");
  }

  if (action === "logout") {
    await destroySession(req, res);
    return res.status(200).json({ ok: true });
  }

  if (action === "me") {
    const rec = await getSessionRecord(req);
    if (!rec || !rec.uid) return res.status(401).json({ error: "unauthenticated" });
    const user = await getUser(rec.uid);
    return res.status(200).json({
      uid: rec.uid, email: user?.email, name: user?.name, gm: rec.gm
    });
  }

  return res.status(404).json({ error: "unknown_action" });
}
