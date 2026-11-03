# Prompt 7 – Compliance and responsible gambling

Before running: fill in the two [bracketed] lines below with your launch markets and the requirements checklist from your compliance lead or test lab. Codex checks the build against the list; it cannot tell you what the rules are.

Read AGENTS.md and qa/TEST_PLAN.md. Task: check the build against the launch markets' requirements and confirm market-specific settings switch correctly. Do not interpret law; check against the list below and report gaps.

Launch markets: [e.g. Curaçao-licensed crypto operators / UK / Ontario / Malta]
Requirements list: [paste the checklist from your compliance lead or test lab]

1. Map each requirement to the code or config that implements it, in a table in qa/COMPLIANCE_REPORT.md: Requirement | Market | Where implemented | Test | Pass/Fail.
2. Check market-switchable features are controlled by server/operator config, not hard-coded, and test each market profile. Typical switches: autoplay on/off and limits, turbo/quick spin, slam-stop, minimum spin duration, buy-feature availability, gamble feature, max bet, RTP variant, reality check interval, display of net position and session time, and whether wins smaller than the stake may be celebrated.
   (If GB is a launch market, include the UK Gambling Commission online slot design rules in the list above.)
3. Game information: the help/rules screens state RTP (correct for the variant being served), max win, how each feature works, malfunction voids pays and plays, and that results are random. Values must come from config.
4. Player protections: reality checks and session timers display correctly when the operator enables them; the game respects operator stop/limit messages; clock or session time shown if required.
5. Round history / replay: every round can be retrieved with full detail for disputes.
6. Version and certification: the build exposes a game version and a hash/checksum of the certified files so the lab-certified build can be verified. Generate the checksum list.

Log every gap in qa/FINDINGS.md as Blocker unless the requirement is clearly marked optional.
