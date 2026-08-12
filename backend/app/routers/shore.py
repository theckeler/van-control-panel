from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

class ShoreData(BaseModel):
    connected: bool
    charge_mode: str     # Bulk/Absorption/Float/Storage/Off
    battery_voltage: float
    charge_current: float
    error_code: int

MOCK_SHORE = ShoreData(
    connected=False,
    charge_mode="Off",
    battery_voltage=0.0,
    charge_current=0.0,
    error_code=0
)

@router.get("/", response_model=ShoreData)
async def get_shore():
    """Get IP22 shore charger status via VE.Direct."""
    return MOCK_SHORE
