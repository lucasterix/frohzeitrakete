"""Postannahmestelle (Mail Intake) endpoints.

Admin endpoints:
- GET    /admin/mail-intake              — Liste mit Filtern
- POST   /admin/mail-intake              — Neuen Brief erfassen
- POST   /admin/mail-intake/{id}/upload  — Scan hochladen (PDF/JPG)
- GET    /admin/mail-intake/{id}/scan    — Scan herunterladen
- PATCH  /admin/mail-intake/{id}         — Status/department/priority/assigned_to/note aendern
- POST   /admin/mail-intake/{id}/classify — AI-Klassifizierung triggern
"""

import json
import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import require_office_user
from app.db.session import get_db
from app.models.mail_entry import MailEntry
from app.models.user import User

router = APIRouter()

UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "uploads",
    "mail_intake",
)


# ── Schemas ──────────────────────────────────────────────────────────────

class MailEntryCreate(BaseModel):
    title: str
    sender: str | None = None
    received_date: str
    department: str = "unklar"
    priority: str = "medium"


class MailEntryUpdate(BaseModel):
    status: str | None = None
    department: str | None = None
    priority: str | None = None
    assigned_to_user_id: int | None = None
    handler_note: str | None = None


# ── Helpers ──────────────────────────────────────────────────────────────

def _entry_to_dict(entry: MailEntry, db: Session) -> dict:
    assigned_name = None
    if entry.assigned_to_user_id:
        u = db.query(User).filter(User.id == entry.assigned_to_user_id).first()
        if u:
            assigned_name = u.full_name

    handler_name = None
    if entry.handler_user_id:
        u = db.query(User).filter(User.id == entry.handler_user_id).first()
        if u:
            handler_name = u.full_name

    creator_name = None
    if entry.created_by_user_id:
        u = db.query(User).filter(User.id == entry.created_by_user_id).first()
        if u:
            creator_name = u.full_name

    return {
        "id": entry.id,
        "title": entry.title,
        "description": entry.description,
        "sender": entry.sender,
        "received_date": entry.received_date,
        "scan_path": entry.scan_path,
        "department": entry.department,
        "priority": entry.priority,
        "ai_classification": entry.ai_classification,
        "status": entry.status,
        "assigned_to_user_id": entry.assigned_to_user_id,
        "assigned_to_name": assigned_name,
        "handler_user_id": entry.handler_user_id,
        "handler_name": handler_name,
        "handled_at": entry.handled_at.isoformat() if entry.handled_at else None,
        "handler_note": entry.handler_note,
        "created_by_user_id": entry.created_by_user_id,
        "created_by_name": creator_name,
        "created_at": entry.created_at.isoformat() if entry.created_at else None,
        "updated_at": entry.updated_at.isoformat() if entry.updated_at else None,
    }


# ── Keyword-basierte AI-Klassifizierung ─────────────────────────────────

def _classify_text(title: str, text: str) -> dict:
    """Keyword-basierte Klassifizierung (kein LLM-Call)."""
    combined = (title + " " + text).lower()

    # Critical keywords first
    critical_keywords = ["kündigung", "klage", "gericht", "finanzamt"]
    for kw in critical_keywords:
        if kw in combined:
            return {
                "department": "geschaeftsfuehrung",
                "priority": "critical",
                "summary": f"Kritisch: Keyword '{kw}' gefunden. Weiterleitung an Geschaeftsfuehrung.",
            }

    # Department-specific keywords
    lohn_keywords = ["steuer", "lohn", "sozialversicherung", "gehalt", "lohnsteuer"]
    for kw in lohn_keywords:
        if kw in combined:
            return {
                "department": "lohnabrechnung",
                "priority": "medium",
                "summary": f"Lohnabrechnung: Keyword '{kw}' gefunden.",
            }

    finanz_keywords = ["rechnung", "mahnung", "zahlung"]
    for kw in finanz_keywords:
        if kw in combined:
            return {
                "department": "finanzassistenz",
                "priority": "medium",
                "summary": f"Finanzassistenz: Keyword '{kw}' gefunden.",
            }

    tages_keywords = ["strafzettel", "bußgeld", "bussgeld", "ordnungswidrigkeit"]
    for kw in tages_keywords:
        if kw in combined:
            return {
                "department": "tagesgeschaeft",
                "priority": "medium",
                "summary": f"Tagesgeschaeft: Keyword '{kw}' gefunden.",
            }

    mahn_keywords = ["krankenkasse", "avise", "zahlungsnachweis"]
    for kw in mahn_keywords:
        if kw in combined:
            return {
                "department": "mahnwesen",
                "priority": "medium",
                "summary": f"Mahnwesen: Keyword '{kw}' gefunden.",
            }

    # Default
    return {
        "department": "unklar",
        "priority": "medium",
        "summary": "Keine passenden Keywords gefunden. Weiterleitung an Assistenz der GF.",
    }


def _extract_text_from_pdf(filepath: str) -> str:
    """Extract text from a PDF file using pypdf."""
    try:
        from pypdf import PdfReader
        reader = PdfReader(filepath)
        text_parts = []
        for page in reader.pages:
            t = page.extract_text()
            if t:
                text_parts.append(t)
        return "\n".join(text_parts)
    except Exception:
        return ""


# ── Endpoints ────────────────────────────────────────────────────────────

@router.get("/mail-intake")
def list_mail_entries(
    department: str | None = Query(None),
    status: str | None = Query(None),
    priority: str | None = Query(None),
    admin_user: User = Depends(require_office_user),
    db: Session = Depends(get_db),
):
    q = db.query(MailEntry)
    if department:
        q = q.filter(MailEntry.department == department)
    if status:
        q = q.filter(MailEntry.status == status)
    if priority:
        q = q.filter(MailEntry.priority == priority)
    entries = q.order_by(MailEntry.received_date.desc(), MailEntry.id.desc()).all()
    return [_entry_to_dict(e, db) for e in entries]


@router.post("/mail-intake")
def create_mail_entry(
    payload: MailEntryCreate,
    admin_user: User = Depends(require_office_user),
    db: Session = Depends(get_db),
):
    entry = MailEntry(
        title=payload.title,
        sender=payload.sender,
        received_date=payload.received_date,
        department=payload.department,
        priority=payload.priority,
        status="eingegangen",
        created_by_user_id=admin_user.id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _entry_to_dict(entry, db)


@router.post("/mail-intake/{entry_id}/upload")
async def upload_scan(
    entry_id: int,
    file: UploadFile = File(...),
    admin_user: User = Depends(require_office_user),
    db: Session = Depends(get_db),
):
    entry = db.query(MailEntry).filter(MailEntry.id == entry_id).first()
    if entry is None:
        raise HTTPException(status_code=404, detail="mail_entry_not_found")

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename or "scan")[1] or ".pdf"
    filename = f"{entry_id}_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    entry.scan_path = filepath
    db.commit()
    db.refresh(entry)
    return {"ok": True, "scan_path": filepath}


@router.get("/mail-intake/{entry_id}/scan")
def download_scan(
    entry_id: int,
    admin_user: User = Depends(require_office_user),
    db: Session = Depends(get_db),
):
    entry = db.query(MailEntry).filter(MailEntry.id == entry_id).first()
    if entry is None:
        raise HTTPException(status_code=404, detail="mail_entry_not_found")
    if not entry.scan_path or not os.path.isfile(entry.scan_path):
        raise HTTPException(status_code=404, detail="no_scan")
    return FileResponse(
        entry.scan_path,
        media_type="application/octet-stream",
        filename=os.path.basename(entry.scan_path),
    )


@router.patch("/mail-intake/{entry_id}")
def update_mail_entry(
    entry_id: int,
    payload: MailEntryUpdate,
    admin_user: User = Depends(require_office_user),
    db: Session = Depends(get_db),
):
    entry = db.query(MailEntry).filter(MailEntry.id == entry_id).first()
    if entry is None:
        raise HTTPException(status_code=404, detail="mail_entry_not_found")

    if payload.status is not None:
        entry.status = payload.status
    if payload.department is not None:
        entry.department = payload.department
    if payload.priority is not None:
        entry.priority = payload.priority
    if payload.assigned_to_user_id is not None:
        entry.assigned_to_user_id = payload.assigned_to_user_id
    if payload.handler_note is not None:
        entry.handler_note = payload.handler_note

    # Auto-set handler
    entry.handler_user_id = admin_user.id
    entry.handled_at = datetime.utcnow()

    db.commit()
    db.refresh(entry)
    return _entry_to_dict(entry, db)


@router.post("/mail-intake/{entry_id}/classify")
def classify_mail_entry(
    entry_id: int,
    admin_user: User = Depends(require_office_user),
    db: Session = Depends(get_db),
):
    entry = db.query(MailEntry).filter(MailEntry.id == entry_id).first()
    if entry is None:
        raise HTTPException(status_code=404, detail="mail_entry_not_found")

    # Extract text from scan if available
    scan_text = ""
    if entry.scan_path and os.path.isfile(entry.scan_path):
        if entry.scan_path.lower().endswith(".pdf"):
            scan_text = _extract_text_from_pdf(entry.scan_path)

    result = _classify_text(entry.title, scan_text)
    entry.ai_classification = json.dumps(result, ensure_ascii=False)
    entry.department = result["department"]
    entry.priority = result["priority"]
    entry.description = result.get("summary")

    db.commit()
    db.refresh(entry)
    return _entry_to_dict(entry, db)
