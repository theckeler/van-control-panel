"""
Victron SmartSolar MPPT 75/15 — BLE service
Reads advertising packets via victron-ble 0.9.x and caches the latest parsed data.

Available via BLE advertisement:
  get_solar_power()              — panel watts (W)
  get_battery_voltage()          — battery voltage (V)
  get_battery_charging_current() — charge current (A)
  get_charge_state()             — Off/Bulk/Absorption/Float
  get_yield_today()              — daily yield (Wh)
  get_charger_error()            — error code
  get_external_device_load()     — load output current (A) if connected
  get_model_name()               — device model string

Not available via BLE: panel voltage, total yield, max power today.
"""
import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

from victron_ble.scanner import Scanner
from victron_ble.devices.solar_charger import SolarCharger
from app.config import settings

logger = logging.getLogger(__name__)

STALE_AFTER = 30


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
        age = (datetime.now(timezone.utc) - self.updated_at).total_seconds()
        return age > STALE_AFTER

    @property
    def connected(self) -> bool:
        return not self.is_stale


_cache: MpptReading = MpptReading()


def get_latest() -> MpptReading:
    return _cache


class MpptScanner(Scanner):
    def callback(self, ble_device, data, advertisement):
        global _cache
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
        except Exception as exc:
            logger.warning("Failed to parse MPPT advertisement: %s", exc)


async def run_scanner():
    if not settings.victron_key:
        logger.warning("VICTRON_KEY not set — MPPT BLE scanner disabled")
        return
    logger.info("Starting Victron BLE scanner for %s", settings.victron_mac)
    scanner = MpptScanner({settings.victron_mac: settings.victron_key})
    await scanner.start()
    try:
        while True:
            await asyncio.sleep(1)
    finally:
        await scanner.stop()
