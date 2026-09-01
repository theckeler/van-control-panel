import asyncio
import re
import time

# iwconfig lives in /usr/sbin, which is not on PATH for non-login shells.
IWCONFIG = "/usr/sbin/iwconfig"
# wlan0 is the TwitchWiFi hotspot (AP mode, 10.42.0.1) — it has no upstream
# association to report. wlan1 is the uplink: Starlink primary, OHeck fallback.
IFACE = "wlan1"
HOTSPOT_IFACE = "wlan0"
HOTSPOT_CONNECTION = "TwitchWiFi"

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
        # ESSID:"Starlink" or "OHeckNo" — off/any when not associated
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


async def get_eth0() -> dict:
    """
    Wired rescue-port status: is a cable physically connected and linked.

    Reads the kernel carrier flag directly — /sys/class/net/eth0/carrier is
    '1' when a cable is plugged in and the link is up, '0' otherwise. No
    subprocess, no parsing, just a one-byte file read, so it's cheap enough
    to include on every /system/ poll without a cache.

    eth0 is the always-on wired fallback (10.55.0.1, shared/DHCP) for reaching
    the Pi when WiFi is off — see scripts/setup-eth0-rescue.md.
    """
    connected = False
    try:
        with open("/sys/class/net/eth0/carrier") as f:
            connected = f.read().strip() == "1"
    except OSError:
        # carrier read fails with EINVAL when the interface is fully down;
        # that just means no link, which is the default anyway.
        connected = False
    return {"connected": connected}


async def get_hotspot() -> dict:
    """
    wlan0 hotspot status — active state and the SSID it's broadcasting.

    Reads the connection's configured SSID rather than assuming
    'TwitchWiFi' — the profile name and the broadcast SSID aren't
    guaranteed to match, even though they do today.
    """
    out = await _run("nmcli", "-t", "-f", "NAME,DEVICE", "connection", "show", "--active")
    active = False
    for line in out.splitlines():
        name, _, dev = line.rpartition(":")
        if name == HOTSPOT_CONNECTION and dev == HOTSPOT_IFACE:
            active = True

    ssid = None
    if active:
        raw = await _run("nmcli", "-t", "-f", "802-11-wireless.ssid", "connection", "show", HOTSPOT_CONNECTION)
        _, _, value = raw.strip().partition(":")
        ssid = value or HOTSPOT_CONNECTION

    return {"active": active, "ssid": ssid}


async def set_hotspot(on: bool) -> tuple[bool, str]:
    """
    Bring the TwitchWiFi hotspot up or down on wlan0.

    Turning it off drops any client currently connected over TwitchWiFi
    (including a phone viewing this dashboard on that network) — Tailscale
    and an OHeck/Starlink-connected client are unaffected. Needs sudo, same
    as the wlan1 switch endpoints.
    """
    action = "up" if on else "down"
    try:
        proc = await asyncio.create_subprocess_exec(
            "sudo", "nmcli", "connection", action, HOTSPOT_CONNECTION,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=15.0)
    except (OSError, asyncio.TimeoutError):
        return False, "Timed out"
    return proc.returncode == 0, out.decode(errors="replace").strip()


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


async def scan_networks() -> list[dict]:
    """
    Return available WiFi networks on the uplink interface.

    Uses --rescan auto so NM returns its cached results immediately.
    --rescan yes forces a fresh scan that takes ~10s and exceeds the
    nginx proxy_read_timeout, killing the request before it completes.
    NM rescans in the background on its own schedule, so cached results
    are already fresh enough for a UI picker.
    Deduplicates SSIDs, sorts by signal descending.
    """
    try:
        proc = await asyncio.create_subprocess_exec(
            "nmcli", "-f", "SSID,SIGNAL,SECURITY", "-m", "multiline",
            "device", "wifi", "list", "ifname", IFACE, "--rescan", "auto",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=5.0)
        text = out.decode(errors="replace")
    except (OSError, asyncio.TimeoutError):
        return []

    networks: list[dict] = []
    seen: set[str] = set()
    current: dict = {}

    def _flush() -> None:
        ssid = current.get("ssid", "").strip()
        if ssid and ssid != "--" and ssid not in seen:
            seen.add(ssid)
            networks.append({
                "ssid": ssid,
                "signal": current.get("signal"),
                "security": current.get("security"),
            })

    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        key, _, value = line.partition(":")
        value = value.strip()
        k = key.strip().lower()
        if k == "ssid":
            _flush()   # save previous record before starting a new one
            current = {"ssid": value}
        elif k == "signal":
            current["signal"] = int(value) if value.isdigit() else None
        elif k == "security":
            current["security"] = value if value and value != "--" else None

    _flush()  # save the last record

    return sorted(networks, key=lambda n: n.get("signal") or 0, reverse=True)


async def connect_network(ssid: str, password: str) -> tuple[bool, str]:
    """
    Connect wlan1 to a WiFi network, creating a new profile for it.

    Like switch_profile, this writes an override marker so the
    prefer-starlink dispatcher doesn't immediately undo the change.
    The SSID and password are passed as argv, never through a shell.
    """
    global _cache

    try:
        with open(_OVERRIDE_FILE, "w") as f:
            f.write(str(int(time.time()) + _OVERRIDE_SECONDS))
    except OSError:
        pass

    try:
        proc = await asyncio.create_subprocess_exec(
            "sudo", "nmcli", "device", "wifi", "connect", ssid,
            "password", password, "ifname", IFACE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=30.0)
    except (OSError, asyncio.TimeoutError):
        _cache = None
        return False, "Timed out connecting"

    _cache = None
    return proc.returncode == 0, out.decode(errors="replace").strip()


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
