from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from slowapi.errors import RateLimitExceeded
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.api.admin_signatures import router as admin_signatures_router
from app.api.admin_users import router as admin_users_router
from app.api.auth import router as auth_router
from app.api.mobile import router as mobile_router
from app.core.logging import configure_logging, get_logger
from app.core.middleware import RequestContextMiddleware
from app.core.rate_limit import limiter
from app.core.settings import settings
from app.db.session import engine

# Logging muss als allererstes konfiguriert werden, damit alle nachfolgenden
# Imports und Module bereits den structlog-konfigurierten Logger nutzen.
configure_logging()
logger = get_logger("app")

# Sentry optional aktivieren – wenn keine DSN gesetzt ist, ist es ein no-op.
if settings.sentry_dsn:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.sentry_environment,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        send_default_pii=False,
        integrations=[FastApiIntegration(), SqlalchemyIntegration()],
    )
    logger.info("sentry_initialized", environment=settings.sentry_environment)

app = FastAPI(title="FrohZeitRakete Backend")
# Rate-Limiter wird in core/rate_limit.py instanziert und von den Routen
# importiert. FastAPI erwartet ihn an app.state.limiter, damit die slowapi-
# Decorator funktionieren.
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    """Saubere JSON-Fehlermeldung für Rate-Limit statt Default-HTML."""
    logger.warning("rate_limit_exceeded", limit=str(exc.detail))
    return JSONResponse(
        status_code=429,
        content={"detail": f"Zu viele Anfragen — bitte später erneut versuchen ({exc.detail})"},
    )


app.add_middleware(RequestContextMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)

app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(mobile_router, prefix="/mobile", tags=["mobile"])
app.include_router(admin_users_router, prefix="/admin", tags=["admin"])
app.include_router(admin_signatures_router, prefix="/admin", tags=["admin-signatures"])


@app.get("/health")
def health():
    """Liveness: antwortet immer wenn der Prozess läuft."""
    return {"status": "ok"}


@app.get("/health/ready")
def ready():
    """Readiness: prüft DB-Verbindung. Wird von Docker-Healthcheck genutzt."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ready"}
    except Exception as exc:
        logger.error("readiness_check_failed", error=str(exc))
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "detail": "database unreachable"},
        )


@app.on_event("startup")
async def on_startup():
    logger.info(
        "app_started",
        cors_origins=settings.cors_origins_list,
        sentry_enabled=bool(settings.sentry_dsn),
        log_level=settings.log_level,
    )
