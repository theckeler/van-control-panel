import asyncio
import re
import time

# iwconfig lives in /usr/sbin, which is not on PATH for non-login shells.
IWCONFIG = "/usr/sbin/iwconfig"
IFACE = "wlan0"

# Association changes rarely, but /system/ is polled every 5s. Without a cache
# that is two subprocess spawns per poll, ~1,400 an hour, for an answer that
# changes maybe twice a day.
_CACHE_TTL = 15.0
_cache: tuple[dict, float] | None = None


async def _run(*args: str) -> str:
    """Run a command, return stdout. Empty string on any failure."""
    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=3.0)
        return out.decode(errors="replace")
    except (OSError, asyncio.TimeoutError):
        return ""


async def get_wifi() -> dict:
    """
    Current WiFi association: SSID, band, signal, retries, IP.

    Exists because a split between the Pi and the Shellys presented as
    'circuits unreachable' three separate times during the Starlink
    migration, and each one had to be diagnosed from a terminal. Showing the
    SSID makes it obvious at a glance.

    Best-effort throughout: a missing binary or unexpected output yields a
    null field, never an exception.
    """
    global _cache
    now = time.monotonic()
    if _cache and now - _cache[1] < _CACHE_TTL:
        return _cache[0]

    result: dict = {
        "ssid": None,
        "band": None,
        "signal_dbm": None,
        "bitrate_mbps": None,
        "tx_retries": None,
        "ip": None,
    }

    iw = await _run(IWCONFIG, IFACE)
    if iw:
        # ESSID:"Sir Salettelot" — off/any when not associated
        if m := re.search(r'ESSID[:=]"([^"]*)"', iw):
            result["ssid"] = m.group(1) or None
        if m := re.search(r"Frequency[:=]([\d.]+)\s*GHz", iw):
            ghz = float(m.group(1))
            result["band"] = "5GHz" if ghz > 3 else "2.4GHz"
        if m := re.search(r"Signal level[:=](-?\d+)\s*dBm", iw):
            result["signal_dbm"] = int(m.group(1))
        if m := re.search(r"Bit Rate[:=]([\d.]+)\s*Mb/s", iw):
            result["bitrate_mbps"] = float(m.group(1))
        if m := re.search(r"Tx excessive retries[:=](\d+)", iw):
            result["tx_retries"] = int(m.group(1))

    addr = await _run("ip", "-4", "-o", "addr", "show", IFACE)
    if m := re.search(r"inet (\d+\.\d+\.\d+\.\d+)", addr):
        result["ip"] = m.group(1)

    _cache = (result, now)
    return result
