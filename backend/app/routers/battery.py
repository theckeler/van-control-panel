from fastapi import APIRouter, HTTPException
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
    released: bool
    last_seen: str | None
    retry_in: int | None
    # Seconds until a manual retry is allowed (0 = now). None when there is
    # nothing to retry: connected, or released on purpose.
    retry_now_in: int | None

@router.get("/", response_model=BatteryData)
async def get_battery():
    """Get current battery state. Returns last known values when BLE is offline."""
    b = battery_ble.get_latest()
    connected  = battery_ble.is_connected()
    released   = battery_ble.is_paused()
    last_seen  = battery_ble.get_last_seen()
    retry_in   = battery_ble.get_retry_in()
    retry_now_in = battery_ble.get_retry_now_in()
    last_seen_str = last_seen.isoformat() if last_seen else None

    if b is not None:
        return BatteryData(
            soc=float(b.SOC or 0),
            voltage=round((b.voltage or 0) / 1000, 3),
            current=float(b.current or 0),
            temperature=float(b.cellTemperature or 0),
            cell_voltages=list(b.batteryPack.values()),
            cycle_count=int(b.dischargesCount or 0),
            status="released" if released else (b.battery_status or "unknown"),
            connected=connected,
            released=released,
            last_seen=last_seen_str,
            retry_in=retry_in,
            retry_now_in=retry_now_in,
        )

    return BatteryData(
        soc=0.0, voltage=0.0, current=0.0, temperature=0.0,
        cell_voltages=[], cycle_count=0,
        status="released" if released else "offline",
        connected=False, released=released,
        last_seen=None, retry_in=retry_in, retry_now_in=retry_now_in,
    )

@router.post("/release")
async def release_bms():
    """Drop BLE connection so Power Queen app can connect."""
    await battery_ble.release()
    db.log_event("bms", value="released")
    return {"status": "released", "message": "BMS connection released — Power Queen app can now connect"}

@router.post("/retry")
async def retry_bms():
    """
    Try the BMS now instead of waiting out the reconnect timer.

    Refused with 429 until MIN_RETRY_GAP has passed since the last failed
    attempt: rapid reconnects can lock the BMS up, and the only cure is
    cutting its power. A released BMS is not retried here; use /connect.
    """
    if battery_ble.get_retry_now_in() is None:
        return {"status": "idle", "message": "Nothing to retry: the BMS is connected or released"}
    wait = await battery_ble.retry_now()
    if wait:
        raise HTTPException(
            status_code=429,
            detail=f"Too soon: try again in {wait}s. Retrying the BMS too fast can lock it up.",
        )
    db.log_event("bms", value="retry")
    return {"status": "retrying", "message": "Trying the BMS now"}

@router.post("/connect")
async def connect_bms():
    """Resume BLE connection immediately."""
    await battery_ble.reconnect()
    db.log_event("bms", value="reconnecting")
    return {"status": "connecting", "message": "Reconnecting to BMS"}

@router.get("/history/raw")
async def get_battery_history_raw(hours: int = 24, max_points: int = 300):
    """BMS readings from the last N hours, downsampled server-side."""
    return db.query_raw(hours=hours, source="bms", max_points=max_points)

@router.get("/history/hourly")
async def get_battery_history_hourly(days: int = 7):
    return db.query_hourly(days=days)

@router.get("/history/daily")
async def get_battery_history_daily(days: int = 30):
    return db.query_daily(days=days)

@router.get("/history/monthly")
async def get_battery_history_monthly():
    return db.query_monthly()
