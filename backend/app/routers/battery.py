from fastapi import APIRouter
from pydantic import BaseModel
from app.services import battery_ble

router = APIRouter()

class BatteryData(BaseModel):
    soc: float
    voltage: float       # V
    current: float       # A (+ charging, - discharging)
    temperature: float   # °C
    cell_voltages: list[float]
    cycle_count: int
    status: str
    connected: bool

@router.get("/", response_model=BatteryData)
async def get_battery():
    """Get current battery state from Power Queen BMS via BLE."""
    b = battery_ble.get_latest()

    if b is None or not battery_ble.is_connected():
        return BatteryData(
            soc=0.0,
            voltage=0.0,
            current=0.0,
            temperature=0.0,
            cell_voltages=[],
            cycle_count=0,
            status="offline",
            connected=False,
        )

    return BatteryData(
        soc=float(b.SOC or 0),
        voltage=round((b.voltage or 0) / 1000, 3),
        current=float(b.current or 0),
        temperature=float(b.cellTemperature or 0),
        cell_voltages=list(b.batteryPack.values()),
        cycle_count=int(b.dischargesCount or 0),
        status=b.battery_status or "unknown",
        connected=True,
    )

@router.get("/history")
async def get_battery_history(hours: int = 24):
    """Get battery SOC history — TODO: SQLite logging."""
    return {"hours": hours, "data": []}
