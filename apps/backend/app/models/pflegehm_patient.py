"""PflegehmPatient model - separate from Patti patients, for Kassenabrechnung."""

from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class PflegehmPatient(Base):
    __tablename__ = "pflegehm_patients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    versichertennummer: Mapped[str] = mapped_column(String(50), nullable=False)
    geburtsdatum: Mapped[date | None] = mapped_column(Date, nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    kasse_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("kostentraeger.id"), nullable=True
    )
    unterschriebener_antrag: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    kasse = relationship("Kostentraeger", lazy="joined")
