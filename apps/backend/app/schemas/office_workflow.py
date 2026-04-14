"""Schemas für den Büro-Workflow (Urlaub / Krank / HR / Announcements).

Alle Anfragen haben einen gemeinsamen Rhythmus:
  1. Betreuer erzeugt per /mobile/...
  2. Admin sieht die Liste per /admin/...
  3. Admin ruft /admin/.../resolve mit Status, Kürzel und Response
  4. Betreuer bekommt eine Notification + sieht die Antwort im Home-Feed
"""

from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.hr_request import HR_REQUEST_CATEGORIES


# ----------------------------------------------------------------------------
# Vacation
# ----------------------------------------------------------------------------


class VacationRequestCreate(BaseModel):
    from_date: date
    to_date: date
    note: str | None = None


class VacationRequestResolve(BaseModel):
    status: str = Field(pattern="^(approved|partially_approved|rejected)$")
    approved_from_date: date | None = None
    approved_to_date: date | None = None
    response_text: str | None = None
    handler_kuerzel: str = Field(min_length=1, max_length=50)


class VacationRequestResponse(BaseModel):
    id: int
    user_id: int
    from_date: date
    to_date: date
    note: str | None
    status: str
    approved_from_date: date | None
    approved_to_date: date | None
    handler_user_id: int | None
    handler_kuerzel: str | None
    handled_at: datetime | None
    response_text: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ----------------------------------------------------------------------------
# Sick leave
# ----------------------------------------------------------------------------


class SickLeaveCreate(BaseModel):
    from_date: date
    to_date: date
    note: str | None = None


class SickLeaveResolve(BaseModel):
    response_text: str | None = None
    handler_kuerzel: str = Field(min_length=1, max_length=50)


class SickLeaveResponse(BaseModel):
    id: int
    user_id: int
    from_date: date
    to_date: date
    note: str | None
    handler_user_id: int | None
    handler_kuerzel: str | None
    acknowledged_at: datetime | None
    response_text: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ----------------------------------------------------------------------------
# HR Request
# ----------------------------------------------------------------------------


class HrRequestCreate(BaseModel):
    category: str = Field(
        pattern="^(" + "|".join(HR_REQUEST_CATEGORIES) + ")$"
    )
    subject: str = Field(min_length=2, max_length=255)
    body: str | None = None


class HrRequestResolve(BaseModel):
    status: str = Field(pattern="^(done|rejected)$")
    response_text: str | None = None
    handler_kuerzel: str = Field(min_length=1, max_length=50)


class HrRequestResponse(BaseModel):
    id: int
    user_id: int
    category: str
    subject: str
    body: str | None
    status: str
    handler_user_id: int | None
    handler_kuerzel: str | None
    handled_at: datetime | None
    response_text: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ----------------------------------------------------------------------------
# Announcements
# ----------------------------------------------------------------------------


class AnnouncementCreate(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    body: str
    visible_until: datetime
    visible_from: datetime | None = None


class AnnouncementResponse(BaseModel):
    id: int
    title: str
    body: str
    visible_from: datetime
    visible_until: datetime
    created_by_user_id: int | None
    created_at: datetime

    model_config = {"from_attributes": True}
