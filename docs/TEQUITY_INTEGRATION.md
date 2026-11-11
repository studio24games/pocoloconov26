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

## What the game server must return

The client relies on these shapes. They come straight from `math/wallet.js`, so the server can reuse that code with
Tequity's RNG in place of `crypto.getRandomValues`.

### `GET /api/games/{game}/bets`

One entry per action. `available` lists line up **by index** with the main list: entry *i* of `buy` is the Buy price
of main stake *i*. Cash, in the player's currency, 2 decimals.

| action | available[i] |
|---|---|
| `main` | `BET_LADDER[i] / 100` (0.25 … 100.00) |
| `double` | main × 160% |
| `buy` | main × 80 (only stakes up to `BUY_MAX_STAKE`) |
| `superbuy` | main × 160 (same limit) |

`default` = `DEFAULT_BET / 100` scaled the same way, `coin` = 25. Take the percentages from `MODES[mode].costPct` of the
variant's profile, not from this table.

### `GET /api/games/{game}/config?variant={variant}`

`publicConfig()` from `math/wallet.js` for the variant's maths profile, as plain JSON: send the variant's own
`paytableBU`, `modes`, `rtp` and `loco` instead of the `*ByProfile` tables (those are lazy lookups and serialise to
`{}`). Add:

- `profile`: the maths profile the variant plays, e.g. `"standard"`.
- `candles`: `{ base, double }` candle counts, only if the variant has the candle meter.

### `POST /api/games/{game}/play`

Map `bet` back to the main stake through the index of `bets[action].available`, run the round, and return a Wager:

```json
{
  "action": "main",
  "bet": 1.25,
  "win": 3.80,
  "data": { "...": "the engine's round object (playRound output), exactly what record.round holds today" },
  "state": { "meters": { "standard:base:125": { "lit": 2, "n": 5 } } }
}
```

- `win` is cash: `floor(totalWin BU × betMinor / 100) / 100`.
- `state.meters` uses the wallet's key format `profile:mode:betMinor`. Only needed for the candle meter.
- No `next`.

### `GET /api/games/{game}/cheats`

`{ "main": [...], "double": [...], "buy": [...], "superbuy": [...] }` using the names the Demo tools panel already
sends (`feature`, `big`, `rescue`, the `DEV_SCENARIOS` and `SUPER_SCENARIOS` keys). Dev environments only.

## Testing

- `cd tests && npm test`: adapter unit tests against a fake Connector.
- `cd tests && npm run e2e`: the real game in a headless browser, in demo mode and in Tequity mode. In Tequity mode
  `tests/mock-connector.js` stands in for the Connector and plays the server's part with the real maths. Needs Playwright.
- `tests/mock-connector.js` is test-only and is not part of the uploaded bundle.
