"""Admin-Web API für Büro-Aufgaben (Anrufe, Checks, Call-Requests).

Diese Endpoints werden vom Admin-Web (Next.js) konsumiert damit das Büro
sieht welche Patienten anzurufen sind und welche Stammdaten fehlen.
"""

from datetime import date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.auth import require_admin_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.patient import (
    CallRequestResponse,
    TripSegmentResponse,
    UserTripSummary,
)
from app.schemas.patient_intake import (
    PatientIntakeResolve,
    PatientIntakeResponse,
)
from app.services.admin_tasks_service import collect_admin_tasks
from app.services.call_request_service import (
    list_open_call_requests,
    mark_call_request_done,
)
from app.services.patient_extras_service import (
    mark_office_call_done,
    mark_primary_caretaker_changed,
)
from app.schemas.training import TrainingCreate, TrainingResponse
from app.services.patient_intake_service import list_intakes, resolve_intake
from app.services.training_service import (
    create_training,
    delete_training,
    list_trainings,
)
from app.services.travel_cost_service import (
    create_payment,
    delete_payment,
    list_payments,
)
from app.services.trip_service import user_km_for_month
from app.services.work_report_service import build_work_report

router = APIRouter()


@router.get("/call-tasks")
def admin_list_call_tasks(
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
):
    """Aggregierte Liste aller offenen Büro-Aufgaben.

    Kinds:
    - call_request               – Betreuer hat Rückruf angefordert (high)
    - new_caretaker_followup     – >7 Tage seit neuer Hauptbetreuer (medium)
    - half_year_check            – >6 Monate kein Office-Call (low)
    - no_invoice_2_months        – kein Einsatz seit 2 Monaten (medium)
    - missing_emergency_contact  – Notfallkontakt fehlt (low)
    - missing_contract           – Betreuungsvertrag fehlt (low)
    """
    return collect_admin_tasks(db)


@router.get("/call-requests", response_model=list[CallRequestResponse])
def admin_list_call_requests(
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
):
    """Nur die offenen Call-Requests (vom Mobile-Betreuer)."""
    return list_open_call_requests(db)


@router.post("/call-requests/{request_id}/done", response_model=CallRequestResponse)
def admin_mark_call_request_done(
    request_id: int,
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
):
    try:
        return mark_call_request_done(
            db, request_id=request_id, handler_user_id=admin_user.id
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/patients/{patient_id}/office-call-done")
def admin_mark_office_call(
    patient_id: int,
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
):
    """Markiert einen Büro-Anruf als erledigt (setzt last_office_call_at)."""
    mark_office_call_done(db, patient_id)
    return {"ok": True}


@router.get("/users/{user_id}/work-report")
def admin_user_work_report(
    user_id: int,
    year: int = Query(..., ge=2020, le=2100),
    month: int = Query(..., ge=1, le=12),
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
):
    """Vollständiger Mitarbeiter-Bericht für einen Monat.

    Response:
        {
          user: {id, email, full_name, role},
          year, month,
          total_hours, total_km, working_days,
          days: [
            {
              date,
              entries: [{type, patient_name|label, hours, activities, ...}],
              trips:   [{kind, from, to, km}],
              day_hours, day_km
            }
          ]
        }
    """
    return build_work_report(db, user_id=user_id, year=year, month=month)


@router.get("/users/{user_id}/trips")
def admin_user_trips(
    user_id: int,
    year: int = Query(..., ge=2020, le=2100),
    month: int = Query(..., ge=1, le=12),
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
):
    """Km-/Trip-Übersicht für einen Mitarbeiter + Monat.

    Response shape:
        {
          "summary": {user_id, year, month, total_km, segments_count},
          "segments": [TripSegmentResponse, ...]
        }
    """
    result = user_km_for_month(db, user_id=user_id, year=year, month=month)
    segments = result["segments"]
    return {
        "summary": UserTripSummary(
            user_id=user_id,
            year=year,
            month=month,
            total_km=result["total_km"],
            segments_count=len(segments),
        ),
        "segments": [TripSegmentResponse.model_validate(s) for s in segments],
    }


@router.get("/patient-intakes", response_model=list[PatientIntakeResponse])
def admin_list_patient_intakes(
    status_filter: str | None = Query(None, alias="status"),
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
):
    return list_intakes(db, status=status_filter)


@router.post(
    "/patient-intakes/{intake_id}/resolve",
    response_model=PatientIntakeResponse,
)
def admin_resolve_patient_intake(
    intake_id: int,
    payload: PatientIntakeResolve,
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
):
    try:
        return resolve_intake(
            db,
            intake_id=intake_id,
            handler_user_id=admin_user.id,
            status=payload.status,
            patti_patient_id=payload.patti_patient_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/trainings", response_model=list[TrainingResponse])
def admin_list_trainings(
    upcoming_only: bool = False,
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
):
    return list_trainings(db, upcoming_only=upcoming_only, limit=200)


@router.post(
    "/trainings",
    response_model=TrainingResponse,
    status_code=201,
)
def admin_create_training(
    payload: TrainingCreate,
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
):
    return create_training(
        db,
        created_by_user_id=admin_user.id,
        title=payload.title,
        description=payload.description,
        location=payload.location,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
    )


@router.delete("/trainings/{training_id}", status_code=204)
def admin_delete_training(
    training_id: int,
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
):
    ok = delete_training(db, training_id=training_id)
    if not ok:
        raise HTTPException(status_code=404, detail="training_not_found")
    return None


@router.get("/users/{user_id}/travel-cost-payments")
def admin_list_travel_cost_payments(
    user_id: int,
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
):
    rows = list_payments(db, user_id=user_id)
    return [
        {
            "id": r.id,
            "user_id": r.user_id,
            "from_date": r.from_date.isoformat(),
            "to_date": r.to_date.isoformat(),
            "note": r.note,
            "marked_by_user_id": r.marked_by_user_id,
            "created_at": r.created_at,
        }
        for r in rows
    ]


@router.post("/users/{user_id}/travel-cost-payments")
def admin_create_travel_cost_payment(
    user_id: int,
    from_date: date = Body(...),
    to_date: date = Body(...),
    note: str | None = Body(default=None),
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
):
    try:
        row = create_payment(
            db,
            user_id=user_id,
            from_date=from_date,
            to_date=to_date,
            marked_by_user_id=admin_user.id,
            note=note,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "id": row.id,
        "user_id": row.user_id,
        "from_date": row.from_date.isoformat(),
        "to_date": row.to_date.isoformat(),
        "note": row.note,
    }


@router.delete("/travel-cost-payments/{payment_id}", status_code=204)
def admin_delete_travel_cost_payment(
    payment_id: int,
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
):
    if not delete_payment(db, payment_id=payment_id):
        raise HTTPException(status_code=404, detail="payment_not_found")
    return None


@router.post("/patients/{patient_id}/caretaker-changed")
def admin_mark_caretaker_changed(
    patient_id: int,
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
):
    """Wird vom Büro getriggert wenn ein Patient einen neuen Hauptbetreuer
    bekommt. Startet den "1 Woche später nachfragen"-Task."""
    mark_primary_caretaker_changed(db, patient_id)
    return {"ok": True}
