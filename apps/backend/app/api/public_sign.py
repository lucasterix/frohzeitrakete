"""Public (no-auth) endpoints for remote signature links.

GET  /public/sign/{token}  — load signature request data
POST /public/sign/{token}  — patient signs remotely
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.remote_signature import RemoteSignature
from app.models.signature_asset import SignatureAsset
from app.models.signature_event import SignatureEvent

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────

class RemoteSignatureInfo(BaseModel):
    patient_name: str
    description: str
    document_type: str
    status: str
    expired: bool


class RemoteSignSubmit(BaseModel):
    signer_name: str
    svg_content: str


class RemoteSignResult(BaseModel):
    ok: bool
    message: str


# ── GET  /public/sign/{token} ───────────────────────────────────────────

@router.get("/sign/{token}", response_model=RemoteSignatureInfo)
def get_remote_signature(token: str, db: Session = Depends(get_db)):
    rs = db.query(RemoteSignature).filter(RemoteSignature.token == token).first()
    if rs is None:
        raise HTTPException(status_code=404, detail="Link nicht gefunden.")

    now = datetime.utcnow()
    expired = rs.expires_at < now

    return RemoteSignatureInfo(
        patient_name=rs.patient_name,
        description=rs.description,
        document_type=rs.document_type,
        status=rs.status if not expired and rs.status == "pending" else (
            "expired" if expired and rs.status == "pending" else rs.status
        ),
        expired=expired,
    )


# ── POST /public/sign/{token} ───────────────────────────────────────────

@router.post("/sign/{token}", response_model=RemoteSignResult)
def submit_remote_signature(
    token: str,
    payload: RemoteSignSubmit,
    db: Session = Depends(get_db),
):
    rs = db.query(RemoteSignature).filter(RemoteSignature.token == token).first()
    if rs is None:
        raise HTTPException(status_code=404, detail="Link nicht gefunden.")

    now = datetime.utcnow()
    if rs.expires_at < now:
        raise HTTPException(status_code=410, detail="Dieser Link ist abgelaufen.")
    if rs.status == "signed":
        raise HTTPException(status_code=409, detail="Bereits unterschrieben.")

    svg = payload.svg_content.strip()
    if not svg.startswith("<svg"):
        raise HTTPException(
            status_code=400,
            detail="svg_content muss mit <svg beginnen",
        )

    # Create signature event + asset
    event = SignatureEvent(
        patient_id=rs.patient_id,
        document_type=rs.document_type,
        status="captured",
        signer_name=payload.signer_name,
        source="remote_link",
        note=f"Remote-Signatur via Link (Token {token[:8]}…)",
        created_by_user_id=rs.user_id,
        signed_at=now,
    )
    db.add(event)
    db.flush()

    asset = SignatureAsset(
        signature_event_id=event.id,
        svg_content=svg,
    )
    db.add(asset)

    # Update remote_signature record
    rs.status = "signed"
    rs.signature_event_id = event.id

    db.commit()

    return RemoteSignResult(ok=True, message="Unterschrift gespeichert. Vielen Dank!")
