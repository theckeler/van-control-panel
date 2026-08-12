from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

# Orion-Tr 12/12-18 is non-smart — static config until upgraded to Orion XS 50A
class OrionData(BaseModel):
    enabled: bool           # Manual toggle
    input_voltage_min: float
    input_voltage_max: float
    output_voltage: float
    max_current: float
    max_power: float
    note: str

_orion_enabled = False

ORION_STATIC = OrionData(
    enabled=False,
    input_voltage_min=8.0,
    input_voltage_max=17.0,
    output_voltage=13.6,
    max_current=18.0,
    max_power=220.0,
    note="Non-smart unit. Static config. Upgrade to Orion XS 50A for live data."
)

@router.get("/", response_model=OrionData)
async def get_orion():
    """Get Orion-Tr DC-DC status (static until XS upgrade)."""
    return {**ORION_STATIC.model_dump(), "enabled": _orion_enabled}

@router.post("/toggle")
async def toggle_orion(enabled: bool):
    """Manually toggle Orion-Tr display state."""
    global _orion_enabled
    _orion_enabled = enabled
    return {"enabled": _orion_enabled}
