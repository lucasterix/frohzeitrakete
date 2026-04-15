"""Push-Versand-Service (Stub).

Aktuell wird hier noch NICHT wirklich über FCM/APNs zugestellt — es
fehlen die Firebase-Credentials. Sobald die da sind, wird
`send_push()` den eigentlichen HTTP-Call machen. Bis dahin wird jeder
Versand nur geloggt damit man die Aufrufstellen im Code testen kann.

Aufrufer: notification_service.create_notification() ruft bei jeder
neuen DB-Notification zusätzlich send_push() auf, damit der Mobile-
Client das sofort angezeigt bekommt statt es beim nächsten Poll zu
finden.
"""

from __future__ import annotations

import logging
import os

from sqlalchemy.orm import Session

from app.models.user import User


logger = logging.getLogger(__name__)


FCM_SERVER_KEY = os.environ.get("FCM_SERVER_KEY", "")


def send_push(
    db: Session,
    *,
    user_id: int,
    title: str,
    body: str,
    data: dict | None = None,
) -> bool:
    """Versucht eine Push-Nachricht an den User zu schicken. Gibt True
    zurück wenn der Call rausging (auch wenn Delivery unklar), False
    wenn wir's nicht mal versucht haben (kein Token, kein Key,
    Backend-Bug)."""
    user = db.query(User).filter(User.id == user_id).first()
    if user is None or not user.push_token:
        logger.info(
            "push_skip_no_token user=%s title=%s", user_id, title
        )
        return False
    if not FCM_SERVER_KEY:
        logger.info(
            "push_stub user=%s platform=%s title=%s body=%s data=%s",
            user_id, user.push_platform, title, body, data or {},
        )
        return False
    # TODO: echter FCM-Call sobald FCM_SERVER_KEY gesetzt ist.
    # POST https://fcm.googleapis.com/fcm/send
    # headers={"Authorization": f"key={FCM_SERVER_KEY}"}
    # json={"to": user.push_token, "notification": {"title": title, "body": body}, "data": data}
    logger.warning("push_not_yet_implemented user=%s", user_id)
    return False
