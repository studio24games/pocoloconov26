# Poco Loco on Tequity (Xanadu RGS)

Integration type: **Mixed RGS**. Studio24 builds its own game server (Tequity RNG, REST endpoints, Docker image) and
the game client talks to Tequity's Connector. See the Xanadu *Game Integration & Deployment Guide*.

## How the client picks its RGS

`js/api.js` chooses once, at load:

| Launched from | RGS used | Who decides outcomes and balance |
|---|---|---|
| Tequity launch URL (has `provider`, `game`, `key`) or `?rgs=tequity` | `js/api-tequity.js` (Connector) | Tequity game server + operator wallet |
| Anywhere else (Vercel demo, localhost) | `js/api-local.js` (in-browser demo) | the browser, play money |

On Tequity the Connector is loaded from the relative path `/slotify/connector/connector.js`, so the same bundle
works on staging and production. For local development against Tequity's test CDN add `&connector=test`.

In Tequity mode the demo-only tools are off: the version switch, the secret door to the options menu, the
"DEMO · PLAY MONEY" badge and the demo balance carry-over. Forced outcomes (`?dev=1` + Demo tools) are only sent, as
Connector *cheats*, when Tequity's own `cheats()` call answers, which it does only in Tequity development mode.

## Round flow

1. Start-up: `create` → `authenticate` (balance, currency) → `info` (config, bets, state) → `recover` (settles an
   unfinished round) → `gameLoaded`.
2. Each round: `play(action, bet, undefined, cheat?)`, then `complete()` straight away. A Poco Loco round is a single
   wager (the Hold & Win feature is inside it), so there is no `next` action. The game animates the outcome it
   received; the wallet has already been settled.
3. Events: `setActiveBet` on stake or Double Chance change, `muted`/`unmuted`, `turboToggled`, `autoplayToggled`.
4. Connector callbacks into the game: `mute`, `unmute`, `turboToggle`, `paytableToggle`, `play`, `stopAutoplay`,
   `freeze`, `unfreeze`. The History button opens Tequity's game history.

## The game server (`server/`)

Built: see `server/README.md` to run, configure and deploy it. It implements every endpoint in
GAME_SERVER_INTEGRATION.pdf and draws rounds with the same code as the demo (`drawRound` in `math/wallet.js`), so for
the same random numbers it gives the same round and the same win (tested).

### Money

Tequity sends the bet in the **player's currency**. The server does not look stakes up in a euro list: it divides
the bet by the action's price ratio to get the base stake and pays exact integer cents:
`win = floor(totalWinBU × stakeCents / costPct)`, the same as `floor(totalWinBU × baseBetCents / 100)`.

### `GET /api/games/{game}/bets` (euros; Tequity converts)

| action | available[i] | coin | maxWin (× this action's bet) |
|---|---|---|---|
| `main` | `BET_LADDER[i] / 100` (0.25 … 100.00) | 100 | 5000 |
| `double` | main × 1.6 | 160 | 3125 |
| `buy` | main × 80, up to the 600.00 Buy limit | 8000 | 62.5 |
| `superbuy` | main × 160, up to the same limit | 16000 | 31.25 |

Lists line up by index with `main` (Buy lists are shorter: they stop at the limit). Coins are proportional to the
price, as the spec asks. **To confirm with Xanadu:** that `maxWin` is a multiple of the action's bet.

### `GET /api/games/{game}/config?variant=`

`publicConfig()` for the variant, as plain JSON, plus `profile` and, for meter variants, `candles`.

### `POST /api/games/{game}/play`

Returns a single Wager (no `next`): `{ action, bet, win, data: <engine round>, state: { meters } }`. `state` carries
the candle meters (key `profile:mode:baseBetCents`) between rounds; the server keeps no player data.

### RNG

Rounds use Tequity's RNG service (`RNG_SERVICE_HOST`/`RNG_SERVICE_PORT`), fetched in batches and consumed first to
last. Floats map back to their exact 32-bit integers and then to a range by rejection sampling (unbiased). If a
round runs the buffer dry it is replayed with the same numbers plus new ones, so no number is wasted and no round is
re-drawn (`server/src/rng.mjs`). Cheats (development only) use a local RNG for their re-draw loops.

## Testing

- `cd tests && npm test`: adapter unit tests against a fake Connector.
- `cd tests && npm run e2e`: the real game in a headless browser, in demo mode and in Tequity mode. In Tequity mode
  `tests/mock-connector.js` stands in for the Connector and plays the server's part with the real maths. Needs Playwright.
- `cd server && npm test`: game server tests (21), including equivalence with the demo wallet and RNG replay.
- `tests/mock-connector.js` is test-only and is not part of the uploaded bundle. With `window.__rgsServer` set it
  forwards rounds to the real server; the e2e run does this against `server/` and a stand-in RNG service.
