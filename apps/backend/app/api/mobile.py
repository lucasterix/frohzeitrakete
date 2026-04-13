from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.signature_asset import SignatureAsset
from app.models.signature_event import SignatureEvent
from app.models.user import User
from app.schemas.entry import EntryCreate, EntryResponse, PatientHoursSummary
from app.schemas.signature import MobileSignatureCreate, SignatureEventResponse
from app.schemas.user import MobilePatient
from app.services.entry_service import (
    create_or_update_entry,
    delete_entry_for_user,
    get_entry_for_user,
    get_patient_hours_summary,
    list_entries_for_user,
)
from app.services.patient_service import get_patients_for_user

router = APIRouter()


@router.get("/patients", response_model=list[MobilePatient])
def mobile_get_patients(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_patients_for_user(db=db, user=current_user)


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
    """
    entry = create_or_update_entry(db, user_id=current_user.id, payload=payload)
    return EntryResponse.from_orm_entry(entry)


@router.get("/entries", response_model=list[EntryResponse])
def mobile_list_entries(
    patient_id: int | None = Query(default=None),
    year: int | None = Query(default=None, ge=2020, le=2100),
    month: int | None = Query(default=None, ge=1, le=12),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Listet eigene Einsätze, optional gefiltert nach patient_id, year, month."""
    entries = list_entries_for_user(
        db,
        user_id=current_user.id,
        patient_id=patient_id,
        year=year,
        month=month,
    )
    return [EntryResponse.from_orm_entry(e) for e in entries]


@router.get("/entries/{entry_id}", response_model=EntryResponse)
def mobile_get_entry(
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = get_entry_for_user(db, user_id=current_user.id, entry_id=entry_id)
    return EntryResponse.from_orm_entry(entry)


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
