from app.clients.patti_client import PattiClient


def map_service_history_to_mobile_patient(item: dict) -> dict:
    patient = item.get("patient") or {}
    patient_person = item.get("patient_person") or {}
    address = patient_person.get("address") or {}

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
        "care_degree": patient.get("care_degree"),
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