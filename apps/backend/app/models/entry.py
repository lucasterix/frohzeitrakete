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
    """Einsatz einer Betreuungskraft. Kann ein Patient-Einsatz sein (Default)
    oder ein interner Einsatz wie Büro-Tag / Fortbildung — dann ist
    patient_id NULL und entry_type entsprechend gesetzt.

    MVP-Fachregeln:
    - Für Patient-Einsätze: pro (user, patient, date) genau 1 Eintrag,
      Stunden werden sonst addiert. (UniqueConstraint funktioniert nur für
      non-null patient_id; NULL-Werte umgeht der Constraint automatisch.)
    - Für non-patient Einsätze: pro (user, date, entry_type) genau 1 Eintrag,
      Stunden werden im Service addiert (kein DB-Constraint weil sonst
      partial-unique-index nötig wäre).
    - hours: 0.5-Schritte, 0.5 <= x <= 8.0 → Schema/Service.
    - Keine Zukunftsdaten → Schema prüft entry_date <= today.
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
    # Null bei non-patient Einsätzen (Büro, Fortbildung, …)
    patient_id: Mapped[int | None] = mapped_column(
        Integer, nullable=True, index=True
    )

    # entry_type: "patient" (default) | "office" | "training" | "other"
    entry_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="patient", index=True
    )
    # Freitext-Label bei non-patient Einsätzen, z.B.
    # "Büro-Tag", "Fortbildung: Demenz verstehen"
    category_label: Mapped[str | None] = mapped_column(String(255), nullable=True)

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
