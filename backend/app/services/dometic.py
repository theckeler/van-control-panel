"""
Dometic CFX535 fridge — polls the ESP32-S3 bridge's local JSON API.

The bridge itself (esp32-dometic/) handles the actual BLE connection, DDM2
protocol, and bonding to the fridge — this service never touches BLE at all,
it just reads ESPHome's built-in web_server v3 JSON endpoints over local
HTTP, same trust model and pattern as services/shelly.py.

ESPHome's web_server matches entities by friendly name, not the YAML id: —
confirmed via web_server.cpp's match_entity() during setup, not guessed. The
URL-encoded names below must match dometic-bridge.yaml exactly, or a rename
on the ESP32 side silently starts returning 404-shaped empty responses here.
"""
import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

STALE_AFTER = 30  # a few missed polls; matches shelly.py's spirit

ENTITIES = {
    "temp_c": ("sensor", "Fridge Temperature"),
    "set_temp_c": ("sensor", "Fridge Set Temperature"),
    "battery_voltage": ("sensor", "Fridge Battery Voltage"),
    # COOLER_POWER's real DDM2 type is INT8_BOOLEAN (compressor on/off), not
    # a wattage — it lives under binary_sensor: on the ESP32 side, not
    # sensor:. Originally wired to the wrong domain, which meant this field
    # silently returned null from the moment the fridge first connected.
    "cooler_on": ("binary_sensor", "Fridge Cooler Power"),
    "door_open": ("binary_sensor", "Fridge Door Open"),
    "power_source": ("text_sensor", "Fridge Power Source"),
}


@dataclass
class FridgeReading:
    temp_c: float | None = None
    set_temp_c: float | None = None
    battery_voltage: float | None = None
    cooler_on: bool | None = None
    door_open: bool | None = None
    power_source: str | None = None
    updated_at: datetime | None = None

    @property
    def is_stale(self) -> bool:
        if self.updated_at is None:
            return True
        return (datetime.now(timezone.utc) - self.updated_at).total_seconds() > STALE_AFTER

    @property
    def reachable(self) -> bool:
        return not self.is_stale


_cache = FridgeReading()


def get_latest() -> FridgeReading:
    return _cache


async def _fetch_one(client: httpx.AsyncClient, domain: str, name: str):
    """One entity's current value, or None on any failure — never raises."""
    url = f"http://{settings.dometic_bridge_host}/{domain}/{name}"
    try:
        r = await client.get(url, timeout=3.0)
        r.raise_for_status()
        return r.json().get("value")
    except Exception as exc:
        logger.debug("Dometic: %s/%s unreachable (%s)", domain, name, exc)
        return None


async def poll_once() -> bool:
    """
    Fetch all entities concurrently. Returns whether the bridge answered at
    all — a fridge with the door open still returns real values, so success
    here means "reached the ESP32", not "fridge is in any particular state".
    """
    global _cache

    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(
            *(_fetch_one(client, domain, name) for domain, name in ENTITIES.values())
        )

    values = dict(zip(ENTITIES.keys(), results))

    # At least one real value means the bridge is up, even if a single
    # entity glitched — same reasoning as Shelly's per-unit reachability.
    if all(v is None for v in values.values()):
        return False

    _cache = FridgeReading(
        temp_c=values["temp_c"],
        set_temp_c=values["set_temp_c"],
        battery_voltage=values["battery_voltage"],
        cooler_on=values["cooler_on"],
        door_open=values["door_open"],
        power_source=values["power_source"],
        updated_at=datetime.now(timezone.utc),
    )
    return True


async def run() -> None:
    """Poll on the dashboard cadence. The ESP32 pushes state near-instantly
    once connected, so there's no need to poll faster than the UI refreshes."""
    logger.info("Dometic fridge poll loop started (%s)", settings.dometic_bridge_host)
    while True:
        try:
            await poll_once()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("Dometic poll error: %s", exc)
        await asyncio.sleep(5)
