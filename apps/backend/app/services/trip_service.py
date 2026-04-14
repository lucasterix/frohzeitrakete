"""Trip segment creation for an entry.

MVP shape of the trip payload coming from the mobile app:

    {
        "start_from_home": true,
        "start_address": null,                 // used when start_from_home=false
        "intermediate_stops": [                // optional detours
            "Klinik Nordheim, Am Markt 1, 37154 Northeim"
        ]
    }

From that we build:
    start segment: (home|manual) → patient
    intermediate segments: patient → stop1 → stop2 → patient
Each segment gets geocoded and distance-calculated via OpenRouteService.

Address strings of the patient come from the Patti patient detail
(city/address_line/zip_code). Caller must provide them since this service
doesn't touch Patti itself (avoid circular service imports).
"""

from __future__ import annotations

from datetime import date
from typing import TypedDict

from sqlalchemy.orm import Session

from app.clients.ors_client import OrsClient
from app.models.entry import Entry
from app.models.trip_segment import TripSegment
from app.models.user import User
from app.services.user_home_service import get_home_location


class TripInput(TypedDict, total=False):
    start_from_home: bool
    start_address: str | None
    intermediate_stops: list[str]


def _coord_for_address(ors: OrsClient, address: str) -> tuple[float, float] | None:
    """Returns (lon, lat) from ORS geocoder, or None on failure."""
    if not ors.is_configured:
        return None
    return ors.geocode(address)


def _distance_km(
    ors: OrsClient,
    from_coord: tuple[float, float] | None,
    to_coord: tuple[float, float] | None,
) -> float | None:
    if not ors.is_configured or from_coord is None or to_coord is None:
        return None
    return ors.route_distance_km(from_coord, to_coord)


def _build_segment(
    *,
    entry: Entry,
    user_id: int,
    segment_index: int,
    kind: str,
    from_address: str,
    from_coord: tuple[float, float] | None,
    to_address: str,
    to_coord: tuple[float, float] | None,
    ors: OrsClient,
) -> TripSegment:
    km = _distance_km(ors, from_coord, to_coord)
    return TripSegment(
        entry_id=entry.id,
        user_id=user_id,
        segment_index=segment_index,
        kind=kind,
        from_address=from_address,
        from_latitude=from_coord[1] if from_coord else None,
        from_longitude=from_coord[0] if from_coord else None,
        to_address=to_address,
        to_latitude=to_coord[1] if to_coord else None,
        to_longitude=to_coord[0] if to_coord else None,
        distance_km=km,
        trip_date=entry.entry_date,
    )


def create_trip_segments(
    db: Session,
    *,
    entry: Entry,
    user: User,
    patient_address: str,
    trip_input: TripInput | None,
) -> list[TripSegment]:
    """Generate trip segments for the given entry based on trip_input.

    Returns the created (and committed) segments in order.
    Fails soft: if the ORS call fails, segments are still written but
    distance_km = None and the admin overview will show '—' for that row.
    """
    if not trip_input:
        return []

    ors = OrsClient()

    # 1. Start segment
    start_from_home = trip_input.get("start_from_home", True)
    start_address: str | None = None
    start_coord: tuple[float, float] | None = None

    if start_from_home:
        home = get_home_location(db, user)
        if home is not None:
            start_address = home.address_line
            if home.latitude is not None and home.longitude is not None:
                start_coord = (home.longitude, home.latitude)
    else:
        start_address = (trip_input.get("start_address") or "").strip() or None
        if start_address:
            start_coord = _coord_for_address(ors, start_address)

    # Patient destination coordinate
    patient_coord = _coord_for_address(ors, patient_address)

    segments: list[TripSegment] = []
    seg_index = 0

    if start_address:
        segments.append(
            _build_segment(
                entry=entry,
                user_id=user.id,
                segment_index=seg_index,
                kind="start",
                from_address=start_address,
                from_coord=start_coord,
                to_address=patient_address,
                to_coord=patient_coord,
                ors=ors,
            )
        )
        seg_index += 1

    # 2. Intermediate stops: patient → stop (einfach, keine automatische
    #    Rückfahrt — der Betreuer fährt nicht automatisch denselben Weg
    #    zurück und erfasst seine Fahrten einzeln).
    stops = trip_input.get("intermediate_stops") or []
    for stop in stops:
        stop = (stop or "").strip()
        if not stop:
            continue
        stop_coord = _coord_for_address(ors, stop)

        segments.append(
            _build_segment(
                entry=entry,
                user_id=user.id,
                segment_index=seg_index,
                kind="intermediate",
                from_address=patient_address,
                from_coord=patient_coord,
                to_address=stop,
                to_coord=stop_coord,
                ors=ors,
            )
        )
        seg_index += 1

    db.add_all(segments)
    db.commit()
    for s in segments:
        db.refresh(s)
    return segments


def create_home_commute_segment(
    db: Session,
    *,
    entry: Entry,
    user: User,
    start_address: str,
) -> TripSegment | None:
    """Trip für den "Heimfahrt"-Entry-Type: eine einzelne Strecke von
    start_address (frei oder Patienten-Adresse, wird vom Mobile schon
    aufgelöst) zur Home-Adresse des Users.

    Gibt None zurück wenn keine Home-Adresse hinterlegt ist — der Entry
    bleibt dann trotzdem bestehen, aber ohne berechnete km.
    """
    home = get_home_location(db, user)
    if home is None or not start_address:
        return None

    ors = OrsClient()
    start_coord = _coord_for_address(ors, start_address)
    end_coord: tuple[float, float] | None = None
    if home.latitude is not None and home.longitude is not None:
        end_coord = (home.longitude, home.latitude)

    segment = _build_segment(
        entry=entry,
        user_id=user.id,
        segment_index=0,
        kind="return",
        from_address=start_address,
        from_coord=start_coord,
        to_address=home.address_line,
        to_coord=end_coord,
        ors=ors,
    )
    db.add(segment)
    db.commit()
    db.refresh(segment)
    return segment


def user_km_for_month(
    db: Session, *, user_id: int, year: int, month: int
) -> dict:
    """Returns total km + list of segments for an admin overview."""
    from calendar import monthrange
    from sqlalchemy import func

    start = date(year, month, 1)
    end = date(year, month, monthrange(year, month)[1])

    total = (
        db.query(func.coalesce(func.sum(TripSegment.distance_km), 0.0))
        .filter(
            TripSegment.user_id == user_id,
            TripSegment.trip_date >= start,
            TripSegment.trip_date <= end,
        )
        .scalar()
    ) or 0.0

    segments = (
        db.query(TripSegment)
        .filter(
            TripSegment.user_id == user_id,
            TripSegment.trip_date >= start,
            TripSegment.trip_date <= end,
        )
        .order_by(TripSegment.trip_date.asc(), TripSegment.segment_index.asc())
        .all()
    )

    return {
        "user_id": user_id,
        "year": year,
        "month": month,
        "total_km": round(float(total), 2),
        "segments": segments,
    }
