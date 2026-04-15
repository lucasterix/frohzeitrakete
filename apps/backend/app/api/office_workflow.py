"""HTTP routes for the office workflow.

Two prefixes:
- /mobile/...   → consumed by the caretaker app
- /admin/...    → consumed by the admin web

Kept separate from mobile.py and admin_tasks.py because this file
covers a self-contained feature area (vacation / sick / HR /
announcements) and would otherwise blow up the existing modules.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_user, require_office_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.office_workflow import (
    AnnouncementCreate,
    AnnouncementResponse,
    HrRequestCreate,
    HrRequestResolve,
    HrRequestResponse,
    SickLeaveCreate,
    SickLeaveResolve,
    SickLeaveResponse,
    VacationRequestCreate,
    VacationRequestResolve,
    VacationRequestResponse,
)
from app.services.office_workflow_service import (
    LeadTimeError,
    acknowledge_sick_leave,
    create_announcement,
    create_hr_request,
    create_sick_leave,
    create_vacation_request,
    delete_announcement,
    is_on_vacation_today,
    is_sick_today,
    list_announcements,
    list_hr_requests,
    list_sick_leaves,
    list_vacation_requests,
    resolve_hr_request,
    resolve_vacation_request,
)

mobile_router = APIRouter()
admin_router = APIRouter()


# ============================================================================
# MOBILE — Betreuer-Seite
# ============================================================================


@mobile_router.post(
    "/vacation-requests",
    response_model=VacationRequestResponse,
    status_code=status.HTTP_201_CREATED,
)
def mobile_create_vacation(
    payload: VacationRequestCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return create_vacation_request(
            db,
            user_id=current_user.id,
            from_date=payload.from_date,
            to_date=payload.to_date,
            note=payload.note,
        )
    except LeadTimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@mobile_router.get(
    "/vacation-requests", response_model=list[VacationRequestResponse]
)
def mobile_list_my_vacation(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return list_vacation_requests(db, user_id=current_user.id)


@mobile_router.post(
    "/sick-leaves",
    response_model=SickLeaveResponse,
    status_code=status.HTTP_201_CREATED,
)
def mobile_create_sick_leave(
    payload: SickLeaveCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return create_sick_leave(
            db,
            user_id=current_user.id,
            from_date=payload.from_date,
            to_date=payload.to_date,
            note=payload.note,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@mobile_router.get("/sick-leaves", response_model=list[SickLeaveResponse])
def mobile_list_my_sick_leaves(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return list_sick_leaves(db, user_id=current_user.id)


@mobile_router.post(
    "/hr-requests",
    response_model=HrRequestResponse,
    status_code=status.HTTP_201_CREATED,
)
def mobile_create_hr_request(
    payload: HrRequestCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return create_hr_request(
        db,
        user_id=current_user.id,
        category=payload.category,
        subject=payload.subject,
        body=payload.body,
    )


@mobile_router.get("/hr-requests", response_model=list[HrRequestResponse])
def mobile_list_my_hr_requests(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return list_hr_requests(db, user_id=current_user.id)


@mobile_router.get("/announcements", response_model=list[AnnouncementResponse])
def mobile_list_active_announcements(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return list_announcements(db, active_only=True)


@mobile_router.get("/today-status")
def mobile_today_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Status-Flags für den Home-Screen: hat der User heute Urlaub/Krank?"""
    vac = is_on_vacation_today(db, user_id=current_user.id)
    sick = is_sick_today(db, user_id=current_user.id)
    return {
        "on_vacation": vac is not None,
        "vacation_until": (
            (vac.approved_to_date or vac.to_date).isoformat() if vac else None
        ),
        "is_sick": sick is not None,
        "sick_until": sick.to_date.isoformat() if sick else None,
    }


# ============================================================================
# ADMIN — Büro-Seite
# ============================================================================


@admin_router.get(
    "/vacation-requests", response_model=list[VacationRequestResponse]
)
def admin_list_vacation(
    status_filter: str | None = Query(None, alias="status"),
    admin_user: User = Depends(require_office_user),
    db: Session = Depends(get_db),
):
    return list_vacation_requests(db, status=status_filter)


@admin_router.post(
    "/vacation-requests/{request_id}/resolve",
    response_model=VacationRequestResponse,
)
def admin_resolve_vacation(
    request_id: int,
    payload: VacationRequestResolve,
    admin_user: User = Depends(require_office_user),
    db: Session = Depends(get_db),
):
    try:
        return resolve_vacation_request(
            db,
            request_id=request_id,
            handler_user_id=admin_user.id,
            handler_kuerzel=payload.handler_kuerzel,
            status=payload.status,
            approved_from_date=payload.approved_from_date,
            approved_to_date=payload.approved_to_date,
            response_text=payload.response_text,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@admin_router.get("/sick-leaves", response_model=list[SickLeaveResponse])
def admin_list_sick_leaves(
    only_open: bool = False,
    admin_user: User = Depends(require_office_user),
    db: Session = Depends(get_db),
):
    return list_sick_leaves(db, only_open=only_open)


@admin_router.post(
    "/sick-leaves/{sick_leave_id}/acknowledge",
    response_model=SickLeaveResponse,
)
def admin_ack_sick_leave(
    sick_leave_id: int,
    payload: SickLeaveResolve,
    admin_user: User = Depends(require_office_user),
    db: Session = Depends(get_db),
):
    try:
        return acknowledge_sick_leave(
            db,
            sick_leave_id=sick_leave_id,
            handler_user_id=admin_user.id,
            handler_kuerzel=payload.handler_kuerzel,
            response_text=payload.response_text,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@admin_router.get("/hr-requests", response_model=list[HrRequestResponse])
def admin_list_hr_requests(
    only_open: bool = False,
    admin_user: User = Depends(require_office_user),
    db: Session = Depends(get_db),
):
    return list_hr_requests(db, only_open=only_open)


@admin_router.post(
    "/hr-requests/{hr_request_id}/resolve",
    response_model=HrRequestResponse,
)
def admin_resolve_hr_request(
    hr_request_id: int,
    payload: HrRequestResolve,
    admin_user: User = Depends(require_office_user),
    db: Session = Depends(get_db),
):
    try:
        return resolve_hr_request(
            db,
            hr_request_id=hr_request_id,
            handler_user_id=admin_user.id,
            handler_kuerzel=payload.handler_kuerzel,
            status=payload.status,
            response_text=payload.response_text,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@admin_router.get(
    "/announcements", response_model=list[AnnouncementResponse]
)
def admin_list_announcements(
    active_only: bool = False,
    admin_user: User = Depends(require_office_user),
    db: Session = Depends(get_db),
):
    return list_announcements(db, active_only=active_only)


@admin_router.post(
    "/announcements",
    response_model=AnnouncementResponse,
    status_code=status.HTTP_201_CREATED,
)
def admin_create_announcement(
    payload: AnnouncementCreate,
    admin_user: User = Depends(require_office_user),
    db: Session = Depends(get_db),
):
    return create_announcement(
        db,
        created_by_user_id=admin_user.id,
        title=payload.title,
        body=payload.body,
        visible_from=payload.visible_from,
        visible_until=payload.visible_until,
    )


@admin_router.delete("/announcements/{announcement_id}", status_code=204)
def admin_delete_announcement(
    announcement_id: int,
    admin_user: User = Depends(require_office_user),
    db: Session = Depends(get_db),
):
    if not delete_announcement(db, announcement_id=announcement_id):
        raise HTTPException(status_code=404, detail="announcement_not_found")
    return None
