from datetime import datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import (
    create_access_token,
    create_refresh_token_value,
    hash_refresh_token,
    verify_password,
)
from app.core.settings import settings
from app.models.user import User
from app.repositories.refresh_token_repository import (
    create_refresh_session,
    get_refresh_session_by_hash,
    list_user_refresh_sessions,
    revoke_refresh_session,
)
from app.repositories.user_repository import get_user_by_email, get_user_by_id


def _build_device_label(device_name: str | None, user_agent: str | None) -> str | None:
    if device_name and device_name.strip():
        return device_name.strip()

    if user_agent and user_agent.strip():
        short = user_agent.strip()
        return short[:120]

    return None


def _serialize_session(session, current_token_hash: str | None):
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
        "is_current": session.token_hash == current_token_hash,
    }


def login_user(
    db: Session,
    *,
    email: str,
    password: str,
    user_agent: str | None,
    ip_address: str | None,
    device_name: str | None,
):
    user = get_user_by_email(db, email)

    if user is None or not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Falsche Email oder falsches Passwort",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User ist inaktiv",
        )

    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token_value()
    refresh_token_hash = hash_refresh_token(refresh_token)

    expires_at = datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days)

    create_refresh_session(
        db,
        user_id=user.id,
        token_hash=refresh_token_hash,
        expires_at=expires_at,
        device_label=_build_device_label(device_name, user_agent),
        user_agent=user_agent,
        ip_address=ip_address,
    )

    return {
        "user": user,
        "access_token": access_token,
        "refresh_token": refresh_token,
    }


def refresh_login(
    db: Session,
    *,
    refresh_token: str,
    user_agent: str | None,
    ip_address: str | None,
    device_name: str | None,
):
    refresh_token_hash = hash_refresh_token(refresh_token)
    session = get_refresh_session_by_hash(db, refresh_token_hash)

    if session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Ungültiger Refresh Token",
        )

    if session.revoked_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh Token wurde widerrufen",
        )

    if session.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh Token ist abgelaufen",
        )

    user = get_user_by_id(db, session.user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User ist nicht mehr verfügbar oder inaktiv",
        )

    revoke_refresh_session(db, session)

    new_access_token = create_access_token(user.id)
    new_refresh_token = create_refresh_token_value()
    new_refresh_token_hash = hash_refresh_token(new_refresh_token)

    expires_at = datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days)

    create_refresh_session(
        db,
        user_id=user.id,
        token_hash=new_refresh_token_hash,
        expires_at=expires_at,
        device_label=_build_device_label(device_name, user_agent),
        user_agent=user_agent,
        ip_address=ip_address,
    )

    return {
        "user": user,
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
    }


def logout_user(
    db: Session,
    *,
    refresh_token: str | None,
):
    if not refresh_token:
        return

    refresh_token_hash = hash_refresh_token(refresh_token)
    session = get_refresh_session_by_hash(db, refresh_token_hash)
    if session is not None and session.revoked_at is None:
        revoke_refresh_session(db, session)


def list_sessions_for_user(
    db: Session,
    *,
    user_id: int,
    current_refresh_token: str | None,
):
    current_hash = hash_refresh_token(current_refresh_token) if current_refresh_token else None
    sessions = list_user_refresh_sessions(db, user_id)
    return [_serialize_session(session, current_hash) for session in sessions]


def revoke_session_for_user(
    db: Session,
    *,
    user_id: int,
    session_id: int,
):
    sessions = list_user_refresh_sessions(db, user_id)
    target = next((session for session in sessions if session.id == session_id), None)

    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session nicht gefunden",
        )

    if target.revoked_at is None:
        revoke_refresh_session(db, target)

    return target