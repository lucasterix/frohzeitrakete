"""Bewerbertool (Applicant Tracking) endpoints.

Admin endpoints:
- GET    /admin/applicants              — List with filters
- POST   /admin/applicants              — Create applicant
- PATCH  /admin/applicants/{id}         — Update applicant (status, notes, handler)
- DELETE /admin/applicants/{id}         — Delete applicant
- POST   /admin/applicants/{id}/upload  — Upload resume
- GET    /admin/applicants/{id}/resume  — Download resume
- POST   /admin/applicants/{id}/email/{template} — Send email
"""

import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.core.auth import require_office_user
from app.db.session import get_db
from app.models.applicant import Applicant
from app.models.user import User
from app.services.email_service import (
    send_applicant_confirmation,
    send_applicant_invitation,
    send_applicant_offer,
    send_applicant_rejection,
)

router = APIRouter()

UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "uploads",
    "applicants",
)


class CreateApplicantBody(BaseModel):
    name: str
    email: EmailStr
    phone: str | None = None
    position: str
    source: str | None = None
    note: str | None = None
    send_confirmation: bool = True


class UpdateApplicantBody(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    position: str | None = None
    source: str | None = None
    status: str | None = None
    note: str | None = None
    handler_user_id: int | None = None
    interview_date: str | None = None
    rejection_reason: str | None = None


class SendEmailBody(BaseModel):
    interview_date: str | None = None
    note: str | None = None


VALID_STATUSES = [
    "eingegangen",
    "in_pruefung",
    "einladung",
    "gespraech",
    "zusage",
    "absage",
    "zurueckgezogen",
]


def _applicant_to_dict(a: Applicant) -> dict:
    return {
        "id": a.id,
        "name": a.name,
        "email": a.email,
        "phone": a.phone,
        "position": a.position,
        "source": a.source,
        "status": a.status,
        "note": a.note,
        "handler_user_id": a.handler_user_id,
        "interview_date": a.interview_date.isoformat() if a.interview_date else None,
        "rejection_reason": a.rejection_reason,
        "resume_path": a.resume_path,
        "created_by_user_id": a.created_by_user_id,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "updated_at": a.updated_at.isoformat() if a.updated_at else None,
    }


@router.get("/applicants")
def list_applicants(
    status: str | None = Query(None),
    position: str | None = Query(None),
    db: Session = Depends(get_db),
    _user: User = Depends(require_office_user),
):
    q = db.query(Applicant)
    if status:
        q = q.filter(Applicant.status == status)
    if position:
        q = q.filter(Applicant.position.ilike(f"%{position}%"))
    rows = q.order_by(desc(Applicant.created_at)).all()
    return [_applicant_to_dict(a) for a in rows]


@router.post("/applicants", status_code=201)
def create_applicant(
    body: CreateApplicantBody,
    db: Session = Depends(get_db),
    user: User = Depends(require_office_user),
):
    applicant = Applicant(
        name=body.name,
        email=body.email,
        phone=body.phone,
        position=body.position,
        source=body.source,
        note=body.note,
        status="eingegangen",
        created_by_user_id=user.id,
    )
    db.add(applicant)
    db.commit()
    db.refresh(applicant)

    if body.send_confirmation:
        send_applicant_confirmation(body.name, body.email, body.position)

    return _applicant_to_dict(applicant)


@router.patch("/applicants/{applicant_id}")
def update_applicant(
    applicant_id: int,
    body: UpdateApplicantBody,
    db: Session = Depends(get_db),
    user: User = Depends(require_office_user),
):
    applicant = db.query(Applicant).filter(Applicant.id == applicant_id).first()
    if not applicant:
        raise HTTPException(404, "Bewerber nicht gefunden")

    updates = body.model_dump(exclude_unset=True)

    if "status" in updates and updates["status"] not in VALID_STATUSES:
        raise HTTPException(400, f"Ungültiger Status: {updates['status']}")

    if "interview_date" in updates:
        val = updates.pop("interview_date")
        applicant.interview_date = datetime.fromisoformat(val) if val else None

    for key, val in updates.items():
        setattr(applicant, key, val)

    db.commit()
    db.refresh(applicant)
    return _applicant_to_dict(applicant)


@router.delete("/applicants/{applicant_id}", status_code=204)
def delete_applicant(
    applicant_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_office_user),
):
    applicant = db.query(Applicant).filter(Applicant.id == applicant_id).first()
    if not applicant:
        raise HTTPException(404, "Bewerber nicht gefunden")
    db.delete(applicant)
    db.commit()


@router.post("/applicants/{applicant_id}/upload")
def upload_resume(
    applicant_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _user: User = Depends(require_office_user),
):
    applicant = db.query(Applicant).filter(Applicant.id == applicant_id).first()
    if not applicant:
        raise HTTPException(404, "Bewerber nicht gefunden")

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename or "doc")[1] or ".pdf"
    filename = f"{applicant_id}_{uuid.uuid4().hex[:8]}{ext}"
    path = os.path.join(UPLOAD_DIR, filename)

    with open(path, "wb") as f:
        f.write(file.file.read())

    applicant.resume_path = path
    db.commit()
    db.refresh(applicant)
    return _applicant_to_dict(applicant)


@router.get("/applicants/{applicant_id}/resume")
def download_resume(
    applicant_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_office_user),
):
    applicant = db.query(Applicant).filter(Applicant.id == applicant_id).first()
    if not applicant or not applicant.resume_path:
        raise HTTPException(404, "Keine Bewerbungsunterlagen vorhanden")
    if not os.path.exists(applicant.resume_path):
        raise HTTPException(404, "Datei nicht gefunden")
    return FileResponse(applicant.resume_path)


@router.post("/applicants/{applicant_id}/email/{template}")
def send_applicant_email(
    applicant_id: int,
    template: str,
    body: SendEmailBody = SendEmailBody(),
    db: Session = Depends(get_db),
    _user: User = Depends(require_office_user),
):
    applicant = db.query(Applicant).filter(Applicant.id == applicant_id).first()
    if not applicant:
        raise HTTPException(404, "Bewerber nicht gefunden")

    success = False
    if template == "confirmation":
        success = send_applicant_confirmation(applicant.name, applicant.email, applicant.position)
    elif template == "invitation":
        if not body.interview_date:
            raise HTTPException(400, "interview_date erforderlich für Einladung")
        success = send_applicant_invitation(
            applicant.name, applicant.email, applicant.position,
            body.interview_date, body.note or ""
        )
        if success:
            applicant.status = "einladung"
            applicant.interview_date = datetime.fromisoformat(body.interview_date)
            db.commit()
    elif template == "rejection":
        success = send_applicant_rejection(applicant.name, applicant.email, applicant.position)
        if success:
            applicant.status = "absage"
            db.commit()
    elif template == "offer":
        success = send_applicant_offer(
            applicant.name, applicant.email, applicant.position, body.note or ""
        )
        if success:
            applicant.status = "zusage"
            db.commit()
    else:
        raise HTTPException(400, f"Unbekanntes Template: {template}")

    if not success:
        raise HTTPException(500, "E-Mail konnte nicht gesendet werden. SMTP-Konfiguration prüfen.")

    db.refresh(applicant)
    return _applicant_to_dict(applicant)
