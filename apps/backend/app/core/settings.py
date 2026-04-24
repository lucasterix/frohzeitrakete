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
    # Optional cookie domain (leer = host-only). Set to ".froehlichdienste.de"
    # to share the session with sibling subdomains (e.g. buchhaltung-api.*).
    cookie_domain: str = ""

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
    patti_timeout_seconds: float = 15.0
    patti_cache_ttl_seconds: int = 60

    # OpenRouteService (Geocoding + Driving-Distance)
    # Get a free key at https://openrouteservice.org/dev/#/signup
    ors_api_key: str = ""

    # Password-Reset
    # Wenn SMTP-Daten fehlen, wird der Reset-Link im Log ausgegeben damit
    # das Büro ihn manuell an den User weitergibt.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "noreply@froehlichdienste.de"
    password_reset_base_url: str = "https://admin.froehlichdienste.de/reset-password"
    password_reset_token_ttl_minutes: int = 60

    # Org-Contact (Ansprechpartner Büro – wird von der Mobile-App angezeigt)
    org_contact_name: str = "Einsatzleitung"
    org_contact_org: str = "FrohZeit Büro"
    org_contact_phone: str = "+49 551 28879514"
    org_contact_email: str = "daniel.rupp@froehlichdienste.de"
    org_contact_hours: str = "Erreichbar Mo–Fr, 09:00–16:00 Uhr"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
