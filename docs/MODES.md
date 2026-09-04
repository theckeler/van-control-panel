# Operating Modes — Van Control Panel


**Last updated:** 2026-09-04
Modes let you switch the van's behavior based on context — parked for storage, at a campsite, on the trail, or in town. Each mode adjusts camera capture intervals, Shelly automation, and (planned) notification behavior.

---

## Mode Reference

### `storage`
**Use case:** Long term parking. Vehicle unattended for days or weeks.

| Setting | Value |
|---|---|
| Camera interval | 6 hours (`camera_interval_min: 360`, fixed — not a range) |
| Camera scope | Interior only — exterior camera isn't physically installed |
| Shellys | All off |
| Description | Battery preservation priority. Minimum parasitic draw. |

Best for: leaving the van at the trailhead for a multi-day trip, parking at home between adventures.

---

### `camp`
**Use case:** Active camping. Default mode for most use.

| Setting | Value |
|---|---|
| Camera interval | 30 min |
| Camera scope | Interior only — exterior camera isn't physically installed |
| Shellys | Scheduled (lights off midnight, fan off midnight, USB off 11PM) |
| Description | Normal monitoring. Automation schedules active. |

Best for: dispersed camping in the Adirondacks, Hiawatha NF, any overnight stay.

---

### `trail`
**Use case:** Van parked and unattended while you're out biking or hiking nearby. Not driving, not camping overnight.

| Setting | Value |
|---|---|
| Camera interval | 15 min |
| Camera scope | Interior only — exterior camera isn't physically installed |
| Shellys | Manual only, automation paused |
| Description | Van unattended at a trailhead or similar. Shorter camera interval than camp for a light security-watch posture while you're away from it. |

Best for: parked at the trailhead in Copper Harbor or the Adirondacks while out riding or hiking, van out of sight for an hour or more.

---

### `in_town`
**Use case:** Urban stop. Grocery run, restaurant, town errands.

| Setting | Value |
|---|---|
| Camera interval | 30 min |
| Camera scope | Interior only — exterior camera isn't physically installed |
| Shellys | Manual control |
| Description | Full connectivity. Cooler monitoring. Starlink typically running. |

Best for: in town stops where the van is parked on a street, cooler needs to stay cold, and you want to check in remotely.

---

## Evening Auto-Extension

**Not implemented.** There's no capture script or timer of any kind right
now — every photo is captured on-demand, at request time (see
`docs/ARCHITECTURE.md`'s Camera System section). This section describes an
intended behavior for whenever a real capture loop gets built, not
something currently running.

---

## Switching Modes

**Via PWA dashboard:** not currently possible. `ModeSelector.tsx` exists and
is fully wired to the store, but isn't rendered in `Dashboard.tsx` right now
— no import, no `<ModeSelector />`. The only way to switch modes today is
the API below.

**Via API:**
```bash
curl -X POST http://van-pi.local:8000/mode/camp
```

**Via Siri (Apple Home):**
Not directly available for mode switching — use the PWA dashboard or API.

---

## Current Status

Mode **selection** is persisted (`backend/mode.json`, atomic write, survives
restart and reboot) — this part is done, not planned. What's not done is
mode *application*: nothing today reads the saved mode to actually change
camera intervals or Shelly behavior. `POST /mode/{name}` just switches the
label and logs the change.

## Planned Mode Enhancements

- **Make the mode selection actually do something** — the values in this doc
  (camera interval, Shelly scope) exist as config in `mode.py` but aren't
  applied anywhere yet. See `docs/FUTURE-FEATURES.md` Priority 5
- **Systemd timer integration** — mode switch automatically restarts camera capture timer with new interval (there's no capture timer at all today — every photo is captured on-demand, see `docs/ARCHITECTURE.md`'s Camera System section)
- **Shelly schedule push** — mode switch updates Shelly schedules via REST API automatically
- **Notification config per mode** — storage mode sends daily SOC alert, camp mode sends low battery warning
