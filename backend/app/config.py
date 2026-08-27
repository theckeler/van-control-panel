from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Victron SmartSolar MPPT 75/15
    victron_mac: str = "E8:18:52:D1:81:B7"
    victron_key: str = ""

    # Power Queen 12V 100Ah LiFePO4 BMS
    bms_mac: str = "C8:47:80:5D:08:6F"

    # EcoFlow River 2 Max — passive advertisement only, no auth needed
    ecoflow_mac: str = "80:65:99:08:76:D9"

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
