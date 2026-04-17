"""Monatsstatistik für den eingeloggten Mitarbeiter.

Berechnet: geleistete Stunden (mit 10% auf Betreuungsstunden),
Durchschnitt pro Tag, Monatsprognose, Feiertags-Gutschriften.
"""

from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import extract, func
from sqlalchemy.orm import Session

from app.models.entry import Entry
from app.models.user import User


# Gesetzliche Feiertage Niedersachsen. Osterdatum wird berechnet,
# der Rest ist fix.
def _easter(year: int) -> date:
    """Gauss-Algorithmus für das Osterdatum."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7  # noqa: E741
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def _holidays_niedersachsen(year: int) -> dict[date, str]:
    easter = _easter(year)
    return {
        date(year, 1, 1): "Neujahr",
        easter - timedelta(2): "Karfreitag",
        easter + timedelta(1): "Ostermontag",
        date(year, 5, 1): "Tag der Arbeit",
        easter + timedelta(39): "Christi Himmelfahrt",
        easter + timedelta(50): "Pfingstmontag",
        date(year, 10, 3): "Tag der Deutschen Einheit",
        date(year, 10, 31): "Reformationstag",
        date(year, 12, 25): "1. Weihnachtstag",
        date(year, 12, 26): "2. Weihnachtstag",
    }


def _is_workday(d: date, holidays: dict[date, str]) -> bool:
    return d.weekday() < 5 and d not in holidays


def _count_workdays(start: date, end: date, holidays: dict[date, str]) -> int:
    count = 0
    d = start
    while d <= end:
        if _is_workday(d, holidays):
            count += 1
        d += timedelta(1)
    return count


MONTH_NAMES_DE = [
    "", "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember",
]


@dataclass
class MonthStats:
    year: int
    month: int
    month_name: str

    # Geleistete Stunden (Betreuung ×1.10, Rest ×1.00, Feiertage extra)
    patient_hours_raw: float
    other_hours_raw: float
    holiday_hours: float
    total_hours_credited: float

    # Arbeitstage
    workdays_elapsed: int
    workdays_total: int

    # Prognose
    avg_per_workday: float
    month_projection: float

    # Saldo aus Vormonat (aus Sheets)
    overtime_balance: float | None
    overtime_label: str

    # Soll
    target_hours_per_day: float | None
    target_hours_per_week: float | None

    # Feiertag heute?
    today_is_holiday: bool
    today_holiday_name: str | None


def compute_month_stats(
    db: Session,
    *,
    user: User,
    year: int | None = None,
    month: int | None = None,
) -> MonthStats:
    today = date.today()
    if year is None:
        year = today.year
    if month is None:
        month = today.month

    holidays = _holidays_niedersachsen(year)
    first = date(year, month, 1)
    last = date(year, month, monthrange(year, month)[1])
    until = min(today, last)

    target_per_day = user.target_hours_per_day or 0.0

    # Arbeitstage
    workdays_elapsed = _count_workdays(first, until, holidays)
    workdays_total = _count_workdays(first, last, holidays)

    # Entries dieses Monats
    entries = (
        db.query(Entry)
        .filter(
            Entry.user_id == user.id,
            Entry.entry_date >= first,
            Entry.entry_date <= until,
        )
        .all()
    )

    patient_hours = 0.0
    other_hours = 0.0
    for e in entries:
        if e.entry_type == "patient":
            patient_hours += e.hours
        else:
            other_hours += e.hours

    # Feiertage die auf Werktage fielen → Tagessoll gutschreiben (kein 10%)
    holiday_hours = 0.0
    for h in holidays:
        if first <= h <= until and h.weekday() < 5:
            holiday_hours += target_per_day

    # 10% Betreuungsbonus, einmal
    total = (patient_hours * 1.10) + other_hours + holiday_hours

    # Durchschnitt + Prognose
    avg = total / workdays_elapsed if workdays_elapsed > 0 else 0.0
    projection = avg * 5.0 * 4.33

    # Saldo-Label
    prev_month = month - 1 if month > 1 else 12
    prev_month_name = MONTH_NAMES_DE[prev_month]
    if user.overtime_balance_hours is not None:
        if user.overtime_balance_hours >= 0:
            overtime_label = f"Überstunden Stand Ende {prev_month_name}"
        else:
            overtime_label = f"Minusstunden Stand Ende {prev_month_name}"
    else:
        overtime_label = ""

    return MonthStats(
        year=year,
        month=month,
        month_name=MONTH_NAMES_DE[month],
        patient_hours_raw=round(patient_hours, 2),
        other_hours_raw=round(other_hours, 2),
        holiday_hours=round(holiday_hours, 2),
        total_hours_credited=round(total, 2),
        workdays_elapsed=workdays_elapsed,
        workdays_total=workdays_total,
        avg_per_workday=round(avg, 2),
        month_projection=round(projection, 1),
        overtime_balance=user.overtime_balance_hours,
        overtime_label=overtime_label,
        target_hours_per_day=user.target_hours_per_day,
        target_hours_per_week=user.target_hours_per_week,
        today_is_holiday=today in holidays,
        today_holiday_name=holidays.get(today),
    )
