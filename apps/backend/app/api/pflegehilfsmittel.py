"""API endpoints for Pflegehilfsmittel module."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import get_current_user, require_office_user
from app.db.session import get_db
from app.models.user import User
from app.services import pflegehm_service as svc
from app.services.pflegehm_edifact import build_edifact
from app.services.pflegehm_pdf import make_invoice_pdf_from_abrechnung

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

admin_router = APIRouter()
mobile_router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic schemas (inline, keep API module self-contained)
# ---------------------------------------------------------------------------

class HilfsmittelResponse(BaseModel):
    id: int
    bezeichnung: str
    positionsnummer: str
    kennzeichen: str
    packungsgroesse: int
    preis_brutto: float

    class Config:
        from_attributes = True


class HilfsmittelUpdate(BaseModel):
    preis_brutto: float | None = None
    packungsgroesse: int | None = None


class KostentraegerResponse(BaseModel):
    id: int
    name: str
    address: str | None = None
    ik: str
    annahmestelle: str | None = None
    annahmestelle_ik: str | None = None
    annahmestelle_email: str | None = None

    class Config:
        from_attributes = True


class PositionInput(BaseModel):
    hilfsmittel_id: int
    menge: int = 1


class AbrechnungCreate(BaseModel):
    patient_id: int
    patient_name: str
    versichertennummer: str
    geburtsdatum: str
    kasse_id: int
    abrechnungsmonat: str  # YYYY-MM
    positionen: list[PositionInput]


class PositionResponse(BaseModel):
    id: int
    hilfsmittel_id: int
    bezeichnung: str | None = None
    menge: int
    einzelpreis: float
    betrag_gesamt: float

    class Config:
        from_attributes = True


class AbrechnungResponse(BaseModel):
    id: int
    patient_id: int
    patient_name: str
    versichertennummer: str
    geburtsdatum: str
    kasse_id: int
    kasse_name: str | None = None
    abrechnungsmonat: str
    gesamt_betrag: float
    status: str
    gesendet_am: datetime | None = None
    storniert_am: datetime | None = None
    signature_event_id: int | None = None
    created_by_user_id: int | None = None
    created_at: datetime | None = None
    positionen: list[PositionResponse] = []

    class Config:
        from_attributes = True


class ConfigPayload(BaseModel):
    ik: str | None = None
    name: str | None = None
    strasse: str | None = None
    plz: str | None = None
    ort: str | None = None
    kontakt_telefon: str | None = None
    kontakt_person: str | None = None
    kontakt_fax: str | None = None
    email_absender: str | None = None
    smtp_server: str | None = None
    smtp_port: int | None = None
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_use_tls: bool | None = None
    abrechnungscode: str | None = None
    tarifkennzeichen: str | None = None
    ust_satz: str | None = None
    bank_name: str | None = None
    bank_iban: str | None = None
    bank_bic: str | None = None


# ---------------------------------------------------------------------------
# In-memory config store (persists for app lifetime; replace with DB later)
# ---------------------------------------------------------------------------

_config_store: dict[str, Any] = {}


def _get_config() -> dict[str, Any]:
    return dict(_config_store)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _abr_to_response(abr: Any) -> dict:
    positionen = []
    for pos in (abr.positionen or []):
        positionen.append({
            "id": pos.id,
            "hilfsmittel_id": pos.hilfsmittel_id,
            "bezeichnung": pos.hilfsmittel.bezeichnung if pos.hilfsmittel else None,
            "menge": pos.menge,
            "einzelpreis": pos.einzelpreis,
            "betrag_gesamt": pos.betrag_gesamt,
        })
    return {
        "id": abr.id,
        "patient_id": abr.patient_id,
        "patient_name": abr.patient_name,
        "versichertennummer": abr.versichertennummer,
        "geburtsdatum": abr.geburtsdatum,
        "kasse_id": abr.kasse_id,
        "kasse_name": abr.kasse.name if abr.kasse else None,
        "abrechnungsmonat": abr.abrechnungsmonat,
        "gesamt_betrag": abr.gesamt_betrag,
        "status": abr.status,
        "gesendet_am": abr.gesendet_am,
        "storniert_am": abr.storniert_am,
        "signature_event_id": abr.signature_event_id,
        "created_by_user_id": abr.created_by_user_id,
        "created_at": abr.created_at,
        "positionen": positionen,
    }


# ===================================================================
# ADMIN ENDPOINTS
# ===================================================================

# --- Hilfsmittel-Katalog ---

@admin_router.get("/pflegehilfsmittel/hilfsmittel", response_model=list[HilfsmittelResponse])
def list_hilfsmittel(
    db: Session = Depends(get_db),
    user: User = Depends(require_office_user),
):
    return svc.list_hilfsmittel(db)


@admin_router.put("/pflegehilfsmittel/hilfsmittel/{hm_id}", response_model=HilfsmittelResponse)
def update_hilfsmittel(
    hm_id: int,
    payload: HilfsmittelUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_office_user),
):
    data = payload.model_dump(exclude_unset=True)
    hm = svc.update_hilfsmittel(db, hm_id, data)
    if not hm:
        raise HTTPException(status_code=404, detail="Hilfsmittel nicht gefunden")
    return hm


# --- Kostentraeger ---

@admin_router.get("/pflegehilfsmittel/kostentraeger", response_model=list[KostentraegerResponse])
def list_kostentraeger(
    db: Session = Depends(get_db),
    user: User = Depends(require_office_user),
):
    return svc.list_kostentraeger(db)


@admin_router.post("/pflegehilfsmittel/kostentraeger/import")
def import_kostentraeger(
    db: Session = Depends(get_db),
    user: User = Depends(require_office_user),
):
    count = svc.import_kostentraeger(db)
    return {"imported": count}


# --- Abrechnungen ---

@admin_router.get("/pflegehilfsmittel/abrechnungen")
def list_abrechnungen(
    status_filter: str | None = Query(None, alias="status"),
    db: Session = Depends(get_db),
    user: User = Depends(require_office_user),
):
    rows = svc.list_abrechnungen(db, status_filter=status_filter)
    return [_abr_to_response(r) for r in rows]


@admin_router.post("/pflegehilfsmittel/abrechnungen")
def create_abrechnung(
    payload: AbrechnungCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_office_user),
):
    abr = svc.create_abrechnung(
        db,
        patient_id=payload.patient_id,
        patient_name=payload.patient_name,
        versichertennr=payload.versichertennummer,
        geburtsdatum=payload.geburtsdatum,
        kasse_id=payload.kasse_id,
        monat=payload.abrechnungsmonat,
        positionen=[p.model_dump() for p in payload.positionen],
        user_id=user.id,
    )
    return _abr_to_response(abr)


@admin_router.get("/pflegehilfsmittel/abrechnungen/{abr_id}")
def get_abrechnung(
    abr_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_office_user),
):
    abr = svc.get_abrechnung(db, abr_id)
    if not abr:
        raise HTTPException(status_code=404, detail="Abrechnung nicht gefunden")
    return _abr_to_response(abr)


@admin_router.get("/pflegehilfsmittel/abrechnungen/{abr_id}/pdf")
def get_abrechnung_pdf(
    abr_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_office_user),
):
    abr = svc.get_abrechnung(db, abr_id)
    if not abr:
        raise HTTPException(status_code=404, detail="Abrechnung nicht gefunden")
    cfg = _get_config()
    pdf_buf = make_invoice_pdf_from_abrechnung(abr, cfg=cfg)
    return Response(
        content=pdf_buf.read(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=rechnung_{abr_id}.pdf"},
    )


@admin_router.get("/pflegehilfsmittel/abrechnungen/{abr_id}/edifact")
def get_abrechnung_edifact(
    abr_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_office_user),
):
    abr = svc.get_abrechnung(db, abr_id)
    if not abr:
        raise HTTPException(status_code=404, detail="Abrechnung nicht gefunden")
    cfg = _get_config()
    try:
        data = build_edifact(abr, cfg=cfg)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return Response(
        content=data,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename=edifact_{abr_id}.edi"},
    )


@admin_router.post("/pflegehilfsmittel/abrechnungen/{abr_id}/send")
def send_abrechnung(
    abr_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_office_user),
):
    abr = svc.get_abrechnung(db, abr_id)
    if not abr:
        raise HTTPException(status_code=404, detail="Abrechnung nicht gefunden")
    if abr.status == "storniert":
        raise HTTPException(status_code=400, detail="Stornierte Abrechnung kann nicht gesendet werden")

    # Build EDIFACT
    cfg = _get_config()
    try:
        edifact_data = build_edifact(abr, cfg=cfg)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Get recipient email from Kostentraeger
    kasse = abr.kasse
    if not kasse or not kasse.annahmestelle_email:
        raise HTTPException(
            status_code=422,
            detail="Keine Annahmestellen-Email fuer den Kostentraeger hinterlegt",
        )

    # For now mark as sent; actual email sending requires SMTP config + AUF generation
    # which is a follow-up task
    abr = svc.mark_gesendet(db, abr_id)
    return _abr_to_response(abr)


@admin_router.post("/pflegehilfsmittel/abrechnungen/{abr_id}/storno")
def storno_abrechnung(
    abr_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_office_user),
):
    abr = svc.storniere_abrechnung(db, abr_id)
    if not abr:
        raise HTTPException(status_code=404, detail="Abrechnung nicht gefunden")
    return _abr_to_response(abr)


# --- Config ---

@admin_router.get("/pflegehilfsmittel/config")
def get_config(
    user: User = Depends(require_office_user),
):
    return _get_config()


@admin_router.post("/pflegehilfsmittel/config")
def save_config(
    payload: ConfigPayload,
    user: User = Depends(require_office_user),
):
    data = payload.model_dump(exclude_unset=True)
    _config_store.update(data)
    return _get_config()


# ===================================================================
# MOBILE ENDPOINTS
# ===================================================================

@mobile_router.get("/patients/{patient_id}/pflegehm-abrechnungen")
def mobile_patient_abrechnungen(
    patient_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = svc.list_abrechnungen(db, patient_id=patient_id)
    return [_abr_to_response(r) for r in rows]
