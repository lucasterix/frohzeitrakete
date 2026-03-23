from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.user import User


def seed_admin() -> None:
    db = SessionLocal()

    email = "admin@example.com"
    password = "BitteSofortAendern123!"
    full_name = "Admin"
    role = "admin"

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        print(f"Admin existiert bereits: {existing.email}")
        db.close()
        return

    user = User(
        email=email,
        password_hash=hash_password(password),
        full_name=full_name,
        role=role,
        is_active=True,
        patti_person_id=None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.close()

    print(f"Admin erstellt: {user.email}")


if __name__ == "__main__":
    seed_admin()