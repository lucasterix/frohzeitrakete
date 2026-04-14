"""HTTP-Middleware: Request-ID, Access-Log, Rate-Limit-Setup."""

from __future__ import annotations

import time
import uuid

import structlog
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from app.core.logging import get_logger

logger = get_logger("http")


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Bindet eine Request-ID an den structlog-Kontext und loggt Start + Ende.

    - Wenn der Client einen `X-Request-ID`-Header schickt, wird der übernommen.
      Sonst wird eine neue UUID4 generiert.
    - Antwort enthält die Request-ID im selben Header zurück, damit Clients
      bei einem Bug-Report die Server-Logs gezielt finden können.
    - Jeder Request bekommt eine Zeile im Log mit Methode, Pfad, Status,
      Latenz in ms.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())

        # contextvars: jeder Log-Aufruf in diesem Request bekommt request_id
        # automatisch mitgeloggt — ohne dass die Routes etwas tun müssen.
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            method=request.method,
            path=request.url.path,
            client=request.client.host if request.client else None,
        )

        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            duration_ms = round((time.perf_counter() - start) * 1000, 1)
            logger.exception("request_failed", duration_ms=duration_ms)
            raise

        duration_ms = round((time.perf_counter() - start) * 1000, 1)
        logger.info(
            "request_completed",
            status=response.status_code,
            duration_ms=duration_ms,
        )

        response.headers["X-Request-ID"] = request_id
        return response
