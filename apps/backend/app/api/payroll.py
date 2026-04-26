"""Payroll (Lohnabrechnung) endpoints.

Admin endpoints:
- GET    /admin/payroll              — Liste mit Filtern
- POST   /admin/payroll              — Neuen Eintrag erstellen
- PATCH  /admin/payroll/{id}         — Status/Notiz aendern
- POST   /admin/payroll/{id}/upload  — Attachment hochladen
- GET    /admin/payroll/{id}/attachment — Attachment herunterladen

Mobile endpoint:
- GET    /mobile/payroll             — Eigene Eintraege des Users
"""

import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.auth import get_current_user, require_admin_user, require_office_user
from app.db.session import get_db
from app.models.payroll_entry import PayrollEntry
from app.models.user import User

admin_router = APIRouter()
mobile_router = APIRouter()

UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "uploads",
    "payroll",
)


def _payroll_to_dict(p: PayrollEntry, *, hide_handler_note: bool = False) -> dict:
    """Serialize a PayrollEntry to a dict, optionally hiding handler_note."""
    return {
        "id": p.id,
        "user_id": p.user_id,
        "employee_name": p.employee_name,
        "category": p.category,
        "title": p.title,
        "description": p.description,
        "from_date": p.from_date.isoformat() if p.from_date else None,
        "to_date": p.to_date.isoformat() if p.to_date else None,
        "attachment_path": p.attachment_path,
        "source": p.source,
        "status": p.status,
        "handler_user_id": p.handler_user_id,
        "handled_at": p.handled_at.isoformat() if p.handled_at else None,
        "handler_note": None if hide_handler_note else p.handler_note,
        "created_by_user_id": p.created_by_user_id,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------


@admin_router.get("/payroll")
def admin_list_payroll(
    status_filter: str | None = Query(None, alias="status"),
    category: str | None = Query(None),
    admin_user: User = Depends(require_office_user),
    db: Session = Depends(get_db),
):
    q = db.query(PayrollEntry).order_by(PayrollEntry.created_at.desc())
    if status_filter:
        q = q.filter(PayrollEntry.status == status_filter)
    if category:
        q = q.filter(PayrollEntry.category == category)
    rows = q.limit(500).all()

    # Eager-load user names
    user_ids = set()
    for r in rows:
        if r.user_id:
            user_ids.add(r.user_id)
        if r.handler_user_id:
            user_ids.add(r.handler_user_id)
        if r.created_by_user_id:
            user_ids.add(r.created_by_user_id)
    users = db.query(User).filter(User.id.in_(user_ids)).all() if user_ids else []
    name_by_id = {u.id: u.full_name for u in users}

    # Buero sieht handler_note nicht
    hide_note = admin_user.role != "admin"

    result = []
    for r in rows:
        d = _payroll_to_dict(r, hide_handler_note=hide_note)
        d["user_name"] = (
            name_by_id.get(r.user_id) if r.user_id else r.employee_name
        ) or r.employee_name
        d["handler_name"] = name_by_id.get(r.handler_user_id) if r.handler_user_id else None
        result.append(d)

    return result


@admin_router.post("/payroll", status_code=201)
def admin_create_payroll(
    payload: dict,
    admin_user: User = Depends(require_office_user),
    db: Session = Depends(get_db),
):
    category = payload.get("category", "sonstiges")
    title = payload.get("title", "")
    if not title:
        raise HTTPException(status_code=400, detail="title_required")

    row = PayrollEntry(
        user_id=payload.get("user_id"),
        employee_name=payload.get("employee_name"),
        category=category,
        title=title,
        description=payload.get("description"),
        from_date=payload.get("from_date"),
        to_date=payload.get("to_date"),
        source="admin_web",
        status="open",
        created_by_user_id=admin_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _payroll_to_dict(row)


@admin_router.patch("/payroll/{entry_id}")
def admin_update_payroll(
    entry_id: int,
    payload: dict,
    admin_user: User = Depends(require_office_user),
    db: Session = Depends(get_db),
):
    row = db.query(PayrollEntry).filter(PayrollEntry.id == entry_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="payroll_entry_not_found")

    if "status" in payload:
        allowed = {"open", "in_progress", "done"}
        if payload["status"] in allowed:
            row.status = payload["status"]

    if "handler_note" in payload:
        # Only admin can set handler_note
        if admin_user.role != "admin":
            raise HTTPException(
                status_code=403,
                detail="only_admin_can_set_handler_note",
            )
        row.handler_note = payload["handler_note"]

    # Auto-set handler
    if row.handler_user_id is None:
        row.handler_user_id = admin_user.id
    row.handled_at = datetime.utcnow()

    db.commit()
    db.refresh(row)
    return _payroll_to_dict(row)


@admin_router.post("/payroll/{entry_id}/upload")
async def admin_upload_payroll_attachment(
    entry_id: int,
    file: UploadFile = File(...),
    admin_user: User = Depends(require_office_user),
    db: Session = Depends(get_db),
):
    row = db.query(PayrollEntry).filter(PayrollEntry.id == entry_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="payroll_entry_not_found")

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename or "file")[1] or ".pdf"
    filename = f"{entry_id}_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    row.attachment_path = filepath
    db.commit()
    db.refresh(row)
    return {"ok": True, "attachment_path": filepath}


@admin_router.get("/payroll/{entry_id}/attachment")
def admin_download_payroll_attachment(
    entry_id: int,
    admin_user: User = Depends(require_office_user),
    db: Session = Depends(get_db),
):
    row = db.query(PayrollEntry).filter(PayrollEntry.id == entry_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="payroll_entry_not_found")
    if not row.attachment_path or not os.path.isfile(row.attachment_path):
        raise HTTPException(status_code=404, detail="no_attachment")
    return FileResponse(
        row.attachment_path,
        media_type="application/octet-stream",
        filename=os.path.basename(row.attachment_path),
    )


# ---------------------------------------------------------------------------
# Mobile endpoint
# ---------------------------------------------------------------------------


@mobile_router.get("/payroll")
def mobile_list_my_payroll(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(PayrollEntry)
        .filter(PayrollEntry.user_id == current_user.id)
        .order_by(PayrollEntry.created_at.desc())
        .limit(200)
        .all()
    )
    # Mobile users never see handler_note
    return [_payroll_to_dict(r, hide_handler_note=True) for r in rows]


# ---------------------------------------------------------------------------
# Helper: create payroll entry from sick leave or HR request (dual-write)
# ---------------------------------------------------------------------------


def create_payroll_from_sick_leave(
    db: Session,
    *,
    user_id: int,
    from_date,
    to_date,
    note: str | None,
    sick_leave_id: int,
) -> PayrollEntry:
    """Called from office_workflow_service when a sick leave is created."""
    row = PayrollEntry(
        user_id=user_id,
        category="krankmeldung",
        title=f"Krankmeldung #{sick_leave_id}",
        description=note,
        from_date=from_date,
        to_date=to_date,
        source="rakete",
        status="open",
        created_by_user_id=user_id,
    )
    db.add(row)
    return row


def create_payroll_from_hr_request(
    db: Session,
    *,
    user_id: int,
    category: str,
    subject: str,
    body: str | None,
    hr_request_id: int,
) -> PayrollEntry | None:
    """Called from office_workflow_service for payroll-relevant HR requests.

    Maps HR category to payroll category:
    - overtime_payout   -> ueberstundenauszahlung
    - salary_advance    -> gehaltsvorschuss
    - other (subject contains Lohnrueckfrage) -> lohnrueckfrage
    """
    cat_map = {
        "overtime_payout": "ueberstundenauszahlung",
        "salary_advance": "gehaltsvorschuss",
    }
    payroll_cat = cat_map.get(category)

    # Check subject for Lohnrueckfrage pattern
    if not payroll_cat:
        subject_lower = (subject or "").lower()
        category_lower = (category or "").lower()
        if "lohnr" in subject_lower or "lohnr" in category_lower:
            payroll_cat = "lohnrueckfrage"

    if not payroll_cat:
        return None

    row = PayrollEntry(
        user_id=user_id,
        category=payroll_cat,
        title=f"{subject} (HR-Anfrage #{hr_request_id})",
        description=body,
        source="rakete",
        status="open",
        created_by_user_id=user_id,
    )
    db.add(row)
    return row
