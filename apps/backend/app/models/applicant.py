from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Applicant(Base):
    __tablename__ = "applicants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(100), nullable=True)
    position: Mapped[str] = mapped_column(String(255), nullable=False)
    source: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="eingegangen", index=True
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    handler_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )
    interview_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    resume_path: Mapped[str | None] = mapped_column(String(500), nullable=True)

    desired_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    desired_location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    desired_role: Mapped[str | None] = mapped_column(String(255), nullable=True)
    available_from: Mapped[str | None] = mapped_column(String(10), nullable=True)
    has_drivers_license: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    has_experience: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    experience_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    trial_work_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    criminal_record_requested_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    criminal_record_received_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    hired_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    hired_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    hired_location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    hired_role: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contract_sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    start_date: Mapped[str | None] = mapped_column(String(10), nullable=True)

    confirmation_sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    invitation_sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    rejection_sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    offer_sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_by_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
