---
name: van-deploy
description: How a change reaches the live van Pi, and the checks that come first. Use when anyone says deploy, push, merge, release, restart the service, or asks whether a change is live. This skill is mostly about stopping, because the Pi is production with no staging.
---

# Deploying to the van

**The Pi is production. There is no staging.** Read `CLAUDE.md` Ground rules, then `docs/CLAUDE.md` → Workflow and Recovery.

## How a change gets there
- A push to `main` touching `backend/**` runs `deploy-backend.yml` on the Pi's self-hosted runner: `git fetch && git reset --hard origin/main`, `pip install`, restart `van-api`.
- A push touching `frontend/**` runs `deploy-frontend.yml`: sync, `npm install --include=dev`, `npm run build`, restart `van-frontend`.
- Changes to `docs/`, `README.md`, `case-study/`, `.claude/` or `CLAUDE.md` don't trigger a deploy.
- The runner has silently skipped pushes before. Todd verifies by hand: `cd ~/van-control-panel && git log --oneline -1` against origin, then the manual sync and a service restart.

## Rules for Claude
- **Never** push, merge, run a workflow, SSH to the Pi, scp to it, or run `systemctl` on it without Todd's explicit OK for that action. Approval for one doesn't cover the next.
- Todd merges, not Claude. Todd deploys, not Claude.
- Work is edited on `main`, uncommitted, until Todd has seen it (2026-11-12). Don't commit or push.
- `scripts/` run on the Pi as root, not here. Never run them locally.
- A restart of `van-api` too soon after the last one can lock up the BMS (the 2-minute guard exists for this). A bad backend deploy can leave the van unmonitored while Todd is away.
- Pi-side secrets (`backend/.env`, `frontend/.env`) are never in git and never printed.

## Before Todd pushes something
1. Frontend: `npx tsc --noEmit` and `npm run build` pass here. Previewed in demo mode at 375 and 1280.
2. Backend: `py_compile` passes, and the change was exercised with fake inputs, not a real POST. Anything that touches BLE, relays or power gets extra care: say what could go wrong on the real hardware.
3. The change doesn't touch auth, `.env` handling or the watchdogs without Todd having said so.
4. The PR description says what changed, what was checked, and what was not (anything only the live hardware can show).
5. A backend change goes out when Todd is near the van or can reach the Pi over Tailscale, not at the start of a trip.

## After a deploy (Todd, not Claude)
- `systemctl status van-api van-frontend --no-pager`
- Open the dashboard on a phone and check the cards that the change touched.
- If a card is stuck: Power → Restart API. If the whole thing is frozen: `docs/CLAUDE.md` → Recovery.
- Note what the live pass showed in `case-study/log.md`, including anything the demo mode did not predict.

## Not settled
- A second environment (a spare Pi, or a gate in the runner) so a push can be tried before it is live. Not in `docs/FUTURE-FEATURES.md` today and nobody has decided; raise it with Todd if the redo makes the risk feel bigger.
