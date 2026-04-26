"""Zahlungsavis-Parser für deutsche Krankenkassen.

Portiert aus dem eigenständigen avisparser-Repo. Liest PDF-Avise und
extrahiert pro Posten Rechnungsnummer + Zahlbetrag.

Unterstützte Formate: DAVASO/IKK classic, Barmer, Mobil, AOK, generisch.
"""

from __future__ import annotations

import io
import os
import re
import tempfile
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Optional

import pdfplumber

SKIP_PREFIXES = (
    "summe", "übertrag", "uebertrag", "die überweisung", "die ueberweisung",
    "wenn sie weitere", "mit freundlichen", "sehr geehrte", "seite",
    "kontaktdaten", "servicezeiten", "postanschrift", "so erreichen",
    "bitte angeben", "zahlungsmitteilung", "gesamt", "gesamtsumme",
    "website", "alles wichtige", "wichtiger hinweis",
)

RE_DATE = re.compile(r"\b\d{2}\.\d{2}\.\d{4}\b")
RE_DE_AMOUNT = re.compile(r"\b\d{1,3}(?:\.\d{3})*,\d{2}\b")
RE_LETTER_DATE = re.compile(r"\bDatum\b\s*:?\s*(\d{2}\.\d{2}\.\d{4})\b", re.IGNORECASE)
RE_DEN_DATE = re.compile(r"\bden\b\s+(\d{2}\.\d{2}\.\d{4})\b", re.IGNORECASE)
RE_LONG_DIGITS = re.compile(r"\b\d{9,25}\b")
RE_DAVASO_DOC_ID = re.compile(r"\bICL\d{5}\b", re.IGNORECASE)

BELEG_KEYWORDS = (
    "beleg", "belegnummer", "beleg-nr", "beleg nr", "zahlungsbeleg",
    "überweisung nr", "ueberweisung nr", "überweisung", "ueberweisung",
)

RE_LINE_WITH_DATE = re.compile(
    r"^(?P<posdate>\d{2}\.\d{2}\.\d{4})\s+(?P<inv>\d{4,5})\s+(?P<text>.+?)\s+(?P<amt>\d{1,3}(?:\.\d{3})*,\d{2})\s*$"
)
RE_LINE_NO_DATE = re.compile(
    r"^(?P<inv>\d{4,5})\s+(?P<text>.+?)\s+(?P<amt>\d{1,3}(?:\.\d{3})*,\d{2})\s*$"
)
RE_RECHNUNG_LINE = re.compile(
    r"^(?P<kind>Rechnung|Nachberech\.?|Nachber\.?|Nachberech|Nachber)\s+(?P<inv>\d{1,5})\s*(?P<glue>Nachzahlung|Nachberech\.?|Nachber\.?|Nachberech|Nachber)?\s*(?P<text>.+?)\s+(?P<amt>\d{1,3}(?:\.\d{3})*,\d{2})\s*$",
    re.IGNORECASE,
)
RE_DAVASO_LINE = re.compile(
    r"^Rechnung\s+(?P<inv>\d{4,5})\s+(?P<vorgang>\d{6,})\s+(?P<posdate>\d{2}\.\d{2}\.\d{4})\s+(?P<betrag>\d{1,3}(?:\.\d{3})*,\d{2})\s+(?P<skonto>\d{1,3}(?:\.\d{3})*,\d{2})\s+(?P<zahlbetrag>\d{1,3}(?:\.\d{3})*,\d{2})\s*$",
    re.IGNORECASE,
)
RE_BARMER_LINE = re.compile(
    r"^(?P<beleg>\d{9,})\s+(?P<usedate>\d{2}\.\d{2}\.\d{4})\s+(?P<inv>\d{4,5})\s+(?P<text>.+?)\s+(?P<bookdate>\d{2}\.\d{2}\.\d{4})\s+(?P<amt>\d{1,3}(?:\.\d{3})*,\d{2})\s*$"
)
RE_MOBIL_LINE = re.compile(
    r"^(?P<beleg>\d{9,})\s+(?P<kv>[A-Z]\d{6,})\s+(?P<amt>\d{1,3}(?:\.\d{3})*,\d{2})\s+(?P<usedate>\d{2}\.\d{2}\.\d{4})\s+(?P<inv>\d{4,5})\s*(?:\d+)?\s*$"
)
RE_AOK_BOOKING_NO_AMT = re.compile(
    r"^(?P<posdate>\d{2}\.\d{2}\.\d{4})\s+(?P<inv>\d{4,5})\s+(?P<text>.+?)\s*$"
)
RE_AMOUNT_ONLY_LINE = re.compile(r"^(?P<amt>\d{1,3}(?:\.\d{3})*,\d{2})\s*$")


@dataclass
class AvisEntry:
    invoice_no: str
    amount_eur: Decimal


@dataclass
class AvisParseResult:
    filename: str
    letter_date: Optional[str]
    beleg_no: Optional[str]
    entries: list[AvisEntry] = field(default_factory=list)
    text_len: int = 0
    doc_type: str = "OTHER"
    warnings: list[str] = field(default_factory=list)
    total_amount: Decimal = Decimal("0")


def _parse_de_amount(s: str) -> Decimal:
    s = s.strip().replace(".", "").replace(",", ".")
    try:
        val = Decimal(s)
    except InvalidOperation as e:
        raise ValueError(f"Ungültiger Betrag: {s!r}") from e
    if val < 0:
        raise ValueError(f"Negativer Betrag: {val}")
    return val


def _clean(line: str) -> str:
    return " ".join(line.strip().split())


def _skip(line: str) -> bool:
    low = line.strip().lower()
    return not low or any(low.startswith(p) for p in SKIP_PREFIXES)


def extract_text(pdf_bytes: bytes) -> str:
    texts: list[str] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            t = page.extract_text(layout=True) or ""
            if not t.strip():
                t = page.extract_text() or ""
            texts.append(t)
    return "\n".join(texts)


def _find_letter_date(text: str) -> Optional[str]:
    m = RE_LETTER_DATE.search(text)
    if m:
        return m.group(1)
    m = RE_DEN_DATE.search(text)
    if m:
        return m.group(1)
    m = RE_DATE.search(text)
    return m.group(0) if m else None


def _find_beleg_no(text: str, entries: list[AvisEntry]) -> Optional[str]:
    lines = [_clean(l) for l in text.splitlines() if _clean(l)]
    if not lines:
        return None

    low_text = text.lower()
    if "davaso" in low_text or "ikk classic" in low_text:
        m = RE_DAVASO_DOC_ID.search(text)
        if m:
            return m.group(0)

    freq: dict[str, int] = {}
    for line in lines:
        for d in RE_LONG_DIGITS.findall(line):
            freq[d] = freq.get(d, 0) + 1

    invoice_set = {e.invoice_no for e in entries}
    candidates: dict[str, int] = {}

    for idx, line in enumerate(lines):
        low = line.lower()
        hits = RE_LONG_DIGITS.findall(line)
        if not hits:
            continue

        kw_score = 0
        if any(k in low for k in BELEG_KEYWORDS):
            kw_score += 80
        for j in range(max(0, idx - 2), min(len(lines), idx + 3)):
            if j != idx and any(k in lines[j].lower() for k in BELEG_KEYWORDS):
                kw_score += 20

        for h in hits:
            if h in invoice_set:
                continue
            penalty = 60 if freq.get(h, 0) >= 2 and kw_score < 80 else 0
            score = kw_score + min(len(h), 25) - penalty
            if "überweisung nr" in low or "ueberweisung nr" in low:
                score += 40
            candidates[h] = max(candidates.get(h, -10000), score)

    if not candidates:
        return None
    best = sorted(candidates.items(), key=lambda x: (x[1], len(x[0])), reverse=True)[0]
    return best[0] if best[1] >= 30 else None


def _parse_entries(text: str) -> list[AvisEntry]:
    entries: list[AvisEntry] = []
    pending_rows: list[tuple[str, str]] = []
    pending_amts: list[Decimal] = []
    in_booking = False
    in_amount = False

    def flush():
        nonlocal pending_rows, pending_amts
        n = min(len(pending_rows), len(pending_amts))
        for i in range(n):
            entries.append(AvisEntry(invoice_no=pending_rows[i][0], amount_eur=pending_amts[i]))
        pending_rows = pending_rows[n:]
        pending_amts = pending_amts[n:]

    for raw in text.splitlines():
        line = _clean(raw)
        if not line:
            continue
        low = line.lower()

        if "buchungstext" in low:
            in_booking = True
            if "betrag" in low and "euro" in low:
                in_amount = True
            continue
        if "betrag in euro" in low or low.strip() in ("betrag in eur", "betrag in euro"):
            in_amount = True
            continue
        if low.startswith(("gesamtsumme", "summe", "zahlungsbeleg")):
            in_booking = in_amount = False
            flush()
            continue
        if _skip(line):
            continue

        for regex, inv_grp, amt_grp in [
            (RE_DAVASO_LINE, "inv", "zahlbetrag"),
            (RE_BARMER_LINE, "inv", "amt"),
            (RE_MOBIL_LINE, "inv", "amt"),
            (RE_LINE_WITH_DATE, "inv", "amt"),
            (RE_RECHNUNG_LINE, "inv", "amt"),
        ]:
            m = regex.match(line)
            if m:
                try:
                    entries.append(AvisEntry(invoice_no=m.group(inv_grp), amount_eur=_parse_de_amount(m.group(amt_grp))))
                except ValueError:
                    pass
                break
        else:
            m = RE_LINE_NO_DATE.match(line)
            if m and in_booking:
                try:
                    entries.append(AvisEntry(invoice_no=m.group("inv"), amount_eur=_parse_de_amount(m.group("amt"))))
                except ValueError:
                    pass
                continue

            m = RE_AOK_BOOKING_NO_AMT.match(line)
            if m and in_booking and not RE_DE_AMOUNT.search(line):
                pending_rows.append((m.group("inv"), m.group("text")))
                continue

            if in_amount:
                ma = RE_AMOUNT_ONLY_LINE.match(line)
                if ma:
                    try:
                        pending_amts.append(_parse_de_amount(ma.group("amt")))
                        flush()
                    except ValueError:
                        pass

    flush()
    return entries


def parse_pdf_bytes(pdf_bytes: bytes, filename: str) -> AvisParseResult:
    text = extract_text(pdf_bytes)
    entries = _parse_entries(text)
    letter_date = _find_letter_date(text)
    beleg_no = _find_beleg_no(text, entries)

    low = text.lower()
    avis_markers = ("zahlungsavis", "zahlungsmitteilung", "folgende aufstellung", "posten beglichen")
    doc_type = "AVIS" if any(m in low for m in avis_markers) else ("POSTEN" if entries else "OTHER")

    warnings: list[str] = []
    if doc_type == "AVIS" and not entries:
        warnings.append("AVIS erkannt, aber 0 Einzelposten")
    if doc_type == "AVIS" and not beleg_no:
        warnings.append("Keine Beleg-/Überweisungs-ID gefunden")
    if doc_type == "AVIS" and not letter_date:
        warnings.append("Kein Briefdatum gefunden")

    total = sum((e.amount_eur for e in entries), Decimal("0"))

    return AvisParseResult(
        filename=filename,
        letter_date=letter_date,
        beleg_no=beleg_no,
        entries=entries,
        text_len=len(text),
        doc_type=doc_type,
        warnings=warnings,
        total_amount=total,
    )
