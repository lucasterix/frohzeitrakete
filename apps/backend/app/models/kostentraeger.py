from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Kostentraeger(Base):
    __tablename__ = "kostentraeger"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    ik: Mapped[str] = mapped_column(String(9), unique=True, nullable=False)
    annahmestelle: Mapped[str | None] = mapped_column(String(255), nullable=True)
    annahmestelle_ik: Mapped[str | None] = mapped_column(String(9), nullable=True)
    annahmestelle_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
