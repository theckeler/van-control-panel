# CLAUDE.md — Van Control Panel

Context file for Claude Code. Gives full project context so sessions don't require re-explaining the architecture.

---

## What This Project Is

A self-hosted IoT monitoring and control dashboard for a converted 2023 Mercedes Sprinter VS30 AWD van. Runs fully on a Raspberry Pi inside the van. Frontend is a React/TypeScript SPA served by an Express server. Backend is a FastAPI Python server reading real hardware via BLE and WiFi REST.

**Status:** Live and running on the Pi. All core data sources are real — no mock data in production.

---

## Van Context

- **Vehicle:** 2023 Mercedes Sprinter VS30 AWD 144" High Roof (cargo conversion)
- **Owner:** Todd — DIY builder, front-end developer
- **Use:** Camping (Adirondacks, Midwest), mountain biking (Copper Harbor, Adirondacks)

---

## Actual Implementation (not planned — what's really running)

### BLE Services

**Victron SmartSolar MPPT 75/15** — BLE via `victron-ble` library (NOT VE.Direct). The MPPT broadcasts advertisement packets. A one-shot scanner fires every 30 seconds, captures one packet, parses it. There is no VE.Direct cable.

**Power Queen 100Ah LiFePO4 BMS** — BLE via `pq_bms_bluetooth` (vendored into `app/services/pq_battery.py` + `pq_request.py`). Uses FFE1 characteristic. Persistent connection — connects once and holds it, reading every 30 seconds. Reconnect cooldown is 5 minutes to prevent BMS firmware lockout.

**BMS lockout behaviour** — If too many rapid connection attempts are made, the BMS accepts connections but stops responding to commands. Fix: physically power-cycle the BMS (flip the house main disconnect). Prevention: the 5-minute `RECONNECT_IN` constant.

### Shelly Control

Two Shelly 1 Gen4 units installed, two planned. Uses `.local` mDNS hostnames (NOT hardcoded IPs):
- `shelly1g4-d885acec6aac.local` → USB outlets
- `shelly1g4-d885acf36a28.local` → Garage

Control via httpx async HTTP to Shelly local REST API. Both units have home WiFi + Starlink configured as dual-WiFi profiles.

### Frontend Server

Served by **Express** (`frontend/server.mjs`) on port 80. NOT nginx. Express:
- Serves the built React SPA from `/var/www/van` (production) or `dist/` (dev)
- Proxies `/api/*` to uvicorn at `localhost:8000`
- Optional basic auth via `VAN_PASSWORD` in `.env`

### Data Logging

SQLite database at `backend/van_power.db`. Four-tier time-series storage:
- `readings_raw` — every reading, 30-day retention
- `readings_hourly` — avg/min/max per hour, 1-year retention
- `readings_daily` — daily summaries, forever
- `readings_monthly` — monthly summaries, forever

Rollups happen automatically at hour/day/month boundaries in `app/services/data_logger.py`.

### Access

| Method | URL |
|---|---|
| Local | `http://van-pi.local` |
| Tailscale | `http://van-pi.tailba93b9.ts.net` |
| Public (Funnel) | `https://van-pi.tailba93b9.ts.net` (run: `sudo tailscale funnel --bg 80`) |

### CI/CD

Self-hosted GitHub Actions runner on the Pi. Push to `backend/**` → auto deploys. Push to `frontend/**` → builds and deploys. Workflows in `.github/workflows/`.

Deploy workflow uses `git fetch && git reset --hard origin/main` (not `git pull`) because the Pi may have locally modified files from rsync during development.

---

## Tech Stack

### Frontend
- Vite + React 18 + TypeScript
- Tailwind CSS with custom design tokens
- Zustand (`src/store/van.ts`) — `Promise.allSettled` so partial API failures don't break the UI
- `usePolling` hook — 5-second interval
- Recharts — history charts (data accumulating in SQLite)
- React Router v6

### Backend
- FastAPI + uvicorn on port 8000
- Python 3.13 on Debian Trixie (arm64)
- `victron-ble` + `bleak` — MPPT passive BLE scan
- `pq_bms_bluetooth` (vendored) + `bleak` — BMS active BLE connection
- `httpx` — async Shelly REST calls
- `pydantic-settings` — config via `.env` file
- SQLite (stdlib `sqlite3`) — time-series logging

### Infrastructure
- Raspberry Pi (arm64, Debian Trixie)
- Tailscale — VPN + Funnel
- Starlink Mini — primary WiFi, home WiFi as secondary DHCP profile
- GitHub Actions self-hosted runner

---

## File Map

```
backend/app/
  config.py              pydantic-settings, reads .env
  main.py                FastAPI app, lifespan starts BLE orchestrator + data logger
  routers/
    battery.py           /battery/ — BMS data (real), history endpoints
    mppt.py              /mppt/ — Victron data (real), history endpoints
    shelly.py            /shelly/ — live Shelly toggle via httpx
    system.py            /system/ — net power, runtime estimates (real math)
    orion.py             /orion/ — static config (non-smart unit)
    shore.py             /shore/ — always returns disconnected (no cable)
    mode.py              /mode/ — in-memory mode (resets on restart, TODO: persist)
    camera.py            /photos/ — not yet implemented, returns 404
  services/
    battery_ble.py       Power Queen persistent BLE connection
    victron_ble.py       Victron one-shot BLE scan
    ble_orchestrator.py  Runs both as asyncio tasks via gather()
    data_logger.py       Writes readings to SQLite, triggers rollups
    db.py                SQLite schema, write, rollup, prune, query functions
    pq_battery.py        Vendored: pq_bms_bluetooth parse logic
    pq_request.py        Vendored: pq_bms_bluetooth BLE request

frontend/
  server.mjs             Express server — serves dist/, proxies /api/*, optional auth
  src/
    api/client.ts        Typed fetch wrapper
    store/van.ts         Zustand store
    hooks/usePolling.ts  5-second polling
    types/index.ts       TypeScript interfaces (keep in sync with Pydantic models)
    components/
      BatteryCard.tsx    SOC, voltage, temp — shows last known values when offline
                         with last-seen time and retry countdown
      ChargeSourcesCard  Solar / Shore / Orion rows
      ShellyPanel.tsx    Per-unit toggles
      ModeSelector.tsx   Storage / Camp / Trail / In Town
    pages/
      Dashboard.tsx      Main view
      Cameras.tsx        Photo gallery (cameras not yet installed)
```

---

## Environment Variables

`backend/.env` on the Pi (gitignored). See `backend/.env.example`.

```
VICTRON_MAC=E8:18:52:D1:81:B7
VICTRON_KEY=<32-char hex from VictronConnect → Product info>
BMS_MAC=C8:47:80:5D:08:6F
VAN_PORT=80
VAN_USER=van
VAN_PASSWORD=<dashboard password>
VAN_API_KEY=
```

---

## Key Constants

| Constant | File | Value | Notes |
|---|---|---|---|
| `RECONNECT_IN` | battery_ble.py | 300s | BMS reconnect cooldown |
| `STARTUP_DELAY` | battery_ble.py | 5s | Clears BlueZ InProgress on restart |
| `READ_EVERY` | battery_ble.py | 30s | BMS read interval |
| `VICTRON_INTERVAL` | ble_orchestrator.py | 30s | MPPT scan interval |
| `LOG_INTERVAL` | data_logger.py | 30s | SQLite write interval |
| `RAW_RETAIN_DAYS` | db.py | 30 | Days to keep raw readings |
| `HOURLY_RETAIN_DAYS` | db.py | 365 | Days to keep hourly rollups |
| `STALE_AFTER` (BMS) | battery_ble.py | 120s | Seconds before BMS cache is stale |
| `STALE_AFTER` (MPPT) | victron_ble.py | 120s | Seconds before MPPT cache is stale |

---

## Systemd Services on Pi

```
van-api          FastAPI backend (uvicorn :8000)
van-frontend     Express frontend (:80)
actions-runner   GitHub Actions self-hosted runner
bluetooth        BLE adapter
tailscaled       Tailscale VPN
```

---

## Known Limitations / TODOs

- **Mode does not persist** across Pi reboots — resets to `camp`. TODO: write to JSON file
- **Camera system** not yet implemented — awaiting USB webcam hardware
- **Shore charger** always returns disconnected — no VE.Direct cable purchased
- **Orion-Tr** is non-smart, returns static config — upgrade to Orion XS 50A planned
- **History charts** in frontend — endpoints exist, SQLite is logging, frontend chart components need wiring up
- **CORS** is `allow_origins=["*"]` — fine for local/Tailscale, tighten if Funnel is used long-term
- **Maxxfan and Ceiling Lights** Shellys not yet installed — show as `installed: false` in API
- **Vercel demo build** — idea scoped, not implemented. See "Vercel Demo Mode" below.
- **Dometic CFX5 / Garmin PowerSwitch** — not reachable from the Pi. BlueZ is incompatible with Dometic's BLE module. Requires an ESP32 bridge. See `rubber-duck-review.md`.

---

## BLE Device Reference

Devices seen on `hci0`, including ones not integrated.

| Device | MAC | Adv name | Status |
|---|---|---|---|
| Power Queen BMS | `C8:47:80:5D:08:6F` | `P-12100BNNA70-B00793` | Integrated |
| Victron SmartSolar | `E8:18:52:D1:81:B7` | `SmartSolar HQ2218GMEKM` | Integrated |
| Dometic CFX5 35 | `88:13:BF:8D:87:F6` | `MC1_8d87f4` | Blocked — BlueZ incompatible |
| Garmin PowerSwitch | `F0:53:20:C3:99:B4` | `PowerSwitch-99B4` | Blocked — bonding refused |

The Dometic is a rare advertiser. Expect to wait through several scan cycles before it appears.

### BMS GATT map (undocumented until now)

Enumerated via `bluetoothctl` `list-attributes`. Three things worth knowing:

- **Standard Battery Service** at `0x180F` with Battery Level `0x2A19`. The project reads SOC exclusively via the proprietary FFE1 protocol. If `0x2A19` is populated it is a spec-compliant fallback for when the FFE1 handshake fails. Not yet tested.
- **Unused characteristics in the FFE0 service.** The code uses `FFE1`. The service also exposes `FFE2` and `FFE3`, and FFE3 carries a CCCD so it supports notify. Contents unknown.
- **Device Information service** at `0x180A` is fully populated: Manufacturer Name, Model Number, Serial Number, Hardware/Firmware/Software Revision, System ID. Cheap win for an About panel, no reverse engineering needed.

**Leave alone:** vendor service `f000ffc0-0451-4000-b000-000000000000` with `FFC1`/`FFC2`. The `0451` is Texas Instruments and this is TI's OAD (over-the-air firmware download) service. Writing here flashes BMS firmware. A malformed write could brick it beyond what a disconnect power cycle can fix.

---

## Vercel Demo Mode (scoped, not built)

Goal: deploy the dashboard to Vercel as a portfolio piece with convincing fake data, so it can be linked from a résumé without exposing the Pi or requiring Tailscale.

**Why it's easy:** every component reads through the `api` object in `src/api/client.ts`. Nothing else in the app calls `fetch` directly. That single seam is the whole integration point.

**Approach:** add `src/api/mock.ts` exporting an object with the identical shape, then at the bottom of `client.ts`:

```ts
export const api = import.meta.env.VITE_DEMO === 'true' ? mockApi : realApi
```

Set `VITE_DEMO=true` in Vercel's environment variables. The Pi build never sets it, so production is untouched and tree-shaking drops the mock from the Pi bundle.

**Where the effort actually is:**

1. *History generation.* `RawReading`, `HourlyReading`, `DailyReading` back the Recharts components. Random numbers look obviously fake. Needs a generator modelling a solar bell curve peaking at solar noon, SOC climbing through the day and drawing down overnight, voltage tracking SOC. Roughly 60-80 lines and the bulk of the work.
2. *Mutations must feel alive.* `shelly.toggle`, `mode.set`, `battery.release`/`connect`, `orion.toggle` need module-level state that actually changes, or the demo's buttons visibly do nothing. Add small jitter to `battery.get` and `mppt.get` since `usePolling` fires every 5s and static numbers look frozen.

**Three decisions to make before building:**

- **Cameras.** `Photo` returns URLs served by Express from disk. No Express on Vercel. Either ship placeholder images in `public/` or hide the camera card when `VITE_DEMO` is set.
- **Destructive controls.** `system.shutdown` and `system.reboot` should not be live buttons on a public demo. Mock returns success without doing anything. Consider a "demo mode" badge so visitors know the state isn't real.
- **Auth.** Session-cookie auth lives in `server.mjs`, which doesn't exist on Vercel. Confirm whether the React app has any login UI of its own or whether Express handles it entirely before serving the SPA.

**Estimate:** 2-3 hours for something convincing, ~45 minutes for a crude version.

---

## Conventions

**No VE.Direct.** Early planning docs mention VE.Direct cables and the `vedirect` Python library. These were never used. All Victron data comes via BLE (`victron-ble` library). Do not suggest VE.Direct-based solutions.

**No nginx.** nginx was briefly used and replaced by the Express server (`server.mjs`). Do not suggest nginx.

**Commit via osascript.** Git push works via osascript using the macOS keychain credential helper. The remote is HTTPS with `git config credential.helper osxkeychain`. SSH key for GitHub is not set up on the Mac.

**Deploy workflow uses `git reset --hard`.** Not `git pull`. The Pi may have locally modified files from rsync sessions during development.

**Prompt before committing.** Always stage files, show the diff summary, and ask before committing or pushing.
