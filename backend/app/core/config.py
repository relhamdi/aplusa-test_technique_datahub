from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Type validation at startup"""

    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    app_env: str = "dev"
    log_level: str = "INFO"
    mongo_uri: str = "mongodb://localhost:27018"
    mongo_db: str = "datahub"
    cors_origins: str = "http://localhost:5173"
    import_chunk_size: int = 50_000

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    # Only one call per process (lru_cache) 
    return Settings()
