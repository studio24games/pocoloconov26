# Prompt 4 – RGS readiness and security

Read AGENTS.md and qa/TEST_PLAN.md. Task: v0.75f has no backend; balance, maths and RNG run in the browser on purpose for the demo. Check that it is safe as a public demo now, and ready to sit behind a real RGS. Fix client-side vulnerabilities; report anything that needs an architecture decision.

1. Public demo safety: look for XSS or HTML injection anywhere text reaches the DOM (innerHTML, insertAdjacentHTML, template strings with URL params, localStorage values or history). Fuzz every URL parameter and localStorage key the game reads (pocoLoco.*, ?dev, ?super, profile params) with malformed, huge and script values. The game must not break, execute input, or let a link put a player into dev mode or a non-default profile without them knowing.
2. Secret door: assess the salted SHA-256 code check in js/main.js. Estimate brute-force time from the code length, confirm nothing of value sits behind it, and recommend removing it from the production build.
3. RGS contract: from js/api.js and js/api-local.js, write qa/RGS_CONTRACT.md: every call (init, play, meter, history), request and response fields, error codes (GameError), and what the client trusts. Flag anything the client currently decides that the server must own (outcome, balance, profile, mode price, force, dev flag, meters in localStorage).
4. Build a mock HTTP RGS in tests/mock-rgs/ (Node, using math/wallet.js server-side with createCryptoRNG) that implements js/api.js, so the client runs against a real network boundary. Then test it as an attacker: negative or off-ladder bets, buy above BUY_MAX_STAKE, forced outcomes or dev:true sent from the client, unknown profiles, replayed or duplicate round requests, concurrent spins on one session, oversized payloads. All must be rejected with no balance change.
5. Client resilience against the mock RGS: slow responses, timeouts, 500s, dropped connections mid-spin and mid-feature, page refresh mid-round. The client must never show a result the server did not return, never double-spend, and must recover or show a clear error.
6. Round history: each round record has round ID, bet, mode, profile, outcome, win, balance before/after and timestamps, enough for disputes.

Write qa/SECURITY_REPORT.md. Add tests. Log issues in qa/FINDINGS.md.
