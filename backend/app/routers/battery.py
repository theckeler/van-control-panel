from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

class BatteryData(BaseModel):
    soc: float           # State of charge %
    voltage: float       # Pack voltage V
    current: float       # Current A (+ charging, - discharging)
    temperature: float   # Cell temp °C
    cell_voltages: list[float]
    cycle_count: int
    status: str          # BMS status flags
    connected: bool

# Mock data for dev — replace with real BLE polling service
MOCK_BATTERY = BatteryData(
    soc=78.5,
    voltage=13.2,
    current=-4.2,
    temperature=22.1,
    cell_voltages=[3.30, 3.30, 3.29, 3.31],
    cycle_count=42,
    status="normal",
    connected=True
)

@router.get("/", response_model=BatteryData)
async def get_battery():
    """Get current battery state from Power Queen BMS via BLE."""
    return MOCK_BATTERY

@router.get("/history")
async def get_battery_history(hours: int = 24):
    """Get battery SOC history for trend chart."""
    # TODO: pull from SQLite log
    return {"hours": hours, "data": []}
