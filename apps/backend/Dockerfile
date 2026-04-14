FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y build-essential libpq-dev curl && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# --proxy-headers + --forwarded-allow-ips=*  →  uvicorn übernimmt die echte
# Client-IP aus dem von Caddy gesetzten X-Forwarded-For Header. Wichtig für
# das Rate-Limiting auf /auth/login.
#
# Migrationen laufen als eigener Schritt im GitHub-Actions Workflow VOR
# `compose up`, damit ein Migration-Failure den Container nicht in einen
# Crash-Loop zwingt. Lokal:
#     docker compose run --rm backend alembic upgrade head
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--proxy-headers", \
     "--forwarded-allow-ips=*"]
