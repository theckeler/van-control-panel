# CLAUDE.md — Van Control Panel

This file gives Claude Code full context on the project so it can assist effectively without re-explaining the architecture every session.

---

## What This Project Is

A self-hosted PWA that monitors and controls the 12V electrical system in a 2023 Mercedes Sprinter VS30 AWD 144" High Roof van. It runs on a Raspberry Pi 4B mounted inside the van's electrical cabinet. The frontend is a Vite + React + TypeScript PWA served over local WiFi. The backend is a FastAPI Python server that reads real hardware data and controls Shelly relay units.

---

## Van Context

- **Vehicle:** 2023 Mercedes Sprinter VS30 AWD 144" High Roof (cargo conversion)
- **Owner:** Todd — DIY builder, front-end developer, handles all electrical work himself
- **Use:** Camping (Midwest + East Coast, primarily wooded — limits solar yield), mountain biking (Copper Harbor MI, Adirondacks)
- **Electrical philosophy:** Buy once, buy right. Size for the next meaningful system state, not just current loads

---

## Current Electrical System State

| Component | Model | Status |
|---|---|---|
| House battery | Power Queen 100Ah LiFePO4 (Group 24) | Active. Spring upgrade to 300Ah planned |
| Solar | Renogy 200W ShadowFlux N-Type | Active |
| MPPT | Victron SmartSolar 75/15 | Active. VE.Direct connected |
| Shore charger | Victron Blue Smart IP22 12/15A | Active. VE.Direct connected |
| DC-DC charger | Victron Orion-Tr 12/12-18 (non-smart) | Active. Static data only — no VE.Direct |
| DC-DC upgrade | Victron Orion XS 50A | Planned spring. Will add live VE.Direct data |
| Smart relays | Shelly 1 Gen4 x4 | Maxxfan, ceiling lights, USB outlets, spare |
| Remote | Shelly BLU RC Button 4 | Bluetooth physical control, no internet needed |
| Fuse block | Blue Sea 5046 12-circuit | Branch circuits |
| Main protection | Blue Sea 5191 MRBF at battery terminal | 200A fuse |
| Disconnect | Blue Sea 6006 rotary | 300A |
| Distribution | Blue Sea 5196 MRBF 3-circuit | Orion-Tr + PowerSwitch circuits |
| Switch controller | Garmin PowerSwitch | Starlink, EcoFlow, light bar, KC ditch lights |
| Cooler | Dometic CFX2 28L | Fed by EcoFlow River 2 Max (separate system) |
| Connectivity | Starlink Mini | WAN + local WiFi hotspot |

---

## Tech Stack

### Frontend
- **Framework:** Vite + React 18 + TypeScript
- **Styling:** Tailwind CSS
- **State:** Zustand (`src/store/van.ts`)
- **Data:** Polling via `usePolling` hook (5s interval), Dexie.js for offline cache
- **Charts:** Recharts (SOC trend, solar yield)
- **Routing:** React Router v6

### Backend
- **Framework:** FastAPI (Python 3.11+)
- **Server:** uvicorn
- **BLE:** `pq_bms_bluetooth` — unofficial Power Queen BMS library, read-only, no pairing required
- **VE.Direct:** `vedirect` Python library — MPPT and IP22 serial data
- **Shelly control:** `httpx` async REST calls to Shelly Gen4 local API
- **Camera:** `rpicam-still` (CSI interior), `fswebcam` (USB exterior)
- **Scheduling:** systemd timers for camera capture and cleanup

### Infrastructure
- **Compute:** Raspberry Pi 4B 1GB
- **Storage:** SanDisk Endurance 32GB microSD
- **Power:** 12V → USB-C 5V 3A buck converter, fused at 3A from fuse block
- **Remote:** Tailscale (install: `curl -fsSL https://tailscale.com/install.sh | sh`)
- **Network:** Starlink Mini as primary WiFi. Pi can run hotspot as fallback when Starlink is off

---

## Project File Map

```
frontend/src/
  api/client.ts          Typed fetch wrapper for all FastAPI endpoints
  store/van.ts           Zustand store — fetchAll, toggleShelly, setMode
  hooks/usePolling.ts    setInterval polling hook, 5s default
  types/index.ts         All TypeScript interfaces matching FastAPI Pydantic models
  components/
    BatteryCard.tsx      SOC display, color coded, progress bar
    ChargeSourcesCard.tsx Solar / Shore / Orion rows with active state
    ShellyPanel.tsx      Circuit toggles with orange accent
    ModeSelector.tsx     Storage / Camp / Trail / In Town mode buttons
  pages/
    Dashboard.tsx        Main view — mode, battery, charge sources, shellys, camera link
    Cameras.tsx          Interior + exterior latest photos

backend/app/
  main.py                FastAPI app, CORS, static file mount for photos
  routers/
    battery.py           Power Queen BMS data (mock → real BLE service)
    mppt.py              MPPT 75/15 VE.Direct data
    shore.py             IP22 shore charger VE.Direct data
    orion.py             Orion-Tr static config + manual toggle
    shelly.py            Shelly Gen4 REST — get all, get one, toggle
    camera.py            Latest photo, recent gallery, on-demand capture
    mode.py              Mode state — get current, set mode
    system.py            Aggregated system overview
  photos/
    interior/            Rolling 24hr JPEG storage
    exterior/
```

---

## Key Conventions

**API proxy in dev:**
All frontend API calls go to `/api/*`. Vite proxies to `http://van-pi.local:8000` (or Pi IP). No CORS issues in dev.

**Mock data:**
All routers return hardcoded mock data by default. Replace with real service calls when hardware is connected. Never remove the mock — keep it behind an env flag so dev works without the Pi.

**Shelly IP config:**
`backend/app/routers/shelly.py` has a `SHELLY_UNITS` dict. Update the IPs to match your network before deploying to Pi. IPs should be assigned as DHCP reservations on Starlink Mini or GL.iNet router.

**Orion-Tr is static:**
The current Orion-Tr 12/12-18 has no VE.Direct port. `orion.py` returns a hardcoded config object with a manual on/off toggle. When upgraded to Orion XS 50A: add VE.Direct cable, add `vedirect` polling service, replace static response with live data. The `orion.py` router is already structured for this swap.

**Camera paths:**
Photos save to `backend/photos/{interior|exterior}/{camera}_{ISO8601}.jpg`. FastAPI mounts this directory at `/static/photos/`. The frontend references photos via this static URL. Rolling cleanup deletes files older than 24-30 hours via a systemd timer (not yet implemented — add `backend/scripts/cleanup.py`).

**Mode system:**
Mode is stored in memory (`_current_mode` in `mode.py`). On Pi this resets on restart — persist to a JSON file or SQLite if you want mode to survive reboots. Mode switching should also trigger systemd timer interval changes (not yet implemented).

**Color system (Tailwind):**
```
panel-bg      #0d0d0f   Main background
panel-surface #16181c   Card background
panel-border  #222428   Card borders
accent        #e07020   Orange — matches van exterior (ditch lights, steps, shackles)
charge-solar  #22c55e   Green
charge-shore  #3b82f6   Blue
charge-dc     #a855f7   Purple
soc-good      #22c55e   >50%
soc-mid       #f59e0b   20-50%
soc-low       #ef4444   <20%
```

---

## Upgrade Path (affects this codebase)

| Trigger | Code change needed |
|---|---|
| Orion XS 50A installed | Replace `orion.py` static mock with VE.Direct polling service |
| 300Ah battery upgrade | No code change — BLE library auto-reads new unit if same protocol |
| GL.iNet travel router added | Update Shelly IPs if subnet changes |
| Cerbo GX added | Replace individual VE.Direct polling with MQTT subscription |
| Frigate / motion detection | Separate Pi, separate service — do not add to this repo |

---

## Dev Notes

**Run backend locally without Pi:**
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
All endpoints return mock data. The Pi is not required for frontend development.

**Venus OS Docker (for VE.Direct dev/test on Mac):**
Use `iuriaranda/venus-docker` (Apple Silicon fork). The official `victronenergy/venus-docker` is x86 only.

**SSH to Pi:**
```bash
ssh todd@van-pi.local
# or via Tailscale
ssh todd@100.x.x.x
```

**Deploy frontend to Pi:**
```bash
cd frontend
npm run build
# Copy dist/ to Pi, serve via nginx or FastAPI StaticFiles
```
