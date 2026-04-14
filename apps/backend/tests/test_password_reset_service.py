from datetime import datetime, timedelta

import pytest

from app.core.security import hash_password, verify_password
from app.models.password_reset_token import PasswordResetToken
from app.models.user import User
from app.services.password_reset_service import (
    _hash_token,
    confirm_reset,
    request_reset,
)


def _user(db, email: str = "reset@example.invalid") -> User:
    u = User(
        email=email,
        password_hash=hash_password("oldpassword123"),
        full_name="Reset Tester",
        role="caretaker",
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def test_request_reset_unknown_email_is_silent(db):
    # darf nicht werfen, damit kein User-Enumeration möglich ist
    request_reset(db, email="nobody@example.invalid")
    assert db.query(PasswordResetToken).count() == 0


def test_request_reset_creates_hashed_token(db):
    user = _user(db)
    request_reset(db, email=user.email)
    rows = db.query(PasswordResetToken).all()
    assert len(rows) == 1
    # token wird gehashed gespeichert, nicht im Klartext
    assert len(rows[0].token_hash) == 64  # sha256-hex
    assert rows[0].used_at is None
    assert rows[0].expires_at > datetime.utcnow()


def test_confirm_reset_sets_new_password(db):
    user = _user(db)
    # token generieren (manuell, damit wir den Klartext kennen)
    plain = "supersecrettoken"
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=_hash_token(plain),
            expires_at=datetime.utcnow() + timedelta(minutes=30),
        )
    )
    db.commit()

    confirm_reset(db, token=plain, new_password="brandnew8chars")

    db.refresh(user)
    assert verify_password("brandnew8chars", user.password_hash)
    # token ist verbrannt
    row = db.query(PasswordResetToken).first()
    assert row.used_at is not None


def test_confirm_reset_rejects_expired_token(db):
    user = _user(db)
    plain = "expiredtoken"
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=_hash_token(plain),
            expires_at=datetime.utcnow() - timedelta(minutes=1),
        )
    )
    db.commit()

    with pytest.raises(ValueError, match="token_invalid_or_expired"):
        confirm_reset(db, token=plain, new_password="brandnew8chars")


def test_confirm_reset_rejects_short_password(db):
    with pytest.raises(ValueError, match="password_too_short"):
        confirm_reset(db, token="x", new_password="short")
