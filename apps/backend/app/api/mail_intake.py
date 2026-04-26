"""Postannahmestelle (Mail Intake) endpoints.

Admin endpoints:
- GET    /admin/mail-intake              — Liste mit Filtern + optionale Statistiken
- POST   /admin/mail-intake              — Neuen Brief erfassen (auto-klassifiziert)
- POST   /admin/mail-intake/{id}/upload  — Scan hochladen (PDF/JPG) + auto-reklassifiziert
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
from sqlalchemy import func
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

    # ── geschaeftsfuehrung (critical) ────────────────────────────────
    gf_keywords = [
        "kündigung", "klage", "gericht", "anwalt", "vollstreckung",
        "insolvenz", "behörde", "staatsanwalt", "finanzamt",
    ]
    for kw in gf_keywords:
        if kw in combined:
            return {
                "department": "geschaeftsfuehrung",
                "priority": "critical",
                "summary": f"Kritisch: Keyword '{kw}' gefunden. Weiterleitung an Geschaeftsfuehrung.",
            }

    # ── Mahnung / Frist → high priority ──────────────────────────────
    high_keywords = ["mahnung", "frist"]
    matched_high = None
    for kw in high_keywords:
        if kw in combined:
            matched_high = kw
            break

    # ── lohnabrechnung ───────────────────────────────────────────────
    lohn_keywords = [
        "steuer", "lohn", "gehalt", "sozialversicherung", "lohnsteuer",
        "finanzamt lohn", "krankenkassenbeitrag", "rentenversicherung",
        "sv-meldung", "bescheid", "nachzahlung sozial",
    ]
    for kw in lohn_keywords:
        if kw in combined:
            priority = "high" if matched_high else "medium"
            return {
                "department": "lohnabrechnung",
                "priority": priority,
                "summary": f"Lohnabrechnung: Keyword '{kw}' gefunden.",
            }

    # ── mahnwesen ────────────────────────────────────────────────────
    mahn_keywords = [
        "mahnung", "zahlungserinnerung", "krankenkasse", "avise",
        "zahlungsnachweis", "erstattung", "vergütung",
        "leistungsabrechnung krankenkasse",
    ]
    for kw in mahn_keywords:
        if kw in combined:
            priority = "high" if matched_high else "medium"
            return {
                "department": "mahnwesen",
                "priority": priority,
                "summary": f"Mahnwesen: Keyword '{kw}' gefunden.",
            }

    # ── finanzassistenz ──────────────────────────────────────────────
    finanz_keywords = [
        "rechnung", "invoice", "zahlungsaufforderung", "lastschrift",
        "gutschrift", "kontoauszug",
    ]
    for kw in finanz_keywords:
        if kw in combined:
            priority = "high" if matched_high else "medium"
            return {
                "department": "finanzassistenz",
                "priority": priority,
                "summary": f"Finanzassistenz: Keyword '{kw}' gefunden.",
            }

    # ── tagesgeschaeft ───────────────────────────────────────────────
    tages_keywords = [
        "strafzettel", "bußgeld", "bussgeld", "ordnungswidrigkeit",
        "verkehr", "parkverstoß", "termin", "einladung",
    ]
    for kw in tages_keywords:
        if kw in combined:
            priority = "high" if matched_high else "medium"
            return {
                "department": "tagesgeschaeft",
                "priority": priority,
                "summary": f"Tagesgeschaeft: Keyword '{kw}' gefunden.",
            }

    # ── If only high-priority keyword found but no dept match ────────
    if matched_high:
        return {
            "department": "assistenz_gf",
            "priority": "high",
            "summary": f"Keyword '{matched_high}' gefunden, keine Abteilung erkannt. Weiterleitung an Assistenz der GF.",
        }

    # ── Default: assistenz_gf ────────────────────────────────────────
    return {
        "department": "assistenz_gf",
        "priority": "medium",
        "summary": "Keine passenden Keywords gefunden. Weiterleitung an Assistenz der GF.",
    }


def _apply_classification(entry: MailEntry, result: dict) -> None:
    """Apply classification result to a MailEntry."""
    entry.ai_classification = json.dumps(result, ensure_ascii=False)
    entry.department = result["department"]
    entry.priority = result["priority"]
    entry.description = result.get("summary")


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


def _compute_stats(db: Session) -> dict:
    """Compute mail intake statistics."""
    total_open = db.query(func.count(MailEntry.id)).filter(
        MailEntry.status != "erledigt"
    ).scalar() or 0

    # Average days for completed entries
    completed = db.query(MailEntry).filter(
        MailEntry.status == "erledigt",
        MailEntry.handled_at.isnot(None),
    ).all()

    avg_overall = 0.0
    dept_totals: dict[str, list[float]] = {}

    for e in completed:
        try:
            rd = datetime.strptime(e.received_date, "%Y-%m-%d")
            days = (e.handled_at - rd).total_seconds() / 86400
            if days < 0:
                days = 0
            dept_totals.setdefault(e.department, []).append(days)
        except Exception:
            pass

    all_days = [d for vals in dept_totals.values() for d in vals]
    if all_days:
        avg_overall = round(sum(all_days) / len(all_days), 1)

    avg_by_dept = {}
    for dept, vals in dept_totals.items():
        avg_by_dept[dept] = round(sum(vals) / len(vals), 1)

    return {
        "total_open": total_open,
        "avg_days_overall": avg_overall,
        "avg_days_by_department": avg_by_dept,
    }


# ── Endpoints ────────────────────────────────────────────────────────────

@router.get("/mail-intake")
def list_mail_entries(
    department: str | None = Query(None),
    status: str | None = Query(None),
    priority: str | None = Query(None),
    stats: bool = Query(False),
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
    items = [_entry_to_dict(e, db) for e in entries]

    if stats:
        return {"items": items, "stats": _compute_stats(db)}
    return items


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

    # Auto-classify based on title
    result = _classify_text(entry.title, "")
    _apply_classification(entry, result)
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

    # Auto-reclassify with extracted text from scan
    scan_text = ""
    if filepath.lower().endswith(".pdf"):
        scan_text = _extract_text_from_pdf(filepath)
    result = _classify_text(entry.title, scan_text)
    _apply_classification(entry, result)

    db.commit()
    db.refresh(entry)
    return _entry_to_dict(entry, db)


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

    # Erledigt requires handler_note with min 5 chars
    if payload.status == "erledigt":
        if not payload.handler_note or len(payload.handler_note.strip()) < 5:
            raise HTTPException(
                status_code=422,
                detail="handler_note_required_min_5_chars",
            )

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
    _apply_classification(entry, result)

    db.commit()
    db.refresh(entry)
    return _entry_to_dict(entry, db)
