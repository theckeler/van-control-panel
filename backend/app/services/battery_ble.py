"""
Power Queen 12V 100Ah LiFePO4 — BMS BLE service
Polls battery via pq_bms_bluetooth library every 30 seconds.
The library uses asyncio.run() internally so reads run in a thread executor.
"""
import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from app.config import settings
from app.services.pq_battery import BatteryInfo

logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=1)
_cache: BatteryInfo | None = None
_cache_time: datetime | None = None

POLL_INTERVAL = 30   # seconds between reads
STALE_AFTER = 90     # seconds before considered disconnected


def get_latest() -> BatteryInfo | None:
    return _cache


def is_connected() -> bool:
    if _cache_time is None:
        return False
    age = (datetime.now(timezone.utc) - _cache_time).total_seconds()
    return age < STALE_AFTER


def _read_sync() -> BatteryInfo:
    """Blocking BMS read — safe to call asyncio.run() here (no running loop)."""
    batt = BatteryInfo(settings.bms_mac, timeout=6)
    batt.read_bms()
    return batt


async def poll_battery():
    """Long-running background task — polls BMS every 30 seconds."""
    global _cache, _cache_time

    if not settings.bms_mac:
        logger.warning("BMS_MAC not set — battery BLE polling disabled")
        return

    logger.info("Starting Power Queen BMS poller for %s", settings.bms_mac)

    while True:
        try:
            loop = asyncio.get_event_loop()
            batt = await loop.run_in_executor(_executor, _read_sync)

            if batt.error_code == 0:
                _cache = batt
                _cache_time = datetime.now(timezone.utc)
                logger.info(
                    "BMS: %s%% SOC, %.3fV, %.2fA, %s",
                    batt.SOC,
                    (batt.voltage or 0) / 1000,
                    batt.current or 0,
                    batt.battery_status,
                )
            else:
                logger.warning("BMS read error: %s", batt.error_message)

        except Exception as exc:
            logger.warning("Battery poll failed: %s", exc)

        await asyncio.sleep(POLL_INTERVAL)
