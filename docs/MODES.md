# Operating Modes — Van Control Panel


**Last updated:** 2026-10-19
Modes let you switch the van's behavior based on context — parked for storage, at a campsite, on the trail, or in town. Each mode adjusts camera capture intervals, Shelly automation, and (planned) notification behavior.

**What is live and what is intent.** The *camera interval* of the active mode is real:
`services/camera_loop.py` reads it and captures on that schedule. Everything in the
*Shellys* rows below is the intended behavior and is **not applied** by anything yet
(no schedules exist; the Shellys are toggled by hand). The flags are in `mode.py` as
data (`shellys_off`, `camera_exterior_only`).

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

**Not implemented.** A background capture loop exists (`camera_loop.py`) and runs
at the active mode's fixed interval, but nothing lengthens it in the evening. This
section describes an intended behavior, not something currently running. (See
`docs/ARCHITECTURE.md`'s Camera System section.)

---

## Switching Modes

**Via PWA dashboard:** not currently possible. `ModeSelector.tsx` exists and
is fully wired to the store, but isn't rendered in `Dashboard.tsx` right now
— no import, no `<ModeSelector />`. The only way to switch modes today is
the API below.

**Via API:** the backend listens on `127.0.0.1:8000` only, so run it on the Pi
(loopback calls need no key):
```bash
ssh todd@van-pi.local 'curl -s -X POST http://127.0.0.1:8000/mode/camp'
```

**Via Siri (Apple Home):**
Not directly available for mode switching — use the PWA dashboard or API.

---

## Current Status

Mode **selection** is persisted (`backend/mode.json`, atomic write, survives
restart and reboot). The mode's **camera interval is applied**: `camera_loop.py`
re-reads the current mode every cycle, so a switch takes effect on the next
capture (60-second floor; `camera_interval_min` is in minutes). What is not done is
anything on the Shelly side: `POST /mode/{name}` changes the label, logs the change,
and changes the camera cadence, but it does not touch a relay.

## Planned Mode Enhancements

- **Apply the Shelly side of a mode** — `shellys_off` and the schedules in this doc
  exist as config in `mode.py` but nothing acts on them. See `docs/FUTURE-FEATURES.md`
  Priority 5, including the pre-switch checklist idea
- **Render `ModeSelector`** — the component is fully built but not mounted in `Dashboard.tsx`
- **Shelly schedule push** — mode switch updates Shelly schedules via REST API automatically
- **Evening auto-extension** of the capture interval (above)
- **Notification config per mode** — storage mode sends daily SOC alert, camp mode sends low battery warning
