"""
SD card disk image creation service.

State is module-level and resets on van-api restart. If a restart happens
mid-image, dd continues running as an orphan — use `sudo pkill -f "dd if=/dev/mmcblk0"`
to clean it up, then DELETE /system/disk-image to clear the output file.
"""

import asyncio
import datetime
from pathlib import Path

OUTPUT = Path("/tmp/van-pi-image.img.gz")

_job: dict | None = None


def get_status() -> dict:
    if _job is None:
        return {"state": None, "bytes_written": None, "filename": None, "error": None}
    return {
        "state": _job.get("state"),
        "bytes_written": _job.get("bytes_written"),
        "filename": _job.get("filename"),
        "error": _job.get("error"),
    }


async def start_job() -> None:
    global _job
    _job = {"state": "running", "bytes_written": 0, "filename": None, "error": None, "pid": None}
    cmd = f"sudo dd if=/dev/mmcblk0 bs=4M conv=sync,noerror 2>/dev/null | gzip -1 > {OUTPUT}"

    try:
        proc = await asyncio.create_subprocess_shell(
            cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        _job["pid"] = proc.pid

        while proc.returncode is None:
            if OUTPUT.exists():
                try:
                    _job["bytes_written"] = OUTPUT.stat().st_size
                except OSError:
                    pass
            await asyncio.sleep(3)

        if proc.returncode == 0 and OUTPUT.exists():
            _job["state"] = "done"
            _job["bytes_written"] = OUTPUT.stat().st_size
            _job["filename"] = f"van-pi-{datetime.date.today().isoformat()}.img.gz"
        else:
            _job["state"] = "error"
            _job["error"] = f"dd exited with code {proc.returncode}"

    except asyncio.CancelledError:
        _job["state"] = "error"
        _job["error"] = "cancelled"
        raise
    except Exception as e:
        _job["state"] = "error"
        _job["error"] = str(e)


async def cancel() -> None:
    global _job
    kill_proc = await asyncio.create_subprocess_exec(
        "sudo", "pkill", "-f", "dd if=/dev/mmcblk0",
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    await kill_proc.wait()
    OUTPUT.unlink(missing_ok=True)
    _job = None


def cleanup(path: Path) -> None:
    try:
        path.unlink(missing_ok=True)
    except Exception:
        pass
    global _job
    _job = None
