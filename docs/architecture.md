# Architektur

Dieses Dokument beschreibt die technische Architektur der FrohZeitRakete:
Komponenten, Datenflüsse, das Authentifizierungsmodell und das Datenmodell.

---

## Komponenten-Übersicht

```
┌────────────────────────────────────────────────────────────────────┐
│                          Hetzner Cloud Server                      │
│                                                                    │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │                       Caddy 2 (HTTPS)                       │  │
│   │            Auto Let's Encrypt · Reverse Proxy               │  │
│   └────┬───────────────────────────────────────────┬────────────┘  │
│        │ admin.froehlichdienste.de                 │ api.froehlichdienste.de
│        ▼                                           ▼               │
│  ┌────────────┐                            ┌────────────────┐      │
│  │ admin-web  │                            │    backend     │      │
│  │  Next.js   │ ──── /admin/* /auth/* ────▶│   FastAPI      │      │
│  │  Port 3000 │                            │   Port 8000    │      │
│  └────────────┘                            └────────┬───────┘      │
│                                                     │              │
│                                            ┌────────▼───────┐      │
│                                            │   PostgreSQL   │      │
│                                            │   fzr_postgres │      │
│                                            └────────────────┘      │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
                                                     ▲       ▲
                                                     │       │
                                              /mobile/*    Patti API
                                                     │       │
                                            ┌────────┴───┐   │
                                            │ Mobile App │   │
                                            │  Flutter   │   │
                                            └────────────┘   │
                                                             │
                                                       ┌─────┴────┐
                                                       │  Patti   │
                                                       │ (extern) │
                                                       └──────────┘
```

Alle vier Container (`fzr_caddy`, `fzr_admin`, `fzr_backend`, `fzr_postgres`) laufen
in einem gemeinsamen Docker-Netzwerk. Caddy ist der einzige Container mit
Ports nach außen (80, 443).

---

## Backend (`apps/backend`)

### Layer

Das Backend folgt einem klassischen Schichtmodell:

```
┌──────────────────────────────────────────────┐
│              api/  (HTTP Routes)             │  ← FastAPI Router
├──────────────────────────────────────────────┤
│         services/  (Business Logic)          │  ← Workflows, Validierung
├──────────────────────────────────────────────┤
│   repositories/  (DB-Zugriff)   clients/     │  ← SQLAlchemy / Patti
├──────────────────────────────────────────────┤
│   models/  (ORM)         schemas/ (Pydantic) │  ← Datenstrukturen
├──────────────────────────────────────────────┤
│           core/  (Auth · Settings)           │  ← Cross-cutting
└──────────────────────────────────────────────┘
```

### Router

| Prefix | Datei | Zweck |
|---|---|---|
| `/auth` | `api/auth.py` | Login, Refresh, Logout, eigene Sessions |
| `/mobile` | `api/mobile.py` | Caretaker-API: Patienten, Tageseinsätze, Signaturen, Patti-Budget |
| `/admin` | `api/admin_users.py` | User-CRUD, Sessions widerrufen |
| `/admin` | `api/admin_signatures.py` | Signaturen auflisten, Activity-Feed, Test-Signaturen |

### Patti-Integration

`app/clients/patti_client.py` enthält einen HTTP-Client für das externe
Pflegemanagement-System Patti. Da Patti keine offizielle API-Authentifizierung
für externe Apps bietet, läuft der Login wie folgt ab:

1. GET `/login` — HTML-Seite holen, CSRF-Token aus dem `<input name="_token">` extrahieren
2. POST `/login` — Credentials + CSRF-Token submitten
3. `laravel_session`-Cookie wird in einer `requests.Session` gehalten
4. Folgeaufrufe an `/api/v1/...` nutzen das gleiche Session-Objekt

Aus den Patti-Daten werden im `patient_service` die für die App relevanten Felder
gemappt — Patientenliste, Reststunden-Budget, Service-History.

---

## Datenmodell

```
┌─────────────────┐         ┌──────────────────────┐
│     users       │         │   refresh_tokens     │
├─────────────────┤         ├──────────────────────┤
│ id              │◀────────│ user_id (FK)         │
│ email           │         │ token_hash           │
│ password_hash   │         │ device_label         │
│ full_name       │         │ user_agent           │
│ role            │         │ ip_address           │
│ is_active       │         │ created_at           │
│ patti_person_id │         │ last_used_at         │
│ created_at      │         │ expires_at           │
│ updated_at      │         │ revoked_at           │
└────────┬────────┘         └──────────────────────┘
         │
         │  created_by_user_id
         │
┌────────▼──────────────┐         ┌──────────────────┐
│  signature_events     │ 1────1  │ signature_assets │
├───────────────────────┤◀────────├──────────────────┤
│ id                    │         │ id               │
│ patient_id            │         │ signature_event_id│
│ document_type         │         │ svg_content      │
│ status                │         │ width / height   │
│ signer_name           │         │ created_at       │
│ info_text_version     │         └──────────────────┘
│ source                │
│ note                  │
│ created_by_user_id    │
│ signed_at             │
│ created_at            │
│ updated_at            │
└────────┬──────────────┘
         │
         │  signature_event_id (nullable)
         │
┌────────▼──────────────┐
│       entries         │   "Tageseinsätze"
├───────────────────────┤
│ id                    │
│ user_id (FK users)    │
│ patient_id            │
│ entry_date            │
│ hours                 │      0,5h-Schritte, max 8h, kein Future-Datum
│ activities            │      kommagetrennter String
│ note                  │
│ signature_event_id    │      verknüpft mit Leistungsnachweis nach Unterschrift
│ patti_id              │      ID des korrespondierenden Patti-Eintrags (best-effort)
│ created_at            │
│ updated_at            │
│                       │
│ UNIQUE(user_id,       │
│        patient_id,    │
│        entry_date)    │
└───────────────────────┘
```

### Migrations

Alle Schemaänderungen laufen über Alembic. Aktuell:

| Revision | Datei | Inhalt |
|---|---|---|
| `0001` | `0001_initial_schema.py` | users · refresh_tokens · signature_events · signature_assets |
| `0002` | `0002_entries.py` | entries-Tabelle |
| `0003` | `0003_entries_patti_id.py` | `entries.patti_id`-Spalte für Patti-Sync |

Beim Container-Start läuft automatisch `alembic upgrade head` (siehe `Dockerfile`),
neue Migrationen werden also bei jedem Deploy mitgezogen.

---

## Authentifizierung & Sessions

### Tokens

| Token | Lebensdauer | Speicherung |
|---|---|---|
| Access-Token (JWT) | 15 Min | HttpOnly-Cookie `fz_access_token` |
| Refresh-Token (Random 64 Bytes) | 30 Tage | HttpOnly-Cookie `fz_refresh_token` + DB-Hash |

### Login-Flow

```
Client                Backend                  DB
  │                       │                     │
  │  POST /auth/login     │                     │
  ├──────────────────────▶│                     │
  │                       │  verify password    │
  │                       ├────────────────────▶│
  │                       │◀────────────────────┤
  │                       │  create access_jwt  │
  │                       │  create refresh_tok │
  │                       │  store SHA256(rt)   │
  │                       ├────────────────────▶│
  │  Set-Cookie: access   │                     │
  │  Set-Cookie: refresh  │                     │
  │◀──────────────────────┤                     │
```

### Refresh mit Rotation

Bei jedem `/auth/refresh` wird der alte Refresh-Token revoked und ein neuer
ausgestellt. Dadurch lässt sich Token-Diebstahl erkennen — ein doppelt
benutzter Refresh-Token deutet auf einen kompromittierten Client hin.

### Sessions

Jeder Refresh-Token entspricht einer Session. User können über
`GET /auth/sessions` ihre eigenen Geräte einsehen und mit
`POST /auth/sessions/{id}/revoke` einzeln widerrufen. Admins haben dieselbe
Möglichkeit für jeden User über `/admin/users/{id}/sessions`.

---

## Mobile-App-Architektur

```
┌──────────────────────────────────────────────────────┐
│                      Screens                         │  ← features/<domain>/
├──────────────────────────────────────────────────────┤
│                Riverpod Providers                    │  ← core/providers.dart
├──────────────────────────────────────────────────────┤
│                  Repositories                        │  ← core/repositories/
├──────────────────────────────────────────────────────┤
│             ApiClient (Dio + Cookies)                │  ← core/api/
└──────────────────────────────────────────────────────┘
```

- **Cookies** werden über `dio_cookie_manager` persistent in `cookie_jar` gehalten
  — d.h. die App bleibt nach Neustart eingeloggt, solange der Refresh-Token gültig ist.
- **Riverpod** stellt Providers für Auth-State, Repositories und Listenviews bereit.
- **Repositories** kapseln die HTTP-Calls und liefern getypte Models zurück.

### Features (Auswahl)

| Feature | Beschreibung |
|---|---|
| `auth/login_screen` | Login mit Email/Passwort, Server-URL umstellbar |
| `home/home_screen` | Dashboard mit Quick-Actions und Übersicht |
| `patients/patients_screen` | Liste meiner Patienten + globale Suche |
| `patients/patient_detail_screen` | Stammdaten, Budget, Einsätze, inline editierbar |
| `entries/entry_screen` | Tageseinsatz erfassen (Datum, Stunden, Aktivitäten) |
| `entries/month_overview_screen` | Monatsübersicht aller Einsätze |
| `signatures/signature_screen` | SVG-Signatur-Capture |
| `requests/umwandlung_screen` | Pflegeumwandlungs-Antrag |
| `vp_antrag/vp_antrag_screen` | Verhinderungspflege-Antrag |

---

## CI/CD und Deployment

Bei jedem Push auf `main` läuft der Workflow `.github/workflows/deploy.yml`:

```
git push origin main
        │
        ▼
┌─────────────────────────┐
│  GitHub Actions Runner  │
│      ubuntu-latest      │
└──────────┬──────────────┘
           │  SSH (Deploy-Key aus GitHub Secret)
           ▼
┌─────────────────────────┐
│  deploy@hetzner-server  │
├─────────────────────────┤
│  cd ~/apps/frohzeit...  │
│  git pull               │
│  cd infra/staging       │
│  docker compose up -d   │
│         --build         │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│   fzr_backend startet   │
│  alembic upgrade head   │
│  uvicorn app.main:app   │
└─────────────────────────┘
```

Mehr Details in [`deployment.md`](deployment.md).
