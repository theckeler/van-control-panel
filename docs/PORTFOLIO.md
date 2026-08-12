# Van Control Panel — Portfolio

## Project Overview

A fully self-hosted IoT monitoring and automation system for a converted 2023 Mercedes Sprinter VS30 AWD van. Built from the ground up as a personal project combining front-end development, embedded systems, and electrical engineering into a single cohesive product.

The system monitors a custom 12V electrical build in real time, automates van lighting and ventilation, captures interval photos from two cameras, and provides remote access via a secure tunnel — all running on a $35 Raspberry Pi mounted inside the van's electrical cabinet.

---

## The Problem

Off-grid van living involves constant awareness of power — how much battery is left, how fast it's charging from solar or shore power, whether the alternator is topping it off while driving. Most builders check this by walking to the battery and reading a voltmeter, or by opening a manufacturer's app that only shows one device at a time.

The goal was a single dashboard that shows the full electrical picture, lets you switch the van's behavior based on context (parked for storage vs. active camping vs. in town), and gives remote visibility when you're away from the van.

---

## What Was Built

### Custom 12V Electrical System
Before writing a line of code, the underlying electrical system had to be designed and built. This involved:

- Two-panel modular architecture — lower panel for battery protection hardware (ANL fuse, main disconnect, bus bars), upper panel for charge sources and distribution
- DIN rail terminal blocks at all external wire entry/exit points for clean serviceability
- Victron SmartSolar MPPT 75/15 for solar charge control
- Victron Blue Smart IP22 for shore power charging
- Victron Orion-Tr DC-DC charger for alternator charging (upgrading to Orion XS 50A)
- Power Queen 100Ah LiFePO4 battery with Bluetooth BMS (upgrading to 300Ah)
- Shelly 1 Gen4 smart relays for automated lighting, fan, and USB outlet control
- Blue Sea Systems protection hardware throughout (5191 MRBF, 6006 disconnect, 5046 fuse block, 285 breakers)
- All wiring sized for the full upgrade path — 2 AWG main feed, 8 AWG charge source runs — so the system never needs rewiring as it grows

### PWA Dashboard (Frontend)
- **Vite + React 18 + TypeScript** — same production stack used professionally
- **Tailwind CSS** with a custom design token system built around the van's orange accent theme
- **Zustand** for lightweight real-time state management
- **Recharts** for SOC trend and solar yield visualization
- **Dexie.js** for IndexedDB offline cache — last known values persist when the Pi is unreachable
- 5-second polling via custom `usePolling` hook with `Promise.allSettled` so partial API failures never break the UI
- Responsive, mobile-first layout optimized for iPhone use in the van

### FastAPI Backend (Backend)
- **FastAPI + uvicorn** serving all data endpoints
- **pq_bms_bluetooth** — unofficial Python library to read the Power Queen LiFePO4 BMS via Bluetooth LE without pairing
- **vedirect** — Python library for Victron VE.Direct serial protocol, reading MPPT and shore charger in real time
- **httpx** async client for Shelly Gen4 local REST API
- **systemd timers** for camera capture scheduling and rolling 24-hour retention cleanup
- Static file serving for camera photos via FastAPI mount

### Camera System
- Interior: Raspberry Pi Camera Module 3 Wide (12MP, 120° FOV, CSI interface) — sanity check on van contents and climate
- Exterior: USB webcam via `fswebcam` — area awareness
- 30-minute interval capture with automatic 2-hour extension overnight to reduce SD card wear
- Rolling 24-hour retention with mtime-based cleanup
- Swipe gallery in the PWA for reviewing recent captures

### Infrastructure
- **Raspberry Pi 4B 1GB** — local server, always on, 3-5W draw
- **Tailscale** — zero-config encrypted tunnel for remote access when Starlink has internet
- **Starlink Mini** — WAN internet plus local WiFi hotspot
- **Operating modes** (Storage, Camp, Trail, In Town) — switch the van's behavior based on context, adjusting camera intervals and Shelly automation schedules

---

## Technical Decisions Worth Noting

**Single-board computer selection:** The Raspberry Pi 4B was chosen over the Pi Zero 2W for its ability to handle concurrent BLE polling, two VE.Direct serial connections, camera capture, and a FastAPI server simultaneously. The Pi Zero 2W would handle individual tasks but not all of them reliably at once.

**FastAPI over Flask:** Async-first design is the right fit here — multiple hardware polling loops run concurrently alongside API request handling. FastAPI's Pydantic models also produce TypeScript-compatible schemas directly, keeping the frontend types in sync with the backend with minimal overhead.

**Zustand over Redux:** The state shape for this application is flat and straightforward — battery data, MPPT data, Shelly states, current mode. Redux would be architectural overhead without meaningful benefit. Zustand's selector-based subscriptions give components exactly the re-render behavior needed.

**Mock-first development:** All FastAPI routers return realistic mock data by default. The entire frontend can be developed and tested on a Mac without the Pi, Shellys, or any electrical hardware. Real hardware integration slots in behind environment-flag-gated service calls.

**JPEG over WebP for photos:** At 30-minute intervals and 24-hour retention, total storage per camera is 20-45MB. The file size savings from WebP were not worth the added conversion step. JPEG is universally supported, has no conversion overhead, and is directly servable as a static file.

**Tailscale over port forwarding:** Port forwarding the Pi to the public internet would require a static IP, firewall rules, and ongoing security maintenance. Tailscale gives encrypted point-to-point access with zero configuration on the router and no public exposure.

---

## Upgrade Path Already Designed

The system was designed from the start with a clear upgrade sequence that the codebase can absorb without rewiring or architectural changes:

1. **300Ah battery** — BLE library reads new unit automatically, no code change
2. **Orion XS 50A DC-DC charger** — `orion.py` router already structured for VE.Direct swap; input wire upsizes to 6 AWG at install
3. **GL.iNet travel router** — persistent local WiFi network independent of Starlink; update Shelly IPs if subnet changes
4. **Victron Cerbo GX** — when system grows to 4+ Victron devices, replaces individual VE.Direct polling with a single MQTT subscription
5. **Dometic RTX 2000 rooftop AC** — long-term; requires full prerequisite chain (dual battery, larger MPPT, Orion XS 100A, upsize main feed to 2/0 AWG)

---

## Skills Demonstrated

| Area | Specifics |
|---|---|
| Frontend development | React 18, TypeScript, Vite, Tailwind CSS, Zustand, Recharts, Dexie.js |
| API design | RESTful FastAPI with Pydantic models, async endpoints, static file serving |
| Embedded systems | Raspberry Pi, BLE, serial (VE.Direct), USB camera, systemd, udev |
| Electrical engineering | 12V DC system design, wire sizing, fuse coordination, protection hardware, LiFePO4 BMS |
| IoT integration | Shelly REST API, Victron VE.Direct protocol, Power Queen BLE protocol |
| DevOps | Tailscale VPN, systemd services, Pi headless deployment, SSH workflow |
| System design | Modular two-panel electrical architecture, mock-first API development, upgrade path planning |

---

## Project Status

Active — the electrical system is functional in the van. The PWA and backend are in active development, being built and tested against mock data on a Mac, with hardware integration planned once the Pi is mounted and wired. The spring build (300Ah battery, Orion XS 50A, HDPE panel transfer from pegboard prototype) will be when the full system comes online.
