from datetime import datetime

from pydantic import BaseModel, EmailStr


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: str
    is_active: bool = True
    patti_person_id: int | None = None
    has_company_car: bool = False
    initials: str | None = None


class UserUpdate(BaseModel):
    email: EmailStr
    full_name: str
    role: str
    is_active: bool
    patti_person_id: int | None = None
    has_company_car: bool = False
    initials: str | None = None
    password: str | None = None


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    role: str
    is_active: bool
    patti_person_id: int | None = None
    has_company_car: bool = False
    initials: str | None = None
    overtime_balance_hours: float | None = None
    target_hours_per_week: float | None = None
    target_hours_per_day: float | None = None
    sheets_name_match: str | None = None
    sheets_last_synced_at: datetime | None = None

    class Config:
        from_attributes = True


# MobilePatient lives in schemas/patient.py now (with additional fields for
# care_degree_int and insurance_number). This stub is kept to avoid breaking
# old imports but should not be used.
