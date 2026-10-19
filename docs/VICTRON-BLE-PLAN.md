# Victron BLE on the Pi: MPPT, IP22, Orion XS

Status: proposal, not started
Drafted: 2026-09-30
Scope: `backend/` (services and routers), `.env`, docs. No frontend changes needed for the first pass.

## 1. Goal and decisions

**Goal:** every Victron device is read by the Pi over BLE instant readout, so the dashboard shows real values instead of inferred or static ones.

**Decisions already made**

- No VE.Direct cables.
- No additional ESP32.
- The Dometic ESP32 stays dedicated to the fridge. Its bond lives in NVS and is lost on a reflash, and adding Victron to it would put a working bridge at risk.
- The Pi's existing BLE approach (passive advertisement scanning with the `victron-ble` library) is extended, not replaced.

**Why not the ESP for Victron:** the community ESPHome Victron component (`Fabian-Schmidt/esphome-victron_ble`) listed Smart Solar and DC/DC converters as supported, and listed the AC charger, Blue Smart chargers, and Orion XS as unsupported or not yet supported when this was drafted. Re-check its README if this decision is ever revisited. The Pi's library already has parsers for the IP22 and Orion XS.

## 2. Current state (read from the code)

| Device | Model | Today |
| --- | --- | --- |
| Solar | SmartSolar MPPT 75/15 | Real data. `services/victron_ble.py` does a one-shot BLE scan every 30s (10s timeout), cache goes stale after 120s. Logged to SQLite every 30s by `data_logger.py` |
| Shore charger | Blue Smart IP22 12/15 | Not read. `routers/shore.py` infers it from BMS current minus MPPT current with a 1.0A threshold, and sets `inferred=True` |
| DC-DC charger | Orion-Tr 12/12-18 (non-smart) | Static values in `routers/orion.py`. The Alternator row in `ChargeSourcesCard.tsx` is commented out |
| DC-DC upgrade | Orion XS 50A (planned spring) | Not installed |

**Known problems with inference:** float stage draws under 1A, so the dashboard says "Unplugged" while the charger is plugged in and happily floating. Any other current source that raises BMS current also looks like shore.

**Docs mismatch to fix:** `HARDWARE.md` has a "VE.Direct Connections" section listing USB cables for the MPPT and IP22. The code does not use them and none are planned. Correct that section as part of this work.

## 3. What I verified

From the `victron-ble` package installed in `backend/.venv`:

- `AcCharger` (used for Blue Smart chargers) exposes charge state, charger error, output voltage, output current, temperature, and AC input current. Victron's own IP22 manual lists output voltage, output current, charge stage, and warning and error notifications for instant readout. Treat AC input current as unconfirmed until you see it populated from your own unit.
- `OrionXS` exposes charge state, error, input and output voltage, input and output current, and an "off reason". Its source says the record format was reverse engineered and is not documented by Victron. Treat it as experimental.
- The library does its own per-MAC key lookup, but our `_OneShotScanner.callback` overrides that and parses every Victron advertisement as the MPPT, with no address check. It works today only because nothing else nearby advertises.

From Victron's IP22 manual and Home Assistant's Victron integration docs:

- IP22 instant readout needs firmware v3.61 or newer and is disabled by default. Enable it in VictronConnect.
- A phone connected to a Victron device through VictronConnect stops its advertisements.
- Home Assistant lists the IP22 as supported and Orion XS as not yet supported, which matches the caution above.

**One design consequence:** the IP22 is powered from AC. When shore power is unplugged it goes silent, and that is normal, not a fault.

## 4. Design

### 4.1 Device registry in `victron_ble.py`

Replace the single hardcoded MPPT with a small registry. Each entry has a name, a lowercase MAC, a key, a parser class, a callback that updates that device's cache, and a staleness limit.

```python
@dataclass
class VictronDevice:
    name: str            # "mppt", "ip22", "orion"
    mac: str             # lowercase
    key: str
    parser: type         # SolarCharger, AcCharger, OrionXS
    on_data: Callable    # updates that device's cache
    stale_after: int     # seconds
```

The scanner callback routes by address and ignores anything it does not know:

```python
def callback(self, ble_device, data, advertisement):
    dev = self._devices.get(ble_device.address.lower())
    if dev is None or dev.name in self._seen:
        return
    try:
        dev.on_data(dev.parser(dev.key).parse(data))
    except Exception as exc:
        logger.warning("%s: failed to parse advertisement: %s", dev.name, exc)
        return
    self._seen.add(dev.name)
    if len(self._seen) == len(self._devices):
        self._loop.call_soon_threadsafe(self._event.set)
```

Devices with an empty key or MAC are not registered, so the feature is off by default and the service behaves exactly as it does today until configured.

### 4.2 Scan window

The current scan ends on the first MPPT advertisement, typically about a second. A multi-device scan that waits for "everyone" would sit out the full timeout every cycle whenever the IP22 is unplugged and silent, which is most of the time on the road.

Rule: **never wait on a device that may legitimately be absent.** Use a fixed short window (`SCAN_WINDOW = 5` seconds) that ends early once every registered device has reported. Devices that did not report are logged at debug level only. Before tuning, measure the real advertisement interval of each device, since the window has to be comfortably longer than that.

Keep the 30s cycle. The BMS connection, the EcoFlow poll, and the lockout protections (`RECONNECT_IN = 300`) are untouched, and no new BLE connections are opened, only passive scanning on the same adapter.

### 4.3 Staleness

| Device | Stale after | Meaning of stale |
| --- | --- | --- |
| MPPT | 120s (unchanged) | Fault or out of range |
| IP22 | 90s (three missed cycles) | Usually shore unplugged, occasionally a missed scan |
| Orion XS | 120s (decide with real hardware) | Usually the unit is asleep or unpowered |

### 4.4 Shore decision table (`routers/shore.py`)

| IP22 configured | IP22 fresh | Result |
| --- | --- | --- |
| No | n/a | Inference exactly as today, `inferred=True` |
| Yes | Yes | Real values. `connected=True` (charger is powered, so shore is present), `charge_mode` from the charge state (Bulk, Absorption, Float, Off), `battery_voltage` from output voltage, `charge_current` from output current, `error_code` from charger error, `inferred=False` |
| Yes | No | If the BMS-minus-MPPT delta is at or above the threshold, fall back to inference and log a warning ("charging detected but IP22 not heard"). Otherwise report unplugged with `inferred=False` |

This fixes the float-stage false negative. With the charger in float you get "0.4A Float" instead of "Unplugged". The existing `ShoreData` fields are enough, so the frontend needs no change.

### 4.5 Config

Add to `config.py`, all defaulting to empty:

```python
victron_ip22_mac: str = ""
victron_ip22_key: str = ""
# spring
victron_orion_mac: str = ""
victron_orion_key: str = ""
```

Keys live only in the backend `.env` on the Pi. Never commit them and never paste them into chat. Confirm `.env` is in `.gitignore` before starting.

### 4.6 Logging to SQLite (optional, later)

`data_logger.py` logs BMS and MPPT every 30s. Logging IP22 readings as a `shore` source would give shore-charging history, but it touches `db.write_raw`, the rollups, and the history queries. Out of scope for the first pass. See open questions.

## 5. Implementation steps

Workflow as usual: branch, stage, diff summary, explicit approval before any commit or push.

**Step 0: prerequisites (you)**

- In VictronConnect, open the IP22 and check its firmware is v3.61 or newer (update if not).
- Settings > Product info: enable instant readout, show the details, and copy the MAC and key.
- Add both to the Pi's backend `.env`. Do not paste the key anywhere else.
- Close VictronConnect afterwards so it is not holding a connection.

**Step 1: behavior-preserving refactor**

- Introduce the registry and MAC-routed callback with the MPPT as the only entry.
- Deploy and verify the MPPT readings and log lines are unchanged. This isolates any regression from the IP22 work.

**Step 2: add the IP22**

- Add a `ShoreReading` cache and `get_shore_latest()` in `victron_ble.py`, mapped from `AcCharger`.
- Register the IP22 when its MAC and key are set.

**Step 3: shore router**

- Implement the decision table in `shore.py`. Keep `SHORE_INFERENCE_THRESHOLD` for the fallback path.
- Check every other consumer of `ShoreData` and `get_shore` (mode logic, health checks) before changing `connected` semantics.

**Step 4: tests**

- Registry routing: unknown MACs ignored, wrong key does not poison another device's cache.
- Shore decision table, all three rows, including the fallback warning.
- Staleness boundaries per device.

**Step 5: on-van validation**

- Plug and unplug shore power and watch the dashboard: IP22 appears within about a cycle or two, disappears within 90s.
- Compare IP22 output current against BMS current minus MPPT current. They should roughly agree. Large disagreement is worth understanding before trusting either.
- Confirm float stage now reads as plugged in.
- Open VictronConnect on your phone, confirm the IP22 goes stale, close it, confirm it recovers.
- Check the BMS stays connected and the Pi's load and log volume look normal.

**Step 6: docs** (see section 8).

**Step 7 (spring): Orion XS**

- Enable instant readout on the XS, add its MAC and key to `.env`, and register it with the `OrionXS` parser.
- Replace the static `orion.py` with a real reading: input and output voltage, input and output current, charge state, and off reason (useful for "engine off" vs "fault").
- Re-enable the Alternator row in `ChargeSourcesCard`.
- Verify every field against VictronConnect, since the parser is reverse engineered. If anything is off, keep the static fallback.

## 6. Risks

| Risk | Mitigation |
| --- | --- |
| IP22 firmware too old or instant readout off | Step 0 checklist. Inference fallback keeps the dashboard working meanwhile |
| Scan window longer when IP22 is absent | Fixed short window, never wait on optional devices, measure before tuning |
| Another Victron device nearby (campgrounds) | MAC-routed callback ignores anything unregistered |
| Missed IP22 advertisement shows "Unplugged" | Inference cross-check in the decision table, 90s staleness rather than one missed cycle |
| VictronConnect session silences advertisements | Documented in TROUBLESHOOTING. Expect temporary stale readings |
| Orion XS parser is undocumented | Treat as experimental, verify in spring, keep static fallback |
| Key leakage | `.env` only, verify `.gitignore`, never paste in chat |
| BMS lockout | No new connections are opened. Scan cadence and BMS reconnect logic unchanged |

## 7. Out of scope

- Any ESP32 for Victron (see section 1).
- VE.Direct cables or ports.
- The SvelteKit migration (`docs/SVELTEKIT-MIGRATION.md`). The only API change here is that `inferred` becomes `False` for real IP22 data, which the frontend already tolerates.

## 8. Docs to update when done

- `HARDWARE.md`: replace the VE.Direct section with the BLE instant readout setup, including the firmware requirement.
- `API.md`: describe the new meaning of `inferred` on the shore endpoint and the unplugged-vs-stale behavior.
- `TROUBLESHOOTING.md`: IP22 goes silent on unplugged shore (normal), VictronConnect silences advertisements, how to find the MAC and key.
- `CLAUDE.md` and `ARCHITECTURE.md`: the registry and the scan window rule.

## 9. Open questions

1. Log IP22 readings to SQLite as a `shore` source for charging history? Adds schema and rollup work.
2. Keep the 30s scan cycle, or shorten it once measured advertisement intervals are known? The existing constraint is the shared Pi radio, so the default answer is to keep it.
3. In the UI, should "plugged in but off" look different from "plugged in and charging"? The data will support it.
4. Show the Alternator row again only when the XS arrives, or earlier with the static Orion-Tr?
