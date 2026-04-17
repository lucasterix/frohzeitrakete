"""Urlaubsdaten aus dem Google-Sheet "Urlaubsplaner 2026".

Liest für jeden Mitarbeiter die genehmigten Urlaubstage (U/u) aus dem
Sheet. Die Spalten sind Werktage, Zeile 2 enthält die Daten im Format
dd.mm.yyyy, ab Zeile 6 stehen die Mitarbeiter.
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from datetime import date, datetime

from app.services.sheets_service import (
    _credentials_path,
    _normalize_name,
    SPREADSHEET_ID,
    SCOPES,
)


logger = logging.getLogger(__name__)

VACATION_SHEET = "Urlaubsplaner 2026"
ROW_DATES = 2
ROW_FIRST_EMPLOYEE = 4   # actual employee names start around row 6, but some rows are empty


@dataclass
class EmployeeVacation:
    sheet_name: str
    vacation_dates: list[date]
    total_days: int


def _parse_date(s: str) -> date | None:
    s = s.strip()
    if not s:
        return None
    try:
        return datetime.strptime(s, "%d.%m.%Y").date()
    except ValueError:
        return None


def fetch_all_vacations() -> list[EmployeeVacation]:
    """Liest das Urlaubsplaner-Sheet und gibt pro Mitarbeiter die
    genehmigten Urlaubstage zurück."""
    from google.oauth2.service_account import Credentials
    from googleapiclient.discovery import build

    creds = Credentials.from_service_account_file(
        _credentials_path(), scopes=SCOPES
    )
    svc = build("sheets", "v4", credentials=creds, cache_discovery=False)

    res = svc.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range=f"'{VACATION_SHEET}'!A1:NZ100",
        valueRenderOption="FORMATTED_VALUE",
    ).execute()
    rows = res.get("values", [])
    if len(rows) < 3:
        return []

    # Zeile 2 (idx 1) = Datumsspalten
    header = rows[1] if len(rows) > 1 else []
    date_cols: dict[int, date] = {}
    for col_idx, cell in enumerate(header):
        d = _parse_date(str(cell))
        if d is not None:
            date_cols[col_idx] = d

    if not date_cols:
        logger.warning("vacation_sheet_no_date_columns")
        return []

    results: list[EmployeeVacation] = []
    for row in rows[ROW_FIRST_EMPLOYEE:]:
        if not row or not row[0] or not str(row[0]).strip():
            continue
        name = str(row[0]).strip()
        if name.lower() in ("mitarbeiter", "gesamturlaubstage", "zeitraum definition"):
            continue

        vac_dates: list[date] = []
        for col_idx, d in date_cols.items():
            if col_idx < len(row):
                cell = str(row[col_idx]).strip().lower()
                if cell == "u":
                    vac_dates.append(d)

        results.append(EmployeeVacation(
            sheet_name=name,
            vacation_dates=sorted(vac_dates),
            total_days=len(vac_dates),
        ))

    return results


def get_vacation_dates_for_user(sheet_name: str) -> list[date]:
    """Gibt die Urlaubstage für einen bestimmten Mitarbeiter zurück."""
    all_vac = fetch_all_vacations()
    norm = _normalize_name(sheet_name)
    for emp in all_vac:
        if _normalize_name(emp.sheet_name) == norm:
            return emp.vacation_dates
    return []


def get_vacation_dates_for_month(
    sheet_name: str, year: int, month: int
) -> list[date]:
    """Nur die Urlaubstage eines bestimmten Monats."""
    return [
        d for d in get_vacation_dates_for_user(sheet_name)
        if d.year == year and d.month == month
    ]
