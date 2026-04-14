"""Strukturiertes Logging via structlog.

Ein einziger Aufruf von `configure_logging()` beim App-Start setzt sowohl die
stdlib `logging`-Library als auch structlog so auf, dass alle Logs als
JSON-Zeilen rauskommen (für leichte Aggregation in Hetzner/Caddy-Logs oder
externe Log-Sinks).

Wenn `LOG_FORMAT=console` gesetzt ist, gibt es stattdessen menschlich lesbare
ANSI-Logs — gedacht für lokale Entwicklung.
"""

from __future__ import annotations

import logging
import sys

import structlog

from app.core.settings import settings


def configure_logging() -> None:
    log_level = getattr(logging, settings.log_level.upper(), logging.INFO)

    # Stdlib root logger so umstellen, dass uvicorn / fastapi / sqlalchemy
    # ihre Logs durch structlog routen.
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=log_level,
    )

    # uvicorn.access ist sehr verbose und doppelt sich mit der request-id
    # middleware – auf WARNING runter.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    if settings.log_format == "console":
        renderer: structlog.types.Processor = structlog.dev.ConsoleRenderer()
    else:
        renderer = structlog.processors.JSONRenderer()

    structlog.configure(
        processors=shared_processors + [renderer],
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name) if name else structlog.get_logger()
