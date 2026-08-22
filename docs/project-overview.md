# Van Control Panel — Project Overview

A Python FastAPI backend + React/TypeScript frontend dashboard for monitoring and controlling the van's 12V electrical system. Runs on a Raspberry Pi mounted in the van, accessible locally and remotely via Tailscale.

Built as a real-world learning project for Python and as a portfolio piece demonstrating full-stack development with IoT hardware integration.

---

## Project Goals

- Monitor battery SOC, voltage, current, temperature, and cell balance in real time
- Track solar input, charge state, and daily yield from the Victron MPPT
- Control 12V loads via Shelly smart switches
- Serve a mobile-first dashboard accessible on the local network and remotely
- Learn Python through a meaningful, hardware-connected project

---

## Tech Stack

| Layer | Tool |
|---|---|
| Backend language | Python 3.13 |
| Backend framework | FastAPI + Uvicorn |
| BLE (MPPT) | victron-ble 0.9.x + bleak |
| BLE (BMS) | pq_bms_bluetooth (vendored) + bleak |
| Shelly control | httpx (HTTP REST) |
| Frontend | React + TypeScript + Vite + Tailwind CSS |
| State management | Zustand |
| Serving (production) | Express (Node) on port 80 |
| Reverse proxy | Express proxies /api/* to uvicorn :8000 |
| Remote access | Tailscale (Funnel for public access) |
| Deployment | Raspberry Pi 5, Debian Trixie (arm64) |
| CI/CD | GitHub Actions self-hosted runner on Pi |

---

## Hardware

| Device | Interface | Notes |
|---|---|---|
| Power Queen 12V 100Ah LiFePO4 BMS | BLE (FFE1 characteristic) | Persistent connection, reads every 30s |
| Victron SmartSolar MPPT 75/15 | BLE (victron-ble passive scan) | One-shot scan every 30s |
| Shelly 1 Gen4 (USB outlets) | WiFi HTTP REST | Live toggle |
| Shelly 1 Gen4 (Garage) | WiFi HTTP REST | Live toggle |
| Raspberry Pi | wlan0 | Home WiFi primary, Starlink fallback |

---

## Project Structure

```
van-control-panel/
├── backend/
│   ├── app/
│   │   ├── config.py              # pydantic-settings, loads .env
│   │   ├── main.py                # FastAPI app, lifespan, BLE orchestrator startup
│   │   ├── routers/               # One router per subsystem
│   │   │   ├── battery.py         # /battery/ — BMS data
│   │   │   ├── mppt.py            # /mppt/ — Victron solar data
│   │   │   ├── shelly.py          # /shelly/ — load control
│   │   │   ├── system.py          # /system/ — net power, runtime estimates
│   │   │   ├── mode.py            # /mode/ — camp/trail/storage/in_town
│   │   │   ├── shore.py           # /shore/ — shore charger (planned)
│   │   │   ├── orion.py           # /orion/ — DC-DC charger (static)
│   │   │   └── camera.py          # /photos/ — timelapse cameras (planned)
│   │   └── services/
│   │       ├── battery_ble.py     # Power Queen BMS — persistent BLE connection
│   │       ├── victron_ble.py     # Victron MPPT — one-shot BLE scan
│   │       ├── ble_orchestrator.py# Runs both BLE services as async tasks
│   │       ├── pq_battery.py      # Vendored: pq_bms_bluetooth parse logic
│   │       └── pq_request.py      # Vendored: pq_bms_bluetooth BLE request
│   ├── .env                       # Secrets (gitignored)
│   ├── .env.example               # Template — commit this
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/client.ts          # Typed API client for all endpoints
│   │   ├── components/            # BatteryCard, ChargeSourcesCard, ShellyPanel, etc.
│   │   ├── hooks/                 # usePolling, useTheme
│   │   ├── pages/Dashboard.tsx    # Main dashboard
│   │   ├── store/van.ts           # Zustand store, Promise.allSettled fetching
│   │   └── types/index.ts
│   ├── server.mjs                 # Express server — serves dist/, proxies /api/*
│   ├── vite.config.ts             # Dev proxy to Pi Tailscale IP
│   └── package.json
├── .github/workflows/
│   ├── deploy-backend.yml         # Push to backend/** → git pull + restart van-api
│   └── deploy-frontend.yml        # Push to frontend/** → npm build + restart van-frontend
├── nginx.conf.example             # Legacy — replaced by Express server
└── docs/
    ├── project-overview.md        # This file
    ├── electrical-system.md       # Full van electrical component reference
    ├── python-learning-roadmap.md # Phased Python learning plan
    └── rubber-duck-review.md      # Code review session notes
```

---

## Services Running on Pi

| Service | Command | Notes |
|---|---|---|
| `van-api` | uvicorn on :8000 | FastAPI backend, BLE orchestrator |
| `van-frontend` | node server.mjs on :80 | Express, serves React SPA, proxies API |
| `actions.runner.*` | GitHub Actions runner | Auto-deploy on push to main |
| `bluetooth` | bluetoothd | BLE adapter management |
| `tailscaled` | Tailscale | VPN + Funnel for remote access |

---

## Access

| Method | URL | When |
|---|---|---|
| Local network | `http://van-pi.local` | On same WiFi as Pi |
| Tailscale | `http://van-pi.tailba93b9.ts.net` | Any device with Tailscale |
| Tailscale Funnel | `https://van-pi.tailba93b9.ts.net` | Public internet (run: `sudo tailscale funnel --bg 80`) |

---

## BLE Architecture

Both BLE services run as concurrent asyncio tasks via `ble_orchestrator.py`.

**Victron MPPT** — passive advertisement scanning. One-shot: scanner starts, waits for one advertisement packet (usually arrives within 1-2 seconds), parses it, stops. Runs every 30 seconds.

**Power Queen BMS** — active connection. Connects once, holds the connection, reads every 30 seconds. On disconnect waits 5 minutes before reconnecting to prevent the BMS firmware from entering a lockout state. A 5-second startup delay on service start lets BlueZ clear any lingering connection from the previous session.

**BMS lockout behaviour** — the Power Queen BMS enters a non-responsive state if too many rapid connection attempts are made in a short period. Symptoms: advertises normally but returns no data. Fix: physically power-cycle the BMS (flip house main disconnect). Prevention: the 5-minute reconnect cooldown.

---

## Environment Variables

See `backend/.env.example`. Copy to `backend/.env` on the Pi and fill in values.

```
VICTRON_MAC=E8:18:52:D1:81:B7
VICTRON_KEY=<32-char hex from VictronConnect app>
BMS_MAC=C8:47:80:5D:08:6F
VAN_PORT=80
VAN_USER=van
VAN_PASSWORD=<your password>
VAN_API_KEY=
```

---

## Current Status

| Feature | Status |
|---|---|
| FastAPI backend | Done |
| React frontend | Done |
| Victron MPPT BLE | Done — live |
| Power Queen BMS BLE | Done — live |
| Shelly load control | Done — 2 units live, 2 planned |
| System endpoint (net power, runtime) | Done |
| Auto-deploy CI/CD | Done |
| Tailscale remote access | Done |
| SQLite logging | Planned |
| History charts | Planned (needs SQLite) |
| Camera timelapse | Planned |
| Mode persistence across restarts | Planned |
| Orion XS upgrade | Planned |
