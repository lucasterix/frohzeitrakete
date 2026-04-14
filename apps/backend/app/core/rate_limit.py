"""Zentraler Rate-Limiter, geteilt von main.py und allen API-Routen.

slowapi-Limiter haben In-Memory-State pro Instanz – wir brauchen genau eine
Instanz, die wir sowohl an die FastAPI-App hängen als auch in den Routen für
den `@limiter.limit(...)` Decorator nutzen.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, default_limits=[])
