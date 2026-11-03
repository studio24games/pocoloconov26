# Prompt 1 – Build, dependencies and code clean-up

Read AGENTS.md and qa/TEST_PLAN.md. Task: tidy the codebase and add a basic test harness. There is no bundler or build step; do not add one. Do not change game maths or gameplay behaviour.

1. Add tests/package.json (dev-only) with Playwright and a lightweight linter (e.g. ESLint flat config for ES modules, browser + node globals). Add npm scripts: lint, test:math (node tools/math/test_math.mjs 50000), test:e2e. Keep the game itself dependency-free.
2. Run the linter. Fix real bugs it finds (undefined variables, unreachable code, shadowed names, missing awaits). List stylistic warnings without mass-reformatting the code.
3. Dead code: find unused modules, functions and exports (e.g. js/art.js vs js/artv2.js), commented-out blocks and stale version comments. Remove only what is provably unused; list the rest.
4. Assets: compare every file in assets/ against references in js/, style.css, index.html and assets/manifest.json. List unreferenced files with sizes (e.g. older skull_v2/v3, jp vs jp2, coins v3/v5 sets) and remove only those clearly unused.
5. tools/math: many scripts are superseded versions (par50/par63, reelopt50/53/63, fit*). Do not delete them; write tools/math/README.md saying which are current and how to run them.
6. Production gating: list every console.log, debugger, ?dev=1 path, Demo tools panel, forced-outcome path in math/wallet.js, and the options menu ('secret door'). Propose a single PRODUCTION flag (or separate production entry) that removes them all, and implement it only if it is low-risk and does not change default gameplay. Add a check script that fails if any of them is reachable with the flag on.
7. vercel.json: review cache headers (assets max-age=3600 with no file hashing means stale assets after updates) and add security headers (CSP, frame-ancestors for operator embedding, X-Content-Type-Options, Referrer-Policy) that do not break the game.
8. Scan the repo for secrets; confirm none.

Log every issue in qa/FINDINGS.md. Summarise what you removed and what you left and why.
