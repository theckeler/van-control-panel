from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx

router = APIRouter()

# Shelly Gen4 unit config — update IPs to match your network
SHELLY_UNITS = {
    "maxxfan":  {"ip": "192.168.1.101", "label": "Maxxfan",       "channel": 0},
    "lights":   {"ip": "192.168.1.102", "label": "Ceiling Lights", "channel": 0},
    "usb":      {"ip": "192.168.1.103", "label": "USB Outlets",    "channel": 0},
    "spare":    {"ip": "192.168.1.104", "label": "Spare",          "channel": 0},
}

class ShellyStatus(BaseModel):
    id: str
    label: str
    on: bool
    ip: str

class ShellyToggle(BaseModel):
    on: bool

async def get_shelly_state(unit_id: str) -> bool:
    """Get relay state from Shelly Gen4 REST API."""
    unit = SHELLY_UNITS.get(unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail=f"Shelly unit {unit_id} not found")
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(f"http://{unit['ip']}/rpc/Switch.GetStatus?id={unit['channel']}")
            data = r.json()
            return data.get("output", False)
    except Exception:
        return False

@router.get("/", response_model=list[ShellyStatus])
async def get_all_shelly():
    """Get status of all Shelly units."""
    results = []
    for unit_id, unit in SHELLY_UNITS.items():
        on = await get_shelly_state(unit_id)
        results.append(ShellyStatus(id=unit_id, label=unit["label"], on=on, ip=unit["ip"]))
    return results

@router.get("/{unit_id}", response_model=ShellyStatus)
async def get_shelly(unit_id: str):
    """Get status of a single Shelly unit."""
    unit = SHELLY_UNITS.get(unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail=f"Shelly unit {unit_id} not found")
    on = await get_shelly_state(unit_id)
    return ShellyStatus(id=unit_id, label=unit["label"], on=on, ip=unit["ip"])

@router.post("/{unit_id}/toggle")
async def toggle_shelly(unit_id: str, body: ShellyToggle):
    """Toggle a Shelly unit on or off."""
    unit = SHELLY_UNITS.get(unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail=f"Shelly unit {unit_id} not found")
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            on_str = "true" if body.on else "false"
            await client.get(f"http://{unit['ip']}/rpc/Switch.Set?id={unit['channel']}&on={on_str}")
        return {"unit_id": unit_id, "on": body.on}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Could not reach Shelly unit: {e}")
