"""
BLE Orchestrator — runs Victron MPPT and BMS services as independent tasks.

Victron: periodic one-shot scan (passive, ~3-5s every 30s)
BMS: persistent connection managed by battery_ble.run()

Uses asyncio.gather so both run concurrently. Task deaths are logged
explicitly — gather(return_exceptions=True) would swallow them silently.
"""
import asyncio
import logging
from app.services import victron_ble, battery_ble

logger = logging.getLogger(__name__)

VICTRON_INTERVAL = 30


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
    """Start both BLE services. Log if either task exits unexpectedly."""
    logger.info("BLE orchestrator started")
    results = await asyncio.gather(
        _victron_loop(),
        battery_ble.run(),
        return_exceptions=True,
    )
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            names = ["Victron loop", "BMS service"]
            logger.error("BLE task '%s' exited with error: %s", names[i], result)
