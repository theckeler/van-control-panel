from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from datetime import datetime, timezone
import asyncio
import os
import glob

router = APIRouter()

PHOTOS_BASE = os.path.join(os.path.dirname(__file__), "..", "..", "photos")
DEVICE_MAP = {"interior": "/dev/video0", "exterior": "/dev/video2"}

async def _capture(cam: str) -> dict:
    device = DEVICE_MAP.get(cam)
    if not device or not os.path.exists(device):
        raise HTTPException(status_code=503, detail=f"{cam} camera not connected")

    cam_dir = os.path.join(PHOTOS_BASE, cam)
    os.makedirs(cam_dir, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    filename = f"{cam}_{stamp}.jpg"
    path = os.path.join(cam_dir, filename)

    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", "-y", "-f", "v4l2", "-video_size", "1280x720",
        "-i", device, "-frames:v", "1", "-update", "1", path,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=10.0)
    except asyncio.TimeoutError:
        proc.kill()
        raise HTTPException(status_code=504, detail="capture timed out")

    if proc.returncode != 0 or not os.path.exists(path):
        raise HTTPException(status_code=500, detail=stderr.decode(errors="replace")[-300:])

    return {"filename": filename, "url": f"/static/photos/{cam}/{filename}", "cam": cam}

def get_photos(camera: str, limit: int = 20) -> list[dict]:
    """Get list of photos for a camera, most recent first."""
    cam_dir = os.path.join(PHOTOS_BASE, camera)
    if not os.path.exists(cam_dir):
        return []
    files = sorted(glob.glob(os.path.join(cam_dir, "*.jpg")), reverse=True)
    return [
        {
            "filename": os.path.basename(f),
            "url": f"/static/photos/{camera}/{os.path.basename(f)}",
            "timestamp": os.path.basename(f).replace(f"{camera}_", "").replace(".jpg", ""),
        }
        for f in files[:limit]
    ]

@router.get("/latest")
async def get_latest(cam: str = "interior"):
    """Get most recent photo for a camera. Only one camera exists today
    (interior, /dev/video0), so this captures fresh rather than serving a
    stale file — there's no background capture loop yet."""
    if cam not in ("interior", "exterior"):
        raise HTTPException(status_code=400, detail="cam must be interior or exterior")
    return await _capture(cam)

@router.get("/recent")
async def get_recent(cam: str = "interior", limit: int = 20):
    """Get recent photos for swipe gallery."""
    if cam not in ("interior", "exterior"):
        raise HTTPException(status_code=400, detail="cam must be interior or exterior")
    return get_photos(cam, limit=limit)

@router.post("/capture")
async def trigger_capture(cam: str = "interior"):
    """Trigger an on-demand capture (e.g. from Shelly motion event)."""
    if cam not in ("interior", "exterior"):
        raise HTTPException(status_code=400, detail="cam must be interior or exterior")
    return await _capture(cam)
