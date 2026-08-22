from fastapi import APIRouter
from pydantic import BaseModel
from app.services import battery_ble, db

router = APIRouter()

class BatteryData(BaseModel):
    soc: float
    voltage: float
    current: float
    temperature: float
    cell_voltages: list[float]
    cycle_count: int
    status: str
    connected: bool
    last_seen: str | None       # ISO timestamp of last successful read
    retry_in: int | None        # seconds until next reconnect attempt

@router.get("/", response_model=BatteryData)
async def get_battery():
    """Get current battery state. Returns last known values when BLE is offline."""
    b = battery_ble.get_latest()
    connected = battery_ble.is_connected()
    last_seen = battery_ble.get_last_seen()
    retry_in  = battery_ble.get_retry_in()

    last_seen_str = last_seen.isoformat() if last_seen else None

    # Return last known values even when offline — frontend decides how to display
    if b is not None:
        return BatteryData(
            soc=float(b.SOC or 0),
            voltage=round((b.voltage or 0) / 1000, 3),
            current=float(b.current or 0),
            temperature=float(b.cellTemperature or 0),
            cell_voltages=list(b.batteryPack.values()),
            cycle_count=int(b.dischargesCount or 0),
            status=b.battery_status or "unknown",
            connected=connected,
            last_seen=last_seen_str,
            retry_in=retry_in,
        )

    return BatteryData(
        soc=0.0, voltage=0.0, current=0.0, temperature=0.0,
        cell_voltages=[], cycle_count=0, status="offline",
        connected=False, last_seen=None, retry_in=retry_in,
    )

@router.get("/history/raw")
async def get_battery_history_raw(hours: int = 24):
    rows = db.query_raw(hours=hours)
    return [r for r in rows if r["source"] == "bms"]

@router.get("/history/hourly")
async def get_battery_history_hourly(days: int = 7):
    return db.query_hourly(days=days)

@router.get("/history/daily")
async def get_battery_history_daily(days: int = 30):
    return db.query_daily(days=days)

@router.get("/history/monthly")
async def get_battery_history_monthly():
    return db.query_monthly()
