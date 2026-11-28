# Log

**Last updated:** 2026-11-27

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

## 2026-11-20: Session 4, the README and docs review

**Asked for:** Todd thought the README was well out of date and asked for a check of the docs in general. Before that, the held batch was committed on a new branch (`add-check-now-buttons`) for its own PR, based on `main`.

**Done**
- README: the Figma paragraph said the redesign was "not merged". It shipped, so it now describes the component set, tokens, native `<dialog>` and the phone-first rules. The "50A disconnect" is gone (the main disconnect is a 300A Blue Sea 6006, and the cure for a BMS lockout is cutting its power). Added a status note, the new behaviour (check-now buttons, Shelly pause, SD card image, battery chips), a SmartShunt "not planned" row, and links to six docs that were missing from the list. Each new item says it has not run on the Pi.
- Other docs: `TROUBLESHOOTING.md` and `SETUP.md` pointed at buttons that moved ("Release on the Battery card", "settings drawer"). `PORTFOLIO.md` said "live and running", named the wrong fuse panel and circuits, and described the frontend before the rebuild. `FUTURE-FEATURES.md` had two items that were now partly built or contradicted by the BLE plan. "PWA" was dropped from three places because the app has no manifest or service worker.
- The `case-study/` folder is deliberately not linked from the README: nothing in it is cleared for publishing.
- Todd: one camera only, inside the van, and it is just called "Camera". The README, API, ARCHITECTURE, MODES, HARDWARE, FUTURE-FEATURES, project-overview and `docs/CLAUDE.md` now say so. The UI says "Camera" in the drawer, the image alt text and the History drawer, and the Mode drawer lost its "Exterior camera only" row. `HARDWARE.md` had said the unused slot returns 400; the code returns 503.

**Found**
- Mechanical checks (links, file paths, API routes against the routers) were clean. Every real error was a statement about behaviour, which only reading finds.
- Docs that are over 30 days old and untouched, waiting on Todd: `powerswitch-control-input.md` (still says 300Ah) and the three `rubber-duck-review` docs. The 2026-08-27 review also names `docs/devices/RIVER_2_MAX.md` and `docs/protocols/ecoflow.md`, which are not in the repo.
- `case-study/log.md` mentions `bin/rollup.sh`, which does not exist.
- Kept on purpose, still named `interior`: the `cam` API parameter, the `/static/photos/interior/` folder and filenames, `camera_exterior_only` in the mode config and types, `DEVICE_MAP`, and the `van-interior-cam` udev example in `HARDWARE.md`. Renaming the folder would orphan the retained photos. Waiting on Todd.
- My own scratch files were wiped overnight, including the PR description for the branch. It was rewritten.

**Not checked**
- Whether the Pi was ever redeployed after the rebuild. The README and `docs/CLAUDE.md` now say the rebuild has run in demo mode only, which is Claude's reading of the history. Todd to confirm.
- Whether the Vercel demo link should go in the README.

**Next:** Todd pushes `add-check-now-buttons` and opens the PR, and says whether the docs edits join it.


## 2026-11-24: Session 5, after the merge

**Asked for:** Todd merged PR #33 and asked what was still open. He then answered the list: a 3-poll Shelly pause, the BMS rating from the Power Queen listing, one camera named "camera" everywhere, a clean-up of the personal details in tracked files, and a question about idle drain.

**Done**
- The Shelly pause rule is set: 3 failed polls in a row, about 15 seconds. A constant (`PAUSE_AFTER_FAILURES`) replaces the stub.
- Battery chips now judge amps against 100A (the 70 in the BMS name is a part number).
- Camera: no `cam` parameter, one folder `backend/photos/camera/`, `camera_exterior_only` removed from the mode config, types, mock and docs. A page that still sends `?cam=interior` is ignored, so old and new frontend and backend can deploy in either order.
- Personal details out of tracked files: tailnet name, three Tailscale IPs, the Mac username, device MACs and serials, and the fridge MAC in the ESP32 file (now `!secret dometic_mac`). `config.py` has no device-address defaults, the backup script reads `~/.van-backup.conf`, and the dev proxy defaults to `van-pi.local`.

**Found**
- The BMS reports exactly 0.0A on every overnight sample in the newest backup snapshot (4 nights, to 2026-10-22), so the dashboard cannot see a small idle draw. The state of charge did move: flat on three nights, 41% to 37% in 5 hours on 2026-10-21. State of charge is whole percents, so this is a rough figure.
- The Pi is powered from the EcoFlow, not the house battery, so the dashboard is not part of the house battery's idle drain.
- `.vscode/tasks.json` could not be edited through the shell sandbox; the edit tool worked.
- `backend/.env.example` cannot be read or written from the sandbox, so it still needs an `ECOFLOW_MAC=` line added by hand.

**Not checked**
- Anything on the Pi. Before the next deploy: add `ECOFLOW_MAC` to the Pi's `backend/.env`, delete `backend/photos/interior` and `exterior` after the deploy, add `DEST_HOST` to `~/.van-backup.conf` before reinstalling the backup script, and add `dometic_mac` to `esp32-dometic/secrets.yaml` before the next ESP32 flash.
- The low-voltage cutoff and high-temperature limit of the BMS.

**Next:** Todd decides on the idle-drain work (a nightly drain readout from data already logged, applying a mode to the Shellys, the fridge setpoint).

## 2026-11-27: Session 6, the whole tile is the button

**Asked for:** after PR #34, help booting the Pi and testing it. Then, from the demo: "For the Shelly and maybe the other components when offline the button can be the whole button not just the small button inside a div", and next, "go into a loading state until it connects or fails say 3 tries and fail?"

**Done**
- Claude merged PR #34 on Todd's go-ahead, after both checks passed.
- Offline circuit tiles, the Starlink row and the fridge row are each one button. `RetryGlyph` replaces the small `quiet` icon button.
- A tap shows "Checking…" and tries up to 3 times, 2 seconds apart, then says whether the source came back. The backend did not change.
- A relay tile that has just come back ignores taps for 1 second.
- Demo mode: a dead source now answers on its fifth try, so both the failure and the success can be seen.

**Found**
- A bigger button added a hazard: the same spot means "check again" while offline and "switch a real load" once the unit is back. Claude raised it while building, which led to the tap guard.
- Claude first handed the guard to Todd as a coding exercise (the session's learning style). The answer was "Unsure of your question". A plain table of what a tap does in each state worked better, and Todd answered with a design idea.
- "Checking…" ran into the spinner at 375px. The numbers had reported no overflow; the screenshot showed it.
- Session 5 said the Pi needed `ECOFLOW_MAC` added before the next deploy. It needs `VICTRON_MAC` and `BMS_MAC` too, because the old `config.py` defaulted all three.
- The Pi checks were first run on the Mac by mistake. The Pi's `backend/.env` has not been checked.

**Checked:** type check and build; demo mode at 375, 768 and 1280px; the Shelly tile by touch-style clicks and by keyboard (Tab, Enter, Space).

**Not checked**
- Anything on the Pi, a real phone, or a screen reader.
- How long three real tries take. From the timeouts in the code a dead Shelly or Starlink could show "Checking…" for about half a minute. The fridge's time was not worked out.
- Screenshots were not saved to `case-study/assets/`.

**Next:** Todd merges, adds the three addresses to the Pi's `backend/.env`, deploys by hand and runs the live checks.

## 2026-11-27: Session 7, Home Screen, a color that did not stick, and tiles

**Asked for:** from a phone screenshot, to make the Home Screen view look right; whether orange could replace lime, as a setting; whether light and dark are checked with Jest; that new features not be costly for the Pi; and tiles with icons for the network, charging and device areas.

**Done**
- The page keeps clear of the iPhone's status bar and home bar, including drawers and toasts. Circuit tile dots sit at the right on older iOS.
- Built an Orange/Lime accent setting, then removed all of it. Lime stays.
- A cost check for the Pi: build size, requests per update and new packages, with a GitHub workflow for pull requests. Todd took the suggested limits.
- "Low" and "Very low" beside a low battery percentage.
- Network, charging and device areas are now icon tiles. `DeviceRow` and `StatusList` are gone.

**Found**
- `viewport-fit=cover` was set with no safe-area spacing anywhere. A desktop preview reports zero insets, so it could not show the bug; putting the insets in CSS variables let desktop fake an iPhone, and the iOS simulator confirmed it.
- The simulator opened the Home Screen icon in Safari until one more meta tag was added, and drew a button's contents differently from Chrome.
- Previews drawn by overriding colors in the browser showed that "all orange" made a 35% battery look like a full one. Todd kept green health, then dropped orange altogether. About one build's worth of work was removed cleanly because it had not been committed.
- Claude first read "I'm not liking that at all" as being about the battery wording and removed it. It was about the orange. The reply that followed settled it.
- Claude's advice to add Playwright overlooked that the Pi installs the frontend's development packages on every deploy. The check tools went into their own folder.
- A new color in the Tailwind config did not reach the running dev server until it was restarted, although the build was correct.
- The UI patterns doc still described the battery power chip in watts; the code has judged it in amps since 2026-11-24. Fixed here.

**Checked:** type check, build and cost check; demo mode at 320, 375, 768 and 1280px; the iOS simulator, including the Home Screen app for the spacing fix; offline fridge recheck and opening the WiFi drawer by keyboard. The cost check was run against a temporary copy to see it fail and pass.

**Not checked**
- Anything on the Pi, a real iPhone with this build, or a screen reader.
- The GitHub check before this pull request: it had never run.
- At 320px "Hotspot" and "Ethernet" are cut off.
- Screenshots were not saved to `case-study/assets/`, and the README images still show the old rows.

**Next:** Todd merges, adds the three addresses to the Pi's `backend/.env`, deploys by hand and runs the live checks. Then dark mode.

## 2026-11-27: Session 8, tiles that do something

**Asked for:** pointing at elements in the preview: remove the WiFi button, put Backup and Power over Camera, make Camera and Hotspot switches and Ethernet display only, and replace the battery circle with a word. Then "Just merge this into main".

**Done**
- The uplink tile is the WiFi button. Camera and Hotspot switch in place. Ethernet only reports.
- The battery shows "Good", "Low" or "Very low" where the circle was.
- Deleted the camera drawer and `IconCircle`. One shared confirm for turning the hotspot off.

**Found**
- A one-tap hotspot switch could cut off the phone using it, plus the circuits and the fridge. The confirm stayed on the off direction, and its wording now names them.
- The demo's hotspot switch only returned "disabled", so the new switch could not be seen working until the mock kept its own state.
- PR #35 was merged while these changes were still uncommitted, so they went in a second pull request.

**Checked:** type check, build and cost check; demo at 320, 375, 768 and 1280px (switches, the confirm, battery words, Power still opens); the layout in the iOS simulator.

**Not checked:** the real hotspot switch, anything on the Pi, a real iPhone or a screen reader. "Hotspot" and "Ethernet" are still cut off at 320px.

**Next:** deploy to the Pi and run the live checks, including the hotspot switch from a phone that is not on the hotspot. Then dark mode.
