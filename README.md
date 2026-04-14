# FrohZeitRakete

**Digitale Pflegedokumentation für die Fröhlich Dienste — Mobile, Admin Web und Backend in einem Monorepo.**

[![Deploy](https://github.com/lucasterix/frohzeitrakete/actions/workflows/deploy.yml/badge.svg)](https://github.com/lucasterix/frohzeitrakete/actions/workflows/deploy.yml)
![Backend](https://img.shields.io/badge/backend-FastAPI%200.135-009688)
![Frontend](https://img.shields.io/badge/admin-Next.js-000000)
![Mobile](https://img.shields.io/badge/mobile-Flutter%203.11-02569B)
![Database](https://img.shields.io/badge/database-PostgreSQL%2016-336791)
![Infra](https://img.shields.io/badge/infra-Docker%20%2B%20Caddy-2496ED)

---

## Was ist das?

Die FrohZeitRakete ersetzt die manuelle Papier- und Excel-Dokumentation in der ambulanten
Pflege durch einen vollständig digitalen Workflow. Betreuungskräfte erfassen ihre
Tageseinsätze direkt beim Patienten, lassen Leistungsnachweise und Anträge auf dem
Smartphone unterschreiben und sehen jederzeit das aktuelle Restbudget aus dem
Pflegemanagement-System **Patti**. Das Büro behält über das Admin Web den Überblick
über User, Sessions und unterschriebene Dokumente.

### Zentrale Funktionen

| Bereich | Funktion |
|---|---|
| **Tageseinsätze** | Erfassung in 0,5h-Schritten, Tag-basierte Aggregation, Aktivitäten-Tags |
| **Signaturen** | SVG-Capture auf dem Smartphone für Leistungsnachweis, VP-Antrag, Pflegeumwandlung |
| **Patti-Live-Daten** | Reststunden, Restbudget und Stammdaten direkt aus Patti, schreibend wie lesend |
| **Vertretungs-Modus** | Globale Patientensuche, wenn ein:e Kolleg:in einspringt |
| **Stammdaten-Pflege** | Telefonnummer, Versichertennummer, Geburtsdatum aus der App heraus pflegen |
| **Monats-Locking** | Sobald der Leistungsnachweis eines Monats unterschrieben ist, wird der Monat eingefroren |
| **Authentifizierung** | Cookie-basiertes JWT mit Refresh-Token-Rotation, Session-Übersicht und Remote-Logout |
| **Admin Web** | User- und Sessionverwaltung, Signatur-Review, Activity-Feed |

---

## Architektur

```
                              ┌──────────────────────┐
                              │   Caddy (HTTPS, TLS) │
                              └─────┬────────────┬───┘
              admin.froehlichdienste.de          api.froehlichdienste.de
                                    │            │
                          ┌─────────▼──┐   ┌─────▼──────────┐
                          │ Admin Web  │   │    Backend     │
                          │ (Next.js)  │──▶│   (FastAPI)    │
                          └────────────┘   └──┬─────────┬───┘
                                              │         │
                          ┌──────────────┐    │         │
                          │  Mobile App  │────┘         │
                          │  (Flutter)   │              │
                          └──────────────┘              │
                                                        │
                                          ┌─────────────▼───┐    ┌──────────────┐
                                          │   PostgreSQL    │    │   Patti API  │
                                          │       16        │    │   (extern)   │
                                          └─────────────────┘    └──────────────┘
```

Detailliertes Architektur-Dokument: [`docs/architecture.md`](docs/architecture.md)

---

## Tech-Stack

### Backend (`apps/backend`)
- **FastAPI 0.135** — Async Python Web Framework
- **SQLAlchemy 2.0** mit typed Mapped-Columns
- **Alembic** — versionierte DB-Migrationen
- **PostgreSQL 16**
- **python-jose** + **bcrypt** — JWT und Passwort-Hashing
- **Requests** + **BeautifulSoup4** — Patti-Integration (CSRF, Session-Cookies)

### Admin Web (`apps/admin-web`)
- **Next.js** (App Router) mit **TypeScript**
- Cookie-basiertes Auth mit automatischem Token-Refresh

### Mobile App (`apps/mobile`)
- **Flutter 3.11** / Dart 3
- **Riverpod** — State Management
- **Dio** + **dio_cookie_manager** — HTTP-Client mit persistenten Cookies
- **shared_preferences** — lokale Einstellungen
- **sqflite** + **connectivity_plus** — Offline-Queue mit automatischem Sync
- **sentry_flutter** — Error-Monitoring (per `--dart-define=SENTRY_DSN=...`)
- **local_auth** — FaceID / TouchID / Android-Biometrie

### Infrastruktur (`infra/staging`)
- **Docker Compose** — Postgres, Backend, Admin Web, Caddy
- **Caddy 2** — automatisches Let's Encrypt
- **GitHub Actions** — CI/CD Auto-Deploy bei Push auf `main`
- Gehostet auf **Hetzner Cloud**

---

## Repo-Struktur

```
frohzeitrakete/
├── apps/
│   ├── backend/              FastAPI Backend
│   │   ├── app/
│   │   │   ├── api/          HTTP Routes (auth, mobile, admin_users, admin_signatures)
│   │   │   ├── core/         Auth, Security, Settings
│   │   │   ├── clients/      Patti HTTP Client
│   │   │   ├── db/           SQLAlchemy Engine, Session, Base
│   │   │   ├── models/       SQLAlchemy ORM Models
│   │   │   ├── repositories/ DB-Zugriffslayer
│   │   │   ├── schemas/      Pydantic Request/Response Schemas
│   │   │   ├── services/     Business Logic
│   │   │   └── main.py       FastAPI App + Router-Registry
│   │   ├── migrations/       Alembic-Versionen
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   │
│   ├── admin-web/            Next.js Admin Frontend
│   │   ├── app/              App Router Pages
│   │   ├── components/       UI-Komponenten
│   │   └── lib/api.ts        Typed Backend-Client
│   │
│   └── mobile/               Flutter Mobile App
│       └── lib/
│           ├── core/         API-Client, Models, Repositories, Providers
│           ├── features/     Screens nach Domäne (auth, patients, entries, signatures …)
│           ├── shared/       Wiederverwendbare Widgets
│           └── navigation/   App-Navigation
│
├── infra/staging/            Docker Compose + Caddy für Hetzner-Staging
├── docs/                     Architektur, API-Referenz, Deployment
└── .github/workflows/        GitHub Actions (Auto-Deploy)
```

---

## Quick Start (lokal)

### Voraussetzungen
- Docker & Docker Compose
- Node.js 20+ (für Admin Web Dev Server)
- Flutter SDK 3.11+ (für Mobile App)
- Python 3.12 (für lokale Backend-Entwicklung)

### Backend + DB starten
```bash
cd infra/staging
cp .env.example .env       # Werte ausfüllen (siehe docs/deployment.md)
docker compose up -d postgres backend
```

Das Backend ist dann unter `http://localhost:8000` erreichbar, die interaktive
OpenAPI-Doku unter `http://localhost:8000/docs`.

### Admin Web im Dev-Modus
```bash
cd apps/admin-web
npm install
npm run dev
# http://localhost:3000
```

### Mobile App
```bash
cd apps/mobile
flutter pub get
flutter run
```

---

## Live-Umgebung

| Service | URL |
|---|---|
| Backend API | https://api.froehlichdienste.de |
| OpenAPI Docs | https://api.froehlichdienste.de/docs |
| Admin Web | https://admin.froehlichdienste.de |
| Health Check | https://api.froehlichdienste.de/health |

Gehostet auf einem Hetzner-Server mit Caddy als Reverse-Proxy und automatischem
Let's-Encrypt-Zertifikat. Deployment erfolgt automatisch via GitHub Actions bei
jedem Push auf `main` — Details siehe [`docs/deployment.md`](docs/deployment.md).

---

## Dokumentation

- [Architektur](docs/architecture.md) — Komponenten, Datenflüsse, Auth-Modell, Datenmodell
- [API-Referenz](docs/api.md) — Alle HTTP-Endpunkte mit Beispielen
- [Deployment](docs/deployment.md) — CI/CD, Server-Setup, Migrationen, Rollback
- [Ops-Handbuch](infra/OPS.md) — Monitoring, Prod/Staging-Split, Incident-Response
- [Mobile Release Guide](infra/mobile/RELEASE.md) — Bundle-IDs, Keystore, TestFlight, Play Store
- [Erst-Setup Script](infra/setup/first_time_setup.sh) — One-Shot Bootstrap für neue Hetzner-Hosts

---

## Sicherheit

- HttpOnly-Cookies mit `Secure` und `SameSite=Lax` für Access- und Refresh-Tokens
- Refresh-Token-Rotation bei jedem Refresh, Session-Listing und Remote-Revoke
- Bcrypt-Passwort-Hashing
- CORS-Allowlist statt Wildcard
- Patti-Credentials und SECRET_KEY ausschließlich serverseitig in `.env` (nicht im Git)
- Deploy-SSH-Key als verschlüsseltes GitHub Secret, Read-only Pull über HTTPS

---

## Lizenz und Nutzung

Internes Projekt der Fröhlich Dienste. Für Anfragen oder Zugang zu den
geschützten Umgebungen wenden Sie sich an das Team.
