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


def _extract_zip_code(address: dict) -> str | None:
    """Patti liefert address.zip_code als dict {"zip_code": "37083", ...}
    oder als id+nested object. Wir wollen den String."""
    zip_obj = address.get("zip_code")
    if isinstance(zip_obj, dict):
        return zip_obj.get("zip_code") or zip_obj.get("title")
    if isinstance(zip_obj, str):
        return zip_obj
    return None


def _extract_phone(patient_person: dict) -> str | None:
    """Pref mobile > phone. Patti nennt es 'communication.mobile_number'."""
    comm = patient_person.get("communication") or {}
    return comm.get("mobile_number") or comm.get("phone_number")


def _extract_birthday(patient_person: dict) -> str | None:
    """born_at kommt als ISO-Datetime, wir geben nur den Date-Teil zurück."""
    born = patient_person.get("born_at")
    if isinstance(born, str):
        return born.split("T")[0]
    return None


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
        "postal_code": _extract_zip_code(address),
        "phone": _extract_phone(patient_person),
        "birthday": _extract_birthday(patient_person),
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


def search_patients(query: str, limit: int = 20) -> list[dict]:
    """Globale Patienten-Suche über Patti für den Vertretungsfall.

    Nicht auf den eigenen Betreuer eingeschränkt – eine Betreuungskraft muss
    auch fremde Patienten finden können wenn sie im Vertretungsfall einen
    Einsatz erfasst.

    Wir kombinieren zwei Quellen:
    1. Patti `/api/v1/search?q=...` (matcht people → enthält patient)
    2. Fallback auf `/api/v1/patients?per_page=50` mit clientseitigem Filter

    Die Rückgabeform entspricht `MobilePatient` (ohne service_history_id;
    für nicht-eigene Patienten ist das 0 als Marker).
    """
    if not query or len(query.strip()) < 2:
        return []

    q = query.strip().lower()
    client = PattiClient()
    client.login()

    results: dict[int, dict] = {}

    # Quelle 1: /search
    try:
        search_response = client.search(q)
        data = search_response.get("data", {}) if isinstance(search_response, dict) else {}
        people_section = data.get("people", {})
        people_list = (
            people_section.get("original", [])
            if isinstance(people_section, dict)
            else []
        )

        for person in people_list:
            patient = person.get("patient")
            if not patient or not patient.get("active"):
                continue

            address = person.get("address") or {}
            comm = person.get("communication") or {}

            results[patient["id"]] = {
                "service_history_id": 0,
                "patient_id": patient["id"],
                "display_name": person.get("list_name")
                or f"Patient {patient['id']}",
                "first_name": person.get("first_name"),
                "last_name": person.get("last_name"),
                "address_line": address.get("address_line"),
                "city": address.get("city"),
                "postal_code": _extract_zip_code(address),
                "phone": comm.get("mobile_number") or comm.get("phone_number"),
                "birthday": (person.get("born_at") or "").split("T")[0] or None,
                "care_degree": patient.get("care_degree"),
                "care_degree_int": _parse_care_degree(patient.get("care_degree")),
                "insurance_number": patient.get("insurance_number"),
                "active": bool(patient.get("active")),
                "is_primary": False,
                "started_at": None,
            }
    except Exception:  # noqa: BLE001 – search ist best-effort
        pass

    # Quelle 2: Liste aller Patienten, clientseitig filtern
    try:
        list_response = client.list_patients(per_page=50)
        rows = list_response.get("data", []) if isinstance(list_response, dict) else []

        for patient in rows:
            if patient["id"] in results:
                continue
            if not patient.get("active"):
                continue

            name = (patient.get("list_name") or "").lower()
            if q in name:
                results[patient["id"]] = {
                    "service_history_id": 0,
                    "patient_id": patient["id"],
                    "display_name": patient.get("list_name")
                    or f"Patient {patient['id']}",
                    "first_name": None,
                    "last_name": None,
                    "address_line": None,
                    "city": None,
                    "postal_code": None,
                    "phone": None,
                    "birthday": None,
                    "care_degree": patient.get("care_degree"),
                    "care_degree_int": _parse_care_degree(
                        patient.get("care_degree")
                    ),
                    "insurance_number": patient.get("insurance_number"),
                    "active": bool(patient.get("active")),
                    "is_primary": False,
                    "started_at": None,
                }
    except Exception:  # noqa: BLE001
        pass

    return list(results.values())[:limit]


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
