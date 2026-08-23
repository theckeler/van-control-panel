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


# /run is root-only and van-api runs as todd, so the marker lives in /tmp.
# van-api.service does not set PrivateTmp, so the root-run dispatcher sees the
# same file. Cleared on reboot, which is the right lifetime for an override.
_OVERRIDE_FILE = "/tmp/prefer-starlink.override"
_OVERRIDE_SECONDS = 1800


async def list_profiles() -> list[dict]:
    """Known WiFi connection profiles, and which one is active."""
    out = await _run("nmcli", "-t", "-f", "NAME,TYPE", "connection", "show")
    active = await _run("nmcli", "-t", "-f", "NAME,DEVICE", "connection", "show", "--active")

    active_name = None
    for line in active.splitlines():
        name, _, dev = line.rpartition(":")
        if dev == IFACE:
            active_name = name

    profiles = []
    for line in out.splitlines():
        name, _, kind = line.rpartition(":")
        if kind == "802-11-wireless":
            profiles.append({"name": name, "active": name == active_name})
    return profiles


async def switch_profile(name: str) -> tuple[bool, str]:
    """
    Bring up a WiFi profile by name.

    Writes an override marker so the prefer-starlink dispatcher does not undo
    a deliberate choice on its next event. Without it, manually selecting the
    fallback would be reverted inside the dispatcher's cooldown.

    The name is validated against existing profiles and passed as argv, never
    through a shell.
    """
    global _cache

    valid = {p["name"] for p in await list_profiles()}
    if name not in valid:
        return False, f"Unknown WiFi profile: {name}"

    try:
        with open(_OVERRIDE_FILE, "w") as f:
            f.write(str(int(time.time()) + _OVERRIDE_SECONDS))
    except OSError:
        pass  # best effort — the switch still happens

    # Needs sudo: polkit denies "control networking" to a non-interactive
    # session, even for a user in netdev. Same pattern as shutdown/reboot.
    try:
        proc = await asyncio.create_subprocess_exec(
            "sudo", "nmcli", "connection", "up", name,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=30.0)
    except (OSError, asyncio.TimeoutError):
        _cache = None
        return False, "Timed out bringing the connection up"

    # Clear after the switch, not before — a /system/ poll landing mid-switch
    # would otherwise re-cache the old association for another 15s.
    _cache = None
    return proc.returncode == 0, out.decode(errors="replace").strip()
