"""Overlay für den Patti-Leistungsnachweis.

Patti liefert ein fertiges Leistungsnachweis-PDF inkl. QR-Code zurück.
Wir füllen die leeren Felder mit den Daten aus der Rakete aus:

- Monat (zweistellig) oben rechts
- Jahr (zwei letzte Ziffern) oben rechts
- Tagesweise Aggregation: Tag im Monat, Stunden, Km (nur mit dem
  Patienten gefahren)
- Unterschrift (letzte Patienten-Unterschrift des Monats) am unteren
  Rand mit Name + Datum/Uhrzeit

**Kalibrierung**: die Koordinaten unten sind auf den bekannten
Patti-Leistungsnachweis geschätzt. Sobald ein echter Patti-PDF zum
Abgleich vorliegt, werden die Werte in den Konstanten angepasst —
der gesamte Overlay-Code muss nicht geändert werden.
"""

from __future__ import annotations

import io
import logging
import xml.etree.ElementTree as ET
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from pypdf import PdfReader, PdfWriter


logger = logging.getLogger(__name__)


# ---------- Koordinaten-Konstanten (Punkte, 1pt = 1/72 inch) ----------
# A4 = 595 × 842 Punkte (Breite × Höhe), Ursprung unten links.
# Diese Werte sind erste Schätzungen für den Patti-Leistungsnachweis.
# Anpassbar ohne den Rest des Codes zu berühren.

# Monat + Jahr oben rechts ("Monat 04   Jahr 20 __ __")
MONTH_X, MONTH_Y = 500, 770
YEAR_X, YEAR_Y = 550, 770

# Tages-Tabelle: obere linke Ecke der ersten Daten-Zeile
TABLE_FIRST_ROW_Y = 620
TABLE_ROW_HEIGHT = 14
TABLE_DAY_X = 60
TABLE_HOURS_X = 200
TABLE_KM_X = 340

# Untere Unterschriften-Zone
SIG_META_X = 60
SIG_META_Y = 120
SIG_IMG_X = 60
SIG_IMG_Y = 70
SIG_IMG_W = 200
SIG_IMG_H = 40


def _draw_signature_svg(
    c: canvas.Canvas,
    svg_content: str,
    x: float,
    y: float,
    w: float,
    h: float,
) -> None:
    """Zeichnet ein einfaches M/L-SVG-Pfad-Bündel direkt auf den Canvas.
    Nur die Strich-Syntax die unser SvgBuilder erzeugt wird unterstützt.
    """
    try:
        root = ET.fromstring(svg_content)
    except ET.ParseError:
        return

    try:
        src_w = float(root.get("width") or "400")
        src_h = float(root.get("height") or "160")
    except ValueError:
        src_w, src_h = 400.0, 160.0
    sx = w / src_w
    sy = h / src_h

    c.saveState()
    c.setStrokeColor(colors.black)
    c.setLineWidth(1.2)
    for path_el in root.iter():
        tag = path_el.tag.split("}", 1)[-1]
        if tag != "path":
            continue
        d = path_el.get("d") or ""
        if not d:
            continue
        tokens = d.replace(",", " ").split()
        i = 0
        path = c.beginPath()
        started = False
        while i < len(tokens):
            cmd = tokens[i]
            if cmd in ("M", "L"):
                try:
                    px = x + float(tokens[i + 1]) * sx
                    py = y + h - float(tokens[i + 2]) * sy
                except (ValueError, IndexError):
                    break
                if cmd == "M" or not started:
                    path.moveTo(px, py)
                    started = True
                else:
                    path.lineTo(px, py)
                i += 3
            else:
                i += 1
        if started:
            c.drawPath(path, stroke=1, fill=0)
    c.restoreState()


def _format_hours(h: float) -> str:
    if h == int(h):
        return f"{int(h)}"
    # 1.5 → "1,5"
    return f"{h:.1f}".replace(".", ",")


def _format_km(k: float) -> str:
    if k == 0:
        return ""
    return f"{k:.1f}".replace(".", ",")


def build_overlay(
    *,
    day_rows: list[tuple[int, float, float]],
    month: int,
    year: int,
    signature_svg: str | None,
    signer_name: str | None,
    signed_at: datetime | None,
) -> bytes:
    """Erzeugt ein einseitiges A4-PDF mit nur den zu überlagernden
    Elementen. Leere Bereiche bleiben komplett transparent.
    """
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)

    # Monat / Jahr oben rechts
    c.setFont("Helvetica-Bold", 11)
    c.drawString(MONTH_X, MONTH_Y, f"{month:02d}")
    c.drawString(YEAR_X, YEAR_Y, f"{year % 100:02d}")

    # Daten-Zeilen
    c.setFont("Helvetica", 10)
    for i, (day, hours, km) in enumerate(day_rows):
        y = TABLE_FIRST_ROW_Y - i * TABLE_ROW_HEIGHT
        c.drawString(TABLE_DAY_X, y, f"{day:02d}")
        c.drawString(TABLE_HOURS_X, y, _format_hours(hours))
        if km:
            c.drawString(TABLE_KM_X, y, _format_km(km))

    # Unterschriften-Metadaten + Bild
    if signer_name and signed_at:
        c.setFont("Helvetica", 9)
        meta = (
            f"Unterschrieben vom Patienten: {signer_name} · "
            f"{signed_at.strftime('%d.%m.%Y, %H:%M Uhr')}"
        )
        c.drawString(SIG_META_X, SIG_META_Y, meta)
    if signature_svg:
        _draw_signature_svg(
            c, signature_svg, SIG_IMG_X, SIG_IMG_Y, SIG_IMG_W, SIG_IMG_H
        )

    c.showPage()
    c.save()
    return buf.getvalue()


def overlay_on_patti_pdf(
    patti_pdf: bytes,
    *,
    day_rows: list[tuple[int, float, float]],
    month: int,
    year: int,
    signature_svg: str | None,
    signer_name: str | None,
    signed_at: datetime | None,
) -> bytes:
    """Legt die Rakete-Daten als Overlay auf die erste Seite des
    Patti-PDFs. Rest der Seiten (falls vorhanden) bleibt unberührt.
    """
    overlay_bytes = build_overlay(
        day_rows=day_rows,
        month=month,
        year=year,
        signature_svg=signature_svg,
        signer_name=signer_name,
        signed_at=signed_at,
    )

    try:
        base = PdfReader(io.BytesIO(patti_pdf))
        overlay = PdfReader(io.BytesIO(overlay_bytes))
    except Exception as exc:  # noqa: BLE001
        logger.warning("leistungsnachweis_overlay_read_failed: %s", exc)
        return patti_pdf

    if len(base.pages) == 0 or len(overlay.pages) == 0:
        return patti_pdf

    writer = PdfWriter()
    first = base.pages[0]
    try:
        first.merge_page(overlay.pages[0])
    except Exception as exc:  # noqa: BLE001
        logger.warning("leistungsnachweis_overlay_merge_failed: %s", exc)
        return patti_pdf

    writer.add_page(first)
    for p in base.pages[1:]:
        writer.add_page(p)

    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()
