# Architecture — Van Control Panel


**Last updated:** 2026-09-04
## Overview

The system has three physical layers: the van's 12V electrical hardware, a Raspberry Pi 4B that reads and controls it, and a PWA dashboard that the user interacts with from any device on the local network or remotely via Tailscale.

```
┌─────────────────────────────────────────────────────────┐
│                      USER DEVICES                        │
│  iPhone / iPad / Mac browser → http://van-pi.local      │
│  or via Tailscale → http://van-pi.tailba93b9.ts.net     │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTP
┌──────────────────────────▼──────────────────────────────┐
│                  RASPBERRY PI 4B 1GB                     │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  nginx :80 (reverse proxy)                      │    │
│  │    → Express server.mjs :3000 (auth + SPA)      │    │
│  │    → FastAPI uvicorn :8000 (/api/*)              │    │
│  │       /battery  /mppt  /shore  /orion            │    │
│  │       /shelly   /photos  /mode  /system          │    │
│  │       /dometic  /starlink  /ecoflow              │    │
│  └──────┬──────────┬──────────┬───────────┬────────┘    │
│         │BLE       │VE.Direct │REST API   │Camera       │
│  ┌──────▼──┐ ┌─────▼──┐ ┌────▼────┐ ┌───▼──────────┐  │
│  │pq_bms   │ │vedirect│ │httpx   │ │rpicam-still  │  │
│  │bluetooth│ │lib     │ │client  │ │+ fswebcam    │  │
│  └──────┬──┘ └─────┬──┘ └────┬────┘ └───┬──────────┘  │
│         │          │         │           │              │
└─────────┼──────────┼─────────┼───────────┼─────────────┘
          │          │         │           │
          │BLE  USB serial  WiFi REST  CSI+USB
          │          │         │           │
┌─────────▼──────────▼─────────▼───────────▼─────────────┐
│                  12V ELECTRICAL HARDWARE                  │
│                                                          │
│  Power Queen 100Ah     Victron MPPT 75/15               │
│  LiFePO4 BMS           (VE.Direct)                      │
│                                                          │
│  Victron IP22 12/15A   Victron Orion-Tr 12/12-18        │
│  Shore Charger         DC-DC (non-smart, static)        │
│  (VE.Direct)                                            │
│                                                          │
│  Shelly 1 Gen4 x4      Pi Camera Module 3 Wide          │
│  (USB outlets,         (CSI — interior)                 │
│   Garage, PS Input 2,                                   │
│   PS Input 1 pending)                                   │
│                        Logitech C270                    │
│  Garmin PowerSwitch    (USB — exterior)                 │
│  (Starlink, EcoFlow,                                    │
│   light bar, KC lights)                                 │
└─────────────────────────────────────────────────────────┘
```

---

## Frontend Architecture

```
src/
├── api/client.ts          Single typed fetch wrapper
│                          All calls go to /api/* (proxied in dev)
│
├── store/van.ts           Zustand store
│                          Single source of truth for all van data
│                          fetchAll() uses Promise.allSettled across ten
│                          endpoints — partial failures don't block the rest
│
├── hooks/usePolling.ts    Calls fetchAll() on mount + every 5s
│                          Dashboard mounts this once
│
├── types/index.ts         TypeScript interfaces mirroring
│                          FastAPI Pydantic models exactly
│
├── components/            Presentational — read from Zustand, no local state
│   ├── ui/                Shared primitives: Panel, Stack, Button, Label,
│   │                      StatusDot, SelectableTile, Row, Spinner, Modal
│   ├── badges/             EthBadge, WifiBadge — header status indicators
│   ├── cards/              One per device: BatteryCard, ChargeSourcesCard,
│   │                      ShellyCard, EcoflowCard, FridgeCard, StarlinkCard,
│   │                      WifiCard, HistoryCard, ModeSelector, Cameras
│   ├── drawers/            SettingsDrawer, NetworkDetailsDrawer, WifiScanCard
│   ├── modals/             ConfirmModal, PowerModal, ProgressModal
│   └── layout/             Header, Toaster, ErrorBoundary, ThemeToggle
│
└── pages/
    └── Dashboard.tsx       Composes all cards, mounts usePolling. Cameras and
                            ModeSelector exist but aren't currently rendered
```

**State flow:**
```
usePolling (5s) → fetchAll() → Promise.allSettled([api calls])
→ Zustand store updates → components re-render via selector subscriptions
```

**Offline behavior:**
Last known values stay in Zustand state between polls, so a brief API hiccup
shows stale data rather than an empty state — but this is in-memory only, a
page reload loses it. `dexie` / `dexie-react-hooks` are listed as
dependencies in `package.json` but unused anywhere in `src/` — an
IndexedDB-backed offline cache was apparently planned and never wired in.
Worth either building it or dropping the dependency.

---

## Backend Architecture

```
app/
├── main.py                FastAPI app
│                          Lifespan: starts BLE orchestrator + data logger tasks
│                          Static mount: /static/photos → backend/photos/
│
└── routers/               Each router is a standalone module
    ├── battery.py         → battery_ble service (live BLE, persistent connection)
    ├── mppt.py            → victron_ble service (live BLE, one-shot scan)
    ├── shore.py           → inferred from BMS current minus MPPT current, not
    │                        VE.Direct — see shore.py's SHORE_INFERENCE_THRESHOLD
    ├── orion.py           → static config + in-memory toggle (non-smart unit)
    ├── shelly.py          → httpx async calls to Shelly local REST API (.local mDNS)
    ├── dometic.py         → polls ESP32 bridge for CFX5 fridge data
    ├── starlink.py        → gRPC to dish at 192.168.100.1:9200 (local, no internet)
    ├── ecoflow.py         → passive BLE advertisement scan (battery % only)
    ├── camera.py          → on-demand v4l2-ctl capture, no timer — see Camera
    │                        System below
    ├── mode.py            → persisted to mode.json (atomic write), not applied yet
    └── system.py          → real math from BMS + MPPT caches
```

**Services layer:**
```
services/
├── battery_ble.py         Persistent BLE connection to Power Queen BMS
│                          FFE1 characteristic, reads every 30s, 5-min reconnect cooldown
├── victron_ble.py         One-shot BLE scan for Victron MPPT every 30s
│                          Uses victron-ble library to decrypt advertisements
├── ble_orchestrator.py    asyncio.gather() — runs both BLE services concurrently
├── data_logger.py         Writes readings to SQLite every 30s, triggers rollups
├── db.py                  SQLite schema, 4-tier rollup, prune, query helpers
├── pq_battery.py          Vendored: pq_bms_bluetooth parse logic
├── pq_request.py          Vendored: pq_bms_bluetooth BLE request helper
└── disk_image.py          SD card image creation: module-level job state, dd|gzip background task
```

---

## Camera System

No timer, no capture loop — every photo is taken on demand, at request time:

```
GET /photos/latest?cam=interior
    ↓
_apply_tuning()  — re-applies UVC focus/brightness/exposure controls,
                   since they reset to factory defaults on every unplug/reboot
    ↓
v4l2-ctl --stream-to=<path>  — one MJPEG frame straight to disk, no ffmpeg,
                               no transcoding (the UVC camera encodes its own
                               MJPEG on-device)
    ↓
backend/photos/{cam}/{cam}_{ISO8601}.jpg

FastAPI static mount
    └── /static/photos/{cam}/{filename}
        served directly by uvicorn
```

Only `interior` (`/dev/video0`) is physically installed; `exterior`
(`/dev/video2`) is wired up in code but there's no camera behind it yet.
There's no cleanup/retention job — `backend/photos/` grows until something
prunes it manually. See `docs/HARDWARE.md` for why `ffmpeg` and the CSI
camera module got abandoned (2026-08-31, OOM-crashed the Pi's 1GB RAM
mid-install).

**Evening auto-extension, per-mode intervals, and a background capture loop
are all still TODO** — `MODES["storage"]["camera_interval_min"]` etc. exist
in `mode.py` as data, but nothing currently reads them to drive a timer. See
`docs/FUTURE-FEATURES.md` Priority 5.

---

## Network Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         VAN NETWORK                           │
│                                                               │
│  wlan0 (onboard radio) — TwitchWiFi hotspot AP               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Raspberry Pi 4B  (10.42.0.1)                         │  │
│  │  ├── Shelly USB Outlets  shelly1g4-d885acec6aac.local  │  │
│  │  │                       10.42.0.102                   │  │
│  │  ├── Shelly Garage       shelly1g4-d885acf36a28.local  │  │
│  │  │                       10.42.0.215                   │  │
│  │  ├── Shelly PS Input 2   shelly1g4-48f6eed0a89c.local  │  │
│  │  │                       10.42.0.26                    │  │
│  │  └── Phones / iPads      DHCP 10.42.0.x                │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  wlan1 (USB dongle, external antenna) — uplink client         │
│  Primary:  Starlink "Sir Salettelot"  (Pi gets 192.168.4.x)  │
│  Fallback: OHeck                      (Pi gets 192.168.1.x)  │
│                                                               │
│  Pi also runs: Tailscale (van-pi, 100.x.x.x)                │
└──────────────────────────────────────────────────────────────┘

Remote access:
  Phone/Mac → Tailscale DERP → Pi → nginx :80
```

**TwitchWiFi has no internet route by design** — a direct link to the Pi's
services only. Phones and iPads connected to TwitchWiFi reach the dashboard;
internet browsing still comes from their own uplinks.

**`van-pi.local` resolves on TwitchWiFi** via a static address record in
`/etc/NetworkManager/dnsmasq-shared.d/van-pi.conf`. NM's hotspot dnsmasq
treats `.local` as a special mDNS domain otherwise and returns NXDOMAIN.

**wlan0 is not a client.** The old Starlink and OHeck client profiles on wlan0
have `autoconnect: no`. Only the TwitchWiFi hotspot runs on wlan0.

**Shellys are on TwitchWiFi.** Because TwitchWiFi is the Pi's own AP, the
Shellys are reachable as long as the Pi is running, regardless of whether
Starlink or OHeck is active. If they show `reachable: false`, the most likely
cause is a stale DNS cache entry — restart van-api to clear it.

---

## Operating Modes

Mode is a lightweight system that changes camera intervals and Shelly automation behavior. Stored in memory on the Pi (TODO: persist to SQLite for reboot survival).

```
POST /mode/{mode_name}
→ Updates _current_mode
→ (TODO) Restarts systemd camera timer with new interval
→ (TODO) Pushes schedule updates to Shelly units via REST
```

| Mode | Camera Int. | Camera Scope | Shellys |
|---|---|---|---|
| storage | 360 min | Both | All off |
| camp | 30 min | Both | Scheduled |
| trail | 15 min | Both | Manual |
| in_town | 30 min | Both | Manual |

---

## Security Model

- **No public exposure** — Pi is not port-forwarded. All remote access via Tailscale encrypted tunnel
- **API key enforced in middleware, not by the socket bind** — uvicorn actually binds `0.0.0.0:8000` (reachable on the LAN), not loopback-only. The `require_api_key` middleware in `main.py` is what actually gates it: loopback callers (the Express proxy, already password-checked) pass through free; anyone else needs `X-API-Key`. Without that middleware, `0.0.0.0` would mean anyone on the same WiFi could hit `/system/shutdown` directly. `/health` stays open for the CI/CD liveness check
- **Tailscale ACLs** — Only Todd's devices on the Tailnet can reach the Pi
- **No credentials stored** — Shelly local REST API requires no auth on local network (Shelly default)
- **Read-only BLE** — pq_bms_bluetooth reads BMS data only, cannot modify BMS settings

---

## Deployment

### Pi initial setup
```bash
# Flash Raspberry Pi OS 64-bit Lite with SSH + WiFi pre-configured in Imager
# Boot Pi, SSH in
ssh todd@van-pi.local

# Install dependencies
sudo apt update && sudo apt install -y python3-pip python3-venv
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --hostname=van-pi

# Clone project
git clone https://github.com/toddheckeler/van-control-panel ~/van-control-panel
cd ~/van-control-panel/backend
pip install -r requirements.txt

# Build frontend
cd ~/van-control-panel/frontend
npm install --include=dev && npm run build

# Set up systemd services
sudo cp systemd/*.service /etc/systemd/system/
sudo systemctl enable --now van-api van-frontend
```

### Pi update workflow
```bash
cd ~/van-control-panel
git pull
cd frontend && npm run build
sudo systemctl restart van-api
```
