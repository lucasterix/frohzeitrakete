"""Admin-Web API für Büro-Aufgaben (Anrufe, Checks, Call-Requests).

Diese Endpoints werden vom Admin-Web (Next.js) konsumiert damit das Büro
sieht welche Patienten anzurufen sind und welche Stammdaten fehlen.
"""

from datetime import date

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.core.auth import require_admin_user, require_office_user
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
    admin_user: User = Depends(require_office_user),
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
    admin_user: User = Depends(require_office_user),
    db: Session = Depends(get_db),
):
    """Nur die offenen Call-Requests (vom Mobile-Betreuer)."""
    return list_open_call_requests(db)


@router.post("/call-requests/{request_id}/done", response_model=CallRequestResponse)
def admin_mark_call_request_done(
    request_id: int,
    admin_user: User = Depends(require_office_user),
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
    admin_user: User = Depends(require_office_user),
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
    admin_user: User = Depends(require_office_user),
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
    admin_user: User = Depends(require_office_user),
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
    admin_user: User = Depends(require_office_user),
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
    admin_user: User = Depends(require_office_user),
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


@router.get(
    "/users/{user_id}/leistungsnachweis/{patient_id}",
    responses={200: {"content": {"application/pdf": {}}}},
)
def admin_user_patient_leistungsnachweis(
    user_id: int,
    patient_id: int,
    year: int = Query(..., ge=2020, le=2100),
    month: int = Query(..., ge=1, le=12),
    source: str = Query(
        "rakete",
        pattern="^(rakete|patti)$",
    ),
    admin_user: User = Depends(require_office_user),
    db: Session = Depends(get_db),
):
    """Erstellt ein PDF-Leistungsnachweis für (user, patient, monat).

    - source=rakete (default): Rakete generiert das PDF selbst mit
      Stunden, km, Leistungsarten und der letzten Unterschrift des
      Monats.
    - source=patti: Zieht das PDF direkt aus Patti
      (/patients/{id}/leistungsnachweis.pdf, mit QR-Code). Bei
      Fehler → Fallback auf Rakete-PDF.
    """
    from app.services.leistungsnachweis_service import (
        build_leistungsnachweis_pdf,
        fetch_patti_leistungsnachweis_pdf_filled,
    )

    pdf_bytes: bytes | None = None
    if source == "patti":
        pdf_bytes = fetch_patti_leistungsnachweis_pdf_filled(
            db,
            user_id=user_id,
            patient_id=patient_id,
            year=year,
            month=month,
        )

    if pdf_bytes is None:
        try:
            pdf_bytes = build_leistungsnachweis_pdf(
                db,
                user_id=user_id,
                patient_id=patient_id,
                year=year,
                month=month,
            )
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))

    filename = f"leistungsnachweis_u{user_id}_p{patient_id}_{year}-{month:02d}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get("/users/{user_id}/leistungsnachweis-patient-ids")
def admin_list_patient_ids_for_month(
    user_id: int,
    year: int = Query(..., ge=2020, le=2100),
    month: int = Query(..., ge=1, le=12),
    admin_user: User = Depends(require_office_user),
    db: Session = Depends(get_db),
):
    """Gibt alle Patienten (id + name) zurück, für die der User in dem
    Monat tatsächlich Stunden erfasst hat, inkl. office-processed-State."""
    from calendar import monthrange
    from datetime import date as _date

    start = _date(year, month, 1)
    end = _date(year, month, monthrange(year, month)[1])
    from app.clients.patti_client import PattiClient
    from app.models.entry import Entry
    from app.models.leistungsnachweis_office_state import (
        LeistungsnachweisOfficeState,
    )

    rows = (
        db.query(Entry.patient_id)
        .filter(
            Entry.user_id == user_id,
            Entry.patient_id.is_not(None),
            Entry.entry_date >= start,
            Entry.entry_date <= end,
            Entry.entry_type == "patient",
        )
        .distinct()
        .all()
    )
    patient_ids = [p[0] for p in rows]

    # Office-State für (user, year, month) nachladen
    state_rows = (
        db.query(LeistungsnachweisOfficeState)
        .filter(
            LeistungsnachweisOfficeState.user_id == user_id,
            LeistungsnachweisOfficeState.year == year,
            LeistungsnachweisOfficeState.month == month,
        )
        .all()
    )
    state_by_pid = {s.patient_id: s for s in state_rows}

    names: dict[int, str] = {}
    if patient_ids:
        try:
            client = PattiClient()
            client.login()
            for pid in patient_ids:
                try:
                    p = client.get_patient(pid)
                    names[pid] = p.get("list_name") or f"Patient {pid}"
                except Exception:  # noqa: BLE001
                    names[pid] = f"Patient {pid}"
        except Exception:  # noqa: BLE001
            names = {pid: f"Patient {pid}" for pid in patient_ids}

    return {
        "patient_ids": patient_ids,
        "patients": [
            {
                "id": pid,
                "name": names.get(pid, f"Patient {pid}"),
                "office_processed_at": (
                    state_by_pid[pid].processed_at.isoformat()
                    if pid in state_by_pid
                    and state_by_pid[pid].processed_at is not None
                    else None
                ),
            }
            for pid in patient_ids
        ],
    }


@router.post("/leistungsnachweis-office-state")
def admin_set_leistungsnachweis_office_state(
    payload: dict,
    admin_user: User = Depends(require_office_user),
    db: Session = Depends(get_db),
):
    """Markiert einen LN als 'vom Büro bearbeitet' (an KK geschickt)
    oder nimmt die Markierung zurück. Payload: {user_id, patient_id,
    year, month, processed: bool}."""
    from datetime import datetime as _dt
    from app.models.leistungsnachweis_office_state import (
        LeistungsnachweisOfficeState,
    )

    try:
        user_id = int(payload["user_id"])
        patient_id = int(payload["patient_id"])
        year = int(payload["year"])
        month = int(payload["month"])
        processed = bool(payload["processed"])
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"bad_payload: {exc}")

    row = (
        db.query(LeistungsnachweisOfficeState)
        .filter(
            LeistungsnachweisOfficeState.user_id == user_id,
            LeistungsnachweisOfficeState.patient_id == patient_id,
            LeistungsnachweisOfficeState.year == year,
            LeistungsnachweisOfficeState.month == month,
        )
        .first()
    )
    if row is None:
        row = LeistungsnachweisOfficeState(
            user_id=user_id,
            patient_id=patient_id,
            year=year,
            month=month,
        )
        db.add(row)

    if processed:
        row.processed_at = _dt.utcnow()
        row.processed_by_user_id = admin_user.id
    else:
        row.processed_at = None
        row.processed_by_user_id = None

    db.commit()
    db.refresh(row)
    return {
        "user_id": row.user_id,
        "patient_id": row.patient_id,
        "year": row.year,
        "month": row.month,
        "office_processed_at": (
            row.processed_at.isoformat() if row.processed_at else None
        ),
    }


@router.get(
    "/users/{user_id}/leistungsnachweise.zip",
    responses={200: {"content": {"application/zip": {}}}},
)
def admin_user_leistungsnachweise_zip(
    user_id: int,
    year: int = Query(..., ge=2020, le=2100),
    month: int = Query(..., ge=1, le=12),
    admin_user: User = Depends(require_office_user),
    db: Session = Depends(get_db),
):
    """Bulk-Download: alle Leistungsnachweise (aus Patti) eines
    Betreuers für einen Monat als ZIP.

    Es werden nur Patienten einbezogen bei denen im Monat tatsächlich
    Einsätze erfasst wurden. Pro Patient wird versucht das Patti-PDF
    zu laden; bei Fehler fällt der jeweilige Eintrag auf das Rakete-
    PDF zurück damit der ZIP vollständig bleibt.
    """
    import io
    import zipfile
    from calendar import monthrange
    from datetime import date as _date

    from app.clients.patti_client import PattiClient
    from app.models.entry import Entry
    from app.services.leistungsnachweis_service import (
        build_leistungsnachweis_pdf,
        fetch_patti_leistungsnachweis_pdf_filled,
    )

    start = _date(year, month, 1)
    end = _date(year, month, monthrange(year, month)[1])
    patient_ids = [
        p[0]
        for p in db.query(Entry.patient_id)
        .filter(
            Entry.user_id == user_id,
            Entry.patient_id.is_not(None),
            Entry.entry_date >= start,
            Entry.entry_date <= end,
            Entry.entry_type == "patient",
        )
        .distinct()
        .all()
    ]

    if not patient_ids:
        raise HTTPException(
            status_code=404,
            detail="Für diesen Monat gibt es keine Einsätze.",
        )

    # Patient-Namen für sprechende Dateinamen
    names: dict[int, str] = {}
    try:
        client = PattiClient()
        client.login()
        for pid in patient_ids:
            try:
                p = client.get_patient(pid)
                names[pid] = p.get("list_name") or f"patient-{pid}"
            except Exception:  # noqa: BLE001
                names[pid] = f"patient-{pid}"
    except Exception:  # noqa: BLE001
        names = {pid: f"patient-{pid}" for pid in patient_ids}

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for pid in patient_ids:
            pdf_bytes = fetch_patti_leistungsnachweis_pdf_filled(
                db,
                user_id=user_id,
                patient_id=pid,
                year=year,
                month=month,
            )
            if pdf_bytes is None:
                try:
                    pdf_bytes = build_leistungsnachweis_pdf(
                        db,
                        user_id=user_id,
                        patient_id=pid,
                        year=year,
                        month=month,
                    )
                except Exception:  # noqa: BLE001
                    continue
            safe_name = "".join(
                c if c.isalnum() or c in "-_" else "_"
                for c in names[pid]
            )
            zf.writestr(
                f"leistungsnachweis_{safe_name}_{year}-{month:02d}.pdf",
                pdf_bytes,
            )

    filename = f"leistungsnachweise_u{user_id}_{year}-{month:02d}.zip"
    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )


@router.get(
    "/leistungsnachweise-all.zip",
    responses={200: {"content": {"application/zip": {}}}},
)
def admin_all_leistungsnachweise_zip(
    year: int = Query(..., ge=2020, le=2100),
    month: int = Query(..., ge=1, le=12),
    admin_user: User = Depends(require_office_user),
    db: Session = Depends(get_db),
):
    """Monats-Batch: alle Betreuer, ein ZIP. Subordner pro Betreuer
    mit allen Leistungsnachweis-PDFs drin. Patti-first, Rakete-Fallback
    pro Patient damit das ZIP auch bei einzelnen Fehlern vollständig
    bleibt."""
    import io
    import zipfile
    from calendar import monthrange
    from datetime import date as _date

    from app.clients.patti_client import PattiClient
    from app.models.entry import Entry
    from app.services.leistungsnachweis_service import (
        build_leistungsnachweis_pdf,
        fetch_patti_leistungsnachweis_pdf_filled,
    )

    start = _date(year, month, 1)
    end = _date(year, month, monthrange(year, month)[1])

    caretakers = (
        db.query(User)
        .filter(User.role == "caretaker", User.is_active.is_(True))
        .order_by(User.full_name)
        .all()
    )

    try:
        client = PattiClient()
        client.login()
        patti_ok = True
    except Exception:  # noqa: BLE001
        client = None
        patti_ok = False

    def _safe(s: str) -> str:
        return "".join(c if c.isalnum() or c in "-_" else "_" for c in s)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        any_pdf = False
        for caretaker in caretakers:
            pids = [
                p[0]
                for p in db.query(Entry.patient_id)
                .filter(
                    Entry.user_id == caretaker.id,
                    Entry.patient_id.is_not(None),
                    Entry.entry_date >= start,
                    Entry.entry_date <= end,
                    Entry.entry_type == "patient",
                )
                .distinct()
                .all()
            ]
            if not pids:
                continue
            user_folder = _safe(caretaker.full_name or f"user-{caretaker.id}")
            for pid in pids:
                pdf_bytes = fetch_patti_leistungsnachweis_pdf_filled(
                    db,
                    user_id=caretaker.id,
                    patient_id=pid,
                    year=year,
                    month=month,
                )
                if pdf_bytes is None:
                    try:
                        pdf_bytes = build_leistungsnachweis_pdf(
                            db,
                            user_id=caretaker.id,
                            patient_id=pid,
                            year=year,
                            month=month,
                        )
                    except Exception:  # noqa: BLE001
                        continue
                name = f"patient-{pid}"
                if patti_ok and client is not None:
                    try:
                        p = client.get_patient(pid)
                        name = p.get("list_name") or name
                    except Exception:  # noqa: BLE001
                        pass
                zf.writestr(
                    f"{user_folder}/leistungsnachweis_{_safe(name)}_{year}-{month:02d}.pdf",
                    pdf_bytes,
                )
                any_pdf = True

    if not any_pdf:
        raise HTTPException(
            status_code=404,
            detail="Für diesen Monat gibt es keine Einsätze.",
        )

    filename = f"leistungsnachweise_ALL_{year}-{month:02d}.zip"
    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )


@router.get("/trainings", response_model=list[TrainingResponse])
def admin_list_trainings(
    upcoming_only: bool = False,
    admin_user: User = Depends(require_office_user),
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
    admin_user: User = Depends(require_office_user),
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
    admin_user: User = Depends(require_office_user),
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
    admin_user: User = Depends(require_office_user),
    db: Session = Depends(get_db),
):
    if not delete_payment(db, payment_id=payment_id):
        raise HTTPException(status_code=404, detail="payment_not_found")
    return None


@router.post("/patients/{patient_id}/caretaker-changed")
def admin_mark_caretaker_changed(
    patient_id: int,
    admin_user: User = Depends(require_office_user),
    db: Session = Depends(get_db),
):
    """Wird vom Büro getriggert wenn ein Patient einen neuen Hauptbetreuer
    bekommt. Startet den "1 Woche später nachfragen"-Task."""
    mark_primary_caretaker_changed(db, patient_id)
    return {"ok": True}


@router.get("/sync-errors")
def admin_list_sync_errors(
    only_open: bool = True,
    admin_user: User = Depends(require_office_user),
    db: Session = Depends(get_db),
):
    """Liste der Backend-Sync-Fehler (unzustellbare Patti-Writes). Büro
    kann pro Zeile ✓-abhaken sobald sie's manuell in Patti nachgezogen
    haben."""
    from app.models.sync_error import SyncError

    q = db.query(SyncError)
    if only_open:
        q = q.filter(SyncError.resolved_at.is_(None))
    rows = q.order_by(SyncError.created_at.desc()).limit(500).all()
    return [
        {
            "id": r.id,
            "kind": r.kind,
            "user_id": r.user_id,
            "patient_id": r.patient_id,
            "year": r.year,
            "month": r.month,
            "message": r.message,
            "created_at": r.created_at.isoformat(),
            "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
        }
        for r in rows
    ]


@router.post("/sync-errors/{error_id}/resolve")
def admin_resolve_sync_error(
    error_id: int,
    admin_user: User = Depends(require_office_user),
    db: Session = Depends(get_db),
):
    from datetime import datetime as _dt
    from app.models.sync_error import SyncError

    row = db.query(SyncError).filter(SyncError.id == error_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="sync_error_not_found")
    row.resolved_at = _dt.utcnow()
    row.resolved_by_user_id = admin_user.id
    db.commit()
    return {"ok": True}


@router.post("/sheets-sync")
def admin_sheets_sync(
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
):
    """Zieht Überstunden-Saldo und Soll-Stunden/Woche aus der Google
    'Stundenübersicht' und schreibt die Werte auf die User. Matching
    erfolgt fuzzy über den full_name."""
    from app.services.sheets_service import sync_users_from_sheet

    try:
        result = sync_users_from_sheet(db)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=502, detail=f"sheets_sync_failed: {exc}"
        )
    return {
        "matched": result.matched,
        "unmatched_sheet_names": result.unmatched_sheet_names,
        "unmatched_user_ids": result.unmatched_user_ids,
    }
