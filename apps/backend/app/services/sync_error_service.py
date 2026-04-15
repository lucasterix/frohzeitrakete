"""Helper für das Befüllen der sync_errors Tabelle.

Wird von den Patti-Write-Pfaden aufgerufen wenn ein Schreibversuch
fehlschlägt (Budget-Fetch, Entry-POST, Entry-DELETE). Die Liste ist
für das Büro da, damit sie unzustellbare Writes gezielt nachziehen
können statt im Backend-Log zu suchen."""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.models.sync_error import SyncError


logger = logging.getLogger(__name__)


def record_sync_error(
    db: Session,
    *,
    kind: str,
    message: str,
    user_id: int | None = None,
    patient_id: int | None = None,
    year: int | None = None,
    month: int | None = None,
) -> None:
    try:
        row = SyncError(
            kind=kind,
            message=message[:4000],
            user_id=user_id,
            patient_id=patient_id,
            year=year,
            month=month,
        )
        db.add(row)
        db.commit()
    except Exception as exc:  # noqa: BLE001
        # Das Log einer Fehler-Meldung darf niemals selbst die
        # Hauptoperation killen.
        logger.warning("record_sync_error_failed kind=%s err=%s", kind, exc)
        try:
            db.rollback()
        except Exception:  # noqa: BLE001
            pass
