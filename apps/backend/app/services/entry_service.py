"""Business logic für Tageseinsätze (Entries).

MVP-Fachregeln (aus docs/MVP-Scope):
- Pro (user, patient, entry_date) genau 1 Datensatz. Gleicher Tag = Stunden
  werden auf bestehenden Eintrag addiert (bis max. 8.0).
- Keine Zukunftstage (wird im Schema geprüft).
- Nach Unterschrift eines Leistungsnachweises für einen Monat → Einträge dieses
  Monats sind locked. Service erlaubt kein create/update/delete mehr.
- 0.5-Schritte (wird im Schema geprüft).
"""

import logging
from calendar import monthrange
from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import extract, func
from sqlalchemy.orm import Session

from app.clients.patti_client import PattiClient
from app.models.entry import Entry
from app.models.signature_event import SignatureEvent
from app.models.user import User
from app.schemas.entry import EntryCreate, PatientHoursSummary
from app.services.trip_service import create_trip_segments


logger = logging.getLogger(__name__)

MAX_HOURS_PER_DAY = 8.0


def _month_is_locked(
    db: Session, user_id: int, patient_id: int, year: int, month: int
) -> bool:
    """Prüft ob der Leistungsnachweis für diesen Monat bereits unterschrieben
    wurde (by any source) → dann sind Einträge für diesen Monat locked."""
    first_day = date(year, month, 1)
    last_day = date(year, month, monthrange(year, month)[1])

    exists = (
        db.query(SignatureEvent.id)
        .filter(
            SignatureEvent.patient_id == patient_id,
            SignatureEvent.document_type == "leistungsnachweis",
            SignatureEvent.signed_at >= first_day,
            SignatureEvent.signed_at <= last_day,
        )
        .first()
    )
    return exists is not None


def _sync_entry_to_patti(
    db: Session,
    entry: Entry,
    *,
    delta_hours: float,
) -> None:
    """Legt die (Delta-) Stunden in Patti an, damit die Reststunden-Berechnung
    dort sofort stimmt.

    Confirmed Patti shape (live-tested):
        POST /api/v1/service-entries
        {
          "patient_id": int,
          "type": "careService",
          "kind": "serviced",
          "year": YYYY,
          "month": M,
          "hours": float
        }

    Beim Update (same-day-hours-addition) wollen wir nur das *Delta* an Patti
    schicken, nicht die neue Gesamtsumme — sonst würde Patti doppelt zählen.

    Fehler werden als Warning geloggt aber nicht hochgeschickt. Die Mobile
    App zeigt dem User den Einsatz als gespeichert, auch wenn der Patti-Sync
    fehlschlägt — das Büro kann ihn dann manuell nacharbeiten.
    """
    if delta_hours <= 0:
        return

    try:
        client = PattiClient()
        client.login()

        response = client.create_service_entry(
            patient_id=entry.patient_id,
            year=entry.entry_date.year,
            month=entry.entry_date.month,
            hours=round(delta_hours, 4),
        )

        new_patti_id = response.get("id") if isinstance(response, dict) else None
        if new_patti_id:
            # Nur beim allerersten Sync die ID speichern – für addierte
            # Einsätze erzeugen wir separate service-entries in Patti, das
            # ist konsistent mit Patti's eigener kind="serviced"-Aggregation.
            if entry.patti_service_entry_id is None:
                entry.patti_service_entry_id = new_patti_id
                db.commit()
            logger.info(
                "Patti sync ok for entry %s: patti_id=%s delta=%sh",
                entry.id,
                new_patti_id,
                delta_hours,
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Patti sync failed for entry %s (delta %sh): %s",
            entry.id,
            delta_hours,
            exc,
        )


def _resolve_patient_address(patient_id: int) -> str | None:
    """Format a full Patti patient address for geocoding. Errors → None."""
    try:
        client = PattiClient()
        client.login()
        patient = client.get_patient(patient_id)
        # Die /patients/{id} response hat die Adresse nested. Wir holen auch
        # /people/{id} weil das die address-struktur sauberer liefert.
        person = client.get_person(patient_id)
        address = person.get("address") or {}
        line = address.get("address_line")
        city = address.get("city")
        zip_code = address.get("zip_code")
        if isinstance(zip_code, dict):
            zip_code = zip_code.get("zip_code") or zip_code.get("title")
        parts = []
        if line:
            parts.append(line)
        if zip_code or city:
            parts.append(f"{zip_code or ''} {city or ''}".strip())
        return ", ".join(parts) if parts else None
    except Exception:  # noqa: BLE001
        return None


def create_or_update_entry(
    db: Session, user: User, payload: EntryCreate
) -> Entry:
    """Erzeugt oder addiert einen Einsatz.

    3 Fälle:
    - entry_type=patient + patient_id gesetzt: pro (user, patient, date)
      wird gesucht. Existiert schon einer → Stunden addieren + Tätigkeiten
      mergen. Ansonsten neu anlegen. Patti-Sync läuft danach (delta_hours).
    - entry_type!=patient (office/training/other): pro (user, date, type)
      wird gesucht. Stunden addieren bei Match. Kein Patient, kein Patti-Sync.
    """

    user_id = user.id

    # Validierung für Patient-Einsätze
    if payload.entry_type == "patient":
        if payload.patient_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="patient_id ist für entry_type=patient erforderlich",
            )
        # Lock-Check nur für Patient-Einsätze (Leistungsnachweis ist pro Patient+Monat)
        if _month_is_locked(
            db,
            user_id=user_id,
            patient_id=payload.patient_id,
            year=payload.entry_date.year,
            month=payload.entry_date.month,
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Der Leistungsnachweis für diesen Monat wurde bereits unterschrieben. "
                "Einträge können nicht mehr geändert werden.",
            )

        existing = (
            db.query(Entry)
            .filter(
                Entry.user_id == user_id,
                Entry.patient_id == payload.patient_id,
                Entry.entry_date == payload.entry_date,
                Entry.entry_type == "patient",
            )
            .first()
        )
    else:
        # Office/Training/Other: pro (user, date, type) max 1 Eintrag
        existing = (
            db.query(Entry)
            .filter(
                Entry.user_id == user_id,
                Entry.entry_date == payload.entry_date,
                Entry.entry_type == payload.entry_type,
                Entry.patient_id.is_(None),
            )
            .first()
        )

    new_activities_str = ", ".join(payload.activities) if payload.activities else ""

    if existing is None:
        entry = Entry(
            user_id=user_id,
            patient_id=payload.patient_id if payload.entry_type == "patient" else None,
            entry_type=payload.entry_type,
            category_label=payload.category_label,
            entry_date=payload.entry_date,
            hours=payload.hours,
            activities=new_activities_str,
            note=payload.note,
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)
        if payload.entry_type == "patient":
            _sync_entry_to_patti(db, entry, delta_hours=entry.hours)
            _maybe_create_trip_segments(db, entry=entry, user=user, payload=payload)
        return entry

    # Stunden addieren, aber Deckel bei 8.0
    combined = existing.hours + payload.hours
    if combined > MAX_HOURS_PER_DAY:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximal {MAX_HOURS_PER_DAY} h pro Tag. Vorhandene Stunden: {existing.hours}",
        )
    existing.hours = combined

    # Tätigkeiten mergen (Duplikate entfernen, Reihenfolge erhalten)
    existing_activities = [
        a.strip() for a in (existing.activities or "").split(",") if a.strip()
    ]
    for act in payload.activities:
        if act and act not in existing_activities:
            existing_activities.append(act)
    existing.activities = ", ".join(existing_activities)

    if payload.note:
        existing.note = (
            f"{existing.note}\n{payload.note}" if existing.note else payload.note
        )

    db.commit()
    db.refresh(existing)
    # Patti-Sync und Trip-Segments nur für Patient-Einsätze
    if payload.entry_type == "patient":
        _sync_entry_to_patti(db, existing, delta_hours=payload.hours)
        if payload.trip is not None and (
            payload.trip.intermediate_stops
            or not payload.trip.start_from_home
        ):
            _maybe_create_trip_segments(db, entry=existing, user=user, payload=payload)
    return existing


def _maybe_create_trip_segments(
    db: Session, *, entry: Entry, user: User, payload: EntryCreate
) -> None:
    """Wrapper that converts the pydantic TripInputSchema into the dict shape
    the trip_service expects, then fires and forgets. Failures are logged but
    don't break the entry save."""
    if payload.trip is None:
        return
    patient_address = _resolve_patient_address(payload.patient_id)
    if not patient_address:
        logger.info(
            "trip_skip_no_patient_address", patient_id=payload.patient_id
        )
        return
    try:
        create_trip_segments(
            db,
            entry=entry,
            user=user,
            patient_address=patient_address,
            trip_input={
                "start_from_home": payload.trip.start_from_home,
                "start_address": payload.trip.start_address,
                "intermediate_stops": payload.trip.intermediate_stops,
            },
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("trip_segment_create_failed", entry_id=entry.id, error=str(exc))


def list_entries_for_user(
    db: Session,
    user_id: int,
    patient_id: int | None = None,
    year: int | None = None,
    month: int | None = None,
    limit: int = 200,
    scope: str = "mine",
) -> list[Entry]:
    """List entries.

    scope="mine" → nur die des current user (Default, für HomeScreen/Calendar)
    scope="patient" → alle Einsätze für den patient (inkl. Vertretungs-Kollegen).
        patient_id wird dann Pflicht. Wird für PatientDetail genutzt.
    """
    query = db.query(Entry)
    if scope == "patient":
        if patient_id is None:
            return []
        query = query.filter(Entry.patient_id == patient_id)
    else:
        query = query.filter(Entry.user_id == user_id)
        if patient_id is not None:
            query = query.filter(Entry.patient_id == patient_id)
    if year is not None:
        query = query.filter(extract("year", Entry.entry_date) == year)
    if month is not None:
        query = query.filter(extract("month", Entry.entry_date) == month)
    return query.order_by(Entry.entry_date.desc()).limit(limit).all()


def get_entry_for_user(db: Session, user_id: int, entry_id: int) -> Entry:
    entry = (
        db.query(Entry)
        .filter(Entry.id == entry_id, Entry.user_id == user_id)
        .first()
    )
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Eintrag nicht gefunden",
        )
    return entry


def delete_entry_for_user(db: Session, user_id: int, entry_id: int) -> None:
    entry = get_entry_for_user(db, user_id, entry_id)

    if _month_is_locked(
        db,
        user_id=user_id,
        patient_id=entry.patient_id,
        year=entry.entry_date.year,
        month=entry.entry_date.month,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Monat ist bereits unterschrieben – Eintrag kann nicht gelöscht werden.",
        )

    patti_id = entry.patti_service_entry_id
    db.delete(entry)
    db.commit()

    # Nach erfolgreichem DB-Delete: Patti bescheid geben, damit die Reststunden
    # dort stimmen. Fehler werden geloggt aber nicht propagiert — das Büro
    # kann in Patti notfalls manuell nacharbeiten.
    if patti_id is not None:
        try:
            client = PattiClient()
            client.login()
            client.delete_service_entry(patti_id)
            logger.info("patti_service_entry_deleted", patti_id=patti_id)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "patti_service_entry_delete_failed",
                patti_id=patti_id,
                error=str(exc),
            )


def update_entry_for_user(
    db: Session,
    user: User,
    entry_id: int,
    *,
    hours: float | None = None,
    activities: list[str] | None = None,
    note: str | None = None,
) -> Entry:
    """Bearbeitet einen bestehenden Einsatz.

    Nur hours/activities/note sind editierbar — Datum, Patient und Typ
    bleiben fix, damit die Patti-Sync-Invariante nicht kaputt geht.
    Änderungen der Stunden werden als Delta an Patti geschickt.
    """
    entry = get_entry_for_user(db, user.id, entry_id)

    if _month_is_locked(
        db,
        user_id=user.id,
        patient_id=entry.patient_id,
        year=entry.entry_date.year,
        month=entry.entry_date.month,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Monat ist bereits unterschrieben – Eintrag kann nicht mehr geändert werden.",
        )

    delta_hours = 0.0
    if hours is not None:
        if hours <= 0 or hours > MAX_HOURS_PER_DAY:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Stunden müssen zwischen 0 und {MAX_HOURS_PER_DAY} liegen",
            )
        delta_hours = round(hours - entry.hours, 4)
        entry.hours = hours

    if activities is not None:
        entry.activities = ", ".join(a for a in activities if a)

    if note is not None:
        entry.note = note if note else None

    db.commit()
    db.refresh(entry)

    # Delta-Stunden an Patti schicken (nur bei patient-Entries und
    # positivem Delta; negative Deltas kann Patti's kind='serviced'-
    # Aggregation aktuell nicht abbilden und werden geloggt).
    if entry.entry_type == "patient" and delta_hours > 0:
        _sync_entry_to_patti(db, entry, delta_hours=delta_hours)
    elif entry.entry_type == "patient" and delta_hours < 0:
        logger.warning(
            "entry_hours_reduced_patti_out_of_sync",
            entry_id=entry.id,
            delta_hours=delta_hours,
        )

    return entry


def get_patient_hours_summary(
    db: Session, user_id: int, patient_id: int, year: int, month: int
) -> PatientHoursSummary:
    """Aggregiert Stunden eines Patienten für einen Monat + Lock-Status."""
    result = (
        db.query(
            func.coalesce(func.sum(Entry.hours), 0.0).label("used_hours"),
            func.count(Entry.id).label("entries_count"),
        )
        .filter(
            Entry.user_id == user_id,
            Entry.patient_id == patient_id,
            extract("year", Entry.entry_date) == year,
            extract("month", Entry.entry_date) == month,
        )
        .one()
    )

    locked = _month_is_locked(
        db, user_id=user_id, patient_id=patient_id, year=year, month=month
    )

    return PatientHoursSummary(
        patient_id=patient_id,
        year=year,
        month=month,
        used_hours=float(result.used_hours or 0.0),
        entries_count=int(result.entries_count or 0),
        is_locked=locked,
    )


__all__ = [
    "create_or_update_entry",
    "list_entries_for_user",
    "get_entry_for_user",
    "delete_entry_for_user",
    "update_entry_for_user",
    "get_patient_hours_summary",
]
