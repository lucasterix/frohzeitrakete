from typing import Any

import requests
from bs4 import BeautifulSoup

from app.core.settings import settings


class PattiClient:
    def __init__(self) -> None:
        self.base_url = settings.patti_base_url.rstrip("/")
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Accept": "application/json, text/plain, */*",
                "X-Requested-With": "XMLHttpRequest",
                "Origin": self.base_url,
                "Referer": f"{self.base_url}/",
                "User-Agent": "Mozilla/5.0",
            }
        )

    def _extract_csrf_token(self, html: str) -> str:
        soup = BeautifulSoup(html, "html.parser")
        token_input = soup.find("input", {"name": "_token"})
        if token_input and token_input.get("value"):
            return str(token_input["value"])

        xsrf_cookie = self.session.cookies.get("XSRF-TOKEN")
        if xsrf_cookie:
            return xsrf_cookie

        raise ValueError("CSRF token could not be extracted from Patti login page.")

    def login(self) -> None:
        login_url = f"{self.base_url}/login"

        login_page_response = self.session.get(login_url, timeout=30)
        login_page_response.raise_for_status()

        csrf_token = self._extract_csrf_token(login_page_response.text)

        payload = {
            "_token": csrf_token,
            "email": settings.patti_login_email,
            "password": settings.patti_login_password,
        }

        response = self.session.post(
            login_url,
            data=payload,
            allow_redirects=False,
            timeout=30,
        )

        if response.status_code not in (302, 303):
            raise RuntimeError(
                f"Patti login failed. Status={response.status_code}, body={response.text[:500]}"
            )

        if "laravel_session" not in self.session.cookies:
            raise RuntimeError("Patti login failed: laravel_session cookie missing.")

    def get_service_histories_by_person_id(self, person_id: int, page: int = 1) -> Any:
        url = f"{self.base_url}/api/v1/service-histories"
        params = [
            ("page", str(page)),
            ("orderBy", "patient_person.list_name"),
            ("orderDir", "asc"),
            ("person_id", str(person_id)),
            ("patient.person.address.city", ""),
            ("is_primary[]", "true"),
        ]

        response = self.session.get(url, params=params, timeout=30)
        response.raise_for_status()
        return response.json()