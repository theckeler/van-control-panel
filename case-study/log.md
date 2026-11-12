# Log

**Last updated:** 2026-11-12

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
