# Van Control Panel

> A self-hosted monitoring and control dashboard for a 2023 Mercedes Sprinter VS30 AWD 144" High Roof conversion.

![Stack](https://img.shields.io/badge/stack-React%20%2B%20FastAPI-orange)
![Platform](https://img.shields.io/badge/platform-Raspberry%20Pi%204B-red)
![License](https://img.shields.io/badge/license-MIT-blue)

<img width="821" height="780" alt="image" src="https://github.com/user-attachments/assets/aa98d6e1-44fa-4078-8c45-ffb89cb7441c" />
<img width="549" height="785" alt="image" src="https://github.com/user-attachments/assets/357755d8-0493-4adc-8d27-c78447a657dc" />

---

## What This Is

A dashboard running on a Raspberry Pi 4B in the van's electrical cabinet. It reads
the 12V LiFePO4 system over Bluetooth, controls smart relays over WiFi, logs
everything to SQLite, and is reachable from a phone anywhere via Tailscale.

Everything runs locally. No cloud services, no vendor accounts, no subscriptions.
The only outbound dependency is Tailscale for remote access.

---

## Demo

A deployed version with physically modelled fake data runs on Vercel. Solar
follows a bell curve, SOC integrates against a baseline load, and the history
charts come from the same simulation as the live values, so they agree with each
other rather than being random noise.

Run it locally:

```bash
cd frontend && VITE_DEMO=true npm run dev
```

---

## What actually works

| Feature                                     | Detail                                                           |
| ------------------------------------------- | ---------------------------------------------------------------- |
| **Battery** — Power Queen 100Ah LiFePO4 BMS | SOC, voltage, current, temperature, per-cell voltages over BLE   |
| **Solar** — Victron SmartSolar MPPT 75/15   | Panel watts, charge state, daily yield from BLE advertisements   |
| **Fridge** — Dometic CFX5 35                | Temp, set point, compressor, door, power source via an ESP32 BLE bridge |
| **Starlink Mini**                           | Latency, throughput, obstruction, and measured power draw over local gRPC |
| **EcoFlow River 2 Max**                     | Battery % decoded from the raw BLE advertisement — no auth, no cloud |
| **Smart relays** — 2× Shelly 1 Gen4         | USB outlets and garage circuit, local HTTP, no cloud             |
| **History** — SQLite, four tiers            | Raw → hourly → daily → monthly, automatic rollup and pruning     |
| **Operating modes**                         | Storage / Camp / Trail / In Town, persisted across restarts      |
| **Pi health**                               | CPU temp, load, memory, disk, uptime, undervoltage flags         |
| **Networking**                              | Dual WiFi with automatic failover, switchable from the dashboard |
| **Event log**                               | Every state change recorded — toggles, mode changes, reboots     |
| **Backups**                                 | Nightly snapshot over Tailscale, plus on-demand download         |
| **Remote access**                           | Tailscale — works from any network                               |

## Not built yet

Stated explicitly, because a README claiming hardware that isn't there is worse
than one admitting the gaps.

| Feature                 | Why not                                                                |
| ----------------------- | ---------------------------------------------------------------------- |
| **Cameras**             | Router and UI scaffolded, hardware not yet installed                   |
| **Shore power**         | Inferred from the BMS/MPPT current delta — no charger telemetry        |
| **DC-DC charger**       | Orion-Tr 12/12-18 is non-smart. Static config only                     |
| **Fridge control**      | Reading works. Writing (set temp, on/off) is supported by the component but not wired up |
| **Garmin PowerSwitch**  | BlueZ can't connect. Protocol is undocumented — see 2026-08-27 review |
| **Maxxfan relay**       | Tested and rejected — it defaults open on power loss                   |
| **Applying modes**      | The selection persists, but nothing is driven by it yet                |

---

## Tech Stack

**Frontend** — Vite, React 18, TypeScript, Tailwind, Zustand, Recharts, React Router.
Served in production by a small Express server that also proxies the API and
handles auth.

**Backend** — FastAPI on uvicorn. `bleak` for BLE, `victron-ble` for the MPPT,
a vendored fork of `pq_bms_bluetooth` for the BMS, `httpx` for the Shellys,
`starlink-grpc-core` for the dish, SQLite for storage.

**Firmware** — an ESP32-S3 running ESPHome bridges the Dometic fridge, which
BlueZ cannot talk to at all. It exposes a local JSON API the Pi polls like any
other WiFi device.

**Infrastructure** — Raspberry Pi 4B, nginx on :80 in front of the Express
server, Starlink Mini with a home network as fallback, Tailscale, and a
self-hosted GitHub Actions runner that deploys on push.

### Notable implementation details

- **Victron data comes from BLE advertisements**, not a VE.Direct cable — the MPPT
  broadcasts encrypted manufacturer data that decrypts with a key from the app.
- **The BMS needs a persistent connection.** Rapid reconnects trigger a firmware
  lockout that requires physically pulling the 50A disconnect, so there is a
  5-minute cooldown guard.
- **The fridge took an ESP32 to reach at all.** Two independent blockers: the
  CFX5 speaks a different protocol generation than the widely-forked CFX3
  component (`537a04xx`, not `537a03xx`), and it requires real BLE bonding that
  ESPHome's default client never initiates. BlueZ on the Pi can't do either.
- **EcoFlow battery % is a single unencrypted byte** in the BLE advertisement,
  at a fixed offset after the serial number. Verified against the unit's own
  screen. Everything richer than that lives behind their encrypted protocol.
- **History is downsampled server-side.** Raw endpoints bucket-average to ~300
  points rather than shipping 2,880 rows a chart can't display.
- **Polling pauses when the tab is hidden**, which cut idle request volume by
  roughly 85%.
- **NetworkManager won't roam back to a preferred network** on its own — it only
  evaluates priority at boot or after a disconnect. A dispatcher script handles
  the return to Starlink, and the ESP32 needed its own equivalent.

---

## Quick Start

Open in VS Code and press **Cmd+Shift+B**, or:

```bash
# frontend — proxies to the Pi over Tailscale
cd frontend && npm install --include=dev && npm run dev

# backend
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8000
```

`--include=dev` matters if `NODE_ENV=production` is set in your shell — npm will
otherwise silently skip devDependencies, including TypeScript.

Rebuilding the Pi from a blank SD card: **[docs/SETUP.md](docs/SETUP.md)**. Most
of it is automated by `scripts/pi-setup.sh`, which is idempotent and safe to
re-run after a failure:

```bash
scp scripts/pi-setup.sh todd@van-pi.local:~/
ssh -t todd@van-pi.local 'chmod +x pi-setup.sh && ./pi-setup.sh'
```

---

## Operating Modes

| Mode      | Camera interval | Intent                                  |
| --------- | --------------- | --------------------------------------- |
| `storage` | 6 hr            | Long-term parking, battery preservation |
| `camp`    | 30 min          | Default active mode                     |
| `trail`   | 15 min          | Parked and unattended                   |
| `in_town` | 30 min          | Full connectivity                       |

The selection persists across reboots. Driving behaviour from it is not
implemented.

---

## Access

| Scenario               | Method                |
| ---------------------- | --------------------- |
| Same network as the Pi | `http://van-pi.local` |
| Anywhere else          | Tailscale address     |

Two auth layers: a signed cookie on the Express frontend, and an API key on the
FastAPI backend for anything not arriving over loopback.

---

## Docs

- [Setup](docs/SETUP.md) — rebuild from a blank SD card
- [Troubleshooting](docs/TROUBLESHOOTING.md) — symptom-first fixes
- [Architecture](docs/ARCHITECTURE.md)
- [API Reference](docs/API.md)
- [Hardware](docs/HARDWARE.md)
- [Operating Modes](docs/MODES.md)
- [Future Features](docs/FUTURE-FEATURES.md) — prioritized roadmap
- [Claude Code Context](docs/CLAUDE.md) — conventions, gotchas, full system notes
- [Rubber Duck Review](docs/rubber-duck-review.md) — bugs found, and the reasoning errors behind them
- [Rubber Duck Review, 2026-08-27](docs/rubber-duck-review-2026-08-27.md) — the CFX5 protocol investigation

---

## License

MIT
