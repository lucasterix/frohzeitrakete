from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.signature_asset import SignatureAsset
from app.models.signature_event import SignatureEvent
from app.models.user import User
from app.schemas.signature import MobileSignatureCreate, SignatureEventResponse
from app.schemas.user import MobilePatient
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
