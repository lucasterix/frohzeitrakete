from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TravelCostPayment(Base):
    """Markiert einen Zeitraum als 'Fahrtkosten bereits überwiesen' für
    einen bestimmten User.

    Der Admin pickt im Admin-Web einen User + Zeitraum (from_date..to_date)
    und bestätigt, dass für diesen Block die Fahrtkosten überwiesen wurden.
    Alle Trip-Segments des Users im Zeitraum zählen dann im Report als
    bezahlt (grün). Überlappende Blöcke sind erlaubt — die Präsentation
    fragt einfach 'gibt es mindestens einen payment der dieses Datum
    abdeckt'.
    """

    __tablename__ = "travel_cost_payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    from_date: Mapped[date] = mapped_column(Date, nullable=False)
    to_date: Mapped[date] = mapped_column(Date, nullable=False)

    marked_by_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
