# Van Control Panel — Project Overview


**Last updated:** 2026-10-19
A Python FastAPI backend + React/TypeScript frontend dashboard for monitoring and controlling the van's 12V electrical system. Runs on a Raspberry Pi mounted in the van, accessible locally and remotely via Tailscale.

Built as a real-world learning project for Python and as a portfolio piece demonstrating full-stack development with IoT hardware integration.

---

## Project Goals

- Monitor battery SOC, voltage, current, temperature, and cell balance in real time
- Track solar input, charge state, and daily yield from the Victron MPPT
- Control 12V loads via Shelly smart switches
- Watch the rest of the van too: Starlink, the EcoFlow, the Dometic fridge, the interior camera
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
| Serving (production) | nginx on :80 in front of Express (Node) on :3000 |
| API proxy | Express proxies /api/* to uvicorn on 127.0.0.1:8000 |
| Remote access | Tailscale (Funnel for public access) |
| Deployment | Raspberry Pi 4B (1GB), Debian 13 Trixie (arm64) |
| CI/CD | GitHub Actions self-hosted runner on Pi |

---

## Hardware

| Device | Interface | Notes |
|---|---|---|
| Power Queen 12V 100Ah LiFePO4 BMS | BLE (FFE1 characteristic) | Persistent connection, reads every 30s |
| Victron SmartSolar MPPT 75/15 | BLE (victron-ble passive scan) | One-shot scan every 30s |
| EcoFlow River 2 Max | BLE advertisement | Battery % only. It also powers the Pi |
| Dometic CFX5 35 fridge | BLE to an ESP32-S3 bridge, then WiFi | BlueZ cannot bond with it directly |
| Starlink Mini | Local gRPC (192.168.100.1:9200) | Latency, obstruction, power draw |
| Shelly 1 Gen4 x4 (USB outlets, Garage, PS Input 1, PS Input 2) | WiFi HTTP REST on the Pi's TwitchWiFi hotspot | Live toggle. PS Input 1 and 2 are unreachable as of 2026-10-19 |
| Logitech C922 webcam | USB UVC (/dev/video0) | Interior camera, timed and on-demand captures |
| Raspberry Pi 4B | wlan0 hotspot, wlan1 (USB dongle) uplink | Starlink preferred, home WiFi fallback |

Full detail: [HARDWARE.md](HARDWARE.md).

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
│   │   │   ├── shore.py           # /shore/ — shore charger (always disconnected)
│   │   │   ├── orion.py           # /orion/ — DC-DC charger (static)
│   │   │   ├── camera.py          # /photos/ — interior camera
│   │   │   ├── ecoflow.py         # /ecoflow/
│   │   │   ├── starlink.py        # /starlink/
│   │   │   └── dometic.py         # /dometic/ — fridge, via the ESP32 bridge
│   │   └── services/
│   │       ├── battery_ble.py     # Power Queen BMS — persistent BLE connection
│   │       ├── victron_ble.py     # Victron MPPT — one-shot BLE scan
│   │       ├── ble_orchestrator.py# Runs the BLE loops as async tasks; watchdog on the BMS
│   │       ├── loop_watchdog.py   # Exits the process if the event loop freezes
│   │       ├── data_logger.py, db.py        # SQLite logging and rollups
│   │       ├── camera_loop.py     # Mode-driven periodic capture
│   │       ├── network.py, health.py        # WiFi / hotspot control, Pi vitals
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
│   │   ├── store/van.ts           # Zustand store, independent per-endpoint polling
│   │   └── types/index.ts
│   ├── server.mjs                 # Express server — serves dist/, proxies /api/*
│   ├── vite.config.ts             # Dev proxy to Pi Tailscale IP
│   └── package.json
├── .github/workflows/
│   ├── deploy-backend.yml         # Push to backend/** → git pull + restart van-api
│   └── deploy-frontend.yml        # Push to frontend/** → npm build + restart van-frontend
├── nginx.conf.example             # nginx on :80, proxies to Express on :3000
├── scripts/                       # pi-setup.sh, NetworkManager dispatchers, backup
└── docs/                          # see the Docs list in the README
```

---

## Services Running on Pi

| Service | Command | Notes |
|---|---|---|
| `van-api` | uvicorn on 127.0.0.1:8000 | FastAPI backend, BLE orchestrator. `Restart=on-failure` is relied on by the freeze watchdog |
| `van-frontend` | node server.mjs on :3000 | Express, serves React SPA, proxies API |
| `nginx` | :80 | Reverse proxy to Express |
| `van-backup` | systemd timer | Nightly database snapshot to the Mac |
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

**BMS hang protection** — every BLE call is time-bounded, and a supervisor replaces the BMS task if it misses its own progress deadline (it froze silently twice, once for 8 days). A separate thread restarts the whole API if the event loop stalls for 60s. See CLAUDE.md.

---

## Environment Variables

See `backend/.env.example`. Copy to `backend/.env` on the Pi and fill in values.

```
VICTRON_MAC=E8:18:52:D1:81:B7
VICTRON_KEY=<32-char hex from VictronConnect app>
BMS_MAC=C8:47:80:5D:08:6F
VAN_API_KEY=<32-byte hex>
```

The frontend has its own `frontend/.env` (`VAN_PORT=3000`, `VAN_PASSWORD`, `VAN_SESSION_SECRET`). CLAUDE.md lists every variable.

---

## Current Status

| Feature | Status |
|---|---|
| FastAPI backend, React frontend | Done |
| Victron MPPT BLE, Power Queen BMS BLE | Done, live |
| Shelly load control | Done. 4 configured, 2 reachable (PS Input 1 and 2 are down) |
| EcoFlow, Starlink, Dometic fridge | Done, live (EcoFlow: battery % only; fridge: read only) |
| System endpoint (net power, runtime) | Done |
| SQLite logging, history charts | Done |
| Interior camera, timed capture | Done (Logitech C922). No exterior camera |
| Mode persistence | Done, and the mode sets the camera interval |
| Applying a mode to the Shellys | Not built |
| Auto-deploy CI/CD, Tailscale | Done |
| Hang protection (BMS watchdog, event-loop watchdog, Restart API button) | Done, not yet proven against a real hang |
| Orion XS upgrade | Planned |
