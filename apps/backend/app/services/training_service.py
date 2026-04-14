from datetime import datetime

from sqlalchemy.orm import Session

from app.models.training import Training
from app.models.user import User
from app.services.notification_service import create_notification


def create_training(
    db: Session,
    *,
    created_by_user_id: int,
    title: str,
    description: str | None,
    location: str | None,
    starts_at: datetime,
    ends_at: datetime | None,
) -> Training:
    training = Training(
        title=title,
        description=description,
        location=location,
        starts_at=starts_at,
        ends_at=ends_at,
        created_by_user_id=created_by_user_id,
    )
    db.add(training)
    db.commit()
    db.refresh(training)

    # Alle Betreuer benachrichtigen, damit die Fortbildung sofort im Home-
    # Feed und in den Notifications auftaucht.
    caretakers = (
        db.query(User).filter(User.role == "caretaker", User.is_active.is_(True))
    ).all()
    for user in caretakers:
        create_notification(
            db,
            user_id=user.id,
            kind="training_new",
            title="Neue Fortbildung",
            body=f"{title} – {starts_at.strftime('%d.%m.%Y %H:%M')}",
            related_entity_id=training.id,
        )
    db.commit()

    return training


def list_trainings(
    db: Session, *, upcoming_only: bool = False, limit: int = 100
) -> list[Training]:
    q = db.query(Training)
    if upcoming_only:
        q = q.filter(Training.starts_at >= datetime.utcnow())
    return q.order_by(Training.starts_at.asc()).limit(limit).all()


def delete_training(db: Session, *, training_id: int) -> bool:
    training = (
        db.query(Training).filter(Training.id == training_id).first()
    )
    if training is None:
        return False
    db.delete(training)
    db.commit()
    return True
