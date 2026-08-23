from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pathlib import Path
import json
import os
import tempfile

from app.services import db

router = APIRouter()

# Sits next to van_power.db in the backend directory. Gitignored.
STATE_FILE = Path(__file__).resolve().parents[2] / "mode.json"
DEFAULT_MODE = "camp"

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

def _load_mode() -> str:
    """
    Read the persisted mode, falling back to the default if the file is
    missing, unreadable, or names a mode that no longer exists.
    """
    try:
        with open(STATE_FILE) as f:
            mode = json.load(f).get("mode")
        if mode in MODES:
            return mode
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        pass
    return DEFAULT_MODE


def _save_mode(mode: str) -> None:
    """
    Write atomically — temp file then rename.

    The van loses power abruptly (12V disconnect, low-voltage cutoff), and a
    partial write would leave unparseable JSON. Rename is atomic on the same
    filesystem, so the file is either the old mode or the new one, never a
    half-written mix.

    Persistence is best-effort: a read-only filesystem should not stop the
    mode change from taking effect in memory.
    """
    try:
        fd, tmp = tempfile.mkstemp(dir=STATE_FILE.parent, suffix=".tmp")
        with os.fdopen(fd, "w") as f:
            json.dump({"mode": mode}, f)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, STATE_FILE)
    except OSError:
        pass


_current_mode = _load_mode()

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
    _save_mode(mode_name)
    db.log_event("mode", value=mode_name)
    # TODO: apply mode — update systemd timer intervals, Shelly schedules
    return ModeResponse(
        current=_current_mode,
        config=MODES[_current_mode],
        available=list(MODES.keys())
    )
