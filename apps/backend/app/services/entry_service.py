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
from app.services.sync_error_service import record_sync_error
from app.services.trip_service import (
    create_home_commute_segment,
    create_trip_segments,
)


logger = logging.getLogger(__name__)

MAX_HOURS_PER_DAY = 8.0


def _month_is_locked(
    db: Session, user_id: int, patient_id: int, year: int, month: int
) -> bool:
    """Prüft ob der Leistungsnachweis für diesen Monat bereits unterschrieben
    wurde → dann sind Einträge für diesen Monat locked."""
    exists = (
        db.query(SignatureEvent.id)
        .filter(
            SignatureEvent.patient_id == patient_id,
            SignatureEvent.document_type == "leistungsnachweis",
            SignatureEvent.status == "captured",
            extract("year", SignatureEvent.signed_at) == year,
            extract("month", SignatureEvent.signed_at) == month,
        )
        .first()
    )
    return exists is not None


# Patti type-Strings für die zwei Töpfe.
_PATTI_TYPE_BL = "careService"   # Betreuungsleistung §45b
_PATTI_TYPE_VP = "respiteCare"   # Verhinderungspflege §39


def _allocate_to_pots(
    entries: list[Entry],
    *,
    bl_remaining: float,
    vp_remaining: float,
    month: int,
) -> tuple[float, float, list[Entry]]:
    """Verteilt Einsätze auf BL und VP nach Fachregel.

    - Jan–Jun: Betreuungsleistung zuerst, VP nur als Overflow
    - Jul–Dez: Verhinderungspflege zuerst, BL nur als Overflow
    - Ein Eintrag ist atomar: passt er nicht ganz in einen Topf,
      wandert er als Ganzes in den anderen
    - Passt er in keinen Topf → wird nicht zu Patti gesendet (dropped)

    Returns (total_bl_hours, total_vp_hours, dropped_entries).
    """
    priority = ["bl", "vp"] if month <= 6 else ["vp", "bl"]
    pots = {"bl": bl_remaining, "vp": vp_remaining}
    placed_bl = 0.0
    placed_vp = 0.0
    dropped: list[Entry] = []
    for entry in sorted(entries, key=lambda e: (e.entry_date, e.id)):
        h = entry.hours
        if h <= 0:
            continue
        placed = False
        for pot in priority:
            if pots[pot] + 1e-9 >= h:
                pots[pot] -= h
                if pot == "bl":
                    placed_bl += h
                else:
                    placed_vp += h
                placed = True
                break
        if not placed:
            dropped.append(entry)
    return (round(placed_bl, 4), round(placed_vp, 4), dropped)


def _sync_patti_total_for_month(
    db: Session,
    *,
    user_id: int,
    patient_id: int,
    year: int,
    month: int,
) -> None:
    """Schreibt den Monats-Stand zu Patti, verteilt nach Fachregel auf
    Betreuungsleistung und Verhinderungspflege.

    Ablauf:
    1. Eigene alten Patti-IDs für (patient, monat) löschen
    2. Aktuellen Restbudget-Stand bei Patti abfragen (jetzt ohne uns)
    3. Allokation pro Eintrag in BL/VP nach Monats-Priorität
    4. Pro Topf max 1 service-entry mit aggregierter Summe POSTen
    """
    from calendar import monthrange

    try:
        first = date(year, month, 1)
        last = date(year, month, monthrange(year, month)[1])

        entries_in_month = (
            db.query(Entry)
            .filter(
                Entry.user_id == user_id,
                Entry.patient_id == patient_id,
                Entry.entry_type == "patient",
                Entry.entry_date >= first,
                Entry.entry_date <= last,
            )
            .all()
        )
        old_patti_ids = [
            e.patti_service_entry_id
            for e in entries_in_month
            if e.patti_service_entry_id is not None
        ]

        client = PattiClient()
        client.login()

        # 1. Alte Patti-IDs aus diesem Monat löschen
        for pid in old_patti_ids:
            try:
                client.delete_service_entry(pid)
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "patti_delete_failed id=%s err=%s", pid, exc
                )
        for e in entries_in_month:
            e.patti_service_entry_id = None
        db.commit()

        if not entries_in_month:
            return

        # 2. Frische Restbudgets abfragen — jetzt ohne unsere Anteile
        try:
            bl_budget = client.get_remaining_care_service_budget(
                patient_id, year
            )
            bl_remaining = float(
                bl_budget.get("remaining_hours")
                or bl_budget.get("remainingHours")
                or 0.0
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("patti_bl_budget_fetch_failed err=%s", exc)
            bl_remaining = 0.0
        try:
            vp_budget = client.get_remaining_respite_care_budget(
                patient_id, year
            )
            vp_remaining = float(
                vp_budget.get("remaining_hours")
                or vp_budget.get("remainingHours")
                or 0.0
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("patti_vp_budget_fetch_failed err=%s", exc)
            vp_remaining = 0.0

        # 3. Allokation
        total_bl, total_vp, dropped = _allocate_to_pots(
            entries_in_month,
            bl_remaining=bl_remaining,
            vp_remaining=vp_remaining,
            month=month,
        )
        if dropped:
            logger.warning(
                "patti_sync_dropped user=%s patient=%s %s-%s "
                "ids=%s reason=insufficient_budget bl=%s vp=%s",
                user_id, patient_id, year, month,
                [e.id for e in dropped], bl_remaining, vp_remaining,
            )

        logger.info(
            "patti_sync_alloc user=%s patient=%s %s-%s bl=%s vp=%s",
            user_id, patient_id, year, month, total_bl, total_vp,
        )

        # 4. POST pro Topf (max 1 entry pro Topf)
        master_entry = sorted(entries_in_month, key=lambda e: e.id)[0]
        for total, type_ in (
            (total_bl, _PATTI_TYPE_BL),
            (total_vp, _PATTI_TYPE_VP),
        ):
            if total <= 0:
                continue
            try:
                response = client.create_service_entry(
                    patient_id=patient_id,
                    year=year,
                    month=month,
                    hours=total,
                    type_=type_,
                )
                new_id = (
                    response.get("id")
                    if isinstance(response, dict)
                    else None
                )
                if new_id:
                    master_entry.patti_service_entry_id = new_id
                    db.commit()
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "patti_post_failed type=%s total=%s err=%s",
                    type_, total, exc,
                )
                record_sync_error(
                    db,
                    kind="patti_post",
                    message=f"{type_} total={total}: {exc}",
                    user_id=user_id,
                    patient_id=patient_id,
                    year=year,
                    month=month,
                )
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "patti_sync_month_failed user=%s patient=%s %s-%s err=%s",
            user_id, patient_id, year, month, exc,
        )
        record_sync_error(
            db,
            kind="patti_sync_month",
            message=str(exc),
            user_id=user_id,
            patient_id=patient_id,
            year=year,
            month=month,
        )


def _sync_entry_to_patti(
    db: Session,
    entry: Entry,
    *,
    delta_hours: float,
) -> None:
    """Wrapper für Rückwärts-Kompatibilität — leitet auf den neuen
    Monats-Sync weiter. delta_hours wird ignoriert, wir senden immer
    die volle Monats-Summe."""
    _sync_patti_total_for_month(
        db,
        user_id=entry.user_id,
        patient_id=entry.patient_id,
        year=entry.entry_date.year,
        month=entry.entry_date.month,
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
        elif payload.entry_type == "home_commute":
            try:
                create_home_commute_segment(
                    db,
                    entry=entry,
                    user=user,
                    start_address=(payload.home_commute_start_address or "").strip(),
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "home_commute_segment_failed entry=%s error=%s",
                    entry.id,
                    exc,
                )
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
        logger.warning(
            "trip_segment_create_failed entry=%s error=%s",
            entry.id,
            exc,
        )


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

    was_patient_entry = entry.entry_type == "patient" and entry.patient_id
    patient_id = entry.patient_id
    year = entry.entry_date.year
    month = entry.entry_date.month
    captured_patti_id = entry.patti_service_entry_id
    db.delete(entry)
    db.commit()

    if was_patient_entry:
        # Erst die Patti-ID des gelöschten Eintrags wegputzen,
        # dann den vollen Monats-Sync laufen lassen.
        if captured_patti_id is not None:
            try:
                client = PattiClient()
                client.login()
                client.delete_service_entry(captured_patti_id)
                logger.info(
                    "patti_delete_after_entry_delete id=%s",
                    captured_patti_id,
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "patti_delete_after_entry_delete_failed id=%s err=%s",
                    captured_patti_id,
                    exc,
                )
        _sync_patti_total_for_month(
            db,
            user_id=user_id,
            patient_id=patient_id,
            year=year,
            month=month,
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
            "entry_hours_reduced_patti_out_of_sync entry=%s delta=%s",
            entry.id,
            delta_hours,
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
