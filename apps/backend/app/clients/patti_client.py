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

        # Nach dem Login einmal die Root-Seite aufrufen damit ein frischer
        # XSRF-TOKEN Cookie gesetzt wird. Patti vergibt einen neuen Token beim
        # ersten authenticated request – ohne den werden POSTs mit 419 abgewiesen.
        self.session.get(f"{self.base_url}/", timeout=30)

    def _post_headers(self) -> dict[str, str]:
        """Header mit aktuellem XSRF-Token für schreibende Requests."""
        xsrf = self.session.cookies.get("XSRF-TOKEN")
        if xsrf:
            # Laravel wrapped den XSRF token URL-encoded in das Cookie – wir
            # müssen ihn dekodieren bevor wir ihn im Header setzen.
            from urllib.parse import unquote
            return {"X-XSRF-TOKEN": unquote(xsrf)}
        return {}

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

    def get_company(self, company_id: int) -> dict[str, Any]:
        """GET /api/v1/companies/{company_id} – insurance/pflege companies.

        Used to resolve `patient.insurance_company_id` → company name
        (e.g. "AOK Niedersachsen").
        """
        response = self.session.get(
            f"{self.base_url}/api/v1/companies/{company_id}", timeout=30
        )
        response.raise_for_status()
        return response.json()

    def get_person(self, person_id: int) -> dict[str, Any]:
        """GET /api/v1/people/{person_id} – includes communication & address
        automatically (Patti eager-loads these on the person detail endpoint,
        unlike service-histories which only has communication_id).

        We need this to extract phone numbers which service-histories omits.
        """
        response = self.session.get(
            f"{self.base_url}/api/v1/people/{person_id}", timeout=30
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

    def create_service_entry(
        self,
        *,
        patient_id: int,
        year: int,
        month: int,
        hours: float,
        type_: str = "careService",
        kind: str = "serviced",
    ) -> dict[str, Any]:
        """POST /api/v1/service-entries – legt geleistete Stunden in Patti an.

        Explored shape (confirmed live):
            {
              "patient_id": int,
              "type": "careService" | "respiteCare" | "conversion" | ...,
              "kind": "serviced" | "added" | "remainder" | "total",
              "year": int,
              "month": int (1..12),
              "hours": float
            }

        For caretaker-logged hours we always use `kind="serviced"` and
        `type="careService"` (MVP default). Patti recomputes the remaining-
        budget immediately so `/helpers/remaining-care-service-budgets`
        reflects the new total right after this call returns.
        """
        payload = {
            "patient_id": patient_id,
            "type": type_,
            "kind": kind,
            "year": year,
            "month": month,
            "hours": hours,
        }
        response = self.session.post(
            f"{self.base_url}/api/v1/service-entries",
            json=payload,
            headers=self._post_headers(),
            timeout=30,
        )
        response.raise_for_status()
        return response.json()

    def delete_service_entry(self, entry_id: int) -> None:
        """DELETE /api/v1/service-entries/{id} – remove a service entry."""
        response = self.session.delete(
            f"{self.base_url}/api/v1/service-entries/{entry_id}",
            headers=self._post_headers(),
            timeout=30,
        )
        response.raise_for_status()