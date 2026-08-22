from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
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
    "maxxfan": {
        "ip": None,
        "label": "Maxxfan",
        "channel": 0,
        "installed": False,
        "est_watts": 30,
    },
    "lights": {
        "ip": None,
        "label": "Ceiling Lights",
        "channel": 0,
        "installed": False,
        "est_watts": 15,
    },
}

class ShellyStatus(BaseModel):
    id: str
    label: str
    on: bool
    ip: str | None
    installed: bool

class ShellyToggle(BaseModel):
    on: bool

async def get_shelly_state(unit_id: str) -> bool:
    """Fetch live relay state from a Shelly unit."""
    unit = SHELLY_UNITS.get(unit_id)
    if not unit or not unit["installed"]:
        return False
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(
                f"http://{unit['ip']}/rpc/Switch.GetStatus?id={unit['channel']}"
            )
            return r.json().get("output", False)
    except Exception:
        return False

@router.get("/", response_model=list[ShellyStatus])
async def get_all_shelly():
    """Get status of all Shelly units, installed and planned."""
    results = []
    for unit_id, unit in SHELLY_UNITS.items():
        on = await get_shelly_state(unit_id) if unit["installed"] else False
        results.append(ShellyStatus(
            id=unit_id,
            label=unit["label"],
            on=on,
            ip=unit["ip"],
            installed=unit["installed"],
        ))
    return results

@router.get("/{unit_id}", response_model=ShellyStatus)
async def get_shelly(unit_id: str):
    """Get status of a single Shelly unit."""
    unit = SHELLY_UNITS.get(unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail=f"Unknown unit: {unit_id}")
    on = await get_shelly_state(unit_id) if unit["installed"] else False
    return ShellyStatus(
        id=unit_id,
        label=unit["label"],
        on=on,
        ip=unit["ip"],
        installed=unit["installed"],
    )

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
