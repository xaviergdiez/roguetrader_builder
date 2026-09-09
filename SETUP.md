# Setup

Manual steps to deploy this on Vercel. `npm run dev` needs none of them — sign-in
is stubbed locally and the roster lives in `localStorage`. Everything below is
only for `vercel dev` and real deployments.

## 1. Link the repo to Vercel

1. [vercel.com/new](https://vercel.com/new) → import `xaviergdiez/roguetrader_builder`.
2. Accept the detected settings. They are already correct:

   | Setting | Value |
   |---|---|
   | Framework preset | Vite |
   | Build command | `npm run build` |
   | Output directory | `dist` |
   | Install command | `npm install` |

3. **Do not deploy yet** — add the environment variables in steps 2 and 3 first.
   Without them the app builds fine but every sign-in returns a 500.

No `vercel.json` is needed. Nothing here overrides a default.

### If the repo does not appear in the import list

The repo is public, so visibility is not the cause. Check these in order:

1. **Which GitHub account is Vercel connected to.** There are two accounts on
   this machine — `xaviergdiez` (which owns this repo) and `coolblue-javier`.
   Vercel only lists repos for the GitHub login attached to it:
   Vercel → **Settings → Git** shows which. If it is the wrong one, disconnect
   and reconnect as `xaviergdiez`.
2. **Vercel's GitHub App repository access.** If it was installed with "Only
   select repositories", a newly created repo is not included. Fix it from the
   **Adjust GitHub App Permissions** link at the bottom of Vercel's repo list,
   or GitHub → Settings → Applications → Installed GitHub Apps → Vercel →
   Configure → Repository access.
3. **The Vercel scope in the dropdown.** A personal GitHub connection does not
   carry into a Team scope. Make sure the scope selector at the top of
   [vercel.com/new](https://vercel.com/new) is the account holding the
   connection.

Last resort: because the repo is public, **Import Third-Party Git Repository**
accepts the clone URL directly. Avoid it if you can — it deploys without the
GitHub App, so you lose push-to-deploy and PR previews.

## 2. Upstash Redis (required)

Sessions live in Redis, so sign-in does not work without it.

1. Vercel → your project → **Storage** → **Upstash Redis** → create a database.
   The integration sets `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
   for you — `Redis.fromEnv()` reads exactly those two names.
2. If you create the database in the Upstash console instead, copy the **REST**
   URL and token (not the `redis://` connection string) into the env vars yourself.

Every key this app writes is prefixed `rt:` (see [lib/storage.js](lib/storage.js)),
so one Upstash database can hold this build alongside the Shadowrun (`sr:`) and
D&D (unprefixed) ones. That prefix matters: `user:<google-sub>` is keyed on the
Google account alone, so unprefixed all three apps would share one user record.

## 3. Google sign-in (required)

1. [Google Cloud Console](https://console.cloud.google.com/) → create a project.
2. **APIs & Services → OAuth consent screen**
   - User type: **External**
   - Scopes: leave the defaults. `openid`, `email` and `profile` are
     non-sensitive and need no verification.
   - **Publish to Production.** In Testing mode consent expires after 7 days.
3. **Credentials → Create credentials → OAuth client ID → Web application**,
   with these authorized redirect URIs:
   - `https://<your-project>.vercel.app/api/auth/callback`
   - `http://localhost:3000/api/auth/callback` — for `vercel dev`
4. Set these in Vercel → Settings → Environment Variables:

   | Variable | Value |
   |---|---|
   | `GOOGLE_CLIENT_ID` | from step 3 |
   | `GOOGLE_CLIENT_SECRET` | from step 3 |
   | `OWNER_EMAIL` | your address — **the only account allowed to sign in** |

`OWNER_EMAIL` is the signup gate. Delete the variable to open the app to any
Google account. The callback also rejects addresses Google reports as
unverified, so an unverified account cannot claim your `OWNER_EMAIL`.

## Environment variables

| Variable | Set by | Purpose |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Upstash integration | sessions and user records |
| `GOOGLE_CLIENT_ID` / `_SECRET` | step 3 | sign-in |
| `OWNER_EMAIL` | step 3 | signup gate — delete to open registration |

Mirror them into `.env.local` for `vercel dev`. See [.env.example](.env.example).

## Gotchas

- **Preview deployments cannot sign in.** The redirect URI is derived from the
  request host ([api/auth/[action].js](api/auth/[action].js)), and every preview
  gets a fresh `*-git-*.vercel.app` hostname that is not in Google's authorized
  list. Test auth on production, or add a specific preview domain to Google.
- **`http` vs `https`.** The session cookie is only marked `Secure` when
  `process.env.VERCEL` is set, because `vercel dev` serves plain HTTP and would
  otherwise drop it.
- **Vercel Hobby allows 12 serverless functions**, and it counts *every* `.js`
  file under `/api` — not just endpoints. That is why shared modules live in
  top-level [lib/](lib/). Currently 1 function.
- **Upstash free tier**: 10k commands/day. This app is nowhere near it — a
  sign-in is a handful of commands and the sheet itself is stored client-side.

## Not built yet

Both are marked with `ponytail:` comments where they would slot in.

- **Portrait generation.** The GenAI button in the dossier is deliberately
  disabled. It needs a `generate-avatar` endpoint and a `GEMINI_API_KEY`; see
  `api/generate-avatar.js` in `shadow-run_builder` for the shape.
- **Per-account characters.** Signing in gates the app, but the roster is still
  `localStorage`, so characters are per-browser rather than per-account. Making
  them server-side means an `api/characters.js` plus the character-key helpers
  in `lib/storage.js`; swapping `readRoster`/`writeRoster` in
  [src/roster.js](src/roster.js) for `fetch` calls is the only client change.

## Self-checks

No test framework. Each non-trivial pure module has a runnable check:

```bash
node lib/auth.check.mjs
node src/framing.check.mjs
node src/roster.check.mjs
node src/gear.check.mjs
node src/wounds.check.mjs
node src/dice.check.mjs
node src/effects.check.mjs
```
