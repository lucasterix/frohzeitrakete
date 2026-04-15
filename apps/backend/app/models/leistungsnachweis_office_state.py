from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LeistungsnachweisOfficeState(Base):
    """Tracking-Tabelle für "Büro hat den Leistungsnachweis schon an die
    Kasse geschickt". Pro (user, patient, year, month) genau eine Zeile —
    unabhängig davon ob eine Unterschrift existiert, damit auch
    Papier-LNs abgehakt werden können."""

    __tablename__ = "leistungsnachweis_office_state"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "patient_id",
            "year",
            "month",
            name="uq_lnos_user_patient_month",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    patient_id: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)

    processed_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    processed_by_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
