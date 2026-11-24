from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import asyncio
import concurrent.futures
import logging
import socket
import time
import httpx

from app.services import db

router = APIRouter()
log = logging.getLogger(__name__)

# mDNS resolution of a .local name costs ~105ms (137ms by name vs 32ms by IP,
# measured on the Pi). At a 5s poll that is a lot of repeated work for an
# answer that rarely changes.
#
# But it does change: the Shellys moved between 192.168.1.129/.60 and
# 192.168.4.26/.175 three times in one day during the Starlink migration, so
# a permanent cache would break every time. Short TTL, and any request failure
# evicts the entry so the next call re-resolves.
_dns_cache: dict[str, tuple[str, float]] = {}
DNS_TTL = 300.0

# BLE and Starlink tasks saturate the default thread pool executor. A
# dedicated 2-thread pool keeps DNS resolution from queuing behind them.
_dns_executor = concurrent.futures.ThreadPoolExecutor(max_workers=2, thread_name_prefix="shelly-dns")


async def _resolve(hostname: str) -> str | None:
    """Resolve a .local name to an IP, cached for DNS_TTL seconds."""
    now = time.monotonic()
    hit = _dns_cache.get(hostname)
    if hit and now - hit[1] < DNS_TTL:
        return hit[0]
    try:
        loop = asyncio.get_running_loop()
        # Use a dedicated executor so BLE/Starlink tasks can't starve DNS.
        # wait_for catches the case where even the dedicated pool is busy.
        info = await asyncio.wait_for(
            loop.run_in_executor(
                _dns_executor,
                lambda: socket.getaddrinfo(hostname, None, family=socket.AF_INET),
            ),
            timeout=5.0,
        )
        ip = info[0][4][0]
        _dns_cache[hostname] = (ip, now)
        return ip
    except (socket.gaierror, OSError, IndexError, asyncio.TimeoutError):
        _dns_cache.pop(hostname, None)
        return None


def _evict(hostname: str) -> None:
    _dns_cache.pop(hostname, None)


# An unreachable unit costs a 3s timeout on every 5s poll, and a unit that is
# not wired up yet will never answer. So a unit that keeps failing is PAUSED:
# it is no longer polled (zero cost) until someone asks for a recheck from the
# dashboard (POST /shelly/{id}/recheck). In-memory only, so a van-api restart
# starts every unit unpaused and the policy runs again.
_failures: dict[str, int] = {}
_paused: set[str] = set()


# Polls run every 5s, so 3 failures in a row is about 15s (Todd, 2026-11-24).
# Pause too early and a unit that only dropped for a moment needs a manual
# refresh; pause too late and a dead unit keeps costing a 3s timeout per poll.
PAUSE_AFTER_FAILURES = 3


def _should_pause(consecutive_failures: int) -> bool:
    """True once a unit has failed this many polls in a row."""
    return consecutive_failures >= PAUSE_AFTER_FAILURES


def _record_failure(unit_id: str) -> None:
    n = _failures.get(unit_id, 0) + 1
    _failures[unit_id] = n
    if unit_id not in _paused and _should_pause(n):
        _paused.add(unit_id)
        log.info("shelly %s unreachable %d polls in a row, paused until rechecked", unit_id, n)


def _record_success(unit_id: str) -> None:
    _failures.pop(unit_id, None)
    if unit_id in _paused:
        _paused.discard(unit_id)
        log.info("shelly %s is back, polling resumed", unit_id)

SHELLY_UNITS = {
    "usb": {
        "ip": "shelly1g4-d885acec6aac.local",
        "label": "USB Outlets",
        "channel": 0,
        "installed": True,
        "est_watts": 20,   # typical device charging
    },
    "garage": {
        "ip": "shelly1g4-d885acf36a28.local",
        "label": "Garage",
        "channel": 0,
        "installed": True,
        "est_watts": 0,    # unknown load
    },
    "ps-input-1": {
        "ip": "shelly1g4-98a31677ca34.local",
        "label": "PS Input 1",
        "channel": 0,
        "installed": True,
        "est_watts": 0,
    },
    "ps-input-2": {
        "ip": "shelly1g4-48f6eed0a89c.local",
        "label": "PS Input 2",
        "channel": 0,
        "installed": True,
        "est_watts": 0,
    },
}

class ShellyStatus(BaseModel):
    id: str
    label: str
    on: bool
    ip: str | None
    installed: bool
    reachable: bool = True
    # True when polling has stopped because the unit kept failing. It only
    # resumes through POST /shelly/{id}/recheck.
    paused: bool = False

class ShellyToggle(BaseModel):
    on: bool

async def get_shelly_state(unit_id: str) -> tuple[bool, bool]:
    """
    Fetch live relay state. Returns (on, reachable).

    The reachable flag matters: a Shelly that can't be reached used to be
    reported as simply 'off', so a network split looked identical to two
    switched-off circuits on the dashboard. That masked three separate
    outages during the Starlink migration.
    """
    unit = SHELLY_UNITS.get(unit_id)
    if not unit or not unit["installed"]:
        return False, False
    if unit_id in _paused:
        return False, False  # not polled: no DNS lookup, no timeout

    host = unit["ip"]
    ip = await _resolve(host)
    if ip is None:
        _record_failure(unit_id)
        return False, False

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(
                f"http://{ip}/rpc/Switch.GetStatus?id={unit['channel']}"
            )
            on = r.json().get("output", False)
        _record_success(unit_id)
        return on, True
    except Exception:
        # Could be a genuine outage, or the unit moved networks and the
        # cached IP is stale. Evict either way so the next poll re-resolves.
        _evict(host)
        _record_failure(unit_id)
        return False, False

def _status(unit_id: str, unit: dict, on: bool, reachable: bool) -> ShellyStatus:
    return ShellyStatus(
        id=unit_id,
        label=unit["label"],
        on=on,
        ip=unit["ip"],
        installed=unit["installed"],
        reachable=reachable,
        paused=unit_id in _paused,
    )

@router.get("/", response_model=list[ShellyStatus])
async def get_all_shelly():
    """
    Status of all Shelly units.

    Fetched concurrently — sequential awaits meant total latency was the sum
    of every unit's, so one slow switch held up the whole response.
    """
    unit_ids = list(SHELLY_UNITS.keys())
    states = await asyncio.gather(
        *(get_shelly_state(uid) for uid in unit_ids)
    )
    return [
        _status(uid, SHELLY_UNITS[uid], on, reachable)
        for uid, (on, reachable) in zip(unit_ids, states)
    ]

@router.get("/{unit_id}", response_model=ShellyStatus)
async def get_shelly(unit_id: str):
    """Get status of a single Shelly unit."""
    unit = SHELLY_UNITS.get(unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail=f"Unknown unit: {unit_id}")
    on, reachable = await get_shelly_state(unit_id)
    return _status(unit_id, unit, on, reachable)

@router.post("/{unit_id}/recheck", response_model=ShellyStatus)
async def recheck_shelly(unit_id: str):
    """
    Probe one unit now, even if it is paused. Reads the relay state only: it
    never switches anything. If the unit answers, polling resumes. If it does
    not, it stays paused, so a dead unit costs one timeout per tap and
    nothing on the 5s poll.
    """
    unit = SHELLY_UNITS.get(unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail=f"Unknown unit: {unit_id}")
    _paused.discard(unit_id)
    _failures.pop(unit_id, None)
    _evict(unit["ip"])  # force a fresh lookup: the unit may have moved
    on, reachable = await get_shelly_state(unit_id)
    if not reachable:
        _paused.add(unit_id)
    return _status(unit_id, unit, on, reachable)

@router.post("/{unit_id}/toggle")
async def toggle_shelly(unit_id: str, body: ShellyToggle):
    """Toggle a Shelly relay on or off."""
    unit = SHELLY_UNITS.get(unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail=f"Unknown unit: {unit_id}")
    if not unit["installed"]:
        raise HTTPException(status_code=503, detail=f"{unit['label']} is not yet installed")

    host = unit["ip"]
    ip = await _resolve(host)
    if ip is None:
        raise HTTPException(
            status_code=503,
            detail=f"Could not find {unit['label']} on the network",
        )

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            on_str = "true" if body.on else "false"
            await client.get(
                f"http://{ip}/rpc/Switch.Set?id={unit['channel']}&on={on_str}"
            )
        db.log_event("shelly", unit_id, "on" if body.on else "off")
        return {"unit_id": unit_id, "on": body.on}
    except Exception as e:
        _evict(host)
        raise HTTPException(status_code=503, detail=f"Could not reach {unit['label']}: {e}")
