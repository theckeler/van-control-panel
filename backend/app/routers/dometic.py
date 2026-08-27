from fastapi import APIRouter
from pydantic import BaseModel
from app.services import dometic

router = APIRouter()

class FridgeData(BaseModel):
    temp_c: float | None
    set_temp_c: float | None
    battery_voltage: float | None
    cooler_on: bool | None
    door_open: bool | None
    power_source: str | None
    reachable: bool

@router.get("/", response_model=FridgeData)
async def get_fridge():
    """
    Current Dometic CFX535 state, read from the ESP32 bridge's local JSON API.

    `reachable` false means the ESP32 itself didn't answer — could be
    unplugged, WiFi is down, or it hasn't finished (re)bonding to the fridge
    yet after a reboot. It does not distinguish that from "bonded but the
    fridge itself is unreachable"; the ESP32's own logs are the place to
    check that distinction if it matters.
    """
    r = dometic.get_latest()
    return FridgeData(
        temp_c=r.temp_c,
        set_temp_c=r.set_temp_c,
        battery_voltage=r.battery_voltage,
        cooler_on=r.cooler_on,
        door_open=r.door_open,
        power_source=r.power_source,
        reachable=r.reachable,
    )
