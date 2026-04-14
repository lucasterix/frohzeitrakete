"""Detailed work report for an admin view of a single caretaker's month.

Aggregates:
- all entries (patient + office + training + other)
- all trip segments
- per day: hour total, km total, list of entries, list of trips
- month grand totals
"""

from calendar import monthrange
from datetime import date

from sqlalchemy.orm import Session

from app.clients.patti_client import PattiClient
from app.models.entry import Entry
from app.models.travel_cost_payment import TravelCostPayment
from app.models.trip_segment import TripSegment
from app.models.user import User

PATIENT_HOURS_BONUS_PCT = 10.0


def build_work_report(
    db: Session, *, user_id: int, year: int, month: int
) -> dict:
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        return {"error": "user_not_found"}

    first_day = date(year, month, 1)
    last_day = date(year, month, monthrange(year, month)[1])

    entries = (
        db.query(Entry)
        .filter(
            Entry.user_id == user_id,
            Entry.entry_date >= first_day,
            Entry.entry_date <= last_day,
        )
        .order_by(Entry.entry_date.asc(), Entry.id.asc())
        .all()
    )

    trips = (
        db.query(TripSegment)
        .filter(
            TripSegment.user_id == user_id,
            TripSegment.trip_date >= first_day,
            TripSegment.trip_date <= last_day,
        )
        .order_by(
            TripSegment.trip_date.asc(), TripSegment.segment_index.asc()
        )
        .all()
    )

    # Patient-Namen für patient_ids auflösen (best-effort)
    patient_names: dict[int, str] = {}
    patient_ids = {e.patient_id for e in entries if e.patient_id}
    if patient_ids:
        try:
            client = PattiClient()
            client.login()
            for pid in patient_ids:
                try:
                    p = client.get_patient(pid)
                    patient_names[pid] = p.get("list_name") or f"Patient {pid}"
                except Exception:  # noqa: BLE001
                    patient_names[pid] = f"Patient {pid}"
        except Exception:  # noqa: BLE001
            patient_names = {pid: f"Patient {pid}" for pid in patient_ids}

    # Nach Tag gruppieren
    days: dict[date, dict] = {}
    for e in entries:
        d = days.setdefault(
            e.entry_date,
            {
                "date": e.entry_date.isoformat(),
                "entries": [],
                "trips": [],
                "day_hours": 0.0,
                "day_km": 0.0,
            },
        )
        d["entries"].append(
            {
                "id": e.id,
                "type": e.entry_type or "patient",
                "patient_id": e.patient_id,
                "patient_name": patient_names.get(e.patient_id),
                "label": e.category_label,
                "hours": e.hours,
                "activities": [
                    a.strip() for a in (e.activities or "").split(",") if a.strip()
                ],
                "note": e.note,
            }
        )
        d["day_hours"] = round(d["day_hours"] + e.hours, 2)

    for t in trips:
        d = days.setdefault(
            t.trip_date,
            {
                "date": t.trip_date.isoformat(),
                "entries": [],
                "trips": [],
                "day_hours": 0.0,
                "day_km": 0.0,
            },
        )
        d["trips"].append(
            {
                "id": t.id,
                "kind": t.kind,
                "from_address": t.from_address,
                "to_address": t.to_address,
                "distance_km": t.distance_km,
            }
        )
        if t.distance_km is not None:
            d["day_km"] = round(d["day_km"] + t.distance_km, 2)

    # Fahrtkosten-Zahlstatus pro Tag: welche Tage fallen in einen
    # TravelCostPayment-Zeitraum? Mitarbeiter mit Dienstwagen sind immer
    # "bezahlt" (grün), weil sie keine Fahrtkostenerstattung bekommen.
    payments = (
        db.query(TravelCostPayment)
        .filter(TravelCostPayment.user_id == user_id)
        .all()
    )

    def _is_paid(day_date: date) -> bool:
        if user.has_company_car:
            return True
        for p in payments:
            if p.from_date <= day_date <= p.to_date:
                return True
        return False

    day_list = sorted(days.values(), key=lambda d: d["date"])
    # Bonus-Berechnung + Zahlstatus anreichern
    patient_hours = 0.0
    non_patient_hours = 0.0
    for d in day_list:
        d_date = date.fromisoformat(d["date"])
        d["travel_costs_paid"] = _is_paid(d_date)
        day_patient = 0.0
        day_non_patient = 0.0
        for e in d["entries"]:
            if e["type"] == "patient":
                day_patient += e["hours"]
            elif e["type"] != "home_commute":
                day_non_patient += e["hours"]
        patient_hours += day_patient
        non_patient_hours += day_non_patient
        d["patient_hours"] = round(day_patient, 2)
        d["non_patient_hours"] = round(day_non_patient, 2)
        d["patient_hours_with_bonus"] = round(
            day_patient * (1 + PATIENT_HOURS_BONUS_PCT / 100), 2
        )

    total_hours = round(sum(d["day_hours"] for d in day_list), 2)
    total_km = round(sum(d["day_km"] for d in day_list), 2)
    patient_hours_with_bonus = round(
        patient_hours * (1 + PATIENT_HOURS_BONUS_PCT / 100), 2
    )
    billable_hours = round(patient_hours_with_bonus + non_patient_hours, 2)

    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "has_company_car": user.has_company_car,
        },
        "year": year,
        "month": month,
        "total_hours": total_hours,
        "total_km": total_km,
        "working_days": len(day_list),
        "patient_hours": round(patient_hours, 2),
        "non_patient_hours": round(non_patient_hours, 2),
        "patient_hours_with_bonus": patient_hours_with_bonus,
        "billable_hours": billable_hours,
        "bonus_pct": PATIENT_HOURS_BONUS_PCT,
        "days": day_list,
    }
