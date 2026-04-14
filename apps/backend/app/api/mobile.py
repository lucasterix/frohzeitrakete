from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.signature_asset import SignatureAsset
from app.models.signature_event import SignatureEvent
from app.models.user import User
from app.schemas.entry import EntryCreate, EntryResponse, PatientHoursSummary
from app.schemas.patient import (
    CallRequestCreate,
    CallRequestResponse,
    CaretakerHistoryEntry,
    MobilePatient,
    MobilePatientUpdate,
    PatientBudget,
    PatientExtrasResponse,
    PatientExtrasUpdate,
)
from app.schemas.signature import MobileSignatureCreate, SignatureEventResponse
from app.services.entry_service import (
    create_or_update_entry,
    delete_entry_for_user,
    get_entry_for_user,
    get_patient_hours_summary,
    list_entries_for_user,
)
from app.services.call_request_service import create_call_request
from app.services.patient_extras_service import (
    get_or_create_extras,
    refresh_contract_state,
    set_emergency_contact,
)
from app.services.patient_service import (
    get_caretaker_history,
    get_patient_budget,
    get_patients_for_user,
    search_patients,
    update_patient_data,
)

router = APIRouter()


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
    """Globale Patti-Patientensuche für den Vertretungsfall.

    Liefert alle Patienten der Organisation, nicht nur die eigenen.
    Wird von der App genutzt wenn der User einen Patienten betreuen muss,
    für den er nicht als primärer Caretaker in Patti eingetragen ist.
    """
    return search_patients(q)


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
    return CallRequestResponse.model_validate(request)


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
