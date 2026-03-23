from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class SignatureEvent(Base):
    __tablename__ = "signature_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    patient_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    document_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="captured")
    signer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    info_text_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    source: Mapped[str] = mapped_column(String(30), nullable=False, default="admin_test")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )

    signed_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    asset = relationship(
        "SignatureAsset",
        back_populates="event",
        uselist=False,
        cascade="all, delete-orphan",
    )