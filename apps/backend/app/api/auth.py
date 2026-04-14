from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.logging import get_logger
from app.core.rate_limit import limiter
from app.core.settings import settings
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import AuthResponse, LoginRequest, SessionResponse
from app.schemas.user import UserResponse
from app.services.auth_service import (
    list_sessions_for_user,
    login_user,
    logout_user,
    refresh_login,
    revoke_session_for_user,
)

router = APIRouter()
logger = get_logger("auth")


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    response.set_cookie(
        key=settings.access_cookie_name,
        value=access_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=refresh_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        path="/",
    )


def _clear_auth_cookies(response: Response):
    response.delete_cookie(key=settings.access_cookie_name, path="/")
    response.delete_cookie(key=settings.refresh_cookie_name, path="/")


@router.post("/login", response_model=AuthResponse)
@limiter.limit(settings.login_rate_limit)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    try:
        result = login_user(
            db,
            email=payload.email,
            password=payload.password,
            user_agent=user_agent,
            ip_address=ip,
            device_name=request.headers.get("x-device-name"),
        )
    except HTTPException as exc:
        logger.warning(
            "login_failed",
            email=payload.email,
            ip=ip,
            user_agent=user_agent,
            reason=exc.detail,
            status=exc.status_code,
        )
        raise

    _set_auth_cookies(response, result["access_token"], result["refresh_token"])
    logger.info(
        "login_success",
        user_id=result["user"].id,
        email=result["user"].email,
        ip=ip,
    )
    return {"user": result["user"]}


@router.post("/refresh", response_model=AuthResponse)
def refresh(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    refresh_token = request.cookies.get(settings.refresh_cookie_name)
    result = refresh_login(
        db,
        refresh_token=refresh_token or "",
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
        device_name=request.headers.get("x-device-name"),
    )

    _set_auth_cookies(response, result["access_token"], result["refresh_token"])
    return {"user": result["user"]}


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    logout_user(
        db,
        refresh_token=request.cookies.get(settings.refresh_cookie_name),
    )
    _clear_auth_cookies(response)
    return {"ok": True}


@router.get("/me", response_model=UserResponse)
def auth_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/sessions", response_model=list[SessionResponse])
def my_sessions(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return list_sessions_for_user(
        db,
        user_id=current_user.id,
        current_refresh_token=request.cookies.get(settings.refresh_cookie_name),
    )


@router.post("/sessions/{session_id}/revoke", response_model=SessionResponse)
def revoke_my_session(
    session_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = revoke_session_for_user(
        db,
        user_id=current_user.id,
        session_id=session_id,
    )
    current_hash = request.cookies.get(settings.refresh_cookie_name)
    current_hash = current_hash and __import__("hashlib").sha256(current_hash.encode("utf-8")).hexdigest()

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