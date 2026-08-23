import subprocess
from fastapi import APIRouter
from pydantic import BaseModel
from app.services import battery_ble, victron_ble, network, health, db
from app.routers import mode as mode_router
from app.routers import orion as orion_router
from app.routers.shelly import SHELLY_UNITS
from app.routers.shore import SHORE_INFERENCE_THRESHOLD

router = APIRouter()


class WifiStatus(BaseModel):
    ssid: str | None = None
    band: str | None = None
    signal_dbm: int | None = None
    bitrate_mbps: float | None = None
    tx_retries: int | None = None
    ip: str | None = None


class PiHealth(BaseModel):
    cpu_temp_c: float | None = None
    load_1: float | None = None
    load_5: float | None = None
    mem_total_mb: int | None = None
    mem_available_mb: int | None = None
    disk_total_gb: float | None = None
    disk_free_gb: float | None = None
    uptime_s: int | None = None
    throttle: list[str] = []


@router.get("/health-detail", response_model=PiHealth)
async def get_pi_health():
    """Pi vitals — temperature, load, memory, disk, uptime, throttle flags."""
    return PiHealth(**await health.get_health())


class WifiProfile(BaseModel):
    name: str
    active: bool


class WifiSwitchResult(BaseModel):
    ok: bool
    message: str


@router.get("/wifi/profiles", response_model=list[WifiProfile])
async def get_wifi_profiles():
    """Known WiFi profiles and which is currently up."""
    return [WifiProfile(**p) for p in await network.list_profiles()]


@router.post("/wifi/switch/{name}", response_model=WifiSwitchResult)
async def switch_wifi(name: str):
    """
    Bring up a WiFi profile.

    The caller loses its connection to the Pi while this happens if it is
    reaching it over the LAN. Tailscale survives.
    """
    ok, message = await network.switch_profile(name)
    db.log_event("wifi", name, "ok" if ok else "failed", message[:200] if message else None)
    return WifiSwitchResult(ok=ok, message=message or ("switched" if ok else "failed"))


class Event(BaseModel):
    id: int
    ts: str
    kind: str
    target: str | None = None
    value: str | None = None
    detail: str | None = None


@router.get("/events", response_model=list[Event])
async def get_events(hours: int = 168, kind: str | None = None, limit: int = 500):
    """
    Recent state changes — toggles, mode changes, BMS release, WiFi switches,
    shutdown and reboot. Newest first, default window one week.
    """
    return [Event(**e) for e in db.query_events(hours=hours, kind=kind, limit=limit)]


@router.get("/wifi", response_model=WifiStatus)
async def get_wifi():
    """Which network the Pi is currently on, and how good the link is."""
    return WifiStatus(**await network.get_wifi())

# Always-on baseline loads (Pi + Starlink + Fridge average)
ALWAYS_ON_WATTS = {
    "Pi": 5,
    "Starlink": 22,
    "Fridge": 40,
}

CURRENT_THRESHOLD = 0.3   # A — below this treat as standby
NET_POWER_THRESHOLD = 5   # W — dead band for charging/discharging state


class LoadBreakdown(BaseModel):
    label: str
    watts: float
    source: str   # "measured" | "estimated" | "always_on"


class SystemData(BaseModel):
    # Power flow
    net_power_w: float          # + charging battery, - discharging
    solar_watts: float          # MPPT panel input
    load_watts: float           # Total estimated consumption
    power_state: str            # "charging" | "discharging" | "standby"

    # Battery
    soc: float | None
    voltage: float | None
    remaining_ah: float | None

    # Time estimates
    estimated_runtime_hrs: float | None   # hours until empty at current draw
    time_to_full_hrs: float | None        # hours until full at current charge rate

    # Charge sources
    charge_sources_active: list[str]

    # Load breakdown
    loads: list[LoadBreakdown]

    # Context
    mode: str
    daily_yield_wh: float
    bms_connected: bool
    mppt_connected: bool

    # Wi-Fi status
    ssid: str | None = None
    band: str | None = None
    wifi_signal_dbm: int | None = None
    wifi_ip: str | None = None


@router.get("/", response_model=SystemData)
async def get_system():
    """Real-time system overview — net power, runtime, load breakdown."""
    bms = battery_ble.get_latest()
    bms_ok = battery_ble.is_connected()
    mppt = victron_ble.get_latest()
    mppt_ok = not mppt.is_stale

    # --- Power flow ---
    bms_voltage_v = ((bms.voltage or 0) / 1000) if bms else 0.0
    bms_current_a = (bms.current or 0.0) if bms else 0.0
    solar_watts = mppt.solar_power if mppt_ok else 0.0

    # Net power: positive = net charging, negative = net discharging
    battery_power_w = round(bms_voltage_v * bms_current_a, 1)
    # Load = solar in minus what's going to/from battery
    # Falls back to always-on estimate when BMS is offline
    if bms_ok:
        load_watts = round(solar_watts - battery_power_w, 1)
        load_watts = max(0.0, load_watts)
    else:
        load_watts = float(sum(ALWAYS_ON_WATTS.values()))

    # Power state with dead band
    if battery_power_w > NET_POWER_THRESHOLD:
        power_state = "charging"
    elif battery_power_w < -NET_POWER_THRESHOLD:
        power_state = "discharging"
    else:
        power_state = "standby"

    # --- Runtime estimates ---
    estimated_runtime_hrs = None
    time_to_full_hrs = None

    if bms and bms_ok:
        remain = bms.remainAh or 0.0
        factory = bms.factoryAh or 0.0

        if bms_current_a < -CURRENT_THRESHOLD and remain > 0:
            # Discharging — time until empty
            estimated_runtime_hrs = round(remain / abs(bms_current_a), 1)

        elif bms_current_a > CURRENT_THRESHOLD and factory > 0 and remain < factory:
            # Charging — time until full
            to_fill = factory - remain
            time_to_full_hrs = round(to_fill / bms_current_a, 1)

    # --- Charge sources ---
    charge_sources: list[str] = []
    if mppt_ok and solar_watts > 2:
        charge_sources.append("solar")

    # Infer shore from BMS/MPPT current delta
    inferred_shore = max(0.0, bms_current_a - (mppt.battery_charging_current if mppt_ok else 0.0))
    if inferred_shore >= SHORE_INFERENCE_THRESHOLD:
        charge_sources.append("shore")

    if orion_router._orion_enabled:
        charge_sources.append("alternator")

    # --- Load breakdown ---
    loads: list[LoadBreakdown] = []

    # Always-on baseline
    for label, watts in ALWAYS_ON_WATTS.items():
        loads.append(LoadBreakdown(label=label, watts=float(watts), source="always_on"))

    # Shelly-controlled loads — estimated, no live HTTP calls here
    for unit_id, unit in SHELLY_UNITS.items():
        if not unit["installed"] or unit["est_watts"] == 0:
            continue
        loads.append(LoadBreakdown(
            label=unit["label"],
            watts=float(unit["est_watts"]),
            source="estimated",
        ))

    # Solar as negative load (reducing net draw)
    if mppt_ok and solar_watts > 0:
        loads.append(LoadBreakdown(
            label="Solar input",
            watts=-round(solar_watts, 1),
            source="measured",
        ))

    # Wi-Fi — which network the Pi is on, and how good the link is.
    # Cheap: network.get_wifi() caches for 15s, so polling /system/ every
    # 5s does not spawn a subprocess every time.
    wifi = await network.get_wifi()

    return SystemData(
        ssid=wifi["ssid"],
        band=wifi["band"],
        wifi_signal_dbm=wifi["signal_dbm"],
        wifi_ip=wifi["ip"],
        net_power_w=battery_power_w,
        solar_watts=round(solar_watts, 1),
        load_watts=load_watts,
        power_state=power_state,
        soc=float(bms.SOC) if bms and bms_ok else None,
        voltage=bms_voltage_v if bms and bms_ok else None,
        remaining_ah=float(bms.remainAh) if bms and bms_ok else None,
        estimated_runtime_hrs=estimated_runtime_hrs,
        time_to_full_hrs=time_to_full_hrs,
        charge_sources_active=charge_sources,
        loads=loads,
        mode=mode_router._current_mode,
        daily_yield_wh=round(mppt.daily_yield, 1) if mppt_ok else 0.0,
        bms_connected=bms_ok,
        mppt_connected=mppt_ok,
    )


@router.post("/shutdown")
async def shutdown_pi():
    """Gracefully shut down the Raspberry Pi."""
    # Logged before the command — the process is about to be killed, and an
    # unexplained outage is exactly what this table is for.
    db.log_event("system", value="shutdown")
    subprocess.Popen(["sudo", "shutdown", "now"])
    return {"status": "shutting_down", "message": "Pi is shutting down"}


@router.post("/reboot")
async def reboot_pi():
    """Reboot the Raspberry Pi."""
    db.log_event("system", value="reboot")
    subprocess.Popen(["sudo", "reboot"])
    return {"status": "rebooting", "message": "Pi is rebooting — dashboard back in ~30s"}
