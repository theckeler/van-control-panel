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

Note on scanning mode: this is an active scan, which is bleak's default —
BleakScanner transmits scan requests. Passive scanning on BlueZ requires
or_patterns and changes discovery reliability, so it's a deliberate open
question rather than a one-word change. Relevant because the Pi shares 2.4GHz
with its own BMS connection and the ESP32 bridge.
"""
import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from bleak import BleakScanner
from app.config import settings

logger = logging.getLogger(__name__)

MANUFACTURER_ID = 0xB5B5
SERIAL_LEN = 16
BATTERY_OFFSET = 1 + SERIAL_LEN  # = 17

STALE_AFTER = 180  # EcoFlow advertises far less often than Victron


@dataclass
class EcoflowReading:
    battery_percent: int | None = None
    serial: str | None = None
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


def get_latest() -> EcoflowReading:
    return _cache


def _parse(payload: bytes) -> EcoflowReading | None:
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

    return EcoflowReading(
        battery_percent=battery,
        serial=serial,
        updated_at=datetime.now(timezone.utc),
    )


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
        global _cache
        _cache = parsed
        logger.info("EcoFlow: %d%% battery (serial %s)", parsed.battery_percent, parsed.serial)
        loop.call_soon_threadsafe(event.set)

    scanner = BleakScanner(_callback)
    await scanner.start()
    try:
        await asyncio.wait_for(event.wait(), timeout=timeout)
    except asyncio.TimeoutError:
        logger.warning("EcoFlow: no advertisement within %.0fs", timeout)
    finally:
        await scanner.stop()
