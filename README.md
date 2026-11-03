# Rogue Trader builder

A character builder and game-master tool for Rogue Trader (Warhammer 40,000 roleplay),
as a web app: the origin path and sheet, a roster that follows an account between
devices, a shared bridge for a table, and the GM's dashboard (hostiles, boarding
actions, void combat, battle and void maps, endeavours, the session log).

Production: https://roguetrader-builder.vercel.app, deployed by pushing `main`.

## Run it

```
npm install
npm run dev        # the app, with sign-in stubbed and the roster in localStorage
```

`npm run dev` needs no setup and has no `/api`. To exercise sign-in, the account
store and image generation, set the environment (see [SETUP.md](SETUP.md) and
[.env.example](.env.example)) and use `vercel dev`.

## Test it

```
npm test           # every self-check (src/*.check.mjs, lib/*.check.mjs) and the API tests
npm run test:e2e   # the browser tests; needs Chrome (set CHROME to use another binary)
npm run build
```

- **Self-checks** (`*.check.mjs` beside each module) are plain Node scripts with assertions.
  The rules live in pure modules (`src/*.js`, `lib/*.js`) so they run without a browser.
- **API tests** (`tests/api-*.mjs`) run the real `api/` handlers against a fake Upstash
  (`tests/sim-api.mjs`), including saves made at the same moment and the daily image limit.
- **Browser tests** (`tests/e2e/*.mjs`) drive headless Chrome against a dev server whose
  `/api` points at the same fake database: two-device sync and recovery, weapon rolls,
  a crashing sheet, screens loaded on demand.

CI (`.github/workflows/ci.yml`) runs all of it on every push to `main` and on pull requests.

## How it is laid out

| | |
|---|---|
| `src/` | The app. `RogueTraderBuilder.jsx` is the shell and the character screens; the heavy screens (`BattleMap`, `VoidMap`, `VoidPanel`, `CodexDialog`, `MapLibrary`) load when first opened. Rules and data are in plain modules (`groundcombat.js`, `attackroll.js`, `voidcombat.js`, `gear.js`, `bestiary.js`, ...). |
| `api/` | Vercel serverless functions. Each `.js` here is one function, and the Hobby plan allows twelve, so shared logic is in `lib/`. |
| `lib/` | Server-side logic with no framework in it: the account record, storage keys, the daily image allowance, prompts for image generation. |
| `tests/` | API and browser tests and the simulator they share. |
| `scripts/`, `tools/` | One-off conversion and audit scripts; `scripts/run-checks.mjs` runs the self-checks. |

## Things worth knowing before changing it

- **The account record** (`rt:user:<id>`) holds only small indexes (characters, decks, grounds,
  table codes). Bodies live under their own keys, and the homebrew library has one too. Change
  the record only through `updateUser` in `lib/auth.js`: it retries on a conflict, so two saves
  at once cannot overwrite each other. A plain read-then-write of the whole record loses
  entries, which `tests/api-race.mjs` demonstrates.
- **Book content** (Rogue Trader, Imperium Maledictum, Wrath & Glory, the Tau guide, Drydock)
  is kept as numbers, notes in the app's own words and page references, never reproduced text.
  Where two books cover the same thing the native entry wins, then Imperium Maledictum, then
  Wrath & Glory.
- **Image generation** costs money per call and is behind sign-in with a daily limit per
  account (`IMAGE_DAILY_LIMIT`, default 40). Set `OWNER_EMAIL` to restrict who may sign in.
