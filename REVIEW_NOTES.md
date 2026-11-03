# Poco Loco (GAME 002 · v0.75f): notes for the code reviewer

This is the exact build running on our Vercel demo link, plus the maths tools we use to measure it (`tools/math`).

## What it is
- A **browser demo / prototype** of a 3-4-3 Hold & Win slot (no framework, no build step, plain ES modules).
- **No real money, no backend.** Balance, maths and RNG all run in the browser. `js/api-local.js` stands in for a future
  RGS (remote game server); `js/api.js` is the interface the real server will implement. Running the outcome in the client
  is deliberate for this demo stage. In production the `math/` folder runs server-side.
- Target RTP 96.6% (96.x band) for every option combination.

## Layout
- `index.html`, `style.css`: page and styling
- `js/main.js`: game flow, UI, menus, demo tools. `js/reels.js`: reel rendering and animation. `js/fx.js`, `js/perim.js`: effects.
- `js/audio.js`: sound. `js/art*.js`, `js/assets.js`: art loading. `js/summary*.js`: session summary (web worker).
- `math/engine.js`: game maths (`playRound`, `playFeature`). `math/config.js`: paytables, reel strips, option profiles.
- `math/rng.js`: seeded RNG. `math/wallet.js`: demo balance plus forced test outcomes.
- `tools/math/*.mjs`: Node scripts that simulate millions of rounds to measure RTP, e.g. `node tools/math/model71.mjs <profile> ...`

## The option toggles (please review them too)
- The game ships with a hidden **options menu**: about 30 maths/presentation variants combined as "profiles", e.g. `lean+steady+dbl22`.
  They exist so the studio can compare versions on one link. With every toggle at its default, the game plays the standard game.
- The menu is opened by a deliberately hidden "secret door": tap the yellow Settings title and enter a code. Only a
  salted SHA-256 of the code is in the source, and the device then remembers it in localStorage.
  **We know this is obscurity, not security.** It only hides demo tools from casual players; nothing of value sits behind it.
- `?dev=1` and the Demo tools panel can force outcomes (for filming and QA). These will be removed from a production build.

## Run it
`python3 -m http.server 8000` in this folder, then open http://localhost:8000/ (modules don't load from `file://`).

## What we'd like from the review
- Bugs, edge cases and race conditions in the game flow, especially fast tapping, quick spin, autoplay, tab switching, resizing and audio unlock.
- Maths/engine correctness: consistency between the outcome and what is shown, integer money handling, RNG use, any way an option combination breaks.
- Security: XSS/injection, localStorage/URL parameter handling, anything that would carry risk once a real server is behind `js/api.js`.
- Performance (mobile), memory leaks, code structure, and what to tidy before production.
