from fastapi import APIRouter
from pydantic import BaseModel
from app.services import victron_ble, db

router = APIRouter()

class MpptData(BaseModel):
    panel_voltage: float
    panel_power: float
    battery_voltage: float
    battery_current: float
    charge_state: str
    daily_yield: float
    total_yield: float
    max_power_today: float
    error_code: int
    connected: bool

@router.get("/", response_model=MpptData)
async def get_mppt():
    """Get current MPPT 75/15 data via Victron BLE."""
    r = victron_ble.get_latest()
    return MpptData(
        panel_voltage=0.0,
        panel_power=r.solar_power,
        battery_voltage=r.battery_voltage,
        battery_current=r.battery_charging_current,
        charge_state=r.charge_state,
        daily_yield=r.daily_yield,
        total_yield=0.0,
        max_power_today=0.0,
        error_code=r.charger_error,
        connected=r.connected,
    )

@router.get("/history/raw")
async def get_mppt_history_raw(hours: int = 24):
    """Raw MPPT readings from the last N hours."""
    rows = db.query_raw(hours=hours)
    return [r for r in rows if r["source"] == "mppt"]

@router.get("/history/hourly")
async def get_mppt_history_hourly(days: int = 7):
    """Hourly averages for the last N days."""
    return db.query_hourly(days=days)

@router.get("/history/daily")
async def get_mppt_history_daily(days: int = 30):
    """Daily solar summaries — total yield, peak solar, avg voltage."""
    return db.query_daily(days=days)

@router.get("/history/monthly")
async def get_mppt_history_monthly():
    """All monthly summaries."""
    return db.query_monthly()
