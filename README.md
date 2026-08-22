
# Van Control Panel


> A self-hosted PWA monitoring, automation, and camera system for a 2023 Mercedes Sprinter VS30 AWD 144" High Roof van build.

![Stack](https://img.shields.io/badge/stack-React%20%2B%20FastAPI-orange)
![Platform](https://img.shields.io/badge/platform-Raspberry%20Pi%204B-red)
![License](https://img.shields.io/badge/license-MIT-blue)

<img width="466" height="713" alt="image" src="https://github.com/user-attachments/assets/22ed2cc4-61a6-41f0-847b-089f9fb55e67" />

---

## What This Is

A fully self-hosted van control panel that runs on a Raspberry Pi 4B mounted inside the van's electrical cabinet. It monitors the 12V electrical system in real time, controls smart relays for automated lighting and fan scheduling, captures interval photos from interior and exterior cameras, and supports context-aware operating modes (Storage, Camp, Trail, In Town).

Everything runs locally — no cloud subscriptions, no third-party dependencies. Tailscale provides secure remote access when Starlink has internet. The Shelly BLU RC Button 4 provides Bluetooth physical control when there's no network at all.

---

## Live Demo

> _Local only — accessible at `http://van-pi.local:8000` on the van's WiFi network, or via Tailscale remotely._

---

## Features

- **Battery monitoring** — Power Queen LiFePO4 BMS via Bluetooth (SOC, voltage, current, temperature, cell balance)
- **Solar monitoring** — Victron SmartSolar MPPT 75/15 via VE.Direct (watts, charge state, daily yield)
- **Shore power status** — Victron Blue Smart IP22 via VE.Direct (charge mode, current, connected indicator)
- **DC-DC charger** — Victron Orion-Tr 12/12-18 (static config; live data when upgraded to Orion XS 50A)
- **Smart relay control** — Four Shelly 1 Gen4 units (Maxxfan, lights, USB outlets, spare) via REST API
- **Operating modes** — Storage, Camp, Trail, In Town with per-mode camera intervals and automation
- **Interval cameras** — Interior (Pi Camera Module 3 Wide, CSI) + Exterior (USB webcam), 30 min rolling capture
- **Remote access** — Tailscale encrypted tunnel when Starlink has WAN
- **Offline control** — Shelly BLU RC Button 4 via Bluetooth, no internet required
- **Apple Home / Siri** — Shelly Gen4 Matter support for voice control

---

## Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| Vite + React 18 + TypeScript | PWA framework |
| Tailwind CSS | Utility-first styling |
| Zustand | Lightweight state management |
| Recharts | SOC trend and solar yield charts |
| Dexie.js | IndexedDB offline cache |
| React Router v6 | Client-side routing |

### Backend
| Technology | Purpose |
|---|---|
| FastAPI (Python) | REST API server, runs on Pi 4B |
| uvicorn | ASGI server |
| pq_bms_bluetooth | Power Queen BMS BLE library (unofficial) |
| vedirect | Victron VE.Direct serial parser |
| httpx | Async Shelly REST API client |
| systemd timers | Camera capture and cleanup scheduling |

### Infrastructure
| Component | Role |
|---|---|
| Raspberry Pi 4B 1GB | Local server — BLE, VE.Direct, camera, FastAPI |
| Starlink Mini | WAN internet + local WiFi hotspot |
| Tailscale | Secure remote tunnel |
| Shelly 1 Gen4 x4 | Smart relay automation |
| Pi Camera Module 3 Wide | Interior interval photos (CSI) |
| Logitech C270 | Exterior interval photos (USB) |

---

## Project Structure

```
van-control-panel/
├── README.md
├── frontend/                  # Vite + React PWA
│   ├── src/
│   │   ├── api/client.ts      # Typed FastAPI client
│   │   ├── components/        # BatteryCard, ChargeSourcesCard, ShellyPanel, ModeSelector
│   │   ├── hooks/             # usePolling (5s interval)
│   │   ├── pages/             # Dashboard, Cameras
│   │   ├── store/van.ts       # Zustand store
│   │   └── types/index.ts     # TypeScript interfaces
│   ├── tailwind.config.ts
│   ├── vite.config.ts
│   └── package.json
├── backend/                   # FastAPI server
│   ├── app/
│   │   ├── main.py            # App entry, CORS, static files
│   │   └── routers/           # battery, mppt, shore, orion, shelly, camera, mode, system
│   ├── photos/
│   │   ├── interior/          # Rolling 24hr photo storage
│   │   └── exterior/
│   └── requirements.txt
└── docs/
    ├── ARCHITECTURE.md        # Full system architecture
    ├── CLAUDE.md              # Claude Code context and conventions
    ├── API.md                 # FastAPI endpoint reference
    ├── HARDWARE.md            # Pi setup, wiring, component list
    ├── MODES.md               # Operating mode reference
    └── PORTFOLIO.md           # Project background for portfolio use
```

---

## Quick Start

### Backend (on Pi or Mac for dev)
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

The frontend dev server proxies `/api/*` to `http://van-pi.local:8000` — swap to your Pi's IP in `vite.config.ts` if needed. Mock data is returned from all endpoints so the UI works without hardware.

---

## Operating Modes

| Mode | Camera | Shellys | Use Case |
|---|---|---|---|
| `storage` | 4-6 hr interval | All off | Long term parking, battery preservation |
| `camp` | 30 min, both | Scheduled | Default active mode |
| `trail` | 15 min, both | Manual | Parked and unattended, out biking/hiking |
| `in_town` | 30 min, both | Manual | Full connectivity |

---

## Remote Access

| Scenario | Access Method |
|---|---|
| In van, Starlink on | `http://van-pi.local:8000` |
| Away, Starlink on | Tailscale IP |
| In van, Starlink off | Pi local hotspot → same local IP |
| No network at all | Shelly BLU RC Button 4 via Bluetooth |

---

## Related Docs

- [Architecture](docs/ARCHITECTURE.md)
- [API Reference](docs/API.md)
- [Hardware Setup](docs/HARDWARE.md)
- [Operating Modes](docs/MODES.md)
- [Claude Code Context](docs/CLAUDE.md)
- [Portfolio](docs/PORTFOLIO.md)

---

## License

MIT
