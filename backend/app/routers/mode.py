from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

MODES = {
    "storage": {
        "label": "Storage",
        "camera_interval_min": 360,
        "camera_exterior_only": False,
        "shellys_off": True,
        "description": "Minimum draw. Battery preservation. Long term parking.",
    },
    "camp": {
        "label": "Camp",
        "camera_interval_min": 30,
        "camera_exterior_only": False,
        "shellys_off": False,
        "description": "Default active use mode. Shelly schedules active.",
    },
    "trail": {
        "label": "Trail",
        "camera_interval_min": 15,
        "camera_exterior_only": False,
        "shellys_off": False,
        "description": "Van parked and unattended while you're out biking or hiking. Both cameras active, Shellys manual only.",
    },
    "in_town": {
        "label": "In Town",
        "camera_interval_min": 30,
        "camera_exterior_only": False,
        "shellys_off": False,
        "description": "Full connectivity. Cooler monitoring active.",
    },
}

_current_mode = "camp"

class ModeResponse(BaseModel):
    current: str
    config: dict
    available: list[str]

@router.get("/current", response_model=ModeResponse)
async def get_current_mode():
    """Get the current active mode and its config."""
    return ModeResponse(
        current=_current_mode,
        config=MODES[_current_mode],
        available=list(MODES.keys())
    )

@router.post("/{mode_name}", response_model=ModeResponse)
async def set_mode(mode_name: str):
    """Switch the active operating mode."""
    global _current_mode
    if mode_name not in MODES:
        raise HTTPException(status_code=400, detail=f"Unknown mode: {mode_name}. Valid: {list(MODES.keys())}")
    _current_mode = mode_name
    # TODO: apply mode — update systemd timer intervals, Shelly schedules
    return ModeResponse(
        current=_current_mode,
        config=MODES[_current_mode],
        available=list(MODES.keys())
    )
