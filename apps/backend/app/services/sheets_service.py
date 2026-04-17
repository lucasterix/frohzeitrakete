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

ROW_FIRST = 6
ROW_LAST = 92

# Pro Monat 6 Spalten, Start bei C (Index 2). Offset pro Monat = 6.
# Jan: C-H (Idx 2-7), Feb: I-N (8-13), Mär: O-T (14-19), Apr: U-Z (20-25), ...
# Innerhalb eines Monatsblocks: +0=IST, +1=h/Mo, +2=h/Wo, +3=Dif., +4=Urlaub, +5=Krank
_MONTH_BLOCK_START = 2   # Spalte C
_MONTH_BLOCK_SIZE = 6
_OFFSET_HWO = 2          # h/Wo innerhalb des Blocks
_OFFSET_DIF = 3          # Dif. innerhalb des Blocks


def _col_letter(idx: int) -> str:
    """0-basierter Spaltenindex → Excel-Buchstabe (A, B, ..., Z, AA, AB, ...)."""
    if idx < 26:
        return chr(65 + idx)
    return chr(64 + idx // 26) + chr(65 + idx % 26)


def _month_columns(month: int) -> tuple[str, str, str]:
    """Gibt (name_col, hwo_col, saldo_col) für den angegebenen Monat zurück.

    - name_col: immer A
    - hwo_col: h/Wo des aktuellen Monats
    - saldo_col: Dif. des Vormonats (= abgeschlossener Stand), für
      Januar der Übertrag in Spalte B
    """
    block = _MONTH_BLOCK_START + (month - 1) * _MONTH_BLOCK_SIZE
    hwo_idx = block + _OFFSET_HWO

    if month == 1:
        saldo_col = "B"
    else:
        prev_block = _MONTH_BLOCK_START + (month - 2) * _MONTH_BLOCK_SIZE
        saldo_col = _col_letter(prev_block + _OFFSET_DIF)

    return "A", _col_letter(hwo_idx), saldo_col


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


def _levenshtein(a: str, b: str) -> int:
    if len(a) < len(b):
        return _levenshtein(b, a)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a):
        curr = [i + 1]
        for j, cb in enumerate(b):
            curr.append(
                min(prev[j + 1] + 1, curr[j] + 1, prev[j] + (ca != cb))
            )
        prev = curr
    return prev[-1]


def _token_similar(a: str, b: str) -> bool:
    """Sind zwei Token (Nachname-Teile) ähnlich genug? Erlaubt bis zu
    2 Zeichen Abweichung bei Tokens >= 4 Buchstaben."""
    if a == b:
        return True
    if min(len(a), len(b)) < 3:
        return False
    max_dist = 1 if max(len(a), len(b)) < 6 else 2
    return _levenshtein(a, b) <= max_dist


def _match_score(sheet_name: str, user_name: str) -> float:
    """Fuzzy-Score zwischen 0 und 1 mit Levenshtein auf Token-Ebene.

    - Exakt nach Normalisierung → 1.0
    - Alle Tokens fuzzy-gematched → 0.9
    - Anteil fuzzy-gematchter Tokens → proportional
    """
    a = _normalize_name(sheet_name)
    b = _normalize_name(user_name)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    ta = list(_name_tokens(sheet_name))
    tb = list(_name_tokens(user_name))
    if not ta or not tb:
        return 0.0
    # Greedy: für jedes Token in ta den besten Match in tb finden
    used: set[int] = set()
    matched = 0
    for tok_a in ta:
        best_j = -1
        for j, tok_b in enumerate(tb):
            if j in used:
                continue
            if _token_similar(tok_a, tok_b):
                best_j = j
                break
        if best_j >= 0:
            used.add(best_j)
            matched += 1
    total = max(len(ta), len(tb))
    if matched == total:
        return 0.9
    return matched / total


@dataclass
class SheetRow:
    name: str
    target_hours_per_week: float | None
    overtime_balance_hours: float | None


def fetch_sheet_rows(*, month: int | None = None) -> list[SheetRow]:
    """Ruft Name, h/Wo und Saldo für den angegebenen Monat ab.

    month: 1-12. Default: aktueller Monat."""
    from google.oauth2.service_account import Credentials
    from googleapiclient.discovery import build

    if month is None:
        month = date.today().month

    name_col, hwo_col, saldo_col = _month_columns(month)
    logger.info(
        "sheets_fetch month=%s name=%s hwo=%s saldo=%s",
        month, name_col, hwo_col, saldo_col,
    )

    creds = Credentials.from_service_account_file(
        _credentials_path(), scopes=SCOPES
    )
    svc = build("sheets", "v4", credentials=creds, cache_discovery=False)
    ranges = [
        f"'{SHEET_NAME}'!{name_col}{ROW_FIRST}:{name_col}{ROW_LAST}",
        f"'{SHEET_NAME}'!{hwo_col}{ROW_FIRST}:{hwo_col}{ROW_LAST}",
        f"'{SHEET_NAME}'!{saldo_col}{ROW_FIRST}:{saldo_col}{ROW_LAST}",
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

    # Index für manuelle Verknüpfungen: sheets_name_match → User
    manual_map: dict[str, User] = {}
    for u in users:
        if u.sheets_name_match:
            manual_map[_normalize_name(u.sheets_name_match)] = u

    matched_user_ids: set[int] = set()
    unmatched_sheet: list[str] = []

    for row in rows:
        norm = _normalize_name(row.name)

        # 1. Manuelle Verknüpfung hat Vorrang
        if norm in manual_map and manual_map[norm].id not in matched_user_ids:
            u = manual_map[norm]
            u.overtime_balance_hours = row.overtime_balance_hours
            u.target_hours_per_week = row.target_hours_per_week
            u.sheets_last_synced_at = now
            matched_user_ids.add(u.id)
            continue

        # 2. Fuzzy-Match
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
