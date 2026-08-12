from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
import os
import glob

router = APIRouter()

PHOTOS_BASE = os.path.join(os.path.dirname(__file__), "..", "..", "photos")

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
    """Get most recent photo for a camera."""
    if cam not in ("interior", "exterior"):
        raise HTTPException(status_code=400, detail="cam must be interior or exterior")
    photos = get_photos(cam, limit=1)
    if not photos:
        raise HTTPException(status_code=404, detail="No photos found")
    return photos[0]

@router.get("/recent")
async def get_recent(cam: str = "interior", limit: int = 20):
    """Get recent photos for swipe gallery."""
    if cam not in ("interior", "exterior"):
        raise HTTPException(status_code=400, detail="cam must be interior or exterior")
    return get_photos(cam, limit=limit)

@router.post("/capture")
async def trigger_capture(cam: str = "exterior"):
    """Trigger an on-demand capture (e.g. from Shelly motion event)."""
    # TODO: call capture script
    return {"status": "capture_triggered", "cam": cam}
