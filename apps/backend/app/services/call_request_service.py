from datetime import datetime

from sqlalchemy.orm import Session

from app.models.call_request import CallRequest


VALID_REASONS = {
    "rueckfrage",
    "umzug",
    "termin",
    "dokumentation",
    "pflegeaenderung",
    "sonstiges",
}


def create_call_request(
    db: Session,
    *,
    patient_id: int,
    user_id: int,
    reason: str,
    note: str | None = None,
) -> CallRequest:
    # reason normalisieren, invalid → "sonstiges"
    r = (reason or "").lower().strip()
    if r not in VALID_REASONS:
        r = "sonstiges"

    request = CallRequest(
        patient_id=patient_id,
        requested_by_user_id=user_id,
        reason=r,
        note=(note or "").strip() or None,
        status="open",
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    return request


def list_open_call_requests(db: Session) -> list[CallRequest]:
    return (
        db.query(CallRequest)
        .filter(CallRequest.status == "open")
        .order_by(CallRequest.created_at.asc())
        .all()
    )


def mark_call_request_done(
    db: Session, request_id: int, handler_user_id: int
) -> CallRequest:
    request = (
        db.query(CallRequest)
        .filter(CallRequest.id == request_id)
        .first()
    )
    if request is None:
        raise ValueError("Call-Request nicht gefunden")
    request.status = "done"
    request.handled_at = datetime.utcnow()
    request.handled_by_user_id = handler_user_id
    db.commit()
    db.refresh(request)
    return request
