"""
EcoFlow River 2 Max — BLE service (one-shot scan, decoded manually)

Unlike Victron, this doesn't use the victron-ble library or any decryption —
the battery percentage is a plain, unencrypted byte in the manufacturer data,
confirmed by comparing a live capture against the unit's own screen (13% on
the display matched byte offset 17 exactly, decimal). No official spec exists
for this; if EcoFlow changes firmware, this offset could silently start
returning garbage. Sanity-bounded to 0-100 for exactly that reason.

Manufacturer ID 0xB5B5, payload layout (offsets into ManufacturerData.Value,
company ID already stripped by bleak):
    [0]      0x13         constant marker/type byte, meaning unknown
    [1:17]   ASCII         16-byte device serial, e.g. "R613ZAB6XG1P0314"
    [17]     uint8         battery percentage (confirmed against real display)
    [18:24]  constant      NOT undecoded data — independently measured on two
                            River 2 units and confirmed constant across
                            sessions, with the final byte varying between units
                            (most likely a checksum). Watts, charge state and
                            remaining time are NOT in the advertisement at all.

Battery percent is therefore the ceiling for passive scanning, permanently.
Everything else requires an authenticated GATT session (see
docs/rubber-duck-review-2026-08-27.md for the two viable paths). Don't spend
another evening capturing advertisements hoping for more.

charge_state (added 2026-09-07) is therefore inferred, not real — same
spirit as shore.py inferring shore power from a BMS/MPPT current delta
rather than real VE.Direct telemetry. See _infer_charge_state below.

Note on scanning mode: this is an active scan, which is bleak's default —
BleakScanner transmits scan requests. Passive scanning on BlueZ requires
or_patterns and changes discovery reliability, so it's a deliberate open
question rather than a one-word change. Relevant because the Pi shares 2.4GHz
with its own BMS connection and the ESP32 bridge.
"""
import asyncio
import logging
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from bleak import BleakScanner
from app.config import settings

logger = logging.getLogger(__name__)

MANUFACTURER_ID = 0xB5B5
SERIAL_LEN = 16
BATTERY_OFFSET = 1 + SERIAL_LEN  # = 17

STALE_AFTER = 180  # EcoFlow advertises far less often than Victron

# Battery % is an integer, and a ~250Wh River 2 Max can take several minutes
# to move even 1% — comparing just the last two 60s-apart polls would mostly
# see noise, not a real trend. Compare the oldest and newest reading across
# this whole window instead.
HISTORY_WINDOW_S = 600


@dataclass
class EcoflowReading:
    battery_percent: int | None = None
    serial: str | None = None
    charge_state: str | None = None  # "charging" | "discharging" | "idle" | None (not enough data yet)
    updated_at: datetime | None = None

    @property
    def is_stale(self) -> bool:
        if self.updated_at is None:
            return True
        return (datetime.now(timezone.utc) - self.updated_at).total_seconds() > STALE_AFTER

    @property
    def connected(self) -> bool:
        return not self.is_stale


_cache: EcoflowReading = EcoflowReading()
_history: deque[tuple[datetime, int]] = deque(maxlen=20)


def get_latest() -> EcoflowReading:
    return _cache


def _infer_charge_state(now: datetime) -> str | None:
    """
    None means "don't know yet", not "idle" — distinct states, since a fresh
    boot or a battery that's been stale for a while shouldn't claim idle
    with no real basis for it.
    """
    cutoff = now - timedelta(seconds=HISTORY_WINDOW_S)
    window = [(ts, pct) for ts, pct in _history if ts >= cutoff]
    if len(window) < 2:
        return None

    oldest_ts, oldest_pct = window[0]
    _, newest_pct = window[-1]
    # Require the window to actually span a meaningful chunk of time, not
    # just two readings that happen to both be recent.
    if (now - oldest_ts).total_seconds() < HISTORY_WINDOW_S / 2:
        return None

    if newest_pct > oldest_pct:
        return "charging"
    if newest_pct < oldest_pct:
        return "discharging"
    return "idle"


def _parse(payload: bytes) -> tuple[int, str | None] | None:
    if len(payload) <= BATTERY_OFFSET:
        return None
    try:
        serial = payload[1:1 + SERIAL_LEN].decode("ascii", errors="replace").rstrip("\x00")
    except Exception:
        serial = None

    battery = payload[BATTERY_OFFSET]
    if not (0 <= battery <= 100):
        # Real-world sanity check — if EcoFlow ever changes the layout this
        # stops us publishing a nonsense value instead of just failing.
        logger.warning("EcoFlow battery byte out of range: %d — layout may have changed", battery)
        return None

    return battery, serial


async def poll_once(timeout: float = 10.0):
    """Scan for one EcoFlow advertisement then stop. Active scan (bleak default)."""
    if not settings.ecoflow_mac:
        logger.warning("ECOFLOW_MAC not set — skipping EcoFlow poll")
        return

    global _cache
    loop = asyncio.get_running_loop()
    event = asyncio.Event()
    target_mac = settings.ecoflow_mac.upper()

    def _callback(device, advertisement_data):
        if event.is_set():
            return
        if device.address.upper() != target_mac:
            return
        mfg = advertisement_data.manufacturer_data.get(MANUFACTURER_ID)
        if not mfg:
            return
        parsed = _parse(mfg)
        if parsed is None:
            return
        battery, serial = parsed
        global _cache
        now = datetime.now(timezone.utc)
        _history.append((now, battery))
        _cache = EcoflowReading(
            battery_percent=battery,
            serial=serial,
            charge_state=_infer_charge_state(now),
            updated_at=now,
        )
        logger.info(
            "EcoFlow: %d%% battery (serial %s, inferred %s)",
            battery, serial, _cache.charge_state,
        )
        loop.call_soon_threadsafe(event.set)

    scanner = BleakScanner(_callback)
    await scanner.start()
    try:
        await asyncio.wait_for(event.wait(), timeout=timeout)
    except asyncio.TimeoutError:
        logger.warning("EcoFlow: no advertisement within %.0fs", timeout)
    finally:
        await scanner.stop()
