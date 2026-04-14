"""Passwort-Reset Flow.

Pragmatischer MVP-Ansatz: Ein Token wird erzeugt, nur der Hash liegt
in der DB. Das Klartext-Token wird per Mail verschickt (falls SMTP
konfiguriert ist) oder ins Log geschrieben, damit das Büro den Link
manuell an den User weitergeben kann, solange noch kein SMTP-Relay
steht.
"""

import hashlib
import secrets
import smtplib
from datetime import datetime, timedelta
from email.message import EmailMessage

from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.core.security import hash_password
from app.core.settings import settings
from app.models.password_reset_token import PasswordResetToken
from app.models.user import User

logger = get_logger("password_reset")


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def request_reset(db: Session, *, email: str) -> None:
    """Erzeugt — falls der User existiert — einen Reset-Token und verschickt ihn.

    Wirft bewusst keinen 404 wenn der User nicht existiert: sonst kann
    ein Angreifer durch Enumeration feststellen welche E-Mail-Adressen
    registriert sind.
    """
    email_norm = email.strip().lower()
    user = db.query(User).filter(User.email == email_norm).first()
    if user is None or not user.is_active:
        logger.info("password_reset_request_unknown_email", email=email_norm)
        return

    # Alte ungenutzte Tokens des Users markieren
    now = datetime.utcnow()
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.used_at.is_(None),
    ).update({PasswordResetToken.used_at: now}, synchronize_session=False)

    token = secrets.token_urlsafe(32)
    row = PasswordResetToken(
        user_id=user.id,
        token_hash=_hash_token(token),
        expires_at=now
        + timedelta(minutes=settings.password_reset_token_ttl_minutes),
    )
    db.add(row)
    db.commit()

    reset_link = f"{settings.password_reset_base_url}?token={token}"
    _send_reset_mail(user=user, reset_link=reset_link, token=token)


def confirm_reset(db: Session, *, token: str, new_password: str) -> None:
    if len(new_password) < 8:
        raise ValueError("password_too_short")

    token_hash = _hash_token(token)
    row = (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > datetime.utcnow(),
        )
        .first()
    )
    if row is None:
        raise ValueError("token_invalid_or_expired")

    user = db.query(User).filter(User.id == row.user_id).first()
    if user is None or not user.is_active:
        raise ValueError("user_not_found")

    user.password_hash = hash_password(new_password)
    row.used_at = datetime.utcnow()
    db.commit()
    logger.info("password_reset_confirmed", user_id=user.id)


def _send_reset_mail(*, user: User, reset_link: str, token: str) -> None:
    if not settings.smtp_host:
        # Fallback: klare Log-Zeile damit das Büro den Link manuell weiterreichen kann
        logger.warning(
            "password_reset_token_generated_smtp_missing",
            user_id=user.id,
            email=user.email,
            reset_link=reset_link,
            ttl_minutes=settings.password_reset_token_ttl_minutes,
        )
        return

    msg = EmailMessage()
    msg["Subject"] = "FrohZeit Rakete – Passwort zurücksetzen"
    msg["From"] = settings.smtp_from
    msg["To"] = user.email
    msg.set_content(
        f"""Hallo {user.full_name},

du hast ein neues Passwort für FrohZeit Rakete angefragt.

Klicke auf den folgenden Link, um ein neues Passwort festzulegen:
{reset_link}

Dieser Link ist {settings.password_reset_token_ttl_minutes} Minuten gültig.

Falls du das nicht angefragt hast, kannst du diese Mail ignorieren.

FrohZeit Rakete
"""
    )

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as s:
            s.starttls()
            if settings.smtp_user:
                s.login(settings.smtp_user, settings.smtp_password)
            s.send_message(msg)
        logger.info("password_reset_mail_sent", user_id=user.id)
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "password_reset_mail_failed",
            user_id=user.id,
            error=str(exc),
            reset_link=reset_link,
        )
