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
# Kalibriert gegen Patti-Leistungsnachweis-Muster (April 2026).

# Monat + Jahr in der Kopfzeile:
# "Nummer: 5501   Monat: __ / 20 __"
MONTH_X, MONTH_Y = 475, 778
YEAR_X, YEAR_Y = 538, 778

# Zwei Tabellen nebeneinander: links Tage 1-16, rechts Tage 17-31.
# Die Tag-Zahlen sind schon im PDF gedruckt — wir schreiben NUR
# Stunden und Km in die entsprechenden Zellen.
LEFT_HOURS_X = 105
LEFT_KM_X = 142
RIGHT_HOURS_X = 355
RIGHT_KM_X = 392

# Y-Baseline der Zeile für Tag 1 bzw. Tag 17 (beide Tabellen starten
# auf gleicher Höhe). Delta zwischen zwei Zeilen: ROW_HEIGHT.
ROW_FIRST_BASELINE = 473
ROW_HEIGHT = 24.5

# Unterschriften-Zone am unteren Rand
SIG_IMG_X = 90
SIG_IMG_Y = 75
SIG_IMG_W = 170
SIG_IMG_H = 35
# "Unterschrieben vom Patienten: ..." UNTER dem Signatur-Bild, damit
# sie nicht in den Paragraph darüber reinrutscht.
SIG_META_X = 60
SIG_META_Y = 55


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

    # Monat / Jahr in der Kopfzeile
    c.setFont("Helvetica", 11)
    c.drawString(MONTH_X, MONTH_Y, f"{month:02d}")
    c.drawString(YEAR_X, YEAR_Y, f"{year % 100:02d}")

    # Daten-Zeilen: pro Tag landet der Wert in der passenden Tabelle
    # (Tage 1-16 links, Tage 17-31 rechts). Die Tag-Zahl ist bereits
    # im PDF gedruckt, wir schreiben NUR Stunden und Km.
    c.setFont("Helvetica", 10)
    for day, hours, km in day_rows:
        if 1 <= day <= 16:
            row_index = day - 1
            x_hours = LEFT_HOURS_X
            x_km = LEFT_KM_X
        elif 17 <= day <= 31:
            row_index = day - 17
            x_hours = RIGHT_HOURS_X
            x_km = RIGHT_KM_X
        else:
            continue
        y = ROW_FIRST_BASELINE - row_index * ROW_HEIGHT
        if hours > 0:
            c.drawString(x_hours, y, _format_hours(hours))
        if km:
            c.drawString(x_km, y, _format_km(km))

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
