# App-Icon generieren

## 1. SVG in PNG konvertieren (1024x1024)

Die Quelldatei liegt unter `assets/icon/icon.svg`.
Du brauchst ein 1024x1024 PNG daraus. Hier drei Wege:

### Option A: Inkscape (CLI, kostenlos)

```bash
# macOS: brew install inkscape
inkscape assets/icon/icon.svg \
  --export-type=png \
  --export-filename=assets/icon/icon.png \
  --export-width=1024 \
  --export-height=1024
```

### Option B: Figma / Online-Tool

1. Oeffne https://svgtopng.com oder https://cloudconvert.com/svg-to-png
2. Lade `assets/icon/icon.svg` hoch
3. Stelle 1024x1024 ein
4. Speichere das Ergebnis als `assets/icon/icon.png`

### Option C: macOS Preview + sips

```bash
# Konvertiere mit qlmanage (Quick Look) + sips
qlmanage -t -s 1024 -o /tmp assets/icon/icon.svg
sips -s format png /tmp/icon.svg.png --out assets/icon/icon.png
```

## 2. Foreground-Icon fuer Android Adaptive Icons

Fuer Android Adaptive Icons braucht man ein separates Foreground-Bild
(nur die Rakete, ohne Hintergrund). Am einfachsten:

1. Kopiere `icon.svg`, entferne das `<rect>` (Hintergrund)
2. Exportiere als `assets/icon/icon_foreground.png` (1024x1024)

Der Hintergrund wird ueber `adaptive_icon_background: "#4F8A5B"` in
`pubspec.yaml` gesetzt.

## 3. Icons generieren

Sobald `icon.png` und `icon_foreground.png` vorliegen:

```bash
cd apps/mobile
flutter pub get
dart run flutter_launcher_icons
```

Das erzeugt automatisch alle iOS- und Android-Icon-Groessen.
