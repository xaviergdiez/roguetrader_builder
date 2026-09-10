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

This happened on the first import, and the cause was **Vercel's GitHub App
being installed with "Only select repositories"** — the selected list was fixed
before this repo existed, so the app could not see it.

Fix: [github.com/settings/installations](https://github.com/settings/installations)
→ **Vercel** → **Configure** → *Repository access* → add `roguetrader_builder`,
or switch to **All repositories**. Reload
[vercel.com/new](https://vercel.com/new) afterwards. Vercel's import list also
has an *Adjust GitHub App Permissions* link at the bottom that goes there.

How to tell that is what you are looking at: the import list is sorted
newest-first, so a repo pushed today belongs at the top. If your other repos
appear — private ones included — under the right scope, and only the new one is
missing, it is per-repo selection and not a permission or visibility problem.

Two other causes worth ruling out if the above does not match:

- **Vercel connected to the wrong GitHub account.** There are two on this
  machine, `xaviergdiez` (which owns this repo) and `coolblue-javier`. Vercel
  lists repos only for the login attached to it — see Vercel → **Settings → Git**.
- **The Vercel scope in the dropdown.** A personal GitHub connection does not
  carry into a Team scope.

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
| `GEMINI_API_KEY` | you | portrait generation — without it that one button returns 503 |

Mirror them into `.env.local` for `vercel dev`. See [.env.example](.env.example).

## Sign-in errors and what they mean

**`Error 400: invalid_request` — "Missing required parameter: client_id"**
`GOOGLE_CLIENT_ID` is empty or absent *on that deployment*. Google reports it as
missing rather than invalid because an empty value produces `client_id=` with
nothing after it. Two causes, both common:

- Vercel environment variables are **per-environment**. Adding them to
  Development only leaves Production blank. Check all three boxes.
- `vercel env pull` writes names it has no value for as `""`, and an empty
  string is not a value.

The app now returns a plain 500 naming the missing variable instead of
forwarding you to Google with a blank parameter, so this should be self-evident
next time.

**`Error 400: redirect_uri_mismatch`** The URI on the OAuth client must match
what the app sends, which is the request host plus `/api/auth/callback` — the
full path, not just the origin:

```
https://roguetrader-builder.vercel.app/api/auth/callback
```

Note Vercel turns the underscore in `roguetrader_builder` into a hyphen for the
domain. A bare origin with no path is the usual mistake.

**`403 This app is not open for signups yet.`** Your Google address does not
match `OWNER_EMAIL`. That is the gate working.

**`500` mentioning Redis** Neither the `UPSTASH_` nor the `KV_REST_API_` pair
resolved to a non-empty value. See `redisConfigFromEnv()` in
[lib/storage.js](lib/storage.js).

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

## Portraits

[api/generate-avatar.js](api/generate-avatar.js) posts to Gemini and returns the
image bytes; the browser re-encodes to a 768px JPEG data URL before storing it.
The prompt is built server-side in [lib/prompt.js](lib/prompt.js) from the
character's origin path — each of the 38 origin options carries a visual phrase,
so two Explorators with different birthrights do not get the same portrait. The
client never supplies the prompt, so a signed-in caller cannot turn the endpoint
into a general-purpose image generator on your key.

The endpoint is behind sign-in because every call costs money. Without
`GEMINI_API_KEY` it returns 503 and the button reports it.

## Where characters are stored

Signed in, the roster lives on your Google account via
[api/characters.js](api/characters.js) and follows you between devices. Signed
out — and under a plain `npm run dev`, which has no serverless functions — it
falls back to `localStorage` in that one browser. The roster dialog says which
of the two is in use.

The split matters: a small `{id, name, career}` index sits on the user record
and each character's body has its own Redis key (`charKey` in
[lib/storage.js](lib/storage.js)), because Upstash caps a record at 1MB and a
portrait is a few hundred KB. One list holding every character would break at a
handful of them. The index is fetched on load; a character's body only when you
open it.

On first sign-in from a browser that already has local characters, they are
copied up to the account and the local copy is left in place.

## Printing a dossier

The Print button on the dossier calls `window.print()`. There is no PDF
library: the browser's own dialog saves to PDF, and does it better than
rasterising the DOM would. Choose "Save as PDF" as the destination.

What prints is not the screen. `PrintSheet` renders a purpose-built document —
black on white, every section at once — because the on-screen dossier is
tabbed and printing it directly would emit whichever single tab was open. It
takes the lists the dossier has already derived, so the two cannot disagree.
The wound boxes are meant to be ticked with a pen and keep their ink via
`print-color-adjust: exact`.

## Repairing the character sheet

Every tab of the shared Google Sheet was flattened on the way in: each tab's
whole IDENTITY and ORIGIN PATH block ended up inside cell A1, so A1 read
`Field # — IDENTITY — Name Career Concept …` and there was no `Name` row, no
origin path and no gear. The importer now refuses such a tab and says so,
rather than handing back a nameless character whose final characteristics have
landed in the roll fields and get origin modifiers applied a second time.

The workbook committed here is intact. To rebuild clean tabs:

```bash
python3 scripts/xlsx-to-csv.py characters.xlsx out/   # one CSV per character
node scripts/audit-parse.mjs out/                     # prove they parse
```

Then import each CSV as its own tab, or re-upload `characters.xlsx` to Drive
and open it as a Google Sheet. Do not paste the rows in as text — that is what
flattened them.

`audit-parse.mjs` also cross-checks `lib/prompt.js` against the app's own
`SHEET_CATALOG`, which is how two origin options were caught sitting under the
wrong step and silently losing their portrait phrase.

Current state, from the intact workbook: **11 of 13 parse cleanly**. The two
that do not are the xenos characters below.

## Not built yet

Marked with a `ponytail:` comment where it would slot in.

- **Aeldari and Ork characters.** Parked: the origin material is in *Into the
  Storm*, which is not in the shared Drive folder.

## Self-checks

No test framework. Each non-trivial pure module has a runnable check:

```bash
for f in src/*.check.mjs lib/*.check.mjs; do node "$f" || echo "FAIL $f"; done
```

Listing them individually here only went stale — that loop finds whatever
exists.
