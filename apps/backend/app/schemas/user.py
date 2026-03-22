from pydantic import BaseModel, EmailStr


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: str
    is_active: bool = True
    patti_person_id: int | None = None


class UserUpdate(BaseModel):
    email: EmailStr
    full_name: str
    role: str
    is_active: bool
    patti_person_id: int | None = None
    password: str | None = None


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    role: str
    is_active: bool
    patti_person_id: int | None = None

    class Config:
        from_attributes = True


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