"""
Starlink Mini — local dish status over gRPC.

The dish runs an unauthenticated gRPC server on its own hardware at
192.168.100.1:9200. No account, no internet, no cloud round trip — which is
the property that matters in a van, since the most useful time to know
Starlink's state is when it isn't working.

PREREQUISITE — the dish is not reachable by default:
    The Pi sits at 192.168.1.10 behind the Mini's integrated router. The dish
    is on 192.168.100.x and the router does not route its own LAN clients
    there. Until a static route exists, every call here fails as a generic
    UNAVAILABLE that looks like a library bug rather than a routing problem.

        sudo ip route add 192.168.100.0/24 via 192.168.1.1 dev eth0
        ping -c3 192.168.100.1

    Persist it in /etc/dhcpcd.conf. See docs/starlink-status.md.

WHY A THREAD EXECUTOR:
    starlink_grpc uses blocking gRPC, not grpc.aio, with a hardcoded 10s
    REQUEST_TIMEOUT. Calling it from the event loop would stall every other
    endpoint for up to 10s whenever the dish is unplugged or stowed — and in a
    van that is a normal state, not an edge case. All gRPC work is confined to
    one dedicated thread because the channel is also not thread-safe.

WHY NO VENDORED .proto FILES:
    The library resolves the schema at runtime via gRPC reflection. That is
    deliberate: Starlink firmware updates change the schema and compiled stubs
    break when they do. Cost is ~0.5-2s on the first call, which is why
    warm_up() runs at startup rather than making the first dashboard load pay.

FIELD NAMES ARE VERSION-DEPENDENT:
    Rather than unpack the returned tuples positionally, both calls merge every
    returned dict into one flat mapping and read by key. Starlink has both added
    and removed groups across firmware revisions, and positional unpacking is
    how these integrations break. GET /starlink/raw returns the merged mapping
    so the real field names on this hardware can be read off the dish itself
    instead of guessed from documentation.

KNOWN-OBSOLETE FIELDS — do not wire these up, they return None on current
firmware: snr, seconds_obstructed, wedges_fraction_obstructed. GPS coordinates
were removed from the local API entirely in May 2026; gps_ready and gps_sats
still report lock status but get_location is gone on Mini hardware.
"""
import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)

# Import is optional so a missing dependency degrades to "Starlink unavailable"
# instead of taking down the whole API at startup. The Pi may be reflashed or
# restored from backup before this package is installed.
try:
    import starlink_grpc
    _IMPORT_ERROR: str | None = None
except Exception as exc:  # pragma: no cover - depends on deployment
    starlink_grpc = None  # type: ignore[assignment]
    _IMPORT_ERROR = str(exc)
    logger.warning(
        "starlink_grpc not available (%s) — Starlink endpoint will report "
        "unavailable. Install with: pip install starlink-grpc-core", exc
    )

STATUS_INTERVAL = 5     # matches the dashboard poll; one lightweight RPC
POWER_INTERVAL = 30     # a second RPC, and only latest_power is wanted
STALE_AFTER = 30        # ~6 missed status polls

# Alerts worth surfacing in a van. The dish returns many more; these are the
# ones that mean "go outside and do something about it".
NOTABLE_ALERTS = (
    "alert_thermal_throttle",
    "alert_thermal_shutdown",
    "alert_motors_stuck",
    "alert_mast_not_near_vertical",
    "alert_slow_ethernet_speeds",
    "alert_roaming",
    "alert_install_pending",
    "alert_is_heating",
    "alert_dish_water_detected",
    "alert_power_supply_thermal_throttle",
)


@dataclass
class StarlinkReading:
    state: str | None = None
    uptime_s: int | None = None
    latency_ms: float | None = None
    ping_drop_rate: float | None = None
    downlink_bps: float | None = None
    uplink_bps: float | None = None
    fraction_obstructed: float | None = None
    currently_obstructed: bool | None = None
    hardware_version: str | None = None
    software_version: str | None = None
    alerts: list[str] = field(default_factory=list)
    power_w: float | None = None
    updated_at: datetime | None = None
    error: str | None = None

    @property
    def is_stale(self) -> bool:
        if self.updated_at is None:
            return True
        return (datetime.now(timezone.utc) - self.updated_at).total_seconds() > STALE_AFTER

    @property
    def reachable(self) -> bool:
        """Whether we can talk to the dish — NOT whether Starlink has service."""
        return not self.is_stale and self.error is None

    @property
    def online(self) -> bool:
        """
        Whether Starlink is actually passing traffic.

        Deliberately separate from `reachable`. A stowed dish answers the API
        perfectly well, and a dish that is searching for satellites is a very
        different situation from an unplugged one. Collapsing both into a
        single boolean would throw away the most useful thing this API tells
        us, which is why the state string is exposed too.
        """
        return self.reachable and self.state == "CONNECTED"


_cache = StarlinkReading()
_raw: dict[str, Any] = {}

# Single worker: the gRPC channel is not thread-safe, so every call has to
# happen on the same thread.
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="starlink")
_context: Any = None


def get_latest() -> StarlinkReading:
    return _cache


def get_raw() -> dict[str, Any]:
    """Last merged status mapping, for discovering real field names on device."""
    return _raw


def available() -> bool:
    return starlink_grpc is not None


def import_error() -> str | None:
    return _IMPORT_ERROR


def _get_context():
    global _context
    if _context is None:
        _context = starlink_grpc.ChannelContext(target=settings.starlink_target)
    return _context


def _reset_context():
    """
    Drop the channel so the next call redials.

    Without this a dish that comes back after being unplugged can keep failing
    against a channel stuck in a bad state.
    """
    global _context
    if _context is not None:
        try:
            _context.close()
        except Exception:
            pass
    _context = None


def _merge(groups) -> dict[str, Any]:
    """Flatten the tuple of dicts these calls return into one mapping."""
    merged: dict[str, Any] = {}
    if isinstance(groups, dict):
        return dict(groups)
    for group in groups or ():
        if isinstance(group, dict):
            merged.update(group)
    return merged


def _blocking_status() -> dict[str, Any]:
    return _merge(starlink_grpc.status_data(context=_get_context()))


def _blocking_power() -> dict[str, Any]:
    # parse_samples=1 — we want the most recent sample, not a history window.
    return _merge(starlink_grpc.history_stats(1, context=_get_context()))


async def _run_blocking(fn):
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_executor, fn)


def _as_float(value) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _as_int(value) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _build(data: dict[str, Any], power_w: float | None) -> StarlinkReading:
    return StarlinkReading(
        state=data.get("state"),
        uptime_s=_as_int(data.get("uptime")),
        latency_ms=_as_float(data.get("pop_ping_latency_ms")),
        ping_drop_rate=_as_float(data.get("pop_ping_drop_rate")),
        downlink_bps=_as_float(data.get("downlink_throughput_bps")),
        uplink_bps=_as_float(data.get("uplink_throughput_bps")),
        fraction_obstructed=_as_float(data.get("fraction_obstructed")),
        currently_obstructed=data.get("currently_obstructed"),
        hardware_version=data.get("hardware_version"),
        software_version=data.get("software_version"),
        alerts=[name for name in NOTABLE_ALERTS if data.get(name)],
        power_w=power_w,
        updated_at=datetime.now(timezone.utc),
        error=None,
    )


async def poll_status() -> None:
    """One status RPC. Keeps the last good reading on failure."""
    global _cache, _raw
    if starlink_grpc is None:
        return
    try:
        data = await _run_blocking(_blocking_status)
    except Exception as exc:
        # Distinguish "cannot reach the dish" from "dish has no service" —
        # this branch is always the former.
        #
        # Keep the last good reading rather than blanking it. A single missed
        # poll shouldn't wipe the card; `reachable` already goes false on the
        # error, and `updated_at` is left alone so staleness still advances.
        logger.warning("Starlink: status unreachable (%s)", exc)
        _reset_context()
        _cache.error = str(exc)
        return

    _raw = data
    _cache = _build(data, _cache.power_w)
    logger.debug("Starlink: state=%s latency=%s", _cache.state, _cache.latency_ms)


async def poll_power() -> None:
    """
    One history RPC for power draw.

    Worth having beyond curiosity: system.py's loads breakdown currently
    hardcodes a flat 22W for Starlink regardless of what the dish is doing,
    and actual draw varies a lot between searching, connected and idle.

    Not all terminal hardware supports this, and unsupported hardware returns
    0.0 rather than erroring — so treat a flat zero as "unsupported" and stop
    claiming a number we don't have.
    """
    global _cache
    if starlink_grpc is None:
        return
    try:
        data = await _run_blocking(_blocking_power)
    except Exception as exc:
        logger.debug("Starlink: power stats unavailable (%s)", exc)
        return

    power = _as_float(data.get("latest_power"))
    if power is not None and power > 0:
        _cache.power_w = power
    else:
        _cache.power_w = None


async def warm_up() -> None:
    """
    Pay the gRPC reflection cost at startup instead of on the first page load.

    Failure here is expected and fine — the dish may be stowed or the static
    route may not be in place yet. The poll loop retries forever.
    """
    if starlink_grpc is None:
        return
    try:
        await _run_blocking(_blocking_status)
        logger.info("Starlink: reflection warm-up complete (%s)", settings.starlink_target)
    except Exception as exc:
        logger.warning(
            "Starlink: warm-up failed (%s) — check the static route to "
            "192.168.100.0/24 via the Mini", exc
        )


async def run() -> None:
    """Status on the dashboard cadence, power on a slower one."""
    if not settings.starlink_enabled:
        logger.info("Starlink polling disabled")
        return
    if starlink_grpc is None:
        logger.warning("Starlink: starlink_grpc missing — poll loop not started")
        return

    logger.info("Starlink poll loop started (%s)", settings.starlink_target)
    await warm_up()

    ticks = 0
    try:
        while True:
            try:
                await poll_status()
                if ticks % max(1, POWER_INTERVAL // STATUS_INTERVAL) == 0:
                    await poll_power()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("Starlink poll error: %s", exc)
            ticks += 1
            await asyncio.sleep(STATUS_INTERVAL)
    finally:
        _reset_context()
        _executor.shutdown(wait=False)
