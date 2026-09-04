from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from datetime import datetime, timezone
import asyncio
import os
import glob

router = APIRouter()

PHOTOS_BASE = os.path.join(os.path.dirname(__file__), "..", "..", "photos")
DEVICE_MAP = {"interior": "/dev/video0", "exterior": "/dev/video2"}

# UVC controls tuned on 2026-08-25 for the interior camera's mounting
# position at the time (very close subject, backlit through a window). These
# live on the USB device itself, not in any app state, so they reset to
# factory defaults on every reboot or unplug/replug — hence re-applying them
# before every capture rather than trusting them to persist.
#
# Re-tuned 2026-09-04 after a physical remount: camera moved to the door,
# now shooting outward across the doorway at open ground several feet out —
# a much farther subject than the original close-up calibration, and no
# longer backlit through glass. Old values (focus_absolute=5, brightness=15)
# badly overexposed the new scene. Swept both fresh, visually rather than
# via Laplacian variance this time: focus 0 and 10 were both sharp, 16
# (the UVC default) visibly blurrier — lower focus_absolute reaches farther,
# consistent with the subject now being much farther away. brightness 4 held
# real grass texture without blowing out highlights; 8 (default) and 15
# (the old value) both washed the scene toward white.
CAMERA_TUNING = {
    "interior": [
        ("focus_automatic_continuous", "0"),
        ("focus_absolute", "0"),
        ("brightness", "4"),
        ("auto_exposure", "3"),
    ],
}

async def _apply_tuning(cam: str, device: str) -> None:
    """Best-effort — a tuning failure should not block the capture itself."""
    controls = CAMERA_TUNING.get(cam, [])
    for ctrl, value in controls:
        try:
            proc = await asyncio.create_subprocess_exec(
                "v4l2-ctl", "-d", device, "-c", f"{ctrl}={value}",
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await asyncio.wait_for(proc.wait(), timeout=3.0)
        except (OSError, asyncio.TimeoutError):
            pass
    # The control value updates in the driver instantly, but the physical
    # focus motor needs time to actually move. Capturing immediately after
    # setting focus_absolute produced a sharp *setting* and a blurry
    # *image* (measured: sharpness ~95 vs ~1060 with this delay) —
    # discovered the hard way when the first version of this function had
    # no delay at all.
    if controls:
        await asyncio.sleep(0.4)

async def capture(cam: str) -> dict:
    """Capture one frame for `cam`. Called from the routes below and from
    services/camera_loop.py's periodic background capture."""
    device = DEVICE_MAP.get(cam)
    if not device or not os.path.exists(device):
        raise HTTPException(status_code=503, detail=f"{cam} camera not connected")

    await _apply_tuning(cam, device)

    cam_dir = os.path.join(PHOTOS_BASE, cam)
    os.makedirs(cam_dir, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    filename = f"{cam}_{stamp}.jpg"
    path = os.path.join(cam_dir, filename)

    # v4l2-ctl instead of ffmpeg — ffmpeg's dependency chain (mesa, gtk3,
    # vulkan, etc.) OOM-crashed the Pi's 1GB RAM twice mid-install, 2026-08-31.
    # v4l2-ctl is already on the box (used for _apply_tuning above) and this
    # UVC camera does its own onboard MJPEG encoding, so asking for MJPG and
    # writing one stream frame straight to disk *is* a complete JPEG file —
    # no transcoding, no extra process, no extra package.
    proc = await asyncio.create_subprocess_exec(
        "v4l2-ctl", "-d", device,
        "--set-fmt-video=width=1280,height=720,pixelformat=MJPG",
        "--stream-mmap", "--stream-count=1", f"--stream-to={path}",
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

    return {
        "filename": filename,
        "url": f"/static/photos/{cam}/{filename}",
        "cam": cam,
        "timestamp": _filename_to_iso(filename, cam),
    }

def _filename_to_iso(filename: str, cam: str) -> str:
    """cam_20260826T004512Z.jpg -> 2026-08-26T00:45:12+00:00"""
    raw = filename.replace(f"{cam}_", "").replace(".jpg", "")
    dt = datetime.strptime(raw, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
    return dt.isoformat()

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
            "timestamp": _filename_to_iso(os.path.basename(f), camera),
        }
        for f in files[:limit]
    ]

@router.get("/latest")
async def get_latest(cam: str = "interior"):
    """Get most recent photo for a camera. Only one camera exists today
    (interior, /dev/video0). Captures fresh on every call rather than
    trusting the background loop's last frame — the loop's interval can be
    minutes long, and a request for "latest" should mean now, not whenever
    the loop last happened to run."""
    if cam not in ("interior", "exterior"):
        raise HTTPException(status_code=400, detail="cam must be interior or exterior")
    return await capture(cam)

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
    return await capture(cam)
