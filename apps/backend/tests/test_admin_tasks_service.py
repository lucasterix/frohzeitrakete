from datetime import datetime, timedelta

from app.models.call_request import CallRequest
from app.models.patient_extras import PatientExtras
from app.services.admin_tasks_service import collect_admin_tasks


def test_empty_db_returns_no_tasks(db, monkeypatch):
    # Patti darf beim Test nicht live angerufen werden
    monkeypatch.setattr(
        "app.services.admin_tasks_service.PattiClient", _NoopPatti
    )
    assert collect_admin_tasks(db) == []


def test_open_call_request_becomes_high_priority_task(db, monkeypatch):
    monkeypatch.setattr(
        "app.services.admin_tasks_service.PattiClient", _NoopPatti
    )
    db.add(
        CallRequest(
            patient_id=123,
            requested_by_user_id=None,
            reason="termin",
            note="Verlegung auf nächste Woche",
            status="open",
        )
    )
    db.commit()

    tasks = collect_admin_tasks(db)
    assert len(tasks) == 1
    assert tasks[0]["kind"] == "call_request"
    assert tasks[0]["priority"] == "high"
    assert tasks[0]["patient_id"] == 123
    assert tasks[0]["patient_name"] is not None  # fallback string


def test_missing_contract_flagged(db, monkeypatch):
    monkeypatch.setattr(
        "app.services.admin_tasks_service.PattiClient", _NoopPatti
    )
    db.add(
        PatientExtras(
            patient_id=9,
            contract_signed_at=None,
            emergency_contact_name="Max",
            emergency_contact_phone="0123",
        )
    )
    db.commit()

    tasks = collect_admin_tasks(db)
    kinds = {t["kind"] for t in tasks}
    assert "missing_contract" in kinds
    assert "missing_emergency_contact" not in kinds


def test_sorting_prefers_high_priority(db, monkeypatch):
    monkeypatch.setattr(
        "app.services.admin_tasks_service.PattiClient", _NoopPatti
    )
    db.add_all(
        [
            PatientExtras(
                patient_id=1,
                contract_signed_at=None,  # -> low (missing_contract)
                last_office_call_at=datetime.utcnow(),
                emergency_contact_name="E",
                emergency_contact_phone="1",
            ),
            CallRequest(
                patient_id=2,
                reason="test",
                status="open",
                created_at=datetime.utcnow() - timedelta(days=1),
            ),
        ]
    )
    db.commit()

    tasks = collect_admin_tasks(db)
    # High-priority call_request muss vor low-priority missing_contract stehen
    assert tasks[0]["priority"] == "high"
    assert any(t["priority"] == "low" for t in tasks[1:])


class _NoopPatti:
    """Ersetzt PattiClient im admin_tasks_service, damit Tests offline laufen."""

    def login(self):
        raise RuntimeError("no network in tests")

    def get_patient(self, pid):
        raise RuntimeError("no network in tests")
