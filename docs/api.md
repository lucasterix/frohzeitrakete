# API-Referenz

Vollständige Übersicht aller HTTP-Endpunkte des FrohZeitRakete-Backends.
Die interaktive Swagger-UI ist live unter
[https://api.froehlichdienste.de/docs](https://api.froehlichdienste.de/docs).

**Base URL (Production):** `https://api.froehlichdienste.de`

## Authentifizierung

Das Backend nutzt **HttpOnly-Cookies** für Auth, alternativ funktionieren
auch Bearer-Tokens im `Authorization`-Header.

| Cookie | Inhalt | Lebensdauer |
|---|---|---|
| `fz_access_token` | JWT (HS256) | 15 Minuten |
| `fz_refresh_token` | Random 64 Bytes (URL-safe) | 30 Tage, rotiert bei jedem Refresh |

Browser-Clients setzen automatisch `credentials: "include"`, Mobile-Clients
nutzen einen persistenten `cookie_jar`. Nach 401 sollte automatisch ein
`POST /auth/refresh` versucht und der Original-Request wiederholt werden.

---

## Konventionen

- Alle Bodies sind `application/json`.
- Datums- und Zeitfelder sind ISO 8601.
- Validierungsfehler kommen als `422 Unprocessable Entity` (FastAPI default).
- Fachliche Fehler kommen als `4xx` mit `{"detail": "<Klartext, deutsch>"}`.

---

## Health

### `GET /health`
Liveness-Check, kein Auth nötig.
```json
{ "status": "ok" }
```

---

## Auth `/auth`

### `POST /auth/login`
Einloggen mit Email und Passwort. Setzt die Auth-Cookies.

**Request**
```json
{ "email": "user@example.com", "password": "..." }
```

**Response 200**
```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "full_name": "Max Mustermann",
    "role": "caretaker",
    "is_active": true,
    "patti_person_id": 3416
  }
}
```

### `POST /auth/refresh`
Tauscht den Refresh-Cookie gegen ein neues Token-Paar (Rotation).

### `POST /auth/logout`
Widerruft die aktuelle Session und löscht die Cookies.

### `GET /auth/me`
Liefert den eingeloggten User.

### `GET /auth/sessions`
Listet alle aktiven und widerrufenen Sessions des aktuellen Users.

### `POST /auth/sessions/{session_id}/revoke`
Widerruft eine einzelne Session (z.B. „Logout auf anderem Gerät").

---

## Mobile API `/mobile`

Diese Endpunkte sind für die Flutter-App gedacht und nutzen den
eingeloggten Caretaker als Kontext.

### Patienten

#### `GET /mobile/patients`
Liefert die dem Caretaker zugeordneten primären Patienten aus Patti.

#### `GET /mobile/patients/search?q=<text>`
Globale Patientensuche über alle Patti-Patienten der Organisation.
Wird im Vertretungsfall genutzt.

#### `PATCH /mobile/patients/{patient_id}`
Partial Update der Patient-Stammdaten (Telefon, Versichertennummer,
Geburtsdatum) — schreibt direkt in Patti zurück.

```json
{
  "phone": "+49 170 1234567",
  "phone_landline": "",
  "insurance_number": "A123456789",
  "birthday": "1942-08-12"
}
```

> Nicht gesetzte Felder bleiben unverändert. Ein leerer String löscht das Feld in Patti.

#### `GET /mobile/patients/{patient_id}/patti-budget?year=2026`
Liefert das Live-Budget aus Patti für den angegebenen Patienten und das Jahr.

```json
{
  "care_service_remaining_hours": 12.5,
  "care_service_remaining_budget": 543.20,
  "respite_care_remaining_hours": 80,
  "respite_care_remaining_budget": 1612.00
}
```

#### `GET /mobile/patients/{patient_id}/hours-summary?year=2026&month=4`
Aggregat über die Einsätze des aktuellen Users für diesen Patienten und Monat.

```json
{
  "patient_id": 123,
  "year": 2026,
  "month": 4,
  "used_hours": 18.5,
  "entries_count": 11,
  "is_locked": false
}
```

`is_locked = true`, sobald der Leistungsnachweis für diesen Monat unterschrieben wurde.

### Tageseinsätze (Entries)

#### `POST /mobile/entries`
Legt einen Tageseinsatz an. Wenn schon einer für denselben Tag existiert,
werden die Stunden addiert (MVP-Regel). Synchronisiert best-effort nach Patti.

```json
{
  "patient_id": 123,
  "entry_date": "2026-04-13",
  "hours": 1.5,
  "activities": ["Hauswirtschaft", "Vorlesen"],
  "note": null
}
```

**Constraints:**
- `hours`: 0,5-Schritte, mindestens 0,5, maximal 8,0
- `entry_date`: nicht in der Zukunft
- Wenn der Monat schon „locked" ist → `409 Conflict`

#### `GET /mobile/entries?scope=mine|patient&patient_id=&year=&month=`
Listet Einsätze, optional gefiltert. `scope=mine` (default) zeigt nur die
eigenen, `scope=patient` zeigt alle Einsätze aller Betreuer für den
angegebenen Patienten (für die Vertretungs-Sicht). Die Response enthält
`user_name` für die Anzeige.

#### `GET /mobile/entries/{entry_id}`
Einzelner Einsatz.

#### `DELETE /mobile/entries/{entry_id}`
Löscht einen Einsatz (sofern noch nicht gelockt).

### Signaturen

#### `POST /mobile/signatures`
Reicht eine SVG-Signatur ein. `source` wird automatisch auf `"mobile"` gesetzt,
`created_by_user_id` ist der eingeloggte User.

```json
{
  "patient_id": 123,
  "document_type": "leistungsnachweis",
  "signer_name": "Anna Müller",
  "info_text_version": "v1.2",
  "svg_content": "<svg ...>...</svg>",
  "width": 400,
  "height": 200,
  "note": null,
  "signed_at": "2026-04-13T10:30:00"
}
```

| Feld | Beschreibung |
|---|---|
| `document_type` | `leistungsnachweis` · `vp_antrag` · `pflegeumwandlung` |
| `signed_at` | Optional. Wenn nicht gesetzt: Server-Zeit. Nützlich für Offline-Capture. |
| `svg_content` | Muss mit `<svg` beginnen, sonst 400. |

**Response 201**: vollständiges `SignatureEvent` inklusive `asset`.

#### `GET /mobile/signatures`
Letzte 100 Signaturen des aktuellen Users, neueste zuerst.

#### `GET /mobile/signatures/{id}`
Einzelne Signatur (nur eigene).

---

## Admin API `/admin`

Alle Admin-Endpunkte erfordern `role = "admin"`.

### User-Management

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/admin/users` | Alle User auflisten |
| `POST` | `/admin/users` | User anlegen |
| `PATCH` | `/admin/users/{id}` | User aktualisieren |
| `POST` | `/admin/users/{id}/activate` | User reaktivieren |
| `POST` | `/admin/users/{id}/deactivate` | User deaktivieren (revoked alle Sessions) |
| `DELETE` | `/admin/users/{id}` | User löschen |
| `GET` | `/admin/users/{id}/sessions` | Alle Sessions eines Users |
| `POST` | `/admin/users/{id}/sessions/{sid}/revoke` | Einzelne Session widerrufen |

### Signaturen

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/admin/signatures` | Letzte 200 Signaturen |
| `GET` | `/admin/signatures/{id}` | Einzelne Signatur |
| `POST` | `/admin/test-signatures` | Test-Signatur anlegen (für QA) |
| `GET` | `/admin/activity-feed` | Activity-Feed der letzten 100 Events |

---

## Fehler

| Status | Wann |
|---|---|
| `400` | Validierung scheitert auf fachlicher Ebene (z.B. SVG ohne `<svg`-Tag) |
| `401` | Kein oder ungültiger Token, abgelaufener Refresh |
| `403` | User inaktiv oder fehlende Rolle (Admin-Endpunkt mit Caretaker) |
| `404` | Resource nicht gefunden, oder gehört nicht dem aufrufenden User |
| `409` | Konflikt — z.B. Eintrag im bereits gelockten Monat |
| `422` | Pydantic-Validierungsfehler (FastAPI default) |
