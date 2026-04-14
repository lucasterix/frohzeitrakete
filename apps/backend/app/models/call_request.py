from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CallRequest(Base):
    """Eine Bitte vom Betreuer ans Büro, einen bestimmten Patienten anzurufen.

    Wird auf PatientDetail via "Büro bitte anrufen"-Button erzeugt. Das Büro
    sieht die offenen Requests im Admin-Web und markiert sie als erledigt.
    """

    __tablename__ = "call_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    patient_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    requested_by_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Grund (z.B. "rückfrage", "umzug", "termin", "sonstiges")
    reason: Mapped[str] = mapped_column(String(50), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(
        String(20), default="open", nullable=False, index=True
    )  # open | done | canceled
    handled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    handled_by_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    handler_kuerzel: Mapped[str | None] = mapped_column(String(10), nullable=True)
    response_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
