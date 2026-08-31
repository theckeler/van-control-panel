# Architecture — Van Control Panel

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
│                          fetchAll() uses Promise.allSettled — partial
│                          failures don't block the rest
│
├── hooks/usePolling.ts    Calls fetchAll() on mount + every 5s
│                          Each page that needs live data mounts this
│
├── types/index.ts         TypeScript interfaces mirroring
│                          FastAPI Pydantic models exactly
│
├── components/            Presentational — read from Zustand, no local state
│   ├── BatteryCard        SOC % large display, color coded, bar, stats
│   ├── ChargeSourcesCard  Solar / Shore / Orion status rows
│   ├── ShellyPanel        Per-circuit toggle buttons
│   ├── ModeSelector       4 mode buttons with icons
│   ├── SettingsDrawer     Pi health, network detail, WiFi scan/connect, backup download, SD image creation, BMS release, power options
│   ├── WifiScanDrawer     Second-layer drawer — scan wlan1, select, connect with password
│   ├── WifiBadge          Header SSID + signal, amber/red on weak/unassociated
│   └── Toaster            Toast notification queue
│
└── pages/
    ├── Dashboard          Composes all components, mounts usePolling
    └── Cameras            Fetches latest photos independently on mount
```

**State flow:**
```
usePolling (5s) → fetchAll() → Promise.allSettled([api calls])
→ Zustand store updates → components re-render via selector subscriptions
```

**Offline behavior:**
Last known values stay in Zustand state between polls. Dexie.js IndexedDB cache stores values for full offline fallback. Components show stale data rather than empty states when API is unreachable.

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
    ├── shore.py           → always returns disconnected (no VE.Direct cable)
    ├── orion.py           → static config + in-memory toggle (non-smart unit)
    ├── shelly.py          → httpx async calls to Shelly local REST API (.local mDNS)
    ├── dometic.py         → polls ESP32 bridge for CFX5 fridge data
    ├── starlink.py        → gRPC to dish at 192.168.100.1:9200 (local, no internet)
    ├── ecoflow.py         → passive BLE advertisement scan (battery % only)
    ├── camera.py          → not yet implemented (awaiting hardware)
    ├── mode.py            → in-memory mode state (resets on restart)
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

```
systemd timer (every 30 min)
    ↓
capture script
    ├── rpicam-still → backend/photos/interior/{cam}_{ISO8601}.jpg
    └── fswebcam     → backend/photos/exterior/{cam}_{ISO8601}.jpg

systemd cleanup timer (every hour)
    └── delete files older than 24hr rolling window

FastAPI static mount
    └── /static/photos/{interior|exterior}/{filename}
        served directly by uvicorn
```

**Evening auto-extension:**
When current hour is between 22:00 and 06:00, capture interval extends to 2 hours automatically regardless of active mode. Implemented in capture script, not FastAPI.

**USB device stability:**
Assign USB webcam a persistent device name via udev rule to prevent `/dev/video0` enumeration order changes if other USB devices are added:
```bash
# /etc/udev/rules.d/99-van-cam.rules
SUBSYSTEM=="video4linux", ATTRS{idVendor}=="046d", ATTRS{idProduct}=="0825", SYMLINK+="van-exterior-cam"
```

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
- **Local network only** — FastAPI binds `127.0.0.1:8000` (loopback only, not reachable from the network). All inbound traffic goes through nginx → Express, which enforces `VAN_PASSWORD`. `VAN_API_KEY` gates the few paths that hit uvicorn directly (dev proxy, curl from the Pi)
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
