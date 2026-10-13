"""
BLE Orchestrator — runs Victron MPPT, BMS and EcoFlow services as independent tasks.

Victron: periodic one-shot scan (passive, ~3-5s every 30s)
BMS: persistent connection managed by battery_ble.run(), under a watchdog
EcoFlow: periodic one-shot scan

Uses asyncio.gather so all run concurrently. Task deaths are logged
explicitly — gather(return_exceptions=True) would swallow them silently.
"""
import asyncio
import logging
from app.services import victron_ble, battery_ble, ecoflow_ble

logger = logging.getLogger(__name__)

VICTRON_INTERVAL = 30
ECOFLOW_INTERVAL = 60  # advertises less predictably than Victron; no rush

# poll_once() already passes its own timeout to wait_for, but start()/stop() on
# the scanner are unbounded D-Bus calls. A hard outer limit keeps one wedged
# BlueZ call from freezing a loop forever.
POLL_HARD_LIMIT = 45

WATCHDOG_CHECK = 30
# Pause between cancelling a stuck BMS task and starting its replacement. The
# BMS firmware locks up after rapid connection attempts, so a restart must not
# turn into a retry storm.
WATCHDOG_RESTART_DELAY = 30
# How long a cancelled-but-stuck task gets to unwind before it is abandoned.
WATCHDOG_CANCEL_WAIT = 15


def _reason(exc: BaseException) -> str:
    """str(exc) is empty for a bare TimeoutError — fall back to the type name."""
    return str(exc) or type(exc).__name__


async def _victron_loop():
    """Periodic Victron one-shot poll."""
    logger.info("Victron poll loop started")
    while True:
        try:
            await asyncio.wait_for(victron_ble.poll_once(timeout=10), timeout=POLL_HARD_LIMIT)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("Victron poll error: %s", _reason(exc))
        await asyncio.sleep(VICTRON_INTERVAL)


async def _ecoflow_loop():
    """Periodic EcoFlow one-shot poll."""
    logger.info("EcoFlow poll loop started")
    while True:
        try:
            await asyncio.wait_for(ecoflow_ble.poll_once(timeout=10), timeout=POLL_HARD_LIMIT)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("EcoFlow poll error: %s", _reason(exc))
        await asyncio.sleep(ECOFLOW_INTERVAL)


async def _supervised_bms():
    """Run battery_ble.run() and replace it if it hangs or crashes.

    battery_ble bounds every BLE await, but the same service froze silently
    twice (2026-09-04, and 2026-10-05 for 8 days) inside an await that was not
    bounded. This is the safety net for whatever unbounded await is found next:
    the task publishes a progress deadline, and when it blows past it the task
    is cancelled and a fresh one started.
    """
    while True:
        task = asyncio.create_task(battery_ble.run(), name="bms")
        stuck = False
        try:
            while not task.done():
                await asyncio.sleep(WATCHDOG_CHECK)
                if not task.done() and battery_ble.is_stuck():
                    stuck = True
                    break
        except asyncio.CancelledError:
            task.cancel()
            raise

        if stuck:
            logger.error(
                "BMS watchdog: service made no progress past its deadline — "
                "cancelling it and starting a fresh one"
            )
            task.cancel()
            _, pending = await asyncio.wait({task}, timeout=WATCHDOG_CANCEL_WAIT)
            if pending:
                logger.error("BMS watchdog: stuck task ignored cancellation — abandoning it")
        elif task.cancelled():
            return
        elif task.exception() is not None:
            logger.error("BMS service crashed: %s — restarting", _reason(task.exception()))
        else:
            # run() returns normally only when it is disabled (no BMS_MAC set).
            return

        await asyncio.sleep(WATCHDOG_RESTART_DELAY)


async def run():
    """Start all BLE services. Log if any task exits unexpectedly."""
    logger.info("BLE orchestrator started")
    results = await asyncio.gather(
        _victron_loop(),
        _supervised_bms(),
        _ecoflow_loop(),
        return_exceptions=True,
    )
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            names = ["Victron loop", "BMS service", "EcoFlow loop"]
            logger.error("BLE task '%s' exited with error: %s", names[i], result)
