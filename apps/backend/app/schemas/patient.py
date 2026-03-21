from pydantic import BaseModel


class MobilePatient(BaseModel):
    service_history_id: int
    patient_id: int
    display_name: str
    first_name: str | None = None
    last_name: str | None = None
    address_line: str | None = None
    city: str | None = None
    care_degree: str | None = None
    active: bool
    is_primary: bool
    started_at: str | None = None