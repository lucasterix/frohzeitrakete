from datetime import datetime

from pydantic import BaseModel, Field


class PatientIntakeCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    # Telefonnummer ist Pflicht — das Büro muss den neu angemeldeten
    # Patienten erreichen können bevor er in Patti angelegt wird.
    phone: str = Field(min_length=3, max_length=100)
    birthdate: str | None = Field(default=None, max_length=20)
    address: str | None = Field(default=None, max_length=500)
    contact_person: str | None = Field(default=None, max_length=255)
    care_level: str | None = Field(default=None, max_length=30)
    note: str | None = None


class PatientIntakeResponse(BaseModel):
    id: int
    requested_by_user_id: int | None
    full_name: str
    birthdate: str | None
    address: str | None
    phone: str | None
    contact_person: str | None
    care_level: str | None
    note: str | None
    status: str
    handled_by_user_id: int | None
    handled_at: datetime | None
    patti_patient_id: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PatientIntakeResolve(BaseModel):
    patti_patient_id: int | None = None
    status: str = Field(default="done", pattern="^(done|rejected)$")
