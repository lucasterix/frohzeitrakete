import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'app/app.dart';

/// Sentry-DSN wird via `--dart-define=SENTRY_DSN=https://...` beim Build
/// gesetzt. Ohne DSN läuft die App ganz normal, Sentry ist ein no-op.
const String _sentryDsn = String.fromEnvironment('SENTRY_DSN');
const String _sentryEnv =
    String.fromEnvironment('SENTRY_ENV', defaultValue: 'staging');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('de_DE', null);

  if (_sentryDsn.isEmpty) {
    runApp(const ProviderScope(child: CareApp()));
    return;
  }

  await SentryFlutter.init(
    (options) {
      options.dsn = _sentryDsn;
      options.environment = _sentryEnv;
      options.tracesSampleRate = 0.0; // kein Performance-Tracing by default
      options.sendDefaultPii = false;
    },
    appRunner: () => runApp(
      const ProviderScope(child: CareApp()),
    ),
  );
}
