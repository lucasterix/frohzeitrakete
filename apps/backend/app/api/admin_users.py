from hashlib import sha256

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.auth import require_admin_user
from app.core.settings import settings
from app.db.session import get_db
from app.models.user import User
from app.repositories.refresh_token_repository import revoke_all_refresh_sessions_for_user
from app.repositories.user_repository import (
    create_user,
    delete_user,
    get_user_by_email,
    get_user_by_id,
    list_users,
    set_user_active_state,
    update_user,
)
from app.schemas.auth import SessionResponse
from app.schemas.user import UserCreate, UserResponse, UserUpdate
from app.services.auth_service import list_sessions_for_user, revoke_session_for_user

router = APIRouter()


@router.post("/users", response_model=UserResponse)
def admin_create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin_user),
):
    existing_user = get_user_by_email(db, payload.email)

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email ist bereits vergeben",
        )

    user = create_user(db, payload)
    return user


@router.get("/users", response_model=list[UserResponse])
def admin_list_users(
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin_user),
):
    return list_users(db)


@router.patch("/users/{user_id}", response_model=UserResponse)
def admin_update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin_user),
):
    user = get_user_by_id(db, user_id)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User nicht gefunden",
        )

    existing_user = get_user_by_email(db, payload.email)
    if existing_user and existing_user.id != user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email ist bereits vergeben",
        )

    updated_user = update_user(db, user, payload)
    return updated_user


@router.post("/users/{user_id}/deactivate", response_model=UserResponse)
def admin_deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin_user),
):
    user = get_user_by_id(db, user_id)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User nicht gefunden",
        )

    if user.id == admin_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Du kannst dich nicht selbst deaktivieren",
        )

    revoke_all_refresh_sessions_for_user(db, user.id)
    updated_user = set_user_active_state(db, user, False)
    return updated_user


@router.post("/users/{user_id}/activate", response_model=UserResponse)
def admin_activate_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin_user),
):
    user = get_user_by_id(db, user_id)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User nicht gefunden",
        )

    updated_user = set_user_active_state(db, user, True)
    return updated_user


@router.delete("/users/{user_id}")
def admin_delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin_user),
):
    user = get_user_by_id(db, user_id)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User nicht gefunden",
        )

    if user.id == admin_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Du kannst dich nicht selbst löschen",
        )

    revoke_all_refresh_sessions_for_user(db, user.id)
    delete_user(db, user)
    return {"ok": True}


@router.get("/users/{user_id}/sessions", response_model=list[SessionResponse])
def admin_list_user_sessions(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin_user),
):
    user = get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User nicht gefunden",
        )

    return list_sessions_for_user(
        db,
        user_id=user.id,
        current_refresh_token=request.cookies.get(settings.refresh_cookie_name),
    )


@router.post("/users/{user_id}/sessions/{session_id}/revoke", response_model=SessionResponse)
def admin_revoke_user_session(
    user_id: int,
    session_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin_user),
):
    user = get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User nicht gefunden",
        )

    session = revoke_session_for_user(
        db,
        user_id=user.id,
        session_id=session_id,
    )

    current_cookie = request.cookies.get(settings.refresh_cookie_name)
    current_hash = sha256(current_cookie.encode("utf-8")).hexdigest() if current_cookie else None

    return {
        "id": session.id,
        "user_id": session.user_id,
        "device_label": session.device_label,
        "user_agent": session.user_agent,
        "ip_address": session.ip_address,
        "created_at": session.created_at,
        "last_used_at": session.last_used_at,
        "expires_at": session.expires_at,
        "revoked_at": session.revoked_at,
        "is_current": session.token_hash == current_hash,
    }