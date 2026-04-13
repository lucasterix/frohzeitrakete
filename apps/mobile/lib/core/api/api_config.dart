class ApiConfig {
  /// Base URL des FrohZeit Backends.
  ///
  /// Default: Staging auf Hetzner (automatisches Deployment via GitHub Actions).
  /// Für lokale Entwicklung gegen ein eigenes Docker-Backend überschreiben:
  /// `flutter run --dart-define=API_BASE_URL=http://localhost:8000`
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://api.froehlichdienste.de',
  );

  static const Duration connectTimeout = Duration(seconds: 10);
  static const Duration receiveTimeout = Duration(seconds: 15);
}
