from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from app.routers import battery, mppt, shore, orion, shelly, camera, mode, system
from app.services import victron_ble
import asyncio
import os

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start Victron BLE scanner in the background on startup
    task = asyncio.create_task(victron_ble.run_scanner())
    yield
    # Cancel on shutdown
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

app = FastAPI(title="Van Control Panel", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(battery.router, prefix="/battery", tags=["battery"])
app.include_router(mppt.router, prefix="/mppt", tags=["mppt"])
app.include_router(shore.router, prefix="/shore", tags=["shore"])
app.include_router(orion.router, prefix="/orion", tags=["orion"])
app.include_router(shelly.router, prefix="/shelly", tags=["shelly"])
app.include_router(camera.router, prefix="/photos", tags=["camera"])
app.include_router(mode.router, prefix="/mode", tags=["mode"])
app.include_router(system.router, prefix="/system", tags=["system"])

PHOTOS_DIR = os.path.join(os.path.dirname(__file__), "..", "photos")
app.mount("/static/photos", StaticFiles(directory=PHOTOS_DIR), name="photos")

@app.get("/health")
async def health():
    return {"status": "ok"}
