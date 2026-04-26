"""API endpoints for Stundenbudgetabfrage (§45b SGB XI)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import require_office_user
from app.db.session import get_db
from app.models.user import User
from app.services import budget_inquiry_service as svc

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class BudgetInquiryResponse(BaseModel):
    id: int
    patient_id: int
    patient_name: str
    versichertennummer: str | None = None
    geburtsdatum: str | None = None
    kasse_name: str | None = None
    kasse_ik: str | None = None
    user_id: int
    signature_event_id: int | None = None
    task_status: str = "pending"
    handler_user_id: int | None = None
    handled_at: datetime | None = None
    handler_note: str | None = None
    handler_name: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


class GenerateRequest(BaseModel):
    patient_id: int
    user_id: int


class BatchRequest(BaseModel):
    user_id: int


class GenerateSelectedRequest(BaseModel):
    patient_ids: list[int]
    user_id: int


class PatchBudgetInquiryRequest(BaseModel):
    task_status: str | None = None
    handler_note: str | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/budget-inquiries", response_model=list[BudgetInquiryResponse])
def list_budget_inquiries(
    user_id: int | None = Query(None),
    patient_id: int | None = Query(None),
    task_status: str | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_office_user),
):
    """Liste aller Budgetanfragen, optional gefiltert nach Betreuer, Patient oder task_status."""
    rows = svc.list_inquiries(db, user_id=user_id, patient_id=patient_id, task_status=task_status)
    # Resolve handler names
    handler_ids = {r.handler_user_id for r in rows if r.handler_user_id}
    handler_map: dict[int, str] = {}
    if handler_ids:
        handler_users = db.query(User).filter(User.id.in_(handler_ids)).all()
        handler_map = {u.id: u.full_name for u in handler_users}
    results = []
    for r in rows:
        resp = BudgetInquiryResponse.model_validate(r)
        if r.handler_user_id and r.handler_user_id in handler_map:
            resp.handler_name = handler_map[r.handler_user_id]
        results.append(resp)
    return results


@router.post("/budget-inquiries/generate")
def generate_budget_inquiry(
    payload: GenerateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_office_user),
):
    """Einzelne Budgetanfrage generieren."""
    try:
        result = svc.generate_and_save(
            db,
            patient_id=payload.patient_id,
            user_id=payload.user_id,
        )
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/budget-inquiries/batch")
def generate_batch(
    payload: BatchRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_office_user),
):
    """Batch-Generierung: für alle Patienten eines Betreuers."""
    results = svc.generate_batch_for_user(db, user_id=payload.user_id)
    return {"generated": len(results), "inquiries": results}


@router.post("/budget-inquiries/batch-all")
def generate_batch_all(
    db: Session = Depends(get_db),
    user: User = Depends(require_office_user),
):
    """Batch-Generierung: fuer ALLE Patienten mit mindestens einer Signatur."""
    count = svc.generate_batch_all(db)
    return {"generated": count}


@router.post("/budget-inquiries/generate-selected")
def generate_selected(
    payload: GenerateSelectedRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_office_user),
):
    """Generiert Budgetabfragen fuer eine Liste ausgewaehlter Patienten."""
    count = svc.generate_for_selected(db, patient_ids=payload.patient_ids, user_id=payload.user_id)
    return {"generated": count}


@router.patch("/budget-inquiries/{inquiry_id}")
def patch_budget_inquiry(
    inquiry_id: int,
    payload: PatchBudgetInquiryRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_office_user),
):
    """Bearbeitungsvermerk setzen: Notiz, Status, handler_user_id und handled_at."""
    if payload.task_status == "done":
        if not payload.handler_note or len(payload.handler_note.strip()) < 5:
            raise HTTPException(
                status_code=422,
                detail="Beim Erledigt-Setzen ist eine Notiz mit mind. 5 Zeichen Pflicht.",
            )
    inquiry = svc.patch_inquiry(
        db,
        inquiry_id,
        handler_user_id=user.id,
        handler_note=payload.handler_note,
        task_status=payload.task_status,
    )
    if not inquiry:
        raise HTTPException(status_code=404, detail="Budgetanfrage nicht gefunden")
    handler_name = user.full_name if user else None
    resp = BudgetInquiryResponse.model_validate(inquiry)
    resp.handler_name = handler_name
    return resp


@router.patch("/budget-inquiries/{inquiry_id}/done")
def mark_budget_inquiry_done(
    inquiry_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_office_user),
):
    """Setzt task_status auf 'done' (Legacy-Endpoint)."""
    inquiry = svc.mark_inquiry_done(db, inquiry_id)
    if not inquiry:
        raise HTTPException(status_code=404, detail="Budgetanfrage nicht gefunden")
    return {"ok": True, "id": inquiry.id, "task_status": inquiry.task_status}


@router.get("/budget-inquiries/{inquiry_id}/pdf")
def get_budget_inquiry_pdf(
    inquiry_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_office_user),
):
    """PDF einer Budgetanfrage abrufen (wird on-the-fly neu generiert)."""
    inquiry = svc.get_inquiry(db, inquiry_id)
    if not inquiry:
        raise HTTPException(status_code=404, detail="Budgetanfrage nicht gefunden")

    try:
        pdf_bytes = svc.generate_budget_inquiry_pdf(
            db,
            patient_id=inquiry.patient_id,
            user_id=inquiry.user_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"PDF-Generierung fehlgeschlagen: {exc}")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f"inline; filename=budgetanfrage_{inquiry.patient_name.replace(' ', '_')}_{inquiry_id}.pdf"
            )
        },
    )
