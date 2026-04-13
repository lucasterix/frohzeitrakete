class ApiConfig {
  /// Base URL des FrohZeit Backends.
  /// Im Dev: lokales Docker Backend auf Port 8000.
  /// Für echtes Remote-Backend sp\u00e4ter per --dart-define \u00fcberschreiben:
  /// `flutter run --dart-define=API_BASE_URL=https://api.frohzeit.de`
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:8000',
  );

  static const Duration connectTimeout = Duration(seconds: 10);
  static const Duration receiveTimeout = Duration(seconds: 15);
}
