from datetime import datetime
from sqlalchemy.orm import Session

from app.models.refresh_token import RefreshToken


def create_refresh_session(
    db: Session,
    *,
    user_id: int,
    token_hash: str,
    expires_at: datetime,
    device_label: str | None,
    user_agent: str | None,
    ip_address: str | None,
) -> RefreshToken:
    session = RefreshToken(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=expires_at,
        device_label=device_label,
        user_agent=user_agent,
        ip_address=ip_address,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_refresh_session_by_hash(db: Session, token_hash: str) -> RefreshToken | None:
    return db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()


def list_user_refresh_sessions(db: Session, user_id: int) -> list[RefreshToken]:
    return (
        db.query(RefreshToken)
        .filter(RefreshToken.user_id == user_id)
        .order_by(RefreshToken.created_at.desc())
        .all()
    )


def revoke_refresh_session(db: Session, session: RefreshToken) -> RefreshToken:
    session.revoked_at = datetime.utcnow()
    db.commit()
    db.refresh(session)
    return session


def revoke_all_refresh_sessions_for_user(db: Session, user_id: int) -> None:
    sessions = db.query(RefreshToken).filter(
        RefreshToken.user_id == user_id,
        RefreshToken.revoked_at.is_(None),
    ).all()

    for session in sessions:
        session.revoked_at = datetime.utcnow()

    db.commit()