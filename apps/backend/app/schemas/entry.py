from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator, model_validator


class TripInputSchema(BaseModel):
    """Trip info that the mobile app can optionally send with an entry."""
    start_from_home: bool = True
    start_address: str | None = None
    intermediate_stops: list[str] = Field(default_factory=list)


class EntryCreate(BaseModel):
    patient_id: int | None = None
    entry_date: date
    hours: float = Field(ge=0, le=8.0)
    activities: list[str] = Field(default_factory=list)
    note: str | None = None
    trip: TripInputSchema | None = None
    entry_type: str = Field(
        default="patient",
        pattern="^(patient|office|training|other|home_commute|sick)$",
    )
    category_label: str | None = None
    home_commute_start_address: str | None = None
    # Nachträgliche Erfassung: wenn entry_date in der Vergangenheit
    # liegt MUSS eine Begründung angegeben werden warum die Erfassung
    # nicht am selben Tag stattfand. Max 14 Tage zurück.
    late_entry_reason: str | None = None

    @field_validator("hours")
    @classmethod
    def hours_must_be_half_step(cls, v: float) -> float:
        if abs((v * 2) - round(v * 2)) > 1e-9:
            raise ValueError("hours muss in 0.5-Schritten angegeben werden")
        return v

    @model_validator(mode="after")
    def entry_date_rules(self) -> "EntryCreate":
        today = date.today()
        if self.entry_date == today:
            return self
        if self.entry_date > today:
            raise ValueError("entry_date darf nicht in der Zukunft liegen")
        days_ago = (today - self.entry_date).days
        if days_ago > 14:
            raise ValueError(
                "Nachträgliche Erfassung nur bis zu 14 Tage in die "
                "Vergangenheit möglich"
            )
        if not self.late_entry_reason or len(self.late_entry_reason.strip()) < 10:
            raise ValueError(
                "Bei nachträglicher Erfassung ist eine Begründung "
                "(mind. 10 Zeichen) erforderlich"
            )
        return self

    @model_validator(mode="after")
    def patient_entries_need_activity(self) -> "EntryCreate":
        if self.entry_type == "patient":
            non_empty = [a for a in (self.activities or []) if a.strip()]
            if not non_empty:
                raise ValueError(
                    "Patient-Einsätze brauchen mindestens eine Tätigkeit."
                )
        return self


class EntryUpdate(BaseModel):
    hours: float | None = Field(default=None, gt=0, le=8.0)
    activities: list[str] | None = None
    note: str | None = None

    @field_validator("hours")
    @classmethod
    def hours_must_be_half_step(cls, v: float | None) -> float | None:
        if v is None:
            return v
        if abs((v * 2) - round(v * 2)) > 1e-9:
            raise ValueError("hours muss in 0.5-Schritten angegeben werden")
        if v < 0.5:
            raise ValueError("hours muss mindestens 0.5 sein")
        return v


class EntryResponse(BaseModel):
    id: int
    user_id: int
    user_name: str | None = None
    patient_id: int | None = None
    entry_type: str = "patient"
    category_label: str | None = None
    entry_date: date
    hours: float
    activities: list[str]
    note: str | None
    signature_event_id: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_entry(cls, entry, user_name: str | None = None) -> "EntryResponse":
        return cls(
            id=entry.id,
            user_id=entry.user_id,
            user_name=user_name,
            patient_id=entry.patient_id,
            entry_type=entry.entry_type or "patient",
            category_label=entry.category_label,
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
