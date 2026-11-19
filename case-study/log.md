# Log

**Last updated:** 2026-11-13

One entry per working session, newest last. Held while work is in progress and finalised at PR time.

## 2026-11-12: Session 1, workspace and baseline

**Asked for:** a whole UI and UX cleanup using the Figma look, a standard component set and design system, drawers and menus cleaned up, and the workspace built like the LiteAF one (from `Ai-Workspace-Playbook`). Case study on. Nothing committed or pushed until Todd sees it.

**Done**
- Small backend change first: Starlink's measured `power_w` now shows in the `loads` breakdown and drops out when the dish is unreachable (committed and pushed to `claude/admiring-lamport-yq3cwj` before the new no-commit rule; not part of the UI work).
- Read the Figma file (one page, a 605px mobile frame and a components frame). Its variables are Tailwind palette colors, so the new tokens map onto Tailwind's scale.
- Found the playbook repo, read its onboarding steps and lessons, and mapped its seven day-one steps onto this repo.
- Took the baseline: 12 screenshots in demo mode, build size, and counts of hardcoded colors, hand-built dialogs and raw buttons (`baseline.md`).
- Wrote the workspace: root `CLAUDE.md`, `.claude/settings.json` guardrails, `bin/doc-dates.sh`, the case-study files and three skills.

**Found**
- Pushing to `main` deploys to the live van Pi through a self-hosted runner, with no staging. That is this project's "live", and the guardrails treat it that way.
- `npm run lint` can't run (no ESLint dependency or config), and there are no tests. Both are open.
- Light only is on purpose (`index.html` forces it) and text colors are hardcoded to `gray-800`, `gray-900` and `black`, which is the likely source of the old contrast problems.
- **Contrast, measured:** the Figma's lime-500 on white is 1.95:1 and the current app's lime-600 labels are 3.06:1. Both fail AA for text. The design system uses green and orange as fills with dark text, and darker `*-text` tokens for colored words.
- **The Figma palette is Tailwind v4, and this app ships Tailwind v3.** Same color names, different hex. Tokens are explicit hex for that reason.
- **Possible drift to review:** `docs/FRONTEND-REFACTOR.md` (dated 2026-09-04) says its §1 text-contrast fix is done, but the code still has 93 `text-black` or `text-gray-*` uses and `Button` still sets `text-gray-800`. Cause unknown, so this is a question for Todd, not a conclusion.
- `bin/doc-dates.sh` flagged my own earlier edit to `docs/starlink-status.md` (no date bump) and five docs over 30 days old (`FRONTEND-REFACTOR`, `powerswitch-control-input`, the three rubber-duck reviews), plus `VICTRON-BLE-PLAN.md` with no date at all. It also flags every doc as "older than newest decision" today, which is noise on a first run.
- I wrote a claim into the deploy skill that `docs/FUTURE-FEATURES.md` didn't support. The drift pass caught it before anyone relied on it.

**Not checked**
- The guardrails in `.claude/settings.json` are untested. The playbook's lesson applies: rules load at session start, so test them in a new session.
- Screenshots miss the WiFi scan card, confirm and progress modals, and offline states.
- The classifier blocked running `bin/rollup.sh` from the playbook repo; its roll-up was read as a file instead.

**Next:** the design system doc and tokens, then the standard components, then the screens. Playbook edits (a row in `projects.md`, `STATUS.md`, a log entry) are pending.

## 2026-11-13: Session 2, the redo built

**Asked for:** start steps 1 and 2 (tokens, standard components), then step 3 (screens and drawers); then a stream of changes from Todd reviewing it in the browser pane; new README and social screenshots; docs, decisions and a PR. Todd's rules held throughout: demo mode only, nothing committed until he said so, Power within two taps.

**Done**
- Tokens as CSS variables and a Tailwind config from the Figma values; a type scale; a global focus ring and reduced-motion rule.
- 19 components in `ui/`, a dev-only gallery at `/components`, and every screen rebuilt on them: header, battery, action tiles with a network list, circuits, charging, devices, camera.
- Six drawers (WiFi, Camera, Mode, Backup, System, History with a Photos tab) replace the Settings drawer. A Power dialog replaces the Power modal, with Restart API on the second tap. The old modals, primitives, header badges and legacy tokens are deleted.
- Todd's review rounds changed: toast color and layering, lime reserved for "on", device-row borders and type size, a network tile with Ethernet, a round live circle and History button, outlined and value-tinted stat chips, 2x2 shortcut tiles, photo history moved into the History drawer, 4px corners, a round Mode button.
- README and social images generated with Playwright against the demo build; Open Graph tags and a 1280x640 GitHub image prepared. Docs rewritten to match what was built.

**Found**
- **A z-index can't lift anything above a modal `<dialog>`.** The native top layer wins, so the toast became a popover that is re-shown on each change. First guess at the cause was z-index, which was wrong.
- **Demo data carried real WiFi names** (the uplink, the fallback network and the Pi's own hotspot), which the case-study privacy rule says to keep out of anything public, and the README screenshots would have published one. Generalised in `api/mock.ts`. The hotspot confirm text now reads the names from live data instead.
- The old docs said the Settings drawer did SD card image creation. Neither UI ever called it. Recorded as a known gap.
- At 672px the half-width network tile truncated; widening to `max-w-4xl` fixed it. Caught by looking at a screenshot, not by the build.
- `git push` is denied in `.claude/settings.json`, so the push to `main` Todd asked for did not run. It would also have deployed a backend change and restarted `van-api` along with the redesign. Todd chose a PR.
- Vercel SSO protection on the demo project blocks link-preview crawlers. Todd is turning it off himself.

**Not checked**
- Anything against real hardware or the live Pi. Demo mode only.
- The reboot and shut-down confirm steps, the WiFi scan-and-connect flow with a real network, and photo capture on the real camera.
- Stat chip thresholds (guesses, not from the battery datasheet), and 768px in a browser (375 and 1280 were checked).
- A keyboard-only pass over every drawer and the Power dialog; Esc and focus return were checked on the gallery drawer and dialog only.
- The Open Graph image on a real link preview, and the done-checklist's contrast check on the new tints (computed for the tokens, not for each tint on its background).

**Next:** merge the PR (Todd), deploy by hand and do one live pass on the Pi, starting with Restart API. Then decide on the open questions at the end of `docs/UI-PATTERNS.md`, the unused `gap`/`spacing` settings, and `ThemeToggle`.

## 2026-11-18: Session 3, cleanup while the Pi is down

**Asked for:** with the Pi offline and no plan to launch it, do the work that needs no hardware: remove the real WiFi names, check 768px and accessibility, fix the stale VE.Direct docs, delete dead code. Then: check the old screenshots, set the battery chip limits from the datasheet, pause polling for dead Shellys with a refresh button, answer how to back up properly, and review all the docs. Dark mode is held for the end.

**Done**
- The hotspot confirm dialog reads its network names from live data, and the optimistic hotspot update no longer hardcodes one. The README, the project overview and the log no longer name the real networks.
- 768px checked in the demo build: no horizontal overflow, no tap target under 44px, no text under 12px. Accessibility pass on the dashboard, all six drawers, the Power dialog and the hotspot confirm: no contrast misses, every button named, inputs at 16px, focus lands inside each dialog, tab order follows the page.
- `HARDWARE.md` lost the leftover VE.Direct cable table. `ThemeToggle`, `useTheme` and the `gap` and `spacing` settings are deleted. PR 32 carried all of this and was merged.
- Checked all 11 "before" screenshots. Six showed the real hotspot name; each now has a dark bar over it.
- Battery chip limits: power is judged by amps against a 70A BMS rating, and temperature depends on whether the pack is charging. Only the 12.8V nominal, 14.6V charger, 0°C charge cutoff and a 100A listing could be confirmed online, so the BMS rating and the low-voltage and high-temperature limits are marked as unconfirmed in the code.
- Shelly pause and recheck: a unit that keeps failing can be paused so it stops costing a 3s timeout per poll. The offline tile is now a `div` with a refresh button (`POST /shelly/{id}/recheck`). The pause policy is left blank for Todd. The backend logic passed an isolated test with stubbed dependencies.
- Check-now buttons for Starlink, the fridge and the BMS (`POST /starlink/recheck`, `/dometic/recheck`, `/battery/retry`). The first two wake their loops so a successful check is not undone by a long backoff sleep, and the fridge poll now backs off. The BMS retry has a 120s floor and the button shows the time left. Backend logic passed an isolated test; the buttons were tried in the demo with `?offline=...`.
- SD card image section in the Backup drawer (the API existed, nothing called it): status, confirm to start, confirm to stop, and a pretend 20-second run in the demo. Real clicks confirmed focus returns to the trigger after the confirm closes.
- Docs review: file paths, links, API routes, the constants table, library versions and section references were checked against the code. One dead reference to a doc that never existed was removed, and `dexie` is noted as unused. `FRONTEND-REFACTOR.md` is marked historical.

**Found**
- The real network names are in about 190 places, not the three first reported: the backend, the Pi scripts, the ESP32 config and most runbook docs. Most are the Pi's actual config, so they were left (Todd's call).
- `HARDWARE.md` had been half fixed: the prose said no VE.Direct, but an orphaned table under it still listed the cables.
- The tailnet name, three Tailscale IPs and the Mac username are in nine tracked files, and real device MAC addresses are in docs and config defaults. The public demo bundle has none of them. Waiting on Todd.
- The first layout of the refresh button overlapped the word "Unreachable" at phone width (the tile content is about 120px). Caught in the browser, not by the build; phones now say "Offline".
- `HARDWARE.md` called the house bank 300Ah; the installed battery is a 100Ah Power Queen and 300Ah is a planned upgrade. Fixed there. `powerswitch-control-input.md` still says 300Ah and is waiting for Todd's review.
- The "still isn't answering" toast showed a green check, which reads as success. Info toasts now have their own icon.
- Several rows in `decisions.md` that Claude proposed during the redo are built and merged but still Proposed.

**Not checked**
- Anything on real hardware. Demo mode only. None of the new backend code (Shelly pause and recheck, Starlink and fridge recheck and backoff, the BMS retry) has run under FastAPI or on the Pi. It passed isolated tests with stubbed dependencies, including the real BMS reconnect loop driven by a fake BLE client, but never a real BLE connection, gRPC dish or ESP32.
- A full keyboard-only walk through the WiFi scan-and-connect flow, and a screen-reader pass. The contrast check was computed in the browser.
- The BMS current rating (70A or 100A) and the pack's low-voltage and high-temperature limits: Power Queen's pages were rate-limited.
- Whether the repository is public. The GitHub check was blocked from this machine.

**Next:** Todd decides the backup design (destination, whether secrets go offsite, a Back up now button), the tailnet and MAC cleanup, and the pause policy. Dark mode last.
