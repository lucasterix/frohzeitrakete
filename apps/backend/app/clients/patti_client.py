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

    # --- Patient endpoints ---------------------------------------------------

    def get_patient(self, patient_id: int) -> dict[str, Any]:
        """GET /api/v1/patients/{patient} – full patient profile incl. patientRates."""
        response = self.session.get(
            f"{self.base_url}/api/v1/patients/{patient_id}", timeout=30
        )
        response.raise_for_status()
        return response.json()

    def list_patients(self, page: int = 1, per_page: int = 50) -> dict[str, Any]:
        """GET /api/v1/patients – list all patients of the organisation."""
        response = self.session.get(
            f"{self.base_url}/api/v1/patients",
            params={"page": str(page), "per_page": str(per_page)},
            timeout=30,
        )
        response.raise_for_status()
        return response.json()

    def search(self, query: str) -> dict[str, Any]:
        """GET /api/v1/search?q=... – globale Patti-Suche über people/patients."""
        response = self.session.get(
            f"{self.base_url}/api/v1/search",
            params={"q": query},
            timeout=30,
        )
        response.raise_for_status()
        return response.json()

    # --- Helper endpoints (budgets) -----------------------------------------

    def get_remaining_care_service_budget(
        self, patient_id: int, year: int
    ) -> dict[str, Any]:
        """Pflegesachleistung / Entlastungsbetrag Restbudget für Jahr.

        Response shape (tested):
            {"remaining_budget": {
                "money": <cent>,
                "hours": <float>,
                "used": <float>,
                "expiration": <float>,
            }}
        """
        response = self.session.get(
            f"{self.base_url}/api/v1/helpers/remaining-care-service-budgets",
            params={"patient_id": str(patient_id), "year": str(year)},
            timeout=30,
        )
        response.raise_for_status()
        return response.json()

    def get_remaining_respite_care_budget(
        self, patient_id: int, year: int
    ) -> dict[str, Any]:
        """Verhinderungspflege Restbudget für Jahr.

        Response shape:
            {"remaining_budget": {"money": <cent>, "hours": <float>}}
        """
        response = self.session.get(
            f"{self.base_url}/api/v1/helpers/remaining-respite-care-budgets",
            params={"patient_id": str(patient_id), "year": str(year)},
            timeout=30,
        )
        response.raise_for_status()
        return response.json()

    def get_patient_date_rate(
        self, patient_id: int, year: int, month: int, type: str
    ) -> dict[str, Any]:
        """Stundensatz für Patient+Monat+Leistungstyp.

        `type` ist einer von: respiteCare, careService, conversion,
        domesticHelp, counselling, travelFee.
        """
        response = self.session.get(
            f"{self.base_url}/api/v1/helpers/patient-date-rate",
            params={
                "patient_id": str(patient_id),
                "year": str(year),
                "month": str(month),
                "type": type,
            },
            timeout=30,
        )
        response.raise_for_status()
        return response.json()

    # --- Service Entries (Einsätze) -----------------------------------------

    def create_service_entry(self, payload: dict[str, Any]) -> dict[str, Any]:
        """POST /api/v1/service-entries – legt einen Einsatz in Patti an.

        Wird nur aufgerufen wenn wir den Backend-Entry auch in Patti syncen
        wollen. Für MVP ist Sync optional; Mobile schreibt erstmal nur in
        unsere eigene entries-Tabelle.
        """
        # Patti erwartet CSRF-Token als X-XSRF-TOKEN Header bei POSTs
        csrf = self.session.cookies.get("XSRF-TOKEN")
        headers = {"X-XSRF-TOKEN": csrf} if csrf else {}

        response = self.session.post(
            f"{self.base_url}/api/v1/service-entries",
            json=payload,
            headers=headers,
            timeout=30,
        )
        response.raise_for_status()
        return response.json()