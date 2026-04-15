from datetime import date, datetime, timedelta

import pytest
from fastapi import HTTPException

from app.models.entry import Entry
from app.models.signature_event import SignatureEvent
from app.models.user import User
from app.services.entry_service import (
    delete_entry_for_user,
    update_entry_for_user,
)


def _user(db) -> User:
    u = User(
        email="worker@example.invalid",
        password_hash="x",
        full_name="Worker",
        role="caretaker",
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _office_entry(db, *, user_id: int, hours: float = 2.0) -> Entry:
    e = Entry(
        user_id=user_id,
        patient_id=None,
        entry_type="office",
        entry_date=date.today() - timedelta(days=1),
        hours=hours,
        activities="Teamsitzung",
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


def test_update_entry_changes_hours_and_note(db, monkeypatch):
    # Kein Patti-Call für office-Entries, aber für safety monkey-patchen:
    monkeypatch.setattr(
        "app.services.entry_service.PattiClient", _NoopPatti
    )
    user = _user(db)
    entry = _office_entry(db, user_id=user.id, hours=2.0)

    updated = update_entry_for_user(
        db,
        user,
        entry.id,
        hours=3.5,
        activities=["Teamsitzung", "Planung"],
        note="verlängert",
    )

    assert updated.hours == 3.5
    assert "Planung" in updated.activities
    assert updated.note == "verlängert"


def test_update_entry_rejects_invalid_hours(db, monkeypatch):
    monkeypatch.setattr(
        "app.services.entry_service.PattiClient", _NoopPatti
    )
    user = _user(db)
    entry = _office_entry(db, user_id=user.id)

    with pytest.raises(HTTPException) as exc:
        update_entry_for_user(db, user, entry.id, hours=9.0)
    assert exc.value.status_code == 400


def test_update_entry_blocked_by_signed_month(db, monkeypatch):
    user = _user(db)
    # Patient-Einsatz, da der Lock pro Patient+Monat läuft
    entry = Entry(
        user_id=user.id,
        patient_id=55,
        entry_type="patient",
        entry_date=date.today().replace(day=1),
        hours=2.0,
        activities="",
    )
    db.add(entry)
    # Signatur für denselben Monat → Lock
    db.add(
        SignatureEvent(
            patient_id=55,
            document_type="leistungsnachweis",
            status="captured",
            signer_name="Patient",
            source="mobile",
            signed_at=datetime.utcnow(),
        )
    )
    db.commit()
    db.refresh(entry)

    with pytest.raises(HTTPException) as exc:
        update_entry_for_user(db, user, entry.id, hours=3.0)
    assert exc.value.status_code == 409


def test_delete_entry_removes_row_and_pattis_silently(db, monkeypatch):
    # Track ob Patti-Delete gefeuert wurde, auch wenn es failt muss der
    # DB-Delete durchkommen.
    called = {"count": 0}

    class _CapturingPatti:
        def __init__(self):
            pass

        def login(self):
            pass

        def delete_service_entry(self, patti_id):
            called["count"] += 1

    monkeypatch.setattr(
        "app.services.entry_service.PattiClient", _CapturingPatti
    )
    user = _user(db)
    entry = Entry(
        user_id=user.id,
        patient_id=77,
        entry_type="patient",
        entry_date=date.today() - timedelta(days=5),
        hours=2.0,
        activities="",
        patti_service_entry_id=4242,
    )
    db.add(entry)
    db.commit()
    entry_id = entry.id

    delete_entry_for_user(db, user.id, entry_id)

    assert db.query(Entry).filter(Entry.id == entry_id).first() is None
    assert called["count"] == 1


def test_delete_entry_tolerates_patti_exception(db, monkeypatch):
    class _BrokenPatti:
        def login(self):
            raise RuntimeError("no network")

        def delete_service_entry(self, patti_id):
            raise RuntimeError("no network")

    monkeypatch.setattr(
        "app.services.entry_service.PattiClient", _BrokenPatti
    )
    user = _user(db)
    entry = Entry(
        user_id=user.id,
        patient_id=88,
        entry_type="patient",
        entry_date=date.today() - timedelta(days=3),
        hours=1.5,
        activities="",
        patti_service_entry_id=99,
    )
    db.add(entry)
    db.commit()
    entry_id = entry.id

    # darf nicht werfen
    delete_entry_for_user(db, user.id, entry_id)
    assert db.query(Entry).filter(Entry.id == entry_id).first() is None


class _NoopPatti:
    def login(self):
        pass

    def create_service_entry(self, **kwargs):
        return {"id": None}

    def delete_service_entry(self, patti_id):
        pass
