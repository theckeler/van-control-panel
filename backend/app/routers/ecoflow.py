from fastapi import APIRouter
from pydantic import BaseModel
from app.services import ecoflow_ble

router = APIRouter()

class EcoflowData(BaseModel):
    battery_percent: int | None
    serial: str | None
    charge_state: str | None
    connected: bool

@router.get("/", response_model=EcoflowData)
async def get_ecoflow():
    """
    Current EcoFlow River 2 Max battery level.

    Decoded from an unencrypted byte in the BLE advertisement's manufacturer
    data, not an official API — confirmed once against the unit's own screen
    (see services/ecoflow_ble.py for the exact offset and caveats). Only
    battery percentage is decoded; charge/discharge watts are not.

    charge_state is inferred from the % trend over a 10-minute window, not
    real telemetry — "charging"/"discharging"/"idle", or null when there
    isn't yet enough history to say (fresh boot, or been stale a while).
    """
    r = ecoflow_ble.get_latest()
    return EcoflowData(
        battery_percent=r.battery_percent,
        serial=r.serial,
        charge_state=r.charge_state,
        connected=r.connected,
    )
