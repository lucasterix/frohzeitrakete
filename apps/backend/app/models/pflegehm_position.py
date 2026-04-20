from sqlalchemy import Float, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class PflegehmPosition(Base):
    __tablename__ = "pflegehm_positionen"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    abrechnung_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("pflegehm_abrechnungen.id"), nullable=False, index=True
    )
    hilfsmittel_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("pflegehilfsmittel.id"), nullable=False
    )
    menge: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    einzelpreis: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    betrag_gesamt: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    abrechnung = relationship("PflegehmAbrechnung", back_populates="positionen")
    hilfsmittel = relationship("Pflegehilfsmittel", lazy="joined")
