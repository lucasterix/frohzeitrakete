"""Mahnwesen / Zahlungsavis endpoints.

- POST   /admin/mahnwesen/upload          — Upload + parse PDF(s)
- GET    /admin/mahnwesen/documents        — List parsed documents
- GET    /admin/mahnwesen/documents/{id}   — Get document with entries
- PATCH  /admin/mahnwesen/documents/{id}   — Update status/note
- DELETE /admin/mahnwesen/documents/{id}   — Delete document
- PATCH  /admin/mahnwesen/entries/{id}     — Mark entry as matched/disputed
- GET    /admin/mahnwesen/stats            — Overview statistics
- GET    /admin/mahnwesen/search           — Search by invoice number
"""

import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.core.auth import require_office_user
from app.db.session import get_db
from app.models.avis_document import AvisDocument, AvisEntryRow
from app.models.user import User
from app.services.avis_parser_service import parse_pdf_bytes

router = APIRouter()

UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "uploads", "avis",
)


class UpdateDocBody(BaseModel):
    status: str | None = None
    note: str | None = None


class UpdateEntryBody(BaseModel):
    matched: str | None = None
    match_note: str | None = None


def _doc_to_dict(d: AvisDocument) -> dict:
    return {
        "id": d.id,
        "filename": d.filename,
        "letter_date": d.letter_date,
        "beleg_no": d.beleg_no,
        "doc_type": d.doc_type,
        "entry_count": d.entry_count,
        "total_amount": d.total_amount,
        "warnings": d.warnings,
        "status": d.status,
        "note": d.note,
        "source": d.source,
        "uploaded_by_user_id": d.uploaded_by_user_id,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }


def _entry_to_dict(e: AvisEntryRow) -> dict:
    return {
        "id": e.id,
        "document_id": e.document_id,
        "invoice_no": e.invoice_no,
        "amount_eur": e.amount_eur,
        "matched": e.matched,
        "match_note": e.match_note,
    }


@router.post("/mahnwesen/upload")
async def upload_avis(
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_office_user),
):
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    results = []

    for file in files:
        if not file.filename or not file.filename.lower().endswith(".pdf"):
            results.append({"filename": file.filename or "?", "error": "Nur PDF-Dateien erlaubt"})
            continue

        pdf_bytes = await file.read()
        safe_name = f"{uuid.uuid4().hex[:8]}_{file.filename.replace('/', '_')}"
        pdf_path = os.path.join(UPLOAD_DIR, safe_name)
        with open(pdf_path, "wb") as f:
            f.write(pdf_bytes)

        try:
            result = parse_pdf_bytes(pdf_bytes, file.filename)
        except Exception as exc:
            results.append({"filename": file.filename, "error": str(exc)})
            continue

        doc = AvisDocument(
            filename=file.filename,
            letter_date=result.letter_date,
            beleg_no=result.beleg_no,
            doc_type=result.doc_type,
            entry_count=len(result.entries),
            total_amount=float(result.total_amount),
            warnings="; ".join(result.warnings) if result.warnings else None,
            status="parsed",
            pdf_path=pdf_path,
            source="upload",
            uploaded_by_user_id=user.id,
        )
        db.add(doc)
        db.flush()

        for entry in result.entries:
            db.add(AvisEntryRow(
                document_id=doc.id,
                invoice_no=entry.invoice_no,
                amount_eur=float(entry.amount_eur),
            ))

        db.commit()
        db.refresh(doc)
        results.append(_doc_to_dict(doc))

    return results


@router.get("/mahnwesen/documents")
def list_documents(
    status: str | None = Query(None),
    doc_type: str | None = Query(None),
    db: Session = Depends(get_db),
    _user: User = Depends(require_office_user),
):
    q = db.query(AvisDocument)
    if status:
        q = q.filter(AvisDocument.status == status)
    if doc_type:
        q = q.filter(AvisDocument.doc_type == doc_type)
    docs = q.order_by(desc(AvisDocument.created_at)).all()
    return [_doc_to_dict(d) for d in docs]


@router.get("/mahnwesen/documents/{doc_id}")
def get_document(
    doc_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_office_user),
):
    doc = db.query(AvisDocument).filter(AvisDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "Dokument nicht gefunden")
    entries = db.query(AvisEntryRow).filter(AvisEntryRow.document_id == doc_id).all()
    return {
        **_doc_to_dict(doc),
        "entries": [_entry_to_dict(e) for e in entries],
    }


@router.patch("/mahnwesen/documents/{doc_id}")
def update_document(
    doc_id: int,
    body: UpdateDocBody,
    db: Session = Depends(get_db),
    _user: User = Depends(require_office_user),
):
    doc = db.query(AvisDocument).filter(AvisDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "Dokument nicht gefunden")
    if body.status is not None:
        doc.status = body.status
    if body.note is not None:
        doc.note = body.note
    db.commit()
    db.refresh(doc)
    return _doc_to_dict(doc)


@router.delete("/mahnwesen/documents/{doc_id}", status_code=204)
def delete_document(
    doc_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_office_user),
):
    doc = db.query(AvisDocument).filter(AvisDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "Dokument nicht gefunden")
    db.query(AvisEntryRow).filter(AvisEntryRow.document_id == doc_id).delete()
    db.delete(doc)
    db.commit()


@router.patch("/mahnwesen/entries/{entry_id}")
def update_entry(
    entry_id: int,
    body: UpdateEntryBody,
    db: Session = Depends(get_db),
    _user: User = Depends(require_office_user),
):
    entry = db.query(AvisEntryRow).filter(AvisEntryRow.id == entry_id).first()
    if not entry:
        raise HTTPException(404, "Eintrag nicht gefunden")
    if body.matched is not None:
        entry.matched = body.matched
    if body.match_note is not None:
        entry.match_note = body.match_note
    db.commit()
    db.refresh(entry)
    return _entry_to_dict(entry)


@router.get("/mahnwesen/stats")
def mahnwesen_stats(
    db: Session = Depends(get_db),
    _user: User = Depends(require_office_user),
):
    doc_count = db.query(func.count(AvisDocument.id)).scalar() or 0
    entry_count = db.query(func.count(AvisEntryRow.id)).scalar() or 0
    total_amount = db.query(func.sum(AvisEntryRow.amount_eur)).scalar() or 0.0
    unmatched = db.query(func.count(AvisEntryRow.id)).filter(AvisEntryRow.matched == "unmatched").scalar() or 0
    matched = db.query(func.count(AvisEntryRow.id)).filter(AvisEntryRow.matched == "matched").scalar() or 0

    by_status = dict(
        db.query(AvisDocument.status, func.count(AvisDocument.id))
        .group_by(AvisDocument.status).all()
    )

    return {
        "documents": doc_count,
        "entries": entry_count,
        "total_amount": round(total_amount, 2),
        "unmatched_entries": unmatched,
        "matched_entries": matched,
        "by_status": by_status,
    }


@router.get("/mahnwesen/search")
def search_entries(
    invoice_no: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    _user: User = Depends(require_office_user),
):
    entries = (
        db.query(AvisEntryRow)
        .filter(AvisEntryRow.invoice_no.ilike(f"%{invoice_no}%"))
        .limit(100)
        .all()
    )
    result = []
    for e in entries:
        doc = db.query(AvisDocument).filter(AvisDocument.id == e.document_id).first()
        result.append({
            **_entry_to_dict(e),
            "document": _doc_to_dict(doc) if doc else None,
        })
    return result
