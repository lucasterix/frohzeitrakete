from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AvisDocument(Base):
    __tablename__ = "avis_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    letter_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    beleg_no: Mapped[str | None] = mapped_column(String(100), nullable=True)
    doc_type: Mapped[str] = mapped_column(String(20), nullable=False, default="OTHER")
    entry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    warnings: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="parsed", index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    pdf_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source: Mapped[str] = mapped_column(String(50), nullable=False, default="upload")
    uploaded_by_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )


class AvisEntryRow(Base):
    __tablename__ = "avis_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    document_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("avis_documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    invoice_no: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    amount_eur: Mapped[float] = mapped_column(Float, nullable=False)
    matched: Mapped[str] = mapped_column(String(30), nullable=False, default="unmatched")
    match_note: Mapped[str | None] = mapped_column(String(255), nullable=True)
