from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

class SystemData(BaseModel):
    net_power_w: float       # Positive = net charging, negative = net draw
    estimated_runtime_hrs: float | None
    charge_sources_active: list[str]
    mode: str

@router.get("/", response_model=SystemData)
async def get_system():
    """Get combined system overview — net power, runtime estimate, active sources."""
    # TODO: aggregate from battery, mppt, shore, orion services
    return SystemData(
        net_power_w=-32.5,
        estimated_runtime_hrs=18.2,
        charge_sources_active=["solar"],
        mode="camp"
    )
