# Future Features


**Last updated:** 2026-09-04
This roadmap captures the next useful improvements for the Van Control Panel.
The focus is reliability, visibility, and recoverable automation rather than
adding hardware faster than the system can safely support it.

## Guiding Principle

Every automated action should have a visible reason, a verified result, and a
way to recover from failure.

## Priority 1: Harden the Existing System

These changes should come before adding more control surfaces or integrations.

- Make authentication fail closed in production when `VAN_PASSWORD`,
  `VAN_SESSION_SECRET`, or `VAN_API_KEY` is missing. **Note the direct
  contradiction with `CLAUDE.md`'s Auth section**, which documents the
  current fail-open behavior as *deliberate*: "an unset key fails open so a
  bad deploy cannot lock you out of the van." Same tradeoff for
  `VAN_PASSWORD`. This needs an actual decision, not just a code change —
  fail-closed is more secure but risks locking out the only person who can
  fix it, on a system that's sometimes unattended in the woods.
- Keep any local-development authentication bypass behind an explicit setting.
- Verify Shelly HTTP response status before reporting a relay operation as
  successful.
- Bound history, event, and photo query parameters with FastAPI validation.
- Make the supported public deployment path unambiguous. Nginx should not
  bypass the authentication behavior provided by the Node server.
- Restrict CORS to known dashboard origins, or remove it if direct browser
  access to uvicorn is not supported.
- Add reproducible frontend linting and backend test execution.

## Priority 2: Add Confidence Through Tests

Start with tests around behavior that can affect hardware or hide a failure.

- Authentication with configured and missing secrets.
- Shelly success, device-side HTTP errors, timeouts, and unreachable devices.
- Query bounds for history, events, and photos.
- Mode persistence, invalid modes, and startup recovery.
- BLE release and reconnect transitions.
- Database rollup boundaries, retention, and pruning.
- Frontend store behavior when individual polling requests fail.

A simulated hardware mode should make these tests repeatable without needing
the Pi or physical devices connected.

## Priority 3: Alerts and Event History

The dashboard should answer what happened while nobody was watching it.

Useful alerts include:

- low battery state of charge;
- high battery temperature;
- BMS or MPPT offline;
- unexpected relay state;
- WiFi or network changes;
- Pi overheating, undervoltage, low memory, or low disk space; and
- failed hardware commands.

Record disconnects, reconnects, failed commands, automatic actions, mode
changes, reboots, and authentication failures in the event timeline. Events
should distinguish user actions from automatic system actions.

For remote notifications, a simple provider such as ntfy or Pushover is a good
fit for a local-first system. Notifications should be rate-limited and should
not become a new source of repeated noise during an outage.

## Priority 4: Safer Relay Automation

- Add per-relay schedules.
- Add automatic shutoff timers and maximum-on durations.
- Provide an explicit “turn off nonessential loads” action.
- Confirm high-impact or high-draw operations.
- Verify relay state after every command.
- Preserve a manual override when automation is active.

Automation should record which rule caused a change and should fail safe when
the device cannot be reached.

### Timed Relay Shutoff

Add a clock action to each installed relay. Clicking it opens a modal with
presets such as 5 minutes, 10 minutes, 30 minutes, and 1 hour, plus an optional
custom duration. Choosing a duration turns the relay on and displays a
countdown on the relay tile. A normal click turns the relay off early and
cancels the timer.

The timer should be owned by the backend rather than only by the browser. The
frontend should request a timed action and display the expiration returned by
the Pi. The backend should:

1. Turn the relay on and verify the Shelly response.
2. Persist the expiration timestamp.
3. Turn the relay off when the deadline arrives.
4. Verify that the relay actually turned off.
5. Restore or complete expired timers after a Pi restart.
6. Report unreachable or failed shutoffs as visible errors.

This avoids leaving a circuit on when the phone loses connectivity, the browser
tab closes, or the page is refreshed. The API should also support replacing an
active timer, cancelling a timer while leaving the relay on, and turning the
relay off immediately. Every timed action and expiry failure should be written
to the event log with its source and result.

## Priority 5: Make Operating Modes Real

The current mode *selection* is persisted (`backend/mode.json`), but it
isn't displayed anywhere in the UI right now — `ModeSelector.tsx` is fully
built and store-wired but not rendered in `Dashboard.tsx` — and it doesn't
drive the system either. Implement incrementally:

- **Storage:** reduce camera activity and turn off selected nonessential loads.
- **Camp:** normal monitoring and manual relay control.
- **Trail:** security-focused monitoring and scheduled captures.
- **In Town:** full connectivity and monitoring behavior.

The UI should show exactly what a mode changed and provide temporary overrides
without silently rewriting the selected mode.

### Pre-switch checklist (discussed 2026-09-04, not built)

A gate, not just a reminder: switching into a mode with a configured
checklist opens a modal with checkboxes (reuse `<Modal>`), and the actual
`POST /mode/{name}` only fires once every item is checked. Nothing
persisted — the checked state resets every time the modal opens, it's a
one-time gate per switch, not a to-do list.

Born from real mistakes: things left on the roof, gear left on the ground
near the van, the rear window left open — each learned the hard way, per
Todd.

**Which modes get one is genuinely mode-dependent, decided by whether that
mode has a config entry, not hardcoded to a fixed set.** At minimum
`trail` and `storage` (leaving the van unattended for a while), but also
`in_town` — a 30 min–2 hr lunch/sightseeing stop turns out to carry the
same "about to walk away" risk as trail does. `camp` is the one mode
where you're not going anywhere, so it's the natural default to leave
without an entry.

Config: a plain JSON file (sibling to `mode.json`, not `.env` — not a
secret, but still hand-edited directly on the Pi, no admin UI for
managing entries), keyed by target mode:

```json
{
  "trail":   ["Chair put away", "Check ground around van for left items", "Check roof/tires for things placed on top", "Rear window closed"],
  "storage": ["Chair put away", "Check ground around van for left items", "Check roof/tires for things placed on top", "Rear window closed"],
  "in_town": ["Chair put away", "Check ground around van for left items", "Rear window closed"]
}
```

A mode with no key (or an empty list) skips the checklist entirely — purely
config-driven, no code change needed to add/remove which modes gate on one.

Depends on the "wire `ModeSelector` back into `Dashboard.tsx`" prerequisite
above — same piece of work, not worth splitting into two passes.

## Priority 6: Improve Power History and Diagnostics

- Graph net battery power over time.
- Compare solar production with estimated consumption.
- Show daily and weekly energy totals.
- Show minimum SOC and time spent below configured thresholds.
- Overlay relay state changes on power charts.
- Visually distinguish measured values from estimates.
- Show the age of every device reading and make stale data unmistakable.

Add a diagnostics view with BLE state, last successful reads, reconnect timers,
WiFi details, Pi health, service status, and a way to copy a diagnostic report.

## Priority 7: Offline Operation and Recovery

- Cache the last known dashboard state locally.
- Keep the dashboard useful during short Pi or network outages.
- Show per-device stale and unavailable states instead of treating old values
  as current.
- Display the last successful backup and alert when backups have not succeeded
  for several days.
- Verify that downloaded backups can be opened.
- Document and periodically test database restoration.
- Add a deployment smoke test after Pi updates.

## Later Hardware Integrations

Once the existing control paths are hardened, consider:

- ~~an ESP32 bridge for Dometic CFX5 monitoring~~ — done, live since
  2026-08-27 (`services/dometic.py`, `/dometic/`, `FridgeCard.tsx`). Writing
  to the fridge (set temp, on/off) is not built yet — the fork supports it,
  deliberately not added while the BLE connection was still proving out
- shore-power detection beyond the current BMS/MPPT delta inference (see
  `docs/API.md`'s Shore Power section) — real VE.Direct telemetry needs a cable
- smart Orion charger telemetry after a hardware upgrade;
- camera capture and retention policies — there's no capture loop or
  retention policy of any kind yet, every photo is on-demand and
  `backend/photos/` grows unpruned;
- door, hatch, motion, or cabinet-temperature sensors; and
- a physical local emergency control independent of the web UI.

## Suggested Sequence

1. Harden authentication and hardware response verification.
2. Add tests and simulated hardware failures.
3. Add alerts and event history.
4. Implement operating-mode actions.
5. Improve power history and diagnostics.
6. Add new hardware integrations.
