"""Patti HTTP Client mit Timeout, Retry und Connection-Resilienz.

Patti ist ein externes System ohne offizielle API-Auth. Wir loggen uns über
HTML-Form + CSRF ein und halten das Session-Cookie. Da es ein externer Dienst
ist, müssen wir defensiv sein:

- Timeouts kurz halten (default 10s) — User wartet sonst zu lange
- Retry mit exponential backoff bei transienten Fehlern (Connection, Read, 5xx)
- Login-Cookie wird bei 401/419 (Patti CSRF expired) automatisch erneuert
"""

from __future__ import annotations

from typing import Any
from urllib.parse import unquote

import requests
from bs4 import BeautifulSoup
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.core.logging import get_logger
from app.core.settings import settings

logger = get_logger("patti")

# Welche Fehler sind transient und sollten retried werden?
_TRANSIENT_EXCEPTIONS = (
    requests.exceptions.ConnectionError,
    requests.exceptions.ReadTimeout,
    requests.exceptions.ChunkedEncodingError,
)


class PattiError(RuntimeError):
    """Fachlicher Fehler in der Patti-Kommunikation – wird in Services/Routes
    in HTTPException umgewandelt damit der Client einen sauberen 502/503 sieht
    statt einem 500.
    """


class PattiClient:
    def __init__(self) -> None:
        self.base_url = settings.patti_base_url.rstrip("/")
        self.timeout = settings.patti_timeout_seconds
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

        raise PattiError("CSRF token could not be extracted from Patti login page.")

    @retry(
        retry=retry_if_exception_type(_TRANSIENT_EXCEPTIONS),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
        reraise=True,
    )
    def login(self) -> None:
        login_url = f"{self.base_url}/login"

        login_page_response = self.session.get(login_url, timeout=self.timeout)
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
            timeout=self.timeout,
        )

        if response.status_code not in (302, 303):
            raise PattiError(
                f"Patti login failed. Status={response.status_code}, body={response.text[:500]}"
            )

        if "laravel_session" not in self.session.cookies:
            raise PattiError("Patti login failed: laravel_session cookie missing.")

        # Nach dem Login einmal die Root-Seite aufrufen damit ein frischer
        # XSRF-TOKEN Cookie gesetzt wird. Patti vergibt einen neuen Token beim
        # ersten authenticated request – ohne den werden POSTs mit 419 abgewiesen.
        self.session.get(f"{self.base_url}/", timeout=self.timeout)
        logger.info("patti_login_success")

    def _post_headers(self) -> dict[str, str]:
        """Header mit aktuellem XSRF-Token für schreibende Requests."""
        xsrf = self.session.cookies.get("XSRF-TOKEN")
        if xsrf:
            return {"X-XSRF-TOKEN": unquote(xsrf)}
        return {}

    @retry(
        retry=retry_if_exception_type(_TRANSIENT_EXCEPTIONS),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
        reraise=True,
    )
    def _get(self, path: str, **kwargs) -> requests.Response:
        kwargs.setdefault("timeout", self.timeout)
        response = self.session.get(f"{self.base_url}{path}", **kwargs)
        response.raise_for_status()
        return response

    @retry(
        retry=retry_if_exception_type(_TRANSIENT_EXCEPTIONS),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
        reraise=True,
    )
    def _post(self, path: str, **kwargs) -> requests.Response:
        kwargs.setdefault("timeout", self.timeout)
        kwargs.setdefault("headers", {}).update(self._post_headers())
        response = self.session.post(f"{self.base_url}{path}", **kwargs)
        response.raise_for_status()
        return response

    @retry(
        retry=retry_if_exception_type(_TRANSIENT_EXCEPTIONS),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
        reraise=True,
    )
    def _put(self, path: str, **kwargs) -> requests.Response:
        kwargs.setdefault("timeout", self.timeout)
        kwargs.setdefault("headers", {}).update(self._post_headers())
        response = self.session.put(f"{self.base_url}{path}", **kwargs)
        response.raise_for_status()
        return response

    @retry(
        retry=retry_if_exception_type(_TRANSIENT_EXCEPTIONS),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
        reraise=True,
    )
    def _delete(self, path: str, **kwargs) -> requests.Response:
        kwargs.setdefault("timeout", self.timeout)
        kwargs.setdefault("headers", {}).update(self._post_headers())
        response = self.session.delete(f"{self.base_url}{path}", **kwargs)
        response.raise_for_status()
        return response

    # --- Service Histories --------------------------------------------------

    def get_service_histories_by_person_id(self, person_id: int, page: int = 1) -> Any:
        params = [
            ("page", str(page)),
            ("orderBy", "patient_person.list_name"),
            ("orderDir", "asc"),
            ("person_id", str(person_id)),
            ("patient.person.address.city", ""),
            ("is_primary[]", "true"),
        ]
        return self._get("/api/v1/service-histories", params=params).json()

    def get_service_histories_for_patient(
        self, patient_id: int, per_page: int = 50
    ) -> dict[str, Any]:
        """Alle service-histories (aktive + beendete, primary + vertretung)
        für einen Patienten, für die Betreuer-Historie.
        """
        return self._get(
            "/api/v1/service-histories",
            params={"patient_id": str(patient_id), "per_page": str(per_page)},
        ).json()

    # --- Patient endpoints --------------------------------------------------

    def get_patient(self, patient_id: int) -> dict[str, Any]:
        """GET /api/v1/patients/{patient} – full patient profile incl. patientRates."""
        return self._get(f"/api/v1/patients/{patient_id}").json()

    def list_patients(self, page: int = 1, per_page: int = 50) -> dict[str, Any]:
        """GET /api/v1/patients – list all patients of the organisation."""
        return self._get(
            "/api/v1/patients",
            params={"page": str(page), "per_page": str(per_page)},
        ).json()

    def get_company(self, company_id: int) -> dict[str, Any]:
        """GET /api/v1/companies/{company_id} – insurance/pflege companies."""
        return self._get(f"/api/v1/companies/{company_id}").json()

    def update_communication(
        self,
        communication_id: int,
        *,
        mobile_number: str | None = None,
        phone_number: str | None = None,
        email: str | None = None,
    ) -> dict[str, Any]:
        """PUT /api/v1/communications/{id} – updates phone/email fields."""
        return self._put(
            f"/api/v1/communications/{communication_id}",
            json={
                "mobile_number": mobile_number,
                "phone_number": phone_number,
                "email": email,
                "fax_number": None,
                "website": None,
            },
        ).json()

    def update_patient(
        self,
        patient_id: int,
        *,
        insurance_number: str | None = None,
        insurance_company_id: int | None = None,
        care_degree: str | None = None,
        care_degree_since: str | None = None,
        active: bool | None = None,
    ) -> dict[str, Any]:
        """PUT /api/v1/patients/{id} – update patient attributes."""
        return self._put(
            f"/api/v1/patients/{patient_id}",
            json={
                "insurance_number": insurance_number,
                "insurance_company_id": insurance_company_id,
                "care_degree": care_degree,
                "care_degree_since": care_degree_since,
                "active": active,
            },
        ).json()

    def update_person(
        self,
        person_id: int,
        *,
        first_name: str,
        last_name: str,
        born_at: str | None = None,
    ) -> dict[str, Any]:
        """PUT /api/v1/people/{id} – update person (birthday etc.)."""
        return self._put(
            f"/api/v1/people/{person_id}",
            json={
                "first_name": first_name,
                "last_name": last_name,
                "born_at": born_at,
            },
        ).json()

    def get_person(self, person_id: int) -> dict[str, Any]:
        """GET /api/v1/people/{person_id} – includes communication & address."""
        return self._get(f"/api/v1/people/{person_id}").json()

    def search(self, query: str) -> dict[str, Any]:
        """GET /api/v1/search?q=... – globale Patti-Suche."""
        return self._get("/api/v1/search", params={"q": query}).json()

    # --- Helper endpoints (budgets) -----------------------------------------

    def get_remaining_care_service_budget(
        self, patient_id: int, year: int
    ) -> dict[str, Any]:
        return self._get(
            "/api/v1/helpers/remaining-care-service-budgets",
            params={"patient_id": str(patient_id), "year": str(year)},
        ).json()

    def get_remaining_respite_care_budget(
        self, patient_id: int, year: int
    ) -> dict[str, Any]:
        return self._get(
            "/api/v1/helpers/remaining-respite-care-budgets",
            params={"patient_id": str(patient_id), "year": str(year)},
        ).json()

    def get_patient_date_rate(
        self, patient_id: int, year: int, month: int, type: str
    ) -> dict[str, Any]:
        return self._get(
            "/api/v1/helpers/patient-date-rate",
            params={
                "patient_id": str(patient_id),
                "year": str(year),
                "month": str(month),
                "type": type,
            },
        ).json()

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
        """POST /api/v1/service-entries – legt geleistete Stunden in Patti an."""
        return self._post(
            "/api/v1/service-entries",
            json={
                "patient_id": patient_id,
                "type": type_,
                "kind": kind,
                "year": year,
                "month": month,
                "hours": hours,
            },
        ).json()

    def delete_service_entry(self, entry_id: int) -> None:
        """DELETE /api/v1/service-entries/{id}."""
        self._delete(f"/api/v1/service-entries/{entry_id}")

    def get_leistungsnachweis_pdf(
        self,
        patient_id: int,
        *,
        year: int | None = None,
        month: int | None = None,
    ) -> bytes:
        """Lädt das Leistungsnachweis-PDF direkt aus Patti.

        URL-Muster: ``/patients/{id}/leistungsnachweis.pdf`` (mit
        optionalem ``?year=...&month=...``). Patti generiert das PDF
        serverseitig inkl. QR-Code. Nutzt die bestehende Session (der
        Client muss vorher ``login()`` gerufen haben).

        Wirft requests.HTTPError wenn Patti 4xx/5xx liefert — Caller
        soll das als "Fallback auf eigenes PDF" interpretieren.
        """
        params: dict[str, Any] = {}
        if year is not None:
            params["year"] = year
        if month is not None:
            params["month"] = month
        url = f"/patients/{patient_id}/leistungsnachweis.pdf"
        response = self._get(url, params=params or None)
        response.raise_for_status()
        if not response.content.startswith(b"%PDF"):
            # Patti hat vermutlich eine HTML-Login-Page zurückgegeben
            raise ValueError("patti_response_is_not_pdf")
        return response.content
