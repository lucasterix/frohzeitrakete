from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Notification(Base):
    """In-App-Benachrichtigung für einen User.

    Aktuell polled das Mobile /mobile/notifications regelmäßig — es gibt
    (noch) keinen Push-Dienst. Die Tabelle ist so ausgelegt dass später
    ein Push-Worker die gleichen Rows lesen und an APNs/FCM weiterreichen
    kann (delivered_at).
    """

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # z.B. call_request_created | training_new | birthday_reminder | office_message
    kind: Mapped[str] = mapped_column(String(50), nullable=False, index=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Optional: worauf verweist diese Notification (Patient, Call-Request, etc.)
    related_patient_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    related_entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False, index=True
    )
