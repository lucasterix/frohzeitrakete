from app.models.notification import Notification
from app.models.user import User
from app.services.notification_service import (
    count_unread,
    create_notification,
    list_user_notifications,
    mark_all_read,
    mark_read,
    notify_all_admins,
)


def _user(db, *, email: str, role: str) -> User:
    u = User(
        email=email,
        password_hash="x",
        full_name=email,
        role=role,
        is_active=True,
    )
    db.add(u)
    db.flush()
    return u


def test_create_notification_round_trip(db):
    user = _user(db, email="alice@example.invalid", role="caretaker")
    create_notification(
        db,
        user_id=user.id,
        kind="training_new",
        title="Neue Fortbildung",
        body="morgen 10 Uhr",
        related_entity_id=42,
    )
    db.commit()

    rows = list_user_notifications(db, user_id=user.id)
    assert len(rows) == 1
    assert rows[0].title == "Neue Fortbildung"
    assert rows[0].related_entity_id == 42
    assert rows[0].read_at is None


def test_mark_read_and_unread_count(db):
    user = _user(db, email="bob@example.invalid", role="caretaker")
    create_notification(
        db, user_id=user.id, kind="office_message", title="A"
    )
    create_notification(
        db, user_id=user.id, kind="office_message", title="B"
    )
    db.commit()

    assert count_unread(db, user_id=user.id) == 2

    first = (
        db.query(Notification)
        .filter(Notification.user_id == user.id)
        .order_by(Notification.id.asc())
        .first()
    )
    assert first is not None
    ok = mark_read(db, user_id=user.id, notification_id=first.id)
    db.commit()
    assert ok is True
    assert count_unread(db, user_id=user.id) == 1

    updated = mark_all_read(db, user_id=user.id)
    db.commit()
    assert updated == 1
    assert count_unread(db, user_id=user.id) == 0


def test_notify_all_admins_skips_caretakers(db):
    _user(db, email="care@example.invalid", role="caretaker")
    _user(db, email="admin1@example.invalid", role="admin")
    _user(db, email="admin2@example.invalid", role="admin")

    count = notify_all_admins(
        db, kind="call_request_created", title="X"
    )
    db.commit()
    assert count == 2

    admin_count = (
        db.query(Notification).count()
    )
    assert admin_count == 2
