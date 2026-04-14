# Mobile Release Guide

Dieser Guide beschreibt die einmaligen Setup-Schritte für Store-Builds und
was nötig ist, um die FrohZeit Rakete App an echte Nutzer auszurollen.

## Bundle-IDs

| Platform | Identifier |
|----------|----------------------------------------|
| iOS      | `de.froehlichdienste.frohzeitrakete`   |
| Android  | `de.froehlichdienste.frohzeitrakete`   |

App-Name: **FrohZeit Rakete**.

## Lokaler Build

```bash
cd apps/mobile
flutter pub get
flutter build apk --release      # Android APK
flutter build appbundle --release # Google Play
flutter build ios --release      # iOS (braucht Xcode + Signing)
```

## Android — Keystore

Einmalig pro Projekt:

```bash
keytool -genkey -v \
  -keystore upload-keystore.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias upload
```

Die resultierende `upload-keystore.jks` **nicht committen**. Stattdessen:

- Lokal: nach `apps/mobile/android/upload-keystore.jks` legen und
  `apps/mobile/android/key.properties` erzeugen:
  ```properties
  storeFile=upload-keystore.jks
  storePassword=<store-pw>
  keyAlias=upload
  keyPassword=<key-pw>
  ```
- CI: base64-kodiert als GitHub Secret ablegen (siehe unten).

Die `build.gradle.kts` picked die `key.properties` automatisch und signiert
damit die Release-Builds. Ohne Datei wird der Debug-Key verwendet — nur
für `flutter run --release` sinnvoll, **nicht** für den Store.

## iOS — Signing

Im Xcode über `Runner.xcworkspace` öffnen, im Runner-Target unter
"Signing & Capabilities":

1. Team auf den Apple-Developer-Account setzen
2. Automatic signing aktivieren
3. Bundle-ID prüfen (`de.froehlichdienste.frohzeitrakete`)

Build & Upload an TestFlight über Xcode (Archive → Distribute App) oder
via `fastlane` (siehe optionaler Abschnitt unten).

## Verteilung

### Option A: Firebase App Distribution (einfachster Start)

Für Beta-Tester. Kein Apple-Developer-Account nötig für Android.

1. Firebase-Projekt anlegen, App hinzufügen (iOS + Android)
2. `google-services.json` → `apps/mobile/android/app/`
3. `GoogleService-Info.plist` → `apps/mobile/ios/Runner/`
4. APK/IPA manuell hochladen oder via Fastlane/CI

### Option B: TestFlight (iOS)

Voraussetzung: aktiver Apple-Developer-Account (99 USD/Jahr).

1. App Store Connect → App anlegen
2. Xcode Archive → Upload to App Store
3. Unter TestFlight Tester einladen

### Option C: Google Play Internal Testing

1. Google Play Console → App anlegen, Paket = `de.froehlichdienste.frohzeitrakete`
2. Interner Test-Track erstellen
3. AAB aus CI-Artifact oder lokalem Build hochladen
4. Tester-Liste pflegen

## GitHub Secrets (für mobile-build.yml)

Ohne diese Secrets baut der Workflow die Release-Artifacts unsigned
(APK funktioniert auf Dev-Geräten, iOS als `Runner.app` ohne Codesign):

| Secret                      | Zweck                                        |
|-----------------------------|----------------------------------------------|
| `ANDROID_KEYSTORE_BASE64`   | base64 der `upload-keystore.jks`             |
| `ANDROID_KEY_ALIAS`         | `upload` (oder dein Alias)                   |
| `ANDROID_KEY_PASSWORD`      | Key-Passwort                                 |
| `ANDROID_STORE_PASSWORD`    | Keystore-Passwort                            |

So generiert man das Base64:
```bash
base64 -i upload-keystore.jks | pbcopy
```

Für **iOS CI-Signing** (optional, wenn du direkt von GitHub Actions an
TestFlight pushen willst) gehört zusätzlich ein Fastlane-Match-Setup mit
API-Key-Secrets rein. Das ist Extra-Arbeit und lohnt sich erst ab dem
zweiten Release — bis dahin Xcode-Upload vom Mac.

## Version erhöhen

`apps/mobile/pubspec.yaml`:

```yaml
version: 1.0.0+1   # <version_name>+<build_number>
```

- Bei jedem Store-Upload muss **build_number** (hinter dem `+`) steigen.
- Bei sichtbaren Änderungen zusätzlich `version_name`.

Danach taggen und pushen:
```bash
git tag mobile-v1.0.1
git push origin mobile-v1.0.1
```

Der `mobile-build`-Workflow läuft dann automatisch.
