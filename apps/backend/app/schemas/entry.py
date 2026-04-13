from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator


class EntryCreate(BaseModel):
    patient_id: int
    entry_date: date
    hours: float = Field(gt=0, le=8.0)
    activities: list[str] = Field(default_factory=list)
    note: str | None = None

    @field_validator("hours")
    @classmethod
    def hours_must_be_half_step(cls, v: float) -> float:
        # 0.5er Schritte: v muss vielfaches von 0.5 sein (mit kleinem Float-Puffer)
        if abs((v * 2) - round(v * 2)) > 1e-9:
            raise ValueError("hours muss in 0.5-Schritten angegeben werden")
        if v < 0.5:
            raise ValueError("hours muss mindestens 0.5 sein")
        return v

    @field_validator("entry_date")
    @classmethod
    def entry_date_not_in_future(cls, v: date) -> date:
        if v > date.today():
            raise ValueError("entry_date darf nicht in der Zukunft liegen")
        return v


class EntryResponse(BaseModel):
    id: int
    user_id: int
    patient_id: int
    entry_date: date
    hours: float
    activities: list[str]
    note: str | None
    signature_event_id: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_entry(cls, entry) -> "EntryResponse":
        """Helper: Entry ORM hat `activities` als String, wir splitten zu Liste."""
        return cls(
            id=entry.id,
            user_id=entry.user_id,
            patient_id=entry.patient_id,
            entry_date=entry.entry_date,
            hours=entry.hours,
            activities=[a.strip() for a in entry.activities.split(",") if a.strip()]
            if entry.activities
            else [],
            note=entry.note,
            signature_event_id=entry.signature_event_id,
            created_at=entry.created_at,
            updated_at=entry.updated_at,
        )


class PatientHoursSummary(BaseModel):
    patient_id: int
    year: int
    month: int
    used_hours: float
    entries_count: int
    is_locked: bool  # True wenn Leistungsnachweis für diesen Monat schon unterschrieben
