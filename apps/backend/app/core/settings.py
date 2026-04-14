from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    patti_base_url: str
    patti_login_email: str
    patti_login_password: str

    secret_key: str
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30
    jwt_algorithm: str = "HS256"

    access_cookie_name: str = "fz_access_token"
    refresh_cookie_name: str = "fz_refresh_token"
    cookie_secure: bool = False
    cookie_samesite: str = "lax"

    # Observability
    sentry_dsn: str = ""
    sentry_environment: str = "staging"
    sentry_traces_sample_rate: float = 0.0
    log_level: str = "INFO"
    log_format: str = "json"  # "json" oder "console"
    sql_echo: bool = False

    # Security
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000,https://admin.froehlichdienste.de"
    login_rate_limit: str = "5/minute"

    # Admin Seed
    admin_seed_email: str = "admin@example.com"
    admin_seed_password: str = ""  # leer = kein Auto-Seed
    admin_seed_full_name: str = "Admin"

    # Patti Resilienz
    patti_timeout_seconds: float = 10.0
    patti_max_retries: int = 2
    patti_cache_ttl_seconds: int = 60

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
