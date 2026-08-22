from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Victron SmartSolar MPPT 75/15
    victron_mac: str = "E8:18:52:D1:81:B7"
    victron_key: str = ""

    # Power Queen 12V 100Ah LiFePO4 BMS
    bms_mac: str = "C8:47:80:5D:08:6F"

    # Optional API key — if set, all endpoints require X-API-Key header
    van_api_key: str = ""

settings = Settings()
