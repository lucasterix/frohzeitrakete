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
