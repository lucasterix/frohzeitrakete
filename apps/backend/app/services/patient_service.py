import re

from fastapi import HTTPException, status

from app.clients.patti_client import PattiClient
from app.models.user import User
from app.schemas.patient import PatientBudget


def _parse_care_degree(raw: str | None) -> int:
    """Patti liefert 'pg3' → 3. Ungültige Werte → 0."""
    if not raw:
        return 0
    match = re.search(r"(\d)", raw)
    return int(match.group(1)) if match else 0


def map_service_history_to_mobile_patient(item: dict) -> dict:
    patient = item.get("patient") or {}
    patient_person = item.get("patient_person") or {}
    address = patient_person.get("address") or {}

    care_degree_raw = patient.get("care_degree")

    return {
        "service_history_id": item["id"],
        "patient_id": item["patient_id"],
        "display_name": patient_person.get("list_name")
        or patient.get("person_full_name")
        or patient.get("list_name")
        or f"Patient {item['patient_id']}",
        "first_name": patient_person.get("first_name"),
        "last_name": patient_person.get("last_name"),
        "address_line": address.get("address_line"),
        "city": address.get("city"),
        "care_degree": care_degree_raw,
        "care_degree_int": _parse_care_degree(care_degree_raw),
        "insurance_number": patient.get("insurance_number"),
        "active": bool(patient.get("active")),
        "is_primary": bool(item.get("is_primary")),
        "started_at": item.get("started_at"),
    }


def get_mobile_patients_for_person(person_id: int) -> list[dict]:
    client = PattiClient()
    client.login()

    response = client.get_service_histories_by_person_id(person_id)
    rows = response.get("data", []) if isinstance(response, dict) else []

    result: list[dict] = []

    for item in rows:
        patient = item.get("patient") or {}

        if not item.get("is_primary"):
            continue

        if item.get("ended_at") is not None:
            continue

        if not patient.get("active"):
            continue

        result.append(map_service_history_to_mobile_patient(item))

    return result


def get_patients_for_user(db, user: User) -> list[dict]:
    if not user.patti_person_id:
        return []

    return get_mobile_patients_for_person(user.patti_person_id)


def get_patient_budget(
    patient_id: int, year: int, user: User
) -> PatientBudget:
    """Holt Restbudgets (Pflegesachleistung + Verhinderungspflege) für einen
    Patienten aus Patti für das angegebene Jahr.

    Zugriff ist nur erlaubt wenn der User diesem Patienten zugewiesen ist
    (also in seinen service-histories auftaucht).
    """
    if not user.patti_person_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User ist keiner Patti-Person zugeordnet",
        )

    client = PattiClient()
    client.login()

    # Berechtigung prüfen: ist der Patient dem User zugewiesen?
    service_histories = client.get_service_histories_by_person_id(
        user.patti_person_id
    )
    rows = (
        service_histories.get("data", [])
        if isinstance(service_histories, dict)
        else []
    )
    assigned_patient_ids = {
        row.get("patient_id")
        for row in rows
        if row.get("is_primary") and row.get("ended_at") is None
    }
    if patient_id not in assigned_patient_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Zugriff auf diesen Patienten nicht erlaubt",
        )

    care_response = client.get_remaining_care_service_budget(patient_id, year)
    respite_response = client.get_remaining_respite_care_budget(patient_id, year)

    care = care_response.get("remaining_budget", {}) if isinstance(
        care_response, dict
    ) else {}
    respite = respite_response.get("remaining_budget", {}) if isinstance(
        respite_response, dict
    ) else {}

    return PatientBudget(
        patient_id=patient_id,
        year=year,
        care_service_remaining_hours=float(care.get("hours") or 0.0),
        care_service_used_hours=float(care.get("used") or 0.0),
        care_service_remaining_money_cents=int(care.get("money") or 0),
        respite_care_remaining_hours=float(respite.get("hours") or 0.0),
        respite_care_remaining_money_cents=int(respite.get("money") or 0),
    )
