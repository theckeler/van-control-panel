"""
Data logger — watches BMS and MPPT caches, writes to SQLite,
and triggers tiered rollups at the right time boundaries.
"""
import asyncio
import logging
from datetime import datetime, timezone

from app.services import battery_ble, victron_ble, db

logger = logging.getLogger(__name__)

LOG_INTERVAL = 30  # seconds between writes (matches BLE poll cadence)


async def run():
    """
    Long-running background task.
    Writes every 30 seconds. Triggers rollups when hour/day/month boundaries cross.
    """
    logger.info("Data logger started")

    last_hour  = None
    last_day   = None
    last_month = None

    while True:
        await asyncio.sleep(LOG_INTERVAL)

        now = datetime.now(timezone.utc)

        # --- Write BMS reading ---
        bms = battery_ble.get_latest()
        if bms and battery_ble.is_connected():
            try:
                db.write_raw(
                    source="bms",
                    ts=now,
                    soc=float(bms.SOC) if bms.SOC is not None else None,
                    voltage=(bms.voltage or 0) / 1000,
                    current=bms.current,
                    temperature=bms.cellTemperature,
                    cell_voltages=list(bms.batteryPack.values()) if bms.batteryPack else [],
                )
            except Exception as exc:
                logger.warning("Failed to log BMS reading: %s", exc)

        # --- Write MPPT reading ---
        mppt = victron_ble.get_latest()
        if mppt and not mppt.is_stale:
            try:
                db.write_raw(
                    source="mppt",
                    ts=now,
                    voltage=mppt.battery_voltage,
                    current=mppt.battery_charging_current,
                    solar_power=mppt.solar_power,
                    charge_state=mppt.charge_state,
                    daily_yield=mppt.daily_yield,
                )
            except Exception as exc:
                logger.warning("Failed to log MPPT reading: %s", exc)

        # --- Rollups at time boundaries ---
        current_hour  = now.replace(minute=0, second=0, microsecond=0)
        current_day   = now.strftime("%Y-%m-%d")
        current_month = now.strftime("%Y-%m")

        try:
            # Hourly rollup — fires once per hour
            if last_hour and current_hour != last_hour:
                db.rollup_hourly(last_hour)
                logger.info("Hourly rollup complete: %s", last_hour.isoformat())

            # Daily rollup — fires once per day
            if last_day and current_day != last_day:
                prev = datetime.fromisoformat(last_day + "T00:00:00+00:00")
                db.rollup_daily(prev)
                db.prune(now)
                logger.info("Daily rollup + prune complete: %s", last_day)

            # Monthly rollup — fires once per month
            if last_month and current_month != last_month:
                y, m = [int(x) for x in last_month.split("-")]
                db.rollup_monthly(datetime(y, m, 1, tzinfo=timezone.utc))
                logger.info("Monthly rollup complete: %s", last_month)

        except Exception as exc:
            logger.warning("Rollup error: %s", exc)

        last_hour  = current_hour
        last_day   = current_day
        last_month = current_month
