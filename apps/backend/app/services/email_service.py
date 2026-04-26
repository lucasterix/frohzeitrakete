import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import structlog

from app.core.settings import settings

logger = structlog.get_logger("email")


def send_email(to: str, subject: str, html_body: str) -> bool:
    if not settings.smtp_host or not settings.smtp_user:
        logger.warning("smtp_not_configured", to=to, subject=subject)
        return False

    msg = MIMEMultipart("alternative")
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
        logger.info("email_sent", to=to, subject=subject)
        return True
    except Exception as exc:
        logger.error("email_send_failed", to=to, error=str(exc))
        return False


def send_applicant_confirmation(name: str, email: str, position: str) -> bool:
    subject = f"Ihre Bewerbung bei Fröhlich Dienste – {position}"
    html = f"""\
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px">
  <h2 style="color:#1e293b">Vielen Dank für Ihre Bewerbung!</h2>
  <p>Liebe/r {name},</p>
  <p>wir haben Ihre Bewerbung als <strong>{position}</strong> bei der
  Fröhlich Dienste GmbH erhalten und freuen uns über Ihr Interesse.</p>
  <p>Wir werden Ihre Unterlagen sorgfältig prüfen und uns zeitnah bei Ihnen melden.</p>
  <p style="margin-top:24px">Mit freundlichen Grüßen,<br>
  <strong>Fröhlich Dienste GmbH</strong><br>
  Personalbereich</p>
</div>"""
    return send_email(email, subject, html)


def send_applicant_invitation(
    name: str, email: str, position: str, interview_date: str, note: str = ""
) -> bool:
    subject = f"Einladung zum Vorstellungsgespräch – {position}"
    note_block = f"<p>{note}</p>" if note else ""
    html = f"""\
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px">
  <h2 style="color:#1e293b">Einladung zum Vorstellungsgespräch</h2>
  <p>Liebe/r {name},</p>
  <p>vielen Dank für Ihre Bewerbung als <strong>{position}</strong>.
  Wir möchten Sie gerne persönlich kennenlernen und laden Sie herzlich
  zu einem Vorstellungsgespräch ein:</p>
  <div style="background:#f1f5f9;border-radius:12px;padding:16px;margin:16px 0">
    <strong>Termin:</strong> {interview_date}
  </div>
  {note_block}
  <p>Bitte bestätigen Sie den Termin per Antwort auf diese E-Mail.
  Sollte Ihnen der Termin nicht passen, lassen Sie es uns gerne wissen.</p>
  <p style="margin-top:24px">Mit freundlichen Grüßen,<br>
  <strong>Fröhlich Dienste GmbH</strong><br>
  Personalbereich</p>
</div>"""
    return send_email(email, subject, html)


def send_applicant_rejection(name: str, email: str, position: str) -> bool:
    subject = f"Ihre Bewerbung bei Fröhlich Dienste – {position}"
    html = f"""\
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px">
  <h2 style="color:#1e293b">Rückmeldung zu Ihrer Bewerbung</h2>
  <p>Liebe/r {name},</p>
  <p>vielen Dank für Ihre Bewerbung als <strong>{position}</strong>
  und Ihr Interesse an der Fröhlich Dienste GmbH.</p>
  <p>Nach sorgfältiger Prüfung Ihrer Unterlagen müssen wir Ihnen leider
  mitteilen, dass wir uns für andere Bewerber/innen entschieden haben.</p>
  <p>Wir wünschen Ihnen für Ihren weiteren beruflichen Weg alles Gute.</p>
  <p style="margin-top:24px">Mit freundlichen Grüßen,<br>
  <strong>Fröhlich Dienste GmbH</strong><br>
  Personalbereich</p>
</div>"""
    return send_email(email, subject, html)


def send_applicant_offer(name: str, email: str, position: str, note: str = "") -> bool:
    subject = f"Zusage – {position} bei Fröhlich Dienste"
    note_block = f"<p>{note}</p>" if note else ""
    html = f"""\
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px">
  <h2 style="color:#1e293b">Herzlichen Glückwunsch!</h2>
  <p>Liebe/r {name},</p>
  <p>wir freuen uns, Ihnen mitteilen zu können, dass wir Ihnen die Stelle
  als <strong>{position}</strong> bei der Fröhlich Dienste GmbH anbieten möchten!</p>
  {note_block}
  <p>Wir melden uns in Kürze mit den weiteren Details und dem Arbeitsvertrag.</p>
  <p style="margin-top:24px">Mit freundlichen Grüßen,<br>
  <strong>Fröhlich Dienste GmbH</strong><br>
  Personalbereich</p>
</div>"""
    return send_email(email, subject, html)
