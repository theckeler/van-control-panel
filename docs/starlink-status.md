# Starlink Mini — Local Status on the Dashboard


**Last updated:** 2026-08-27
**Status:** implemented, not yet tested against the dish.

`backend/app/services/starlink.py`, `/starlink/` and `/starlink/raw`,
`StarlinkCard.tsx`. Nothing here has touched real hardware — the static route
below is a prerequisite and is not in place yet.

**Goal:** a connection indicator on the control panel, plus the cheap extras
that come in the same call — latency, throughput, obstruction, uptime.

---

## The short answer

Yes, and it is one of the easier integrations in this project. The dish runs an
unauthenticated gRPC server locally, on the dish hardware itself, at
`192.168.100.1:9200`. It works with no internet connection and no Starlink
account — which is exactly the property this van needs, since the most useful
time to know Starlink's state is when it is *not* working.

The Mini is architecturally the same as other terminals from the API's point
of view. Its integrated router is a software layer on the same hardware; the
dish endpoint is unchanged.

There is one setup gotcha that will otherwise waste an evening — see the static
route below.

---

## The gotcha: the dish is not reachable by default

The dish lives on `192.168.100.x`, a separate subnet from the van LAN. **The
Mini's integrated router does not route its own LAN clients to the dish
subnet by default.** It knows the route; it just doesn't advertise it over
DHCP.

So `192.168.100.1` is unreachable from the Pi until a static route is added.
This is not a Mini quirk to work around — it is normal, and every Starlink
integration hits it.

```bash
# Immediate — does not survive reboot
sudo ip route add 192.168.100.0/24 via 192.168.4.1 dev wlan0

# Verify before going any further
ping -c3 192.168.100.1
```

**`192.168.4.1`, not `192.168.1.1`.** Starlink was renumbered off
`192.168.1.0/24` in Aug 2026 because both routers were handing out the same
range — see the Subnets table in `CLAUDE.md`. And `wlan0`, not `eth0`: the Pi
joins Starlink over WiFi.

Make it persistent in `/etc/dhcpcd.conf` on Raspberry Pi OS:

```
interface wlan0
static_routes=192.168.100.0/24 via 192.168.4.1
```

**Verify the route works before writing any code.** If `ping` fails, nothing
downstream will work, and the failure will present as a generic gRPC
`UNAVAILABLE` that looks like a library problem rather than a routing one.

### The dual-network consequence

This is worth thinking through before trusting the card.

The Pi drops to the OHeck home network when Starlink fails, and
NetworkManager **does not roam back** on its own — that's a documented gotcha
in `CLAUDE.md`, patched by the `90-prefer-starlink` dispatcher script.

While the Pi is on OHeck it is not on Starlink's LAN at all, so the dish is
unreachable regardless of whether Starlink itself is working. The card will
correctly show "Offline / Dish unreachable".

So `reachable = false` means **"the Pi cannot see the dish"**, which is not the
same statement as "Starlink is down". When parked on home WiFi with Starlink
stowed, that's the expected and honest reading. The `state` field is the one
that tells you about Starlink; `reachable` tells you about the network path.

If the Mini is ever moved to bypass mode behind a third-party router, the route
moves to that router instead.

---

## What you get

One call to `status_data()` returns everything below. This is the
"connected plus the cheap extras" scope — all of it arrives in a single RPC, so
there is no reason to fetch a subset.

### Connection state

`state` is the dashboard indicator. Values:

| Value | Meaning |
|---|---|
| `CONNECTED` | Online and passing traffic |
| `SEARCHING` | Looking for a satellite |
| `OBSTRUCTED` | Signal blocked |
| `BOOTING` | Starting up |
| `STOWED` | Physically stowed |
| `THERMAL_SHUTDOWN` | Shut down on temperature |
| `NO_SATS` | No satellites available |
| `NO_DOWNLINK` | Downlink lost |
| `NO_PINGS` | Connected but PoP not responding |
| `UNKNOWN` | Indeterminate |

Note that `STOWED` is a normal, successful response — the API answers fine
while stowed. That makes it a clean, unambiguous state rather than something to
infer from a timeout.

### The extras, same call

| Field | Notes |
|---|---|
| `pop_ping_latency_ms` | RTT to the Starlink PoP |
| `pop_ping_drop_rate` | 0.0–1.0 |
| `downlink_throughput_bps` / `uplink_throughput_bps` | Current, not a limit |
| `fraction_obstructed` | 0.0–1.0 of sky view |
| `currently_obstructed` | Boolean |
| `obstruction_duration` / `obstruction_interval` | Avg duration and gap, seconds |
| `uptime` | Seconds since boot |
| `hardware_version` / `software_version` | Useful when a firmware update changes behaviour |
| `is_snr_above_noise_floor` | Boolean |
| `direction_azimuth` / `direction_elevation` | Dish pointing |
| `gps_ready` / `gps_sats` | GPS *lock state*, not coordinates — see below |

Alerts arrive as booleans in the same call. The ones worth surfacing for a van:
`alert_thermal_throttle`, `alert_thermal_shutdown`, `alert_motors_stuck`,
`alert_roaming`, `alert_dish_water_detected`.

**Obsolete fields — do not wire these up.** `snr`, `seconds_obstructed`, and
the twelve `wedges_fraction_obstructed` entries all return `None` on current
firmware. They appear in older examples and blog posts.

### The bonus worth having: power draw

Power is **not** in `status_data()`. It comes from a second call,
`history_stats()`, which returns `latest_power`, `mean_power`, `min_power`,
`max_power` and `total_energy` in watts and kWh.

This is more interesting for this project than it first looks. `CLAUDE.md`
records that the `loads` breakdown in `system.py` is unconditional and claims a
flat "Starlink 22W" regardless of actual state. Real wattage from the dish
would replace a guessed constant with a measurement — and the Mini's draw
varies substantially between searching, connected and idle, so the guess is
probably wrong in both directions at different times.

Caveat: not all terminal hardware supports it, and unsupported hardware returns
`0.0` rather than an error. Confirm it reports non-zero on this Mini before
building anything on it.

---

## GPS is gone — plan around it

The local API's `get_location` endpoint was removed by Starlink in **May 2026**
and is gone on Mini and V4 hardware. `gps_ready` and `gps_sats` still report
lock *status*, but coordinates are no longer available to LAN clients.

For a van dashboard that is a genuine loss, and it is worth knowing now rather
than discovering it mid-implementation. If position is wanted later, a USB GPS
dongle on the Pi is the path, not the dish.

---

## Implementation notes

### Library

`sparky8512/starlink-grpc-tools`, published as `starlink-grpc-core`. It is
actively maintained, explicitly supports the Mini and current firmware, and
`starlink_grpc.py` is documented as the one module in that project with a
stable interface intended for import by other code.

```bash
pip install starlink-grpc-core "grpcio>=1.46" "yagrc>=1.1.3" typing-extensions
```

`grpcio>=1.46` matters on a Pi — that is the floor for prebuilt `aarch64`
wheels, below which pip will try to compile it. Native pip install is the
recommended path on ARM; the project's Docker images do not officially support
it.

### Do not vendor `.proto` files

The library resolves the protobuf schema at runtime via gRPC reflection. This
is deliberate and correct: Starlink firmware updates change the schema, and
vendored compiled stubs break when they do. It also means the first call after
startup costs an extra ~0.5–2s while the schema is fetched.

Warm that up in the FastAPI `lifespan` startup so the first dashboard load
doesn't pay for it.

### The async problem — this one matters

`starlink_grpc.py` uses **blocking** gRPC calls, not `grpc.aio`. Calling it
directly from an `async def` endpoint will block the entire uvicorn event loop
for the duration — typically 30–150ms, but **up to 10 seconds** on the
hardcoded `REQUEST_TIMEOUT` when the dish is unreachable.

A van whose dish is stowed or unplugged is a normal state, not an edge case, so
this would stall the whole dashboard regularly.

Wrap it in a dedicated single-thread executor. The gRPC channel is not
thread-safe, so confine all Starlink work to one thread and reuse one
`ChannelContext` for the process lifetime.

### Fitting the existing polling model

`CLAUDE.md` records that `/snapshot` was considered and **rejected after
measuring**: six of seven endpoints return in ~3ms, and collapsing them would
let the one slow endpoint stall everything. `Promise.allSettled` in `fetchAll`
isolates the slow one instead.

Starlink is a second slow endpoint by that standard. That does not change the
conclusion — it reinforces it. Keep it as its own endpoint and let
`allSettled` isolate it, exactly like Shelly.

Cadence, as implemented:

- `status_data()` every 5s while healthy, matching the dashboard poll. It is a
  single lightweight RPC; the official app polls at about 1s.
- `history_stats()` for power every 30s. It is a second RPC and only
  `latest_power` is wanted. Skipped entirely while status is failing, rather
  than attempted and failed alongside it.

### Backoff: an unreachable dish is routine, not exceptional

This is the bit that matters in a van, and it isn't obvious until you think
about how often the failure actually fires.

The Pi drops to the home network whenever Starlink goes down, and
NetworkManager does not roam back on its own. While it is there the dish is
unreachable **by definition** — so "cannot reach the dish" is a normal
operating state that can persist for days, not a rare error.

Polling every 5s through that writes roughly **17,000 warnings a day into
journald, on an SD card**. So status polls back off:

```
5s → 10 → 20 → 40 → 60, then hold at 60 while failing
```

and reset to 5s on the first success. Recovery is therefore detected within a
minute, which is fine — an unreachable dish is not something needing sub-minute
notification, and the most common cause is already visible on the card.

Logging follows the same principle. Only the **first** failure in a run logs at
warning; subsequent ones drop to debug, because a known state being re-observed
is not news. Recovery logs once at info with the failure count — that's the
line actually worth reading in `journalctl`.

Note the loop tracks elapsed time rather than counting ticks. Once backoff
engages, ticks stop being 5s apart, so tick-count arithmetic would drift.

### Telling failure modes apart

Worth handling distinctly, because they mean different things to someone
looking at the dashboard:

- **`grpc.RpcError` / `UNAVAILABLE`** — cannot reach the dish. Missing static
  route, dish unplugged, or Ethernet down. Not a Starlink outage.
- **`state == "SEARCHING"` / `"OBSTRUCTED"`** — dish is fine and talking to us,
  but has no service. This is the interesting case for a van.
- **`state == "STOWED"`** — deliberately packed up.

Collapsing these into a single "offline" boolean would throw away the most
useful distinction the API offers. The dashboard should show the state string,
not just a green or red dot.

---

## Suggested shape

Follows the existing service/router split, same as `shelly.py`:

- `backend/app/services/starlink.py` — the channel context, the thread
  executor, `status_data()` and `history_stats()` wrappers, a cached last-known
  reading with a staleness property, matching the pattern in `ecoflow_ble.py`
- `backend/app/routers/starlink.py` — thin router, small pydantic model,
  mounted at `/starlink`
- Register in `main.py` alongside the existing routers
- A `StarlinkCard` on the frontend showing state prominently, with latency,
  throughput and obstruction as secondary detail

Keeping the last good reading and exposing staleness — rather than blanking the
card on one failed poll — matches how the rest of the dashboard already behaves
and is specifically called out as desirable in the 2026-08-24 review.

---

## Open questions

- Does the static route actually work through the Mini's integrated router?
  Verified as the standard approach, but not tested on this hardware. `ping`
  settles it in seconds and everything else depends on it.
- Does this Mini report non-zero `latest_power`? If yes, it replaces the
  guessed 22W constant in `system.py`.
- Is 5s polling comfortable in practice, or does the dish deprioritise frequent
  local requests? Nothing suggests it does, but worth watching once running.
- Is 60s the right backoff ceiling? It's a guess, tuned for log volume rather
  than measured against anything. If Starlink recovery feels sluggish on the
  dashboard, lower `MAX_BACKOFF`; if journald is still noisy, raise it.

## Note on deploying this

Pushing to `main` **is** deploying — a self-hosted Actions runner on the Pi
picks up `backend/**` and `frontend/**` changes, pip installs, and restarts
`van-api` (see the CI/CD section in `CLAUDE.md`).

That means merging this before the static route exists puts a failing poll loop
on the live Pi. Do the route first, confirm `ping 192.168.100.1`, then merge.

Note also that `pip install -r requirements.txt` adds the gRPC dependencies but
reverting the commit will **not** remove them — pip does not uninstall on
rollback. Harmless, but they stay in the venv.
