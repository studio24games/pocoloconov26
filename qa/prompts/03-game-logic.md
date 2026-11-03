# Prompt 3 – Game logic, features and state

Read AGENTS.md and qa/TEST_PLAN.md. Task: test every gameplay path and state transition, and fix genuine logic bugs (not maths config).

1. Draw the game state machine (idle → spin requested → result received → reels stopping → win presentation → feature trigger → feature → feature end → idle) as a Mermaid diagram in qa/STATE_MACHINE.md from the actual code. Flag unreachable states and missing transitions.
2. Write automated tests (unit + integration, using forced outcomes in test mode only) for:
   - Base spin: loss, small win, big/mega win tiers, max-win cap
   - Each feature: trigger, retrigger, retrigger at the limit, multiplier progression, end of feature, total win summary
   - Bet changes: min/max bet, every bet level, change blocked during spin and feature
   - Autoplay: start/stop, stop on feature, stop on single win over X, stop on balance drop, loss limit, and that it cannot run with insufficient funds
   - Turbo/quick spin and slam-stop: result shown is identical to normal speed
   - Insufficient funds: spin blocked, clear message, no negative balance
   - Displayed balance and win always match server values after every round
3. Interruption and recovery: simulate network loss, server timeout, page refresh and app backgrounding at each state (mid-spin, mid-win presentation, mid-free-spins, mid-bonus pick). Confirm the game restores the exact unfinished round from the server, never replays or double-pays, and never lets a player re-spin an in-progress round.
4. Rapid input: spam spin, double-click, keyboard space-bar repeat, clicking buttons during transitions. Confirm exactly one bet per round.
5. Check that the help/paytable screens show values that match the live config at every bet level (generate them from config or test that they match).

Fix logic bugs with tests. Log everything in qa/FINDINGS.md.
