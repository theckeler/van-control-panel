# Architecture — Van Control Panel


**Last updated:** 2026-10-19
## Overview

The system has three physical layers: the van's 12V electrical hardware, a Raspberry Pi 4B that reads and controls it, and a PWA dashboard that the user interacts with from any device on the local network or remotely via Tailscale.

```
┌─────────────────────────────────────────────────────────┐
│ USER DEVICES                                            │
│ iPhone / iPad / Mac browser → http://van-pi.local       │
│ or via Tailscale → http://van-pi.tailba93b9.ts.net      │
└─────────────────────────────────────────────────────────┘
                          │ HTTP
┌─────────────────────────────────────────────────────────┐
│ RASPBERRY PI 4B (1GB, Debian 13, Python 3.13)           │
│                                                         │
│ nginx :80 → Express server.mjs :3000 (auth + SPA)       │
│           → FastAPI uvicorn 127.0.0.1:8000 (/api/*)     │
│   /battery /mppt /shore /orion /ecoflow /shelly         │
│   /dometic /starlink /photos /mode /system              │
│                                                         │
│ BLE (bleak)     WiFi (httpx)  gRPC       USB            │
│ BMS (held),     Shellys,      Starlink   C922 camera    │
│ Victron MPPT,   ESP32 fridge  dish       (v4l2-ctl)     │
│ EcoFlow         bridge                                  │
└─────────────────────────────────────────────────────────┘
                          │ BLE · WiFi · gRPC · USB
┌─────────────────────────────────────────────────────────┐
│ 12V ELECTRICAL HARDWARE AND DEVICES                     │
│                                                         │
│ Power Queen 100Ah LiFePO4 BMS ... BLE (persistent)      │
│ Victron SmartSolar MPPT 75/15 ... BLE advertisements    │
│ Victron Blue Smart IP22 12/15A .. not read (inferred)   │
│ Victron Orion-Tr 12/12-18 ....... static (non-smart)    │
│ EcoFlow River 2 Max (also powers the Pi) .. BLE, % only │
│                                                         │
│ Shelly 1 Gen4 x4 (USB outlets, Garage, PS Input 1,      │
│   PS Input 2) ........ WiFi, TwitchWiFi, local HTTP     │
│ Dometic CFX5 fridge .. via ESP32-S3 BLE bridge on WiFi  │
│ Starlink Mini ........ local gRPC 192.168.100.1:9200    │
│ Logitech C922 webcam (interior) ........ USB, v4l2-ctl  │
│ Garmin PowerSwitch ... not controllable (BlueZ cannot   │
│   connect; see CLAUDE.md BLE Device Reference)          │
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
│                          fetchAll() polls each endpoint independently: a card
│                          updates the moment ITS endpoint returns, a slow or
│                          failed one never holds up the rest, and a poll that
│                          started before a local change (click) is dropped so it
│                          cannot overwrite it
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
│   ├── drawers/            SettingsDrawer, NetworkDetailsDrawer, WifiScanCard,
│   │                      CameraHistoryDrawer
│   ├── modals/             ConfirmModal, PowerModal, ProgressModal
│   └── layout/             Header, Toaster, ErrorBoundary, ThemeToggle
│
└── pages/
    └── Dashboard.tsx       Composes all cards, mounts usePolling. ModeSelector
                            exists but isn't currently rendered
```

**State flow:**
```
usePolling (5s) → fetchAll() → one independent poll per endpoint
→ each applied to the Zustand store as it returns (unless stale) → components
  re-render via selector subscriptions
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
│                          Lifespan: starts the BLE orchestrator, data logger,
│                          Starlink and Dometic pollers, camera loop, and the
│                          event-loop watchdog
│                          Static mount: /static/photos → backend/photos/
│
└── routers/               Each router is a standalone module
    ├── battery.py         → battery_ble service (live BLE, persistent connection)
    ├── mppt.py            → victron_ble service (live BLE, one-shot scan)
    ├── shore.py           → inferred from BMS current minus MPPT current, not
    │                        VE.Direct — see shore.py's SHORE_INFERENCE_THRESHOLD
    ├── orion.py           → static config + in-memory toggle (non-smart unit)
    ├── shelly.py          → httpx async calls to the Shellys' local REST API, by
    │                        .local name pinned in /etc/hosts (see Network Architecture)
    ├── dometic.py         → polls ESP32 bridge for CFX5 fridge data
    ├── starlink.py        → gRPC to dish at 192.168.100.1:9200 (local, no internet)
    ├── ecoflow.py         → passive BLE advertisement scan (battery % only)
    ├── camera.py          → v4l2-ctl capture (on demand, and called by the
    │                        background loop) — see Camera System below
    ├── mode.py            → persisted to mode.json (atomic write); drives the
    │                        camera interval, not yet the Shellys
    └── system.py          → power math from BMS + MPPT caches, Pi health, WiFi
                             and hotspot control, backup download, SD-card image,
                             reboot / shutdown / restart-api
```

**Services layer:**
```
services/
├── battery_ble.py         Persistent BLE connection to Power Queen BMS
│                          FFE1 characteristic, reads every 30s, 5-min reconnect cooldown
├── victron_ble.py         One-shot BLE scan for the Victron MPPT every 30s
│                          Uses victron-ble library to decrypt advertisements
├── ecoflow_ble.py         Passive scan, battery % from the advertisement, plus a
│                          charge_state inferred from the % trend (10-min window)
├── starlink.py            Background gRPC poll of the dish, backs off while unreachable
├── dometic.py             Background poll of the ESP32 fridge bridge
├── camera_loop.py         Mode-driven periodic capture + 24h photo retention sweep
├── ble_orchestrator.py    asyncio.gather() — runs the Victron, BMS and EcoFlow loops
│                          concurrently; the BMS task runs under a watchdog
├── loop_watchdog.py       Plain thread: if the event loop has not run for 60s, dumps
│                          every thread's stack and exits so systemd restarts van-api
├── data_logger.py         Writes readings to SQLite every 30s, triggers rollups
├── db.py                  SQLite schema, 4-tier rollup, prune, query helpers
├── network.py             WiFi / hotspot status and switching via nmcli (cached)
├── health.py              Pi vitals: temp, load, memory, disk, uptime, throttle flags
├── backup.py              Consistent SQLite snapshot for the download endpoint
├── pq_battery.py          Vendored: pq_bms_bluetooth parse logic
├── pq_request.py          Vendored: pq_bms_bluetooth BLE request helper
└── disk_image.py          SD card image to the USB backup drive: module-level job
                           state, dd|gzip background task
```

---

## Camera System

One camera, a Logitech C922 on `/dev/video0` (see `docs/HARDWARE.md`). Two paths
take photos, both through the same `capture()` function in `camera.py`:

```
services/camera_loop.py (background)        GET /photos/latest?cam=interior
  every camera_interval_min of the            (on demand, fresh on every call)
  active mode, 60s floor
        └──────────────┬────────────────────────────┘
                       ↓
        _apply_tuning()  — re-applies the UVC controls in CAMERA_TUNING, since
                           they reset on every unplug/reboot; logs once if the
                           camera rejects one
                       ↓
        v4l2-ctl --stream-to=<path>  — one MJPEG frame straight to disk, no
                           ffmpeg, no transcoding (the camera encodes MJPEG)
                       ↓
        backend/photos/{cam}/{cam}_{ISO8601}.jpg

FastAPI static mount → /static/photos/{cam}/{filename}
  (served by uvicorn, reached through the Express proxy; nginx has no
   photos location of its own)
```

The loop also deletes photos older than 24h (an hourly sweep), so
`backend/photos/` stays bounded. `CameraHistoryDrawer` lists the retained
photos via `GET /photos/recent`.

Only `interior` is installed. `exterior` (`/dev/video2`) is wired up in code but
has no hardware, and requests for it 503 with "exterior camera not connected".
See `docs/HARDWARE.md` for why `ffmpeg` and the CSI camera module were abandoned
(2026-08-31, OOM-crashed the Pi's 1GB RAM mid-install) and for the C922 tuning.

**Not built:** evening auto-extension of the capture interval. See
`docs/FUTURE-FEATURES.md` Priority 5.

---

## Network Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│ VAN NETWORK                                                       │
│                                                                   │
│ wlan0 (onboard radio) — TwitchWiFi hotspot AP, 10.42.0.1          │
│   fixed addresses (DHCP reservations, known-devices.conf):        │
│   ├── Shelly USB Outlets   shelly1g4-d885acec6aac  .102           │
│   ├── Shelly Garage        shelly1g4-d885acf36a28  .215           │
│   ├── Shelly PS Input 1    shelly1g4-98a31677ca34  .27            │
│   ├── Shelly PS Input 2    shelly1g4-48f6eed0a89c  .26            │
│   ├── ESP32 fridge bridge  dometic-bridge          .37            │
│   └── phones / iPads       DHCP 10.42.0.x                         │
│                                                                   │
│ wlan1 (USB dongle, external antenna) — uplink client              │
│   Starlink "Sir Salettelot"   priority 100  (192.168.4.x)         │
│   networks saved from the dashboard   priority 75                 │
│   OHeck (home)                priority 50  (192.168.1.x)          │
│                                                                   │
│ eth0 — wired rescue port, 10.55.0.1/24 (shared; down if no cable) │
│                                                                   │
│ wlan0 and eth0 clients are NAT'd out through wlan1.               │
│ Tailscale (van-pi, 100.x.x.x) for remote access.                  │
└───────────────────────────────────────────────────────────────────┘
```

Remote access: phone/Mac → Tailscale DERP → Pi → nginx :80.

**TwitchWiFi shares wlan1's internet (NAT), since 2026-09-01.** The kernel's
masquerade rules do not survive a reboot, so `scripts/70-hotspot-nat`, a
NetworkManager dispatcher script, re-applies them whenever wlan0 or eth0 comes up
(`ip_forward`, MASQUERADE for 10.42.0.0/24 and 10.55.0.0/24 out through wlan1,
plus the FORWARD rules). Phones and iPads on TwitchWiFi therefore get internet
through whatever wlan1 is joined to. Outbound NAT only: nothing is port-forwarded.
The hotspot's DNS forwards to `192.168.1.1` (`upstream-dns.conf`), which is
OHeck's router; how that behaves while on Starlink has not been verified.
(Earlier versions of this document, and of CLAUDE.md, said TwitchWiFi had no
internet route by design. That was true until 2026-09-01.)

**`van-pi.local` resolves on TwitchWiFi** via static address records in
`/etc/NetworkManager/dnsmasq-shared.d/` (`van-pi.conf` → 10.42.0.1,
`eth0-van-pi.conf` → 10.55.0.1). NM's hotspot dnsmasq treats `.local` as a special
mDNS domain otherwise and returns NXDOMAIN.

**The Shellys and the fridge bridge are addressed by name, but the names are pinned.**
The same `70-hotspot-nat` dispatcher script writes `/etc/hosts` entries for each of
them, mapping `shelly1g4-….local` and `dometic-bridge.local` to the DHCP-reserved
addresses above. This bypasses an avahi `allow-interfaces` restriction that broke
mDNS for devices on wlan0, and the script re-adds the block after every boot
(`/etc/hosts` did not survive a reboot on its own, which is why the Shellys kept
going dark). Name lookup is therefore instant, **not** an mDNS round trip. To add a
device: add a `dhcp-host=` line to `known-devices.conf`, a line to the script's
`restore_hosts`, and an entry to `SHELLY_UNITS`.

**wlan0 is not a client.** The old Starlink and OHeck client profiles on wlan0
have `autoconnect: no`. Only the TwitchWiFi hotspot runs on wlan0.

**Shellys are on TwitchWiFi.** Because TwitchWiFi is the Pi's own AP, the
Shellys are reachable as long as the Pi is running, regardless of whether
Starlink or OHeck is active. If one shows `reachable: false`, check that unit's
power and WiFi first. DNS is not the cause (see above), and an unreachable unit
costs `GET /shelly/` a 3-second HTTP timeout on every poll.

---

## Operating Modes

A mode sets how often the camera captures, and is meant to drive Shelly behavior
too. The selection is persisted to `backend/mode.json` (atomic write) and survives
restarts. `camera_loop.py` reads it live; nothing drives the Shellys from it yet.

```
POST /mode/{mode_name}
→ updates _current_mode and writes mode.json
→ camera_loop picks up the new interval on its next cycle
→ (TODO) pushes schedule updates to the Shelly units
```

| Mode | Camera interval | Camera scope | Shellys (`shellys_off`) |
|---|---|---|---|
| storage | 360 min | Interior only | Flag set, not applied |
| camp | 30 min | Interior only | Not applied |
| trail | 15 min | Interior only | Not applied |
| in_town | 30 min | Interior only | Not applied |

Details and the intended behavior: `docs/MODES.md`.

---

## Security Model

- **No public exposure** — Pi is not port-forwarded. All remote access via Tailscale encrypted tunnel
- **van-api binds `127.0.0.1:8000` only** (`--host 127.0.0.1` in `van-api.service`), so it is not reachable from the network at all; only the Express proxy on the same machine can call it. The `require_api_key` middleware in `main.py` is a second layer for callers that do reach it (the dev proxy over Tailscale, `curl` on the Pi): loopback callers pass free, anyone else needs `X-API-Key`, and `/health` stays open for the CI/CD liveness check and the reboot poller. An unset key fails open so a bad deploy cannot lock you out of the van
- **Tailscale ACLs** — Only Todd's devices on the Tailnet can reach the Pi
- **No credentials stored** — Shelly local REST API requires no auth on local network (Shelly default)
- **Read-only BLE** — pq_bms_bluetooth reads BMS data only, cannot modify BMS settings

---

## Deployment

### Rebuilding the Pi

See `docs/SETUP.md` (about an hour from a blank SD card) and `scripts/pi-setup.sh`,
the idempotent script behind most of it. The repo has no `systemd/` directory: the
unit files live in SETUP.md and are installed by hand.

### Updating a running Pi

Pushing to `main` deploys by itself, through a self-hosted GitHub Actions runner on
the Pi (`.github/workflows/`):

- `backend/**` changed → `pip install -r requirements.txt`, restart `van-api`
- `frontend/**` changed → `npm install --include=dev`, `npm run build`, restart `van-frontend`
- docs-only pushes deploy nothing

The runner has silently skipped a push before, so verify rather than assume:

```bash
ssh todd@van-pi.local 'cd ~/van-control-panel && git log -1 --oneline'
# if it is behind:
git fetch origin main && git reset --hard origin/main   # reset, not pull: the Pi may hold local edits
sudo systemctl restart van-api        # and/or van-frontend after a frontend build
```
