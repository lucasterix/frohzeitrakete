from sqlalchemy import Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Pflegehilfsmittel(Base):
    __tablename__ = "pflegehilfsmittel"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    bezeichnung: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    positionsnummer: Mapped[str] = mapped_column(String(50), nullable=False)
    kennzeichen: Mapped[str] = mapped_column(String(10), nullable=False, default="00")
    packungsgroesse: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    preis_brutto: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
