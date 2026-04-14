from datetime import datetime

from sqlalchemy.orm import Session

from app.models.patient_intake import PatientIntakeRequest


def create_intake(
    db: Session,
    *,
    requested_by_user_id: int,
    full_name: str,
    birthdate: str | None,
    address: str | None,
    phone: str | None,
    contact_person: str | None,
    care_level: str | None,
    note: str | None,
) -> PatientIntakeRequest:
    intake = PatientIntakeRequest(
        requested_by_user_id=requested_by_user_id,
        full_name=full_name,
        birthdate=birthdate,
        address=address,
        phone=phone,
        contact_person=contact_person,
        care_level=care_level,
        note=note,
        status="open",
    )
    db.add(intake)
    db.commit()
    db.refresh(intake)
    return intake


def list_intakes(
    db: Session, *, status: str | None = None
) -> list[PatientIntakeRequest]:
    q = db.query(PatientIntakeRequest)
    if status:
        q = q.filter(PatientIntakeRequest.status == status)
    return q.order_by(PatientIntakeRequest.created_at.desc()).limit(500).all()


def resolve_intake(
    db: Session,
    *,
    intake_id: int,
    handler_user_id: int,
    status: str,
    patti_patient_id: int | None,
) -> PatientIntakeRequest:
    intake = (
        db.query(PatientIntakeRequest)
        .filter(PatientIntakeRequest.id == intake_id)
        .first()
    )
    if intake is None:
        raise ValueError("intake_not_found")
    intake.status = status
    intake.handled_by_user_id = handler_user_id
    intake.handled_at = datetime.utcnow()
    if patti_patient_id is not None:
        intake.patti_patient_id = patti_patient_id
    db.commit()
    db.refresh(intake)
    return intake
