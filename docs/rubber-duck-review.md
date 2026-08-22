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
