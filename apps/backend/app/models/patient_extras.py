from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PatientExtras(Base):
    """Zusätzliche Daten zu einem Patti-Patient die in Patti selbst
    nicht verfügbar sind.

    patient_id ist die Patti-patient_id. Wir halten hier pro Patient genau
    einen Datensatz (unique constraint).
    """

    __tablename__ = "patient_extras"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    patient_id: Mapped[int] = mapped_column(
        Integer, unique=True, nullable=False, index=True
    )

    # Notfallkontakt (Patti kennt das nicht)
    emergency_contact_name: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    emergency_contact_phone: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )

    # Betreuungsvertrag: existiert ein unterschriebener Vertrag?
    # Wird entweder vom Admin manuell gesetzt (alte Papier-Verträge) oder
    # automatisch durch die Mobile-App wenn ein SignatureEvent mit
    # document_type="betreuungsvertrag" angelegt wird.
    contract_signed_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    contract_signature_event_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("signature_events.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Büro-Call-Tracking
    last_office_call_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    primary_caretaker_changed_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
