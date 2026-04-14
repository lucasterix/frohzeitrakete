from datetime import datetime

from pydantic import BaseModel, Field

DOCUMENT_TYPE_PATTERN = "^(leistungsnachweis|vp_antrag|pflegeumwandlung|betreuungsvertrag)$"


class MobileSignatureCreate(BaseModel):
    patient_id: int
    document_type: str = Field(pattern=DOCUMENT_TYPE_PATTERN)
    signer_name: str
    info_text_version: str | None = None
    svg_content: str
    width: int | None = None
    height: int | None = None
    note: str | None = None
    signed_at: datetime | None = None  # wenn None → Server-Zeit; nützlich für Offline-Erfassung


class TestSignatureCreate(BaseModel):
    patient_id: int
    document_type: str = Field(pattern=DOCUMENT_TYPE_PATTERN)
    signer_name: str
    info_text_version: str | None = None
    svg_content: str
    width: int | None = None
    height: int | None = None
    note: str | None = None


class SignatureAssetResponse(BaseModel):
    id: int
    svg_content: str
    width: int | None = None
    height: int | None = None

    model_config = {"from_attributes": True}


class SignatureEventResponse(BaseModel):
    id: int
    patient_id: int
    document_type: str
    status: str
    signer_name: str
    info_text_version: str | None = None
    source: str
    note: str | None = None
    created_by_user_id: int | None = None
    signed_at: datetime
    approved_by_kk: bool = False
    approved_at: datetime | None = None
    approved_note: str | None = None
    created_at: datetime
    updated_at: datetime
    asset: SignatureAssetResponse | None = None

    model_config = {"from_attributes": True}


class ActivityFeedItem(BaseModel):
    id: int
    event_type: str
    title: str
    subtitle: str
    created_at: datetime
    signature_event_id: int