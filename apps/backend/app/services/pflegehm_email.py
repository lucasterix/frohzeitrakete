"""Email transport for Pflegehilfsmittel EDIFACT data exchange.

Adapted from pflegekreuzer/app/email_transport.py for care-app.
Implements real SMTP sending with AUF (Auftragssatz) generation.
"""

from __future__ import annotations

import smtplib
import tempfile
from datetime import datetime
from email.message import EmailMessage
from pathlib import Path
from typing import Any

from app.models.pflegehm_settings import PflegehmSettings

# ---------------------------------------------------------------------------
# Auftragssatz (AUF) builder — ported from pflegekreuzer/app/auftrag.py
# ---------------------------------------------------------------------------

AUF_LENGTH = 348


def _init_line(length: int = AUF_LENGTH) -> list[str]:
    return [" "] * length


def _set_text(buf: list[str], start: int, end: int, value: str | None) -> None:
    field_len = end - start + 1
    txt = (value or "")[:field_len].ljust(field_len, " ")
    buf[start - 1 : end] = list(txt)


def _set_number(buf: list[str], start: int, end: int, value: Any) -> None:
    field_len = end - start + 1
    s = str(value) if value is not None else ""
    s = s[-field_len:].rjust(field_len, "0")
    buf[start - 1 : end] = list(s)


def build_auftragssatz(
    verfahrenskennung: str,
    transfer_nummer: str,
    absender_ik: str,
    empfaenger_ik: str | None = None,
    dateiname: str | None = None,
    datum_erstellung: datetime | None = None,
    dateigroesse_nutzdaten: int | None = None,
    dateigroesse_uebertragung: int | None = None,
    zeichensatz: str = "I8",
    komprimierung: str = "00",
    verschluesselungsart: str = "02",
    elektronische_unterschrift: str = "00",
    uebertragungsweg: int | str = 5,
    email_absender: str | None = None,
    abrechnungscode: str | None = None,
) -> str:
    """Build a 348-byte Auftragssatz (TA1 Anlage 2)."""
    buf = _init_line()

    # 1. Teil
    _set_text(buf, 1, 6, "500000")
    _set_number(buf, 7, 8, 1)
    _set_number(buf, 9, 16, AUF_LENGTH)
    _set_number(buf, 17, 19, 0)
    _set_text(buf, 20, 24, verfahrenskennung)
    _set_number(buf, 25, 27, transfer_nummer)
    _set_text(buf, 28, 32, "")
    _set_text(buf, 33, 47, absender_ik)
    _set_text(buf, 48, 62, absender_ik)
    _set_text(buf, 63, 77, empfaenger_ik or "")
    _set_text(buf, 78, 92, empfaenger_ik or "")
    _set_number(buf, 93, 98, 0)
    _set_number(buf, 99, 104, 0)

    if dateiname is None:
        dateiname = f"{verfahrenskennung}{transfer_nummer}"
    _set_text(buf, 105, 115, dateiname)

    if datum_erstellung is None:
        datum_erstellung = datetime.now()
    ts = datum_erstellung.strftime("%Y%m%d%H%M%S")
    _set_number(buf, 116, 129, ts)

    # 2. Teil
    _set_number(buf, 130, 143, ts)
    _set_number(buf, 144, 157, 0)
    _set_number(buf, 158, 171, 0)
    _set_number(buf, 172, 177, 0)
    _set_number(buf, 178, 178, 0)
    _set_number(buf, 179, 190, dateigroesse_nutzdaten or 0)
    _set_number(buf, 191, 202, dateigroesse_uebertragung or 0)
    _set_text(buf, 203, 204, zeichensatz)
    _set_number(buf, 205, 206, komprimierung)
    _set_number(buf, 207, 208, verschluesselungsart)
    _set_number(buf, 209, 210, elektronische_unterschrift)

    # 3. Teil
    _set_text(buf, 211, 213, "")
    _set_number(buf, 214, 218, 0)
    _set_number(buf, 219, 226, 0)
    _set_text(buf, 227, 227, " ")
    _set_number(buf, 228, 229, 3)
    _set_number(buf, 230, 230, uebertragungsweg)
    _set_number(buf, 231, 240, 0)
    _set_number(buf, 241, 246, 0)
    _set_text(buf, 247, 274, "")

    # 4. Teil
    _set_text(buf, 275, 318, email_absender or "")
    if abrechnungscode and len(abrechnungscode) >= 1:
        _set_text(buf, 319, 348, abrechnungscode[:2])
    else:
        _set_text(buf, 319, 348, "")

    line = "".join(buf)
    return line


# ---------------------------------------------------------------------------
# File info for email body (Anlage 7)
# ---------------------------------------------------------------------------

def _file_info_for_body(path: Path, auf_timestamp: datetime | None = None) -> str:
    size = path.stat().st_size
    if auf_timestamp:
        ts = auf_timestamp.strftime("%Y%m%d:%H%M%S")
    else:
        mtime = datetime.fromtimestamp(path.stat().st_mtime)
        ts = mtime.strftime("%Y%m%d:%H%M%S")
    return f"{path.name}, {size}, {ts}"


# ---------------------------------------------------------------------------
# Real SMTP sending
# ---------------------------------------------------------------------------

def send_datenaustausch_mail(
    cfg: dict[str, Any],
    sender_ik: str,
    empfaenger_email: str,
    auf_path: Path,
    nutzdaten_path: Path,
    auf_erstellzeit: datetime | None = None,
) -> None:
    """Send Anlage-7-compliant email with AUF + payload attachments."""
    smtp_server = cfg.get("smtp_server")
    email_absender = cfg.get("email_absender")

    if not smtp_server or not email_absender:
        raise RuntimeError("SMTP-Server oder Absender-E-Mail in der Konfiguration fehlt.")

    msg = EmailMessage()
    msg["From"] = email_absender
    msg["To"] = empfaenger_email
    msg["Subject"] = sender_ik

    lines: list[str] = []
    lines.append(_file_info_for_body(auf_path, auf_erstellzeit))
    lines.append(_file_info_for_body(nutzdaten_path, auf_erstellzeit))

    firma = cfg.get("firma_name") or cfg.get("name") or "Leistungserbringer"
    lines.append(firma)
    if cfg.get("kontakt_person"):
        lines.append(cfg["kontakt_person"])
    if email_absender:
        lines.append(email_absender)
    if cfg.get("kontakt_telefon"):
        lines.append(cfg["kontakt_telefon"])
    if cfg.get("kontakt_fax"):
        lines.append(cfg["kontakt_fax"])

    msg.set_content("\r\n".join(lines))

    for path in (auf_path, nutzdaten_path):
        with path.open("rb") as f:
            data = f.read()
        msg.add_attachment(
            data,
            maintype="application",
            subtype="octet-stream",
            filename=path.name,
        )

    use_tls = bool(cfg.get("smtp_use_tls", True))
    server = smtp_server
    port = cfg.get("smtp_port") or (587 if use_tls else 25)

    if use_tls:
        with smtplib.SMTP(server, port) as s:
            s.starttls()
            if cfg.get("smtp_user") and cfg.get("smtp_password"):
                s.login(cfg["smtp_user"], cfg["smtp_password"])
            s.send_message(msg)
    else:
        with smtplib.SMTP(server, port) as s:
            if cfg.get("smtp_user") and cfg.get("smtp_password"):
                s.login(cfg["smtp_user"], cfg["smtp_password"])
            s.send_message(msg)


# ---------------------------------------------------------------------------
# High-level send: EDIFACT + AUF generation + SMTP
# ---------------------------------------------------------------------------

def send_abrechnung_email(
    settings: PflegehmSettings,
    edifact_data: bytes,
    empfaenger_email: str,
    empfaenger_ik: str,
    abrechnung_id: int,
) -> None:
    """
    Build AUF, write temp files, and send the email via SMTP.
    Uses PflegehmSettings for all configuration.
    """
    sender_ik = settings.ik or "000000000"
    now = datetime.now()
    transfer_nr = f"{abrechnung_id % 999:03d}"
    verfahrenskennung = settings.verfahrenskennung or "TPFL0"

    auf_text = build_auftragssatz(
        verfahrenskennung=verfahrenskennung,
        transfer_nummer=transfer_nr,
        absender_ik=sender_ik,
        empfaenger_ik=empfaenger_ik,
        datum_erstellung=now,
        dateigroesse_nutzdaten=len(edifact_data),
        dateigroesse_uebertragung=len(edifact_data),
        email_absender=settings.email_absender or "",
        abrechnungscode=settings.abrechnungscode or "",
    )

    # Write temp files
    tmpdir = Path(tempfile.mkdtemp(prefix="pflegehm_"))
    auf_path = tmpdir / f"{verfahrenskennung}{transfer_nr}.AUF"
    nutzdaten_path = tmpdir / f"{verfahrenskennung}{transfer_nr}.PFL"

    auf_path.write_text(auf_text, encoding="latin-1")
    nutzdaten_path.write_bytes(edifact_data)

    cfg = {
        "smtp_server": settings.smtp_server,
        "smtp_port": settings.smtp_port,
        "smtp_user": settings.smtp_user,
        "smtp_password": settings.smtp_password,
        "smtp_use_tls": settings.smtp_use_tls,
        "email_absender": settings.email_absender,
        "firma_name": settings.firma_name,
        "kontakt_person": settings.kontakt_person,
        "kontakt_telefon": settings.kontakt_telefon,
        "kontakt_fax": settings.kontakt_fax,
    }

    try:
        send_datenaustausch_mail(
            cfg=cfg,
            sender_ik=sender_ik,
            empfaenger_email=empfaenger_email,
            auf_path=auf_path,
            nutzdaten_path=nutzdaten_path,
            auf_erstellzeit=now,
        )
    finally:
        # Cleanup temp files
        for p in (auf_path, nutzdaten_path):
            try:
                p.unlink()
            except OSError:
                pass
        try:
            tmpdir.rmdir()
        except OSError:
            pass
