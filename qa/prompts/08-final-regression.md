# Prompt 8 – Final regression and launch report

Run once everything above is merged, on a clean branch from main.

Read AGENTS.md, qa/TEST_PLAN.md, qa/FINDINGS.md and every report in qa/. Task: final launch-readiness check. Only fix trivial issues; report everything else.

1. From a clean clone: npm run lint, npm run test:math, npm run test:e2e in tests/, and node tools/math/test_math.mjs 300000. All must pass. Serve with python3 -m http.server and confirm zero console errors and zero failed requests.
2. Re-run the Prompt 2 simulator on the default profile and all four modes, and confirm RTP is within the confidence interval of the published 96.65 / 96.53 / 96.48 / 96.52%.
3. Re-test every finding marked Fixed in qa/FINDINGS.md; reopen any that regressed.
4. With the PRODUCTION flag on, confirm ?dev=1, the Demo tools panel, forced outcomes, the options menu and SeededRNG are all unreachable, and that no console output remains.
5. List every change to math/, js/api.js, js/api-local.js or math/rng.js since commit 1fd54fe (the imported v0.75f build) so the maths owner can sign them off.
6. Generate a SHA-256 checksum list of every file in math/ and the client files that would be certified.
7. Write qa/LAUNCH_REPORT.md: Go / No-go and why (any open Blocker or High = No-go unless signed off); open findings by severity; test coverage by area; maths results against target; build version, commit hash and checksums; items needing human checks (real devices, the real RGS and operator integration, certification).
