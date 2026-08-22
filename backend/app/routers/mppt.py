from fastapi import APIRouter
from pydantic import BaseModel
from app.services.victron_ble import get_latest

router = APIRouter()

class MpptData(BaseModel):
    panel_voltage: float        # Not available via BLE — always 0.0
    panel_power: float          # get_solar_power()
    battery_voltage: float
    battery_current: float      # get_battery_charging_current()
    charge_state: str
    daily_yield: float          # Wh today
    total_yield: float          # Not available via BLE — always 0.0
    max_power_today: float      # Not available via BLE — always 0.0
    error_code: int
    connected: bool

@router.get("/", response_model=MpptData)
async def get_mppt():
    """Get current MPPT 75/15 data via Victron BLE."""
    r = get_latest()
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

@router.get("/history")
async def get_mppt_history(days: int = 7):
    return {"days": days, "data": []}
