import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import structlog

from app.core.settings import settings

logger = structlog.get_logger("email")

CALENDAR_BOOKING_URL = "https://calendar.app.google/nmXuFcbcPPLhxcHw8"

MAIL_STYLE = """\
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; }
  .wrap { max-width: 600px; margin: auto; padding: 0; }
  .header { background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
            padding: 32px 24px; border-radius: 16px 16px 0 0; text-align: center; }
  .header h1 { color: #fff; font-size: 20px; margin: 0; font-weight: 600; }
  .header .sub { color: #e0d4f5; font-size: 13px; margin-top: 4px; }
  .body { background: #ffffff; padding: 28px 24px; border-left: 1px solid #e2e8f0;
          border-right: 1px solid #e2e8f0; }
  .body p { line-height: 1.65; margin: 0 0 14px; font-size: 15px; }
  .highlight { background: #f1f5f9; border-radius: 12px; padding: 16px 20px;
               margin: 20px 0; border-left: 4px solid #7c3aed; }
  .highlight strong { color: #7c3aed; }
  .btn { display: inline-block; background: #7c3aed; color: #fff !important;
         text-decoration: none; padding: 14px 28px; border-radius: 12px;
         font-weight: 600; font-size: 15px; margin: 20px 0; }
  .btn:hover { background: #6d28d9; }
  .footer { background: #f8fafc; padding: 20px 24px; border-radius: 0 0 16px 16px;
            border: 1px solid #e2e8f0; border-top: 0; text-align: center;
            font-size: 12px; color: #94a3b8; }
  .footer a { color: #7c3aed; text-decoration: none; }
</style>"""

MAIL_FOOTER = """\
<div class="footer">
  <p><strong>Fröhlich Dienste GmbH</strong> · Betreuung &amp; Pflege</p>
  <p>Telefon: 0551 28879514 · E-Mail: hr@froehlichdienste.de</p>
</div>"""


def send_email(to: str, subject: str, html_body: str) -> bool:
    if not settings.smtp_host or not settings.smtp_user:
        logger.warning("smtp_not_configured", to=to, subject=subject)
        return False

    msg = MIMEMultipart("alternative")
    msg["From"] = f"Fröhlich Dienste HR <{settings.smtp_from}>"
    msg["To"] = to
    msg["Subject"] = subject
    msg["Reply-To"] = settings.smtp_from
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
    subject = f"Eingangsbestätigung – Ihre Bewerbung als {position}"
    html = f"""\
<!DOCTYPE html><html><head>{MAIL_STYLE}</head><body>
<div class="wrap">
  <div class="header">
    <h1>Bewerbung eingegangen</h1>
    <div class="sub">Fröhlich Dienste GmbH · Personalbereich</div>
  </div>
  <div class="body">
    <p>Liebe/r {name},</p>
    <p>vielen Dank für Ihre Bewerbung als <strong>{position}</strong> bei der
    Fröhlich Dienste GmbH! Wir freuen uns sehr über Ihr Interesse an unserem Team.</p>
    <div class="highlight">
      <strong>Was passiert als Nächstes?</strong><br>
      Unser Personalteam wird Ihre Unterlagen sorgfältig prüfen. Innerhalb der
      nächsten Tage melden wir uns bei Ihnen mit einer Rückmeldung oder laden
      Sie direkt zu einem persönlichen Gespräch ein.
    </div>
    <p>Sie möchten vorab schon einen Gesprächstermin vereinbaren? Buchen Sie
    gerne direkt über unseren Kalender:</p>
    <p style="text-align:center">
      <a href="{CALENDAR_BOOKING_URL}" class="btn">Termin buchen</a>
    </p>
    <p>Bei Fragen erreichen Sie uns jederzeit unter
    <a href="mailto:hr@froehlichdienste.de">hr@froehlichdienste.de</a>
    oder telefonisch unter 0551 28879514.</p>
    <p>Wir freuen uns darauf, Sie kennenzulernen!</p>
    <p style="margin-top:24px">Herzliche Grüße,<br>
    <strong>Ihr Personalteam</strong><br>
    Fröhlich Dienste GmbH</p>
  </div>
  {MAIL_FOOTER}
</div>
</body></html>"""
    return send_email(email, subject, html)


def send_applicant_invitation(
    name: str, email: str, position: str, interview_date: str, note: str = ""
) -> bool:
    subject = f"Einladung zum Vorstellungsgespräch – {position}"
    note_block = f'<p style="margin-top:12px">{note}</p>' if note else ""
    html = f"""\
<!DOCTYPE html><html><head>{MAIL_STYLE}</head><body>
<div class="wrap">
  <div class="header">
    <h1>Einladung zum Gespräch</h1>
    <div class="sub">Fröhlich Dienste GmbH · Personalbereich</div>
  </div>
  <div class="body">
    <p>Liebe/r {name},</p>
    <p>vielen Dank für Ihre Bewerbung als <strong>{position}</strong>. Ihre
    Unterlagen haben uns überzeugt und wir möchten Sie gerne persönlich
    kennenlernen!</p>
    <div class="highlight">
      <strong>Ihr Gesprächstermin:</strong><br>
      {interview_date}<br><br>
      <strong>Ort:</strong> Fröhlich Dienste GmbH, Göttingen<br>
      <strong>Dauer:</strong> ca. 30–45 Minuten
    </div>
    {note_block}
    <p>Sollte Ihnen der vorgeschlagene Termin nicht passen, können Sie gerne
    einen alternativen Termin über unseren Kalender buchen:</p>
    <p style="text-align:center">
      <a href="{CALENDAR_BOOKING_URL}" class="btn">Alternativen Termin buchen</a>
    </p>
    <p><strong>Was Sie mitbringen sollten:</strong></p>
    <ul style="padding-left:20px;margin:8px 0 16px">
      <li>Einen gültigen Ausweis</li>
      <li>Ihren Lebenslauf (falls nicht bereits eingereicht)</li>
      <li>Gerne auch Fragen an uns!</li>
    </ul>
    <p>Bitte bestätigen Sie den Termin kurz per Antwort auf diese E-Mail.</p>
    <p style="margin-top:24px">Wir freuen uns auf Sie!<br>
    <strong>Ihr Personalteam</strong><br>
    Fröhlich Dienste GmbH</p>
  </div>
  {MAIL_FOOTER}
</div>
</body></html>"""
    return send_email(email, subject, html)


def send_applicant_rejection(name: str, email: str, position: str, reason: str = "") -> bool:
    subject = f"Rückmeldung zu Ihrer Bewerbung – {position}"
    reason_block = f'<p style="margin-top:12px">{reason}</p>' if reason else ""
    html = f"""\
<!DOCTYPE html><html><head>{MAIL_STYLE}</head><body>
<div class="wrap">
  <div class="header" style="background:linear-gradient(135deg,#475569 0%,#334155 100%)">
    <h1>Rückmeldung zu Ihrer Bewerbung</h1>
    <div class="sub">Fröhlich Dienste GmbH · Personalbereich</div>
  </div>
  <div class="body">
    <p>Liebe/r {name},</p>
    <p>vielen Dank für Ihre Bewerbung als <strong>{position}</strong> und Ihr
    Interesse an der Fröhlich Dienste GmbH.</p>
    <p>Nach sorgfältiger Prüfung Ihrer Unterlagen müssen wir Ihnen leider
    mitteilen, dass wir uns in diesem Auswahlverfahren für andere
    Bewerber/innen entschieden haben.</p>
    {reason_block}
    <p>Diese Entscheidung ist keine Bewertung Ihrer Qualifikationen. Wir
    ermutigen Sie, sich bei zukünftigen Stellenausschreibungen erneut bei
    uns zu bewerben.</p>
    <p>Wir wünschen Ihnen für Ihren weiteren beruflichen Weg alles Gute
    und viel Erfolg!</p>
    <p style="margin-top:24px">Mit freundlichen Grüßen,<br>
    <strong>Ihr Personalteam</strong><br>
    Fröhlich Dienste GmbH</p>
  </div>
  {MAIL_FOOTER}
</div>
</body></html>"""
    return send_email(email, subject, html)


def send_applicant_offer(name: str, email: str, position: str, note: str = "") -> bool:
    subject = f"Zusage – Willkommen im Team! ({position})"
    note_block = f'<p style="margin-top:12px">{note}</p>' if note else ""
    html = f"""\
<!DOCTYPE html><html><head>{MAIL_STYLE}</head><body>
<div class="wrap">
  <div class="header" style="background:linear-gradient(135deg,#059669 0%,#047857 100%)">
    <h1>Herzlichen Glückwunsch!</h1>
    <div class="sub">Willkommen bei Fröhlich Dienste</div>
  </div>
  <div class="body">
    <p>Liebe/r {name},</p>
    <p>wir freuen uns sehr, Ihnen mitteilen zu können, dass wir Ihnen die
    Stelle als <strong>{position}</strong> bei der Fröhlich Dienste GmbH
    anbieten möchten! 🎉</p>
    <div class="highlight" style="border-left-color:#059669">
      <strong style="color:#059669">Sie haben uns überzeugt!</strong><br>
      Wir sind davon überzeugt, dass Sie eine wertvolle Bereicherung für
      unser Team sein werden.
    </div>
    {note_block}
    <p><strong>Nächste Schritte:</strong></p>
    <ul style="padding-left:20px;margin:8px 0 16px">
      <li>Wir senden Ihnen in Kürze den Arbeitsvertrag zu</li>
      <li>Bitte beantragen Sie ein erweitertes Führungszeugnis</li>
      <li>Wir vereinbaren einen Probearbeitstag</li>
    </ul>
    <p>Bei Fragen stehen wir Ihnen jederzeit zur Verfügung.</p>
    <p style="margin-top:24px">Herzliche Grüße,<br>
    <strong>Ihr Personalteam</strong><br>
    Fröhlich Dienste GmbH</p>
  </div>
  {MAIL_FOOTER}
</div>
</body></html>"""
    return send_email(email, subject, html)


def send_applicant_trial_work(name: str, email: str, position: str, trial_date: str) -> bool:
    subject = f"Probearbeitstag – {position} bei Fröhlich Dienste"
    html = f"""\
<!DOCTYPE html><html><head>{MAIL_STYLE}</head><body>
<div class="wrap">
  <div class="header">
    <h1>Ihr Probearbeitstag</h1>
    <div class="sub">Fröhlich Dienste GmbH · Personalbereich</div>
  </div>
  <div class="body">
    <p>Liebe/r {name},</p>
    <p>wir freuen uns, Sie zu einem Probearbeitstag als <strong>{position}</strong>
    einzuladen!</p>
    <div class="highlight">
      <strong>Termin:</strong> {trial_date}<br><br>
      <strong>Bitte mitbringen:</strong><br>
      • Bequeme Kleidung<br>
      • Gültiger Ausweis<br>
      • Gute Laune 😊
    </div>
    <p>Am Probearbeitstag lernen Sie unser Team und die täglichen Abläufe kennen.
    So können beide Seiten herausfinden, ob die Zusammenarbeit gut passt.</p>
    <p>Bitte bestätigen Sie den Termin per Antwort auf diese E-Mail. Falls
    der Termin nicht passen sollte, lassen Sie es uns gerne wissen.</p>
    <p style="margin-top:24px">Wir freuen uns auf Sie!<br>
    <strong>Ihr Personalteam</strong><br>
    Fröhlich Dienste GmbH</p>
  </div>
  {MAIL_FOOTER}
</div>
</body></html>"""
    return send_email(email, subject, html)


def send_applicant_criminal_record_request(name: str, email: str, position: str) -> bool:
    subject = f"Erweitertes Führungszeugnis benötigt – {position}"
    html = f"""\
<!DOCTYPE html><html><head>{MAIL_STYLE}</head><body>
<div class="wrap">
  <div class="header">
    <h1>Führungszeugnis benötigt</h1>
    <div class="sub">Fröhlich Dienste GmbH · Personalbereich</div>
  </div>
  <div class="body">
    <p>Liebe/r {name},</p>
    <p>für Ihre Einstellung als <strong>{position}</strong> benötigen wir ein
    <strong>erweitertes Führungszeugnis</strong> (Belegart OE).</p>
    <div class="highlight">
      <strong>So beantragen Sie es:</strong><br>
      1. Gehen Sie zu Ihrem zuständigen Bürgeramt/Einwohnermeldeamt<br>
      2. Beantragen Sie ein <em>erweitertes Führungszeugnis (Belegart OE)</em><br>
      3. Kosten: ca. 13 €<br>
      4. Bearbeitungszeit: ca. 2–3 Wochen
    </div>
    <p>Sobald Sie das Führungszeugnis erhalten haben, senden Sie es bitte
    per Post oder E-Mail an uns. Wir können mit der Vertragserstellung
    beginnen, sobald es vorliegt.</p>
    <p>Bei Fragen helfen wir Ihnen gerne weiter.</p>
    <p style="margin-top:24px">Herzliche Grüße,<br>
    <strong>Ihr Personalteam</strong><br>
    Fröhlich Dienste GmbH</p>
  </div>
  {MAIL_FOOTER}
</div>
</body></html>"""
    return send_email(email, subject, html)


def send_applicant_contract_info(name: str, email: str, position: str, start_date: str = "", note: str = "") -> bool:
    subject = f"Ihr Arbeitsvertrag – {position} bei Fröhlich Dienste"
    start_block = f"<br><strong>Geplanter Arbeitsbeginn:</strong> {start_date}" if start_date else ""
    note_block = f'<p style="margin-top:12px">{note}</p>' if note else ""
    html = f"""\
<!DOCTYPE html><html><head>{MAIL_STYLE}</head><body>
<div class="wrap">
  <div class="header" style="background:linear-gradient(135deg,#0891b2 0%,#0e7490 100%)">
    <h1>Ihr Arbeitsvertrag</h1>
    <div class="sub">Fröhlich Dienste GmbH · Personalbereich</div>
  </div>
  <div class="body">
    <p>Liebe/r {name},</p>
    <p>wir freuen uns, Ihnen Ihren Arbeitsvertrag als <strong>{position}</strong>
    bei der Fröhlich Dienste GmbH zukommen zu lassen!</p>
    <div class="highlight" style="border-left-color:#0891b2">
      <strong style="color:#0891b2">Vertrag beiliegend</strong><br>
      Bitte lesen Sie den Vertrag sorgfältig durch und senden Sie ihn
      unterschrieben an uns zurück.{start_block}
    </div>
    {note_block}
    <p><strong>Bitte mitbringen am ersten Arbeitstag:</strong></p>
    <ul style="padding-left:20px;margin:8px 0 16px">
      <li>Personalausweis oder Reisepass</li>
      <li>Sozialversicherungsausweis</li>
      <li>Bankverbindung (IBAN)</li>
      <li>Steuer-ID</li>
      <li>Erweitertes Führungszeugnis (falls noch nicht eingereicht)</li>
    </ul>
    <p>Wir freuen uns auf die Zusammenarbeit!</p>
    <p style="margin-top:24px">Herzliche Grüße,<br>
    <strong>Ihr Personalteam</strong><br>
    Fröhlich Dienste GmbH</p>
  </div>
  {MAIL_FOOTER}
</div>
</body></html>"""
    return send_email(email, subject, html)


def send_applicant_status_update(
    name: str, email: str, position: str, status_label: str, message: str
) -> bool:
    subject = f"Update zu Ihrer Bewerbung – {position}"
    html = f"""\
<!DOCTYPE html><html><head>{MAIL_STYLE}</head><body>
<div class="wrap">
  <div class="header">
    <h1>Statusupdate</h1>
    <div class="sub">Fröhlich Dienste GmbH · Personalbereich</div>
  </div>
  <div class="body">
    <p>Liebe/r {name},</p>
    <p>wir möchten Sie über den aktuellen Stand Ihrer Bewerbung als
    <strong>{position}</strong> informieren.</p>
    <div class="highlight">
      <strong>Aktueller Status:</strong> {status_label}
    </div>
    <p>{message}</p>
    <p>Bei Fragen erreichen Sie uns jederzeit unter
    <a href="mailto:hr@froehlichdienste.de">hr@froehlichdienste.de</a>.</p>
    <p style="margin-top:24px">Herzliche Grüße,<br>
    <strong>Ihr Personalteam</strong><br>
    Fröhlich Dienste GmbH</p>
  </div>
  {MAIL_FOOTER}
</div>
</body></html>"""
    return send_email(email, subject, html)
