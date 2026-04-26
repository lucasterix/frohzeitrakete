from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


PAYROLL_CATEGORIES = (
    "krankmeldung",
    "kindkrankmeldung",
    "gehaltsvorschuss",
    "ueberstundenauszahlung",
    "lohnrueckfrage",
    "sonstiges",
)

PAYROLL_SOURCES = ("admin_web", "rakete")
PAYROLL_STATUSES = ("open", "in_progress", "done")


class PayrollEntry(Base):
    """Lohnabrechnung-Eintrag.

    Kann vom Buero (admin_web) oder aus der Rakete-App (mobile) erstellt
    werden. Krankmeldungen, Gehaltsvorschuesse, Ueberstundenauszahlungen
    und sonstige lohnrelevante Vorgaenge werden hier gesammelt.
    """

    __tablename__ = "payroll_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    # Nullable: nicht jeder Mitarbeiter ist als User angelegt
    user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    employee_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    category: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    from_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    to_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    attachment_path: Mapped[str | None] = mapped_column(String(255), nullable=True)

    source: Mapped[str] = mapped_column(String(30), nullable=False, default="admin_web")

    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="open", index=True
    )

    handler_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    handled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    handler_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
