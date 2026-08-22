"""
BLE Orchestrator — runs Victron and BMS polls sequentially.
One poll at a time prevents adapter contention.

Cycle:
  1. Poll Victron MPPT  (~3-5s, one-shot scan)
  2. Pause              (2s adapter settle)
  3. Poll Power Queen   (~5-8s, active connection)
  4. Rest               (20s)
  Total cycle: ~30-35s
"""
import asyncio
import logging
from app.services import victron_ble, battery_ble

logger = logging.getLogger(__name__)

ADAPTER_SETTLE = 2   # seconds between polls
REST_PERIOD    = 20  # seconds after both polls before next cycle


async def run():
    logger.info("BLE orchestrator started")

    while True:
        # --- Victron MPPT ---
        try:
            logger.debug("Polling Victron MPPT...")
            await victron_ble.poll_once(timeout=10)
        except Exception as exc:
            logger.warning("Victron poll error: %s", exc)

        # Let the adapter fully release before connecting to BMS
        await asyncio.sleep(ADAPTER_SETTLE)

        # --- Power Queen BMS ---
        try:
            logger.debug("Polling Power Queen BMS...")
            await battery_ble.poll_once()
        except Exception as exc:
            logger.warning("BMS poll error: %s", exc)

        # Rest before next cycle
        await asyncio.sleep(REST_PERIOD)
