from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class SignatureAsset(Base):
    __tablename__ = "signature_assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    signature_event_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("signature_events.id"), nullable=False, unique=True, index=True
    )
    svg_content: Mapped[str] = mapped_column(Text, nullable=False)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    event = relationship("SignatureEvent", back_populates="asset")