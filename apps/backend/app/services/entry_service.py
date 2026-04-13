"""Business logic für Tageseinsätze (Entries).

MVP-Fachregeln (aus docs/MVP-Scope):
- Pro (user, patient, entry_date) genau 1 Datensatz. Gleicher Tag = Stunden
  werden auf bestehenden Eintrag addiert (bis max. 8.0).
- Keine Zukunftstage (wird im Schema geprüft).
- Nach Unterschrift eines Leistungsnachweises für einen Monat → Einträge dieses
  Monats sind locked. Service erlaubt kein create/update/delete mehr.
- 0.5-Schritte (wird im Schema geprüft).
"""

from calendar import monthrange
from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import extract, func
from sqlalchemy.orm import Session

from app.models.entry import Entry
from app.models.signature_event import SignatureEvent
from app.schemas.entry import EntryCreate, PatientHoursSummary


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


def create_or_update_entry(
    db: Session, user_id: int, payload: EntryCreate
) -> Entry:
    """Wenn für (user, patient, date) schon ein Eintrag existiert: Stunden
    addieren (bis max 8.0), Tätigkeiten mergen. Sonst neu anlegen."""

    # Lock-Check
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
        )
        .first()
    )

    new_activities_str = ", ".join(payload.activities) if payload.activities else ""

    if existing is None:
        entry = Entry(
            user_id=user_id,
            patient_id=payload.patient_id,
            entry_date=payload.entry_date,
            hours=payload.hours,
            activities=new_activities_str,
            note=payload.note,
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)
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
    return existing


def list_entries_for_user(
    db: Session,
    user_id: int,
    patient_id: int | None = None,
    year: int | None = None,
    month: int | None = None,
    limit: int = 200,
) -> list[Entry]:
    query = db.query(Entry).filter(Entry.user_id == user_id)
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

    db.delete(entry)
    db.commit()


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
    "get_patient_hours_summary",
]
