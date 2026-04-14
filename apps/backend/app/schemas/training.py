from datetime import datetime

from pydantic import BaseModel, Field


class TrainingCreate(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    description: str | None = None
    location: str | None = Field(default=None, max_length=255)
    starts_at: datetime
    ends_at: datetime | None = None


class TrainingResponse(BaseModel):
    id: int
    title: str
    description: str | None
    location: str | None
    starts_at: datetime
    ends_at: datetime | None
    created_by_user_id: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
