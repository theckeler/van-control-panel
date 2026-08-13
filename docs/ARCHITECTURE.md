# Architecture — Van Control Panel

## Overview

The system has three physical layers: the van's 12V electrical hardware, a Raspberry Pi 4B that reads and controls it, and a PWA dashboard that the user interacts with from any device on the local network or remotely via Tailscale.

```
┌─────────────────────────────────────────────────────────┐
│                      USER DEVICES                        │
│  iPhone / iPad / Mac browser → http://van-pi.local:8000 │
│  or via Tailscale → https://{tailscale-ip}:8000         │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTP / WebSocket
┌──────────────────────────▼──────────────────────────────┐
│                  RASPBERRY PI 4B 1GB                     │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │              FastAPI (uvicorn)                  │    │
│  │  /battery  /mppt  /shore  /orion                │    │
│  │  /shelly   /photos  /mode  /system              │    │
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
│  (Maxxfan, lights,     (CSI — interior)                 │
│   USB, spare)                                           │
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
│   └── ModeSelector       4 mode buttons with icons
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
│                          CORS: allow all origins (local network only)
│                          Static mount: /static/photos → backend/photos/
│                          Router includes for all modules
│
└── routers/               Each router is a standalone module
    ├── battery.py         → pq_bms_bluetooth BLE service (TODO: real impl)
    ├── mppt.py            → vedirect serial service (TODO: real impl)
    ├── shore.py           → vedirect serial service (TODO: real impl)
    ├── orion.py           → static config + in-memory toggle
    ├── shelly.py          → httpx async calls to Shelly local REST API
    ├── camera.py          → filesystem reads from photos/ directory
    ├── mode.py            → in-memory mode state (TODO: persist to SQLite)
    └── system.py          → aggregates battery + mppt + shore + orion
```

**Real service implementation plan:**
Each router currently returns mock data. The production implementation adds a `services/` layer:

```
services/
├── ble_battery.py         Async BLE polling loop via pq_bms_bluetooth
│                          Updates shared state dict every 10s
├── vedirect_mppt.py       Serial polling loop for MPPT via /dev/ttyUSB0
├── vedirect_shore.py      Serial polling loop for IP22 via /dev/ttyUSB1
└── camera_capture.py      Called by systemd timer, not by FastAPI directly
```

Routers read from the shared state dicts populated by these service loops. Services run as background asyncio tasks started in `main.py` lifespan handler.

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
┌─────────────────────────────────────────────┐
│              VAN LOCAL NETWORK               │
│                                              │
│  Starlink Mini (192.168.1.1)                │
│      │                                      │
│      ├── Raspberry Pi 4B  (192.168.1.10)   │
│      ├── Shelly Maxxfan   (192.168.1.101)  │
│      ├── Shelly Lights    (192.168.1.102)  │
│      ├── Shelly USB       (192.168.1.103)  │
│      ├── Shelly Spare     (192.168.1.104)  │
│      └── iPhone/iPad      (DHCP)           │
│                                              │
│  Pi also runs: Tailscale (100.x.x.x)       │
└─────────────────────────────────────────────┘

Remote access path (when Starlink has WAN):
  Phone → Tailscale DERP → Pi Tailscale IP → FastAPI :8000
```

**Offline fallback:**
When Starlink is off, Pi can run its own WiFi hotspot. Shellys and phone connect to Pi hotspot. Local control works identically.

**Shelly Bluetooth fallback:**
Shelly BLU RC Button 4 communicates directly to Shelly Gen4 units via BLE. No network required. Works anywhere in or near the van.

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
- **Local network only** — FastAPI CORS allows all origins but the server only binds to the van's local network
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
sudo apt update && sudo apt install -y python3-pip python3-venv nginx
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# Clone project
git clone https://github.com/toddheckeler/van-control-panel ~/van-control-panel
cd ~/van-control-panel/backend
pip install -r requirements.txt

# Build frontend
cd ~/van-control-panel/frontend
npm install && npm run build

# Set up systemd services
sudo cp systemd/*.service /etc/systemd/system/
sudo systemctl enable --now van-api van-ble van-vedirect
```

### Pi update workflow
```bash
cd ~/van-control-panel
git pull
cd frontend && npm run build
sudo systemctl restart van-api
```
