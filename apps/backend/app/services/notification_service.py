"""Notification creation helpers.

Aktuell Poll-only — das Mobile fragt /mobile/notifications regelmäßig ab.
Die gleichen Rows können später von einem Push-Worker an APNs/FCM
weitergereicht werden (delivered_at ist noch leer).
"""

from datetime import datetime

from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.user import User
from app.services.push_service import send_push


def create_notification(
    db: Session,
    *,
    user_id: int,
    kind: str,
    title: str,
    body: str | None = None,
    related_patient_id: int | None = None,
    related_entity_id: int | None = None,
) -> Notification:
    n = Notification(
        user_id=user_id,
        kind=kind,
        title=title,
        body=body,
        related_patient_id=related_patient_id,
        related_entity_id=related_entity_id,
    )
    db.add(n)
    db.flush()
    send_push(
        db,
        user_id=user_id,
        title=title,
        body=body or "",
        data={
            "kind": kind,
            "notification_id": n.id,
            "patient_id": related_patient_id,
        },
    )
    return n


def notify_all_admins(
    db: Session,
    *,
    kind: str,
    title: str,
    body: str | None = None,
    related_patient_id: int | None = None,
    related_entity_id: int | None = None,
    subject_user_id: int | None = None,
) -> int:
    """Legt für jeden Admin + Büromitarbeiter eine Notification an.
    Büromitarbeiter wollen dieselben operativen Ereignisse (Urlaub,
    Krankmeldung, HR-Request) sehen wie die Admins.

    Wenn ``subject_user_id`` gesetzt ist (= der User, um den es geht,
    z.B. derjenige der Urlaub beantragt), wird zusätzlich dessen
    Standortleiter benachrichtigt (sofern zugeordnet).
    """
    admins = (
        db.query(User)
        .filter(User.role.in_(["admin", "buero"]))
        .all()
    )
    notified_ids: set[int] = set()
    for admin in admins:
        create_notification(
            db,
            user_id=admin.id,
            kind=kind,
            title=title,
            body=body,
            related_patient_id=related_patient_id,
            related_entity_id=related_entity_id,
        )
        notified_ids.add(admin.id)

    # Standortleiter des betreffenden Users benachrichtigen
    if subject_user_id is not None:
        subject_user = db.query(User).filter(User.id == subject_user_id).first()
        if (
            subject_user is not None
            and subject_user.site_leader_id is not None
            and subject_user.site_leader_id not in notified_ids
        ):
            create_notification(
                db,
                user_id=subject_user.site_leader_id,
                kind=kind,
                title=title,
                body=body,
                related_patient_id=related_patient_id,
                related_entity_id=related_entity_id,
            )
            notified_ids.add(subject_user.site_leader_id)

    return len(notified_ids)


def list_user_notifications(
    db: Session, *, user_id: int, limit: int = 50
) -> list[Notification]:
    return (
        db.query(Notification)
        .filter(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .all()
    )


def count_unread(db: Session, *, user_id: int) -> int:
    return (
        db.query(Notification)
        .filter(
            Notification.user_id == user_id,
            Notification.read_at.is_(None),
        )
        .count()
    )


def mark_read(db: Session, *, user_id: int, notification_id: int) -> bool:
    n = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        )
        .first()
    )
    if n is None:
        return False
    if n.read_at is None:
        n.read_at = datetime.utcnow()
        db.flush()
    return True


def mark_all_read(db: Session, *, user_id: int) -> int:
    now = datetime.utcnow()
    updated = (
        db.query(Notification)
        .filter(
            Notification.user_id == user_id,
            Notification.read_at.is_(None),
        )
        .update({Notification.read_at: now}, synchronize_session=False)
    )
    db.flush()
    return int(updated)
