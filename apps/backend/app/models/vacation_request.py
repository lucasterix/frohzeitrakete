from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class VacationRequest(Base):
    """Urlaubsantrag vom Betreuer.

    Fachregel: Muss mindestens 1 Monat im Voraus beantragt werden.
    Der Antrag landet im Büro, das Büro setzt den Status auf approved,
    partially_approved oder rejected und kann eine Begründung hinterlegen.
    """

    __tablename__ = "vacation_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    from_date: Mapped[date] = mapped_column(Date, nullable=False)
    to_date: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # open | approved | partially_approved | rejected
    status: Mapped[str] = mapped_column(
        String(30), default="open", nullable=False, index=True
    )

    # Bei partially_approved: der tatsächlich genehmigte Zeitraum
    approved_from_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    approved_to_date: Mapped[date | None] = mapped_column(Date, nullable=True)

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
