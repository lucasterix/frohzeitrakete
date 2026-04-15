"""Verhinderungspflege-Antrag-Generator.

Holt das VP-Antrag-PDF direkt aus Patti (mit Query-Param für die
Pflegeperson) und überlagert die Patient-Unterschrift + Datum unten
auf der vorgesehenen Linie.
"""

from __future__ import annotations

import io
import logging
import xml.etree.ElementTree as ET
from datetime import date, datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from pypdf import PdfReader, PdfWriter
from sqlalchemy.orm import Session

from app.clients.patti_client import PattiClient
from app.models.signature_asset import SignatureAsset
from app.models.signature_event import SignatureEvent


logger = logging.getLogger(__name__)


# ---------- Koordinaten-Konstanten (Punkte, A4 = 595 × 842) ----------
# Ebenfalls noch zu kalibrieren wenn das erste echte VP-Antrag-PDF
# vorliegt — alle Werte sind Schätzungen.

# Patient-Unterschrift unten auf der "_______ (Unterschrift)"-Linie
SIG_IMG_X = 75
SIG_IMG_Y = 90
SIG_IMG_W = 220
SIG_IMG_H = 40

# Meta-Zeile direkt unter dem Signatur-Bild: "Unterschrieben von
# <Patient> · 14.04.2026, 09:30 Uhr"
SIG_META_X = 75
SIG_META_Y = 70

# Pflegeperson auf der oberen "_______"-Linie. Wird normalerweise
# direkt von Patti via Query-Param ausgefüllt; Backup-Overlay falls
# Patti den Param mal nicht honoriert.
PFLEGEPERSON_X = 200
PFLEGEPERSON_Y = 350


def _draw_signature_svg(
    c: canvas.Canvas, svg_content: str, x: float, y: float, w: float, h: float
) -> None:
    """Mini-SVG-Renderer für die M/L-Pfade die unser SvgBuilder erzeugt."""
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


def _build_overlay(
    *,
    signature_svg: str | None,
    signer_name: str | None,
    signed_at: datetime | None,
) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)

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


def _overlay_on_pdf(patti_pdf: bytes, overlay_pdf: bytes) -> bytes:
    try:
        base = PdfReader(io.BytesIO(patti_pdf))
        overlay = PdfReader(io.BytesIO(overlay_pdf))
    except Exception as exc:  # noqa: BLE001
        logger.warning("vp_antrag_overlay_read_failed: %s", exc)
        return patti_pdf

    if not base.pages or not overlay.pages:
        return patti_pdf

    writer = PdfWriter()
    first = base.pages[0]
    try:
        first.merge_page(overlay.pages[0])
    except Exception as exc:  # noqa: BLE001
        logger.warning("vp_antrag_overlay_merge_failed: %s", exc)
        return patti_pdf
    writer.add_page(first)
    for p in base.pages[1:]:
        writer.add_page(p)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def fetch_filled_vp_antrag_pdf(
    db: Session,
    *,
    signature_event_id: int,
) -> bytes | None:
    """Holt das VP-Antrag-PDF aus Patti und überlagert es mit der
    Patient-Unterschrift aus dem zugehörigen SignatureEvent.

    Pflegeperson wird Patti via Query-Param mitgegeben — kein eigener
    Overlay nötig solange Patti den Param honoriert.

    Period: aktuell hardcoded auf das laufende Halbjahr ab heute. Bei
    Bedarf kann das Admin-Web start/end als Override mitschicken.
    """
    event = (
        db.query(SignatureEvent)
        .filter(SignatureEvent.id == signature_event_id)
        .first()
    )
    if event is None or event.document_type != "vp_antrag":
        return None

    asset = (
        db.query(SignatureAsset)
        .filter(SignatureAsset.signature_event_id == event.id)
        .first()
    )

    pflegeperson = event.signer_name or ""

    # Standard-Zeitraum: vom signed_at-Monat bis Ende des Jahres
    today = date.today()
    start = date(today.year, today.month, 1).isoformat()
    end = date(today.year, 12, 31).isoformat()

    try:
        client = PattiClient()
        client.login()
        patti_pdf = client.get_verhinderungspflegeantrag_pdf(
            event.patient_id,
            start=start,
            end=end,
            pflegeperson=pflegeperson,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "patti_vp_antrag_fetch_failed event=%s err=%s",
            event.id, exc,
        )
        return None

    overlay = _build_overlay(
        signature_svg=asset.svg_content if asset else None,
        signer_name=event.signer_name,
        signed_at=event.signed_at,
    )
    return _overlay_on_pdf(patti_pdf, overlay)
