from fastapi import APIRouter
from pydantic import BaseModel
from app.services import starlink as starlink_service

router = APIRouter()


class StarlinkData(BaseModel):
    reachable: bool
    online: bool
    state: str | None
    uptime_s: int | None
    latency_ms: float | None
    ping_drop_rate: float | None
    downlink_bps: float | None
    uplink_bps: float | None
    fraction_obstructed: float | None
    currently_obstructed: bool | None
    power_w: float | None
    alerts: list[str]
    hardware_version: str | None
    software_version: str | None
    error: str | None


@router.get("/", response_model=StarlinkData)
async def get_starlink():
    """
    Current Starlink Mini status, read from the dish's own local gRPC server.

    No cloud, no account, no internet required — which is the point, since the
    most useful time to know Starlink's state is when it isn't working.

    `reachable` and `online` mean different things and both are returned on
    purpose. `reachable` false means we can't talk to the dish at all: it's
    unplugged, Ethernet is down, or the static route to 192.168.100.0/24 is
    missing. `online` false with `reachable` true means the dish is fine and
    answering, but has no service — SEARCHING, OBSTRUCTED or STOWED. The UI
    should show `state`, not just a green or red dot.
    """
    r = starlink_service.get_latest()
    return StarlinkData(
        reachable=r.reachable,
        online=r.online,
        state=r.state,
        uptime_s=r.uptime_s,
        latency_ms=r.latency_ms,
        ping_drop_rate=r.ping_drop_rate,
        downlink_bps=r.downlink_bps,
        uplink_bps=r.uplink_bps,
        fraction_obstructed=r.fraction_obstructed,
        currently_obstructed=r.currently_obstructed,
        power_w=r.power_w,
        alerts=r.alerts,
        hardware_version=r.hardware_version,
        software_version=r.software_version,
        error=r.error,
    )


@router.get("/raw")
async def get_starlink_raw():
    """
    Every field the dish returned on the last successful poll.

    Debug aid, and deliberately not modelled. Starlink changes field names
    across firmware revisions, and the fastest way to find out what this
    hardware actually reports is to ask it rather than trust documentation.
    Use this to confirm real key names before adding anything to StarlinkData
    — particularly `latest_power`, which not all terminals support.
    """
    return {
        "available": starlink_service.available(),
        "import_error": starlink_service.import_error(),
        "data": starlink_service.get_raw(),
    }
