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


# MobilePatient lives in schemas/patient.py now (with additional fields for
# care_degree_int and insurance_number). This stub is kept to avoid breaking
# old imports but should not be used.