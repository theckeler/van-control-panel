from fastapi import APIRouter
from pydantic import BaseModel
from app.services import ecoflow_ble

router = APIRouter()

class EcoflowData(BaseModel):
    battery_percent: int | None
    serial: str | None
    connected: bool

@router.get("/", response_model=EcoflowData)
async def get_ecoflow():
    """
    Current EcoFlow River 2 Max battery level.

    Decoded from an unencrypted byte in the BLE advertisement's manufacturer
    data, not an official API — confirmed once against the unit's own screen
    (see services/ecoflow_ble.py for the exact offset and caveats). Only
    battery percentage is decoded; charge/discharge watts are not.
    """
    r = ecoflow_ble.get_latest()
    return EcoflowData(
        battery_percent=r.battery_percent,
        serial=r.serial,
        connected=r.connected,
    )
