"""Service layer for the office workflow models.

Keeps the endpoint code thin — all business rules live here:
  - Vacation: min 30 days in advance, can be resolved into approved/
    partially_approved/rejected with optional counter-range.
  - Sick leave: ack only, no status flow.
  - HR requests: done/rejected with response text.
  - Announcements: CRUD with a visible-from/until window.

Every resolve also generates a Notification for the caretaker so they
see the response in their Inbox + on the home screen.
"""

from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.models.announcement import Announcement
from app.models.hr_request import HrRequest
from app.models.sick_leave import SickLeave
from app.models.user import User
from app.models.vacation_request import VacationRequest
from app.services.notification_service import create_notification


VACATION_LEAD_TIME_DAYS = 30


def _notify(
    db: Session,
    *,
    user_id: int,
    kind: str,
    title: str,
    body: str | None,
    related_entity_id: int | None,
):
    create_notification(
        db,
        user_id=user_id,
        kind=kind,
        title=title,
        body=body,
        related_entity_id=related_entity_id,
    )


# ----------------------------------------------------------------------------
# Vacation
# ----------------------------------------------------------------------------


class LeadTimeError(ValueError):
    pass


def create_vacation_request(
    db: Session,
    *,
    user_id: int,
    from_date: date,
    to_date: date,
    note: str | None,
) -> VacationRequest:
    if to_date < from_date:
        raise ValueError("to_date_before_from_date")
    # min. 1 Monat Vorlaufzeit
    if from_date < date.today() + timedelta(days=VACATION_LEAD_TIME_DAYS):
        raise LeadTimeError(
            f"Urlaub muss mindestens {VACATION_LEAD_TIME_DAYS} Tage im "
            f"Voraus beantragt werden."
        )
    row = VacationRequest(
        user_id=user_id,
        from_date=from_date,
        to_date=to_date,
        note=note,
        status="open",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_vacation_requests(
    db: Session,
    *,
    user_id: int | None = None,
    status: str | None = None,
) -> list[VacationRequest]:
    q = db.query(VacationRequest)
    if user_id is not None:
        q = q.filter(VacationRequest.user_id == user_id)
    if status:
        q = q.filter(VacationRequest.status == status)
    return q.order_by(VacationRequest.created_at.desc()).limit(500).all()


def resolve_vacation_request(
    db: Session,
    *,
    request_id: int,
    handler_user_id: int,
    handler_kuerzel: str,
    status: str,
    approved_from_date: date | None,
    approved_to_date: date | None,
    response_text: str | None,
) -> VacationRequest:
    row = (
        db.query(VacationRequest)
        .filter(VacationRequest.id == request_id)
        .first()
    )
    if row is None:
        raise ValueError("vacation_request_not_found")
    row.status = status
    row.approved_from_date = approved_from_date
    row.approved_to_date = approved_to_date
    row.handler_user_id = handler_user_id
    row.handler_kuerzel = handler_kuerzel
    row.handled_at = datetime.utcnow()
    row.response_text = response_text
    db.commit()
    db.refresh(row)

    status_label = {
        "approved": "genehmigt",
        "partially_approved": "teilweise genehmigt",
        "rejected": "abgelehnt",
    }.get(status, status)
    _notify(
        db,
        user_id=row.user_id,
        kind="vacation_response",
        title=f"Urlaubsantrag {status_label}",
        body=response_text
        or f"Dein Urlaubsantrag wurde von {handler_kuerzel} {status_label}.",
        related_entity_id=row.id,
    )
    db.commit()
    return row


def is_on_vacation_today(db: Session, *, user_id: int) -> VacationRequest | None:
    today = date.today()
    rows = (
        db.query(VacationRequest)
        .filter(
            VacationRequest.user_id == user_id,
            VacationRequest.status.in_(
                ["approved", "partially_approved"]
            ),
        )
        .all()
    )
    for r in rows:
        start = r.approved_from_date or r.from_date
        end = r.approved_to_date or r.to_date
        if start <= today <= end:
            return r
    return None


# ----------------------------------------------------------------------------
# Sick leave
# ----------------------------------------------------------------------------


def create_sick_leave(
    db: Session,
    *,
    user_id: int,
    from_date: date,
    to_date: date,
    note: str | None,
) -> SickLeave:
    from datetime import timedelta as _td
    from app.models.entry import Entry

    if to_date < from_date:
        raise ValueError("to_date_before_from_date")
    row = SickLeave(
        user_id=user_id,
        from_date=from_date,
        to_date=to_date,
        note=note,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    # Soll-Stunden/Tag aus Sheet-Daten → pro Krank-Tag einen "sick"-
    # Entry anlegen, sodass die Stunden automatisch dem Mitarbeiter
    # angerechnet werden. Wochenenden werden ausgelassen (Soll=0).
    sick_user = db.query(User).filter(User.id == user_id).first()
    if sick_user is not None and sick_user.target_hours_per_day is not None:
        hrs = sick_user.target_hours_per_day
        if hrs and hrs > 0:
            d = from_date
            while d <= to_date:
                if d.weekday() < 5:  # Mo–Fr
                    exists = (
                        db.query(Entry.id)
                        .filter(
                            Entry.user_id == user_id,
                            Entry.entry_date == d,
                            Entry.entry_type == "sick",
                        )
                        .first()
                    )
                    if exists is None:
                        db.add(
                            Entry(
                                user_id=user_id,
                                patient_id=None,
                                entry_type="sick",
                                category_label="Krankmeldung",
                                entry_date=d,
                                hours=hrs,
                                activities="",
                                note=f"Auto-Eintrag aus Krankmeldung #{row.id}",
                            )
                        )
                d += _td(days=1)
            db.commit()

    # Admins benachrichtigen damit die Krankmeldung im Büro-Feed auftaucht
    admins = db.query(User).filter(User.role.in_(["admin", "buero"])).all()
    for a in admins:
        _notify(
            db,
            user_id=a.id,
            kind="sick_leave_created",
            title="Krankmeldung eingegangen",
            body=f"{from_date.isoformat()} – {to_date.isoformat()}",
            related_entity_id=row.id,
        )
    db.commit()
    return row


def list_sick_leaves(
    db: Session,
    *,
    user_id: int | None = None,
    only_open: bool = False,
) -> list[SickLeave]:
    q = db.query(SickLeave)
    if user_id is not None:
        q = q.filter(SickLeave.user_id == user_id)
    if only_open:
        q = q.filter(SickLeave.acknowledged_at.is_(None))
    return q.order_by(SickLeave.created_at.desc()).limit(500).all()


def acknowledge_sick_leave(
    db: Session,
    *,
    sick_leave_id: int,
    handler_user_id: int,
    handler_kuerzel: str,
    response_text: str | None,
) -> SickLeave:
    row = db.query(SickLeave).filter(SickLeave.id == sick_leave_id).first()
    if row is None:
        raise ValueError("sick_leave_not_found")
    row.handler_user_id = handler_user_id
    row.handler_kuerzel = handler_kuerzel
    row.acknowledged_at = datetime.utcnow()
    row.response_text = response_text
    db.commit()
    db.refresh(row)

    _notify(
        db,
        user_id=row.user_id,
        kind="sick_leave_ack",
        title="Krankmeldung bestätigt",
        body=response_text
        or f"Das Büro ({handler_kuerzel}) hat deine Krankmeldung erhalten. "
        "Gute Besserung!",
        related_entity_id=row.id,
    )
    db.commit()
    return row


def is_sick_today(db: Session, *, user_id: int) -> SickLeave | None:
    today = date.today()
    rows = (
        db.query(SickLeave)
        .filter(
            SickLeave.user_id == user_id,
            SickLeave.from_date <= today,
            SickLeave.to_date >= today,
        )
        .all()
    )
    return rows[0] if rows else None


# ----------------------------------------------------------------------------
# HR Request
# ----------------------------------------------------------------------------


def create_hr_request(
    db: Session,
    *,
    user_id: int,
    category: str,
    subject: str,
    body: str | None,
) -> HrRequest:
    row = HrRequest(
        user_id=user_id,
        category=category,
        subject=subject,
        body=body,
        status="open",
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    admins = db.query(User).filter(User.role.in_(["admin", "buero"])).all()
    for a in admins:
        _notify(
            db,
            user_id=a.id,
            kind="hr_request_created",
            title="Neue HR-Anfrage",
            body=f"{category} — {subject}",
            related_entity_id=row.id,
        )
    db.commit()
    return row


def list_hr_requests(
    db: Session,
    *,
    user_id: int | None = None,
    only_open: bool = False,
) -> list[HrRequest]:
    q = db.query(HrRequest)
    if user_id is not None:
        q = q.filter(HrRequest.user_id == user_id)
    if only_open:
        q = q.filter(HrRequest.status == "open")
    return q.order_by(HrRequest.created_at.desc()).limit(500).all()


def resolve_hr_request(
    db: Session,
    *,
    hr_request_id: int,
    handler_user_id: int,
    handler_kuerzel: str,
    status: str,
    response_text: str | None,
) -> HrRequest:
    row = db.query(HrRequest).filter(HrRequest.id == hr_request_id).first()
    if row is None:
        raise ValueError("hr_request_not_found")
    row.status = status
    row.handler_user_id = handler_user_id
    row.handler_kuerzel = handler_kuerzel
    row.handled_at = datetime.utcnow()
    row.response_text = response_text
    db.commit()
    db.refresh(row)

    _notify(
        db,
        user_id=row.user_id,
        kind="hr_request_response",
        title="Antwort vom Büro",
        body=response_text
        or f"Deine HR-Anfrage wurde von {handler_kuerzel} bearbeitet.",
        related_entity_id=row.id,
    )
    db.commit()
    return row


# ----------------------------------------------------------------------------
# Announcements
# ----------------------------------------------------------------------------


def create_announcement(
    db: Session,
    *,
    created_by_user_id: int,
    title: str,
    body: str,
    visible_from: datetime | None,
    visible_until: datetime,
) -> Announcement:
    row = Announcement(
        title=title,
        body=body,
        visible_from=visible_from or datetime.utcnow(),
        visible_until=visible_until,
        created_by_user_id=created_by_user_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_announcements(
    db: Session,
    *,
    active_only: bool = False,
) -> list[Announcement]:
    q = db.query(Announcement)
    if active_only:
        now = datetime.utcnow()
        q = q.filter(
            Announcement.visible_from <= now,
            Announcement.visible_until >= now,
        )
    return q.order_by(Announcement.visible_from.desc()).limit(200).all()


def delete_announcement(db: Session, *, announcement_id: int) -> bool:
    row = (
        db.query(Announcement)
        .filter(Announcement.id == announcement_id)
        .first()
    )
    if row is None:
        return False
    db.delete(row)
    db.commit()
    return True
