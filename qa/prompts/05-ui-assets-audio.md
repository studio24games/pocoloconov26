# Prompt 5 – UI, assets, audio, localisation and accessibility

Read AGENTS.md and qa/TEST_PLAN.md. Task: check everything the player sees and hears. Use Playwright (or the existing e2e tool) with screenshots.

1. Set up e2e tests that load the game with test launch parameters and capture screenshots of: loading screen, idle, spinning, each win tier, each feature intro/feature/summary, help and paytable pages, settings, autoplay panel, error dialogs. Run at these viewports: 360x640, 390x844, 768x1024, 1366x768, 1920x1080, in portrait and landscape. Save to qa/screenshots/ and flag overlaps, clipping, off-screen buttons, stretched art and safe-area/notch problems.
2. Assets: confirm every referenced image, spritesheet, animation, font and sound loads with no 404s or console errors; no placeholder art, watermarks, "lorem ipsum", test text or third-party branding left in. List any asset that is not ours/licensed (fonts, sounds) so we can check licences.
3. Text and localisation: for each supported language [list], check every string is translated, nothing overflows its box, number and currency formats are correct (decimal separator, symbol position, minor units), and long languages (e.g. German) fit. Report missing keys and hard-coded English strings.
4. Currencies: test [list, incl. any crypto] with correct decimals and bet ladders; no rounding display errors.
5. Audio: mute/unmute persists, sound off by default if required, music and effects volume independent, no audio before first user interaction (browser autoplay rules), audio pauses when tab is hidden.
6. Accessibility basics: all buttons keyboard reachable and labelled, visible focus, sufficient contrast on key info (balance, bet, win), no flashing above 3 flashes per second in win animations, reduced-motion respected where possible.
7. Consistency: balance, bet and win displays always use the same format and match server values.

Fix UI bugs. Log everything in qa/FINDINGS.md with screenshot paths.
