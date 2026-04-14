from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.clients.patti_client import PattiClient
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


@router.post("/signatures/{signature_id}/vp-approve")
def admin_set_vp_approval(
    signature_id: int,
    approved: bool = True,
    note: str | None = None,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin_user),
):
    """Markiert einen VP-Antrag als von der Krankenkasse genehmigt (oder
    zurück auf offen). Nur für document_type='vp_antrag'."""
    from datetime import datetime as _dt

    event = (
        db.query(SignatureEvent)
        .filter(SignatureEvent.id == signature_id)
        .first()
    )
    if event is None or event.document_type != "vp_antrag":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="VP-Antrag nicht gefunden",
        )
    event.approved_by_kk = approved
    event.approved_at = _dt.utcnow() if approved else None
    event.approved_note = note
    db.commit()
    return {
        "id": event.id,
        "approved_by_kk": event.approved_by_kk,
        "approved_at": event.approved_at,
        "approved_note": event.approved_note,
    }


@router.get("/contracts")
def list_contracts(
    q: str | None = Query(None, max_length=200),
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin_user),
):
    """Alle Betreuungsverträge (Signatur-Events mit document_type='betreuungsvertrag').

    Enriched mit patient_name via Patti (best-effort). Optionaler `q`-Filter
    matched gegen patient_name oder signer_name (case-insensitive).
    """
    events = (
        db.query(SignatureEvent)
        .options(joinedload(SignatureEvent.asset))
        .filter(SignatureEvent.document_type == "betreuungsvertrag")
        .order_by(SignatureEvent.signed_at.desc())
        .limit(500)
        .all()
    )

    patient_ids = {e.patient_id for e in events}
    patient_names: dict[int, str] = {}
    if patient_ids:
        try:
            client = PattiClient()
            client.login()
            for pid in patient_ids:
                try:
                    p = client.get_patient(pid)
                    patient_names[pid] = p.get("list_name") or f"Patient {pid}"
                except Exception:  # noqa: BLE001
                    patient_names[pid] = f"Patient {pid}"
        except Exception:  # noqa: BLE001
            patient_names = {pid: f"Patient {pid}" for pid in patient_ids}

    rows: list[dict[str, Any]] = []
    for e in events:
        rows.append(
            {
                "id": e.id,
                "patient_id": e.patient_id,
                "patient_name": patient_names.get(e.patient_id),
                "signer_name": e.signer_name,
                "status": e.status,
                "source": e.source,
                "info_text_version": e.info_text_version,
                "note": e.note,
                "signed_at": e.signed_at,
                "has_asset": e.asset is not None,
            }
        )

    if q:
        needle = q.strip().lower()
        rows = [
            r
            for r in rows
            if needle in (r["patient_name"] or "").lower()
            or needle in r["signer_name"].lower()
        ]

    return rows


@router.get("/contracts/{contract_id}", response_model=SignatureEventResponse)
def get_contract(
    contract_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin_user),
):
    event = (
        db.query(SignatureEvent)
        .options(joinedload(SignatureEvent.asset))
        .filter(
            SignatureEvent.id == contract_id,
            SignatureEvent.document_type == "betreuungsvertrag",
        )
        .first()
    )
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Betreuungsvertrag nicht gefunden",
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