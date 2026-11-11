# Poco Loco game server (Tequity / Xanadu)

The game server for Tequity's **Mixed RGS** integration: it decides every Poco Loco round with Tequity's certified
RNG and answers Tequity's platform over the REST API in GAME_SERVER_INTEGRATION.pdf. It holds no balances and no
player data: the wallet is the operator's, and the candle meters travel in the `state` Tequity stores per player.

No npm dependencies. Node 22+. The maths is the repo's `math/` folder, shared with the demo.

## Run locally

```sh
# terminal 1: a stand-in for Tequity's RNG service (not certified)
node server/test/fake-rng-service.mjs 8081
# terminal 2: the server, from the repo root
PROVIDER=studio24 ENVIRONMENT=development RNG_SERVICE_HOST=127.0.0.1 RNG_SERVICE_PORT=8081 node server/src/index.mjs
curl localhost:8080/health                          # OK
curl -X POST localhost:8080/api/games/pocoloco/play -H 'Content-Type: application/json' -d '{"bet":1.25,"coin":100,"action":"main"}'
```

Without an RNG service: `cd server && npm run dev` (Node's crypto RNG and cheats on; development only).

## Configuration

| Variable | Meaning |
|---|---|
| `PORT` | Port to listen on. Set by Tequity; default 8080. |
| `PROVIDER` | Provider name allocated by Xanadu. **Required.** |
| `GAME` | Game id agreed with Xanadu. Default `pocoloco`. |
| `VARIANTS` | Comma-separated maths variants, first = default. Default `standard`. All must price their actions alike. |
| `RNG_SERVICE_HOST`, `RNG_SERVICE_PORT` | Tequity's RNG service. Set by Tequity. **Required in production.** |
| `ENVIRONMENT` | `production` (default) hides error details. |
| `ALLOW_LOCAL_RNG=1` | Development only: Node's crypto instead of the RNG service. Refused in production. |
| `ALLOW_CHEATS=1` | Development only: forced outcomes. Refused in production. |

## Endpoints

| Endpoint | |
|---|---|
| `GET /health` | `OK` (200) once the RNG answers; `ERROR` (500) before; `QUITING` (500) after SIGTERM |
| `GET /api/games` | `{ "<provider>": ["pocoloco"] }` |
| `GET /api/games/pocoloco/bets` | Bet list per action (euros), see docs/TEQUITY_INTEGRATION.md |
| `GET /api/games/pocoloco/config?variant=` | Game config for the variant |
| `GET /api/games/pocoloco/cheats` | Cheats per action; `{}` unless `ALLOW_CHEATS=1` |
| `POST /api/games/pocoloco/play` | One round: Wager `{ action, bet, win, data, state }` |
| `POST /api/games/pocoloco/validate` | Bet against the operator's `betLimits`; never valid by default |
| `POST /api/games/pocoloco/action`, `/evaluate` | 400: single-wager rounds, no evaluations yet |
| `GET /api/games/checksum?file=`, `GET /api/criticalFileChecksum?criticalFilePath=` | SHA1 of a file in the image, e.g. `math/engine.js` |

Errors: `{ "error": { "message", "code" } }` with Tequity's codes (`APPLICATION_ERROR`, `SERVER_ERROR`).

## Deploy

1. Ask Xanadu for the provider name, game id and GitHub token. Set them in the repo (Settings → Secrets and
   variables → Actions): `TEQUITY_PROVIDER`, `TEQUITY_GHCR_TOKEN`.
2. Actions → **Tequity: upload game server** → version `v1.0.0`. It builds `server/Dockerfile` and pushes
   `ghcr.io/slotify/games/<provider>:v1.0.0`.
3. Send Xanadu the version and the environment above (`PROVIDER`, `GAME`, `VARIANTS`). They deploy it, then run the
   Game Verifier in the Back Office.
4. For an update, bump the version (`v1.0.1`) and repeat.

## Tests

`cd server && npm test`. They cover equivalence with the demo wallet (same numbers → same round and win), other
currencies, candle meter state, cheat gating, RNG mapping and buffer replay, every HTTP endpoint against a stand-in
RNG service, and start-up refusals.
