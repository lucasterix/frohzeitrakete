"""Stundenbudgetabfrage – PDF-Generator und DB-Logik.

Generiert ein formelles Anschreiben an die Pflegekasse eines Patienten,
das das Entlastungsbudget nach §45b SGB XI abfragt. Die letzte
Leistungsnachweis-Unterschrift des Patienten wird als SVG-Overlay
auf die Unterschriftszeile gelegt.
"""

from __future__ import annotations

import io
import logging
from datetime import date, datetime
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from sqlalchemy.orm import Session

from app.clients.patti_client import PattiClient
from app.models.budget_inquiry import BudgetInquiry
from app.models.signature_asset import SignatureAsset
from app.models.signature_event import SignatureEvent
from app.models.user import User
from app.services.vp_antrag_service import _draw_signature_svg

logger = logging.getLogger(__name__)

# ---------- Layout-Konstanten (A4 = 595 × 842 pt) ----------
PAGE_W, PAGE_H = A4
MARGIN_L = 25 * mm
MARGIN_R = 20 * mm
FONT = "Helvetica"
FONT_B = "Helvetica-Bold"

# Absender-Daten
ABSENDER_FIRMA = "Fröhlich Dienste GmbH"
ABSENDER_STRASSE = "Kasseler Str. 70"
ABSENDER_ORT = "37083 Göttingen"
ABSENDER_TEL = "Tel.: 0551 / 999 58 998"
ABSENDER_EMAIL = "info@froehlichdienste.de"


def _get_latest_leistungsnachweis_signature(
    db: Session, patient_id: int
) -> tuple[SignatureEvent | None, SignatureAsset | None]:
    """Neueste Leistungsnachweis-Signatur + Asset für einen Patienten."""
    event = (
        db.query(SignatureEvent)
        .filter(
            SignatureEvent.patient_id == patient_id,
            SignatureEvent.document_type == "leistungsnachweis",
        )
        .order_by(SignatureEvent.signed_at.desc())
        .first()
    )
    if event is None:
        return None, None
    asset = (
        db.query(SignatureAsset)
        .filter(SignatureAsset.signature_event_id == event.id)
        .first()
    )
    return event, asset


def _fetch_patient_data(client: PattiClient, patient_id: int) -> dict[str, Any]:
    """Holt Stammdaten eines Patienten aus Patti."""
    p = client.get_patient(patient_id)
    person = p.get("person") or p.get("patient_person") or {}
    first = (person.get("first_name") or p.get("firstName") or "").strip()
    last = (person.get("last_name") or p.get("lastName") or "").strip()
    name = f"{first} {last}".strip() or f"Patient {patient_id}"

    born_at = person.get("born_at") or ""
    birthday = born_at.split("T")[0] if born_at else ""

    insurance_number = p.get("insurance_number") or ""
    insurance_company_id = p.get("insurance_company_id")

    kasse_name = ""
    kasse_ik = ""
    if insurance_company_id:
        try:
            company = client.get_company(insurance_company_id)
            kasse_name = company.get("name") or ""
            kasse_ik = company.get("ik") or ""
        except Exception:  # noqa: BLE001
            pass

    return {
        "name": name,
        "first_name": first,
        "last_name": last,
        "birthday": birthday,
        "insurance_number": insurance_number,
        "kasse_name": kasse_name,
        "kasse_ik": kasse_ik,
    }


def _format_german_date(iso_date: str | None) -> str:
    """ISO-Datum → dd.mm.yyyy."""
    if not iso_date:
        return ""
    try:
        d = date.fromisoformat(iso_date)
        return d.strftime("%d.%m.%Y")
    except (ValueError, TypeError):
        return iso_date


def generate_budget_inquiry_pdf(
    db: Session,
    patient_id: int,
    user_id: int,
) -> bytes:
    """Generiert das Budgetanfrage-PDF für einen Patienten.

    Returns: PDF als bytes.
    """
    # Betreuer-Name
    user = db.query(User).filter(User.id == user_id).first()
    betreuer_name = user.full_name if user else "Betreuer"

    # Patient-Daten aus Patti
    client = PattiClient()
    client.login()
    pdata = _fetch_patient_data(client, patient_id)

    # Letzte Leistungsnachweis-Signatur
    sig_event, sig_asset = _get_latest_leistungsnachweis_signature(db, patient_id)

    # PDF erzeugen
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)

    y = PAGE_H - 30 * mm

    # ---- Absender (klein, oben) ----
    c.setFont(FONT, 7)
    c.drawString(
        MARGIN_L, y,
        f"{ABSENDER_FIRMA} · {ABSENDER_STRASSE} · {ABSENDER_ORT}",
    )
    y -= 14 * mm

    # ---- Empfänger ----
    c.setFont(FONT, 11)
    c.drawString(MARGIN_L, y, pdata["kasse_name"] or "Pflegekasse")
    y -= 5 * mm
    # Kasse-Adresse nicht immer verfügbar — Platz für manuelle Ergänzung
    if pdata["kasse_ik"]:
        c.setFont(FONT, 9)
        c.drawString(MARGIN_L, y, f"IK: {pdata['kasse_ik']}")
        y -= 5 * mm
    y -= 10 * mm

    # ---- Datum rechts ----
    c.setFont(FONT, 10)
    heute = date.today().strftime("%d.%m.%Y")
    c.drawRightString(PAGE_W - MARGIN_R, y, f"Göttingen, {heute}")
    y -= 12 * mm

    # ---- Betreff ----
    c.setFont(FONT_B, 11)
    c.drawString(
        MARGIN_L, y,
        "Betreff: Abfrage des Entlastungsbudgets gemäß §45b SGB XI",
    )
    y -= 7 * mm

    # ---- Versichertendaten ----
    c.setFont(FONT, 10)
    c.drawString(MARGIN_L, y, f"Versicherte/r: {pdata['name']}")
    y -= 5 * mm
    c.drawString(
        MARGIN_L, y,
        f"Versichertennummer: {pdata['insurance_number'] or '—'}",
    )
    y -= 5 * mm
    c.drawString(
        MARGIN_L, y,
        f"Geburtsdatum: {_format_german_date(pdata['birthday']) or '—'}",
    )
    y -= 12 * mm

    # ---- Anrede + Brieftext ----
    c.setFont(FONT, 10)
    line_h = 4.5 * mm

    lines = [
        "Sehr geehrte Damen und Herren,",
        "",
        "als zugelassener Anbieter von Angeboten zur Unterstützung im Alltag",
        "gemäß §45a SGB XI betreuen wir den/die o.g. Versicherte/n.",
        "",
        "Wir bitten Sie, uns den aktuellen Stand des Entlastungsbetrages",
        "gemäß §45b SGB XI mitzuteilen:",
        "",
        "  – Aktuell verfügbares monatliches Budget",
        "  – Bereits in Anspruch genommene Leistungen im laufenden Jahr",
        "  – Eventuelle Übertragungen aus dem Vorjahr gemäß §45b Abs. 1 Satz 3 SGB XI",
        "  – Sofern vorhanden: Umwandlungsanspruch nach §45a Abs. 4 SGB XI",
        "",
        "Für Rückfragen stehen wir Ihnen gerne zur Verfügung.",
        "",
        "Mit freundlichen Grüßen",
        "",
        ABSENDER_FIRMA,
        betreuer_name,
    ]

    for line in lines:
        c.drawString(MARGIN_L, y, line)
        y -= line_h

    # ---- Unterschriftszeile ----
    y -= 8 * mm
    c.setStrokeColor(colors.grey)
    c.setLineWidth(0.5)
    c.line(MARGIN_L, y, MARGIN_L + 160 * mm, y)

    # Unterschrift-SVG drüberlegen
    sig_y = y + 2 * mm
    sig_w = 180
    sig_h = 30
    if sig_asset and sig_asset.svg_content:
        _draw_signature_svg(
            c, sig_asset.svg_content,
            MARGIN_L, sig_y, sig_w, sig_h,
        )

    y -= 5 * mm
    c.setFont(FONT, 8)
    c.setFillColor(colors.grey)
    sig_date_str = ""
    if sig_event and sig_event.signed_at:
        sig_date_str = sig_event.signed_at.strftime("%d.%m.%Y")
    c.drawString(
        MARGIN_L, y,
        f"Unterschrift des Versicherten / Bevollmächtigten: "
        f"{pdata['name']}, {sig_date_str}",
    )

    c.setFillColor(colors.black)

    # ---- Footer ----
    c.setFont(FONT, 7)
    c.setFillColor(colors.grey)
    footer_y = 20 * mm
    c.drawString(
        MARGIN_L, footer_y,
        f"{ABSENDER_FIRMA} · {ABSENDER_STRASSE} · {ABSENDER_ORT} · "
        f"{ABSENDER_TEL} · {ABSENDER_EMAIL}",
    )
    c.setFillColor(colors.black)

    c.showPage()
    c.save()
    return buf.getvalue()


def _save_inquiry(
    db: Session,
    patient_id: int,
    user_id: int,
    pdata: dict[str, Any],
    sig_event: SignatureEvent | None,
    pdf_bytes: bytes,
) -> BudgetInquiry:
    """Speichert oder aktualisiert eine BudgetInquiry in der DB."""
    inquiry = BudgetInquiry(
        patient_id=patient_id,
        patient_name=pdata["name"],
        versichertennummer=pdata.get("insurance_number"),
        geburtsdatum=pdata.get("birthday"),
        kasse_name=pdata.get("kasse_name"),
        kasse_ik=pdata.get("kasse_ik"),
        user_id=user_id,
        signature_event_id=sig_event.id if sig_event else None,
    )
    db.add(inquiry)
    db.commit()
    db.refresh(inquiry)
    return inquiry


def generate_and_save(
    db: Session,
    patient_id: int,
    user_id: int,
) -> dict[str, Any]:
    """Generiert PDF + speichert DB-Eintrag. Gibt dict zurück."""
    # Patient-Daten holen (für DB-Eintrag)
    client = PattiClient()
    client.login()
    pdata = _fetch_patient_data(client, patient_id)

    sig_event, _ = _get_latest_leistungsnachweis_signature(db, patient_id)

    # PDF generieren
    pdf_bytes = generate_budget_inquiry_pdf(db, patient_id, user_id)

    # DB speichern
    inquiry = _save_inquiry(db, patient_id, user_id, pdata, sig_event, pdf_bytes)

    return {
        "id": inquiry.id,
        "patient_id": inquiry.patient_id,
        "patient_name": inquiry.patient_name,
        "versichertennummer": inquiry.versichertennummer,
        "geburtsdatum": inquiry.geburtsdatum,
        "kasse_name": inquiry.kasse_name,
        "kasse_ik": inquiry.kasse_ik,
        "user_id": inquiry.user_id,
        "signature_event_id": inquiry.signature_event_id,
        "created_at": inquiry.created_at.isoformat() if inquiry.created_at else None,
    }


def generate_batch_for_user(
    db: Session,
    user_id: int,
) -> list[dict[str, Any]]:
    """Generiert Budgetanfragen für ALLE Patienten eines Betreuers."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.patti_person_id:
        return []

    # Patienten des Betreuers aus Patti laden
    client = PattiClient()
    client.login()

    response = client.get_service_histories_by_person_id(user.patti_person_id)
    rows = response.get("data", []) if isinstance(response, dict) else []

    results: list[dict[str, Any]] = []
    for item in rows:
        patient = item.get("patient") or {}
        if not item.get("is_primary"):
            continue
        if item.get("ended_at") is not None:
            continue
        if not patient.get("active"):
            continue

        patient_id = item.get("patient_id")
        if not patient_id:
            continue

        try:
            result = generate_and_save(db, patient_id, user_id)
            results.append(result)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "budget_inquiry_batch_failed patient_id=%s err=%s",
                patient_id, exc,
            )

    return results


def list_inquiries(
    db: Session,
    *,
    user_id: int | None = None,
    patient_id: int | None = None,
    task_status: str | None = None,
) -> list[BudgetInquiry]:
    """Alle Budgetanfragen, optional gefiltert."""
    q = db.query(BudgetInquiry).order_by(BudgetInquiry.created_at.desc())
    if user_id is not None:
        q = q.filter(BudgetInquiry.user_id == user_id)
    if patient_id is not None:
        q = q.filter(BudgetInquiry.patient_id == patient_id)
    if task_status is not None:
        q = q.filter(BudgetInquiry.task_status == task_status)
    return q.all()


def get_inquiry(db: Session, inquiry_id: int) -> BudgetInquiry | None:
    return db.query(BudgetInquiry).filter(BudgetInquiry.id == inquiry_id).first()


def patch_inquiry(
    db: Session,
    inquiry_id: int,
    *,
    handler_user_id: int | None = None,
    handler_note: str | None = None,
    task_status: str | None = None,
) -> BudgetInquiry | None:
    """Bearbeitungsvermerk und/oder Status aktualisieren."""
    inquiry = db.query(BudgetInquiry).filter(BudgetInquiry.id == inquiry_id).first()
    if inquiry is None:
        return None
    if task_status is not None:
        inquiry.task_status = task_status
    if handler_note is not None:
        inquiry.handler_note = handler_note.strip()
    if handler_user_id is not None:
        inquiry.handler_user_id = handler_user_id
    inquiry.handled_at = datetime.utcnow()
    db.commit()
    db.refresh(inquiry)
    return inquiry


def mark_inquiry_done(db: Session, inquiry_id: int) -> BudgetInquiry | None:
    """Setzt task_status auf 'done'."""
    inquiry = db.query(BudgetInquiry).filter(BudgetInquiry.id == inquiry_id).first()
    if inquiry is None:
        return None
    inquiry.task_status = "done"
    db.commit()
    db.refresh(inquiry)
    return inquiry


def ensure_pending_budget_inquiry(
    db: Session,
    patient_id: int,
    user_id: int,
) -> BudgetInquiry | None:
    """Erstellt eine pending Budgetabfrage fuer einen Patienten, falls noch
    keine offene existiert. Wird automatisch nach Signatur-Erstellung
    aufgerufen."""
    existing = (
        db.query(BudgetInquiry)
        .filter(
            BudgetInquiry.patient_id == patient_id,
            BudgetInquiry.task_status == "pending",
        )
        .first()
    )
    if existing is not None:
        return None  # already has a pending inquiry

    try:
        client = PattiClient()
        client.login()
        pdata = _fetch_patient_data(client, patient_id)
    except Exception:  # noqa: BLE001
        pdata = {
            "name": f"Patient {patient_id}",
            "insurance_number": "",
            "birthday": "",
            "kasse_name": "",
            "kasse_ik": "",
        }

    sig_event, _ = _get_latest_leistungsnachweis_signature(db, patient_id)

    inquiry = BudgetInquiry(
        patient_id=patient_id,
        patient_name=pdata["name"],
        versichertennummer=pdata.get("insurance_number"),
        geburtsdatum=pdata.get("birthday"),
        kasse_name=pdata.get("kasse_name"),
        kasse_ik=pdata.get("kasse_ik"),
        user_id=user_id,
        signature_event_id=sig_event.id if sig_event else None,
        task_status="pending",
    )
    db.add(inquiry)
    db.commit()
    db.refresh(inquiry)
    return inquiry


def generate_batch_all(db: Session) -> int:
    """Generiert Budgetabfragen fuer ALLE Patienten die mindestens eine
    Signatur haben. Gibt die Anzahl generierter Eintraege zurueck."""
    # Alle Patienten mit mindestens einer Signatur
    patient_rows = (
        db.query(SignatureEvent.patient_id, SignatureEvent.created_by_user_id)
        .filter(SignatureEvent.patient_id.is_not(None))
        .distinct(SignatureEvent.patient_id)
        .all()
    )

    count = 0
    for patient_id, user_id in patient_rows:
        result = ensure_pending_budget_inquiry(db, patient_id, user_id)
        if result is not None:
            count += 1
    return count


def generate_for_selected(
    db: Session,
    patient_ids: list[int],
    user_id: int,
) -> int:
    """Generiert Budgetabfragen fuer eine Liste von Patienten-IDs."""
    count = 0
    for pid in patient_ids:
        result = ensure_pending_budget_inquiry(db, pid, user_id)
        if result is not None:
            count += 1
    return count
