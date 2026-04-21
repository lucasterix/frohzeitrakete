from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ItTicket(Base):
    __tablename__ = "it_tickets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(
        String(50), nullable=False, default="bug"
    )  # bug, feature, frage, sonstiges, crash
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="open"
    )  # open, in_progress, done, rejected
    priority: Mapped[str] = mapped_column(
        String(20), nullable=False, default="medium"
    )  # low, medium, high
    response_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    handler_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )
    handled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    device_info: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
