"""Business logic for PatientExtras (emergency contact, contract state,
caretaker-change tracking, office-call tracking).
"""

from datetime import datetime

from sqlalchemy.orm import Session

from app.models.patient_extras import PatientExtras
from app.models.signature_event import SignatureEvent


def get_or_create_extras(db: Session, patient_id: int) -> PatientExtras:
    extras = (
        db.query(PatientExtras)
        .filter(PatientExtras.patient_id == patient_id)
        .first()
    )
    if extras is None:
        extras = PatientExtras(patient_id=patient_id)
        db.add(extras)
        db.commit()
        db.refresh(extras)
    return extras


def set_emergency_contact(
    db: Session,
    patient_id: int,
    *,
    name: str | None,
    phone: str | None,
) -> PatientExtras:
    extras = get_or_create_extras(db, patient_id)
    extras.emergency_contact_name = (name or "").strip() or None
    extras.emergency_contact_phone = (phone or "").strip() or None
    db.commit()
    db.refresh(extras)
    return extras


def refresh_contract_state(db: Session, patient_id: int) -> PatientExtras:
    """Prüft ob eine Betreuungsvertrag-Signatur existiert und synchronisiert
    das mit dem PatientExtras-Datensatz.

    Wird aufgerufen:
    - Beim Lesen von /mobile/patients/{id}/extras (damit neue Signaturen
      sofort reflektiert sind)
    - Nach erfolgreichem POST /mobile/signatures mit document_type=betreuungsvertrag
    """
    extras = get_or_create_extras(db, patient_id)
    latest = (
        db.query(SignatureEvent)
        .filter(
            SignatureEvent.patient_id == patient_id,
            SignatureEvent.document_type == "betreuungsvertrag",
        )
        .order_by(SignatureEvent.signed_at.desc())
        .first()
    )
    if latest is not None:
        extras.contract_signed_at = latest.signed_at
        extras.contract_signature_event_id = latest.id
    db.commit()
    db.refresh(extras)
    return extras


def mark_office_call_done(db: Session, patient_id: int) -> None:
    extras = get_or_create_extras(db, patient_id)
    extras.last_office_call_at = datetime.utcnow()
    db.commit()


def mark_primary_caretaker_changed(db: Session, patient_id: int) -> None:
    """Vom Admin aufgerufen wenn ein Patient einen neuen Hauptbetreuer bekommt.
    Triggert den "1 Woche später nachfragen"-Task im Admin-Web."""
    extras = get_or_create_extras(db, patient_id)
    extras.primary_caretaker_changed_at = datetime.utcnow()
    db.commit()
