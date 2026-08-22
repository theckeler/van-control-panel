from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Victron SmartSolar MPPT 75/15
    victron_mac: str = "E8:18:52:D1:81:B7"
    victron_key: str = ""

    # Optional API key — if set, all endpoints require X-API-Key header
    # Leave empty to disable auth (fine for local-only use)
    van_api_key: str = ""

settings = Settings()
