# CLAUDE.md — Van Control Panel

Context file for Claude Code. Gives full project context so sessions don't require re-explaining the architecture.

**Jump to:** [Quick Start](#quick-start) · [Workflow](#workflow) · [Recovery](#recovery) · [Auth](#auth) ·
[Networking](#networking) · [Known Limitations / TODOs](#known-limitations--todos)

Rebuilding the Pi from scratch: **[SETUP.md](SETUP.md)**.
Past reasoning errors and corrections: **[rubber-duck-review.md](rubber-duck-review.md)**.
Symptom-first fixes: **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)**.

---

## What This Project Is

A self-hosted IoT monitoring and control dashboard for a converted 2023 Mercedes Sprinter VS30 AWD van. Runs fully on a Raspberry Pi inside the van. Frontend is a React/TypeScript SPA served by an Express server. Backend is a FastAPI Python server reading real hardware via BLE and WiFi REST.

**Status:** Live and running on the Pi. All core data sources are real — no mock data in production.

---

## Van Context

- **Vehicle:** 2023 Mercedes Sprinter VS30 AWD 144" High Roof (cargo conversion)
- **Owner:** Todd — DIY builder, front-end developer
- **Use:** Camping (Adirondacks, Midwest), mountain biking (Copper Harbor, Adirondacks)

---

## Actual Implementation (not planned — what's really running)

### BLE Services

**Victron SmartSolar MPPT 75/15** — BLE via `victron-ble` library (NOT VE.Direct). The MPPT broadcasts advertisement packets. A one-shot scanner fires every 30 seconds, captures one packet, parses it. There is no VE.Direct cable.

**Power Queen 100Ah LiFePO4 BMS** — BLE via `pq_bms_bluetooth` (vendored into `app/services/pq_battery.py` + `pq_request.py`). Uses FFE1 characteristic. Persistent connection — connects once and holds it, reading every 30 seconds. Reconnect cooldown is 5 minutes to prevent BMS firmware lockout.

**BMS lockout behaviour** — If too many rapid connection attempts are made, the BMS accepts connections but stops responding to commands. Fix: physically power-cycle the BMS (flip the house main disconnect). Prevention: the 5-minute `RECONNECT_IN` constant.

### Shelly Control

Three Shelly 1 Gen4 units installed, one placeholder. All installed units are
on TwitchWiFi (10.42.0.1/24). Uses `.local` mDNS hostnames (NOT hardcoded IPs):

- `shelly1g4-d885acec6aac.local` → USB Outlets (10.42.0.102)
- `shelly1g4-d885acf36a28.local` → Garage (10.42.0.215)
- `shelly1g4-48f6eed0a89c.local` → PS Input 2 (10.42.0.26)
- PS Input 1 — not yet installed (`ip: None`, `installed: False`, hidden in UI)

Control via httpx async HTTP to Shelly local REST API. The Shellys are on
TwitchWiFi — the Pi's own hotspot AP — so they're reachable as long as the Pi
is running, independent of Starlink/OHeck state.

### Frontend Server

Served by **nginx** (port 80), which proxies to **Express** (`frontend/server.mjs`) on port 3000. Express:

- Serves the built React SPA from `dist/`
- Proxies `/api/*` to uvicorn at `localhost:8000`
- Optional basic auth via `VAN_PASSWORD` in `.env`

### Data Logging

SQLite database at `backend/van_power.db`. Four-tier time-series storage:

- `readings_raw` — every reading, 30-day retention
- `readings_hourly` — avg/min/max per hour, 1-year retention
- `readings_daily` — daily summaries, forever
- `readings_monthly` — monthly summaries, forever

Rollups happen automatically at hour/day/month boundaries in `app/services/data_logger.py`.

### Access

| Method          | URL                                                                       |
| --------------- | ------------------------------------------------------------------------- |
| Local           | `http://van-pi.local`                                                     |
| Tailscale       | `http://van-pi.tailba93b9.ts.net`                                         |
| Public (Funnel) | `https://van-pi.tailba93b9.ts.net` (run: `sudo tailscale funnel --bg 80`) |

### CI/CD

Self-hosted GitHub Actions runner on the Pi. Push to `backend/**` → auto deploys. Push to `frontend/**` → builds and deploys. Workflows in `.github/workflows/`.

Deploy workflow uses `git fetch && git reset --hard origin/main` (not `git pull`) because the Pi may have locally modified files from rsync during development.

---

## Tech Stack

### Frontend

- Vite + React 18 + TypeScript
- Tailwind CSS with custom design tokens
- Zustand (`src/store/van.ts`) — `Promise.allSettled` so partial API failures don't break the UI
- `usePolling` hook — 5-second interval, pauses while the tab is hidden
- Recharts — SOC and solar history charts
- React Router v6
- clsx for conditional classes. No component library: MUI and friends were considered
  and rejected as ~90kB gzipped of Material Design fighting a monospace terminal aesthetic

### Backend

- FastAPI + uvicorn on port 8000
- Python 3.13 on Debian Trixie (arm64)
- `victron-ble` + `bleak` — MPPT passive BLE scan
- `pq_bms_bluetooth` (vendored) + `bleak` — BMS active BLE connection
- `httpx` — async Shelly REST calls
- `pydantic-settings` — config via `.env` file
- SQLite (stdlib `sqlite3`) — time-series logging

### Infrastructure

- Raspberry Pi (arm64, Debian Trixie)
- Tailscale — VPN + Funnel
- Starlink Mini — primary WiFi, home WiFi as secondary DHCP profile
- GitHub Actions self-hosted runner

---

## File Map

```
backend/app/
  config.py              pydantic-settings, reads .env
  main.py                FastAPI app, lifespan starts BLE orchestrator + data logger
  routers/
    battery.py           /battery/ — BMS data (real), history endpoints
    mppt.py              /mppt/ — Victron data (real), history endpoints
    shelly.py            /shelly/ — live Shelly toggle via httpx
    system.py            /system/ — net power, runtime, Pi health, WiFi status
                         and switching
    orion.py             /orion/ — static config (non-smart unit)
    shore.py             /shore/ — always returns disconnected (no cable)
    mode.py              /mode/ — persisted to backend/mode.json, atomic write
    camera.py            /photos/ — not yet implemented, returns 404
  services/
    battery_ble.py       Power Queen persistent BLE connection
    victron_ble.py       Victron one-shot BLE scan
    ble_orchestrator.py  Runs both as asyncio tasks via gather()
    data_logger.py       Writes readings to SQLite, triggers rollups
    db.py                SQLite schema, write, rollup, prune, query functions
                         query_raw bucket-averages server-side (max_points=300)
    network.py           WiFi status by parsing iwconfig, profile list,
                         switching, scan (--rescan auto, cached NM results),
                         and connect (creates new nmcli profile). Cached 15s.
    health.py            Pi vitals — temp, load, memory, disk, uptime, and
                         throttle flags via vcgencmd. Cached 10s
    pq_battery.py        Vendored: pq_bms_bluetooth parse logic
    pq_request.py        Vendored: pq_bms_bluetooth BLE request
    disk_image.py        SD card image creation — module-level _job state, asyncio
                         background task running dd|gzip. State resets on van-api
                         restart; in-flight dd becomes an orphan (pkill to clean up).

frontend/
  server.mjs             Express — serves dist/, proxies /api/*, signed-cookie auth
  vercel.json            Pins VITE_DEMO=true + SPA rewrite for the Vercel demo deploy
  src/
    api/client.ts        Typed fetch wrapper. Exports isDemo and swaps api between
                         realApi and mockApi on VITE_DEMO
    api/mock.ts          Demo-mode mock of the full api surface. Physically modelled:
                         solar bell curve drives SOC integration, seeded PRNG keeps
                         multi-day charts stable across reloads
    store/van.ts         Zustand store. fetchAll uses Promise.allSettled; mutations
                         catch and toast, and skip the optimistic update on failure
    store/settings.ts    Persisted gap / spacing / vanName. Panel and Stack read this
    store/toast.ts       Toast queue, dedupes by message
    hooks/useVisibleInterval.ts
                         setInterval that pauses while the tab is hidden
    hooks/usePolling.ts  Thin wrapper — fetchAll on useVisibleInterval, 5s
    hooks/useModalBehavior.ts
                         Focus trap, Escape, focus restoration, scroll lock.
                         Used by both modals and the settings drawer
    types/index.ts       TypeScript interfaces (keep in sync with Pydantic models)
    components/ui/       Primitives: Panel, Stack, Label, StatusDot, SelectableTile,
                         Button. Panel/Stack own spacing from the settings store
    components/
      BatteryCard.tsx    SOC, voltage, temp — shows last known values when offline
                         with last-seen time and retry countdown
      ChargeSourcesCard  Solar / Shore / Orion rows
      ShellyPanel.tsx    Per-unit toggles. Shows "unreachable" distinctly from off
      ModeSelector.tsx   Storage / Camp / Trail / In Town
      HistoryCard.tsx    Recharts SOC 24h + Solar 30d
      SettingsDrawer.tsx Gear icon → Pi health, network detail, WiFi scan/connect
                         button, backup download, SD image creation (start/poll/download/cancel),
                         BMS release, power options, theme
      WifiScanDrawer.tsx Second-layer drawer (z-60) over SettingsDrawer. Scan
                         wlan1 for networks, select one, connect with password
      WifiBadge.tsx      Header SSID + band. Amber below -70dBm, red if unassociated
      Toaster.tsx        Renders the toast queue
    pages/
      Dashboard.tsx      Main view. Cards take no props — Panel handles spacing
      Cameras.tsx        Photo gallery (cameras not yet installed)
```

---

## Environment Variables

Two files, both gitignored, both on the Pi. Neither is in git, so deploys never
overwrite them.

`backend/.env` — read by pydantic-settings via `app/config.py`:

```
VICTRON_MAC=E8:18:52:D1:81:B7
VICTRON_KEY=<32-char hex from VictronConnect → Product info>
BMS_MAC=C8:47:80:5D:08:6F
VAN_API_KEY=<32-byte hex — REQUIRED, see Auth>
```

An empty `VAN_API_KEY` fails open, leaving port 8000 reachable by anyone on the
WiFi. Generate one rather than leaving it blank.

`frontend/.env` — read by systemd via `EnvironmentFile`, consumed by
`server.mjs`:

```
VAN_PORT=3000
VAN_PASSWORD=<dashboard password>
VAN_SESSION_SECRET=<32-byte hex — changing it logs everyone out>
```

`frontend/.env.local` on the **Mac** — the dev proxy reaches the Pi over
Tailscale rather than loopback, so it must send the API key:

```
VAN_API_KEY=<same value as the Pi's backend/.env>
```

---

## Key Constants

| Constant             | File                | Value | Notes                                                                                                                                     |
| -------------------- | ------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `RECONNECT_IN`       | battery_ble.py      | 300s  | BMS reconnect cooldown                                                                                                                    |
| `STARTUP_DELAY`      | battery_ble.py      | 5s    | Clears BlueZ InProgress on restart                                                                                                        |
| `READ_EVERY`         | battery_ble.py      | 30s   | BMS read interval                                                                                                                         |
| `VICTRON_INTERVAL`   | ble_orchestrator.py | 30s   | MPPT scan interval                                                                                                                        |
| `LOG_INTERVAL`       | data_logger.py      | 30s   | SQLite write interval                                                                                                                     |
| `RAW_RETAIN_DAYS`    | db.py               | 30    | Days to keep raw readings                                                                                                                 |
| `HOURLY_RETAIN_DAYS` | db.py               | 365   | Days to keep hourly rollups                                                                                                               |
| `STALE_AFTER` (BMS)  | battery_ble.py      | 120s  | Seconds before BMS cache is stale                                                                                                         |
| `STALE_AFTER` (MPPT) | victron_ble.py      | 120s  | Seconds before MPPT cache is stale                                                                                                        |
| `max_points`         | db.py `query_raw`   | 300   | Bucket-averages raw history server-side. Was shipping ~2,880 rows per source per request; charts render ~900px wide. Pass 0 for every row |

---

## Quick Start

Open the repo in VS Code and press **Cmd+Shift+B**, or Cmd+Shift+P → "Run Task".

| Task                                   | What it does                                            |
| -------------------------------------- | ------------------------------------------------------- |
| **Dev: full stack (local backend)**    | Vite + local uvicorn in parallel. Default build task    |
| **Dev: frontend against the Pi**       | Vite only, proxies to van-api over Tailscale. Real data |
| **Dev: frontend with demo data**       | `VITE_DEMO=true`, mock API. No Pi, no Bluetooth needed  |
| **Build / Typecheck: frontend**        | `npm run build` / `tsc --noEmit`                        |
| **Install: frontend deps (incl. dev)** | Use this, not plain `npm install` — see below           |
| **Pi: status**                         | Service state, WiFi, Shelly reachability                |
| **Pi: tail van-api log**               | Live journal                                            |
| **Pi: recent events**                  | Last 48h of state changes from the event log            |
| **Pi: shell**                          | SSH over Tailscale                                      |

A **local backend** starts fine but the BLE services find nothing — the BMS and
Victron are not in Bluetooth range of the Mac — so the battery and solar cards
show offline. Good for frontend work; use "against the Pi" for real data.

### Trap: NODE_ENV=production

The shell exports `NODE_ENV=production` and npm is configured with `omit=dev`,
so a plain `npm install` **silently skips devDependencies**. This is how
`typescript` went missing mid-session, producing `sh: tsc: command not found`
from a build that had worked minutes earlier.

```bash
npm install --include=dev    # always this
```

The VS Code tasks set `NODE_ENV=development` so they are unaffected.

### Manual equivalents

```bash
# frontend against the Pi
cd frontend && npm run dev

# frontend against a local backend
cd frontend && VAN_API_TARGET=http://localhost:8000 npm run dev

# backend
cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000
```

---

## Workflow

Established 2026-08-27, after enough direct-to-`main` pushes needed manual
rollback that it stopped being worth the speed. One branch per complete piece
of work — not per fragment, not bundled across unrelated fixes.

1. `git checkout main && git pull` — start clean.
2. `git checkout -b <descriptive-name>` — one branch per logical unit of
   work. **Called a "PR" in conversation**, not "session" or "build" — those
   imply something bigger and vaguer than what these actually are. Branch
   names are short, kebab-case, verb-first: `fix-fridge-write-control`,
   `add-camera-light-toggle`, `docs-x`. Matches the placeholder already in
   the "Git: start branch" VS Code task.
3. Do the work.
   - **Backend/frontend:** test locally against real hardware, using the
     "Dev: full stack (local backend)" VS Code task — never overwrite what's
     actually running on the Pi's `van-api`/`van-frontend` services mid-task.
   - **ESP32 firmware:** there is no separate "dev" build of a physical
     board — flashing _is_ the test. Live hardware iteration happens freely
     during the branch; this is expected, not a workflow violation.
4. Confirm a clean build (`npm run build`, `py_compile`) and real behavior
   before opening anything.
5. Push the branch, open a real PR with `gh pr create` (installed and
   authenticated — confirmed, not assumed). Never push directly to `main`.
6. **The person merges, not Claude.** Wait for review.
7. After merge: deploy to the Pi and do one live pass to confirm it actually
   works in production, not just in dev. Prefer a manual deploy
   (`git fetch && git reset --hard origin/main`, restart the relevant
   service) over trusting the self-hosted CI/CD runner to fire — it has
   repeatedly missed pushes this project, silently, which is a separate,
   still-open problem this workflow does not fix on its own. See the
   "deploy did not happen" line in Recovery below.

A PR gate fixes a different problem than flaky deploys: it's a review
checkpoint before merge, not a guarantee the runner behaves after it. Worth
keeping those two problems mentally separate rather than assuming one solves
the other.

---

## Recovery

Ordered by how much has gone wrong.

**Service died** — `sudo systemctl restart van-api` (or `van-frontend`).
Check with `systemctl status van-api --no-pager`.

**Dashboard shows ENOENT dist/index.html** — the build is missing.
`cd ~/van-control-panel/frontend && npm run build && sudo systemctl restart van-frontend`.

**Circuits unreachable, dashboard otherwise fine** — a network split. Check
the WiFi badge or `nmcli -f NAME,DEVICE connection show --active`, then
`sudo nmcli connection up starlink`. See Networking below.

**Locked out of the dashboard** — regenerate the session secret in
`frontend/.env` and restart `van-frontend`. Only invalidates browser sessions.

**Locked out of the API** — blank `VAN_API_KEY` in `backend/.env` fails open
by design. Restart `van-api` after editing.

**Deploy did not happen** — the runner does not always fire. Check
`cd ~/van-control-panel && git log --oneline -1` against origin, then
`git fetch origin main && git reset --hard origin/main` and restart the
relevant service. Observed silently skipping a commit that matched its path
filter, so verify rather than assume.

**Database corrupt or lost** — restore the newest snapshot from
`~/van-backups/` on the Mac. See SETUP.md §7.

**SD card dead, or a fresh Pi** — SETUP.md, start to finish. About an hour.

### What exists only on the Pi

| Thing                       | Recoverable?                                                                  |
| --------------------------- | ----------------------------------------------------------------------------- |
| `van_power.db`              | Nightly snapshot to the Mac, plus on-demand download from the settings drawer |
| `backend/.env`              | Copy on the Mac at `backend/.env`. Put the values in a password manager too   |
| `frontend/.env`             | No — but the session secret is regenerable and the password is yours          |
| `mode.json`                 | No — defaults to `camp`, one click to fix                                     |
| NetworkManager profiles     | Documented in SETUP.md §3                                                     |
| systemd units               | In SETUP.md §8, verbatim                                                      |
| Actions runner registration | Needs a fresh token, SETUP.md §10                                             |

---

## Systemd Services on Pi

```
van-api          FastAPI backend (uvicorn :8000)
van-frontend     Express frontend (:3000, behind nginx :80)
nginx            Reverse proxy (:80 → Express :3000)
van-backup       Daily van_power.db snapshot to the Mac (oneshot + timer)
actions-runner   GitHub Actions self-hosted runner
bluetooth        BLE adapter
tailscaled       Tailscale VPN
```

Rebuilding the Pi from a blank SD card: see `SETUP.md`.

### Backups

Three layers.

**Nightly to the Mac.** `~/van-backup.sh` on the Pi (versioned at
`scripts/van-backup.sh`) takes a consistent snapshot via `sqlite3 .backup` —
not `cp`, since the logger writes every 30s and a plain copy can catch a torn
write — gzips it, and scps to `~/van-backups/` on the Mac over Tailscale.
Driven by `van-backup.timer`, daily, `Persistent=true` so a missed run happens
on next boot.

Failed sends (Mac asleep) are held in `~/van-backups-pending/`, pruned to the
last 3. Retention on the Mac keeps every snapshot from the last 45 days, then
thins to the 1st of each month. Steady state ~50 files, ~8MB.

Thinning rather than deleting matters: the live DB prunes raw readings at 30
days, so older snapshots hold detail the Pi itself has discarded.

**On demand from the dashboard.** Settings drawer → Backup → Download
database. `GET /system/backup` returns a gzipped snapshot; the drawer fetches
it as a blob so the request carries the session cookie and failures surface as
a toast. Useful when the Mac is asleep or you are away from it.

`GET /system/backup/status` reports DB size, row counts, when the timer last
fired, and how many snapshots are stuck on the Pi. `never run`, or a steady
non-zero pending count, means the nightly job is not landing.

**Database only, deliberately.** No `.env`, no NetworkManager profiles, no
session secret. van-api is reachable with an API key, and an endpoint handing
out WiFi credentials and the Victron key is a different risk class from one
handing out battery history.

Verified restorable: a downloaded snapshot passes `PRAGMA integrity_check`,
contains all six tables, and unpacks to the full reading history.

### Still outstanding: offsite

Everything lives on one Mac. A dead machine or a house fire takes both copies.
At ~8MB steady state any free tier covers it. Options, none chosen:

- **iCloud Drive** — least new machinery, but not currently enabled on the Mac
- **Backblaze B2 / Cloudflare R2** — 10GB free, via `rclone`, and could push
  straight from the Pi, removing the Mac-must-be-awake dependency
- **Not Vercel** — a deployment platform, not storage

### `.env` values

Not backed up, and deliberately not worth building for. Put them in a password
manager secure note. `VICTRON_KEY` is the only awkward one and it is readable
from VictronConnect → SmartSolar → Product info. `VAN_API_KEY` and
`VAN_SESSION_SECRET` regenerate in seconds, `VAN_PASSWORD` is yours, and the
MAC addresses are in these docs.

---

## Auth

Two independent layers.

**Express (`server.mjs`, port 3000, behind nginx on port 80)** gates the dashboard with `VAN_PASSWORD`.
A signed cookie carries its own expiry — HMAC-SHA256 over the timestamp,
constant-time compare, no server state. It was previously `express-session`
with the default MemoryStore, which meant every `van-frontend` restart wiped
all sessions; CI/CD restarts on each frontend push, so a deploy logged you out
regardless of the cookie's stated lifetime. Now 365 days and survives
redeploys. Changing `VAN_SESSION_SECRET` invalidates all cookies.

**van-api (uvicorn, port 8000)** binds `127.0.0.1` only — not reachable from
the network, loopback only. The Express proxy (already behind `VAN_PASSWORD`)
is the only caller in production. `VAN_API_KEY` in `backend/.env` gates it for
any path that reaches uvicorn directly (dev proxy, curl from the Pi itself):

- loopback is trusted — that is the Express proxy, already password-checked
- `/health` is open for the CI/CD liveness check and the reboot poller
- everything else needs an `X-API-Key` header
- an unset key fails open so a bad deploy cannot lock you out of the van

Rejections log the source IP: `sudo journalctl -u van-api | grep rejected`.

The key lives in `backend/.env` on the Pi and the Mac, and in
`frontend/.env.local` for the dev proxy, which reaches the Pi over Tailscale
rather than loopback and would otherwise get 401. All gitignored, and `.env`
is not in git so deploys never overwrite it.

Known and accepted: anyone with SSH to the Pi can call the API freely. SSH
access already implies full control, so this closes the browser-on-the-network
threat, not the shell threat.

---

## Networking

The van has two WiFi networks available at home, and everything prefers
Starlink with the home network as fallback.

| Network  | SSID             | Notes                                           |
| -------- | ---------------- | ----------------------------------------------- |
| Starlink | `Sir Salettelot` | Preferred. Dual band, associate on ch 40 (5GHz) |
| Home     | `OHeck`          | Fallback. Prefer its 5GHz band                  |

**Pi priority** is set in NetworkManager on `wlan1` (the uplink radio):

```bash
nmcli -f NAME,AUTOCONNECT-PRIORITY connection show
# starlink-wlan1       100
# oheck-wlan1           50
```

`wlan0` profiles (`starlink`, `netplan-wlan0-OHeck`) still exist but have
`autoconnect: no` — they're disabled so the hotspot owns that radio.

**Shelly network:** All three installed units are on TwitchWiFi (10.42.0.1/24).
To configure a Shelly's WiFi:

```bash
curl -s "http://<ip>/rpc/WiFi.SetConfig" -H 'Content-Type: application/json' \
  -d '{"config":{"sta":{"ssid":"TwitchWiFi","pass":"...","enable":true}}}'
```

### Subnets

| Network  | Range            | Router        |
| -------- | ---------------- | ------------- |
| Starlink | `192.168.4.0/24` | `192.168.4.1` |
| OHeck    | `192.168.1.0/24` | `192.168.1.1` |

Starlink was renumbered off `192.168.1.0/24` in Aug 2026 because both routers
were handing out the same range, which made an IP meaningless as an identifier.
During a split, `192.168.1.60` was simultaneously a Shelly on OHeck and an
unrelated device on Starlink. Now the range alone tells you which network a
device is on.

The Starlink app offers a fixed list of subnets, not free entry. `192.168.4.1/24`
was picked from that list.

Nothing needed reconfiguring after the renumber: everything is DHCP, and
`shelly.py` addresses units by `.local` hostname rather than IP.

### Gotcha: NetworkManager does not roam back

Priority is only evaluated when NetworkManager picks a network — at boot, or
after a disconnect. It will **not** leave a working connection when a
higher-priority network reappears.

So a Starlink outage drops the Pi to OHeck, and the Pi stays there after
Starlink returns. The Shellys _do_ return on their own, so the two end up
split, with the dashboard loading fine but circuits showing unreachable.

**Fixed** by `scripts/90-prefer-starlink`, a NetworkManager dispatcher script.
Install with:

```bash
sudo install -o root -g root -m 755 scripts/90-prefer-starlink \
     /etc/NetworkManager/dispatcher.d/90-prefer-starlink
```

Must be root-owned and not group/world writable or NM ignores it silently.

It fires on `up`, `connectivity-change` and `dhcp4-change`, switches only when
the preferred SSID is actually in range, and holds a 120s cooldown in
`/run/prefer-starlink.last` so a flapping Starlink cannot cause thrashing.

Check it:

```bash
sudo journalctl -t prefer-starlink -n 20 --no-pager
```

Manual override if needed:

```bash
sudo nmcli connection up starlink
```

### Diagnosing a split

```bash
ip -4 addr show wlan1 | grep inet     # 192.168.4.x = Starlink, 192.168.1.x = OHeck
ip -4 addr show wlan0 | grep inet     # should always show 10.42.0.1 (TwitchWiFi AP)
iwconfig wlan1 | grep ESSID
avahi-browse -art | grep -i "_shelly._tcp" | sort -u
```

Symptoms: circuits show unreachable but the Shellys are not moving networks —
they're on TwitchWiFi (the Pi's own AP, always 10.42.0.1/24). If circuits are
unreachable, the most likely cause is a stale DNS cache entry in van-api from
a previous network state. Restart van-api.

**The DNS cache makes this outlast the split.** `shelly.py` caches `.local`
resolutions for `DNS_TTL` seconds to avoid paying ~105ms of mDNS per call.
When a Shelly moves networks (or after van-api restarts with a fresh empty
cache), the cache holds the stale IP, so the Shellys can be fully reachable
while the API keeps timing out. Restart van-api to flush it.

**Thread pool starvation.** The default asyncio thread pool is shared by BLE
(bleak) and Starlink (gRPC) tasks. If all threads are busy, `getaddrinfo()`
queues indefinitely. `shelly.py` uses a dedicated 2-thread executor
(`_dns_executor`) for DNS so it never competes with BLE/Starlink.

```bash
sudo systemctl restart van-api    # clears the resolution cache
```

Sweep the current uplink subnet without nmap (which is not installed):

```bash
# TwitchWiFi (Shellys live here)
for i in $(seq 1 254); do (ping -c 1 -W 1 10.42.0.$i >/dev/null 2>&1 &) ; done
sleep 5; ip neigh | grep -v FAILED

# Starlink (if wlan1 is on Starlink)
for i in $(seq 1 254); do (ping -c 1 -W 1 192.168.4.$i >/dev/null 2>&1 &) ; done
sleep 5; ip neigh | grep -v FAILED
```

### Development access

`vite.config.ts` proxies `/api` to `http://van-pi.local:8000` by default.
mDNS resolves correctly from any device on the same LAN as the Pi (Starlink,
OHeck, or TwitchWiFi). Override with `VAN_API_TARGET` when needed:

- `VAN_API_TARGET=http://localhost:8000` — local backend on the Mac
- `VAN_API_TARGET=http://100.x.x.x:8000` — Pi over Tailscale (when active)

The VS Code "Dev: full stack (local backend)" task sets `VAN_API_TARGET=localhost`.

`ssh todd@van-pi.local` works when the Mac and Pi are on the same LAN. Tailscale
SSH: `ssh todd@van-pi` — note the Pi currently shows as `van-pi-2` until the
ghost nodes (`van-pi`, `van-pi-1`) are deleted at
[login.tailscale.com/admin/machines](https://login.tailscale.com/admin/machines).

Do not pin `van-pi.local` in the Mac's `/etc/hosts` — the Pi's LAN IP changes
between Starlink (192.168.4.x) and OHeck (192.168.1.x), and a stale entry
silently breaks SSH.

### Power management

`Power Management:on` returns after every reconnect and adds latency. Fixed
persistently per-connection in NetworkManager:

```bash
sudo nmcli connection modify starlink-wlan1 802-11-wireless.powersave 2
sudo nmcli connection modify oheck-wlan1 802-11-wireless.powersave 2
```

Note the syntax is `<setting>.<property>` — `802-11-wireless.powersave`, with a
dot, not a hyphen. `2` is the enum for disable (`3` is enable, `0` is default).

Applied and verified: `iwconfig wlan1` reports `Power Management:off`.

### Signal quality — the onboard radio is the real ceiling

Measured 2026-08-28 during a session where the dashboard felt slow and the
Shellys kept dropping. The diagnosis path is worth keeping because the
symptoms looked like DNS and were not.

**What the numbers actually were:**

| Measurement                     | Value                    | Healthy would be |
| ------------------------------- | ------------------------ | ---------------- |
| Pi signal (OHeck, ch 7, 2.4GHz) | `-65 dBm`, quality 45/70 | above `-60 dBm`  |
| Retries (`/proc/net/wireless`)  | 111                      | low tens         |
| Mac → router                    | 0% loss, 3-8ms           | same             |
| Mac → Pi                        | **80% loss**, 10-634ms   | 0%, <10ms        |
| Pi → router                     | 10% loss, 2-75ms         | 0%, <10ms        |
| Interface errors (`ip -s link`) | 0 RX, 0 TX               | 0                |

_(Note: these stats were from the Pi's onboard radio before the USB dongle was
added. wlan1 now handles the uplink. The onboard radio on wlan0 runs the
TwitchWiFi AP and is not a client.)_

Zero interface errors with heavy packet loss means the hardware and driver are
fine. It is purely RF: the signal is too weak to sustain a reliable link.

**The 5GHz clue.** The Mac was associated to OHeck on channel 48 (5GHz) with a
perfect link. The Pi could not see OHeck's 5GHz radio _at all_ — a rescan
returned only `OHeck 55 ch 7 2442 MHz`. 5GHz has shorter range than 2.4GHz, so
"can't see the 5GHz SSID that other devices are using fine" is a direct
distance signal, not a config problem.

**Why it seemed like DNS.** `van-pi.local` resolving intermittently, the dev
server at `localhost:5173` failing to reach the API, Tailscale showing the Pi
offline — all of these are what heavy packet loss looks like from the
application layer. `dscacheutil -q host -a name van-pi.local` returned the
correct IP the whole time. Check loss before suspecting resolution:

```bash
ping -c15 <pi-ip>          # from the Mac
ssh ... 'cat /proc/net/wireless'   # signal, quality, retries (wlan1 = uplink)
ssh ... 'ip -s link show wlan1'    # errors/dropped — should be 0
```

**Nothing in software fixes this.** Powersave was already disabled, priorities
were correct, the dispatcher was installed. The van had simply moved further
from the house router than it used to sit. Starlink measured signal 94 when it
was on, versus OHeck's 54 — which is why everything worked well before and
degrades now.

### USB WiFi dongle — evaluated, worth it for two reasons

The Pi 4B's onboard radio is a Broadcom `brcmfmac` with a PCB trace antenna.
It cannot be improved in software and has no external antenna connector.

A USB adapter with an external antenna helps in two distinct ways:

1. **Range.** A real antenna on a marginal link is the difference between
   `-65 dBm` and something workable. This is the fix for the problem above.
2. **Simultaneous AP + client.** A second radio means the Pi can stay joined
   to Starlink/OHeck _and_ run its own access point at the same time, so the
   dashboard is reachable from a phone with no upstream network at all —
   parked in the woods, Starlink stowed. The onboard radio alone cannot do
   both reliably; sharing one radio between AP and client modes is possible
   but unstable.

**What to look for**, in priority order:

- **Chipset over brand.** `MT7612U` (5GHz-capable, dual band, mainline Linux
  driver, AP mode supported) or `RTL8812AU` (very common, needs a DKMS driver
  on Debian — more setup, more likely to break on kernel upgrades). Prefer
  MT7612U specifically because the driver is in-tree.
- **External antenna**, ideally detachable RP-SMA so it can be upgraded or
  relocated. This is the entire point.
- **AP mode support** — verify with `iw list | grep -A10 "Supported interface
modes"` after plugging in; look for `AP` in the list.
- **Dual band.** 5GHz is what the Mac is already using successfully on OHeck.

Known-good in the Pi community: Alfa AWUS036ACM (MT7612U, detachable antenna,
in-tree driver). Panda Wireless PAU0D is the same chipset, cheaper, fixed
antenna.

**Installed and working — see below.**

### Installed and working, 2026-08-28

Chipset confirmed live via `lsusb`: `0e8d:7612 MediaTek Inc. MT7612U` —
matches the decision above exactly, not a substitute.

Comes up as `wlan1`, exactly as anticipated. Given a second radio, the setup
mirrors `wlan0` rather than replacing it: two new connection profiles bound
explicitly to `wlan1` via `ifname` at creation time, so they can't compete
with `wlan0`'s existing profiles for the same SSID.

```bash
sudo nmcli connection add type wifi con-name starlink-wlan1 ifname wlan1 ssid "Sir Salettelot"
sudo nmcli connection modify starlink-wlan1 wifi-sec.key-mgmt wpa-psk
sudo nmcli connection modify starlink-wlan1 wifi-sec.psk "<password>"
sudo nmcli connection modify starlink-wlan1 connection.autoconnect-priority 100
sudo nmcli connection modify starlink-wlan1 802-11-wireless.powersave 2

sudo nmcli connection add type wifi con-name oheck-wlan1 ifname wlan1 ssid "OHeck"
sudo nmcli connection modify oheck-wlan1 wifi-sec.key-mgmt wpa-psk
sudo nmcli connection modify oheck-wlan1 wifi-sec.psk "<password>"
sudo nmcli connection modify oheck-wlan1 connection.autoconnect-priority 50
sudo nmcli connection modify oheck-wlan1 802-11-wireless.powersave 2

sudo nmcli connection up starlink-wlan1
```

Verify: `ip -4 addr show wlan1` should show a `192.168.4.x` address once
Starlink is up; `nmcli -f NAME,DEVICE,AUTOCONNECT-PRIORITY connection show`
should list both `-wlan1` profiles with the right priorities.

**wlan0 is now the dedicated AP, not a client.** The `90-prefer-starlink`
dispatcher only reasoned about `wlan0`. Now that `wlan0` is the TwitchWiFi AP,
that logic was irrelevant for `wlan0` — it never switched away from the
hotspot, and since `wlan0` isn't the uplink client anymore either, the script
never fired at all: confirmed live 2026-08-31, Starlink visible at full
signal, `wlan1` sitting on `oheck-wlan1` regardless, zero log lines.

**Fixed 2026-08-31:** `scripts/90-prefer-starlink` rewritten to watch `wlan1`
events and switch to the `starlink-wlan1` profile instead of `starlink`.
Deployed and verified: manually firing the dispatcher moved `wlan1` from
`oheck-wlan1` to `starlink-wlan1`, and `/starlink/` immediately went
`reachable: true` with real telemetry.

### Local AP, 2026-08-28 — `wlan0` is not a client anymore

Split by radio, not by feature: `wlan1` (external antenna, better range) does
all internet uplink — Starlink primary, OHeck fallback, exactly as set up
above. `wlan0` (onboard, weaker antenna) stopped being a client entirely and
now runs as a plain local access point — connect straight to the Pi with zero
upstream network required.

**SSID:** `TwitchWiFi` · **Password:** see Pi's `frontend/.env` · confirmed live via
`nmcli -s connection show TwitchWiFi`, not assumed from what was typed.

```bash
sudo nmcli connection modify starlink connection.autoconnect no
sudo nmcli connection modify netplan-wlan0-OHeck connection.autoconnect no
sudo nmcli device wifi hotspot ifname wlan0 ssid "TwitchWiFi" password "<password>"
```

Autoconnect disabled rather than deleted on the old `wlan0` client profiles
(`starlink`, `netplan-wlan0-OHeck`) — reversible if `wlan0` is ever needed as
a client again, but won't compete with the hotspot for the radio.
NetworkManager's built-in hotspot (`10.42.0.1/24`, its own DHCP) was enough
for this — no `hostapd`/`dnsmasq` needed, since this AP doesn't need to share
internet access, just reach the Pi's own services.

**This is not the public-WiFi-bridge project.** That's still the separate,
unbuilt thing described below — NAT, an inbound firewall rule on `wlan1`, the
`VAN_API_KEY` check. This AP has no route to the internet at all by design;
it is a direct line to the Pi's services. Connected devices can reach nginx
:80, the API, and the Shellys on 10.42.0.x — nothing beyond the Pi.

**Deliberately not done: sharing that internet connection out over the AP** —
right now `TwitchWiFi` has zero route to the internet by design, on
purpose, for safety (see below). Turning it into a real travel router means:

- `wlan1` (already the client radio, unchanged) as the internet source
- `wlan0`'s existing hotspot gets a route to `wlan1`'s connection instead of
  staying isolated
- NAT between them (`nftables` or similar) so downstream devices are
  invisible to the public network by default — this is what actually makes
  it safe, not an afterthought
- An explicit inbound-block rule on `wlan1` specifically if nginx is ever
  moved to a public port — van-api already binds 127.0.0.1 so port 8000 is
  not the risk. Port 80 (nginx → Express → password wall) is the remaining
  exposure.
- Captive portals aren't solved by anything above; expect one click-through
  per network, from any device on the local AP, same as any travel router

This is a real, scoped project (`hostapd` + `dnsmasq`, or NetworkManager's
own AP mode), not a config toggle — worth its own session, not squeezed into
this one.

---

## Known Limitations / TODOs

- **Applying a mode does nothing yet** — the selection persists across restarts, but camera intervals and Shelly schedules are not driven by it.
- **Camera system** not yet implemented — awaiting USB webcam hardware
- **Shore charger** always returns disconnected — no VE.Direct cable purchased
- **Orion-Tr** is non-smart, returns static config — upgrade to Orion XS 50A planned
- **History charts** — `HistoryCard` is wired up and rendering. SOC 24h and Solar 30d tabs both work. Daily solar only populates after a midnight rollup, so a fresh install shows the raw-derived fallback.
- **CORS** is `allow_origins=["*"]` — fine for local/Tailscale, tighten if Funnel is used long-term
- **PS Input 1** Shelly not yet installed — shows as `installed: false` in API, filtered out of the UI. Three units are live on TwitchWiFi: USB Outlets, Garage, PS Input 2.
- **`loads` breakdown in system.py is unconditional** — claims Starlink 22W and Fridge 40W regardless of actual state. Latent only: the frontend never reads it. See "system.py load estimation" below. **Partly solvable as of 2026-08-27:** the Starlink integration exposes real `power_w` from the dish, so the 22W guess can be replaced with a measurement (or dropped when the dish is unreachable, which is itself the signal that it's drawing nothing).
- **Vercel demo build** — built and deployed. See "Vercel Demo Mode" below.
- **Dometic CFX5 fridge — LIVE, 2026-08-27.** Multi-day blocker resolved.
  Root cause was two separate bugs, not one: the fridge speaks DDM2
  (`537a04xx`, 32-bit values, PUB/SET/SUB opcodes `0x10/0x11/0x12`), not DDM3
  (`537a03xx` — the vendored component's protocol, which only shared the
  UUID-patching insight, not the wire format); and it requires real BLE
  bonding, which nothing in ESPHome's default `ble_client` initiates on its
  own since the CFX never sends a Security Request. Swapped to
  `github://philippe-a11y/esphome-dometic-cfx5`, which handles both. Full
  investigation in `docs/rubber-duck-review-2026-08-27.md`.

  Real entities confirmed live against the hardware: temperature, set point,
  battery voltage, door open, power source, and compressor on/off. That last
  one had its own bug — `COOLER_POWER`'s real type is `INT8_BOOLEAN`, but it
  was wired under `sensor:` (numeric) instead of `binary_sensor:`, so
  `decode_to_float_()` silently returned null even with the fridge running.
  Fixed in both the ESP32 YAML and `services/dometic.py`, which had made the
  identical wrong-domain mistake independently.

  Backend (`services/dometic.py`, `/dometic/`) and `FridgeCard.tsx` are live
  and confirmed pulling real data through the full pipeline, not just off the
  ESP32 directly.

  **Known gap, not yet fixed:** the ESP32 is single-homed to OHeck
  (`secrets.yaml`, no fallback network), while the Pi's `prefer-starlink`
  dispatcher actively tries to keep it on Starlink — its normal, preferred
  state. The two will usually be on different networks, at which point mDNS
  resolution fails and the fridge card goes `reachable: false` — correctly,
  but not usefully. Pi was manually switched to OHeck to confirm the pipeline
  works end-to-end; it is not on its default network right now. Real fix is
  giving the ESP32 a second WiFi network to fall back to, mirroring how the
  Pi itself handles Starlink-primary/OHeck-fallback. Not done.

  Also unresolved: individual fields occasionally miss a single 5s poll cycle
  (e.g. `power_source` or `door_open` briefly null, self-correcting next
  cycle) — looks like normal resource contention on a small board juggling
  WiFi, BLE, and its own HTTP server at once. Not investigated further;
  `dometic.py` already tolerates it (per-field failure, not all-or-nothing).
  Backend (`services/dometic.py`, `/dometic/`) and `FridgeCard.tsx` are live
  and confirmed pulling real data through the full pipeline, not just off the
  ESP32 directly. Fields are Fahrenheit (`temp_f`/`set_temp_f`) — the fork has
  no `temperature_unit` config option (checked its `__init__.py`, unlike the
  old vendored component), so conversion happens once in `dometic.py`, the
  one place that touches the raw BLE-derived Celsius value.

  `FridgeCard.tsx` mirrors `BatteryCard`'s last-known-value pattern rather
  than blanking on every brief disconnect: shows the last reading, dimmed,
  with a `last_seen` age. A single ESP32 juggling BLE, WiFi and its own HTTP
  server hits brief hiccups often enough that blanking on every one made the
  card feel far less reliable than the underlying data actually was.

  **Fixed 2026-08-27, later same day: WiFi priority.** ESPHome's
  `wifi_component` supports an explicit per-network `priority:` (`-128..127`,
  default `0`, higher tried first — checked the source, not list order as
  first assumed). Starlink was given `priority: 1` over OHeck's default `0`,
  and a 5-minute watchdog rebooted the board if it wasn't on Starlink, to try
  to keep it on whichever WAN network the Pi's `wlan1` uplink was using.

  **Superseded 2026-08-31: joined TwitchWiFi instead of chasing wlan1.** The
  real fix wasn't a better priority/watchdog scheme — it was not needing one.
  `wlan0`/TwitchWiFi is the Pi's own always-on hotspot (10.42.0.1), the same
  network the Shellys are already on. The ESP32 now joins TwitchWiFi as its
  primary network (`priority: 1`), with Starlink kept as a lower-priority
  fallback for flashing/testing away from the van. Since TwitchWiFi is up any
  time the Pi is powered, regardless of which WAN network `wlan1` is on, mDNS
  resolution between the Pi and the ESP32 no longer depends on both boards
  picking the same uplink — the 5-min reboot watchdog and OHeck fallback
  network were removed as no longer needed. Secrets renamed
  `twitchwifi_ssid`/`twitchwifi_password` in `secrets.yaml` (gitignored).

  **Not yet built:** writing to the fridge (set temperature, on/off). The
  fork genuinely supports it — confirmed `ACTION_SET = 0x11` is the real
  opcode, not stubbed, and `number.py` exists with min/max/step — but adding
  a _write_ control while the connection was actively unstable felt like the
  wrong moment to add risk to a live, running fridge. Revisit once the
  connection has been stable for a real stretch.

- **EcoFlow River 2 Max** — live. Battery % decoded from an unencrypted byte
  in the BLE advertisement (manufacturer ID `0xB5B5`, offset 17, right after
  a 16-byte ASCII serial), confirmed against the unit's own screen. No
  connection, no auth, same passive-scan pattern as Victron. `services/
ecoflow_ble.py`, `/ecoflow/`, `EcoflowCard.tsx`. Only battery % — charging
  state and watts live in EcoFlow's encrypted protocol, out of reach of
  passive scanning. See the User ID / full-telemetry note below.
  **Updated 2026-08-27 — see `rubber-duck-review-2026-08-27.md`.** The
  advertisement is now confirmed to contain nothing beyond battery % (bytes
  18-24 are constant or a checksum), so that avenue is closed. Full telemetry
  is reachable two ways: the official cloud MQTT API (richest, but internet
  required) or local BLE GATT via `rabits/ha-ef-ble`, which explicitly
  supports our `R613` serial and works fully offline. Offline path preferred.
  Not pursued further — needs a real user-ID retrieval step (safely, via the
  person's own browser session, not a third-party credential-collecting
  tool) before it's worth scoping as its own project.
- **Starlink Mini — validated live, 2026-08-27.** Was "untested against the
  dish"; no longer. Static route added
  (`sudo ip route add 192.168.100.0/24 via 192.168.4.1 dev wlan1`), and
  `/starlink/` returned real telemetry: `state: CONNECTED`, 34ms latency,
  12.3% obstruction, and — genuinely useful — `power_w: 18.6`, a measured
  draw that directly replaces the hardcoded 22W guess in `system.py`'s
  `ALWAYS_ON_WATTS` (see the load-estimation TODO above). **Route is not yet
  persisted** — it only exists in the live kernel routing table right now and
  will not survive a reboot. The service's own docstring says to add it to
  `/etc/dhcpcd.conf`; not done yet. Reads from the dish's own unauthenticated
  gRPC server at `192.168.100.1:9200` — fully local, no internet needed.
  `services/starlink.py`, `/starlink/` and `/starlink/raw`, `StarlinkCard.tsx`.
  See `starlink-status.md`.
  - Status polls back off 5s → 10 → 20 → 40 → 60 while unreachable, resetting
    on first success, and only the first failure logs at warning. An
    unreachable dish is routine here rather than exceptional — the Pi sits on
    OHeck for days at a time — and at a flat 5s it wrote ~17k warnings a day
    into journald on an SD card.
  - `reachable` and `online` are deliberately separate. A stowed dish answers
    the API fine, and "searching for satellites" is a different problem from
    "unplugged". Note that when the Pi falls back to OHeck, it is off
    Starlink's LAN entirely, so `reachable` goes false regardless of whether
    Starlink is actually up.
  - Field names shift across firmware, so both calls merge the returned dicts
    and read by key rather than unpacking positionally. `/starlink/raw` dumps
    the whole mapping — check real names there before trusting anything.
  - **Power draw is available** (`latest_power`, via a second `history_stats`
    call, polled at 30s). This is the missing input for the `ALWAYS_ON_WATTS`
    problem below: it replaces the hardcoded `"Starlink": 22` guess with a
    real measurement. Not all terminals support it, and unsupported hardware
    returns `0.0` rather than erroring — treated as "unsupported" and reported
    as `None`.
  - GPS was removed from the local API in May 2026. `gps_ready`/`gps_sats`
    still report lock status, but coordinates are gone on Mini hardware; a USB
    dongle is the path if position is ever wanted.
- **Pi slowness while ESP32 plugged in** — likely root-caused and fixed
  2026-08-27. The ESP32's BLE scanner was at 320ms/320ms (100% duty-cycle
  active scanning, transmitting nonstop) plus `VERY_VERBOSE` logging left on
  from debugging — both plausible sources of 2.4GHz contention with the Pi's
  own BLE link to the BMS, sitting inches away in the same van. Scanner eased
  to 1100ms/30ms, logger back to sane levels. Pi's load average and response
  times looked healthy afterward; worth a longer-term check if it recurs.
- **Seven API calls per poll cycle** — `fetchAll` hits battery, mppt, shore, orion, shelly, system and mode/current separately every 5s. A `/snapshot` endpoint was considered and **rejected after measuring**: six of the seven return in ~3ms, so collapsing them saves ~18ms of round trips, while a single blocking call would make the one slow endpoint (shelly) stall the whole dashboard. `Promise.allSettled` currently isolates it. Revisit only if the fast endpoints stop being fast. **Now nine as of 2026-08-27** (ecoflow, starlink). Starlink is the second genuinely slow one — a gRPC call that can take up to 10s when the dish is unreachable — which reinforces the original decision rather than changing it.
- **Mode persistence** — done. Persisted to `backend/mode.json`, written atomically. Note this saves the _selection_ only; actually applying a mode (camera intervals, Shelly schedules) is still unimplemented.
- **Shelly latency is ~200ms and variable, and that is the floor.** The installed
  units are on TwitchWiFi (the Pi's own 2.4GHz hotspot via the onboard radio).
  Signal is strong at close range, so this is normal 2.4GHz congestion plus
  mDNS overhead (~105ms, now cached with a 300s TTL). Consecutive identical
  requests have measured 156ms to 795ms.
- **Event log** — done. `events` table written from every mutation path, read at `/system/events`. Correlating it against hourly readings is what would replace the guessed `ALWAYS_ON_WATTS` figures with measurements; that analysis is not written yet.
- **Siri / Apple Home for the Shellys** (tabled). Shelly Gen4 supports Matter natively — `Shelly.GetStatus` reports `matter: {num_fabrics: 0, commissionable: false}`, so the capability is there but nothing is commissioned. Commissioning them into the Home app is phone-side setup, no code, and would keep working even with the Pi down. Fallback if that fights: an Apple Shortcut that POSTs to `/shelly/{id}/toggle` with the API key — works for any endpoint, not just relays, but needs the phone to reach the Pi (Tailscale, currently offline on the iPhone).
- **AI insight panel** (tabled, cost). One button summarising power state by correlating the event log against hourly readings — "SOC fell 22% overnight, and you switched the garage circuit on at 19:40". Would have to be a backend endpoint so the key stays off the client. Roughly $0.001/call with Haiku, cached 15 min. Tabled because it would be the first cloud dependency in an otherwise fully local system, and it would be dead exactly when parked without Starlink.
- **Door sensor via repurposed light circuit** (planned, not built). Two factory
  industrial light fixtures (above the rear door and the side slider) are being
  removed — too bright, cab-overridable, always off in normal use. Their
  door-triggered positive wire is being reused as a door-open signal instead
  of wired to a bulb.

  **Wiring:** a spare Shelly 1 Gen4 gets a normal permanent `12V+`/`L` feed
  like the other units — it must stay always-on so it's reachable regardless
  of door state, this is not a power-the-Shelly-from-the-door circuit. The
  door-triggered wire (light fixture's old positive leg) goes into `I`. `O`
  feeds the Garmin PowerSwitch input, so the hardware-level action (still TBD
  what) happens with no Pi dependency, same as any other Shelly-fed load.
  Multimeter check pending: confirm switched-positive vs switched-ground and
  actual voltage/current before wiring — Sprinter interior lighting runs
  through the body control module, not a raw door switch, so cab override
  behavior should already be baked into the signal, but the electrical specs
  at the connector aren't yet confirmed.

  **Why this works as a door sensor with zero new code:** `van-api` already
  polls `Switch.GetStatus` on every Shelly every 5s (`shelly.py`). Door open →
  current flows I→O → relay reads `on`. Door closed → `off`. The event log
  already timestamps every Shelly state change. So "door opened at 14:32"
  appears in `/system/events` automatically, and reachability already
  distinguishes a genuine unreachable unit from "door closed" because this
  unit is never actually powered down.

  **Remaining work once wired:** label it properly in `SHELLY_UNITS`
  (`shelly.py`) rather than a generic name, and decide whether it renders as
  its own dashboard row ("Rear Door: Open") rather than a generic on/off tile,
  since the semantics differ even though the underlying mechanism is identical
  to every other Shelly-fed circuit.

- **Maxxfan will not get a Shelly** — tested and rejected. It defaults open on power loss and closes on power-up, which is exactly wrong for a switched circuit. Its remote is IR, so there is no network path either.
- **Govee H6199 rock lights** — candidate for on/off and basic colour over BLE. Protocol varies by firmware generation; older units accept unencrypted writes, newer added encryption. Needs a probe before it can be scoped.
- **EcoFlow (`EF-R10314`)** — confirmed as Todd's, seen in BLE scans at -20 to -44 dBm. Official developer API exists over HTTP and MQTT, needs an API key. Community BLE work also exists.

---

## BLE Device Reference

Devices seen on `hci0`, including ones not integrated.

| Device             | MAC                 | Adv name                 | Status                                                                                                                                                                                                                                                            |
| ------------------ | ------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Power Queen BMS    | `C8:47:80:5D:08:6F` | `P-12100BNNA70-B00793`   | Integrated                                                                                                                                                                                                                                                        |
| Victron SmartSolar | `E8:18:52:D1:81:B7` | `SmartSolar HQ2218GMEKM` | Integrated                                                                                                                                                                                                                                                        |
| Dometic CFX5 35    | `88:13:BF:8D:87:F6` | `MC1_8d87f4`             | Blocked — BlueZ incompatible                                                                                                                                                                                                                                      |
| Garmin PowerSwitch | `F0:53:20:C3:99:B4` | `PowerSwitch-99B4`       | Blocked — 4 attempts, always `le-connection-abort-by-local`, including with van-api stopped. Same BlueZ incompatibility as the Dometic, not a bonding refusal (2026-08-27). Controls Starlink and the EcoFlow charge toggle as well as lighting — see safety note |

The Dometic is a rare advertiser. Expect to wait through several scan cycles before it appears.

### BMS GATT map (undocumented until now)

Enumerated via `bluetoothctl` `list-attributes`. Three things worth knowing:

- **Standard Battery Service** at `0x180F` with Battery Level `0x2A19`. The project reads SOC exclusively via the proprietary FFE1 protocol. If `0x2A19` is populated it is a spec-compliant fallback for when the FFE1 handshake fails. Not yet tested.
- **Unused characteristics in the FFE0 service.** The code uses `FFE1`. The service also exposes `FFE2` and `FFE3`, and FFE3 carries a CCCD so it supports notify. Contents unknown.
- **Device Information service** at `0x180A` is fully populated: Manufacturer Name, Model Number, Serial Number, Hardware/Firmware/Software Revision, System ID. Cheap win for an About panel, no reverse engineering needed.

**Leave alone:** vendor service `f000ffc0-0451-4000-b000-000000000000` with `FFC1`/`FFC2`. The `0451` is Texas Instruments and this is TI's OAD (over-the-air firmware download) service. Writing here flashes BMS firmware. A malformed write could brick it beyond what a disconnect power cycle can fix.

---

## system.py load estimation — what's actually wrong

An earlier version of this section claimed the dashboard was displaying a
fabricated load figure. **That diagnosis was wrong and has been corrected.**
The full trail is in `rubber-duck-review.md`. Summary of the correction, then
the issues that are genuinely real.

### The false alarm

Symptom reported: dashboard showing 30-45W draw on a parked van with Starlink
off and the fridge off.

That number is real and measured. `BatteryCard.tsx` computes it directly from
BMS telemetry:

```ts
const drawW = Math.abs(battery.current * battery.voltage).toFixed(0);
```

45W at 13.54V is ~3.3A out of the battery, which the BMS measures directly.
When it was investigated the Garage Shelly circuit was on. Nothing in
`system.py` is involved in that display at all.

The original mistake was diagnosing from a moment when `current` was `0.0`,
inferring the `ALWAYS_ON_WATTS` fallback must be firing, and not checking that
the fallback only runs when `bms_ok` is false. The BMS was connected the whole
time.

### Genuinely real issue 1 — the loads breakdown is fiction

This loop runs unconditionally, outside any state check:

```python
for label, watts in ALWAYS_ON_WATTS.items():
    loads.append(LoadBreakdown(label=label, watts=float(watts), source="always_on"))
```

with `ALWAYS_ON_WATTS = { "Pi": 5, "Starlink": 22, "Fridge": 40 }`. Starlink and
the fridge are 62 of that 67W and neither reports its actual state, so the
breakdown claims them whether or not they're powered.

**Severity: latent, not live.** Nothing in the frontend reads `loads`,
`load_watts`, `solar_watts`, or `power_state`. The backend computes and
serialises all of it on every 5-second poll and it is discarded. Fix this
_before_ wiring up any load-breakdown panel.

### Genuinely real issue 2 — the clamp hides shore charging

```python
load_watts = round(solar_watts - battery_power_w, 1)
load_watts = max(0.0, load_watts)
```

On shore power with solar at zero and the battery taking 200W, this evaluates
to `0 - 200 = -200`, clamped to **0W**. A van that is plugged in and actively
running loads reports zero consumption. The clamp doesn't fix the arithmetic,
it conceals it.

### The structural problem underneath both

Load is derived from one equation:

```
load = solar_in - battery_flow
```

That is only solvable when solar is the _only_ charge source. Add shore or
alternator and there are two unknowns and one measurement. Shore is inferred
rather than measured precisely because there's no sensor on it.

So `load_watts` is trustworthy when the BMS is connected and solar is the only
input, which covers most real usage, and unreliable otherwise.

### Fixes, none implemented

- _Honest:_ return `None` for `load_watts` when the inputs can't support an
  answer (non-solar charge source active), and render a dash. Unknown beats wrong.
- _Minimum:_ drop Starlink and Fridge from `ALWAYS_ON_WATTS` so the breakdown
  only claims the Pi's ~5W, the one load genuinely always present.
- _Real:_ measure instead of infer. A Victron SmartShunt reports over the same
  BLE advertisement protocol the MPPT already uses, and would make load,
  runtime, and shore detection all real.

`estimated_runtime_hrs` is **not** affected — it derives from
`remainAh / abs(current)`, both measured, and is sound.

---

## Design System

Tokens live in `tailwind.config.ts` and `index.css`. Colours are semantic
(`charge.solar`, `soc.low`, `panel.surface`) and driven by CSS variables, so
light/dark is a `data-theme` swap on `:root`. No raw hex in components.

### Figma — redesign in progress, not yet built

[Van Control Panel — Dashboard UI](https://www.figma.com/design/793FjJIPcg092uFJuGnVe6/Van-Control-Panel-%E2%80%94-Dashboard-UI)

Discussed 2026-08-27. **The visual direction is a real, confirmed change** —
light background, bold saturated colour (green for good/on, orange for
off/warning), rounded corners, sans-serif. This is the actual target, not
just how the mockup happened to get styled — a genuine departure from the
dark-mode monospace terminal aesthetic currently built. Nothing has been
re-themed yet; this is direction, not a merged change.

The data underneath matches closely, which is a good sign the backend work
was aimed correctly even before the frontend catches up: Battery
(%/V/W/°F), Solar (`SOURCE`/W/state), EcoFlow (%), Starlink
(latency/bandwidth/obstruction), CFX5 (°F/running) all correspond to real
fields already live in the API.

**Confirmed architectural principle, not just for this Figma:** components
stay separate always. The design shows EcoFlow/Starlink/CFX5 sitting
visually adjacent in one "Devices" panel — that's about layout proximity
only. `EcoflowCard`, `StarlinkCard`, `FridgeCard` stay three separate
components regardless of how close together they're rendered.

**Confirmed, actionable:** the header's row of icon buttons (WiFi, Camera,
Mode, Backup, Power) is not meant to consolidate into one settings drawer
the way `SettingsDrawer.tsx` currently does — the intent is **separate
drawers**, one per concern. Not built yet.

**Still discussing, not yet actionable:**

- A third Shelly switch button in the mockup ("Door Lights" in the visible
  text, "Ceiling" as the layer name) — placeholder for now, not a confirmed
  circuit. Likely connects to the door-sensor project already in Known
  Limitations, but not confirmed.
- Network status section in the mock only shows the current network + one
  placeholder row. Real design needs figuring out what's actually available
  to display per source (Solar/Shore/Orion) before it can be finished —
  open question, not yet answered.

### Still need (mockups, not code)

- More offline-state mockups as new cards get designed. The pattern itself
  is already confirmed correct: last-known values replace the live view
  when a source goes offline, matching what's already built (`BatteryCard`,
  `FridgeCard`).
- Camera controls: the design shows five icons (two photo-library variants,
  options, a light toggle, capture) against the single on/off toggle that
  exists today. Aspirational, wanted eventually, not committed to a
  timeline.

Primitives are in `src/components/ui/`:

| Primitive        | Purpose                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------ |
| `Panel`          | Card surface. Reads `spacing` from the settings store and applies it as inline padding/gap |
| `Stack`          | Outer container. Same, but reads `gap`                                                     |
| `Label`          | Uppercase mono section label                                                               |
| `StatusDot`      | 2x2 indicator, `accent` or `success` tone. `aria-hidden`                                   |
| `SelectableTile` | Shelly toggles and mode buttons. Carries `aria-pressed`                                    |
| `Button`         | `outline` / `ghost` / `danger`, sizes `icon` / `sm` / `md`                                 |

**Spacing is user-configurable at runtime.** `gap` and `spacing` live in the
persisted settings store. `Panel` and `Stack` read them directly, which is why
cards take no `style` prop — an earlier version threaded `innerStyle` through
every card from Dashboard, and a first pass at `Panel` used hardcoded Tailwind
padding classes that inline styles would have silently overridden.

**Focus states live in the primitives.** Before these existed, no interactive
element in the app had `focus-visible` styling at all. Anything new that takes
a click should go through `Button` or `SelectableTile` rather than a bare
`<button>`, or it inherits that gap again.

**Deliberately not a component library.** No Storybook, no versioning, no docs
site. One app, one developer. Add a primitive when the same markup appears a
third time, not before.

---

## Vercel Demo Mode

Goal: deploy the dashboard to Vercel as a portfolio piece with convincing fake data, so it can be linked from a résumé without exposing the Pi or requiring Tailscale.

**Status: built and deployed.** `frontend/vercel.json` pins `VITE_DEMO=true` in
the build command so the deploy always gets mock data regardless of dashboard
env config, and adds the SPA fallback rewrite that Express normally handles on
the Pi. The Pi build never sets the flag, so `mockApi` is tree-shaken out of
that bundle entirely (verified: the mock's strings are absent from the Pi build
and present in the demo build).

**Outstanding:** the Vercel project has SSO protection enabled for all URLs
except custom domains, so the link prompts for a Vercel login. Disable it in
project settings, or attach a custom domain, before sharing.

**Why it was easy:** every component reads through the `api` object in `src/api/client.ts`. Nothing else in the app calls `fetch` directly. That single seam is the whole integration point.

**Approach:** `src/api/mock.ts` exports an object with the identical shape, and at the bottom of `client.ts`:

```ts
export const api = import.meta.env.VITE_DEMO === "true" ? mockApi : realApi;
```

Set `VITE_DEMO=true` in Vercel's environment variables. The Pi build never sets it, so production is untouched and tree-shaking drops the mock from the Pi bundle.

**Where the effort actually is:**

1. _History generation._ `RawReading`, `HourlyReading`, `DailyReading` back the Recharts components. Random numbers look obviously fake. Needs a generator modelling a solar bell curve peaking at solar noon, SOC climbing through the day and drawing down overnight, voltage tracking SOC. Roughly 60-80 lines and the bulk of the work.
2. _Mutations must feel alive._ `shelly.toggle`, `mode.set`, `battery.release`/`connect`, `orion.toggle` need module-level state that actually changes, or the demo's buttons visibly do nothing. Add small jitter to `battery.get` and `mppt.get` since `usePolling` fires every 5s and static numbers look frozen.

**Three decisions to make before building:**

- **Cameras.** `Photo` returns URLs served by Express from disk. No Express on Vercel. Either ship placeholder images in `public/` or hide the camera card when `VITE_DEMO` is set.
- **Destructive controls.** `system.shutdown` and `system.reboot` should not be live buttons on a public demo. Mock returns success without doing anything. Consider a "demo mode" badge so visitors know the state isn't real.
- **Auth.** Session-cookie auth lives in `server.mjs`, which doesn't exist on Vercel. Confirm whether the React app has any login UI of its own or whether Express handles it entirely before serving the SPA.

**Estimate:** 2-3 hours for something convincing, ~45 minutes for a crude version.

---

## Conventions

**No VE.Direct.** Early planning docs mention VE.Direct cables and the `vedirect` Python library. These were never used. All Victron data comes via BLE (`victron-ble` library). Do not suggest VE.Direct-based solutions.

**nginx is the public-facing server.** nginx listens on :80 and reverse-proxies
to Express on :3000. Express proxies `/api/*` to uvicorn on :8000. Do not
suggest bypassing nginx or having Express listen on :80 directly.

**nginx config:** `/etc/nginx/sites-enabled/van-control-panel` — proxies all
traffic to `127.0.0.1:3000` with `proxy_read_timeout 10s`. The static photos
path (`/static/photos/`) is served directly by nginx from
`/home/todd/van-control-panel/backend/photos/`.

**Commit via osascript.** Git push works via osascript using the macOS keychain credential helper. The remote is HTTPS with `git config credential.helper osxkeychain`. SSH key for GitHub is not set up on the Mac.

**Deploy workflow uses `git reset --hard`.** Not `git pull`. The Pi may have locally modified files from rsync sessions during development.

**Follow the Workflow section above.** Branch per unit of work, PR via `gh`,
the person merges — not a direct push to `main`. Superseded 2026-08-27; this
line used to say "prompt before committing, always ask before pushing,"
which described the old direct-to-`main` process. Committing to a feature
branch needs no permission each time — it's expected, reversible work. The
real gate moved to the PR/merge step.

**Push to `main` deploys to the Pi.** The self-hosted runner picks up every
push to `main` — there is no separate staging _environment_, though the
branch/PR is now effectively a staging _step_ before anything reaches the
van. Verify backend changes locally first regardless.

**Check whether duplication is real before extracting it.** Grepping for
repeated class strings found six copies of the card surface, but five of them
were one `cardClass` constant passed as a prop. Read the call sites.
