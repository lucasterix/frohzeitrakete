from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


# Mögliche Kategorien:
# - overtime_payout         → Überstundenauszahlung
# - income_certificate      → Verdienstbescheinigung
# - salary_advance          → Gehaltsvorschuss
# - address_change          → neue Adresse mitteilen
# - side_job_certificate    → Nebenverdienstbescheinigung
# - other                   → sonstiges Anliegen
HR_REQUEST_CATEGORIES = (
    "overtime_payout",
    "income_certificate",
    "salary_advance",
    "address_change",
    "side_job_certificate",
    "other",
)


class HrRequest(Base):
    """Personal-/HR-Anfrage vom Betreuer ans Büro.

    Strukturierte Anfragen aus dem Mobile (z.B. "Überstundenauszahlung
    bitte 12 Stunden"). Das Büro bearbeitet sie im Admin-Web, markiert
    mit Kürzel, setzt Status und optional eine Rückantwort. Der
    Betreuer sieht die Antwort in seinen Notifications + auf dem
    Home-Screen.
    """

    __tablename__ = "hr_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    category: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)

    # open | done | rejected
    status: Mapped[str] = mapped_column(
        String(20), default="open", nullable=False, index=True
    )

    handler_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    handler_kuerzel: Mapped[str | None] = mapped_column(String(10), nullable=True)
    handled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    response_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
