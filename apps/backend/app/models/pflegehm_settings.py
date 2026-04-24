"""PflegehmSettings model - singleton configuration for Pflegehilfsmittel module."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PflegehmSettings(Base):
    __tablename__ = "pflegehm_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)

    # Stammdaten Leistungserbringer
    ik: Mapped[str | None] = mapped_column(String(9), nullable=True)
    abrechnungscode: Mapped[str | None] = mapped_column(String(10), nullable=True)
    tarifkennzeichen: Mapped[str | None] = mapped_column(String(10), nullable=True)
    verfahrenskennung: Mapped[str | None] = mapped_column(
        String(10), nullable=False, default="TPFL0"
    )

    # SMTP / E-Mail
    smtp_server: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    smtp_user: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    smtp_use_tls: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    email_absender: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Umsatzsteuer
    ust_pflichtig: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ust_satz: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Firmendaten
    firma_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    firma_address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    firma_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    firma_email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Kontaktdaten
    kontakt_person: Mapped[str | None] = mapped_column(String(255), nullable=True)
    kontakt_telefon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    kontakt_fax: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Bankdaten
    bank_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    bank_iban: Mapped[str | None] = mapped_column(String(34), nullable=True)
    bank_bic: Mapped[str | None] = mapped_column(String(11), nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
