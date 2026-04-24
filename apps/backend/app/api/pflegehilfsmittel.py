"""API endpoints for Pflegehilfsmittel module."""

from __future__ import annotations

import os
from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import get_current_user, require_office_user
from app.db.session import get_db
from app.models.pflegehm_patient import PflegehmPatient
from app.models.pflegehm_settings import PflegehmSettings
from app.models.user import User
from app.services import pflegehm_service as svc
from app.services.pflegehm_edifact import build_edifact
from app.services.pflegehm_email import send_abrechnung_email
from app.services.pflegehm_pdf import (
    generate_pflegeantrag_pdf,
    generate_unterschrift_pdf,
    make_invoice_pdf_from_abrechnung,
)

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
    pflegehm_patient_id: int | None = None


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
    pflegehm_patient_id: int | None = None
    created_by_user_id: int | None = None
    created_at: datetime | None = None
    positionen: list[PositionResponse] = []

    class Config:
        from_attributes = True


class ConfigPayload(BaseModel):
    ik: str | None = None
    abrechnungscode: str | None = None
    tarifkennzeichen: str | None = None
    verfahrenskennung: str | None = None
    smtp_server: str | None = None
    smtp_port: int | None = None
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_use_tls: bool | None = None
    email_absender: str | None = None
    ust_pflichtig: bool | None = None
    ust_satz: float | None = None
    firma_name: str | None = None
    firma_address: str | None = None
    firma_phone: str | None = None
    firma_email: str | None = None
    kontakt_person: str | None = None
    kontakt_telefon: str | None = None
    kontakt_fax: str | None = None
    bank_name: str | None = None
    bank_iban: str | None = None
    bank_bic: str | None = None


class PatientCreate(BaseModel):
    name: str
    versichertennummer: str
    geburtsdatum: str | None = None
    address: str | None = None
    kasse_id: int | None = None


class PatientUpdate(BaseModel):
    name: str | None = None
    versichertennummer: str | None = None
    geburtsdatum: str | None = None
    address: str | None = None
    kasse_id: int | None = None


class PatientResponse(BaseModel):
    id: int
    name: str
    versichertennummer: str
    geburtsdatum: str | None = None
    address: str | None = None
    kasse_id: int | None = None
    kasse_name: str | None = None
    unterschriebener_antrag: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_settings(db: Session) -> PflegehmSettings:
    """Get or create the singleton PflegehmSettings row."""
    settings = db.get(PflegehmSettings, 1)
    if not settings:
        settings = PflegehmSettings(id=1)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def _settings_to_dict(s: PflegehmSettings) -> dict[str, Any]:
    """Convert settings model to a dict for the API response and internal use."""
    return {
        "ik": s.ik,
        "abrechnungscode": s.abrechnungscode,
        "tarifkennzeichen": s.tarifkennzeichen,
        "verfahrenskennung": s.verfahrenskennung,
        "smtp_server": s.smtp_server,
        "smtp_port": s.smtp_port,
        "smtp_user": s.smtp_user,
        "smtp_password": "***" if s.smtp_password else None,
        "smtp_use_tls": s.smtp_use_tls,
        "email_absender": s.email_absender,
        "ust_pflichtig": s.ust_pflichtig,
        "ust_satz": s.ust_satz,
        "firma_name": s.firma_name,
        "firma_address": s.firma_address,
        "firma_phone": s.firma_phone,
        "firma_email": s.firma_email,
        "kontakt_person": s.kontakt_person,
        "kontakt_telefon": s.kontakt_telefon,
        "kontakt_fax": s.kontakt_fax,
        "bank_name": s.bank_name,
        "bank_iban": s.bank_iban,
        "bank_bic": s.bank_bic,
    }


def _settings_to_cfg(s: PflegehmSettings) -> dict[str, Any]:
    """Convert settings model to cfg dict for EDIFACT/PDF."""
    return {
        "ik": s.ik or "000000000",
        "name": s.firma_name or "",
        "strasse": "",
        "plz": "",
        "ort": s.firma_address or "",
        "kontakt_telefon": s.firma_phone or s.kontakt_telefon or "",
        "kontakt_person": s.kontakt_person or "",
        "kontakt_fax": s.kontakt_fax or "",
        "email_absender": s.email_absender or "",
        "abrechnungscode": s.abrechnungscode or "",
        "tarifkennzeichen": s.tarifkennzeichen or "",
        "ust_satz": str(s.ust_satz or "19"),
        "bank_name": s.bank_name or "",
        "bank_iban": s.bank_iban or "",
        "bank_bic": s.bank_bic or "",
    }


def _patient_to_response(p: PflegehmPatient) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "versichertennummer": p.versichertennummer,
        "geburtsdatum": p.geburtsdatum.isoformat() if p.geburtsdatum else None,
        "address": p.address,
        "kasse_id": p.kasse_id,
        "kasse_name": p.kasse.name if p.kasse else None,
        "unterschriebener_antrag": p.unterschriebener_antrag,
        "created_at": p.created_at,
        "updated_at": p.updated_at,
    }


def _parse_date(s: str | None) -> date | None:
    if not s:
        return None
    s = s.strip()
    for fmt in ("%Y-%m-%d", "%d.%m.%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


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
        "pflegehm_patient_id": getattr(abr, "pflegehm_patient_id", None),
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


# --- Pflegehm Patients (separate from Patti patients) ---

@admin_router.get("/pflegehilfsmittel/patients")
def list_pflegehm_patients(
    db: Session = Depends(get_db),
    user: User = Depends(require_office_user),
):
    from sqlalchemy import select
    from sqlalchemy.orm import joinedload

    stmt = (
        select(PflegehmPatient)
        .options(joinedload(PflegehmPatient.kasse))
        .order_by(PflegehmPatient.name)
    )
    patients = list(db.execute(stmt).unique().scalars().all())
    return [_patient_to_response(p) for p in patients]


@admin_router.post("/pflegehilfsmittel/patients")
def create_pflegehm_patient(
    payload: PatientCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_office_user),
):
    patient = PflegehmPatient(
        name=payload.name,
        versichertennummer=payload.versichertennummer,
        geburtsdatum=_parse_date(payload.geburtsdatum),
        address=payload.address,
        kasse_id=payload.kasse_id,
    )
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return _patient_to_response(patient)


@admin_router.put("/pflegehilfsmittel/patients/{patient_id}")
def update_pflegehm_patient(
    patient_id: int,
    payload: PatientUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_office_user),
):
    patient = db.get(PflegehmPatient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient nicht gefunden")

    data = payload.model_dump(exclude_unset=True)
    if "geburtsdatum" in data:
        data["geburtsdatum"] = _parse_date(data["geburtsdatum"])
    for key, value in data.items():
        setattr(patient, key, value)

    db.commit()
    db.refresh(patient)
    return _patient_to_response(patient)


@admin_router.delete("/pflegehilfsmittel/patients/{patient_id}")
def delete_pflegehm_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_office_user),
):
    patient = db.get(PflegehmPatient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient nicht gefunden")
    db.delete(patient)
    db.commit()
    return {"ok": True}


@admin_router.post("/pflegehilfsmittel/patients/{patient_id}/antrag-upload")
async def upload_antrag(
    patient_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_office_user),
):
    """Upload a signed Pflegeantrag PDF for a patient."""
    patient = db.get(PflegehmPatient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient nicht gefunden")

    content_type = (file.content_type or "").lower()
    filename_lower = (file.filename or "").lower()
    if "pdf" not in content_type and not filename_lower.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Bitte eine PDF-Datei hochladen.")

    # Store in static/pflegehm/uploads/<patient_id>/
    upload_dir = (
        os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        + f"/app/static/pflegehm/uploads/{patient_id}"
    )
    # Use absolute path relative to app
    from pathlib import Path as P
    base = P(__file__).resolve().parent.parent / "static" / "pflegehm" / "uploads" / str(patient_id)
    base.mkdir(parents=True, exist_ok=True)
    target = base / "Unterschriebener_Antrag.pdf"

    data = await file.read()
    target.write_bytes(data)

    patient.unterschriebener_antrag = str(target)
    db.commit()
    db.refresh(patient)
    return {"ok": True, "path": str(target)}


@admin_router.get("/pflegehilfsmittel/patients/{patient_id}/pflegeantrag.pdf")
def get_pflegeantrag_pdf(
    patient_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_office_user),
):
    """Generate and return a Pflegeantrag PDF for the given patient."""
    from sqlalchemy.orm import joinedload

    patient = db.get(PflegehmPatient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient nicht gefunden")

    # Ensure kasse is loaded
    if patient.kasse_id and not patient.kasse:
        from sqlalchemy import select
        stmt = select(PflegehmPatient).options(
            joinedload(PflegehmPatient.kasse)
        ).where(PflegehmPatient.id == patient_id)
        patient = db.execute(stmt).unique().scalar_one()

    pdf_buf = generate_pflegeantrag_pdf(patient)
    return Response(
        content=pdf_buf.read(),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"inline; filename=pflegeantrag_{patient_id}.pdf"
        },
    )


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
        pflegehm_patient_id=payload.pflegehm_patient_id,
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
    settings = _get_settings(db)
    cfg = _settings_to_cfg(settings)
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
    settings = _get_settings(db)
    cfg = _settings_to_cfg(settings)
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

    settings = _get_settings(db)
    cfg = _settings_to_cfg(settings)

    # Build EDIFACT
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

    # Validate SMTP config
    if not settings.smtp_server or not settings.email_absender:
        raise HTTPException(
            status_code=422,
            detail="SMTP-Server oder Absender-Email nicht konfiguriert. Bitte Einstellungen pruefen.",
        )

    # Real email sending
    try:
        send_abrechnung_email(
            settings=settings,
            edifact_data=edifact_data,
            empfaenger_email=kasse.annahmestelle_email,
            empfaenger_ik=kasse.annahmestelle_ik or kasse.ik,
            abrechnung_id=abr.id,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Email-Versand fehlgeschlagen: {str(e)}",
        )

    # Mark as sent
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


# --- Config (DB-backed via PflegehmSettings) ---

@admin_router.get("/pflegehilfsmittel/config")
def get_config(
    db: Session = Depends(get_db),
    user: User = Depends(require_office_user),
):
    settings = _get_settings(db)
    return _settings_to_dict(settings)


@admin_router.post("/pflegehilfsmittel/config")
def save_config(
    payload: ConfigPayload,
    db: Session = Depends(get_db),
    user: User = Depends(require_office_user),
):
    settings = _get_settings(db)
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        if hasattr(settings, key):
            setattr(settings, key, value)
    db.commit()
    db.refresh(settings)
    return _settings_to_dict(settings)


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
