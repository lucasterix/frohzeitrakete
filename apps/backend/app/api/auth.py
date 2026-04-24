from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.logging import get_logger
from app.core.rate_limit import limiter
from app.core.security import hash_password, verify_password
from app.core.settings import settings
from app.db.session import get_db
from app.models.user import User
from app.repositories.refresh_token_repository import (
    revoke_all_refresh_sessions_for_user,
)
from app.schemas.auth import (
    AuthResponse,
    ChangePasswordRequest,
    LoginRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    SessionResponse,
)
from app.schemas.user import UserResponse
from app.services.auth_service import (
    list_sessions_for_user,
    login_user,
    logout_user,
    refresh_login,
    revoke_session_for_user,
)
from app.services.password_reset_service import confirm_reset, request_reset

router = APIRouter()
logger = get_logger("auth")


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    cookie_domain = settings.cookie_domain or None
    response.set_cookie(
        key=settings.access_cookie_name,
        value=access_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
        domain=cookie_domain,
    )
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=refresh_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        path="/",
        domain=cookie_domain,
    )


def _clear_auth_cookies(response: Response):
    cookie_domain = settings.cookie_domain or None
    response.delete_cookie(key=settings.access_cookie_name, path="/", domain=cookie_domain)
    response.delete_cookie(key=settings.refresh_cookie_name, path="/", domain=cookie_domain)


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


@router.post("/register-push-token", status_code=204)
def auth_register_push_token(
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mobile-Client meldet seinen FCM/APNs-Token an. Payload:
    {token: str, platform: "ios"|"android"}. Wird idempotent
    überschrieben, pro User nur ein Gerät."""
    token = (payload.get("token") or "").strip()
    platform = (payload.get("platform") or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="token_required")
    current_user.push_token = token[:512]
    current_user.push_platform = platform[:20] or None
    db.commit()
    return None


@router.post("/change-password", status_code=204)
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Der User ändert sein eigenes Passwort.

    Prüft das aktuelle Passwort, setzt das neue, invalidiert alle Refresh-
    Sessions (außer der aktuellen – die muss der User dann neu aufbauen,
    aber da er sowieso angemeldet ist reicht der access_token bis zum Ablauf).
    """
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aktuelles Passwort ist falsch",
        )

    if len(payload.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Neues Passwort muss mindestens 8 Zeichen haben",
        )

    current_user.password_hash = hash_password(payload.new_password)
    db.add(current_user)
    db.commit()

    # Alle anderen Sessions abmelden als Sicherheitsmaßnahme
    revoke_all_refresh_sessions_for_user(db, current_user.id)
    return None


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


@router.post("/password-reset/request")
@limiter.limit(settings.login_rate_limit)
def password_reset_request(
    payload: PasswordResetRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Startet den Passwort-Reset-Flow.

    Gibt immer 200 zurück, auch wenn die E-Mail unbekannt ist — das
    verhindert User-Enumeration. Der eigentliche Versand passiert im
    Service (SMTP oder Log-Fallback).
    """
    request_reset(db, email=payload.email)
    return {"ok": True}


@router.post("/password-reset/confirm")
@limiter.limit(settings.login_rate_limit)
def password_reset_confirm(
    payload: PasswordResetConfirm,
    request: Request,
    db: Session = Depends(get_db),
):
    try:
        confirm_reset(
            db, token=payload.token, new_password=payload.new_password
        )
    except ValueError as exc:
        if str(exc) == "password_too_short":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Passwort muss mindestens 8 Zeichen lang sein",
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset-Link ist ungültig oder abgelaufen",
        )
    return {"ok": True}