# Operating Modes — Van Control Panel


**Last updated:** 2026-08-13
Modes let you switch the van's behavior based on context — parked for storage, at a campsite, on the trail, or in town. Each mode adjusts camera capture intervals, Shelly automation, and (planned) notification behavior.

---

## Mode Reference

### `storage`
**Use case:** Long term parking. Vehicle unattended for days or weeks.

| Setting | Value |
|---|---|
| Camera interval | 4-6 hours |
| Camera scope | Both cameras |
| Shellys | All off |
| Description | Battery preservation priority. Minimum parasitic draw. |

Best for: leaving the van at the trailhead for a multi-day trip, parking at home between adventures.

---

### `camp`
**Use case:** Active camping. Default mode for most use.

| Setting | Value |
|---|---|
| Camera interval | 30 min |
| Camera scope | Both cameras |
| Shellys | Scheduled (lights off midnight, fan off midnight, USB off 11PM) |
| Description | Normal monitoring. Automation schedules active. |

Best for: dispersed camping in the Adirondacks, Hiawatha NF, any overnight stay.

---

### `trail`
**Use case:** Van parked and unattended while you're out biking or hiking nearby. Not driving, not camping overnight.

| Setting | Value |
|---|---|
| Camera interval | 15 min |
| Camera scope | Both cameras |
| Shellys | Manual only, automation paused |
| Description | Van unattended at a trailhead or similar. Shorter camera interval than camp for a light security-watch posture while you're away from it. |

Best for: parked at the trailhead in Copper Harbor or the Adirondacks while out riding or hiking, van out of sight for an hour or more.

---

### `in_town`
**Use case:** Urban stop. Grocery run, restaurant, town errands.

| Setting | Value |
|---|---|
| Camera interval | 30 min |
| Camera scope | Both cameras |
| Shellys | Manual control |
| Description | Full connectivity. Cooler monitoring. Starlink typically running. |

Best for: in town stops where the van is parked on a street, cooler needs to stay cold, and you want to check in remotely.

---

## Evening Auto-Extension

Regardless of active mode, camera capture interval automatically extends to **2 hours** between 22:00 and 06:00. This reduces SD card write cycles overnight when nothing is changing inside or outside the van.

Implemented in the capture script, not via mode config.

---

## Switching Modes

**Via PWA dashboard:**
Tap the mode selector on the main dashboard. The active mode shows an orange border and icon.

**Via API:**
```bash
curl -X POST http://van-pi.local:8000/mode/camp
```

**Via Siri (Apple Home):**
Not directly available for mode switching — use the PWA dashboard or API.

---

## Planned Mode Enhancements

- **Persist mode across Pi reboots** — currently resets to `camp` on restart. Fix: write to SQLite or JSON on Pi
- **Systemd timer integration** — mode switch automatically restarts camera capture timer with new interval
- **Shelly schedule push** — mode switch updates Shelly schedules via REST API automatically
- **Notification config per mode** — storage mode sends daily SOC alert, camp mode sends low battery warning
