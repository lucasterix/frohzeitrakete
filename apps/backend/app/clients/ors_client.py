"""OpenRouteService client for geocoding and driving-distance calculation.

ORS is a free-tier routing service. We use two endpoints:
- GET /geocode/search        address → coordinates
- POST /v2/directions/driving-car  coords → driving distance in km

API key comes from settings.ors_api_key (env: ORS_API_KEY). Without a key,
the client raises so callers can fall back to "no km calculated".
"""

from __future__ import annotations

import requests
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.core.logging import get_logger
from app.core.settings import settings

logger = get_logger("ors")

_TRANSIENT_EXCEPTIONS = (
    requests.exceptions.ConnectionError,
    requests.exceptions.ReadTimeout,
    requests.exceptions.ChunkedEncodingError,
)


class OrsError(RuntimeError):
    """Fachlicher ORS-Fehler (invalid address, quota exceeded, ...)."""


class OrsClient:
    def __init__(self) -> None:
        self.api_key = settings.ors_api_key
        self.base_url = "https://api.openrouteservice.org"
        self.timeout = 15

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key)

    def _require_key(self) -> None:
        if not self.api_key:
            raise OrsError("ORS_API_KEY ist nicht gesetzt")

    @retry(
        retry=retry_if_exception_type(_TRANSIENT_EXCEPTIONS),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
        reraise=True,
    )
    def geocode(self, address: str) -> tuple[float, float] | None:
        """Resolve a free-text address to (longitude, latitude).

        Returns None if the address cannot be resolved.
        ORS returns coordinates as [lon, lat] (GeoJSON convention).
        """
        self._require_key()
        try:
            response = requests.get(
                f"{self.base_url}/geocode/search",
                params={
                    "api_key": self.api_key,
                    "text": address,
                    "size": "1",
                    # Boundary: nur Deutschland um falsche Matches zu vermeiden
                    "boundary.country": "DE",
                },
                timeout=self.timeout,
            )
            response.raise_for_status()
            data = response.json()
            features = data.get("features") or []
            if not features:
                logger.info("ors_geocode_no_match", address=address)
                return None
            coords = features[0]["geometry"]["coordinates"]
            label = features[0]["properties"].get("label", "")
            logger.debug(
                "ors_geocode_ok",
                address=address,
                matched=label,
                lon=coords[0],
                lat=coords[1],
            )
            return (coords[0], coords[1])
        except requests.exceptions.HTTPError as e:
            logger.warning(
                "ors_geocode_failed",
                address=address,
                status=e.response.status_code if e.response else None,
            )
            return None

    @retry(
        retry=retry_if_exception_type(_TRANSIENT_EXCEPTIONS),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
        reraise=True,
    )
    def route_distance_km(
        self,
        from_coords: tuple[float, float],
        to_coords: tuple[float, float],
    ) -> float | None:
        """Calculate driving distance in km between two (lon, lat) pairs."""
        self._require_key()
        try:
            response = requests.post(
                f"{self.base_url}/v2/directions/driving-car",
                headers={
                    "Authorization": self.api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "coordinates": [
                        [from_coords[0], from_coords[1]],
                        [to_coords[0], to_coords[1]],
                    ],
                },
                timeout=self.timeout,
            )
            response.raise_for_status()
            data = response.json()
            routes = data.get("routes") or []
            if not routes:
                return None
            distance_m = routes[0].get("summary", {}).get("distance")
            if distance_m is None:
                return None
            km = round(distance_m / 1000, 2)
            logger.debug(
                "ors_route_ok",
                from_lon=from_coords[0],
                from_lat=from_coords[1],
                to_lon=to_coords[0],
                to_lat=to_coords[1],
                km=km,
            )
            return km
        except requests.exceptions.HTTPError as e:
            logger.warning(
                "ors_route_failed",
                status=e.response.status_code if e.response else None,
                body=e.response.text[:200] if e.response else None,
            )
            return None
