from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import asyncio
import httpx

router = APIRouter()

SHELLY_UNITS = {
    "usb": {
        "ip": "shelly1g4-d885acec6aac.local",
        "label": "USB Outlets",
        "channel": 0,
        "installed": True,
        "est_watts": 20,   # typical device charging
    },
    "garage": {
        "ip": "shelly1g4-d885acf36a28.local",
        "label": "Garage",
        "channel": 0,
        "installed": True,
        "est_watts": 0,    # unknown load
    },
    # "maxxfan": {
    #     "ip": None,
    #     "label": "Maxxfan",
    #     "channel": 0,
    #     "installed": False,
    #     "est_watts": 30,
    # },
    # "lights": {
    #     "ip": None,
    #     "label": "Ceiling Lights",
    #     "channel": 0,
    #     "installed": False,
    #     "est_watts": 15,
    # },
}

class ShellyStatus(BaseModel):
    id: str
    label: str
    on: bool
    ip: str | None
    installed: bool
    reachable: bool = True

class ShellyToggle(BaseModel):
    on: bool

async def get_shelly_state(unit_id: str) -> tuple[bool, bool]:
    """
    Fetch live relay state. Returns (on, reachable).

    The reachable flag matters: a Shelly that can't be reached used to be
    reported as simply 'off', so a network split looked identical to two
    switched-off circuits on the dashboard. That masked three separate
    outages during the Starlink migration.
    """
    unit = SHELLY_UNITS.get(unit_id)
    if not unit or not unit["installed"]:
        return False, False
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(
                f"http://{unit['ip']}/rpc/Switch.GetStatus?id={unit['channel']}"
            )
            return r.json().get("output", False), True
    except Exception:
        return False, False

def _status(unit_id: str, unit: dict, on: bool, reachable: bool) -> ShellyStatus:
    return ShellyStatus(
        id=unit_id,
        label=unit["label"],
        on=on,
        ip=unit["ip"],
        installed=unit["installed"],
        reachable=reachable,
    )

@router.get("/", response_model=list[ShellyStatus])
async def get_all_shelly():
    """
    Status of all Shelly units.

    Fetched concurrently — sequential awaits meant total latency was the sum
    of every unit's, so one slow switch held up the whole response.
    """
    unit_ids = list(SHELLY_UNITS.keys())
    states = await asyncio.gather(
        *(get_shelly_state(uid) for uid in unit_ids)
    )
    return [
        _status(uid, SHELLY_UNITS[uid], on, reachable)
        for uid, (on, reachable) in zip(unit_ids, states)
    ]

@router.get("/{unit_id}", response_model=ShellyStatus)
async def get_shelly(unit_id: str):
    """Get status of a single Shelly unit."""
    unit = SHELLY_UNITS.get(unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail=f"Unknown unit: {unit_id}")
    on, reachable = await get_shelly_state(unit_id)
    return _status(unit_id, unit, on, reachable)

@router.post("/{unit_id}/toggle")
async def toggle_shelly(unit_id: str, body: ShellyToggle):
    """Toggle a Shelly relay on or off."""
    unit = SHELLY_UNITS.get(unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail=f"Unknown unit: {unit_id}")
    if not unit["installed"]:
        raise HTTPException(status_code=503, detail=f"{unit['label']} is not yet installed")
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            on_str = "true" if body.on else "false"
            await client.get(
                f"http://{unit['ip']}/rpc/Switch.Set?id={unit['channel']}&on={on_str}"
            )
        return {"unit_id": unit_id, "on": body.on}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Could not reach {unit['label']}: {e}")
