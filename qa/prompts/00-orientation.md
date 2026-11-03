# Prompt 0 – Orientation and test plan

Read-only. Maps the build and writes the plan the other prompts work from.

You are the lead QA engineer preparing Poco Loco (S24-002, build v0.75f) for public launch. Do NOT change any code in this task.

1. Read AGENTS.md and REVIEW_NOTES.md, then index.html, js/*, math/* and tools/math/*. Map: client flow (js/main.js), reels and effects (js/reels.js, fx.js, perim.js), audio (js/audio.js), art loading (js/art*.js, assets.js, assets/manifest.json), session summary worker (js/summary*.js), maths engine (math/engine.js playRound/playFeature), config and option profiles (math/config.js, strips.generated.js), wallet rules and forced outcomes (math/wallet.js), RNG (math/rng.js), and the RGS boundary (js/api.js vs js/api-local.js).
2. Serve the game with python3 -m http.server 8000 and load it in headless Chromium (Playwright is pre-installed or install it under tests/). Record console errors, failed requests and load time. Run node tools/math/test_math.mjs 50000 and record the result.
3. List every player-facing feature from code and config: base spins and 3-4-3 line wins, Mystery stacks, Loco Spin, coin tease, Hold & Win (lives, frames, frame ladder, collector skull, jackpot doubling, Full House, Super upgrade, 4th-life/x10 sprinkles), MINI/MINOR/MAJOR/GRAND jackpots, modes (base, double, buy, superbuy), bet ladder and BUY_MAX_STAKE, autoplay, quick spin/slam stop, big/mega/epic win tiers, help/paytable, settings, sound, session summary.
4. List every demo/test control: ?dev=1, the Demo tools panel, forced outcomes in wallet.js, the hidden options menu ('secret door' in js/main.js labDoor/labOk), option profiles, localStorage keys, URL parameters. For each: how it is gated, and what must change for production.
5. Write qa/TEST_PLAN.md with: architecture summary and file map; feature inventory table (Feature | Where in code | Existing tests | Risk H/M/L); gaps (untested features, TODO/FIXME, commented-out code, unused js/art.js vs artv2.js, old tools/math scripts superseded by newer versions); a prioritised plan mapped to the prompts: (1) clean-up, (2) maths & RNG, (3) game logic & state, (4) RGS readiness & security, (5) UI/assets/audio/accessibility, (6) performance & devices, (7) compliance, (8) final regression.
6. Create qa/FINDINGS.md with the table header from AGENTS.md and log anything already broken.

Finish with the top 10 risks to launch.
