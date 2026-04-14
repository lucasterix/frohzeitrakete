from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="caretaker")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    patti_person_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Dienstwagen-Flag: True = Mitarbeiter hat Dienstwagen → keine Fahrtkosten-
    # Erstattung. Im Admin-Report werden deren Km-Zeilen automatisch als
    # "bezahlt" (grün) dargestellt.
    has_company_car: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    # Bearbeitungskürzel (z.B. "DR"). Wird beim Resolve von Tickets
    # (Urlaub / Krankmeldung / HR-Anfrage / Call-Request / Intake) als
    # Signatur im Admin-Web eingetragen, damit jeder im Büro sieht wer
    # was bearbeitet hat.
    initials: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )