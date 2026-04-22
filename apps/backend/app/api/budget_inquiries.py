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
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


class GenerateRequest(BaseModel):
    patient_id: int
    user_id: int


class BatchRequest(BaseModel):
    user_id: int


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/budget-inquiries", response_model=list[BudgetInquiryResponse])
def list_budget_inquiries(
    user_id: int | None = Query(None),
    patient_id: int | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_office_user),
):
    """Liste aller Budgetanfragen, optional gefiltert nach Betreuer oder Patient."""
    rows = svc.list_inquiries(db, user_id=user_id, patient_id=patient_id)
    return rows


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
