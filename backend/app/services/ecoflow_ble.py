"""
EcoFlow River 2 Max — BLE service (one-shot passive scan, decoded manually)

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
    [18:24]  ??            unknown — possibly watts in/out or status flags,
                            not decoded; needs the same live-comparison method
                            to pin down safely rather than guessing
"""
import asyncio
import logging
from dataclasses import dataclass, field
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
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def is_stale(self) -> bool:
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

    return EcoflowReading(battery_percent=battery, serial=serial)


async def poll_once(timeout: float = 10.0):
    """Passive scan for one EcoFlow advertisement then stop."""
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
