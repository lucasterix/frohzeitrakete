"""Idempotenter Admin-Seed.

Liest Email/Passwort/Name aus den App-Settings (`ADMIN_SEED_*` ENV-Vars).
Wenn `ADMIN_SEED_PASSWORD` leer ist, wird kein Admin angelegt – das
verhindert versehentliches Anlegen mit einem schwachen Default-Passwort.

Aufruf im Container:
    docker compose exec backend python -m app.scripts.seed_admin
"""

import sys

from app.core.security import hash_password
from app.core.settings import settings
from app.db.session import SessionLocal
from app.models.user import User


def seed_admin() -> int:
    if not settings.admin_seed_password:
        print(
            "ADMIN_SEED_PASSWORD ist nicht gesetzt – breche ab. "
            "Setze die ENV-Variable und versuche es erneut."
        )
        return 1

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == settings.admin_seed_email).first()
        if existing:
            print(f"Admin existiert bereits: {existing.email}")
            return 0

        user = User(
            email=settings.admin_seed_email,
            password_hash=hash_password(settings.admin_seed_password),
            full_name=settings.admin_seed_full_name,
            role="admin",
            is_active=True,
            patti_person_id=None,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"Admin erstellt: {user.email}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(seed_admin())
