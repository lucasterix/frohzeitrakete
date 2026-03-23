from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.core.auth import require_admin_user
from app.db.session import get_db
from app.models.signature_asset import SignatureAsset
from app.models.signature_event import SignatureEvent
from app.models.user import User
from app.schemas.signature import (
    ActivityFeedItem,
    SignatureEventResponse,
    TestSignatureCreate,
)

router = APIRouter()


@router.post("/test-signatures", response_model=SignatureEventResponse, status_code=status.HTTP_201_CREATED)
def create_test_signature(
    payload: TestSignatureCreate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin_user),
):
    svg = payload.svg_content.strip()
    if not svg.startswith("<svg"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="svg_content muss mit <svg beginnen",
        )

    event = SignatureEvent(
        patient_id=payload.patient_id,
        document_type=payload.document_type,
        status="captured",
        signer_name=payload.signer_name,
        info_text_version=payload.info_text_version,
        source="admin_test",
        note=payload.note,
        created_by_user_id=admin_user.id,
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
def list_signatures(
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin_user),
):
    return (
        db.query(SignatureEvent)
        .options(joinedload(SignatureEvent.asset))
        .order_by(SignatureEvent.signed_at.desc())
        .limit(200)
        .all()
    )


@router.get("/signatures/{signature_id}", response_model=SignatureEventResponse)
def get_signature(
    signature_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin_user),
):
    event = (
        db.query(SignatureEvent)
        .options(joinedload(SignatureEvent.asset))
        .filter(SignatureEvent.id == signature_id)
        .first()
    )

    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Signatur nicht gefunden",
        )

    return event


@router.get("/activity-feed", response_model=list[ActivityFeedItem])
def get_activity_feed(
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin_user),
):
    events = (
        db.query(SignatureEvent)
        .order_by(SignatureEvent.signed_at.desc())
        .limit(100)
        .all()
    )

    items: list[ActivityFeedItem] = []
    for event in events:
        items.append(
            ActivityFeedItem(
                id=event.id,
                event_type="signature_captured",
                title=f"{event.document_type} unterschrieben",
                subtitle=f"Patient #{event.patient_id} · {event.signer_name}",
                created_at=event.signed_at,
                signature_event_id=event.id,
            )
        )

    return items