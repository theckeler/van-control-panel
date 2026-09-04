"""
Periodic camera capture, driven by the active operating mode's interval.

Reuses camera.py's own capture() rather than duplicating the v4l2-ctl
invocation, so there's exactly one place that knows how to talk to the
hardware. /photos/latest still always captures fresh on request (see its
docstring) — this loop exists to build up history, not to serve the live
dashboard view.

Retention: sweeps each camera's photo directory once an hour and deletes
anything older than 24h. Checked every cycle but only actually runs once
RETAIN_SWEEP_EVERY has elapsed, so a short capture interval (trail mode,
15 min) doesn't mean an unnecessary directory scan every 15 min too.
"""
import asyncio
import glob
import logging
import os
import time

from app.routers import camera, mode

logger = logging.getLogger(__name__)

STARTUP_DELAY = 10  # let BLE/network get first crack at startup; nothing here is time-critical
RETAIN_SECONDS = 24 * 3600
RETAIN_SWEEP_EVERY = 3600

_last_sweep = 0.0


def _prune_old(cam: str) -> None:
    global _last_sweep
    now = time.time()
    if now - _last_sweep < RETAIN_SWEEP_EVERY:
        return
    _last_sweep = now

    cam_dir = os.path.join(camera.PHOTOS_BASE, cam)
    cutoff = now - RETAIN_SECONDS
    removed = 0
    for path in glob.glob(os.path.join(cam_dir, "*.jpg")):
        try:
            if os.path.getmtime(path) < cutoff:
                os.remove(path)
                removed += 1
        except OSError:
            pass
    if removed:
        logger.info("camera_loop: pruned %d photo(s) older than 24h from %s", removed, cam)


async def run() -> None:
    await asyncio.sleep(STARTUP_DELAY)

    while True:
        config = mode.get_current_mode_config()
        interval_s = max(60, config["camera_interval_min"] * 60)

        for cam, device in camera.DEVICE_MAP.items():
            if not os.path.exists(device):
                continue  # not physically installed — exterior, today
            try:
                await camera.capture(cam)
            except Exception as exc:
                # Best-effort: a stuck/unplugged camera shouldn't take down
                # the loop or spam retries faster than the interval allows.
                logger.warning("camera_loop: %s capture failed — %s", cam, exc)
            _prune_old(cam)

        await asyncio.sleep(interval_s)
