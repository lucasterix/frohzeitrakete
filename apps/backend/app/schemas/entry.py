from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator


class TripInputSchema(BaseModel):
    """Trip info that the mobile app can optionally send with an entry."""
    start_from_home: bool = True
    start_address: str | None = None
    intermediate_stops: list[str] = Field(default_factory=list)


class EntryCreate(BaseModel):
    # Optional für non-patient Einsätze (office/training/home_commute)
    patient_id: int | None = None
    entry_date: date
    hours: float = Field(ge=0, le=8.0)
    activities: list[str] = Field(default_factory=list)
    note: str | None = None
    trip: TripInputSchema | None = None
    # patient (default) | office | training | other | home_commute
    entry_type: str = Field(
        default="patient",
        pattern="^(patient|office|training|other|home_commute)$",
    )
    category_label: str | None = None
    # Nur für home_commute: Start-Adresse (Patienten-Adresse oder frei).
    # Das Ziel ist immer die Home-Adresse des Users.
    home_commute_start_address: str | None = None

    @field_validator("hours")
    @classmethod
    def hours_must_be_half_step(cls, v: float) -> float:
        # 0.5er Schritte: v muss vielfaches von 0.5 sein (mit kleinem Float-Puffer)
        if abs((v * 2) - round(v * 2)) > 1e-9:
            raise ValueError("hours muss in 0.5-Schritten angegeben werden")
        return v

    @field_validator("entry_date")
    @classmethod
    def entry_date_must_be_today(cls, v: date) -> date:
        if v != date.today():
            raise ValueError(
                "Einsätze können nur am Einsatztag selbst erfasst werden. "
                "Nachträgliche Einträge oder Einträge für die Zukunft sind "
                "nicht möglich."
            )
        return v


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
