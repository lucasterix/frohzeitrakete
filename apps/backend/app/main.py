from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from slowapi.errors import RateLimitExceeded
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.api.admin_signatures import router as admin_signatures_router
from app.api.admin_tasks import router as admin_tasks_router
from app.api.admin_users import router as admin_users_router
from app.api.auth import router as auth_router
from app.api.mobile import router as mobile_router
from app.api.office_workflow import admin_router as office_admin_router
from app.api.office_workflow import mobile_router as office_mobile_router
from app.api.budget_inquiries import router as budget_inquiries_router
from app.api.payroll import admin_router as payroll_admin_router
from app.api.payroll import mobile_router as payroll_mobile_router
from app.api.mail_intake import router as mail_intake_router
from app.api.pflegehilfsmittel import admin_router as pflegehm_admin_router
from app.api.pflegehilfsmittel import mobile_router as pflegehm_mobile_router
from app.api.public_sign import router as public_sign_router
from app.api.applicants import router as applicants_router
from app.api.mahnwesen import router as mahnwesen_router
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
app.include_router(office_mobile_router, prefix="/mobile", tags=["mobile-office-workflow"])
app.include_router(admin_users_router, prefix="/admin", tags=["admin"])
app.include_router(admin_signatures_router, prefix="/admin", tags=["admin-signatures"])
app.include_router(admin_tasks_router, prefix="/admin", tags=["admin-tasks"])
app.include_router(office_admin_router, prefix="/admin", tags=["admin-office-workflow"])
app.include_router(budget_inquiries_router, prefix="/admin", tags=["admin-budget-inquiries"])
app.include_router(payroll_admin_router, prefix="/admin", tags=["admin-payroll"])
app.include_router(payroll_mobile_router, prefix="/mobile", tags=["mobile-payroll"])
app.include_router(mail_intake_router, prefix="/admin", tags=["admin-mail-intake"])
app.include_router(pflegehm_admin_router, prefix="/admin", tags=["admin-pflegehilfsmittel"])
app.include_router(pflegehm_mobile_router, prefix="/mobile", tags=["mobile-pflegehilfsmittel"])
app.include_router(public_sign_router, prefix="/public", tags=["public-sign"])
app.include_router(applicants_router, prefix="/admin", tags=["admin-applicants"])
app.include_router(mahnwesen_router, prefix="/admin", tags=["admin-mahnwesen"])


@app.get("/health")
def health():
    """Liveness: antwortet immer wenn der Prozess läuft."""
    return {"status": "ok"}


@app.get("/health/ors")
def health_ors():
    """Status der OpenRouteService-Integration für Km-/Fahrtkosten-Tracking.

    - configured: ORS_API_KEY ist gesetzt?
    - live_ok: ein Mini-Test-Request an ORS hat funktioniert?

    Ohne Auth bewusst – das Debugging wäre sonst pain, wenn das Mobile
    App nichts findet. Leakt nur ob ein Key gesetzt ist, nicht welcher.
    """
    from app.clients.ors_client import OrsClient
    client = OrsClient()
    configured = client.is_configured
    live_ok = False
    error: str | None = None
    if configured:
        try:
            results = client.autocomplete("Berlin", size=1)
            live_ok = len(results) > 0
            if not live_ok:
                error = "autocomplete returned 0 results for 'Berlin'"
        except Exception as exc:  # noqa: BLE001
            error = str(exc)[:200]
    else:
        error = "ORS_API_KEY env var not set"
    return {
        "configured": configured,
        "live_ok": live_ok,
        "error": error,
    }


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

    # Google-Sheets-Sync alle 30 Minuten. Läuft als Hintergrund-Task
    # im selben Event-Loop — kein zusätzliches Scheduler-Paket nötig.
    import asyncio

    async def _sheets_sync_loop() -> None:
        from app.db.session import SessionLocal
        from app.services.sheets_service import sync_users_from_sheet

        # Beim allerersten Start 60s warten damit DB/Migrations sicher up sind
        await asyncio.sleep(60)
        while True:
            try:
                db = SessionLocal()
                try:
                    result = sync_users_from_sheet(db)
                    logger.info(
                        "sheets_sync_periodic matched=%s unmatched_sheet=%s",
                        result.matched,
                        len(result.unmatched_sheet_names),
                    )
                finally:
                    db.close()
            except Exception as exc:  # noqa: BLE001
                logger.warning("sheets_sync_periodic_failed err=%s", exc)
            await asyncio.sleep(30 * 60)

    asyncio.create_task(_sheets_sync_loop())
