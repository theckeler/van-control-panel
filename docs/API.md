# API Reference — Van Control Panel

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

When offline, `connected` is false but last known values are still returned so the UI can show "last seen X min ago".

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
  "mppt_connected": true
}
```

| Field | Notes |
|---|---|
| `net_power_w` | Positive = charging battery, negative = discharging |
| `load_watts` | Estimated total consumption. Falls back to 67W baseline when BMS offline |
| `power_state` | `charging` / `discharging` / `standby` (±5W dead band) |
| `estimated_runtime_hrs` | Null when charging or BMS offline |
| `time_to_full_hrs` | Null when discharging or BMS offline |
| `loads` | Breakdown by source: `always_on` (Pi/Starlink/Fridge), `estimated` (Shelly-controlled), `measured` (solar) |

---

## Shelly

### `GET /shelly/`
All Shelly unit states including planned (not yet installed) units.

```json
[
  { "id": "usb",     "label": "USB Outlets",   "on": false, "ip": "shelly1g4-d885acec6aac.local", "installed": true },
  { "id": "garage",  "label": "Garage",        "on": false, "ip": "shelly1g4-d885acf36a28.local", "installed": true },
  { "id": "maxxfan", "label": "Maxxfan",       "on": false, "ip": null, "installed": false },
  { "id": "lights",  "label": "Ceiling Lights","on": false, "ip": null, "installed": false }
]
```

### `GET /shelly/{unit_id}`
Single unit. Valid IDs: `usb`, `garage`, `maxxfan`, `lights`.

### `POST /shelly/{unit_id}/toggle`
Toggle relay. Returns 503 if unit is not installed.

```json
{ "on": true }
```

---

## Shore Power

### `GET /shore/`
Always returns disconnected — no VE.Direct cable installed.

```json
{ "connected": false, "charge_mode": "Off", "battery_voltage": 0.0, "charge_current": 0.0, "error_code": 0 }
```

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
Switch mode. Resets to `camp` on Pi restart (persistence not yet implemented).

---

## Camera

### `GET /photos/latest?cam=interior`
### `GET /photos/recent?cam=interior&limit=20`
Camera system not yet implemented — returns 404. Awaiting USB webcam hardware.

---

## Health

### `GET /health`
```json
{ "status": "ok" }
```

Used by the CI/CD deploy workflow health check after service restart.
