from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.core.auth import get_current_user
from app.core.settings import settings
from app.db.session import get_db
from app.models.signature_asset import SignatureAsset
from app.models.signature_event import SignatureEvent
from app.models.user import User
from app.schemas.entry import (
    EntryCreate,
    EntryResponse,
    EntryUpdate,
    PatientHoursSummary,
)
from app.schemas.patient import (
    CallRequestCreate,
    CallRequestResponse,
    CaretakerHistoryEntry,
    MobilePatient,
    MobilePatientUpdate,
    PatientBudget,
    PatientExtrasResponse,
    PatientExtrasUpdate,
    UserHomeResponse,
    UserHomeUpdate,
)
from app.schemas.signature import MobileSignatureCreate, SignatureEventResponse
from app.services.entry_service import (
    create_or_update_entry,
    delete_entry_for_user,
    get_entry_for_user,
    get_patient_hours_summary,
    list_entries_for_user,
    update_entry_for_user,
)
from app.schemas.patient_intake import (
    PatientIntakeCreate,
    PatientIntakeResponse,
)
from app.services.call_request_service import create_call_request
from app.services.patient_intake_service import create_intake
from app.services.notification_service import (
    count_unread,
    list_user_notifications,
    mark_all_read,
    mark_read,
    notify_all_admins,
)
from app.services.patient_extras_service import (
    get_or_create_extras,
    refresh_contract_state,
    set_emergency_contact,
)
from app.services.user_home_service import get_home_location, set_home_location
from app.services.patient_service import (
    get_caretaker_history,
    get_patient_budget,
    get_patients_for_user,
    search_patients,
    update_patient_data,
)

router = APIRouter()


@router.get("/app-version")
def mobile_app_version():
    return {
        "min_version": "1.0.0",
        "latest_version": "1.0.0",
        "force_update": False,
        "update_message": "Eine neue Version ist verfügbar. Bitte aktualisiere die App.",
        "ios_url": "https://apps.apple.com/app/frohzeit-rakete/id0000000000",
        "android_url": "https://play.google.com/store/apps/details?id=de.froehlichdienste.frohzeitrakete",
    }


@router.get("/patients", response_model=list[MobilePatient])
def mobile_get_patients(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_patients_for_user(db=db, user=current_user)


@router.get("/patients/search", response_model=list[MobilePatient])
def mobile_search_patients(
    q: str = Query(..., min_length=2, max_length=100),
    current_user: User = Depends(get_current_user),
):
    """Globale Patti-Patientensuche für den Vertretungsfall."""
    return search_patients(q)


@router.get("/patients/{patient_id}", response_model=MobilePatient)
def mobile_get_patient_detail(
    patient_id: int,
    current_user: User = Depends(get_current_user),
):
    """Einzelnen Patienten aus Patti laden."""
    from app.services.patient_service import get_patient_detail
    patient = get_patient_detail(patient_id=patient_id, user=current_user)
    if patient is None:
        raise HTTPException(status_code=404, detail="patient_not_found")
    return patient


@router.post("/signatures", response_model=SignatureEventResponse, status_code=status.HTTP_201_CREATED)
def mobile_create_signature(
    payload: MobileSignatureCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    svg = payload.svg_content.strip()
    if not svg.startswith("<svg"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="svg_content muss mit <svg beginnen",
        )

    signed_at = payload.signed_at or datetime.utcnow()

    event = SignatureEvent(
        patient_id=payload.patient_id,
        document_type=payload.document_type,
        status="captured",
        signer_name=payload.signer_name,
        info_text_version=payload.info_text_version,
        source="mobile",
        note=payload.note,
        created_by_user_id=current_user.id,
        signed_at=signed_at,
    )
    db.add(event)
    db.flush()

    asset = SignatureAsset(
        signature_event_id=event.id,
        svg_content=payload.svg_content,
        width=payload.width,
        height=payload.height,
    )
    db.add(asset)
    db.commit()

    # Wenn ein Betreuungsvertrag unterschrieben wurde, patient_extras
    # sofort aktualisieren damit die grüne Badge erscheint ohne Reload.
    if payload.document_type == "betreuungsvertrag":
        refresh_contract_state(db, payload.patient_id)

    # Auto-create pending budget inquiry on first signature for this patient
    try:
        from app.services.budget_inquiry_service import ensure_pending_budget_inquiry
        ensure_pending_budget_inquiry(db, payload.patient_id, current_user.id)
    except Exception:  # noqa: BLE001
        pass  # best-effort, don't break signature creation

    created = (
        db.query(SignatureEvent)
        .options(joinedload(SignatureEvent.asset))
        .filter(SignatureEvent.id == event.id)
        .first()
    )
    return created


@router.get("/signatures", response_model=list[SignatureEventResponse])
def mobile_list_my_signatures(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(SignatureEvent)
        .options(joinedload(SignatureEvent.asset))
        .filter(SignatureEvent.created_by_user_id == current_user.id)
        .order_by(SignatureEvent.signed_at.desc())
        .limit(100)
        .all()
    )


@router.get(
    "/patients/{patient_id}/signatures",
    response_model=list[SignatureEventResponse],
)
def mobile_list_signatures_for_patient(
    patient_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Komplette Signatur-Historie eines Patienten (egal von welchem Betreuer).

    Damit der Betreuer im PatientDetail sehen kann welche Leistungsnachweise,
    VP-Anträge und Betreuungsverträge bereits existieren.
    """
    return (
        db.query(SignatureEvent)
        .options(joinedload(SignatureEvent.asset))
        .filter(SignatureEvent.patient_id == patient_id)
        .order_by(SignatureEvent.signed_at.desc())
        .limit(200)
        .all()
    )


@router.get("/signatures/{signature_id}", response_model=SignatureEventResponse)
def mobile_get_signature(
    signature_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = (
        db.query(SignatureEvent)
        .options(joinedload(SignatureEvent.asset))
        .filter(
            SignatureEvent.id == signature_id,
            SignatureEvent.created_by_user_id == current_user.id,
        )
        .first()
    )

    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Signatur nicht gefunden",
        )

    return event


# ---------------- Entries (Tageseinsätze) ----------------


@router.post(
    "/entries",
    response_model=EntryResponse,
    status_code=status.HTTP_201_CREATED,
)
def mobile_create_entry(
    payload: EntryCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Legt einen Tageseinsatz an. Wenn für denselben Tag schon einer existiert,
    werden die Stunden addiert (MVP-Regel).

    Locked-Check: Wenn der Leistungsnachweis für diesen Monat bereits unterschrieben
    wurde → 409 Conflict.

    Nach dem Speichern wird der Einsatz best-effort auch in Patti angelegt,
    damit die Reststunden-Berechnung dort aktuell bleibt.
    """
    entry = create_or_update_entry(db, user=current_user, payload=payload)
    return EntryResponse.from_orm_entry(entry, user_name=current_user.full_name)


@router.get("/entries", response_model=list[EntryResponse])
def mobile_list_entries(
    patient_id: int | None = Query(default=None),
    year: int | None = Query(default=None, ge=2020, le=2100),
    month: int | None = Query(default=None, ge=1, le=12),
    scope: str = Query(default="mine", pattern="^(mine|patient)$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Listet Einsätze, optional gefiltert nach patient_id, year, month.

    `scope=mine` (default) → nur die Einsätze des aktuellen Users.
    `scope=patient` + patient_id → alle Einsätze aller Betreuer für diesen
    Patienten. Wird auf PatientDetail genutzt damit man auch sieht wenn
    ein Vertretungs-Kollege einen Einsatz erfasst hat.

    Die Response enthält `user_name` damit das Frontend bei fremden
    Einsätzen den Namen des Betreuers direkt anzeigen kann.
    """
    entries = list_entries_for_user(
        db,
        user_id=current_user.id,
        patient_id=patient_id,
        year=year,
        month=month,
        scope=scope,
    )
    # Eager-load user names to avoid N+1
    user_ids = {e.user_id for e in entries}
    users = (
        db.query(User).filter(User.id.in_(user_ids)).all() if user_ids else []
    )
    name_by_id = {u.id: u.full_name for u in users}
    return [
        EntryResponse.from_orm_entry(e, user_name=name_by_id.get(e.user_id))
        for e in entries
    ]


@router.get("/entries/{entry_id}", response_model=EntryResponse)
def mobile_get_entry(
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = get_entry_for_user(db, user_id=current_user.id, entry_id=entry_id)
    user = db.query(User).filter(User.id == entry.user_id).first()
    return EntryResponse.from_orm_entry(
        entry, user_name=user.full_name if user else None
    )


@router.delete("/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def mobile_delete_entry(
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    delete_entry_for_user(db, user_id=current_user.id, entry_id=entry_id)
    return None


@router.patch("/entries/{entry_id}", response_model=EntryResponse)
def mobile_update_entry(
    entry_id: int,
    payload: EntryUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = update_entry_for_user(
        db,
        current_user,
        entry_id,
        hours=payload.hours,
        activities=payload.activities,
        note=payload.note,
    )
    return EntryResponse.from_orm_entry(
        entry, user_name=current_user.full_name
    )


@router.get(
    "/patients/{patient_id}/hours-summary",
    response_model=PatientHoursSummary,
)
def mobile_patient_hours_summary(
    patient_id: int,
    year: int = Query(..., ge=2020, le=2100),
    month: int = Query(..., ge=1, le=12),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Aggregiert für einen Patient+Monat: used_hours + entries_count + is_locked.

    `used_hours` = Summe der vom aktuellen User erfassten Einsätze.
    `is_locked` = Leistungsnachweis für diesen Monat ist bereits unterschrieben.
    """
    return get_patient_hours_summary(
        db,
        user_id=current_user.id,
        patient_id=patient_id,
        year=year,
        month=month,
    )


@router.patch("/patients/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
def mobile_update_patient(
    patient_id: int,
    payload: MobilePatientUpdate,
    current_user: User = Depends(get_current_user),
):
    """Partial update von Patient-Stammdaten, direkt in Patti geschrieben.

    Felder die nicht gesetzt sind bleiben unverändert. Ein leerer String
    "" löscht das Feld in Patti (z.B. um eine Telefonnummer zu entfernen).

    Wird von der Mobile-App genutzt damit Betreuungskräfte fehlende
    Stammdaten beim Patienten direkt nachtragen können – das Büro muss
    das nicht mehr manuell machen.
    """
    update_patient_data(
        patient_id,
        user=current_user,
        phone=payload.phone,
        phone_landline=payload.phone_landline,
        insurance_number=payload.insurance_number,
        birthday=payload.birthday,
    )
    return None


@router.get(
    "/patients/{patient_id}/caretaker-history",
    response_model=list[CaretakerHistoryEntry],
)
def mobile_patient_caretaker_history(
    patient_id: int,
    current_user: User = Depends(get_current_user),
):
    """Liste aller Betreuer (aktuelle + ehemalige) für einen Patienten,
    inkl. Zeitraum. Sortiert aktiv zuerst, dann chronologisch rückwärts."""
    return get_caretaker_history(patient_id)


@router.get("/geocode/autocomplete")
def mobile_geocode_autocomplete(
    q: str = Query(..., min_length=3, max_length=200),
    current_user: User = Depends(get_current_user),
):
    """Live-Adress-Autocomplete während der Nutzer tippt.

    Hits OpenRouteService. Returns a list of {label, longitude, latitude}
    candidates. Used by the mobile app to validate addresses for trip
    tracking — user can tap a result and we save the exact ORS-normalized
    label, eliminating typos.

    Error cases:
    - ORS_API_KEY not set → 503 Service Unavailable, mobile app shows
      a fallback "Freitext trotzdem übernehmen" option
    - ORS call fails (quota, 5xx) → 502 Bad Gateway so the mobile app
      can tell the user to retry
    """
    from app.clients.ors_client import OrsClient
    client = OrsClient()
    if not client.is_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Adress-Autocomplete ist nicht konfiguriert "
            "(ORS_API_KEY fehlt auf dem Server).",
        )
    try:
        results = client.autocomplete(q.strip(), size=6)
        return results
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Adress-Dienst nicht erreichbar: {exc}",
        )


@router.get("/user/home", response_model=UserHomeResponse | None)
def mobile_get_user_home(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Home address des aktuellen Users (für Km-Berechnung beim ersten
    Einsatz des Tages). Wird beim ersten Aufruf aus Patti gezogen und
    gecached; kann danach vom User manuell überschrieben werden."""
    home = get_home_location(db, current_user)
    if home is None:
        return None
    return UserHomeResponse(
        address_line=home.address_line,
        latitude=home.latitude,
        longitude=home.longitude,
        source=home.source,
    )


@router.put("/user/home", response_model=UserHomeResponse)
def mobile_set_user_home(
    payload: UserHomeUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Home address manuell setzen – überschreibt den Patti-Cache."""
    home = set_home_location(
        db,
        current_user,
        address_line=payload.address_line,
        source="manual",
    )
    return UserHomeResponse(
        address_line=home.address_line,
        latitude=home.latitude,
        longitude=home.longitude,
        source=home.source,
    )


@router.get("/entries/today-count")
def mobile_entries_today_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Wie viele Einsätze hat der User heute schon erfasst?
    Die Mobile-App braucht das um zu entscheiden ob der "Start-Adresse"-
    Dialog beim EntryScreen angezeigt werden soll (nur beim ersten
    Einsatz des Tages).
    """
    from datetime import date as _date
    from app.models.entry import Entry
    today = _date.today()
    count = (
        db.query(Entry)
        .filter(
            Entry.user_id == current_user.id,
            Entry.entry_date == today,
        )
        .count()
    )
    return {"date": today.isoformat(), "count": count, "is_first": count == 0}


@router.get(
    "/patients/{patient_id}/extras",
    response_model=PatientExtrasResponse,
)
def mobile_get_patient_extras(
    patient_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Notfallkontakt + Vertrags-Status + weitere Zusatzdaten für diesen
    Patienten aus unserer eigenen DB (Patti kennt das nicht)."""
    extras = refresh_contract_state(db, patient_id)
    return PatientExtrasResponse(
        patient_id=extras.patient_id,
        emergency_contact_name=extras.emergency_contact_name,
        emergency_contact_phone=extras.emergency_contact_phone,
        contract_signed_at=extras.contract_signed_at,
        has_contract=extras.contract_signed_at is not None,
    )


@router.patch(
    "/patients/{patient_id}/extras",
    response_model=PatientExtrasResponse,
)
def mobile_update_patient_extras(
    patient_id: int,
    payload: PatientExtrasUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Notfallkontakt nachtragen / ändern."""
    extras = set_emergency_contact(
        db,
        patient_id,
        name=payload.emergency_contact_name,
        phone=payload.emergency_contact_phone,
    )
    return PatientExtrasResponse(
        patient_id=extras.patient_id,
        emergency_contact_name=extras.emergency_contact_name,
        emergency_contact_phone=extras.emergency_contact_phone,
        contract_signed_at=extras.contract_signed_at,
        has_contract=extras.contract_signed_at is not None,
    )


@router.post(
    "/patients/{patient_id}/request-call",
    response_model=CallRequestResponse,
    status_code=status.HTTP_201_CREATED,
)
def mobile_request_office_call(
    patient_id: int,
    payload: CallRequestCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Betreuer bittet das Büro diesen Patienten anzurufen."""
    request = create_call_request(
        db,
        patient_id=patient_id,
        user_id=current_user.id,
        reason=payload.reason,
        note=payload.note,
    )
    # Alle Admins benachrichtigen, damit der Rückruf im Büro sofort sichtbar ist
    notify_all_admins(
        db,
        kind="call_request_created",
        title="Neue Rückruf-Anfrage",
        body=f"{current_user.full_name} bittet um Rückruf – Grund: {payload.reason}",
        related_patient_id=patient_id,
        related_entity_id=request.id,
    )
    db.commit()
    return CallRequestResponse.model_validate(request)


# ---------------------------------------------------------------------------
# Notifications (in-app, poll-based)
# ---------------------------------------------------------------------------


@router.get("/notifications")
def mobile_list_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = list_user_notifications(db, user_id=current_user.id)
    return [
        {
            "id": n.id,
            "kind": n.kind,
            "title": n.title,
            "body": n.body,
            "related_patient_id": n.related_patient_id,
            "related_entity_id": n.related_entity_id,
            "read_at": n.read_at,
            "created_at": n.created_at,
        }
        for n in rows
    ]


@router.get("/notifications/unread-count")
def mobile_notifications_unread_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return {"count": count_unread(db, user_id=current_user.id)}


@router.post("/notifications/{notification_id}/read")
def mobile_notification_mark_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ok = mark_read(db, user_id=current_user.id, notification_id=notification_id)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification nicht gefunden",
        )
    db.commit()
    return {"ok": True}


@router.get("/user/monthly-summary")
def mobile_user_monthly_summary(
    year: int = Query(..., ge=2020, le=2100),
    month: int = Query(..., ge=1, le=12),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Zusammenfassung für den eigenen Home-Screen: Gesamtstunden,
    Patient-Stunden, Aufschlag, abrechenbare Stunden, Km, Zahlstatus.
    """
    from app.services.work_report_service import build_work_report
    report = build_work_report(
        db, user_id=current_user.id, year=year, month=month
    )
    if "error" in report:
        raise HTTPException(status_code=404, detail=report["error"])
    return {
        "year": year,
        "month": month,
        "total_hours": report["total_hours"],
        "patient_hours": report["patient_hours"],
        "non_patient_hours": report["non_patient_hours"],
        "patient_hours_with_bonus": report["patient_hours_with_bonus"],
        "billable_hours": report["billable_hours"],
        "bonus_pct": report["bonus_pct"],
        "total_km": report["total_km"],
        "working_days": report["working_days"],
        "has_company_car": report["user"]["has_company_car"],
    }


@router.get("/trainings")
def mobile_list_trainings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Kommende und kürzlich vergangene Fortbildungen für den Home-Feed."""
    from app.services.training_service import list_trainings
    items = list_trainings(db, upcoming_only=False, limit=30)
    return [
        {
            "id": t.id,
            "title": t.title,
            "description": t.description,
            "location": t.location,
            "starts_at": t.starts_at,
            "ends_at": t.ends_at,
        }
        for t in items
    ]


@router.get("/org-contact")
def mobile_org_contact(current_user: User = Depends(get_current_user)):
    """Ansprechpartner-Infos aus den Settings für den Ansprechpartner-Dialog."""
    return {
        "name": settings.org_contact_name,
        "org": settings.org_contact_org,
        "phone": settings.org_contact_phone,
        "email": settings.org_contact_email,
        "hours": settings.org_contact_hours,
    }


@router.post(
    "/patient-intakes",
    response_model=PatientIntakeResponse,
    status_code=status.HTTP_201_CREATED,
)
def mobile_create_patient_intake(
    payload: PatientIntakeCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Betreuer erfasst Basis-Stammdaten eines neuen Patienten.

    Die Daten landen als `open` im Büro-Feed. Das Büro legt den Patienten
    in Patti an und markiert den Intake danach als `done`.
    """
    intake = create_intake(
        db,
        requested_by_user_id=current_user.id,
        full_name=payload.full_name,
        birthdate=payload.birthdate,
        address=payload.address,
        phone=payload.phone,
        contact_person=payload.contact_person,
        care_level=payload.care_level,
        note=payload.note,
    )
    notify_all_admins(
        db,
        kind="patient_intake_created",
        title="Neue Patient-Aufnahme",
        body=f"{current_user.full_name} hat {payload.full_name} erfasst",
        related_entity_id=intake.id,
    )
    db.commit()
    return PatientIntakeResponse.model_validate(intake)


@router.post("/notifications/read-all")
def mobile_notifications_read_all(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    count = mark_all_read(db, user_id=current_user.id)
    db.commit()
    return {"updated": count}


@router.get(
    "/patients/{patient_id}/patti-budget",
    response_model=PatientBudget,
)
def mobile_patient_patti_budget(
    patient_id: int,
    year: int = Query(..., ge=2020, le=2100),
    current_user: User = Depends(get_current_user),
):
    """Live-Budget aus Patti für einen Patient + Jahr.

    Liefert Reststunden und Restbudget für:
    - Pflegesachleistung / Entlastungsbetrag (`care_service_*`)
    - Verhinderungspflege (`respite_care_*`)

    Authorisierung: User muss diesem Patienten als primary caretaker in Patti
    zugeordnet sein.
    """
    return get_patient_budget(patient_id=patient_id, year=year, user=current_user)


@router.get("/me/month-stats")
def mobile_month_stats(
    year: int | None = None,
    month: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Monatsstatistik des eingeloggten Users: geleistete Stunden
    (mit 10% auf Betreuung), Feiertags-Gutschriften, Durchschnitt
    pro Tag, Monatsprognose, Überstunden-Saldo aus Vormonat."""
    from app.services.month_stats_service import compute_month_stats
    from dataclasses import asdict

    stats = compute_month_stats(db, user=current_user, year=year, month=month)
    return asdict(stats)


# ---------------------------------------------------------------------------
# IT-Tickets (Fehlertickets / Problem melden)
# ---------------------------------------------------------------------------


@router.post("/it-tickets", status_code=status.HTTP_201_CREATED)
def mobile_create_it_ticket(
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Neues IT-Ticket erstellen (Bug, Feature-Wunsch, Frage, Crash)."""
    from app.models.it_ticket import ItTicket

    title = (payload.get("title") or "").strip()
    description = (payload.get("description") or "").strip()
    category = (payload.get("category") or "bug").strip()
    device_info = (payload.get("device_info") or "").strip() or None
    priority = (payload.get("priority") or "medium").strip()

    if not title or not description:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="title und description sind Pflichtfelder",
        )

    allowed_categories = {"bug", "feature", "frage", "sonstiges", "crash"}
    if category not in allowed_categories:
        category = "sonstiges"

    allowed_priorities = {"low", "medium", "high"}
    if priority not in allowed_priorities:
        priority = "medium"

    ticket = ItTicket(
        user_id=current_user.id,
        title=title[:255],
        description=description,
        category=category,
        priority=priority,
        device_info=device_info,
    )
    db.add(ticket)
    db.flush()

    # Alle Admins benachrichtigen
    notify_all_admins(
        db,
        kind="it_ticket_created",
        title="Neues IT-Ticket",
        body=f"{current_user.full_name}: {title[:80]}",
        related_entity_id=ticket.id,
    )
    db.commit()
    db.refresh(ticket)

    return {
        "id": ticket.id,
        "user_id": ticket.user_id,
        "title": ticket.title,
        "description": ticket.description,
        "category": ticket.category,
        "status": ticket.status,
        "priority": ticket.priority,
        "device_info": ticket.device_info,
        "response_text": ticket.response_text,
        "created_at": ticket.created_at.isoformat() if ticket.created_at else None,
    }


@router.get("/it-tickets")
def mobile_list_it_tickets(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Eigene IT-Tickets des Users auflisten."""
    from app.models.it_ticket import ItTicket

    rows = (
        db.query(ItTicket)
        .filter(ItTicket.user_id == current_user.id)
        .order_by(ItTicket.created_at.desc())
        .limit(100)
        .all()
    )
    return [
        {
            "id": t.id,
            "title": t.title,
            "description": t.description,
            "category": t.category,
            "status": t.status,
            "priority": t.priority,
            "device_info": t.device_info,
            "response_text": t.response_text,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "updated_at": t.updated_at.isoformat() if t.updated_at else None,
        }
        for t in rows
    ]


@router.get("/me/vacation-overview")
def mobile_vacation_overview(
    current_user: User = Depends(get_current_user),
):
    """Jahresübersicht: alle genehmigten Urlaubstage aus dem Google-Sheet."""
    from app.services.vacation_sheet_service import get_vacation_dates_for_user

    if not current_user.sheets_name_match:
        return {"vacation_dates": [], "total_days": 0}

    dates = get_vacation_dates_for_user(current_user.sheets_name_match)
    return {
        "vacation_dates": [d.isoformat() for d in dates],
        "total_days": len(dates),
    }


# ── Remote-Signatur-Link erstellen ──────────────────────────────────────

@router.post("/remote-signatures", status_code=status.HTTP_201_CREATED)
def mobile_create_remote_signature(
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Betreuer erstellt einen Remote-Signatur-Link für einen Patienten."""
    import secrets
    from datetime import timedelta
    from app.models.remote_signature import RemoteSignature

    patient_id = payload.get("patient_id")
    patient_name = payload.get("patient_name", "")
    document_type = payload.get("document_type", "leistungsnachweis")
    description = payload.get("description", "")
    entry_id = payload.get("entry_id")

    if not patient_id or not patient_name:
        raise HTTPException(status_code=400, detail="patient_id und patient_name sind erforderlich.")

    token = secrets.token_urlsafe(32)
    now = datetime.utcnow()

    rs = RemoteSignature(
        token=token,
        patient_id=patient_id,
        patient_name=patient_name,
        user_id=current_user.id,
        entry_id=entry_id,
        document_type=document_type,
        description=description,
        status="pending",
        expires_at=now + timedelta(days=7),
        created_at=now,
    )
    db.add(rs)
    db.commit()

    url = f"https://admin.froehlichdienste.de/sign/{token}"
    return {"token": token, "url": url}
