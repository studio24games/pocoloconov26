# Poco Loco – rules for automated agents (Codex etc.)

Project: Poco Loco (game ID `S24-002`), a 3-4-3 Hold & Win browser slot by Studio24 Games. Current build v0.75f.
Read `REVIEW_NOTES.md` first: it explains the layout, the option profiles and the demo-only tools.

## Stack
- Plain HTML/CSS/JS ES modules. No framework, no bundler, no package.json, no build step.
- `index.html`, `style.css`, `js/*` = client. `math/*` = game maths, wallet rules and RNG (pure JS, runs in Node and the browser).
- `js/api.js` = interface the real RGS (remote game server) will implement. `js/api-local.js` = in-browser demo stand-in.
- `tools/math/*.mjs` = Node simulation scripts (RTP, par sheets, tuning). `tools/math/test_math.mjs` = consistency test.
- Hosted as static files on Vercel (`vercel.json`).

## Commands
- Run locally: `python3 -m http.server 8000` then open http://localhost:8000/ (modules don't load from `file://`).
- Maths consistency test: `node tools/math/test_math.mjs 50000` (default is 300,000 rounds and takes several minutes).
- RTP measurement: see headers of `tools/math/rtpfull71.mjs`, `par63.mjs`, `model71.mjs` for usage.
- Node 22+. Add any new test tooling (e.g. Playwright, a test runner) under `tests/` with a `package.json`; do not add a bundler.

## Maths targets
- Published RTP (default set): base 96.65%, double 96.53%, buy 96.48%, superbuy 96.52%. Target band 96.x for every option combination.
- Max win: 5,000x bet (`MAX_WIN_BU = 500000`). GRAND jackpot 2,000x, never doubled.
- Units: bet units (BU), 1 BU = 1/100 of base bet. All engine maths is integer; money = `floor(BU * betMinor / 100)`.

## Ground rules
- Never change game maths (`math/config.js`, `math/strips.generated.js`, paytables, weights, feature odds, RTP) unless a task explicitly says so. If you find a maths bug, report it and stop; do not "fix" it silently.
- In production the server is the only source of outcomes and balance. Running `math/` in the browser is deliberate for the demo only. Flag anything that would break when `math/` moves server-side behind `js/api.js`.
- Demo-only features that must NOT reach a production build: `?dev=1`, the Demo tools panel / forced outcomes, the hidden options menu ("secret door"), seeded RNG in play. Report how each is gated.
- `SeededRNG` is for simulation/tests only. Live play must use `crypto.getRandomValues` (browser) or a certified server RNG.
- Do not commit secrets, keys, real player data or `.env` files.
- Every fix needs a test that failed before the fix and passes after.
- Keep changes small and in scope. Note out-of-scope issues in `qa/FINDINGS.md` instead of changing them.
- Before finishing any task: run `node tools/math/test_math.mjs 50000` (must report no failures) and load the game locally with no console errors.

## Findings format
Write findings to `qa/FINDINGS.md`:
`ID | Area | Severity (Blocker/High/Medium/Low) | Description | Steps to reproduce | Status (Fixed/Open/Won't fix) | Commit`

Severity: Blocker = wrong payout, balance error, crash, security hole, compliance breach. High = feature broken or misleading to player.
Medium = visible defect with workaround. Low = cosmetic.
