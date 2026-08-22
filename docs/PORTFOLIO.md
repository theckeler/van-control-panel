# Van Control Panel — Portfolio

## Project Overview

A fully self-hosted IoT monitoring and automation system for a converted 2023 Mercedes Sprinter VS30 AWD van. Built from the ground up combining React/TypeScript front-end development, Python backend engineering, Bluetooth hardware integration, and 12V electrical system design.

The system monitors a custom 12V electrical build in real time — battery state of charge, solar input, charge state — controls smart relays for 12V loads, logs time-series data with tiered rollups, and provides remote access via a secure Tailscale tunnel. It runs entirely on a Raspberry Pi mounted inside the van's electrical cabinet.

**Status:** Live and running in the van.

---

## The Problem

Off-grid van living requires constant awareness of power. Most builders check this by walking to the battery and reading a voltmeter, or by opening three separate manufacturer apps (one for the BMS, one for the MPPT, one for the shore charger) that each show one device at a time.

The goal was a single dashboard showing the full electrical picture, live from anywhere via Tailscale, with real-time load control and enough historical data to understand seasonal solar yield and battery health over time.

---

## What Was Built

### Custom 12V Electrical System
The software monitors hardware that had to be designed and wired first:
- Renogy 200W ShadowFlux N-Type rigid panel → Victron SmartSolar MPPT 75/15
- Power Queen 12V 100Ah LiFePO4 battery with Bluetooth BMS
- Blue Sea Systems 5025 100A fuse panel for load distribution
- Shelly 1 Gen4 smart relays on USB outlets, fan, lighting circuits
- Garmin PowerSwitch for accessory control (Starlink, exterior lights)
- All wiring sized for planned 300Ah upgrade without rewiring

### Backend (Python / FastAPI)
- FastAPI + uvicorn serving all data endpoints
- **Victron MPPT via BLE** — `victron-ble` library decrypts advertisement packets using a device-specific encryption key from VictronConnect. One-shot passive scan every 30 seconds
- **Power Queen BMS via BLE** — `pq_bms_bluetooth` (reverse-engineered library) using FFE1 characteristic. Persistent connection to prevent BMS firmware from entering a lockout state from rapid reconnects
- **Shelly control** — httpx async calls to Shelly local REST API via mDNS hostnames
- **SQLite time-series logging** — tiered rollup architecture: raw (30 days) → hourly (1 year) → daily (forever) → monthly (forever)
- `pydantic-settings` for environment-based configuration, secrets in `.env`

### Frontend (React / TypeScript)
- Vite + React 18 + TypeScript + Tailwind CSS
- Zustand store with `Promise.allSettled` — partial API failures never break the UI
- 5-second polling via custom `usePolling` hook
- Battery card shows last known values when BLE is offline with elapsed time and reconnect countdown timer
- Recharts for history charts (data accumulating)
- Served by Express (Node) with optional basic auth and `/api/*` proxy to FastAPI

### Infrastructure
- Self-hosted GitHub Actions runner on the Pi — push to `backend/**` or `frontend/**` auto-deploys
- Tailscale mesh VPN for remote access, no port forwarding, works behind Starlink CGNAT
- WiFi failover configured: home network primary, Starlink auto-fallback
- Shellys configured with both home and Starlink WiFi profiles

---

## Technical Decisions Worth Noting

**BLE over VE.Direct for Victron.** The MPPT has a VE.Direct port and Victron sells a USB cable for it. BLE was chosen instead because the SmartSolar broadcasts encrypted advertisement packets continuously — no cable needed, no USB port consumed, works with the same Bluetooth adapter already required for the BMS.

**Persistent BMS connection vs polling.** The Power Queen BMS firmware has a protection mechanism that stops responding to connection requests if too many rapid attempts are made. A persistent connection (connect once, hold it, read every 30 seconds) prevents this. On disconnect a 5-minute cooldown before reconnecting prevents the lockout state from occurring during normal operation.

**Vendored library.** `pq_bms_bluetooth` is a small reverse-engineered Python library with no PyPI package. Rather than depending on a GitHub URL, the two relevant files were copied directly into the project under `app/services/` with the import path updated. This keeps the dependency explicit and under version control.

**Tiered SQLite rollups over a hosted time-series DB.** InfluxDB and TimescaleDB are the standard tools for this. For a single Pi with one user, a 150-line `db.py` using the stdlib `sqlite3` module handles 30 days of raw data, a year of hourly rollups, and unlimited daily/monthly summaries with zero infrastructure overhead.

**Express over nginx for the frontend server.** Nginx is the conventional choice. Express lets the auth middleware, API proxy, and static file serving live in one 40-line JavaScript file that's readable, version-controlled, and restarted by the same systemd pattern as the FastAPI service.

**Self-hosted CI/CD runner over SSH deployment.** GitHub Actions runners work by polling GitHub from the Pi, so there's no inbound connection needed. This works perfectly behind Starlink CGNAT where port forwarding is unavailable. Push to main, runner picks up the job, deploys in ~10 seconds.

---

## Hard Problems Encountered

**BMS lockout.** During development, rapid van-api restarts caused ~30 BLE connection attempts in quick succession. The BMS firmware locked out the Pi's MAC address — connecting but returning no data. Fix: physical power cycle of the BMS (house disconnect). Prevention: 5-minute reconnect cooldown. Documented in `docs/rubber-duck-review.md`.

**BlueZ InProgress error on restart.** Every van-api restart hit `[org.bluez.Error.InProgress]` immediately because the previous session's BLE operation hadn't cleared from BlueZ. Fix: 5-second startup delay in the BMS service to let BlueZ settle.

**mDNS resolution adding 5 seconds to every request.** `van-pi.local` was timing out on DNS before falling back to mDNS, adding ~5 seconds to every API call. The frontend poll fires every 5 seconds so requests piled up faster than they completed. Fix: add `192.168.1.99 van-pi.local` to `/etc/hosts` on dev machines, and use the Pi's Tailscale IP in the Vite dev proxy config.

---

## Skills Demonstrated

| Area | Specifics |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Zustand, Recharts |
| API design | FastAPI, Pydantic v2, async endpoints, tiered data architecture |
| BLE / hardware | Bluetooth LE protocol reverse engineering, bleak, victron-ble, persistent connection management |
| Electrical | 12V DC system design, LiFePO4 BMS, solar charge control, wire sizing, protection hardware |
| IoT | Shelly REST API, Victron BLE advertisement decryption, Power Queen BMS protocol |
| DevOps | Tailscale, systemd, self-hosted GitHub Actions, SQLite, Pi deployment |
| System design | Time-series rollup architecture, BLE concurrency, graceful offline degradation |

---

## What's Next

- History charts in the frontend (SQLite is logging, chart components need wiring)
- Camera timelapse system (awaiting USB webcam)
- Mode persistence across Pi reboots
- Victron Orion XS 50A DC-DC charger upgrade (adds live alternator charging data)
- 300Ah LiFePO4 battery upgrade (BLE library reads new unit automatically)
