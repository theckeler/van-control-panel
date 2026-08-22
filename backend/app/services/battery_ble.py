"""
Power Queen 12V 100Ah LiFePO4 — persistent BLE connection service.

Maintains a long-lived connection to the BMS and reads every 30 seconds.
On disconnect, waits 5 minutes before retrying to prevent BMS lockout.

Release/reconnect API lets users temporarily drop the connection
so the Power Queen app can connect, then resume automatically.

Protocol (FFE1 characteristic, write + notify):
  Battery info: 00 00 04 01 13 55 AA 17
  Version:      00 00 04 01 16 55 AA 1A
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta

from bleak import BleakClient, BleakError
from app.config import settings
from app.services.pq_battery import BatteryInfo

logger = logging.getLogger(__name__)

FFE1_UUID   = "0000ffe1-0000-1000-8000-00805f9b34fb"
CMD_VERSION = bytes.fromhex("000004011655AA1A")
CMD_BATTERY = bytes.fromhex("000004011355AA17")

MIN_BYTES       = 90
READ_EVERY      = 30
RECONNECT_IN    = 300
CONNECT_TIMEOUT = 25
STARTUP_DELAY   = 5
STALE_AFTER     = 120

_cache: BatteryInfo | None = None
_cache_time: datetime | None = None
_reconnect_after: datetime | None = None
_paused: bool = False
_wake: asyncio.Event = asyncio.Event()
_current_client: BleakClient | None = None


def get_latest() -> BatteryInfo | None:
    return _cache

def get_last_seen() -> datetime | None:
    return _cache_time

def get_retry_in() -> int | None:
    if is_connected() or _paused or _reconnect_after is None:
        return None
    remaining = (_reconnect_after - datetime.now(timezone.utc)).total_seconds()
    return max(0, int(remaining))

def is_connected() -> bool:
    if _cache_time is None:
        return False
    return (datetime.now(timezone.utc) - _cache_time).total_seconds() < STALE_AFTER

def is_paused() -> bool:
    return _paused


async def release():
    """Drop BLE connection and pause reconnects — frees BMS for Power Queen app."""
    global _paused, _current_client
    _paused = True
    if _current_client and _current_client.is_connected:
        try:
            await _current_client.disconnect()
            logger.info("BMS: released — Power Queen app can now connect")
        except Exception as exc:
            logger.warning("BMS: disconnect during release failed: %s", exc)


async def reconnect():
    """Resume BLE connection immediately."""
    global _paused, _reconnect_after
    _paused = False
    _reconnect_after = None
    _wake.set()
    logger.info("BMS: reconnect requested")


def _set_reconnect_timer():
    global _reconnect_after
    _reconnect_after = datetime.now(timezone.utc) + timedelta(seconds=RECONNECT_IN)


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


def _parse_and_cache(batt_data: bytearray, ver_data: bytearray):
    global _cache, _cache_time, _reconnect_after

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
    _reconnect_after = None
    logger.info(
        "BMS: %s%% SOC, %.3fV, %.2fA, %s",
        batt.SOC,
        (batt.voltage or 0) / 1000,
        batt.current or 0,
        batt.battery_status,
    )


async def run():
    global _current_client

    if not settings.bms_mac:
        logger.warning("BMS_MAC not set — battery service disabled")
        return

    logger.info("BMS service starting — %s (startup delay %ds)", settings.bms_mac, STARTUP_DELAY)
    _set_reconnect_timer()
    await asyncio.sleep(STARTUP_DELAY)

    while True:
        # If paused, wait until resumed
        if _paused:
            _wake.clear()
            logger.info("BMS: paused — waiting for reconnect request")
            await _wake.wait()
            continue

        try:
            async with BleakClient(settings.bms_mac, timeout=CONNECT_TIMEOUT) as client:
                _current_client = client
                logger.info("BMS: connected")
                ver_data = await _read(client, CMD_VERSION, timeout=8)

                while client.is_connected and not _paused:
                    batt_data = await _read(client, CMD_BATTERY, timeout=8)
                    if len(batt_data) < MIN_BYTES:
                        logger.warning("BMS: incomplete read (%d bytes) — disconnecting", len(batt_data))
                        break
                    _parse_and_cache(batt_data, ver_data)
                    await asyncio.sleep(READ_EVERY)

                _current_client = None
                if not _paused:
                    logger.warning("BMS: connection dropped — retrying in %ds", RECONNECT_IN)

        except asyncio.CancelledError:
            raise
        except (BleakError, asyncio.TimeoutError, OSError) as exc:
            _current_client = None
            logger.warning("BMS: %s — retrying in %ds", exc or "connection failed", RECONNECT_IN)
        except Exception as exc:
            _current_client = None
            logger.warning("BMS: unexpected — %s — retrying in %ds", exc, RECONNECT_IN)

        if not _paused:
            _set_reconnect_timer()
            _wake.clear()
            try:
                await asyncio.wait_for(_wake.wait(), timeout=RECONNECT_IN)
            except asyncio.TimeoutError:
                pass
            _wake.clear()
