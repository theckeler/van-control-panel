from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from datetime import datetime, timezone
import asyncio
import logging
import os
import glob

logger = logging.getLogger(__name__)

router = APIRouter()

PHOTOS_BASE = os.path.join(os.path.dirname(__file__), "..", "..", "photos")
DEVICE_MAP = {"interior": "/dev/video0", "exterior": "/dev/video2"}

# UVC controls for the interior camera. They live on the USB device itself,
# not in any app state, so they reset to factory defaults on every reboot or
# unplug/replug — hence re-applying them before every capture rather than
# trusting them to persist.
#
# Fitted 2026-10-19 to the Logitech C922 Pro Stream (046d:085c) that replaced
# the cheap "HD USB Camera" (32e4:9520). Everything before that was tuned for
# the old camera, whose ranges differ (brightness 0-15, default 8; the C922 is
# 0-255, default 128), so none of those numbers carry over. Measured on the
# C922 against the real interior scene:
#   - brightness: 0 is the DARKEST setting here, not a reset (mean luma ~26,
#     interior nearly black). The default 128 gives ~76.
#   - auto_exposure: the camera only accepts 1 (manual) or 3 (aperture
#     priority = auto). 0 was rejected with EINVAL on every capture, silently.
#   - focus: manual 0-20 is sharp, 30+ is soft, and continuous autofocus was
#     blurry both on the first frame and after 15 settled frames. So autofocus
#     stays off and focus stays at 0 (infinity, the widest depth of field).
#   - backlight_compensation: the scene is lit from the window; turning it on
#     lifts the interior (luma ~76 -> ~86) at the cost of some window highlight.
# Check ranges with `v4l2-ctl -d /dev/video0 --list-ctrls-menus` before
# changing anything: a value the driver CLAMPS (e.g. brightness=999) still
# returns success, so a wrong-but-valid value cannot be detected from here.
CAMERA_TUNING = {
    "interior": [
        ("focus_automatic_continuous", "0"),
        ("focus_absolute", "0"),
        ("brightness", "128"),
        ("auto_exposure", "3"),
        ("backlight_compensation", "1"),
    ],
}

# (cam, control, value) combinations already reported, so a permanently
# rejected setting logs once per process instead of on every capture.
_tuning_warned: set[tuple[str, str, str]] = set()


def _warn_tuning_once(cam: str, ctrl: str, value: str, detail: str) -> None:
    key = (cam, ctrl, value)
    if key in _tuning_warned:
        return
    _tuning_warned.add(key)
    logger.warning(
        "camera %s: %s=%s was not applied (%s). The camera may not support this "
        "control or value — check `v4l2-ctl --list-ctrls-menus`",
        cam, ctrl, value, detail or "no detail",
    )


async def _apply_tuning(cam: str, device: str) -> None:
    """Best-effort — a tuning failure should not block the capture itself.

    A rejected setting used to vanish: stderr went to DEVNULL, so
    auto_exposure=0 failed on every capture for weeks without a trace. It is
    now reported (once) but still never blocks the capture."""
    controls = CAMERA_TUNING.get(cam, [])
    for ctrl, value in controls:
        try:
            proc = await asyncio.create_subprocess_exec(
                "v4l2-ctl", "-d", device, "-c", f"{ctrl}={value}",
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                _, err = await asyncio.wait_for(proc.communicate(), timeout=3.0)
            except asyncio.TimeoutError:
                proc.kill()
                try:
                    # Reap it, but bounded: a v4l2-ctl stuck inside a USB call
                    # may not die promptly, and an unbounded wait here would be
                    # exactly the kind of hang the BLE services were fixed for.
                    await asyncio.wait_for(proc.wait(), timeout=2.0)
                except asyncio.TimeoutError:
                    pass
                _warn_tuning_once(cam, ctrl, value, "v4l2-ctl timed out")
                continue
            if proc.returncode != 0:
                _warn_tuning_once(
                    cam, ctrl, value, err.decode(errors="replace").strip().replace("\n", "; ")
                )
        except OSError as exc:
            _warn_tuning_once(cam, ctrl, value, f"could not run v4l2-ctl: {exc}")
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
