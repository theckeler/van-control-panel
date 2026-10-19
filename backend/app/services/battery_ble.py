"""
Power Queen 12V 100Ah LiFePO4 — persistent BLE connection service.

Maintains a long-lived connection to the BMS and reads every 30 seconds.
On disconnect, waits 5 minutes before retrying to prevent BMS lockout.

Release/reconnect API lets users temporarily drop the connection
so the Power Queen app can connect, then resume automatically.

Every BLE await is hard-bounded, and the task advertises a progress deadline
(see is_stuck) that ble_orchestrator's watchdog enforces. This task silently
froze inside an un-timed-out BLE call on 2026-09-04 and again on 2026-10-05
(8 days, during which the house battery drained 99% -> 19% unseen). Release
and reconnect only set flags this task reads, so they cannot revive a frozen
one — hence the watchdog.

Protocol (FFE1 characteristic, write + notify):
  Battery info: 00 00 04 01 13 55 AA 17
  Version:      00 00 04 01 16 55 AA 1A
"""
import asyncio
import logging
import time
from datetime import datetime, timezone, timedelta

from bleak import BleakClient, BleakError
from app.config import settings
from app.services.pq_battery import BatteryInfo

logger = logging.getLogger(__name__)
# The vendored parser logs checksum lines at INFO on every read; a separate logger
# lets main.py quiet it (see there) without hiding this module's own INFO lines.
_parser_logger = logging.getLogger("app.services.pq_battery")

FFE1_UUID   = "0000ffe1-0000-1000-8000-00805f9b34fb"
CMD_VERSION = bytes.fromhex("000004011655AA1A")
CMD_BATTERY = bytes.fromhex("000004011355AA17")

MIN_BYTES       = 90
READ_EVERY      = 30
RECONNECT_IN    = 300
CONNECT_TIMEOUT = 25
STARTUP_DELAY   = 5
STALE_AFTER     = 120

# Hard bounds. bleak's own connect timeout has not been enough on its own, and
# start_notify / write / disconnect have no timeout at all — on BlueZ they can
# wait forever for a D-Bus reply from a half-responsive BMS.
CONNECT_HARD_LIMIT = CONNECT_TIMEOUT + 10
GATT_TIMEOUT       = 10
DISCONNECT_TIMEOUT = 10
# Worst-case time for one _read(): start_notify + write + 8s wait + stop_notify.
READ_BUDGET        = 3 * GATT_TIMEOUT + 8
# Worst case for a whole attempt: connect, version read, first battery read,
# disconnect.
CONNECT_BUDGET     = CONNECT_HARD_LIMIT + 2 * READ_BUDGET + DISCONNECT_TIMEOUT
# Slack on top of a phase's worst case before the watchdog calls it stuck.
WATCHDOG_GRACE     = 60

_cache: BatteryInfo | None = None
_cache_time: datetime | None = None
_reconnect_after: datetime | None = None
_paused: bool = False
_wake: asyncio.Event = asyncio.Event()
_current_client: BleakClient | None = None
# time.monotonic() by which the task must reach its next milestone. Monotonic,
# not wall-clock: the Pi has no RTC, so the clock can jump when NTP syncs.
_deadline: float = 0.0


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


def _expect_progress(within: float) -> None:
    """Declare the latest the task may take to reach its next milestone."""
    global _deadline
    _deadline = time.monotonic() + within + WATCHDOG_GRACE


def is_stuck() -> bool:
    """True when the task has blown through its own worst-case phase time.

    A paused service legitimately sits on _wake indefinitely, so it is never
    stuck. Checked by ble_orchestrator's watchdog.
    """
    if _paused:
        return False
    return time.monotonic() > _deadline


async def _safe_disconnect(client: BleakClient) -> None:
    """disconnect() on the BlueZ backend waits for a D-Bus property change that
    may never arrive, so it gets a hard bound like every other BLE call."""
    try:
        await asyncio.wait_for(client.disconnect(), timeout=DISCONNECT_TIMEOUT)
    except asyncio.TimeoutError:
        logger.warning("BMS: disconnect timed out after %ds — abandoning client", DISCONNECT_TIMEOUT)
    except Exception as exc:
        logger.debug("BMS: disconnect failed: %s", exc)


async def release():
    """Drop BLE connection and pause reconnects — frees BMS for Power Queen app."""
    global _paused
    _paused = True
    client = _current_client
    if client and client.is_connected:
        await _safe_disconnect(client)
        logger.info("BMS: released — Power Queen app can now connect")


async def reconnect():
    """Resume BLE connection immediately."""
    global _paused, _reconnect_after
    _paused = False
    _reconnect_after = None
    # Fresh deadline: a paused service was exempt from the watchdog, and the
    # loop needs a whole attempt's worth of time to come back around.
    _expect_progress(CONNECT_BUDGET)
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

    await asyncio.wait_for(client.start_notify(FFE1_UUID, handler), timeout=GATT_TIMEOUT)
    try:
        await asyncio.wait_for(
            client.write_gatt_char(FFE1_UUID, cmd, response=False), timeout=GATT_TIMEOUT
        )
        try:
            await asyncio.wait_for(done.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            pass
    finally:
        try:
            await asyncio.wait_for(client.stop_notify(FFE1_UUID), timeout=GATT_TIMEOUT)
        except Exception:
            pass
    return received


def _parse_and_cache(batt_data: bytearray, ver_data: bytearray):
    global _cache, _cache_time, _reconnect_after

    batt = BatteryInfo.__new__(BatteryInfo)
    batt._logger = _parser_logger
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
    # DEBUG on purpose: this fires every 30s and journald is on the SD card.
    logger.debug(
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
    _expect_progress(STARTUP_DELAY)
    await asyncio.sleep(STARTUP_DELAY)

    while True:
        # If paused, wait until resumed
        if _paused:
            _wake.clear()
            logger.info("BMS: paused — waiting for reconnect request")
            await _wake.wait()
            continue

        _expect_progress(CONNECT_BUDGET)
        client = BleakClient(settings.bms_mac, timeout=CONNECT_TIMEOUT)
        try:
            await asyncio.wait_for(client.connect(), timeout=CONNECT_HARD_LIMIT)
            _current_client = client
            logger.info("BMS: connected")
            ver_data = await _read(client, CMD_VERSION, timeout=8)

            while client.is_connected and not _paused:
                batt_data = await _read(client, CMD_BATTERY, timeout=8)
                if len(batt_data) < MIN_BYTES:
                    logger.warning("BMS: incomplete read (%d bytes) — disconnecting", len(batt_data))
                    break
                _parse_and_cache(batt_data, ver_data)
                _expect_progress(READ_EVERY + READ_BUDGET)
                await asyncio.sleep(READ_EVERY)

            if not _paused:
                logger.warning("BMS: connection dropped — retrying in %ds", RECONNECT_IN)

        except asyncio.CancelledError:
            raise
        except (BleakError, asyncio.TimeoutError, OSError) as exc:
            # str(exc) is empty for a bare TimeoutError, which used to log as a
            # blank "BMS:  — retrying" line.
            logger.warning(
                "BMS: %s — retrying in %ds", str(exc) or type(exc).__name__, RECONNECT_IN
            )
        except Exception as exc:
            logger.warning("BMS: unexpected — %s — retrying in %ds", exc, RECONNECT_IN)
        finally:
            _current_client = None
            await _safe_disconnect(client)

        if not _paused:
            _set_reconnect_timer()
            _wake.clear()
            _expect_progress(RECONNECT_IN)
            try:
                await asyncio.wait_for(_wake.wait(), timeout=RECONNECT_IN)
            except asyncio.TimeoutError:
                pass
            _wake.clear()
