from pydantic import BaseModel


class MobilePatient(BaseModel):
    """Patient wie er dem Mobile-Client ausgeliefert wird.

    `care_degree_int` kommt als int (1..5) aus "pg1".."pg5" parsed – das
    Mobile-Frontend erwartet einen Integer. `care_degree` bleibt als String
    für Rückwärtskompatibilität.
    """

    service_history_id: int
    patient_id: int
    display_name: str
    first_name: str | None = None
    last_name: str | None = None
    address_line: str | None = None
    city: str | None = None
    postal_code: str | None = None
    phone: str | None = None  # Mobile first, sonst Festnetz
    phone_landline: str | None = None  # Separate Festnetz-Nummer wenn vorhanden
    birthday: str | None = None  # ISO date "YYYY-MM-DD"
    care_degree: str | None = None
    care_degree_int: int = 0
    insurance_number: str | None = None
    insurance_company_name: str | None = None
    active: bool
    is_primary: bool
    started_at: str | None = None


class MobilePatientUpdate(BaseModel):
    """Partial update from mobile app for patient stammdaten.

    Alle Felder optional. Was gesetzt wird, wird in Patti aktualisiert.
    """
    phone: str | None = None  # setzt mobile_number
    phone_landline: str | None = None  # setzt phone_number
    insurance_number: str | None = None
    birthday: str | None = None  # "YYYY-MM-DD"


class CaretakerHistoryEntry(BaseModel):
    """Ein Betreuer-Einsatz aus der Patti service-histories-Liste."""
    person_id: int
    name: str
    is_primary: bool
    started_at: str | None = None
    ended_at: str | None = None  # None = aktuell aktiv


class PatientBudget(BaseModel):
    """Budget-Summary für Mobile: Reststunden Pflegesachleistung + VP."""

    patient_id: int
    year: int

    care_service_remaining_hours: float
    care_service_used_hours: float
    care_service_remaining_money_cents: int

    respite_care_remaining_hours: float
    respite_care_remaining_money_cents: int
