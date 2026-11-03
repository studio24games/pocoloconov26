# Prompt 2 – Maths, RNG and RTP verification

The most important run. Report, do not fix, any maths discrepancy; the maths owner decides.

Read AGENTS.md and qa/TEST_PLAN.md. Task: independently verify Poco Loco's maths. Do NOT modify math/config.js, math/strips.generated.js, paytables, weights or feature odds. Report discrepancies instead.

Targets: published RTP base 96.65%, double 96.53%, buy 96.48%, superbuy 96.52% (PUBLISHED_RTP in math/config.js), 96.x band for every option profile, max win 5,000x (MAX_WIN_BU = 500000), GRAND 2,000x never doubled, Hold & Win about 1 in 110 spins.

1. Write a config validator test: every strip symbol is in the paytable, no zero/negative weights, LINES valid for the 3-4-3 geometry (cells 0-9), all weights integers, coin and jackpot tables well-formed, PUBLISHED_RTP_BY_PROFILE has an entry for every profile that can be served.
2. Write an independent simulator in tests/ that calls the real math/wallet.js settleRound (not tools/math copies) with CryptoRNG/SeededRNG. For the default profile and each mode (base, double, buy, superbuy), run as many rounds as the environment allows (aim 50M+ base; state the number). Report RTP with 95% and 99% confidence intervals, RTP split base / Hold & Win / jackpots / Loco Spin, hit frequency, Hold & Win frequency, win distribution buckets (0x, <1x, 1-5x, 5-20x, 20-100x, 100x+), max win seen, and how often the 5,000x cap applies.
3. Compare your results with tools/math/rtpfull71.mjs / par63.mjs and the published figures. Flag any gap outside the confidence interval.
4. Option profiles: REVIEW_NOTES says about 30 toggles combine into profiles (wallet.js mentions 18,433 combinations). Sample at least 200 random profiles plus every single toggle on its own, at enough rounds to estimate RTP to +/-0.5%. List any profile outside 96.0-97.0%, any that throws, and any where publicConfig shows a different RTP from the one measured.
5. Integer money: test toMinor for every BET_LADDER value and mode cost; confirm no fractional money, no rounding that pays more than the maths, and that the displayed win equals the credited win.
6. RNG: confirm math/rng.js SeededRNG and the browser RNG in js/api-local.js use rejection sampling with no modulo bias (test n values near 2^32), that live play never uses SeededRNG or Math.random, and run chi-square tests on strip stop distribution per reel.
7. Forced-outcome edge cases (dev mode only): wilds/mystery on every line, Full House, Super upgrade, jackpot doubling up to its limit, GRAND never doubled, max-win cap reached mid-feature (round ends and pays exactly the cap).
8. Run node tools/math/test_math.mjs 300000 and report.

Save results to qa/MATHS_REPORT.md with a pass/fail line per target. Add the validator and edge-case tests to tests/. Log any mismatch as a Blocker in qa/FINDINGS.md.
