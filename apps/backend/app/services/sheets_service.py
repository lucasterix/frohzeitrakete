"""Google-Sheets-Sync für die Stundenübersicht.

Liest aus dem Sheet "2026 Stundenübersicht":
- Spalte A (Zeile 6–92): Mitarbeitername
- Spalte E: Soll-Stunden pro Woche (h/Wo)
- Spalte R: Aktueller Überstunden-/Minusstunden-Saldo

Matched die Zeilen fuzzy auf User.full_name und schreibt
overtime_balance_hours + target_hours_per_week + sheets_last_synced_at.

Authentifizierung über Service-Account-JSON. Pfad kommt aus der
Environment-Variable GOOGLE_SHEETS_CREDENTIALS, fällt andernfalls auf
apps/backend/secrets/frohzeit-sheets.json zurück (nur lokal — auf
Prod MUSS die env-var gesetzt sein).
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.user import User


logger = logging.getLogger(__name__)


SPREADSHEET_ID = "14-cmpJJNCq9olqty0laIm7-5sw5rY9xtLS-2wZnR2EU"
SHEET_NAME = "2026 Stundenübersicht"
SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]

# Zeilenbereich mit Mitarbeitern (über Zeit stabil)
ROW_FIRST = 6
ROW_LAST = 92


def _credentials_path() -> str:
    return os.environ.get(
        "GOOGLE_SHEETS_CREDENTIALS",
        os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "secrets",
            "frohzeit-sheets.json",
        ),
    )


def _parse_de_number(s: str) -> float | None:
    """Deutsche Dezimal-Zahlen parsen: '536,9' → 536.9, '-1.234,5' → -1234.5.
    Leere Strings oder Nicht-Zahlen geben None."""
    if s is None:
        return None
    s = str(s).strip()
    if not s:
        return None
    # Tausender-Punkte raus, Komma zu Punkt
    s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def _normalize_name(name: str) -> str:
    """Groß/Klein egal, Whitespace normalisiert, führende/trailing Spaces raus."""
    if not name:
        return ""
    n = name.lower().strip()
    n = re.sub(r"\s+", " ", n)
    return n


def _name_tokens(name: str) -> set[str]:
    return {t for t in re.split(r"\s+", _normalize_name(name)) if t}


def _match_score(sheet_name: str, user_name: str) -> float:
    """Simpler Fuzzy-Score zwischen 0 und 1.

    - Exact nach Normalisierung → 1.0
    - Alle Tokens des einen in dem anderen → 0.9
    - Jaccard über Tokens → beliebig
    """
    a = _normalize_name(sheet_name)
    b = _normalize_name(user_name)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    ta = _name_tokens(sheet_name)
    tb = _name_tokens(user_name)
    if not ta or not tb:
        return 0.0
    if ta.issubset(tb) or tb.issubset(ta):
        return 0.9
    inter = ta & tb
    union = ta | tb
    return len(inter) / len(union)


@dataclass
class SheetRow:
    name: str
    target_hours_per_week: float | None
    overtime_balance_hours: float | None


def fetch_sheet_rows() -> list[SheetRow]:
    """Ruft die drei Spalten in einem Batch-Request ab."""
    from google.oauth2.service_account import Credentials
    from googleapiclient.discovery import build

    creds = Credentials.from_service_account_file(
        _credentials_path(), scopes=SCOPES
    )
    svc = build("sheets", "v4", credentials=creds, cache_discovery=False)
    ranges = [
        f"'{SHEET_NAME}'!A{ROW_FIRST}:A{ROW_LAST}",
        f"'{SHEET_NAME}'!E{ROW_FIRST}:E{ROW_LAST}",
        f"'{SHEET_NAME}'!R{ROW_FIRST}:R{ROW_LAST}",
    ]
    res = (
        svc.spreadsheets()
        .values()
        .batchGet(spreadsheetId=SPREADSHEET_ID, ranges=ranges)
        .execute()
    )
    cols = res.get("valueRanges", [])

    def _col(idx: int) -> list[str]:
        vals = cols[idx].get("values", []) if idx < len(cols) else []
        out: list[str] = []
        for row in vals:
            out.append(row[0] if row else "")
        # Auffüllen damit alle drei Listen gleich lang sind
        while len(out) < (ROW_LAST - ROW_FIRST + 1):
            out.append("")
        return out

    names = _col(0)
    hwo = _col(1)
    saldo = _col(2)

    rows: list[SheetRow] = []
    for name, w, b in zip(names, hwo, saldo):
        if not (name and name.strip()):
            continue
        rows.append(
            SheetRow(
                name=name.strip(),
                target_hours_per_week=_parse_de_number(w),
                overtime_balance_hours=_parse_de_number(b),
            )
        )
    return rows


@dataclass
class SyncResult:
    matched: int
    unmatched_sheet_names: list[str]
    unmatched_user_ids: list[int]


def sync_users_from_sheet(db: Session) -> SyncResult:
    rows = fetch_sheet_rows()
    users = db.query(User).filter(User.is_active.is_(True)).all()
    now = datetime.utcnow()

    matched_user_ids: set[int] = set()
    unmatched_sheet: list[str] = []

    for row in rows:
        # Besten User finden
        best: User | None = None
        best_score = 0.0
        for u in users:
            if u.id in matched_user_ids:
                continue
            score = _match_score(row.name, u.full_name or "")
            if score > best_score:
                best = u
                best_score = score

        if best is None or best_score < 0.6:
            unmatched_sheet.append(row.name)
            continue

        best.overtime_balance_hours = row.overtime_balance_hours
        best.target_hours_per_week = row.target_hours_per_week
        best.sheets_name_match = row.name
        best.sheets_last_synced_at = now
        matched_user_ids.add(best.id)

    db.commit()

    all_user_ids = {u.id for u in users}
    unmatched_user_ids = sorted(all_user_ids - matched_user_ids)

    logger.info(
        "sheets_sync matched=%s unmatched_sheet=%s unmatched_users=%s",
        len(matched_user_ids),
        len(unmatched_sheet),
        len(unmatched_user_ids),
    )
    return SyncResult(
        matched=len(matched_user_ids),
        unmatched_sheet_names=unmatched_sheet,
        unmatched_user_ids=unmatched_user_ids,
    )


def target_hours_per_day(user: User) -> float | None:
    """Soll-Stunden pro Tag = h/Woche / 5 (5-Tage-Woche).

    Gibt None zurück wenn noch kein Sheet-Sync durchlief oder der
    Mitarbeiter keine Soll-Stunden hinterlegt hat.
    """
    if user.target_hours_per_week is None:
        return None
    return round(user.target_hours_per_week / 5.0, 2)
