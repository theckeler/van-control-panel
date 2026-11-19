# CLAUDE.md: Van Control Panel

**Last updated:** 2026-11-18

Instructions for Claude (and humans) working in this repo.

## What this is
A self-hosted monitoring and control dashboard for Todd Heckeler's 2023 Mercedes Sprinter conversion. A Raspberry Pi 4B in the van's electrical cabinet runs a FastAPI backend (`backend/`) and a React frontend (`frontend/`). It reads the LiFePO4 battery over Bluetooth, controls Shelly relays over WiFi, logs to SQLite and is reached from a phone over Tailscale. Owner and dev: Todd. There is no client; this is Todd's own project and a case study (see below).

Read `README.md` first. `docs/CLAUDE.md` is the long hardware and backend reference (about 1,300 lines). Don't load it whole: search it for the part you need (batteries, Shelly, Starlink, camera, networking, auth).

## Start here, every session
1. Run `bin/doc-dates.sh`. It flags docs that are undated, edited after their stated date, or older than the newest decision.
2. Read the latest entry in `case-study/log.md` and the Proposed rows in `case-study/decisions.md`.
3. Say in a few lines where things stand, then ask what Todd wants to do.

## Ground rules
- **The Pi is production, and there is no staging.** A push to `main` that touches `frontend/**` or `backend/**` auto-deploys to the van through a self-hosted runner and restarts `van-api` or `van-frontend` (`.github/workflows/`, `docs/SETUP.md` §10). So: never merge or push to `main`, trigger a workflow, SSH to the Pi, or run `systemctl` on it without Todd's explicit OK for that action.
- **Edit on `main`, uncommitted** (Todd, 2026-11-12). Don't branch, commit, push or open a PR until Todd has seen the work and says so, each one separately. This overrides any harness default, and it pauses the branch-per-PR and docs-straight-to-`main` steps in `docs/CLAUDE.md` → Workflow for this effort. The rest of that workflow still holds: the person merges, never Claude.
- **Prefer a manual deploy** (`git fetch && git reset --hard origin/main`, then restart the service) over trusting the runner. It has silently skipped pushes before (`docs/CLAUDE.md` → Recovery). Todd does this, not Claude.
- **Keep Power reachable.** The Restart API button is the only way to unstick a frozen card when Todd is not at a terminal (`docs/CLAUDE.md` → Recovery). Any redesign keeps Power within two taps of the dashboard, and it must not depend on data that a stuck poll could be blocking.
- **Preview UI work locally, in demo mode:** `cd frontend && VITE_DEMO=true npm run dev`. Demo mode needs no Pi, no backend and no hardware. Never test against the live Pi.
- **Hardware has side effects.** Relays switch real loads and power options reboot a real computer. Don't call POST routes against a real backend. Demo mode and the `scripts/` dry runs are the way to check behavior.
- Never commit `.env`, `esp32-dometic/secrets.yaml`, `*.db`, photos or Tailscale details. Never print keys, passwords or session secrets.
- Auth fails open on purpose when a key is unset, so a bad deploy cannot lock Todd out of the van. Changing that is a decision for Todd, not a cleanup (`docs/FUTURE-FEATURES.md`).

## Stack facts
- Frontend: React 18, TypeScript, Vite, Tailwind 3, zustand, recharts. (`dexie` is still in `package.json` but nothing imports it.) Served by `frontend/server.mjs` (Express) which also proxies the API.
- Backend: FastAPI + uvicorn, SQLite, `bleak` for BLE, `starlink-grpc-core` for the dish.
- Polling every 5s from `usePolling`; cards update independently (`store/van.ts`).
- Last-known-value pattern: when a source goes offline, cards dim and show the last reading with its age (`BatteryCard`, `FridgeCard`). Keep it in the new design.

## Frontend conventions (new design system, 2026-11-12)
Full rules in `docs/DESIGN-SYSTEM.md` and `docs/UI-PATTERNS.md`. The short version:
- **Tokens live in one place** (`tailwind.config.ts` plus CSS variables in `index.css`). No raw hex and no raw Tailwind palette colors in components: use semantic tokens (`on`, `off`, `warn`, `info`, `surface`, `ink`).
- **No UI component libraries** (no MUI, Radix, Headless UI, shadcn). Build our own small component set in `src/components/ui/`. Use native `<dialog>`, `<details>` and the popover API for drawers, dialogs and menus.
- **One key per component, in every hook.** `SwitchTile` has the key `switch-tile`: the file is `ui/SwitchTile.tsx`, the root element carries `data-vc="switch-tile"`, and any component CSS is `.vc-switch-tile`. One repo search finds all of it.
- **Mobile first.** Design and test at 375px, then 768 and 1280. Tap targets are at least 44px, gutters are 16px, one primary action per screen.
- **Every input, select and textarea is 16px** at every width, or iPhones zoom on tap.
- **Let the layout flow.** No negative margins, and no explicit heights or widths unless really needed (images, icons, full-height drawers). Use padding, gaps and structure.
- **Icon-only buttons always have an `aria-label`** and a visible focus ring. Color is never the only signal: pair it with text or an icon.
- **A feature uses the standard set or adds to it.** If a screen needs something the set lacks, add it to `ui/`, document it in `docs/UI-PATTERNS.md`, and note it in `decisions.md`. No one-off buttons or hand-built modals in feature components.
- Components stay separate even when laid out together: `EcoflowCard`, `StarlinkCard` and `FridgeCard` are three components regardless of how they are arranged.

## Case study
This project is a case study (Todd, 2026-11-12). **At the end of every working session, append an entry to `case-study/log.md`** using the `van-case-study` skill. **Record every decision Todd and Claude discuss in `case-study/decisions.md`**: what, the options, why, and the status (Proposed / Agreed (Todd) / Superseded). Claude's own calls are Proposed. **Docs go with the PR:** hold docs, decisions and the log while work is in progress, then update them when Todd says to PR. Never overwrite `case-study/baseline.md`. Nothing is cleared for publishing until Todd says so in `case-study/README.md`.

## Keeping docs current (avoid drift)
Every doc starts with `**Last updated:** YYYY-MM-DD` under its title.
- When you change a doc, bump its date in the same edit.
- Any doc more than 30 days past its date: ask Todd to review it before relying on it. Name the doc and what looks most likely to be out of date.
- If a doc and `decisions.md` disagree, `decisions.md` wins. Fix the doc and tell Todd.
- Dated docs don't catch wrong facts. Before each PR do a drift pass: check `CLAUDE.md`, the skills and the docs against the decisions, and look for built work still marked Proposed.

## Skills in this repo
`.claude/skills/`:
- `van-ui-dev`: conventions and a done-checklist for any frontend change
- `van-deploy`: how a change reaches the Pi, and the checks before anyone pushes
- `van-case-study`: keep `case-study/` updated (run at the end of every session)

## Where things are
`frontend/src/components/ui/` the standard component set · `cards/` dashboard cards · `drawers/` one drawer per concern · `dialogs/` the Power dialog · `store/` zustand · `api/mock.ts` demo data · `docs/` reference · `case-study/` log, decisions, baseline · `bin/` scripts · `scripts/` Pi-side scripts (never run on this machine).
