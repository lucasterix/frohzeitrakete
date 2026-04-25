"""PDF generation for Pflegehilfsmittel invoices and forms.

Consolidated from pflegekreuzer: pdf_pflegeantrag.py, pdf_simple.py, pdf_tools.py.
"""

from __future__ import annotations

import os
import re
from datetime import datetime
from decimal import Decimal
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen import canvas

try:
    from pypdf import PdfReader, PdfWriter
except ImportError:
    from PyPDF2 import PdfReader, PdfWriter  # type: ignore[no-redef]

from app.models.pflegehm_abrechnung import PflegehmAbrechnung
from app.models.pflegehm_position import PflegehmPosition

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

STATIC_DIR = Path(__file__).resolve().parent.parent / "static" / "pflegehm"

# ---------------------------------------------------------------------------
# Layout constants
# ---------------------------------------------------------------------------

PAGE_W, PAGE_H = A4
MARGIN_L = 25 * mm
MARGIN_R = 20 * mm
MARGIN_T = 20 * mm
MARGIN_B = 20 * mm
HEADER_H = 24 * mm
BLOCK_GAP = 6 * mm
LINE_H = 5.6 * mm
TABLE_LH = 6.0 * mm
FONT = "Helvetica"
FONT_B = "Helvetica-Bold"


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

def mmx(x: float) -> float:
    return x * mm


def mmy(y: float) -> float:
    return y * mm


def eur(d: Decimal | float | int) -> str:
    d = d if isinstance(d, Decimal) else Decimal(str(d))
    s = f"{d:.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return s + "\u20ac"


def _safe_str(x: Any, default: str = "") -> str:
    return (x if isinstance(x, str) else "") or default


def _string_w(text: str, size: float, font: str = FONT) -> float:
    return pdfmetrics.stringWidth(text, font, size)


def _wrap_text(text: str, max_w: float, size: float = 10, font: str = FONT) -> List[str]:
    lines_out: List[str] = []
    for raw in (text or "").splitlines() or [""]:
        words = raw.split(" ")
        line = ""
        for w in words:
            cand = (line + " " + w).strip() if line else w
            if _string_w(cand, size, font) <= max_w:
                line = cand
            else:
                if line:
                    lines_out.append(line)
                if _string_w(w, size, font) > max_w:
                    chunk = ""
                    for ch in w:
                        if _string_w(chunk + ch, size, font) <= max_w:
                            chunk += ch
                        else:
                            lines_out.append(chunk)
                            chunk = ch
                    line = chunk
                else:
                    line = w
        lines_out.append(line)
    return lines_out or [""]


def _draw_multiline(c: canvas.Canvas, x: float, y: float, text: str,
                    size: float = 10, max_w: float | None = None,
                    font: str = FONT, leading: float = LINE_H) -> float:
    c.saveState()
    c.setFont(font, size)
    lines = _wrap_text(text, max_w, size, font) if max_w else (text or "").splitlines()
    for i, line in enumerate(lines):
        c.drawString(x, y - i * leading, line)
    c.restoreState()
    return y - len(lines) * leading


def _draw_kv(c: canvas.Canvas, x: float, y: float, kv: list, label_w: float = 32 * mm,
             line_h: float = LINE_H, size: float = 10,
             right_align_value: bool = False, block_w: float | None = None) -> float:
    c.saveState()
    for i, (k, v) in enumerate(kv):
        yy = y - i * line_h
        c.setFont(FONT, size)
        c.drawString(x, yy, k)
        c.setFont(FONT_B, size)
        if right_align_value and block_w:
            c.drawRightString(x + block_w, yy, v)
        else:
            c.drawString(x + label_w, yy, v)
    c.restoreState()
    return y - len(kv) * line_h


def _merge_overlay(template_path: str, overlay_buf: BytesIO) -> BytesIO:
    overlay_buf.seek(0)
    base_reader = PdfReader(template_path)
    overlay_reader = PdfReader(overlay_buf)
    writer = PdfWriter()
    for i, base_page in enumerate(base_reader.pages):
        if i < len(overlay_reader.pages):
            base_page.merge_page(overlay_reader.pages[i])
        writer.add_page(base_page)
    out = BytesIO()
    writer.write(out)
    out.seek(0)
    return out


# ---------------------------------------------------------------------------
# Provider helpers
# ---------------------------------------------------------------------------

def _provider_from_cfg(cfg: dict) -> Dict[str, str]:
    name = cfg.get("name", "Pflegehilfsmittel-Anbieter")
    ik = cfg.get("ik", "000000000")
    strasse = cfg.get("strasse", "")
    plz = cfg.get("plz", "")
    ort = cfg.get("ort", "")
    telefon = cfg.get("kontakt_telefon", "")

    addr_lines = []
    if strasse:
        addr_lines.append(strasse)
    if plz or ort:
        addr_lines.append(" ".join(x for x in [plz, ort] if x))
    addr_text = "\n".join(addr_lines)

    ust_satz = cfg.get("ust_satz", "19")
    bank_name = cfg.get("bank_name", "")
    bank_iban = cfg.get("bank_iban", "")
    bank_bic = cfg.get("bank_bic", "")

    if bank_iban or bank_name or bank_bic:
        parts = []
        if bank_name:
            parts.append(bank_name)
        if bank_iban:
            parts.append(f"IBAN: {bank_iban}")
        if bank_bic:
            parts.append(f"BIC: {bank_bic}")
        bank_line = " \u00b7 ".join(parts)
    else:
        bank_line = "Bankverbindung: bitte IBAN/BIC in der Konfiguration hinterlegen."

    return {
        "name": name, "addr": addr_text, "ik": ik, "telefon": telefon,
        "bank": bank_line, "footer": "Vielen Dank fuer Ihr Vertrauen.",
        "ust_satz": ust_satz,
    }


def _format_address_block(addr: str) -> str:
    s = (addr or "").strip()
    if not s:
        return ""
    if "," in s:
        left, right = s.split(",", 1)
        return left.strip() + "\n" + right.strip()
    return s


def _draw_footer(c: canvas.Canvas, provider: Dict[str, str]) -> None:
    yb = MARGIN_B + 14 * mm
    c.setLineWidth(0.3)
    c.line(MARGIN_L, yb, PAGE_W - MARGIN_R, yb)
    c.setFont(FONT, 8.7)

    bank = provider.get("bank", "")
    if bank:
        c.drawString(MARGIN_L, yb - 4.2 * mm, bank)

    r_lines = []
    if provider.get("name"):
        r_lines.append(provider["name"])
    if provider.get("ik"):
        r_lines.append(f"IK: {provider['ik']}")
    addr = provider.get("addr", "")
    if addr:
        r_lines.append(", ".join(ln.strip() for ln in addr.splitlines() if ln.strip()))
    if provider.get("telefon"):
        r_lines.append(f"Tel.: {provider['telefon']}")

    for i, line in enumerate(r_lines):
        c.drawRightString(PAGE_W - MARGIN_R, yb - 4.2 * mm - i * 4.2 * mm, line)


def _draw_header(c: canvas.Canvas, title: str, logo_path: str | None = None) -> float:
    top_y = PAGE_H - MARGIN_T
    c.setFont(FONT_B, 16)
    c.drawString(MARGIN_L, top_y - 4 * mm, title)
    if logo_path and os.path.exists(logo_path):
        try:
            logo_h = 18 * mm
            logo_w = 18 * mm
            c.drawImage(logo_path, PAGE_W - MARGIN_R - logo_w, top_y - logo_h,
                        width=logo_w, height=logo_h, preserveAspectRatio=True, mask="auto")
        except Exception:
            pass
    line_y = top_y - HEADER_H
    c.setLineWidth(0.5)
    c.line(MARGIN_L, line_y, PAGE_W - MARGIN_R, line_y)
    return line_y - 2 * mm


def _draw_totals_box(c: canvas.Canvas, x_right: float, y: float,
                     total_net: Decimal, total_vat: Decimal, total_gross: Decimal,
                     ust_satz: str) -> float:
    pad_x = 3 * mm
    pad_y = 2 * mm
    row_h = TABLE_LH
    label_w = 32 * mm
    value_w = 28 * mm
    box_w = label_w + value_w + 2 * pad_x
    x = x_right - box_w
    box_h = 3 * row_h + 2 * pad_y
    c.setLineWidth(0.5)
    c.rect(x, y - box_h, box_w, box_h)
    yy = y - pad_y

    def row(label: str, value: str, bold: bool = False) -> None:
        nonlocal yy
        yy -= row_h
        c.setFont(FONT_B if bold else FONT, 10)
        c.drawString(x + pad_x, yy, label)
        c.drawRightString(x + pad_x + label_w + value_w, yy, value)

    vat_label = f"MwSt gesamt ({ust_satz}%)" if ust_satz else "MwSt gesamt"
    row("Summe netto:", eur(total_net))
    row(vat_label + ":", eur(total_vat))
    row("Summe brutto:", eur(total_gross), bold=True)
    return y - box_h


def _fmt_versorgungsmonat(raw: str) -> str:
    s = (raw or "").strip()
    if not s:
        return "-"
    m = re.match(r"^\s*(\d{4})-(\d{2})(?:-\d{2})?\s*$", s)
    if m:
        return f"{m.group(2)}/{m.group(1)}"
    return s


# ---------------------------------------------------------------------------
# Public: Invoice PDF from Abrechnung model
# ---------------------------------------------------------------------------

def make_invoice_pdf_from_abrechnung(
    abrechnung: PflegehmAbrechnung,
    cfg: dict[str, Any] | None = None,
    logo_path: str | None = None,
) -> BytesIO:
    """Render a full invoice PDF for an Abrechnung row."""
    cfg = cfg or {}
    provider = _provider_from_cfg(cfg)

    try:
        ust_satz = Decimal(str(provider.get("ust_satz", "19")).replace(",", "."))
    except Exception:
        ust_satz = Decimal("19")

    kasse = abrechnung.kasse
    patient_data = {
        "name": abrechnung.patient_name,
        "geburtsdatum": abrechnung.geburtsdatum,
        "versichertennr": abrechnung.versichertennummer,
        "pflegekasse": kasse.name if kasse else "",
        "pflegekasse_address": kasse.address if kasse else "",
        "versorgungsmonat": abrechnung.abrechnungsmonat,
    }

    positions = []
    for pos in abrechnung.positionen:
        hm = pos.hilfsmittel
        positions.append({
            "name": hm.bezeichnung if hm else "",
            "qty": pos.menge,
            "unit_price": Decimal(str(pos.einzelpreis)),
        })

    return _make_invoice_pdf(
        provider=provider,
        patient=patient_data,
        positions=positions,
        ust_satz=ust_satz,
        logo_path=logo_path,
    )


def _make_invoice_pdf(
    provider: Dict[str, Any],
    patient: Dict[str, Any],
    positions: List[Dict[str, Any]],
    ust_satz: Decimal = Decimal("19"),
    logo_path: str | None = None,
) -> BytesIO:
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)

    y = _draw_header(c, "Rechnung", logo_path)
    y -= BLOCK_GAP

    total_w = PAGE_W - MARGIN_L - MARGIN_R
    col_gap = 12 * mm
    left_w = total_w * 0.54
    right_w = total_w - left_w - col_gap

    kassename = _safe_str(patient.get("pflegekasse"), "")
    kasse_addr = _safe_str(patient.get("pflegekasse_address"), "")
    recipient = kassename or "Pflegekasse"
    if kasse_addr:
        recipient += "\n" + _format_address_block(kasse_addr)

    y_left = _draw_multiline(c, MARGIN_L, y, recipient, size=10, font=FONT_B, max_w=left_w)

    sender_lines = []
    if provider.get("name"):
        sender_lines.append(provider["name"])
    if provider.get("addr"):
        sender_lines.append(provider["addr"])
    if provider.get("ik"):
        sender_lines.append(f"IK: {provider['ik']}")
    sender = "\n".join(sender_lines)

    x_right_col = MARGIN_L + left_w + col_gap
    y_right = _draw_multiline(c, x_right_col, y, sender, size=10, max_w=right_w)
    y_right -= BLOCK_GAP / 2

    rechnungsnr = datetime.now().strftime("RE-%Y%m%d-%H%M%S")
    versorgungsmonat = _fmt_versorgungsmonat(
        _safe_str(patient.get("versorgungsmonat"))
    )

    y_right = _draw_kv(
        c, x_right_col, y_right,
        [
            ("Rechnungs-Nr.:", rechnungsnr),
            ("Rechnungsdatum:", datetime.now().strftime("%d.%m.%Y")),
            ("Versorgungsmonat:", versorgungsmonat),
        ],
        label_w=30 * mm, line_h=LINE_H, size=10,
        right_align_value=True, block_w=right_w,
    )

    y = min(y_left, y_right) - BLOCK_GAP

    pname = _safe_str(patient.get("name"), "Unbekannt")
    pdob = _safe_str(patient.get("geburtsdatum"), "")
    pvsnr = _safe_str(patient.get("versichertennr"), "")

    y = _draw_kv(
        c, MARGIN_L, y,
        [
            ("Kassenpatient:", pname),
            ("Geburtsdatum:", pdob),
            ("Vers.-Nr.:", pvsnr),
        ],
        label_w=36 * mm, line_h=LINE_H, size=10,
    ) - BLOCK_GAP

    c.setFont(FONT_B, 11)
    c.drawString(MARGIN_L, y, "Betreff: Abrechnung Pflegehilfsmittel \u00a7 40 SGB XI")
    y -= 8 * mm

    y = _draw_multiline(
        c, MARGIN_L, y,
        "Wir stellen die folgenden Leistungen in Rechnung:",
        size=10, max_w=PAGE_W - MARGIN_L - MARGIN_R,
    ) - BLOCK_GAP / 2

    # Table
    content_w = PAGE_W - MARGIN_L - MARGIN_R
    ratios = [0.54, 0.08, 0.14, 0.10, 0.14]
    widths = [content_w * r for r in ratios]
    xs = [MARGIN_L]
    for w in widths[:-1]:
        xs.append(xs[-1] + w)

    headers = ["Artikel", "Menge", "Einzelpreis", "MwSt", "Brutto"]

    def _table_header(ypos: float) -> float:
        c.setFont(FONT_B, 9.5)
        for i, h in enumerate(headers):
            c.drawString(xs[i], ypos, h)
        ypos -= TABLE_LH
        c.setLineWidth(0.4)
        c.line(MARGIN_L, ypos, MARGIN_L + content_w, ypos)
        ypos -= TABLE_LH
        c.setFont(FONT, 9.5)
        return ypos

    def _maybe_new_page(ypos: float) -> float:
        if ypos < MARGIN_B + 45 * mm:
            _draw_footer(c, provider)
            c.showPage()
            ny = _draw_header(c, "Rechnung", logo_path) - BLOCK_GAP
            return _table_header(ny)
        return ypos

    y = _table_header(y)
    max_name_w = widths[0] - 2

    total_net_calc = Decimal("0.00")
    total_vat_calc = Decimal("0.00")

    def _col_center(i: int) -> float:
        return xs[i] + widths[i] / 2

    for pos in positions:
        y = _maybe_new_page(y)
        name = str(pos.get("name", ""))
        qty = Decimal(str(pos.get("qty", 0)))
        unit = Decimal(str(pos.get("unit_price", 0)))

        net = (unit * qty).quantize(Decimal("0.01"))
        vat = (net * ust_satz / Decimal("100")).quantize(Decimal("0.01"))
        gross = (net + vat).quantize(Decimal("0.01"))

        total_net_calc += net
        total_vat_calc += vat

        name_lines = _wrap_text(name, max_name_w, size=9.5, font=FONT)
        for i, line in enumerate(name_lines):
            if i == 0:
                c.drawString(xs[0], y, line)
                c.drawCentredString(_col_center(1), y, str(qty))
                c.drawCentredString(_col_center(2), y, eur(unit))
                c.drawCentredString(_col_center(3), y, eur(vat))
                c.drawCentredString(_col_center(4), y, eur(gross))
            else:
                c.drawString(xs[0], y, line)
            y -= TABLE_LH
            y = _maybe_new_page(y)

    total_net = total_net_calc.quantize(Decimal("0.01"))
    total_vat = total_vat_calc.quantize(Decimal("0.01"))
    total_gross = (total_net + total_vat).quantize(Decimal("0.01"))

    y -= 2 * mm
    c.setLineWidth(0.5)
    c.line(MARGIN_L, y, MARGIN_L + content_w, y)
    y -= 5 * mm

    y = _draw_totals_box(c, MARGIN_L + content_w, y, total_net, total_vat, total_gross, f"{ust_satz}")

    y -= 8 * mm
    c.setFont(FONT, 9)
    c.drawString(MARGIN_L, y, "Zahlungsziel: 14 Tage ohne Abzug.")
    y -= 5 * mm
    c.drawString(MARGIN_L, y, f"Verwendungszweck: {rechnungsnr} - {pname}")

    _draw_footer(c, provider)
    c.showPage()
    c.save()
    buf.seek(0)
    return buf


# ---------------------------------------------------------------------------
# Pflegeantrag PDF (template overlay)
# ---------------------------------------------------------------------------

def render_pflegeantrag(data: dict, template_path: str | None = None) -> BytesIO:
    if template_path is None:
        template_path = str(STATIC_DIR / "Pflegeantrag.pdf")

    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setFont("Courier", 11)

    name = (data.get("name") or "").strip()
    geburtsdatum = (data.get("geburtsdatum") or "").strip()
    versichertennr = (data.get("versichertennr") or "").strip()
    anschrift = (data.get("anschrift") or data.get("adresse") or "").strip()
    pflegekasse = (data.get("pflegekasse") or "").strip()

    c.drawString(mmx(13), mmy(263), name)
    c.drawString(mmx(63), mmy(263), geburtsdatum)
    c.drawString(mmx(101), mmy(263), versichertennr)
    c.drawString(mmx(13), mmy(248), anschrift)
    c.drawString(mmx(111), mmy(248), pflegekasse)

    c.showPage()
    c.save()
    buf.seek(0)
    return _merge_overlay(template_path, buf)


# ---------------------------------------------------------------------------
# Pflegeantrag PDF from PflegehmPatient model
# ---------------------------------------------------------------------------

def generate_pflegeantrag_pdf(patient: Any) -> BytesIO:
    """Generate a Pflegeantrag PDF for a PflegehmPatient."""
    geb = ""
    if patient.geburtsdatum:
        geb = patient.geburtsdatum.strftime("%d.%m.%Y")

    kasse_name = ""
    if patient.kasse:
        kasse_name = patient.kasse.name or ""

    data = {
        "name": patient.name or "",
        "geburtsdatum": geb,
        "versichertennr": patient.versichertennummer or "",
        "anschrift": patient.address or "",
        "pflegekasse": kasse_name,
    }
    return render_pflegeantrag(data)


# ---------------------------------------------------------------------------
# Rechnung PDF from Abrechnung + PflegehmSettings
# ---------------------------------------------------------------------------

def generate_rechnung_pdf(
    abrechnung: Any,
    positionen: list,
    settings: Any,
) -> BytesIO:
    """Generate an invoice PDF using PflegehmSettings for provider data."""
    cfg = _settings_to_cfg(settings)
    return make_invoice_pdf_from_abrechnung(abrechnung, cfg=cfg)


def _settings_to_cfg(settings: Any) -> dict:
    """Convert PflegehmSettings model to cfg dict used by PDF renderer."""
    if settings is None:
        return {}
    return {
        "name": settings.firma_name or "",
        "strasse": "",  # address is combined in firma_address
        "plz": "",
        "ort": settings.firma_address or "",
        "kontakt_telefon": settings.firma_phone or settings.kontakt_telefon or "",
        "kontakt_person": settings.kontakt_person or "",
        "kontakt_fax": settings.kontakt_fax or "",
        "email_absender": settings.email_absender or "",
        "ik": settings.ik or "000000000",
        "abrechnungscode": settings.abrechnungscode or "",
        "tarifkennzeichen": settings.tarifkennzeichen or "",
        "ust_satz": str(settings.ust_satz or "19"),
        "bank_name": settings.bank_name or "",
        "bank_iban": settings.bank_iban or "",
        "bank_bic": settings.bank_bic or "",
        "smtp_server": settings.smtp_server or "",
        "smtp_port": settings.smtp_port,
        "smtp_user": settings.smtp_user or "",
        "smtp_password": settings.smtp_password or "",
        "smtp_use_tls": settings.smtp_use_tls,
    }


# ---------------------------------------------------------------------------
# Unterschrift Eins PDF (template overlay)
# ---------------------------------------------------------------------------

# Koordinaten (aus pflegekreuzer/app/pdf_unterschrift_eins.py)
_DATE1_X_MM = 91.0
_DATE1_Y_MM = 167.0
_DATE1_STEP_MM = 5.4
_DATE2_X_MM = 28.5
_DATE2_Y_MM = 107.0
_DATE2_STEP_MM = 5.4
_MITARBEITER_X_MM = 88.0
_MITARBEITER_Y_MM = 158.0


def _normalize_datum_numeric(raw: str) -> str:
    if not raw:
        return ""
    s = raw.strip()
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%Y.%m.%d", "%d-%m-%Y"):
        try:
            dt = datetime.strptime(s, fmt)
            return f"{dt.day:02d}{dt.month:02d}{dt.year:04d}"
        except ValueError:
            pass
    only_digits = "".join(ch for ch in s if ch.isdigit())
    return only_digits[:8]


def _draw_spaced_text_mm(
    c: canvas.Canvas,
    x_mm: float,
    y_mm: float,
    text: str,
    step_mm: float = 3.0,
    font: str = "Courier",
    size: int = 11,
    max_len: int | None = None,
) -> None:
    if not text:
        return
    c.saveState()
    c.setFont(font, size)
    step = step_mm * mm
    n = len(text) if max_len is None else min(max_len, len(text))
    x0 = mmx(x_mm)
    y0 = mmy(y_mm)
    for i in range(n):
        c.drawString(x0 + i * step, y0, text[i])
    c.restoreState()


def render_unterschrift_eins(data: dict, template_path: str | None = None) -> BytesIO:
    """Render unterschrift_eins.pdf overlay with date and staff name."""
    if template_path is None:
        template_path = str(STATIC_DIR / "unterschrift_eins.pdf")

    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setFont("Courier", 11)

    beratung_datum_raw = (data.get("beratung_datum") or "").strip()
    beratung_datum2_raw = (data.get("beratung_datum_2") or "").strip()
    beratung_mitarbeiter = (data.get("beratung_mitarbeiter") or "").strip()

    datum1 = _normalize_datum_numeric(beratung_datum_raw)
    datum2 = _normalize_datum_numeric(beratung_datum2_raw or beratung_datum_raw)

    if datum1:
        _draw_spaced_text_mm(
            c, x_mm=_DATE1_X_MM, y_mm=_DATE1_Y_MM, text=datum1,
            step_mm=_DATE1_STEP_MM, font="Courier", size=11, max_len=8,
        )
    if datum2:
        _draw_spaced_text_mm(
            c, x_mm=_DATE2_X_MM, y_mm=_DATE2_Y_MM, text=datum2,
            step_mm=_DATE2_STEP_MM, font="Courier", size=11, max_len=8,
        )
    if beratung_mitarbeiter:
        c.drawString(mmx(_MITARBEITER_X_MM), mmy(_MITARBEITER_Y_MM), beratung_mitarbeiter)

    c.showPage()
    c.save()
    buf.seek(0)
    return _merge_overlay(template_path, buf)


def generate_unterschrift_pdf(patient: Any, data: dict | None = None) -> BytesIO:
    """Generate unterschrift_eins.pdf for a PflegehmPatient."""
    d = dict(data or {})
    d.setdefault("name", patient.name or "")
    return render_unterschrift_eins(d)


# ---------------------------------------------------------------------------
# Begleitzettel PDF
# ---------------------------------------------------------------------------

def render_begleitzettel(
    absender: dict,
    empfaenger: dict,
    abrechnungsmonat: str,
    positionen_summary: list[dict],
    versanddatum: str | None = None,
) -> BytesIO:
    """Render a Begleitzettel (cover sheet) for an EDIFACT shipment."""
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)

    y = _draw_header(c, "Begleitzettel")
    y -= BLOCK_GAP

    # Absender
    c.setFont(FONT_B, 10)
    c.drawString(MARGIN_L, y, "Absender:")
    y -= LINE_H
    c.setFont(FONT, 10)
    for line in (absender.get("name", ""), absender.get("addr", ""), f"IK: {absender.get('ik', '')}"):
        if line.strip():
            c.drawString(MARGIN_L, y, line.strip())
            y -= LINE_H
    y -= BLOCK_GAP / 2

    # Empfaenger
    c.setFont(FONT_B, 10)
    c.drawString(MARGIN_L, y, "Empfaenger (Datenannahmestelle):")
    y -= LINE_H
    c.setFont(FONT, 10)
    for line in (empfaenger.get("name", ""), empfaenger.get("addr", ""), f"IK: {empfaenger.get('ik', '')}"):
        if line.strip():
            c.drawString(MARGIN_L, y, line.strip())
            y -= LINE_H
    y -= BLOCK_GAP

    # Meta
    vm = _fmt_versorgungsmonat(abrechnungsmonat)
    vd = versanddatum or datetime.now().strftime("%d.%m.%Y")
    y = _draw_kv(c, MARGIN_L, y, [
        ("Abrechnungsmonat:", vm),
        ("Versanddatum:", vd),
    ], label_w=38 * mm, line_h=LINE_H, size=10)
    y -= BLOCK_GAP

    # Positionen-Zusammenfassung
    if positionen_summary:
        c.setFont(FONT_B, 10)
        c.drawString(MARGIN_L, y, "Positionen:")
        y -= LINE_H * 1.2
        c.setFont(FONT, 9.5)
        for pos in positionen_summary:
            name = pos.get("name", "")
            menge = pos.get("menge", 0)
            betrag = pos.get("betrag", 0.0)
            line = f"{name}  x{menge}  {eur(betrag)}"
            c.drawString(MARGIN_L + 4 * mm, y, line)
            y -= LINE_H

    c.showPage()
    c.save()
    buf.seek(0)
    return buf


def generate_begleitzettel_pdf(abrechnung: Any, cfg: dict) -> BytesIO:
    """Generate Begleitzettel from Abrechnung + cfg."""
    provider = _provider_from_cfg(cfg)
    kasse = abrechnung.kasse

    absender = {
        "name": provider.get("name", ""),
        "addr": provider.get("addr", ""),
        "ik": provider.get("ik", ""),
    }
    empfaenger = {
        "name": kasse.name if kasse else "",
        "addr": kasse.address if kasse else "",
        "ik": (kasse.annahmestelle_ik or kasse.ik) if kasse else "",
    }

    positionen_summary = []
    for pos in (abrechnung.positionen or []):
        hm = pos.hilfsmittel
        positionen_summary.append({
            "name": hm.bezeichnung if hm else "",
            "menge": pos.menge,
            "betrag": pos.betrag_gesamt,
        })

    return render_begleitzettel(
        absender=absender,
        empfaenger=empfaenger,
        abrechnungsmonat=abrechnung.abrechnungsmonat,
        positionen_summary=positionen_summary,
    )


# ---------------------------------------------------------------------------
# Antrag Kasse PDF (cover letter to insurance)
# ---------------------------------------------------------------------------

def render_antrag_kasse(
    absender: dict,
    empfaenger: dict,
    patient_name: str,
    versichertennummer: str,
    abrechnungsmonat: str,
    positionen_summary: list[dict],
) -> BytesIO:
    """Render an Antrag-Anschreiben to the Krankenkasse."""
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)

    y = _draw_header(c, "Antrag auf Kostenuebernahme")
    y -= BLOCK_GAP

    # Absender (right side)
    total_w = PAGE_W - MARGIN_L - MARGIN_R
    left_w = total_w * 0.55
    right_w = total_w - left_w - 10 * mm

    # Empfaenger left
    c.setFont(FONT_B, 10)
    empf_lines = [empfaenger.get("name", "")]
    if empfaenger.get("addr"):
        empf_lines.extend(empfaenger["addr"].splitlines())
    for line in empf_lines:
        if line.strip():
            c.drawString(MARGIN_L, y, line.strip())
            y -= LINE_H

    y -= BLOCK_GAP

    # Absender right block
    abs_y = PAGE_H - MARGIN_T - HEADER_H - BLOCK_GAP
    x_right = MARGIN_L + left_w + 10 * mm
    c.setFont(FONT, 9)
    for line in (absender.get("name", ""), absender.get("addr", ""), f"IK: {absender.get('ik', '')}"):
        if line.strip():
            c.drawString(x_right, abs_y, line.strip())
            abs_y -= LINE_H

    # Date
    c.setFont(FONT, 10)
    c.drawRightString(PAGE_W - MARGIN_R, y, datetime.now().strftime("%d.%m.%Y"))
    y -= BLOCK_GAP

    # Subject
    vm = _fmt_versorgungsmonat(abrechnungsmonat)
    c.setFont(FONT_B, 11)
    c.drawString(MARGIN_L, y, f"Antrag auf Kostenuebernahme - Pflegehilfsmittel ({vm})")
    y -= BLOCK_GAP * 1.5

    # Body
    c.setFont(FONT, 10)
    body_lines = [
        "Sehr geehrte Damen und Herren,",
        "",
        f"hiermit beantragen wir die Kostenuebernahme fuer die Versorgung mit",
        f"zum Verbrauch bestimmten Pflegehilfsmitteln gemaess Paragraph 40 SGB XI",
        f"fuer den Versorgungsmonat {vm}.",
        "",
        f"Versicherte/r: {patient_name}",
        f"Versichertennr.: {versichertennummer}",
        "",
        "Folgende Positionen wurden geliefert:",
    ]
    for line in body_lines:
        c.drawString(MARGIN_L, y, line)
        y -= LINE_H

    y -= LINE_H * 0.5

    # Table
    if positionen_summary:
        c.setFont(FONT, 9.5)
        for pos in positionen_summary:
            name = pos.get("name", "")
            menge = pos.get("menge", 0)
            betrag = pos.get("betrag", 0.0)
            c.drawString(MARGIN_L + 4 * mm, y, f"- {name}  x{menge}  {eur(betrag)}")
            y -= LINE_H

    y -= BLOCK_GAP
    c.setFont(FONT, 10)
    c.drawString(MARGIN_L, y, "Wir bitten um Genehmigung und Kostenuebernahme.")
    y -= LINE_H * 2
    c.drawString(MARGIN_L, y, "Mit freundlichen Gruessen")
    y -= LINE_H * 2
    c.drawString(MARGIN_L, y, absender.get("name", ""))

    c.showPage()
    c.save()
    buf.seek(0)
    return buf


def generate_antrag_kasse_pdf(abrechnung: Any, cfg: dict) -> BytesIO:
    """Generate Antrag Kasse PDF from Abrechnung + cfg."""
    provider = _provider_from_cfg(cfg)
    kasse = abrechnung.kasse

    absender = {
        "name": provider.get("name", ""),
        "addr": provider.get("addr", ""),
        "ik": provider.get("ik", ""),
    }
    empfaenger = {
        "name": kasse.name if kasse else "",
        "addr": kasse.address if kasse else "",
    }

    positionen_summary = []
    for pos in (abrechnung.positionen or []):
        hm = pos.hilfsmittel
        positionen_summary.append({
            "name": hm.bezeichnung if hm else "",
            "menge": pos.menge,
            "betrag": pos.betrag_gesamt,
        })

    return render_antrag_kasse(
        absender=absender,
        empfaenger=empfaenger,
        patient_name=abrechnung.patient_name,
        versichertennummer=abrechnung.versichertennummer,
        abrechnungsmonat=abrechnung.abrechnungsmonat,
        positionen_summary=positionen_summary,
    )


def generate_antrag_kasse_for_patient(patient: Any, cfg: dict) -> BytesIO:
    """Generate a generic Antrag Kasse PDF for a patient (not tied to specific Abrechnung)."""
    provider = _provider_from_cfg(cfg)
    kasse = patient.kasse

    absender = {
        "name": provider.get("name", ""),
        "addr": provider.get("addr", ""),
        "ik": provider.get("ik", ""),
    }
    empfaenger = {
        "name": kasse.name if kasse else "",
        "addr": kasse.address if kasse else "",
    }

    geb = ""
    if patient.geburtsdatum:
        geb = patient.geburtsdatum.strftime("%d.%m.%Y")

    now = datetime.now()
    monat = now.strftime("%Y-%m")

    return render_antrag_kasse(
        absender=absender,
        empfaenger=empfaenger,
        patient_name=patient.name or "",
        versichertennummer=patient.versichertennummer or "",
        abrechnungsmonat=monat,
        positionen_summary=[],
    )


# ---------------------------------------------------------------------------
# PDF Combine (merge multiple PDFs)
# ---------------------------------------------------------------------------

def combine_pdfs(pdf_buffers: list[BytesIO]) -> BytesIO:
    """Merge multiple PDF BytesIO objects into one."""
    writer = PdfWriter()
    for buf in pdf_buffers:
        buf.seek(0)
        reader = PdfReader(buf)
        for page in reader.pages:
            writer.add_page(page)
    out = BytesIO()
    writer.write(out)
    out.seek(0)
    return out


def generate_antrag_komplett_pdf(patient: Any, cfg: dict) -> BytesIO:
    """Generate combined PDF: Pflegeantrag + Unterschrift + Antrag Kasse."""
    parts: list[BytesIO] = []

    # 1. Pflegeantrag
    parts.append(generate_pflegeantrag_pdf(patient))

    # 2. Unterschrift Eins
    parts.append(generate_unterschrift_pdf(patient))

    # 3. Antrag Kasse
    parts.append(generate_antrag_kasse_for_patient(patient, cfg))

    return combine_pdfs(parts)


# ---------------------------------------------------------------------------
# PDF text extraction (parse patient data from uploaded PDF)
# ---------------------------------------------------------------------------

def parse_patient_from_pdf(pdf_bytes: bytes) -> dict:
    """Try to extract Name, Versichertennr, Geburtsdatum from a PDF."""
    try:
        reader = PdfReader(BytesIO(pdf_bytes))
    except Exception:
        return {}

    text = ""
    for page in reader.pages:
        text += (page.extract_text() or "") + "\n"

    result: dict[str, str] = {}

    # Versichertennummer patterns
    vsnr_patterns = [
        r"[A-Z]\d{9}",  # e.g. A123456789
        r"Versichertennr\.?\s*:?\s*([A-Z0-9]+)",
        r"Vers\.\s*-?\s*Nr\.?\s*:?\s*([A-Z0-9]+)",
    ]
    for pat in vsnr_patterns:
        m = re.search(pat, text)
        if m:
            result["versichertennummer"] = m.group(0) if not m.groups() else m.group(1)
            break

    # Geburtsdatum
    geb_patterns = [
        r"Geburtsdatum\s*:?\s*(\d{2}\.\d{2}\.\d{4})",
        r"geb\.\s*:?\s*(\d{2}\.\d{2}\.\d{4})",
        r"geboren\s+am\s*:?\s*(\d{2}\.\d{2}\.\d{4})",
    ]
    for pat in geb_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            result["geburtsdatum"] = m.group(1)
            break

    # Name
    name_patterns = [
        r"Name\s*:?\s*(.+)",
        r"Patient\s*:?\s*(.+)",
        r"Versicherte/?r?\s*:?\s*(.+)",
    ]
    for pat in name_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            name_candidate = m.group(1).strip()
            # Limit to reasonable length and filter out noise
            if 3 < len(name_candidate) < 100:
                result["name"] = name_candidate.split("\n")[0].strip()
                break

    return result
