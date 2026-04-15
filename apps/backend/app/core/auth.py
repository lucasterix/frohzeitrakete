from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.core.settings import settings
from app.db.session import get_db
from app.models.user import User
from app.repositories.user_repository import get_user_by_id

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def _extract_access_token(request: Request, bearer_token: str | None) -> str | None:
    if bearer_token:
        return bearer_token

    cookie_token = request.cookies.get(settings.access_cookie_name)
    if cookie_token:
        return cookie_token

    return None


def get_current_user(
    request: Request,
    bearer_token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Ungültiger oder abgelaufener Token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = _extract_access_token(request, bearer_token)
    if token is None:
        raise credentials_exception

    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")

        if user_id is None:
            raise credentials_exception

        user = get_user_by_id(db, int(user_id))
        if user is None:
            raise credentials_exception

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User ist inaktiv",
            )

        return user

    except (JWTError, ValueError):
        raise credentials_exception


def require_admin_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Keine Admin-Berechtigung",
        )

    return current_user


def require_office_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Admin oder Büromitarbeiter dürfen durch. Büromitarbeiter (role
    'buero') sehen die operativen Admin-Web-Seiten (Aufgaben, Office
    Inbox, Vertretungen, Neuaufnahmen, Leistungsnachweise, VP-Anträge,
    Verträge), dürfen aber keine User anlegen/löschen."""
    if current_user.role not in ("admin", "buero"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Keine Büro-Berechtigung",
        )
    return current_user