"""Home address of the caretaker for km-tracking.

The app needs a "start location" for the first trip of the day. That's
usually the caretaker's home. We try to derive it from Patti (via
user.patti_person_id → /people/{id} → address) on first use and cache
the geocoded coordinates in our DB.

Users can also set/override the home address manually from the mobile app.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.clients.ors_client import OrsClient
from app.clients.patti_client import PattiClient
from app.models.user import User
from app.models.user_home_location import UserHomeLocation


def _format_patti_address(person_address: dict) -> str | None:
    line = person_address.get("address_line")
    city = person_address.get("city")
    zip_code = person_address.get("zip_code")
    if isinstance(zip_code, dict):
        zip_code = zip_code.get("zip_code") or zip_code.get("title")
    parts = [p for p in [line, f"{zip_code} {city}".strip()] if p]
    return ", ".join(parts) if parts else None


def _geocode_address(address: str) -> tuple[float | None, float | None]:
    client = OrsClient()
    if not client.is_configured:
        return (None, None)
    coords = client.geocode(address)
    if coords is None:
        return (None, None)
    return (coords[1], coords[0])  # (lat, lon)


def get_home_location(db: Session, user: User) -> UserHomeLocation | None:
    """Returns the cached home of the user, or attempts to pull it from
    Patti if this is the first time we're asked."""
    existing = (
        db.query(UserHomeLocation)
        .filter(UserHomeLocation.user_id == user.id)
        .first()
    )
    if existing is not None:
        return existing

    if not user.patti_person_id:
        return None

    # First-time fetch from Patti
    try:
        patti = PattiClient()
        patti.login()
        person = patti.get_person(user.patti_person_id)
        address = (person.get("address") or {})
        formatted = _format_patti_address(address)
        if not formatted:
            return None

        lat, lon = _geocode_address(formatted)
        home = UserHomeLocation(
            user_id=user.id,
            address_line=formatted,
            latitude=lat,
            longitude=lon,
            source="patti",
        )
        db.add(home)
        db.commit()
        db.refresh(home)
        return home
    except Exception:  # noqa: BLE001
        return None


def set_home_location(
    db: Session,
    user: User,
    *,
    address_line: str,
    source: str = "manual",
) -> UserHomeLocation:
    """Create or update the user's home address manually. Triggers a
    fresh geocoding so the trip service has working coordinates."""
    lat, lon = _geocode_address(address_line)
    existing = (
        db.query(UserHomeLocation)
        .filter(UserHomeLocation.user_id == user.id)
        .first()
    )
    if existing is None:
        existing = UserHomeLocation(user_id=user.id, address_line=address_line)
        db.add(existing)
    existing.address_line = address_line
    existing.latitude = lat
    existing.longitude = lon
    existing.source = source
    existing.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(existing)
    return existing
