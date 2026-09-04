# API Reference — Van Control Panel


**Last updated:** 2026-09-04
Base URL (local): `http://van-pi.local/api`
Base URL (Tailscale): `http://van-pi.tailba93b9.ts.net/api`

All endpoints return JSON with snake_case fields. The Express frontend server at port 80 proxies `/api/*` to uvicorn at port 8000. You can also hit uvicorn directly at `:8000` without the `/api` prefix.

Interactive docs: `http://van-pi.local/api/docs` (FastAPI Swagger UI)

---

## Battery

### `GET /battery/`
Current Power Queen BMS state. Returns last known values when BLE is offline.

```json
{
  "soc": 99.0,
  "voltage": 13.316,
  "current": 0.0,
  "temperature": 22.0,
  "cell_voltages": [3.329, 3.329, 3.329, 3.329],
  "cycle_count": 4,
  "status": "Standby",
  "connected": true,
  "last_seen": "2026-08-22T06:44:00+00:00",
  "retry_in": null
}
```

| Field | Type | Notes |
|---|---|---|
| `soc` | float | State of charge % |
| `voltage` | float | Pack voltage V (from mV, divided by 1000) |
| `current` | float | Positive = charging, negative = discharging |
| `connected` | bool | True if last read within 120 seconds |
| `last_seen` | string \| null | ISO8601 UTC of last successful BLE read |
| `retry_in` | int \| null | Seconds until next reconnect attempt. null when connected |
| `released` | bool | True while manually released for the Power Queen app — see below |

When offline, `connected` is false but last known values are still returned so the UI can show "last seen X min ago".

### `POST /battery/release`
Drop the BLE connection so the Power Queen mobile app can connect. Logs a `bms` event.

### `POST /battery/connect`
Resume the BLE connection immediately, skipping the reconnect cooldown. Logs a `bms` event.

### `GET /battery/history/raw?hours=24`
Raw readings from the last N hours from SQLite.

### `GET /battery/history/hourly?days=7`
Hourly avg/min/max aggregates for the last N days.

### `GET /battery/history/daily?days=30`
Daily summaries for the last N days. Includes `min_soc`, `peak_solar`, `total_yield`.

### `GET /battery/history/monthly`
All monthly summaries. Grows indefinitely, never pruned.

---

## MPPT

### `GET /mppt/`
Victron SmartSolar MPPT 75/15 via BLE passive scan.

```json
{
  "panel_voltage": 0.0,
  "panel_power": 45.2,
  "battery_voltage": 13.29,
  "battery_current": 3.4,
  "charge_state": "BULK",
  "daily_yield": 150.0,
  "total_yield": 0.0,
  "max_power_today": 0.0,
  "error_code": 0,
  "connected": true
}
```

| Field | Notes |
|---|---|
| `panel_voltage` | Always 0.0 — not available via BLE advertisement |
| `panel_power` | Solar input watts |
| `charge_state` | OFF / BULK / ABSORPTION / FLOAT / EQUALIZE |
| `daily_yield` | Wh harvested today. Resets at midnight |
| `total_yield` | Always 0.0 — not available via BLE advertisement |
| `connected` | True if last scan within 120 seconds |

### `GET /mppt/history/raw?hours=24`
### `GET /mppt/history/hourly?days=7`
### `GET /mppt/history/daily?days=30`
### `GET /mppt/history/monthly`
Same structure as battery history. Daily rows include `total_yield` (Wh captured from last MPPT reading of the day).

---

## System

### `GET /system/`
Aggregated overview with real math from BMS + MPPT.

```json
{
  "net_power_w": -32.5,
  "solar_watts": 12.0,
  "load_watts": 67.0,
  "load_is_estimate": false,
  "power_state": "discharging",
  "soc": 99.0,
  "voltage": 13.316,
  "remaining_ah": 101.07,
  "estimated_runtime_hrs": 18.2,
  "time_to_full_hrs": null,
  "charge_sources_active": ["solar"],
  "loads": [
    { "label": "Pi",        "watts": 5.0,  "source": "always_on" },
    { "label": "Starlink",  "watts": 22.0, "source": "always_on" },
    { "label": "Fridge",    "watts": 40.0, "source": "always_on" },
    { "label": "USB Outlets","watts": 20.0, "source": "estimated" }
  ],
  "mode": "camp",
  "daily_yield_wh": 150.0,
  "bms_connected": true,
  "mppt_connected": true,
  "ssid": "Sir Salettelot",
  "band": "5GHz",
  "wifi_signal_dbm": -53,
  "wifi_ip": "192.168.4.54",
  "eth0_connected": false
}
```

| Field | Notes |
|---|---|
| `net_power_w` | Positive = charging battery, negative = discharging |
| `load_watts` | `null` when unknowable — the load equation only solves when solar is the *only* charge source active |
| `load_is_estimate` | True when falling back to a static `ALWAYS_ON_WATTS` guess instead of a real measurement |
| `power_state` | `charging` / `discharging` / `standby` (±5W dead band) |
| `estimated_runtime_hrs` | Null when charging or BMS offline |
| `time_to_full_hrs` | Null when discharging or BMS offline |
| `loads` | Breakdown by source: `always_on` (Pi/Starlink/Fridge), `estimated` (Shelly-controlled), `measured` (solar) |
| `ssid`/`band`/`wifi_signal_dbm`/`wifi_ip` | Uplink (`wlan1`) WiFi status, null when unassociated |
| `eth0_connected` | True when the wired rescue port has a cable plugged in and linked |

### `GET /system/health-detail`
Pi vitals: CPU temp, load average (1/5 min), memory, disk, uptime, undervoltage/throttle flags. Cached 10s.

### `GET /system/wifi`
Uplink (`wlan1`) association detail: SSID, band, signal, bitrate, TX retries, IP. Cached 15s. (Separate from — and more detailed than — the WiFi fields folded into `GET /system/`.)

### `GET /system/wifi/profiles`
Known NetworkManager WiFi profiles and which one is currently active on `wlan1`.

### `POST /system/wifi/switch/{name}`
Bring up a known profile by name (e.g. switching from Starlink to OHeck manually). Pauses the `90-prefer-starlink` dispatcher for 30 minutes so the manual choice isn't immediately reverted.

### `GET /system/wifi/hotspot`
TwitchWiFi (`wlan0`) hotspot status — active state and broadcast SSID.

### `POST /system/wifi/hotspot/{state}`
`{state}` is `on` or `off`. Turning it off drops any client currently connected over TwitchWiFi, including a phone viewing the dashboard that way.

### `GET /system/events`
Query params: `hours` (default 168), `kind`, `limit` (default 500). Every state change — toggles, mode changes, reboots, BMS release/reconnect — written from each mutation path.

### `GET /system/backup`
Download a gzipped snapshot of `van_power.db`. Fetched as a blob so the request carries the session cookie.

### `GET /system/backup/status`
DB size, row counts, when the nightly backup timer last fired, how many snapshots are stuck pending on the Pi (Mac was asleep).

### `POST /system/shutdown`
### `POST /system/reboot`
Trigger a Pi shutdown/reboot. Paired with `GET /health` on the frontend to detect the Pi going down and coming back.

---

## Shelly

### `GET /shelly/`
All Shelly unit states including planned (not yet installed) units.

```json
[
  { "id": "usb",        "label": "USB Outlets", "on": false, "ip": "shelly1g4-d885acec6aac.local", "installed": true, "reachable": true },
  { "id": "garage",     "label": "Garage",      "on": false, "ip": "shelly1g4-d885acf36a28.local", "installed": true, "reachable": true },
  { "id": "ps-input-1", "label": "PS Input 1",  "on": false, "ip": "shelly1g4-98a31677ca34.local", "installed": true, "reachable": true },
  { "id": "ps-input-2", "label": "PS Input 2",  "on": false, "ip": "shelly1g4-48f6eed0a89c.local", "installed": true, "reachable": true }
]
```

`reachable` is distinct from `on: false` — a unit that can't be reached
(network split, moved networks) reports `reachable: false` rather than
silently looking identical to a switched-off circuit.

### `GET /shelly/{unit_id}`
Single unit. Valid IDs: `usb`, `garage`, `ps-input-1`, `ps-input-2` — see
`SHELLY_UNITS` in `shelly.py`. All four are currently `installed: true`.

### `POST /shelly/{unit_id}/toggle`
Toggle relay. Body: `{ "on": true }`. Returns 503 if the unit isn't installed
or can't be reached on the network.

```json
{ "unit_id": "usb", "on": true }
```

---

## Shore Power

### `GET /shore/`
No VE.Direct cable — inferred from the delta between BMS current and MPPT
current. If the BMS is charging faster than solar alone can account for
(above a 1.0A noise threshold), shore is assumed active.

```json
{ "connected": true, "charge_mode": "Bulk", "battery_voltage": 13.29, "charge_current": 4.2, "error_code": 0, "inferred": true }
```

`inferred` is always `true` today — there's no direct shore-charger
telemetry, only this delta calculation. Less accurate than VE.Direct would
be; upgrade path is adding a VE.Direct cable for the IP22 charger.

---

## DC-DC / Orion-Tr

### `GET /orion/`
Static config — current unit is non-smart (no VE.Direct port).

```json
{
  "enabled": false,
  "input_voltage_min": 8.0,
  "input_voltage_max": 17.0,
  "output_voltage": 13.6,
  "max_current": 18.0,
  "max_power": 220.0,
  "note": "Non-smart unit. Static config. Upgrade to Orion XS 50A for live data."
}
```

### `POST /orion/toggle?enabled=true`
Manual display toggle only — does not control the physical unit.

---

## Mode

### `GET /mode/current`
```json
{
  "current": "camp",
  "config": {
    "label": "Camp",
    "camera_interval_min": 30,
    "camera_exterior_only": false,
    "shellys_off": false,
    "description": "Default active use mode."
  },
  "available": ["storage", "camp", "trail", "in_town"]
}
```

### `POST /mode/{mode_name}`
Switch mode. Persisted to `backend/mode.json` (atomic write, survives
restart) — but only the *selection* persists. Nothing yet reads the saved
mode to actually change camera intervals or Shelly behavior; see
`docs/FUTURE-FEATURES.md` Priority 5.

---

## Camera

Only `cam=interior` has real hardware behind it (`/dev/video0`); `exterior`
is wired up in the same code path but 503s with "exterior camera not
connected" since there's no camera installed for it yet.

### `GET /photos/latest?cam=interior`
Captures a **fresh photo on every call** — there's no background capture
loop, so this isn't serving a cached/recent file.

```json
{ "filename": "interior_20260904T120000Z.jpg", "url": "/static/photos/interior/interior_20260904T120000Z.jpg", "cam": "interior", "timestamp": "2026-09-04T12:00:00+00:00" }
```

### `GET /photos/recent?cam=interior&limit=20`
List of previously-captured photos for that camera, most recent first (does not trigger a new capture).

### `POST /photos/capture?cam=interior`
Same as `/photos/latest` — a fresh on-demand capture. Undocumented until now; exists for triggering a capture from something other than the gallery view (e.g. a Shelly motion event).

---

## EcoFlow

### `GET /ecoflow/`
EcoFlow River 2 Max battery %, decoded from an unencrypted byte in its BLE advertisement — not an official API, and only battery percentage is available this way (no charge/discharge watts).

```json
{ "battery_percent": 87, "serial": "R331...", "connected": true }
```

---

## Starlink

### `GET /starlink/`
Read from the dish's own local gRPC server at `192.168.100.1:9200` — no cloud, no account, no internet required.

```json
{
  "reachable": true, "online": true, "state": "CONNECTED",
  "uptime_s": 12345, "latency_ms": 34.0, "ping_drop_rate": 0.001,
  "downlink_bps": 5.0e7, "uplink_bps": 1.2e7,
  "fraction_obstructed": 0.02, "currently_obstructed": false,
  "power_w": 18.6, "alerts": [],
  "hardware_version": "rev3_prod", "software_version": "...", "error": null
}
```

`reachable` and `online` mean different things: `reachable: false` means the
Pi can't talk to the dish at all (unplugged, or the static route to
`192.168.100.0/24` is missing). `online: false` with `reachable: true` means
the dish is fine but has no service (searching/obstructed/stowed) — check
`state`, not just these two booleans.

### `GET /starlink/raw`
Every field from the last successful poll, unmodelled. Field names shift
across firmware — check here before trusting anything not in `StarlinkData`.

---

## Dometic Fridge

### `GET /dometic/`
CFX535 state via the ESP32 BLE bridge's local JSON API.

```json
{ "temp_f": 37.4, "set_temp_f": 37.0, "battery_voltage": 12.8, "cooler_on": true, "door_open": false, "power_source": "battery", "reachable": true, "last_seen": "2026-09-04T12:00:00+00:00" }
```

`reachable: false` means the ESP32 itself didn't answer — it doesn't
distinguish that from "ESP32 is up but hasn't rebonded to the fridge yet."

---

## WiFi

### `GET /system/wifi/scan`
Triggers a real rescan on the uplink interface (`wlan1`) — `sudo nmcli
device wifi rescan`, a ~4s wait, then reads the result — rather than trusting
NM's own background scan cache, which decays hard while already associated
to a strong signal (`wpa_supplicant`'s `bgscan` interval stretches to 24
hours once the current link is above -70dBm). A full blocking `--rescan yes`
would take ~10s and exceed the nginx proxy timeout; splitting it into an
async rescan request plus a short wait keeps the whole call under that.

```json
[
  { "ssid": "Sir Salettelot", "bssid": "72:52:A8:29:1D:7C", "band": "2.4GHz", "signal": 97, "security": "WPA2" },
  { "ssid": "OHeck",          "bssid": "...", "band": "5GHz", "signal": 61, "security": "WPA2" }
]
```

Sorted by signal descending. Hidden networks (`--` SSID) and the Pi's own
TwitchWiFi hotspot (visible to `wlan1` since both radios share one box) are
excluded. The same SSID broadcasting on two bands is kept as two separate
entries (not deduplicated away) — `bssid` lets the caller target a specific
band on connect, which matters for networks like OHeck that broadcast both.

### `POST /system/wifi/connect`
Connect `wlan1` to a new network, creating an nmcli profile for it.

```json
{ "ssid": "CoffeeShop", "password": "hunter2" }
```

Returns:

```json
{ "ok": true,  "message": "Device 'wlan1' successfully activated..." }
{ "ok": false, "message": "Error: No network with SSID 'CoffeeShop' found." }
```

Connecting drops the Pi's LAN address for the new network's subnet. Tailscale
survives the switch. On the LAN you may need to rejoin the new network to
continue reaching the dashboard.

Writes an override file (`/tmp/prefer-starlink.override`) to pause the
`90-prefer-starlink` dispatcher for 30 minutes, so a manual network choice
isn't immediately undone.

The created/updated profile gets `connection.autoconnect-priority=75` —
below Starlink (100), above the fixed OHeck fallback (50). This is the
actual mechanism behind "reconnect somewhere already visited": there's no
separate history list, just NetworkManager's own priority-ordered
autoconnect picking this profile back up if it's ever in range again while
`wlan1` is disconnected.

---

## Disk Image

### `POST /system/disk-image/start`
Start creating a gzipped SD card image. Returns immediately; creation runs in the background (~45 min for a 29GB card).

```json
{ "ok": true, "message": "started" }
{ "ok": false, "message": "image creation already in progress" }
```

State resets on van-api restart. If a restart occurs mid-image, `sudo pkill -f "dd if=/dev/mmcblk0"` on the Pi cleans up the process.

### `GET /system/disk-image/status`
Poll progress while creation is running.

```json
{ "state": "running", "bytes_written": 524288000, "filename": null, "error": null }
{ "state": "done",    "bytes_written": 1610612736, "filename": "van-pi-2026-08-30.img.gz", "error": null }
{ "state": "error",   "bytes_written": null, "filename": null, "error": "dd exited with code 1" }
{ "state": null,      "bytes_written": null, "filename": null, "error": null }
```

| Field | Notes |
|---|---|
| `state` | `null` = never started, `running`, `done`, `error` |
| `bytes_written` | Compressed output file size on the Pi (grows during creation) |
| `filename` | Set when done, e.g. `van-pi-2026-08-30.img.gz` |

### `GET /system/disk-image/download`
Download the completed image. Returns 404 if state is not `done`. File is deleted from the Pi after transfer. Use with Balena Etcher or `gunzip -c van-pi-*.img.gz | sudo dd of=/dev/diskN bs=4M`.

### `DELETE /system/disk-image`
Cancel an in-progress image creation or delete a completed image file.

```json
{ "ok": true }
```

---

## Health

### `GET /health`
```json
{ "status": "ok" }
```

Used by the CI/CD deploy workflow health check after service restart.
