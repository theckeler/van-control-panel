from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Victron SmartSolar MPPT 75/15
    # Device addresses have no defaults: set them in backend/.env. An empty
    # one skips that service with a log line instead of scanning for a stranger.
    victron_mac: str = ""
    victron_key: str = ""

    # Power Queen 12V 100Ah LiFePO4 BMS
    bms_mac: str = ""

    # EcoFlow River 2 Max — passive advertisement only, no auth needed
    ecoflow_mac: str = ""

    # Starlink Mini — local gRPC on the dish itself, unauthenticated.
    # Requires a static route; the Mini's router does not reach this subnet
    # from its own LAN by default. See docs/starlink-status.md.
    starlink_target: str = "192.168.100.1:9200"
    starlink_enabled: bool = True

    # Dometic CFX535 fridge bridge — ESP32-S3 running the philippe-a11y
    # DDM2+bonding fork, exposing ESPHome's web_server v3 JSON API locally.
    # Same trust model as the Shellys: no auth, LAN-only.
    dometic_bridge_host: str = "dometic-bridge.local"

    # Optional API key — if set, all endpoints require X-API-Key header
    van_api_key: str = ""

settings = Settings()
