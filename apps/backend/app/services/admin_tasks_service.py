"""Admin-Tasks: Welche Patienten muss das Büro anrufen / kontaktieren?

Aggregates aus mehreren Quellen:
- call_requests (vom Mobile-Betreuer angefragt)
- patient_extras.primary_caretaker_changed_at (neue Zuordnung > 7 Tage her → nachfragen)
- patient_extras.last_office_call_at (letzter Check-Call > 6 Monate her)
- entries: kein Einsatz seit > 2 Monaten → "keine Rechnung" Alert
- patient_extras: fehlender Notfallkontakt
- patient_extras: fehlender Betreuungsvertrag

Rückgabe ist eine flache Liste von AdminTask-Dicts, die der Admin-Web
direkt anzeigen kann.
"""

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.clients.patti_client import PattiClient
from app.models.call_request import CallRequest
from app.models.entry import Entry
from app.models.patient_extras import PatientExtras


CARETAKER_FOLLOWUP_DAYS = 7
CHECK_CALL_MONTHS = 6
NO_ENTRY_MONTHS = 2


def _month_ago(months: int) -> datetime:
    return datetime.utcnow() - timedelta(days=months * 30)


def collect_admin_tasks(db: Session) -> list[dict[str, Any]]:
    tasks: list[dict[str, Any]] = []

    # 1. Offene Call-Requests vom Mobile
    pending_calls = (
        db.query(CallRequest)
        .filter(CallRequest.status == "open")
        .order_by(CallRequest.created_at.asc())
        .all()
    )
    for call in pending_calls:
        tasks.append(
            {
                "kind": "call_request",
                "priority": "high",
                "patient_id": call.patient_id,
                "title": f"Betreuer bittet um Rückruf",
                "subtitle": f"Grund: {call.reason}" + (
                    f" · {call.note}" if call.note else ""
                ),
                "created_at": call.created_at,
                "source_id": call.id,
                "requested_by_user_id": call.requested_by_user_id,
            }
        )

    # 2. Neuer Hauptbetreuer seit > 7 Tagen und noch kein Office-Call danach
    followup_cutoff = datetime.utcnow() - timedelta(
        days=CARETAKER_FOLLOWUP_DAYS
    )
    new_caretaker = (
        db.query(PatientExtras)
        .filter(
            PatientExtras.primary_caretaker_changed_at.is_not(None),
            PatientExtras.primary_caretaker_changed_at <= followup_cutoff,
        )
        .all()
    )
    for extras in new_caretaker:
        last_call = extras.last_office_call_at
        caretaker_changed = extras.primary_caretaker_changed_at
        if last_call is None or (
            caretaker_changed is not None and last_call < caretaker_changed
        ):
            tasks.append(
                {
                    "kind": "new_caretaker_followup",
                    "priority": "medium",
                    "patient_id": extras.patient_id,
                    "title": "Neuer Hauptbetreuer – Check-Anruf",
                    "subtitle": "Läuft alles rund beim neuen Betreuer?",
                    "created_at": extras.primary_caretaker_changed_at,
                    "source_id": extras.id,
                }
            )

    # 3. 6-Monats-Check: letzter Office-Call > 6 Monate her (oder nie)
    cutoff_6mo = _month_ago(CHECK_CALL_MONTHS)
    half_year_due = (
        db.query(PatientExtras)
        .filter(
            (PatientExtras.last_office_call_at.is_(None))
            | (PatientExtras.last_office_call_at < cutoff_6mo)
        )
        .all()
    )
    for extras in half_year_due:
        # Skip wenn wir bereits einen new_caretaker_followup-Task haben
        if any(
            t["patient_id"] == extras.patient_id
            and t["kind"] == "new_caretaker_followup"
            for t in tasks
        ):
            continue
        tasks.append(
            {
                "kind": "half_year_check",
                "priority": "low",
                "patient_id": extras.patient_id,
                "title": "Halbjahres-Check",
                "subtitle": (
                    "Seit >6 Monaten kein Büro-Call"
                    if extras.last_office_call_at is not None
                    else "Noch nie vom Büro angerufen"
                ),
                "created_at": extras.last_office_call_at or extras.created_at,
                "source_id": extras.id,
            }
        )

    # 4. Patienten ohne Einsatz seit > 2 Monaten (aber die uns bekannt sind)
    cutoff_2mo = _month_ago(NO_ENTRY_MONTHS)
    # Alle Patienten mit irgendeinem Eintrag in unserer DB
    max_entry_per_patient = (
        db.query(
            Entry.patient_id,
            func.max(Entry.entry_date).label("last_date"),
        )
        .group_by(Entry.patient_id)
        .all()
    )
    for patient_id, last_date in max_entry_per_patient:
        if last_date is None:
            continue
        if datetime.combine(last_date, datetime.min.time()) < cutoff_2mo:
            tasks.append(
                {
                    "kind": "no_invoice_2_months",
                    "priority": "medium",
                    "patient_id": patient_id,
                    "title": "Seit 2 Monaten kein Einsatz",
                    "subtitle": (
                        f"Letzter Einsatz: {last_date.isoformat()}"
                    ),
                    "created_at": datetime.combine(
                        last_date, datetime.min.time()
                    ),
                    "source_id": None,
                }
            )

    # Notfallkontakt und Betreuungsvertrag sind bewusst NICHT im Admin-
    # Feed: das sind Aufgaben für den Betreuer direkt beim Patienten, die
    # im Mobile erfasst werden. Im Admin-Web würden sie nur Rauschen
    # erzeugen.

    # Patient-Namen best-effort über Patti auflösen, damit das Admin-Web
    # echte Namen statt bloßer IDs zeigen kann. Ein einzelner Patti-Ausfall
    # soll den Task-Feed nicht blockieren.
    patient_ids = {t["patient_id"] for t in tasks if t.get("patient_id")}
    patient_names: dict[int, str] = {}
    if patient_ids:
        try:
            client = PattiClient()
            client.login()
            for pid in patient_ids:
                try:
                    p = client.get_patient(pid)
                    patient_names[pid] = p.get("list_name") or f"Patient {pid}"
                except Exception:  # noqa: BLE001
                    patient_names[pid] = f"Patient {pid}"
        except Exception:  # noqa: BLE001
            patient_names = {pid: f"Patient {pid}" for pid in patient_ids}
    for t in tasks:
        t["patient_name"] = patient_names.get(t.get("patient_id"))

    # Sortieren: high > medium > low, dann nach created_at
    priority_rank = {"high": 0, "medium": 1, "low": 2}
    tasks.sort(
        key=lambda t: (
            priority_rank.get(t["priority"], 3),
            t["created_at"] or datetime.min,
        )
    )
    return tasks
