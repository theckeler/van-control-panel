"""
BLE Orchestrator — coordinates Victron MPPT scan and BMS connection.

Victron: periodic one-shot scan (passive, quick)
BMS: persistent connection managed by battery_ble.run() independently

Both run as separate tasks to avoid blocking each other.
Victron scans only while BMS is idle to prevent adapter contention.
"""
import asyncio
import logging
from app.services import victron_ble, battery_ble

logger = logging.getLogger(__name__)

VICTRON_INTERVAL = 30  # seconds between MPPT scans


async def _victron_loop():
    """Periodic Victron one-shot poll."""
    logger.info("Victron poll loop started")
    while True:
        try:
            await victron_ble.poll_once(timeout=10)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("Victron poll error: %s", exc)
        await asyncio.sleep(VICTRON_INTERVAL)


async def run():
    """Start both BLE services as independent tasks."""
    logger.info("BLE orchestrator started")
    await asyncio.gather(
        _victron_loop(),
        battery_ble.run(),
        return_exceptions=True,
    )
