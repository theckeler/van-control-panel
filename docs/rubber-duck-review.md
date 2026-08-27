# Rubber Duck Review — BLE Service Code Audit

A code review session conducted after the BLE stack stabilised. Named after rubber duck debugging — the practice of explaining your code out loud (to a duck, a colleague, or an AI) to surface issues that aren't visible when you're heads-down writing.

Reviewed files: `battery_ble.py`, `victron_ble.py`, `ble_orchestrator.py`, `system.py`, `main.py`

---

## Issues Found and Fixed

### 1. Dead code in `battery_ble.py`

**Problem:** `subprocess` import and `_reset_ble_adapter()` function were left in after the adapter-reset approach was abandoned. Dead code adds noise and confusion for anyone reading the project.

**Fix:** Removed `import subprocess` and the `_reset_ble_adapter` function entirely.

---

### 2. No startup delay in `battery_ble.run()`

**Problem:** When `van-api` restarts, BlueZ still has a lingering connection attempt from the previous session. The BMS service immediately tried to connect, hitting `[org.bluez.Error.InProgress] Operation already in progress` on every restart and spending 5 minutes waiting before its first real attempt.

**Fix:** Added a 5-second startup delay at the top of `run()`:
```python
await asyncio.sleep(STARTUP_DELAY)  # let BlueZ clear previous session
```

---

### 3. Incomplete reads not breaking the connection loop

**Problem:** If the BMS drops the connection mid-transfer, `_read()` waits out its 8-second timeout and returns a short bytearray. The outer `while client.is_connected` loop doesn't detect this quickly — `client.is_connected` from bleak reflects the BlueZ event, which may not propagate immediately. The loop could spin on failed reads for 30-second intervals before exiting.

**Fix:** Check the byte count after every read and break immediately on short responses:
```python
if len(batt_data) < MIN_BYTES:
    logger.warning("BMS: incomplete read (%d bytes) — disconnecting", len(batt_data))
    break
```

---

### 4. `_parse_and_cache` declared as `async` with no awaits

**Problem:** The function was declared `async def` but contained no `await` expressions. Calling it with `await` worked but was misleading — it implied async I/O that wasn't there.

**Fix:** Changed to a regular `def` function.

---

### 5. `asyncio.gather(return_exceptions=True)` silently swallowing task deaths

**Problem:** In `ble_orchestrator.py`, `asyncio.gather` with `return_exceptions=True` means if either the Victron loop or BMS service crashes with an unhandled exception, the exception is returned as a result value rather than raised. Nothing logged it, nothing restarted it — the service would silently stop working.

**Fix:** Check gather results and log any exceptions explicitly:
```python
results = await asyncio.gather(_victron_loop(), battery_ble.run(), return_exceptions=True)
for i, result in enumerate(results):
    if isinstance(result, Exception):
        logger.error("BLE task '%s' exited with error: %s", names[i], result)
```

---

### 6. `system.py` load estimate broken when BMS offline

**Problem:** When the BMS is offline, `bms_current_a` is 0. The load formula `load_watts = solar_watts - battery_power_w` becomes `solar_watts - 0 = solar_watts`. At night with no solar input, this returns 0W load — which is wrong, the van is still consuming power.

**Fix:** Fall back to the sum of always-on baseline loads when BMS data is unavailable:
```python
if bms_ok:
    load_watts = max(0.0, round(solar_watts - battery_power_w, 1))
else:
    load_watts = float(sum(ALWAYS_ON_WATTS.values()))  # ~67W baseline
```

---

## Issues Noted, Not Yet Fixed

**CORS wildcard** — `allow_origins=["*"]` in `main.py` is fine for local development but should be tightened if Tailscale Funnel is used to expose the dashboard publicly. Low priority while access is Tailscale-only.

**No orchestrator restart on task death** — if both BLE tasks die, the orchestrator exits and nothing restarts them until `van-api` is restarted. A production-grade fix would add a watchdog, but given the 5-minute BMS cooldown and reliable Victron scanning this hasn't been a practical issue.

**Shelly loads in system breakdown always shown** — the load breakdown lists USB outlets regardless of whether they're actually on, since we removed the live Shelly state check (it was causing 5-second response times). Acceptable for now; SQLite logging will eventually let us track actual Shelly state over time.

---

## Background: The BMS Lockout Incident

During development, the Power Queen BMS was put into a persistent non-responsive state. Root cause: approximately 20-30 rapid `van-api` restarts during debugging, each triggering a BLE connection attempt with a 15-20 second retry interval. The BMS firmware has a protection mechanism that stops responding to devices that hammer it with repeated rapid connections.

Symptoms: BMS advertises over BLE normally, accepts TCP-level BLE connections, but returns no data in response to commands.

Fix: physical power cycle of the BMS (flip the Nilight 50A house main disconnect off for 30 seconds).

Prevention: the 5-minute `RECONNECT_IN = 300` constant in `battery_ble.py`.

Key learning: BLE devices often have firmware-level rate limiting on connection attempts. Rapid reconnect loops during development can trigger lockout states that require hardware intervention to clear. Always test reconnection logic with generous backoff intervals from the start.

---

# Rubber Duck Review — BMS Reconnect Behaviour (Aug 2026)

A second session, prompted by a ~53 minute `hcidump -X` capture that ran accidentally in the background during an unrelated debugging session. The capture is 78,801 lines and contains the BMS reconnect cycle in full.

This entry is written as a correction record as much as a review. Two confident claims made during analysis turned out to be wrong, and the proposed fix that followed from them would have made things worse. Both are documented below, because the reasoning errors are more reusable than the conclusion.

---

## What the capture actually shows

| Metric | Value |
|---|---|
| Total lines | 78,801 |
| LE advertising reports | 8,937 |
| Scan cycles (enable/disable pairs) | 264 |
| Active scans, no accept-list filter | 249 |
| Passive scans, accept-list only | 15 |
| `LE Create Connection` commands | 15, all to `C8:47:80:5D:08:6F` |
| Failed with 0x3e | 14 |
| Succeeded | 1 |
| Successful `Handle notify` reads | 216 |

All 14 failures cluster between lines 2753 and 3459. The successful connection lands at ~3495, and the resulting session runs to the end of the file with reads distributed evenly across every 10k-line bucket.

**The BMS self-healed.** It failed for a short burst, connected, and then held a stable persistent connection for roughly 45 minutes.


---

## Correction 1 — "The BMS was locked out for the whole session"

**The claim:** 15 of 15 connection attempts failed, therefore the BMS was in the documented firmware lockout state for the entire capture.

**Why it was wrong:** The failures were counted without checking where they sat in the file. They are all in a 700-line window near the start. Everything after line 3495 is a healthy connection producing 216 successful reads.

**Why the error happened:** The 0x3e error signature matched the lockout story already written in `TROUBLESHOOTING.md`, so the search stopped at the first hypothesis that fit. The existing documentation acted as a confirmation bias amplifier rather than a reference.

**Lesson:** When a log matches a known failure mode, check the *end* of the log before concluding the failure persisted. Grep for line numbers, not just counts.

---

## Correction 2 — "15 attempts over 53 minutes proves the 300s guard is working"

**The claim:** `RECONNECT_IN = 300` predicts ~10-11 attempts per 53 minutes; 15 observed is close enough, so the guard is functioning.

**Why it was wrong:** Unit mismatch. `LE Create Connection` is an HCI-layer event. `RECONNECT_IN` gates the Python layer, one `async with BleakClient(...)` per cycle. BlueZ can fan a single Python-level connect request into multiple HCI-level attempts across the `CONNECT_TIMEOUT = 25` window. So 14 HCI failures may represent 2 Python attempts or 14, and the capture cannot distinguish them.

**Supporting observation:** At the measured advertisement rate (~840 lines/minute), the 700-line failure cluster spans well under a minute. That is not consistent with 300 second pacing. The estimate is soft, but it points away from the guard doing what was assumed.

**Root obstacle:** `hcidump` was run without `-t`, so there are no timestamps anywhere in the file. Every timing conclusion is inferred from line density.

**Lesson:** Always run `hcidump -t -X`. A capture without timestamps cannot answer the question that matters most.


---

## The rejected proposal: exponential backoff

The suggestion was to add a consecutive-failure counter to `battery_ble.py`, double the reconnect delay on each failure up to a `RECONNECT_MAX = 3600` ceiling, and reset the counter on a successful read.

It was rejected for three reasons.

**It targets the wrong layer.** If BMS firmware rate limiting is triggered by raw connection attempts, backoff at the Python layer does not control HCI-level fan-out. `CONNECT_TIMEOUT` is the more direct lever: a shorter timeout produces fewer HCI attempts per Python cycle.

**It would have hurt in the only case with data.** Observed behaviour recovered on roughly the first or second cycle. With backoff after 14 consecutive failures, the next attempt would have been pushed to 40 or 60 minutes, converting a self-healing blip into an hour without battery data.

**The reset condition is unreachable.** "Reset the counter on success" only fires after a successful read, which is precisely what the backoff delays. A flapping connection that succeeds once then drops also resets the counter immediately, so the backoff never engages in the case it was designed for.

---

## Hypothesis raised and discarded: scan contention from debugging tools

It was briefly suspected that a backgrounded `hcitool lescan` plus repeated `bluetoothctl` scans were competing with bleak's connection attempts for the single-antenna CYW43455 radio.

Discarded on the numbers. 249 active scans over ~53 minutes is about 2 scan toggles per 30 second cycle, which matches `victron_ble.poll_once` called by the orchestrator almost exactly. That scanning is van-api's own and is present on every normal day of operation. The debugging tools added noise but were not the dominant scanner.

Separately worth noting: `hcidump` itself is a passive HCI sniffer. It does not enable scanning, hold the radio, or open connections. Leaving it running in the background caused no harm.

---

## Open question, not yet answered

Does `RECONNECT_IN = 300` actually pace connection attempts at the radio, or does BlueZ fan each Python cycle out into a burst?

To settle it:

```bash
sudo hcidump -t -X > /tmp/ble_timed.log
```

Let it run ~20 minutes under normal van-api operation, then compare timestamps on consecutive `LE Create Connection` lines.

- **300 seconds apart** — the guard works, no change needed.
- **A few seconds apart, in bursts** — the fix is `CONNECT_TIMEOUT`, not backoff.

Until that is measured, the correct action is to change nothing. The failure was transient, recovery was automatic, and the Release/Connect button already covers the genuine lockout case.

---

## Unrelated finding from the same capture: the Dometic CFX5

Across 8,937 advertising reports and 249 unfiltered active scans, the fridge (`MC1_8d87f4`) never appeared once. Devices that did appear, with report counts: KS03-3926A9 (340), Govee_H6199_388A (218), Aqa (44), PLAF108 (38), PowerSwitch-99B4 (25), EF-R10314 (16), SmartSolar HQ2218GMEKM (6), Govee_H5074_35C8 (6), DA1 (1).

The Victron only advertised 6 times in the whole window, so the capture was catching even very infrequent advertisers. The fridge was genuinely not broadcasting.

Most likely explanation: BLE peripherals stop advertising while connected, and an iOS device can hold or re-establish a link even with the app swiped away. Next attempt should toggle Bluetooth fully off on the phone before scanning, not just close the apps.

---

# Dometic CFX5 35 / Garmin PowerSwitch — BLE Investigation (Aug 2026)

A long session attempting to reach two non-integrated devices from the Pi over BLE. Neither succeeded. The root cause is documented below and it is not fixable on the Pi as currently built.

---

## Device identification (confirmed)

| Device | MAC | Advertised name | Notes |
|---|---|---|---|
| Dometic CFX5 35 | `88:13:BF:8D:87:F6` | `MC1_8d87f4` | Public OUI address, stable. Rare advertiser. |
| Garmin PowerSwitch | `F0:53:20:C3:99:B4` | `PowerSwitch-99B4` | RSSI -18 to -38. Constant advertiser. |

Dometic GATT (from iOS BLE explorer, phone side):
- Service `537A0400-0995-481F-926C-1604E23FD515` (vendor specific, 1 service reported)
- Characteristic `537A0401-0995-481F-926C-1604E23FD515` — **write only**, explicitly does not support reading

Garmin advertising data:
- Service UUID `0000fe1f` (Garmin)
- Manufacturer ID `0x0087` (Garmin)

---

## The failure

Every connection attempt from the Pi, to both devices, produced the same result:

```
[CHG] Device <mac> Connected: yes
Failed to connect: org.bluez.Error.Failed le-connection-abort-by-local
[CHG] Device <mac> Connected: no
```

The link establishes, then the local side aborts during service discovery.

Variables eliminated by testing:
- **Scan contention** — same failure with `scan off`
- **BMS holding the radio** — same failure with `van-api` stopped and the BMS GATT tree fully torn down
- **Device not advertising** — both devices confirmed present and connectable (`ADV_IND`) immediately prior
- **Cache expiry** — distinguishable, produces `not available` instead
- **Weak signal** — PowerSwitch at -18 dBm failed identically to devices at -70

---

## Root cause

A sibling project, `prebsit/dometic-fjx7-ha` (Dometic FreshJet FJX7 rooftop AC), documents this exact behaviour. The FJX7's Microchip BLE module requires encrypted Just Works bonding and does not return ATT Write Responses to BlueZ. Every Linux BLE implementation fails on it. The author tested a Pi's onboard radio and a TP-Link UB500 dongle across multiple BlueZ versions with identical results. Apple's CoreBluetooth absorbs the quirk silently, so macOS and iOS work fine. Espressif's ESP-IDF/NimBLE stack also handles it correctly.

This matches observed behaviour exactly: an iPhone BLE explorer connected to the fridge and enumerated its service without difficulty, while the Pi failed on every attempt under every condition.

**Caveat:** the FJX7 is a different product. It is not confirmed that the CFX5 uses the same Microchip module. Same manufacturer, same era, exact symptom match — strong circumstantial evidence, not proof.

**Conclusion: BlueZ cannot talk to this device. A second Bluetooth adapter will not help, because the incompatibility is in the host stack, not the radio.**

---

## Path forward: ESP32 BLE bridge

The working implementations both avoid Linux entirely:

- **ESPHome external component** for Dometic CFX fridges over BLE using the native ESP-IDF BLE stack. Confirmed to exist, targets CFX3/CFX5.
- **HACS Python integration** for Dometic CFX cool boxes (~185 stars, actively maintained). Runs under Home Assistant, which on a Pi would hit the same BlueZ wall — useful as a protocol reference rather than something to run directly.

Proposed architecture, which fits existing project patterns:

```
ESP32 (ESPHome + dometic_cfx_ble) --BLE--> CFX5
        |
      WiFi/HTTP
        |
     van-api  <-- polls like it already polls Shellys
```

This also sidesteps the single-radio constraint for the PowerSwitch, and gives a general-purpose BLE bridge for any future device the Pi can't reach.

**Do not pursue:** `keshavdv/dometic-cfx3`. Its README is unmodified cookiecutter boilerplate (`BaseClass`, `base_function`). Scaffold only, likely abandoned.

---

## Garmin PowerSwitch — separate blocker

Failed with both `connect` and `pair`, the latter returning `org.bluez.Error.ConnectionAttemptFailed`. Likely bonded to a Garmin head unit or the Garmin Drive app and refusing additional centrals. Protocol is proprietary with no public implementation found. Lower priority than the fridge and no clear path without a phone-side packet capture.

> **Corrected 2026-08-27 — see `rubber-duck-review-2026-08-27.md`.** The
> "refusing additional centrals" explanation above is almost certainly wrong.
> Garmin documents that the PowerSwitch supports up to four simultaneous
> controllers, and `le-connection-abort-by-local` is a local host-stack abort,
> not a peripheral rejection. This is the same BlueZ incompatibility already
> established for the Dometic, which means an ESP32 has a real chance of
> connecting. The protocol being undocumented remains true and is now the
> actual blocker.

**Safety note for any future work:** the PowerSwitch controls the 52" light bar, KC SlimLite pair, and RGB rock lights. Enumeration and reads are safe. Blind writes to unknown characteristics can energise real exterior circuits and must be done deliberately with the lights in view.

> **Corrected 2026-08-27.** That circuit list is incomplete in a way that
> understates the risk. The PowerSwitch also controls **Starlink** and the
> **EcoFlow charge toggle**. A blind write can therefore cut the van's
> internet — and with it Tailscale, the dashboard, and any remote path back
> in. Write experiments must be done in person, at the vehicle, never
> remotely.

---

## Correction to the earlier rubber duck entry

The previous entry concluded the fridge "was genuinely not broadcasting." That was too strong. It advertises, just rarely — it appeared once in a ~50 minute capture and once more during a later scan. The correct statement is that it is a very infrequent advertiser, not a silent one.
