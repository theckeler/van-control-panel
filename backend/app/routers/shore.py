from fastapi import APIRouter
from pydantic import BaseModel
from app.services import battery_ble, victron_ble

router = APIRouter()

# Threshold above which we infer shore/external charging is active.
# Accounts for measurement noise between BMS and MPPT current sensors.
SHORE_INFERENCE_THRESHOLD = 1.0  # A

class ShoreData(BaseModel):
    connected: bool
    charge_mode: str
    battery_voltage: float
    charge_current: float
    error_code: int
    inferred: bool   # True = derived from BMS/MPPT delta, not VE.Direct

@router.get("/", response_model=ShoreData)
async def get_shore():
    """
    Infer shore charger state from the delta between BMS current and MPPT current.
    If BMS is charging faster than solar can account for, shore is active.
    Not as accurate as VE.Direct — upgrade path: add VE.Direct cable for live data.
    """
    bms  = battery_ble.get_latest()
    mppt = victron_ble.get_latest()

    bms_ok  = battery_ble.is_connected()
    mppt_ok = mppt and not mppt.is_stale

    bms_current  = float(bms.current or 0) if bms and bms_ok else 0.0
    mppt_current = float(mppt.battery_charging_current or 0) if mppt_ok else 0.0

    # Any positive charging current not accounted for by MPPT
    inferred_shore = round(max(0.0, bms_current - mppt_current), 2)
    connected = inferred_shore >= SHORE_INFERENCE_THRESHOLD

    return ShoreData(
        connected=connected,
        charge_mode="Bulk" if connected else "Off",
        battery_voltage=round(mppt.battery_voltage, 2) if mppt_ok else 0.0,
        charge_current=inferred_shore,
        error_code=0,
        inferred=True,
    )
