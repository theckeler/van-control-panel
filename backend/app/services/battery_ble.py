"""
Power Queen 12V 100Ah LiFePO4 — persistent BLE connection service.

Stays connected to the BMS rather than polling with connect/disconnect
cycles. This prevents the BMS from entering sleep state between reads.
On disconnect, reconnects automatically after a short backoff.

Protocol (FFE1 characteristic, write + notify):
  Battery info: 00 00 04 01 13 55 AA 17
  Version:      00 00 04 01 16 55 AA 1A
"""
import asyncio
import logging
from datetime import datetime, timezone

from bleak import BleakClient, BleakError
from app.config import settings
from app.services.pq_battery import BatteryInfo

logger = logging.getLogger(__name__)

FFE1_UUID   = "0000ffe1-0000-1000-8000-00805f9b34fb"
CMD_VERSION = bytes.fromhex("000004011655AA1A")
CMD_BATTERY = bytes.fromhex("000004011355AA17")

MIN_BYTES    = 90
READ_EVERY   = 30   # seconds between reads on open connection
RECONNECT_IN = 15   # seconds to wait before reconnecting after drop
STALE_AFTER  = 120

_cache: BatteryInfo | None = None
_cache_time: datetime | None = None


def get_latest() -> BatteryInfo | None:
    return _cache


def is_connected() -> bool:
    if _cache_time is None:
        return False
    return (datetime.now(timezone.utc) - _cache_time).total_seconds() < STALE_AFTER


async def _read(client: BleakClient, cmd: bytes, timeout: float = 8.0) -> bytearray:
    received = bytearray()
    done = asyncio.Event()
    loop = asyncio.get_running_loop()

    def handler(sender, data: bytearray):
        received.extend(data)
        if len(received) >= MIN_BYTES:
            loop.call_soon_threadsafe(done.set)

    await client.start_notify(FFE1_UUID, handler)
    await client.write_gatt_char(FFE1_UUID, cmd, response=False)
    try:
        await asyncio.wait_for(done.wait(), timeout=timeout)
    except asyncio.TimeoutError:
        pass
    finally:
        try:
            await client.stop_notify(FFE1_UUID)
        except Exception:
            pass
    return received


async def _parse_and_cache(batt_data: bytearray, ver_data: bytearray):
    global _cache, _cache_time
    if len(batt_data) < MIN_BYTES:
        logger.warning("BMS: response too short (%d bytes)", len(batt_data))
        return

    batt = BatteryInfo.__new__(BatteryInfo)
    batt._logger = logger
    batt._debug = False
    batt.error_code = 0
    batt.error_message = None
    batt.batteryPack = {}
    for attr in [
        "packVoltage", "voltage", "current", "watt", "remainAh", "factoryAh",
        "cellTemperature", "mosfetTemperature", "heat", "protectState",
        "failureState", "equilibriumState", "batteryState", "SOC", "SOH",
        "dischargeSwitchState", "dischargesCount", "dischargesAHCount",
        "firmwareVersion", "manfactureDate", "hardwareVersion",
        "battery_status", "balance_status", "cell_status", "bms_status", "heat_status",
    ]:
        setattr(batt, attr, None)

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


async def run():
    """Maintain a persistent BLE connection, reading every 30 seconds."""
    if not settings.bms_mac:
        logger.warning("BMS_MAC not set — battery service disabled")
        return

    logger.info("BMS service starting — connecting to %s", settings.bms_mac)

    while True:
        try:
            async with BleakClient(settings.bms_mac, timeout=12) as client:
                logger.info("BMS: connected")

                # Read version once on connect
                ver_data = await _read(client, CMD_VERSION, timeout=8)

                while client.is_connected:
                    batt_data = await _read(client, CMD_BATTERY, timeout=8)
                    await _parse_and_cache(batt_data, ver_data)
                    await asyncio.sleep(READ_EVERY)

                logger.warning("BMS: connection dropped")

        except asyncio.CancelledError:
            raise
        except (BleakError, asyncio.TimeoutError) as exc:
            logger.warning("BMS: %s — reconnecting in %ds", exc, RECONNECT_IN)
        except Exception as exc:
            logger.warning("BMS: unexpected error — %s", exc)

        await asyncio.sleep(RECONNECT_IN)
