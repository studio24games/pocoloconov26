# Codex launch-test prompts

Run these one at a time, in order, each as its own Codex task on its own branch. Review the diff and the report in `qa/` before merging, then start the next one.

To run a prompt, give Codex a single line, e.g.:

> Follow the instructions in qa/prompts/02-maths-rng.md

| # | File | What it does |
|---|------|--------------|
| 0 | [00-orientation.md](00-orientation.md) | Read-only map of the build; writes qa/TEST_PLAN.md and qa/FINDINGS.md |
| 1 | [01-cleanup.md](01-cleanup.md) | Test harness, lint, dead code, unused assets, production flag, Vercel headers |
| 2 | [02-maths-rng.md](02-maths-rng.md) | Independent RTP, option-profile, integer-money and RNG checks (report only) |
| 3 | [03-game-logic.md](03-game-logic.md) | State machine, features, autoplay, quick spin, recovery, rapid input |
| 4 | [04-rgs-security.md](04-rgs-security.md) | Public-demo safety, secret door, RGS contract, mock RGS attack tests |
| 5 | [05-ui-assets-audio.md](05-ui-assets-audio.md) | Screenshots across viewports, assets, text, audio, accessibility |
| 6 | [06-performance.md](06-performance.md) | Load size, FPS, memory soak, cross-browser |
| 7 | [07-compliance.md](07-compliance.md) | Market requirements check (fill in the bracketed lines first) |
| 8 | [08-final-regression.md](08-final-regression.md) | Full re-run and qa/LAUNCH_REPORT.md go / no-go |

Prompts 2 (maths) and 4 (security) are the highest-risk; give them the most review time.

## Human sign-off Codex can't cover

- [ ] Play-test on real devices: an older Android, a recent iPhone (Safari), an iPad, and desktop Chrome, Firefox, Safari and Edge
- [ ] Full test on each operator's or aggregator's staging environment with their real wallet, launch URLs and lobby
- [ ] Maths sheet and simulation reviewed and signed off by the maths owner
- [ ] Independent test lab certification (RNG + maths + build hash), where required by the launch markets
- [ ] Compliance lead confirms Prompt 7's requirements list was complete and the report passes
- [ ] Licences confirmed for every font, sound and third-party asset
- [ ] Rules, help and marketing text proofread in every language by a native speaker
- [ ] Rollback plan and monitoring in place (error alerts, balance mismatch alerts, round failure rate)
- [ ] Final launch report reviewed; every open Blocker/High fixed or formally accepted
