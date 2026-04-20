"""Email transport for Pflegehilfsmittel EDIFACT data exchange.

Adapted from pflegekreuzer/app/email_transport.py for care-app.
"""

from __future__ import annotations

import smtplib
from datetime import datetime
from email.message import EmailMessage
from pathlib import Path
from typing import Any


def _file_info_for_body(path: Path, auf_timestamp: datetime | None = None) -> str:
    size = path.stat().st_size
    if auf_timestamp:
        ts = auf_timestamp.strftime("%Y%m%d:%H%M%S")
    else:
        mtime = datetime.fromtimestamp(path.stat().st_mtime)
        ts = mtime.strftime("%Y%m%d:%H%M%S")
    return f"{path.name}, {size}, {ts}"


def send_datenaustausch_mail(
    cfg: dict[str, Any],
    sender_ik: str,
    empfaenger_email: str,
    auf_path: Path,
    nutzdaten_path: Path,
    auf_erstellzeit: datetime | None = None,
) -> None:
    """Send Anlage-7-compliant email with AUF + payload attachments.

    ``cfg`` dict keys: smtp_server, smtp_port, smtp_user, smtp_password,
    smtp_use_tls, email_absender, name, kontakt_person, kontakt_telefon,
    kontakt_fax.
    """
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

    firma = cfg.get("name") or "Leistungserbringer"
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
