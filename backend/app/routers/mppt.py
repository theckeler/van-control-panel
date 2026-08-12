from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

class MpptData(BaseModel):
    panel_voltage: float    # Vpv V
    panel_power: float      # Ppv W
    battery_voltage: float  # V
    battery_current: float  # I A
    charge_state: str       # Off/Bulk/Absorption/Float/Equalize
    daily_yield: float      # H20 Wh
    total_yield: float      # H19 kWh
    max_power_today: float  # H21 W
    error_code: int
    connected: bool

MOCK_MPPT = MpptData(
    panel_voltage=18.4,
    panel_power=42.0,
    battery_voltage=13.2,
    battery_current=3.1,
    charge_state="Float",
    daily_yield=210.0,
    total_yield=1842.5,
    max_power_today=158.0,
    error_code=0,
    connected=True
)

@router.get("/", response_model=MpptData)
async def get_mppt():
    """Get current MPPT 75/15 data via VE.Direct."""
    return MOCK_MPPT

@router.get("/history")
async def get_mppt_history(days: int = 7):
    """Get daily solar yield history."""
    return {"days": days, "data": []}
