from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from app.routers import battery, mppt, shore, orion, shelly, camera, mode, system, ecoflow, starlink, dometic
from app.services import ble_orchestrator, data_logger, db
from app.services import starlink as starlink_service
from app.services import dometic as dometic_service
from app.config import settings
import asyncio
import hmac
import logging
import os

log = logging.getLogger("van-api")

@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init()
    tasks = [
        asyncio.create_task(ble_orchestrator.run()),
        asyncio.create_task(data_logger.run()),
        asyncio.create_task(starlink_service.run()),
        asyncio.create_task(dometic_service.run()),
    ]
    yield
    for task in tasks:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

app = FastAPI(title="Van Control Panel", version="1.0.0", lifespan=lifespan)

LOCAL_HOSTS = {"127.0.0.1", "::1", "localhost"}
OPEN_PATHS = {"/health"}


@app.middleware("http")
async def require_api_key(request: Request, call_next):
    """
    Gate remote access to the API.

    uvicorn binds 0.0.0.0:8000, so before this anyone on the same WiFi could
    hit /system/shutdown or toggle a circuit directly, bypassing the Express
    password entirely.

    Loopback is trusted: that is the Express proxy, which has already checked
    the session cookie. Anything else needs X-API-Key. /health stays open for
    the CI/CD liveness check and the reboot poller.

    Fails open when van_api_key is unset, matching how VAN_PASSWORD behaves on
    the Express side — a missing key should not brick access to the van.
    """
    if not settings.van_api_key:
        return await call_next(request)

    if request.url.path in OPEN_PATHS:
        return await call_next(request)

    client = request.client.host if request.client else ""
    if client in LOCAL_HOSTS:
        return await call_next(request)

    supplied = request.headers.get("x-api-key", "")
    if hmac.compare_digest(supplied, settings.van_api_key):
        return await call_next(request)

    log.warning("rejected %s %s from %s", request.method, request.url.path, client)
    return JSONResponse({"detail": "unauthorized"}, status_code=401)


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
app.include_router(ecoflow.router, prefix="/ecoflow", tags=["ecoflow"])
app.include_router(starlink.router, prefix="/starlink", tags=["starlink"])
app.include_router(dometic.router, prefix="/dometic", tags=["dometic"])

PHOTOS_DIR = os.path.join(os.path.dirname(__file__), "..", "photos")
app.mount("/static/photos", StaticFiles(directory=PHOTOS_DIR), name="photos")

@app.get("/health")
async def health():
    return {"status": "ok"}
