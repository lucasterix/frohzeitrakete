#!/bin/bash
# Startet den iOS Simulator und nimmt Screenshots
# Voraussetzung: flutter build ios --simulator

DEVICE="iPhone 17 Pro Max"
OUTDIR="$(dirname "$0")/screenshots"
mkdir -p "$OUTDIR"

# Simulator booten
xcrun simctl boot "$DEVICE" 2>/dev/null || true
sleep 5

# App installieren und starten
cd "$(dirname "$0")/.."
flutter run -d "$DEVICE" --dart-define=API_BASE_URL=https://api.froehlichdienste.de &
FLUTTER_PID=$!
sleep 30

# Screenshots nehmen
xcrun simctl io "$DEVICE" screenshot "$OUTDIR/01_dashboard.png"
echo "Screenshot 1: Dashboard"

# Hinweis: Für die weiteren Screenshots muss man manuell navigieren
# oder ein Integration-Test-Skript nutzen
echo ""
echo "=== Manuelle Screenshots ==="
echo "Die App läuft jetzt im Simulator."
echo "Navigiere manuell zu den folgenden Screens und drücke Cmd+S im Simulator:"
echo "  2. Patientenliste"
echo "  3. Einsatz erfassen"
echo "  4. Unterschrift"
echo "  5. Monatsstatistik (aufklappen)"
echo "  6. Urlaubsübersicht"
echo ""
echo "Screenshots landen in: $OUTDIR"
echo "Wenn fertig: kill $FLUTTER_PID"
