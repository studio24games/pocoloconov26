# Prompt 6 – Performance and device/browser coverage

Read AGENTS.md and qa/TEST_PLAN.md. Task: measure and improve load and runtime performance.

Budgets (adjust): initial download ≤ [5] MB before first playable, first playable ≤ [5] s on a throttled 4G profile, steady 60 fps on desktop and ≥ 30 fps on a throttled mid-range mobile profile, memory stable over 1,000 spins.

1. Measure bundle and asset sizes; report the largest 20 files. Apply safe wins: compression (gzip/brotli), texture atlas and image compression, audio compression, lazy-loading feature assets, cache headers and file hashing.
2. Run Lighthouse / Chrome performance traces in headless Chromium at desktop and mobile throttling. Report load metrics.
3. Soak test: automate 1,000+ spins including features with turbo on. Track memory, FPS, object/texture counts and listeners. Report any leaks and fix them.
4. Run the e2e suite in Chromium, Firefox and WebKit. Report any engine-specific failures (WebGL context loss, audio, fullscreen, iOS Safari viewport).
5. Test WebGL context loss and restore, tab hide/show, window resize mid-spin, and low-memory fallback if supported.

Write qa/PERFORMANCE_REPORT.md with before/after numbers. Log issues in qa/FINDINGS.md.
