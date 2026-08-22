"""
Victron SmartSolar MPPT 75/15 — BLE service (one-shot poll mode)
Called by ble_orchestrator. Uses call_soon_threadsafe to safely
signal the asyncio event loop from bleak's callback thread.
"""
import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

from victron_ble.scanner import Scanner
from victron_ble.devices.solar_charger import SolarCharger
from app.config import settings

logger = logging.getLogger(__name__)

STALE_AFTER = 120


@dataclass
class MpptReading:
    solar_power: float = 0.0
    battery_voltage: float = 0.0
    battery_charging_current: float = 0.0
    charge_state: str = "Off"
    daily_yield: float = 0.0
    charger_error: int = 0
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def is_stale(self) -> bool:
        return (datetime.now(timezone.utc) - self.updated_at).total_seconds() > STALE_AFTER

    @property
    def connected(self) -> bool:
        return not self.is_stale


_cache: MpptReading = MpptReading()


def get_latest() -> MpptReading:
    return _cache


class _OneShotScanner(Scanner):
    def __init__(self, keys: dict, loop: asyncio.AbstractEventLoop, event: asyncio.Event):
        super().__init__(keys)
        self._loop = loop
        self._event = event

    def callback(self, ble_device, data, advertisement):
        global _cache
        if self._event.is_set():
            return
        try:
            parsed = SolarCharger(settings.victron_key).parse(data)
            raw_state = str(parsed.get_charge_state() or "Off")
            _cache = MpptReading(
                solar_power=parsed.get_solar_power() or 0.0,
                battery_voltage=parsed.get_battery_voltage() or 0.0,
                battery_charging_current=parsed.get_battery_charging_current() or 0.0,
                charge_state=raw_state.replace("OperationMode.", ""),
                daily_yield=parsed.get_yield_today() or 0.0,
                charger_error=parsed.get_charger_error() or 0,
            )
            logger.info(
                "MPPT: %.1fW solar, %.2fV battery, %s, %.0fWh today",
                _cache.solar_power,
                _cache.battery_voltage,
                _cache.charge_state,
                _cache.daily_yield,
            )
            # Signal from bleak's thread safely
            self._loop.call_soon_threadsafe(self._event.set)
        except Exception as exc:
            logger.warning("Failed to parse MPPT advertisement: %s", exc)


async def poll_once(timeout: float = 10.0):
    """Scan for one Victron advertisement then stop."""
    if not settings.victron_key:
        logger.warning("VICTRON_KEY not set — skipping MPPT poll")
        return

    loop = asyncio.get_running_loop()
    event = asyncio.Event()
    scanner = _OneShotScanner({settings.victron_mac: settings.victron_key}, loop, event)
    await scanner.start()
    try:
        await asyncio.wait_for(event.wait(), timeout=timeout)
    except asyncio.TimeoutError:
        logger.warning("MPPT: no advertisement within %.0fs", timeout)
    finally:
        await scanner.stop()
