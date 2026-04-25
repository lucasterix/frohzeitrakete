from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class PflegehmAbrechnung(Base):
    __tablename__ = "pflegehm_abrechnungen"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    patient_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    patient_name: Mapped[str] = mapped_column(String(255), nullable=False)
    versichertennummer: Mapped[str] = mapped_column(String(30), nullable=False)
    geburtsdatum: Mapped[str] = mapped_column(String(10), nullable=False)
    kasse_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("kostentraeger.id"), nullable=False
    )
    abrechnungsmonat: Mapped[str] = mapped_column(String(7), nullable=False)  # YYYY-MM
    gesamt_betrag: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="entwurf"
    )  # entwurf / gesendet / storniert
    gesendet_am: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    storniert_am: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    pflegehm_patient_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("pflegehm_patients.id"), nullable=True
    )

    signature_event_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("signature_events.id"), nullable=True
    )

    created_by_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    leistungsnachweis_path: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )

    kasse = relationship("Kostentraeger", lazy="joined")
    pflegehm_patient = relationship("PflegehmPatient", lazy="joined")
    positionen = relationship(
        "PflegehmPosition", back_populates="abrechnung", cascade="all, delete-orphan"
    )
