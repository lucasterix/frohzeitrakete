"""Leistungsnachweis-Generator.

Aggregiert alle Einsätze eines Users bei einem Patienten für einen Monat
und produziert ein PDF-Dokument im Format eines klassischen
Leistungsnachweises mit:

- Kopfzeile (Patient, Betreuer, Monat/Jahr)
- Tabellarische Auflistung der Einsätze mit Datum, Stunden und
  angekreuzten Leistungsarten (Haushaltshilfe, Begleitung, etc.)
- Gesamtstunden + km-Zeile
- Unterschrifts-Feld am Ende. Wenn im Einsatzverlauf bereits eine
  Leistungsnachweis-SVG-Signatur erfasst wurde, wird die **letzte**
  Unterschrift des Monats dort eingeblendet — das entspricht der
  Fachregel "Patti-Leistungsnachweis braucht nur eine Unterschrift,
  aber in der Rakete unterschreibt der Patient jeden Einsatz".

**Patti-Integration**: Die Patti-API hat einen eigenen
Leistungsnachweis-Generator mit QR-Code. Ein direkter Endpoint dafür
ist im aktuellen Patti-Client noch nicht implementiert — sobald der
exakte API-Pfad bekannt ist, kann die Generator-Funktion diesen hier
ersetzen und die gleichen Felder in das aus Patti geladene PDF
eintragen.
"""

from __future__ import annotations

import io
import logging
import xml.etree.ElementTree as ET
from calendar import monthrange
from datetime import date
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.graphics.shapes import Drawing, Path
from reportlab.graphics import renderPDF
from sqlalchemy.orm import Session

from app.clients.patti_client import PattiClient
from app.models.entry import Entry
from app.models.signature_asset import SignatureAsset
from app.models.signature_event import SignatureEvent
from app.models.trip_segment import TripSegment
from app.models.user import User


logger = logging.getLogger(__name__)


# Standard-Leistungsarten für die Ankreuzliste. Match gegen die
# Activity-Strings die die Mobile-App speichert.
LEISTUNGS_KATEGORIEN: list[tuple[str, list[str]]] = [
    ("Haushaltshilfe", ["Alltagshilfe", "Haushalt", "Haushaltshilfe"]),
    ("Gespräche / Aktivierung", ["Gespräche/Aktivierung", "Aktivierung"]),
    ("Begleitung", ["Begleitung"]),
    ("Sonstiges", []),
]


def _month_entries(
    db: Session, *, user_id: int, patient_id: int, year: int, month: int
) -> list[Entry]:
    start = date(year, month, 1)
    end = date(year, month, monthrange(year, month)[1])
    return (
        db.query(Entry)
        .filter(
            Entry.user_id == user_id,
            Entry.patient_id == patient_id,
            Entry.entry_date >= start,
            Entry.entry_date <= end,
            Entry.entry_type == "patient",
        )
        .order_by(Entry.entry_date.asc())
        .all()
    )


def _month_km(
    db: Session, *, user_id: int, patient_id: int, year: int, month: int
) -> float:
    start = date(year, month, 1)
    end = date(year, month, monthrange(year, month)[1])
    segments = (
        db.query(TripSegment)
        .join(Entry, TripSegment.entry_id == Entry.id)
        .filter(
            TripSegment.user_id == user_id,
            Entry.patient_id == patient_id,
            TripSegment.trip_date >= start,
            TripSegment.trip_date <= end,
        )
        .all()
    )
    return round(
        sum(s.distance_km or 0.0 for s in segments), 2
    )


def _latest_signature(
    db: Session, *, patient_id: int, year: int, month: int
) -> tuple[SignatureEvent, SignatureAsset | None] | None:
    start = date(year, month, 1)
    end = date(year, month, monthrange(year, month)[1])
    event = (
        db.query(SignatureEvent)
        .filter(
            SignatureEvent.patient_id == patient_id,
            SignatureEvent.document_type == "leistungsnachweis",
            SignatureEvent.signed_at >= start,
            SignatureEvent.signed_at <= end,
        )
        .order_by(SignatureEvent.signed_at.desc())
        .first()
    )
    if event is None:
        return None
    asset = (
        db.query(SignatureAsset)
        .filter(SignatureAsset.signature_event_id == event.id)
        .first()
    )
    return (event, asset)


def _activity_categories_for_entries(entries: list[Entry]) -> set[str]:
    used: set[str] = set()
    for e in entries:
        tokens = [a.strip().lower() for a in (e.activities or "").split(",") if a.strip()]
        for cat, needles in LEISTUNGS_KATEGORIEN:
            if any(
                needle.lower() in t for t in tokens for needle in needles
            ):
                used.add(cat)
            # "Sonstiges" wird manuell später gesetzt wenn es Tokens gibt
            # die keiner Kategorie zugeordnet sind
    # Sonstiges markieren wenn Aktivitäten da sind die keinem Bucket passen
    known = {
        n.lower()
        for _, needles in LEISTUNGS_KATEGORIEN
        for n in needles
    }
    for e in entries:
        tokens = [a.strip().lower() for a in (e.activities or "").split(",") if a.strip()]
        for t in tokens:
            if not any(k in t or t in k for k in known):
                used.add("Sonstiges")
    return used


def _patient_name(patient_id: int) -> str:
    try:
        client = PattiClient()
        client.login()
        p = client.get_patient(patient_id)
        return p.get("list_name") or f"Patient {patient_id}"
    except Exception:  # noqa: BLE001
        return f"Patient {patient_id}"


def _render_svg_path_as_drawing(svg_content: str, box_w: float, box_h: float) -> Drawing:
    """Mini-SVG-Parser: findet alle <path d="..."/> und <line> Elemente
    und rendert sie in ein ReportLab-Drawing. Unterstützt nur die
    M/L-Subset-Syntax den unser SvgBuilder erzeugt.
    """
    drawing = Drawing(box_w, box_h)
    try:
        root = ET.fromstring(svg_content)
    except ET.ParseError:
        return drawing

    # Ziel-viewBox lesen (width/height aus dem svg-Root)
    try:
        src_w = float(root.get("width") or "400")
        src_h = float(root.get("height") or "160")
    except ValueError:
        src_w, src_h = 400.0, 160.0
    sx = box_w / src_w
    sy = box_h / src_h

    ns = {"svg": "http://www.w3.org/2000/svg"}
    # Pfade — nur M und L/l-Befehle
    for path_el in root.iter():
        tag = path_el.tag.split("}", 1)[-1]
        if tag != "path":
            continue
        d = path_el.get("d") or ""
        if not d:
            continue
        p = Path(strokeColor=colors.black, strokeWidth=1.2, fillColor=None)
        commands = d.replace(",", " ").split()
        i = 0
        cx = cy = 0.0
        started = False
        while i < len(commands):
            cmd = commands[i]
            if cmd in ("M", "L"):
                try:
                    x = float(commands[i + 1]) * sx
                    y = box_h - float(commands[i + 2]) * sy
                except (ValueError, IndexError):
                    break
                cx, cy = x, y
                if cmd == "M" or not started:
                    p.moveTo(x, y)
                    started = True
                else:
                    p.lineTo(x, y)
                i += 3
            else:
                i += 1
        if started:
            drawing.add(p)
    return drawing


def fetch_patti_leistungsnachweis_pdf(
    patient_id: int,
    *,
    year: int | None = None,
    month: int | None = None,
) -> bytes | None:
    """Versucht das Leistungsnachweis-PDF direkt aus Patti zu laden.

    Patti hat unter ``/patients/{id}/leistungsnachweis.pdf`` einen
    serverseitigen PDF-Generator inkl. QR-Code. Rückgabe = PDF-Bytes,
    oder None wenn der Aufruf fehlschlägt (Session expired, 404,
    Patti liefert HTML statt PDF zurück). Fehler werden geloggt aber
    nicht propagiert — der Caller fällt dann auf das Rakete-PDF zurück.
    """
    try:
        client = PattiClient()
        client.login()
        return client.get_leistungsnachweis_pdf(
            patient_id, year=year, month=month
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "patti_leistungsnachweis_fetch_failed patient=%s year=%s month=%s error=%s",
            patient_id,
            year,
            month,
            exc,
        )
        return None


def _day_rows_for_month(
    db: Session,
    *,
    user_id: int,
    patient_id: int,
    year: int,
    month: int,
) -> list[tuple[int, float, float]]:
    """Aggregiert pro Tag: (tag_im_monat, stunden, km_mit_patient).

    Km zählt nur Segmente die zum jeweiligen Patient-Einsatz gehören —
    home_commute / Heimfahrten sind bewusst nicht dabei.
    """
    from collections import defaultdict

    entries = _month_entries(
        db, user_id=user_id, patient_id=patient_id, year=year, month=month
    )
    hours_per_day: dict[int, float] = defaultdict(float)
    for e in entries:
        hours_per_day[e.entry_date.day] += e.hours

    entry_ids = [e.id for e in entries]
    km_per_day: dict[int, float] = defaultdict(float)
    if entry_ids:
        segments = (
            db.query(TripSegment)
            .filter(TripSegment.entry_id.in_(entry_ids))
            .all()
        )
        for s in segments:
            if s.distance_km:
                km_per_day[s.trip_date.day] += s.distance_km

    days = sorted(set(hours_per_day) | set(km_per_day))
    return [
        (
            d,
            round(hours_per_day.get(d, 0.0), 2),
            round(km_per_day.get(d, 0.0), 2),
        )
        for d in days
    ]


def fetch_patti_leistungsnachweis_pdf_filled(
    db: Session,
    *,
    user_id: int,
    patient_id: int,
    year: int,
    month: int,
) -> bytes | None:
    """Lädt das Patti-PDF und überlagert es mit Stunden, Km und
    Unterschrift. Rückgabe = fertig ausgefülltes PDF, oder None wenn
    Patti nichts lieferte.
    """
    from app.services.leistungsnachweis_overlay import overlay_on_patti_pdf

    patti_pdf = fetch_patti_leistungsnachweis_pdf(
        patient_id, year=year, month=month
    )
    if patti_pdf is None:
        return None

    day_rows = _day_rows_for_month(
        db,
        user_id=user_id,
        patient_id=patient_id,
        year=year,
        month=month,
    )
    latest = _latest_signature(
        db, patient_id=patient_id, year=year, month=month
    )
    sig_svg: str | None = None
    signer_name: str | None = None
    signed_at = None
    if latest is not None:
        event, asset = latest
        signer_name = event.signer_name
        signed_at = event.signed_at
        if asset is not None:
            sig_svg = asset.svg_content

    return overlay_on_patti_pdf(
        patti_pdf,
        day_rows=day_rows,
        month=month,
        year=year,
        signature_svg=sig_svg,
        signer_name=signer_name,
        signed_at=signed_at,
    )


def build_leistungsnachweis_pdf(
    db: Session,
    *,
    user_id: int,
    patient_id: int,
    year: int,
    month: int,
) -> bytes:
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise ValueError("user_not_found")

    entries = _month_entries(
        db, user_id=user_id, patient_id=patient_id, year=year, month=month
    )
    total_hours = round(sum(e.hours for e in entries), 2)
    total_km = _month_km(
        db, user_id=user_id, patient_id=patient_id, year=year, month=month
    )
    used_cats = _activity_categories_for_entries(entries)
    latest_sig = _latest_signature(
        db, patient_id=patient_id, year=year, month=month
    )
    patient_name = _patient_name(patient_id)

    month_names = [
        "Januar", "Februar", "März", "April", "Mai", "Juni",
        "Juli", "August", "September", "Oktober", "November", "Dezember",
    ]

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        title=f"Leistungsnachweis {patient_name} {month_names[month-1]} {year}",
    )
    styles = getSampleStyleSheet()
    story: list = []

    # Kopfzeile
    story.append(
        Paragraph("<b>Leistungsnachweis</b>", styles["Heading1"])
    )
    story.append(Spacer(1, 3 * mm))
    story.append(
        Paragraph(
            "FrohZeit Rakete · Fröhlich Dienste", styles["Normal"]
        )
    )
    story.append(Spacer(1, 4 * mm))

    header_data = [
        ["Patient", patient_name],
        ["Betreuer", user.full_name],
        ["Zeitraum", f"{month_names[month-1]} {year}"],
        ["Gesamtstunden", f"{total_hours:.1f} h".replace(".", ",")],
        ["Gefahrene km", f"{total_km:.1f} km".replace(".", ",")],
    ]
    header_table = Table(header_data, colWidths=[45 * mm, 110 * mm])
    header_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    story.append(header_table)
    story.append(Spacer(1, 6 * mm))

    # Ankreuz-Liste der Leistungsarten
    story.append(
        Paragraph(
            "<b>Erbrachte Leistungen im Zeitraum:</b>", styles["Normal"]
        )
    )
    story.append(Spacer(1, 2 * mm))
    tickbox_rows = []
    for cat, _ in LEISTUNGS_KATEGORIEN:
        checked = "☒" if cat in used_cats else "☐"
        tickbox_rows.append([f"{checked}  {cat}"])
    tickbox_table = Table(tickbox_rows, colWidths=[155 * mm])
    tickbox_table.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 11),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]
        )
    )
    story.append(tickbox_table)
    story.append(Spacer(1, 6 * mm))

    # Einzel-Einsätze
    story.append(
        Paragraph("<b>Einsätze:</b>", styles["Normal"])
    )
    story.append(Spacer(1, 2 * mm))
    rows: list[list[Any]] = [["Datum", "Stunden", "Tätigkeiten"]]
    for e in entries:
        rows.append(
            [
                e.entry_date.strftime("%d.%m.%Y"),
                f"{e.hours:.1f}".replace(".", ","),
                e.activities or "",
            ]
        )
    rows.append(
        [
            Paragraph("<b>Summe</b>", styles["Normal"]),
            Paragraph(
                f"<b>{total_hours:.1f}</b>".replace(".", ","),
                styles["Normal"],
            ),
            "",
        ]
    )
    entries_table = Table(
        rows, colWidths=[30 * mm, 25 * mm, 100 * mm]
    )
    entries_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F0F0F0")),
                ("GRID", (0, 0), (-1, -1), 0.3, colors.grey),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    story.append(entries_table)
    story.append(Spacer(1, 10 * mm))

    # Unterschriften-Feld
    story.append(
        Paragraph(
            "<b>Unterschrift Patient</b>", styles["Normal"]
        )
    )
    story.append(Spacer(1, 2 * mm))

    # Metadaten-Zeile direkt über der Unterschrift: wer / wann
    # (fällt weg wenn keine Signatur da ist).
    if latest_sig is not None:
        event, asset = latest_sig
        signed_local = event.signed_at.strftime("%d.%m.%Y, %H:%M Uhr")
        meta_line = (
            f"Unterschrieben vom Patienten: <b>{event.signer_name}</b> · "
            f"{signed_local}"
        )
        story.append(Paragraph(meta_line, styles["Normal"]))
        story.append(Spacer(1, 2 * mm))

        if asset is not None and asset.svg_content:
            drawing = _render_svg_path_as_drawing(
                asset.svg_content, 80 * mm, 25 * mm
            )
            # Drawing in einer Tabelle für saubere Rahmen / Zentrierung
            sig_table = Table(
                [[drawing]],
                colWidths=[165 * mm],
                rowHeights=[27 * mm],
            )
            sig_table.setStyle(
                TableStyle(
                    [
                        ("BOX", (0, 0), (-1, -1), 0.5, colors.grey),
                        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ]
                )
            )
            story.append(sig_table)
        else:
            story.append(
                Paragraph(
                    "<i>Keine SVG-Unterschrift vorhanden.</i>",
                    styles["Normal"],
                )
            )
    else:
        story.append(
            Paragraph(
                "<i>Im Monat wurde noch keine Unterschrift erfasst.</i>",
                styles["Normal"],
            )
        )
    story.append(Spacer(1, 3 * mm))
    story.append(
        Paragraph(
            f"<font size=8 color=grey>FrohZeit Rakete · "
            f"erzeugt {date.today().strftime('%d.%m.%Y')}</font>",
            styles["Normal"],
        )
    )

    doc.build(story)
    return buffer.getvalue()
