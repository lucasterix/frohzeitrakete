from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Entry(Base):
    """Tageseinsatz einer Betreuungskraft bei einem Patienten.

    MVP-Fachregeln (siehe docs):
    - Pro (user_id, patient_id, entry_date) genau 1 Eintrag → UniqueConstraint.
      Gleicher Tag = Stunden addieren, kein neuer Datensatz (im Service gelöst).
    - hours: 0.5-Schritte, 0.5 <= x <= 8.0 → Validierung im Schema/Service.
    - Einträge in der Zukunft nicht erlaubt → Service prüft entry_date <= today.
    - Keine Bemerkungen im MVP (note bleibt vorerst leer aber Spalte da).
    - activities: kommagetrennter String (z.B. "Hauswirtschaft, Vorlesen").
      Einfach, index-bar, keine JSON-Column nötig für MVP.
    """

    __tablename__ = "entries"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "patient_id",
            "entry_date",
            name="uq_entries_user_patient_date",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    patient_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    entry_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    hours: Mapped[float] = mapped_column(Float, nullable=False)
    activities: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Wenn der Monat dieses Eintrags durch einen Leistungsnachweis unterschrieben
    # wurde, kann das Büro die Verknüpfung nachtragen. Für MVP vor allem Info-Feld.
    signature_event_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("signature_events.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Wenn der Einsatz erfolgreich in Patti synchronisiert wurde, merken wir uns
    # die Patti-service-entry-ID damit wir bei Delete/Update auch dort syncen
    # können.
    patti_service_entry_id: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
