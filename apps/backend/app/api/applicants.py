"""Bewerbertool (Applicant Tracking) endpoints.

Admin endpoints:
- GET    /admin/applicants                          — List with filters
- GET    /admin/applicants/stats                    — Pipeline statistics
- POST   /admin/applicants                          — Create applicant
- GET    /admin/applicants/{id}                     — Get single applicant
- PATCH  /admin/applicants/{id}                     — Update applicant
- DELETE /admin/applicants/{id}                     — Delete applicant
- POST   /admin/applicants/{id}/upload              — Upload resume
- GET    /admin/applicants/{id}/resume              — Download resume
- POST   /admin/applicants/{id}/email/{template}    — Send email
"""

import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.core.auth import require_office_user
from app.db.session import get_db
from app.models.applicant import Applicant
from app.models.user import User
from app.services.email_service import (
    send_applicant_confirmation,
    send_applicant_contract_info,
    send_applicant_criminal_record_request,
    send_applicant_invitation,
    send_applicant_offer,
    send_applicant_rejection,
    send_applicant_status_update,
    send_applicant_trial_work,
)

router = APIRouter()

UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "uploads",
    "applicants",
)

VALID_STATUSES = [
    "eingegangen",
    "in_pruefung",
    "einladung",
    "gespraech",
    "probearbeit",
    "zusage",
    "fuehrungszeugnis",
    "vertrag",
    "eingestellt",
    "absage",
    "zurueckgezogen",
]

STATUS_LABELS = {
    "eingegangen": "Eingegangen",
    "in_pruefung": "In Prüfung",
    "einladung": "Einladung versendet",
    "gespraech": "Gespräch geführt",
    "probearbeit": "Probearbeit",
    "zusage": "Zusage",
    "fuehrungszeugnis": "Führungszeugnis beantragt",
    "vertrag": "Vertrag versendet",
    "eingestellt": "Eingestellt",
    "absage": "Absage",
    "zurueckgezogen": "Zurückgezogen",
}


class CreateApplicantBody(BaseModel):
    name: str
    email: EmailStr
    phone: str | None = None
    position: str
    source: str | None = None
    note: str | None = None
    desired_hours: float | None = None
    desired_location: str | None = None
    desired_role: str | None = None
    available_from: str | None = None
    has_drivers_license: bool | None = None
    has_experience: bool | None = None
    experience_note: str | None = None
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
    desired_hours: float | None = None
    desired_location: str | None = None
    desired_role: str | None = None
    available_from: str | None = None
    has_drivers_license: bool | None = None
    has_experience: bool | None = None
    experience_note: str | None = None
    trial_work_date: str | None = None
    criminal_record_requested_at: str | None = None
    criminal_record_received_at: str | None = None
    hired_at: str | None = None
    hired_hours: float | None = None
    hired_location: str | None = None
    hired_role: str | None = None
    contract_sent_at: str | None = None
    start_date: str | None = None


class SendEmailBody(BaseModel):
    interview_date: str | None = None
    trial_date: str | None = None
    note: str | None = None
    status_label: str | None = None
    message: str | None = None


DATETIME_FIELDS = {
    "interview_date", "trial_work_date",
    "criminal_record_requested_at", "criminal_record_received_at",
    "hired_at", "contract_sent_at",
}


def _applicant_to_dict(a: Applicant) -> dict:
    def _dt(v: datetime | None) -> str | None:
        return v.isoformat() if v else None

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
        "interview_date": _dt(a.interview_date),
        "rejection_reason": a.rejection_reason,
        "resume_path": a.resume_path,
        "desired_hours": a.desired_hours,
        "desired_location": a.desired_location,
        "desired_role": a.desired_role,
        "available_from": a.available_from,
        "has_drivers_license": a.has_drivers_license,
        "has_experience": a.has_experience,
        "experience_note": a.experience_note,
        "trial_work_date": _dt(a.trial_work_date),
        "criminal_record_requested_at": _dt(a.criminal_record_requested_at),
        "criminal_record_received_at": _dt(a.criminal_record_received_at),
        "hired_at": _dt(a.hired_at),
        "hired_hours": a.hired_hours,
        "hired_location": a.hired_location,
        "hired_role": a.hired_role,
        "contract_sent_at": _dt(a.contract_sent_at),
        "start_date": a.start_date,
        "confirmation_sent_at": _dt(a.confirmation_sent_at),
        "invitation_sent_at": _dt(a.invitation_sent_at),
        "rejection_sent_at": _dt(a.rejection_sent_at),
        "offer_sent_at": _dt(a.offer_sent_at),
        "created_by_user_id": a.created_by_user_id,
        "created_at": _dt(a.created_at),
        "updated_at": _dt(a.updated_at),
    }


@router.get("/applicants/stats")
def applicant_stats(
    db: Session = Depends(get_db),
    _user: User = Depends(require_office_user),
):
    rows = (
        db.query(Applicant.status, func.count(Applicant.id))
        .group_by(Applicant.status)
        .all()
    )
    counts = {s: 0 for s in VALID_STATUSES}
    total = 0
    for status, count in rows:
        counts[status] = count
        total += count
    return {"total": total, "by_status": counts}


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


@router.get("/applicants/{applicant_id}")
def get_applicant(
    applicant_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_office_user),
):
    applicant = db.query(Applicant).filter(Applicant.id == applicant_id).first()
    if not applicant:
        raise HTTPException(404, "Bewerber nicht gefunden")
    return _applicant_to_dict(applicant)


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
        desired_hours=body.desired_hours,
        desired_location=body.desired_location,
        desired_role=body.desired_role,
        available_from=body.available_from,
        has_drivers_license=body.has_drivers_license,
        has_experience=body.has_experience,
        experience_note=body.experience_note,
        status="eingegangen",
        created_by_user_id=user.id,
    )
    db.add(applicant)
    db.commit()
    db.refresh(applicant)

    if body.send_confirmation:
        ok = send_applicant_confirmation(body.name, body.email, body.position)
        if ok:
            applicant.confirmation_sent_at = datetime.utcnow()
            db.commit()
            db.refresh(applicant)

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

    for field in DATETIME_FIELDS:
        if field in updates:
            val = updates.pop(field)
            setattr(applicant, field, datetime.fromisoformat(val) if val else None)

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
    now = datetime.utcnow()

    if template == "confirmation":
        success = send_applicant_confirmation(applicant.name, applicant.email, applicant.position)
        if success:
            applicant.confirmation_sent_at = now

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
            applicant.invitation_sent_at = now

    elif template == "rejection":
        success = send_applicant_rejection(
            applicant.name, applicant.email, applicant.position,
            applicant.rejection_reason or ""
        )
        if success:
            applicant.status = "absage"
            applicant.rejection_sent_at = now

    elif template == "offer":
        success = send_applicant_offer(
            applicant.name, applicant.email, applicant.position, body.note or ""
        )
        if success:
            applicant.status = "zusage"
            applicant.offer_sent_at = now

    elif template == "trial_work":
        if not body.trial_date:
            raise HTTPException(400, "trial_date erforderlich für Probearbeit")
        success = send_applicant_trial_work(
            applicant.name, applicant.email, applicant.position, body.trial_date
        )
        if success:
            applicant.status = "probearbeit"
            applicant.trial_work_date = datetime.fromisoformat(body.trial_date)

    elif template == "criminal_record":
        success = send_applicant_criminal_record_request(
            applicant.name, applicant.email, applicant.position
        )
        if success:
            applicant.status = "fuehrungszeugnis"
            applicant.criminal_record_requested_at = now

    elif template == "contract":
        success = send_applicant_contract_info(
            applicant.name, applicant.email, applicant.position,
            applicant.start_date or "", body.note or ""
        )
        if success:
            applicant.status = "vertrag"
            applicant.contract_sent_at = now

    elif template == "status_update":
        if not body.message:
            raise HTTPException(400, "message erforderlich für Statusupdate")
        label = body.status_label or STATUS_LABELS.get(applicant.status, applicant.status)
        success = send_applicant_status_update(
            applicant.name, applicant.email, applicant.position, label, body.message
        )

    else:
        raise HTTPException(400, f"Unbekanntes Template: {template}")

    if not success:
        raise HTTPException(500, "E-Mail konnte nicht gesendet werden. SMTP-Konfiguration prüfen.")

    db.commit()
    db.refresh(applicant)
    return _applicant_to_dict(applicant)
