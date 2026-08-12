# API Reference — Van Control Panel

Base URL: `http://van-pi.local:8000` (local) or `http://{tailscale-ip}:8000` (remote)

All endpoints return JSON. All responses use snake_case field names.

---

## Battery

### `GET /battery/`
Current Power Queen BMS state via Bluetooth.

**Response:**
```json
{
  "soc": 78.5,
  "voltage": 13.2,
  "current": -4.2,
  "temperature": 22.1,
  "cell_voltages": [3.30, 3.30, 3.29, 3.31],
  "cycle_count": 42,
  "status": "normal",
  "connected": true
}
```

| Field | Type | Notes |
|---|---|---|
| `soc` | float | State of charge % |
| `current` | float | Positive = charging, negative = discharging |
| `connected` | bool | BLE connection status |

### `GET /battery/history?hours=24`
SOC history for trend chart. Returns last N hours of logged data.

---

## MPPT

### `GET /mppt/`
Victron SmartSolar MPPT 75/15 via VE.Direct.

**Response:**
```json
{
  "panel_voltage": 18.4,
  "panel_power": 42.0,
  "battery_voltage": 13.2,
  "battery_current": 3.1,
  "charge_state": "Float",
  "daily_yield": 210.0,
  "total_yield": 1842.5,
  "max_power_today": 158.0,
  "error_code": 0,
  "connected": true
}
```

| Field | Notes |
|---|---|
| `charge_state` | Off / Bulk / Absorption / Float / Equalize |
| `daily_yield` | Wh harvested today |
| `total_yield` | kWh lifetime |
| `error_code` | 0 = no error |

### `GET /mppt/history?days=7`
Daily yield history for bar chart.

---

## Shore Power

### `GET /shore/`
Victron Blue Smart IP22 12/15 via VE.Direct.

**Response:**
```json
{
  "connected": false,
  "charge_mode": "Off",
  "battery_voltage": 0.0,
  "charge_current": 0.0,
  "error_code": 0
}
```

| Field | Notes |
|---|---|
| `charge_mode` | Bulk / Absorption / Float / Storage / Off |
| `connected` | false when AC cord unplugged |

---

## DC-DC / Orion-Tr

### `GET /orion/`
Orion-Tr 12/12-18 static config (non-smart unit).

**Response:**
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
Toggle Orion-Tr display state manually.

> **Note:** When upgraded to Orion XS 50A, this endpoint will return live VE.Direct data and `enabled` will reflect actual operation state.

---

## Shelly

### `GET /shelly/`
All Shelly unit states.

**Response:**
```json
[
  { "id": "maxxfan",  "label": "Maxxfan",        "on": true,  "ip": "192.168.1.101" },
  { "id": "lights",   "label": "Ceiling Lights",  "on": false, "ip": "192.168.1.102" },
  { "id": "usb",      "label": "USB Outlets",     "on": true,  "ip": "192.168.1.103" },
  { "id": "spare",    "label": "Spare",           "on": false, "ip": "192.168.1.104" }
]
```

### `GET /shelly/{unit_id}`
Single unit state. Valid IDs: `maxxfan`, `lights`, `usb`, `spare`.

### `POST /shelly/{unit_id}/toggle`
Toggle a unit on or off.

**Body:**
```json
{ "on": true }
```

**Response:**
```json
{ "unit_id": "maxxfan", "on": true }
```

---

## Camera

### `GET /photos/latest?cam=interior`
Most recent photo for a camera.

**Params:** `cam` = `interior` | `exterior`

**Response:**
```json
{
  "filename": "interior_2026-08-11T14-30-00.jpg",
  "url": "/static/photos/interior/interior_2026-08-11T14-30-00.jpg",
  "timestamp": "2026-08-11T14-30-00"
}
```

### `GET /photos/recent?cam=interior&limit=20`
Recent photos for swipe gallery, most recent first.

**Response:** Array of photo objects (same schema as latest).

### `POST /photos/capture?cam=exterior`
Trigger an on-demand photo capture.

---

## Mode

### `GET /mode/current`
Current active mode and config.

**Response:**
```json
{
  "current": "camp",
  "config": {
    "label": "Camp",
    "camera_interval_min": 30,
    "camera_exterior_only": false,
    "shellys_off": false,
    "description": "Default active use mode. Shelly schedules active."
  },
  "available": ["storage", "camp", "trail", "in_town"]
}
```

### `POST /mode/{mode_name}`
Switch active mode. Valid names: `storage`, `camp`, `trail`, `in_town`.

**Response:** Same as `GET /mode/current` with updated values.

---

## System

### `GET /system/`
Aggregated system overview.

**Response:**
```json
{
  "net_power_w": -32.5,
  "estimated_runtime_hrs": 18.2,
  "charge_sources_active": ["solar"],
  "mode": "camp"
}
```

| Field | Notes |
|---|---|
| `net_power_w` | Positive = net charging, negative = net draw |
| `estimated_runtime_hrs` | Based on current SOC and draw rate. null if charging |
| `charge_sources_active` | Which sources are currently contributing |

---

## Health

### `GET /health`
Basic health check.

**Response:**
```json
{ "status": "ok" }
```

---

## Static Files

Photos are served directly via static mount:

```
GET /static/photos/interior/{filename}
GET /static/photos/exterior/{filename}
```

No auth required. Files are JPEGs named `{camera}_{ISO8601}.jpg`.
