import asyncio
import shutil
import time
from pathlib import Path

_CACHE_TTL = 10.0
_cache: tuple[dict, float] | None = None


async def _get_throttled() -> list[str]:
    """
    Throttle flags via vcgencmd. The sysfs equivalent does not exist on this
    kernel, so shell out; it is cheap and the result is cached.
    """
    try:
        proc = await asyncio.create_subprocess_exec(
            "/usr/bin/vcgencmd", "get_throttled",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=3.0)
        text = out.decode().strip()          # throttled=0x0
        raw = int(text.split("=", 1)[1], 16)
    except (OSError, asyncio.TimeoutError, ValueError, IndexError):
        return []
    return _throttle_flags(raw)


def _throttle_flags(raw: int) -> list[str]:
    """
    Decode vcgencmd-style throttle bits from /sys.

    Bits 0-3 are happening now, bits 16-19 have happened since boot. The
    'since boot' ones matter in a van: undervoltage during a compressor start
    or an alternator surge is exactly the kind of thing that corrupts an SD
    card, and it leaves no other trace.
    """
    now, ever = [], []
    for bit, label in ((0, "undervoltage"), (1, "arm-freq-capped"),
                       (2, "throttled"), (3, "soft-temp-limit")):
        if raw & (1 << bit):
            now.append(label)
        if raw & (1 << (bit + 16)):
            ever.append(f"{label}-since-boot")
    return now + ever


async def get_health() -> dict:
    global _cache
    t = time.monotonic()
    if _cache and t - _cache[1] < _CACHE_TTL:
        return _cache[0]

    # CPU temperature, millidegrees
    cpu_temp_c = None
    try:
        cpu_temp_c = round(
            int(Path("/sys/class/thermal/thermal_zone0/temp").read_text().strip()) / 1000, 1
        )
    except (OSError, ValueError):
        pass

    # Load averages
    load_1 = load_5 = None
    try:
        load_1, load_5, _ = (round(v, 2) for v in __import__("os").getloadavg())
    except OSError:
        pass

    # Memory
    mem_total_mb = mem_avail_mb = None
    try:
        info = {}
        for line in Path("/proc/meminfo").read_text().splitlines():
            k, _, v = line.partition(":")
            info[k] = int(v.strip().split()[0])
        mem_total_mb = round(info["MemTotal"] / 1024)
        mem_avail_mb = round(info["MemAvailable"] / 1024)
    except (OSError, KeyError, ValueError, IndexError):
        pass

    # Root filesystem
    disk_total_gb = disk_free_gb = None
    try:
        usage = shutil.disk_usage("/")
        disk_total_gb = round(usage.total / 1024**3, 1)
        disk_free_gb = round(usage.free / 1024**3, 1)
    except OSError:
        pass

    # Uptime
    uptime_s = None
    try:
        uptime_s = int(float(Path("/proc/uptime").read_text().split()[0]))
    except (OSError, ValueError, IndexError):
        pass

    throttle = await _get_throttled()

    result = {
        "cpu_temp_c": cpu_temp_c,
        "load_1": load_1,
        "load_5": load_5,
        "mem_total_mb": mem_total_mb,
        "mem_available_mb": mem_avail_mb,
        "disk_total_gb": disk_total_gb,
        "disk_free_gb": disk_free_gb,
        "uptime_s": uptime_s,
        "throttle": throttle,
    }
    _cache = (result, t)
    return result


async def get_last_backup() -> dict:
    """Age of the most recent local backup snapshot, if the send failed."""
    newest = None
    for d in (Path.home() / "van-backups-pending",):
        if not d.is_dir():
            continue
        for f in d.glob("*.gz"):
            m = f.stat().st_mtime
            if newest is None or m > newest:
                newest = m
    return {"pending_backup_age_s": int(time.time() - newest) if newest else None}
