from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class BudgetInquiry(Base):
    __tablename__ = "budget_inquiries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    patient_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    patient_name: Mapped[str] = mapped_column(String(255), nullable=False)
    versichertennummer: Mapped[str | None] = mapped_column(String(100), nullable=True)
    geburtsdatum: Mapped[str | None] = mapped_column(String(20), nullable=True)
    kasse_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    kasse_ik: Mapped[str | None] = mapped_column(String(50), nullable=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )
    pdf_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    signature_event_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("signature_events.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
