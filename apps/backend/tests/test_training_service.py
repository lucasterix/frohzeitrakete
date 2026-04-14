from datetime import datetime, timedelta

from app.models.notification import Notification
from app.models.user import User
from app.services.training_service import (
    create_training,
    delete_training,
    list_trainings,
)


def _user(db, *, email: str, role: str, active: bool = True) -> User:
    u = User(
        email=email,
        password_hash="x",
        full_name=email,
        role=role,
        is_active=active,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def test_create_training_notifies_active_caretakers_only(db):
    admin = _user(db, email="admin@example.invalid", role="admin")
    _user(db, email="alice@example.invalid", role="caretaker")
    _user(db, email="bob@example.invalid", role="caretaker")
    _user(db, email="carol@example.invalid", role="caretaker", active=False)

    training = create_training(
        db,
        created_by_user_id=admin.id,
        title="Demenz verstehen",
        description="Einstiegsschulung",
        location="Online",
        starts_at=datetime.utcnow() + timedelta(days=7),
        ends_at=None,
    )

    assert training.id is not None
    # Genau 2 Caretaker-Notifications (alice + bob), admin und carol nicht
    notifs = db.query(Notification).all()
    assert len(notifs) == 2
    assert all(n.kind == "training_new" for n in notifs)
    emails = {
        db.query(User).filter(User.id == n.user_id).first().email for n in notifs
    }
    assert emails == {"alice@example.invalid", "bob@example.invalid"}


def test_list_trainings_upcoming_only_filters_past(db):
    admin = _user(db, email="a@example.invalid", role="admin")
    # Kein Caretaker → keine Notification-Side-Effects zu zählen.
    past = create_training(
        db,
        created_by_user_id=admin.id,
        title="Alt",
        description=None,
        location=None,
        starts_at=datetime.utcnow() - timedelta(days=5),
        ends_at=None,
    )
    future = create_training(
        db,
        created_by_user_id=admin.id,
        title="Neu",
        description=None,
        location=None,
        starts_at=datetime.utcnow() + timedelta(days=5),
        ends_at=None,
    )

    all_items = list_trainings(db, upcoming_only=False)
    upcoming = list_trainings(db, upcoming_only=True)

    assert {t.id for t in all_items} == {past.id, future.id}
    assert [t.id for t in upcoming] == [future.id]


def test_delete_training(db):
    admin = _user(db, email="a@example.invalid", role="admin")
    training = create_training(
        db,
        created_by_user_id=admin.id,
        title="Zu löschen",
        description=None,
        location=None,
        starts_at=datetime.utcnow() + timedelta(days=1),
        ends_at=None,
    )
    assert delete_training(db, training_id=training.id) is True
    assert delete_training(db, training_id=9999) is False
    assert list_trainings(db) == []
