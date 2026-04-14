from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TripSegment(Base):
    """A single trip segment attached to an entry.

    One entry can have multiple segments:
    - kind="start":        anfahrt (home/previous-patient → current patient)
    - kind="intermediate": während einsatz (patient → somewhere → patient)
    - kind="return":       rückfahrt (reserved, unused for now)

    We persist both the free-text address and the geocoded coordinates so
    that future recomputations don't need another ORS roundtrip.
    """

    __tablename__ = "trip_segments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    entry_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("entries.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    segment_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)

    from_address: Mapped[str] = mapped_column(String(500), nullable=False)
    from_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    from_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)

    to_address: Mapped[str] = mapped_column(String(500), nullable=False)
    to_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    to_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)

    distance_km: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Date separate gespeichert damit die Admin-Aggregation (km/Monat)
    # einfach nach trip_date filtern kann ohne join auf entries.
    trip_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
