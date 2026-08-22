"""
Power Queen 12V 100Ah LiFePO4 — native async BLE service.
Uses bleak directly instead of the pq_bms_bluetooth thread wrapper,
so it runs cleanly in the FastAPI event loop alongside Victron.

Protocol (FFE1 characteristic, write + notify):
  Battery info cmd : 00 00 04 01 13 55 AA 17
  Version cmd      : 00 00 04 01 16 55 AA 1A
  Response size    : ~106+ bytes for battery info
"""
import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

from bleak import BleakClient
from app.config import settings
from app.services.pq_battery import BatteryInfo

logger = logging.getLogger(__name__)

FFE1_UUID    = "0000ffe1-0000-1000-8000-00805f9b34fb"
CMD_VERSION  = bytes.fromhex("000004011655AA1A".replace(" ", ""))
CMD_BATTERY  = bytes.fromhex("000004011355AA17".replace(" ", ""))

MIN_BYTES    = 90    # minimum valid response length
STALE_AFTER  = 120  # seconds

_cache: BatteryInfo | None = None
_cache_time: datetime | None = None


def get_latest() -> BatteryInfo | None:
    return _cache


def is_connected() -> bool:
    if _cache_time is None:
        return False
    age = (datetime.now(timezone.utc) - _cache_time).total_seconds()
    return age < STALE_AFTER


async def _read_characteristic(client: BleakClient, cmd: bytes, timeout: float = 8.0) -> bytearray:
    """Send a command and collect notification bytes until response is complete."""
    received = bytearray()
    done = asyncio.Event()

    def handler(sender, data: bytearray):
        received.extend(data)
        if len(received) >= MIN_BYTES:
            done.set()

    await client.start_notify(FFE1_UUID, handler)
    await client.write_gatt_char(FFE1_UUID, cmd, response=False)
    try:
        await asyncio.wait_for(done.wait(), timeout=timeout)
    except asyncio.TimeoutError:
        pass
    finally:
        await client.stop_notify(FFE1_UUID)

    return received


async def poll_once(timeout: float = 10.0):
    """Connect to BMS, read battery + version, parse, update cache."""
    global _cache, _cache_time

    if not settings.bms_mac:
        logger.warning("BMS_MAC not set — skipping battery poll")
        return

    try:
        async with BleakClient(settings.bms_mac, timeout=timeout) as client:
            # Read version
            ver_data = await _read_characteristic(client, CMD_VERSION, timeout=6)

            # Read battery info
            batt_data = await _read_characteristic(client, CMD_BATTERY, timeout=6)

        if len(batt_data) < MIN_BYTES:
            logger.warning("BMS: response too short (%d bytes)", len(batt_data))
            return

        # Reuse pq_battery parse logic
        batt = BatteryInfo.__new__(BatteryInfo)
        batt._logger = logger
        batt._debug = False
        batt.error_code = 0
        batt.error_message = None
        # init all fields to None
        for attr in [
            "packVoltage", "voltage", "batteryPack", "current", "watt",
            "remainAh", "factoryAh", "cellTemperature", "mosfetTemperature",
            "heat", "protectState", "failureState", "equilibriumState",
            "batteryState", "SOC", "SOH", "dischargeSwitchState",
            "dischargesCount", "dischargesAHCount", "firmwareVersion",
            "manfactureDate", "hardwareVersion", "battery_status",
            "balance_status", "cell_status", "bms_status", "heat_status",
        ]:
            setattr(batt, attr, None)
        batt.batteryPack = {}

        if len(ver_data) >= 20:
            batt.parse_version(ver_data)
        batt.parse_battery_info(batt_data)

        _cache = batt
        _cache_time = datetime.now(timezone.utc)
        logger.info(
            "BMS: %s%% SOC, %.3fV, %.2fA, %s",
            batt.SOC,
            (batt.voltage or 0) / 1000,
            batt.current or 0,
            batt.battery_status,
        )

    except asyncio.TimeoutError:
        logger.warning("BMS: connection timed out")
    except Exception as exc:
        logger.warning("BMS poll failed: %s", exc)
