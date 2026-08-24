# Future Features

This roadmap captures the next useful improvements for the Van Control Panel.
The focus is reliability, visibility, and recoverable automation rather than
adding hardware faster than the system can safely support it.

## Guiding Principle

Every automated action should have a visible reason, a verified result, and a
way to recover from failure.

## Priority 1: Harden the Existing System

These changes should come before adding more control surfaces or integrations.

- Make authentication fail closed in production when `VAN_PASSWORD`,
  `VAN_SESSION_SECRET`, or `VAN_API_KEY` is missing.
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

The current modes are persisted and displayed, but they do not yet drive the
system. Implement them incrementally:

- **Storage:** reduce camera activity and turn off selected nonessential loads.
- **Camp:** normal monitoring and manual relay control.
- **Trail:** security-focused monitoring and scheduled captures.
- **In Town:** full connectivity and monitoring behavior.

The UI should show exactly what a mode changed and provide temporary overrides
without silently rewriting the selected mode.

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

- an ESP32 bridge for Dometic CFX5 monitoring;
- actual shore-power detection;
- smart Orion charger telemetry after a hardware upgrade;
- camera capture and retention policies;
- door, hatch, motion, or cabinet-temperature sensors; and
- a physical local emergency control independent of the web UI.

## Suggested Sequence

1. Harden authentication and hardware response verification.
2. Add tests and simulated hardware failures.
3. Add alerts and event history.
4. Implement operating-mode actions.
5. Improve power history and diagnostics.
6. Add new hardware integrations.
