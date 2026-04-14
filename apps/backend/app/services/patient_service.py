import re

from fastapi import HTTPException, status

from app.clients.patti_client import PattiClient
from app.models.user import User
from app.schemas.patient import CaretakerHistoryEntry, PatientBudget


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
    """Pref mobile > festnetz."""
    comm = patient_person.get("communication") or {}
    return comm.get("mobile_number") or comm.get("phone_number")


def _extract_phone_landline(patient_person: dict) -> str | None:
    """Festnetz-Nummer separat wenn vorhanden (um beide anzuzeigen)."""
    comm = patient_person.get("communication") or {}
    mobile = comm.get("mobile_number")
    landline = comm.get("phone_number")
    # Nur zurückgeben wenn's ne eigene Nummer ist (nicht gleich mobile)
    if landline and landline != mobile:
        return landline
    return None


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
        "phone_landline": _extract_phone_landline(patient_person),
        "birthday": _extract_birthday(patient_person),
        "care_degree": care_degree_raw,
        "care_degree_int": _parse_care_degree(care_degree_raw),
        "insurance_number": patient.get("insurance_number"),
        "insurance_company_name": None,  # wird später enriched
        "_insurance_company_id": patient.get("insurance_company_id"),
        "active": bool(patient.get("active")),
        "is_primary": bool(item.get("is_primary")),
        "started_at": item.get("started_at"),
    }


def _enrich_patient(
    client: PattiClient,
    mapped: dict,
    insurance_cache: dict[int, str | None],
) -> dict:
    """Lädt Telefon (GET /people/{id}) und Krankenkassen-Name
    (GET /companies/{id}) nach.

    insurance_cache wird zwischen Patienten wiederverwendet damit bei N
    Patienten die zur selben Kasse gehören nur 1 API-Call nötig ist.
    """
    # Phone
    person_id = mapped.pop("_patti_person_id", None)
    if person_id:
        try:
            person = client.get_person(person_id)
            comm = person.get("communication") or {}
            mobile = comm.get("mobile_number")
            landline = comm.get("phone_number")
            mapped["phone"] = mobile or landline
            mapped["phone_landline"] = (
                landline if landline and landline != mobile else None
            )
        except Exception:  # noqa: BLE001
            pass

    # Insurance company name
    ins_id = mapped.pop("_insurance_company_id", None)
    if ins_id:
        if ins_id in insurance_cache:
            mapped["insurance_company_name"] = insurance_cache[ins_id]
        else:
            try:
                company = client.get_company(ins_id)
                name = company.get("name") or company.get("list_name")
                insurance_cache[ins_id] = name
                mapped["insurance_company_name"] = name
            except Exception:  # noqa: BLE001
                insurance_cache[ins_id] = None

    return mapped


def get_mobile_patients_for_person(person_id: int) -> list[dict]:
    client = PattiClient()
    client.login()

    response = client.get_service_histories_by_person_id(person_id)
    rows = response.get("data", []) if isinstance(response, dict) else []

    insurance_cache: dict[int, str | None] = {}
    result: list[dict] = []

    for item in rows:
        patient = item.get("patient") or {}

        if not item.get("is_primary"):
            continue
        if item.get("ended_at") is not None:
            continue
        if not patient.get("active"):
            continue

        mapped = map_service_history_to_mobile_patient(item)
        mapped["_patti_person_id"] = (
            item.get("patient_person") or {}
        ).get("id")
        result.append(_enrich_patient(client, mapped, insurance_cache))

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

            mobile = comm.get("mobile_number")
            landline = comm.get("phone_number")
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
                "phone": mobile or landline,
                "phone_landline": landline if landline and landline != mobile else None,
                "birthday": (person.get("born_at") or "").split("T")[0] or None,
                "care_degree": patient.get("care_degree"),
                "care_degree_int": _parse_care_degree(patient.get("care_degree")),
                "insurance_number": patient.get("insurance_number"),
                "insurance_company_name": None,
                "_insurance_company_id": patient.get("insurance_company_id"),
                "_patti_person_id": person.get("id"),
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
                    "phone_landline": None,
                    "birthday": None,
                    "care_degree": patient.get("care_degree"),
                    "care_degree_int": _parse_care_degree(
                        patient.get("care_degree")
                    ),
                    "insurance_number": patient.get("insurance_number"),
                    "insurance_company_name": None,
                    "_insurance_company_id": patient.get(
                        "insurance_company_id"
                    ),
                    "_patti_person_id": None,
                    "active": bool(patient.get("active")),
                    "is_primary": False,
                    "started_at": None,
                }
    except Exception:  # noqa: BLE001
        pass

    # Enrichment: phone + insurance-company-name for each result
    insurance_cache: dict[int, str | None] = {}
    enriched = [
        _enrich_patient(client, mapped, insurance_cache)
        for mapped in list(results.values())[:limit]
    ]
    return enriched


def get_caretaker_history(patient_id: int) -> list[CaretakerHistoryEntry]:
    """Liefert alle Betreuungs-Einsätze für einen Patienten aus Patti,
    sortiert nach Start-Datum absteigend. Aktive Einträge (ended_at=None)
    zuerst, dann vergangene chronologisch rückwärts.
    """
    client = PattiClient()
    client.login()

    response = client.get_service_histories_for_patient(patient_id)
    rows = response.get("data", []) if isinstance(response, dict) else []

    entries: list[CaretakerHistoryEntry] = []
    for row in rows:
        person = row.get("person") or {}
        name = (
            person.get("list_name")
            or f"{person.get('first_name') or ''} {person.get('last_name') or ''}".strip()
            or f"Person #{row.get('person_id')}"
        )
        started = row.get("started_at")
        ended = row.get("ended_at")
        entries.append(
            CaretakerHistoryEntry(
                person_id=row.get("person_id") or 0,
                name=name,
                is_primary=bool(row.get("is_primary")),
                started_at=started.split("T")[0] if isinstance(started, str) else None,
                ended_at=ended.split("T")[0] if isinstance(ended, str) else None,
            )
        )

    # Sortierung: aktiv zuerst, dann chronologisch rückwärts nach Start
    entries.sort(
        key=lambda e: (
            0 if e.ended_at is None else 1,
            -_date_sort_key(e.started_at),
        )
    )
    return entries


def _date_sort_key(iso_date: str | None) -> int:
    """Für sortby – gibt eine Integer-Repräsentation zurück (YYYYMMDD) oder 0."""
    if not iso_date:
        return 0
    try:
        return int(iso_date.replace("-", ""))
    except ValueError:
        return 0


def update_patient_data(
    patient_id: int,
    *,
    user: User,
    phone: str | None = None,
    phone_landline: str | None = None,
    insurance_number: str | None = None,
    birthday: str | None = None,
) -> None:
    """Partial update of patient stammdaten, written back to Patti.

    Caretaker muss diesem Patienten zugeordnet sein (primary OR substitute via
    global search). Wir checken das nicht hart – jeder angemeldete User der
    den Patienten sehen kann darf auch Stammdaten ergänzen (fehlt→nachtragen
    ist explizit der Use-Case).

    Je nach welche Felder gesetzt sind rufen wir 1-3 Patti-Endpoints auf:
    - phone / phone_landline    → PUT /communications/{communication_id}
    - insurance_number          → PUT /patients/{patient_id}
    - birthday                  → PUT /people/{person_id}
    """
    if not user.patti_person_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User ist keiner Patti-Person zugeordnet",
        )

    client = PattiClient()
    client.login()

    # Need person + patient references to know which communication_id and
    # person_id to address.
    patient = client.get_patient(patient_id)
    person_id = patient.get("id")  # in Patti, patient_id == person_id for the patient
    # Load the person to get communication_id + current name/born_at
    person = client.get_person(person_id)
    communication_id = person.get("communication_id")

    # --- phone updates ---
    if phone is not None or phone_landline is not None:
        if communication_id:
            # Fetch current comm to preserve fields we are not updating
            current_comm = person.get("communication") or {}
            new_mobile = phone if phone is not None else current_comm.get("mobile_number")
            new_landline = (
                phone_landline
                if phone_landline is not None
                else current_comm.get("phone_number")
            )
            client.update_communication(
                communication_id,
                mobile_number=new_mobile or None,
                phone_number=new_landline or None,
                email=current_comm.get("email"),
            )

    # --- insurance_number update ---
    if insurance_number is not None:
        client.update_patient(
            patient_id,
            insurance_number=insurance_number or None,
            insurance_company_id=patient.get("insurance_company_id"),
            care_degree=patient.get("care_degree"),
            care_degree_since=patient.get("care_degree_since"),
            active=patient.get("active"),
        )

    # --- birthday update ---
    if birthday is not None:
        client.update_person(
            person_id,
            first_name=person.get("first_name") or "",
            last_name=person.get("last_name") or "",
            born_at=birthday or None,
        )


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
