import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'dart:io' show Platform;

import 'app/app.dart';
import 'core/api/api_client.dart';

/// Sentry-DSN wird via `--dart-define=SENTRY_DSN=https://...` beim Build
/// gesetzt. Ohne DSN laeuft die App ganz normal, Sentry ist ein no-op.
const String _sentryDsn = String.fromEnvironment('SENTRY_DSN');
const String _sentryEnv =
    String.fromEnvironment('SENTRY_ENV', defaultValue: 'staging');

/// Globaler ApiClient fuer Crash-Reporting. Wird lazy initialisiert.
ApiClient? _crashReportClient;

/// Sendet einen automatischen Crash-Report als IT-Ticket ans Backend.
/// Falls der Client noch nicht bereit ist (z.B. Crash beim Start),
/// wird nur geloggt und der Fehler nicht weitergeleitet.
Future<void> _reportCrashToBackend(Object error, StackTrace? stack) async {
  try {
    _crashReportClient ??= ApiClient();
    await _crashReportClient!.ready();

    // Pruefen ob User eingeloggt ist (Cookie vorhanden)
    final hasAuth = await _crashReportClient!.hasAuthCookie();
    if (!hasAuth) return;

    final errorType = error.runtimeType.toString();
    final title = 'App-Crash: $errorType';
    var description = stack?.toString() ?? error.toString();
    if (description.length > 2000) {
      description = description.substring(0, 2000);
    }

    String deviceInfo;
    try {
      final info = await PackageInfo.fromPlatform();
      final os =
          '${Platform.operatingSystem} ${Platform.operatingSystemVersion}';
      deviceInfo = 'App ${info.version}+${info.buildNumber} | $os';
    } catch (_) {
      deviceInfo = '${Platform.operatingSystem} (details unavailable)';
    }

    await _crashReportClient!.dio.post('/mobile/it-tickets', data: {
      'title': title,
      'description': description,
      'category': 'crash',
      'device_info': deviceInfo,
      'priority': 'high',
    });
  } catch (e) {
    debugPrint('[CrashReport] Konnte Crash nicht melden: $e');
  }
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('de_DE', null);

  // Globaler Flutter-Fehlerhandler (Widget-Errors)
  FlutterError.onError = (FlutterErrorDetails details) {
    FlutterError.presentError(details);
    _reportCrashToBackend(details.exception, details.stack);
  };

  // Platform-Fehler (non-Flutter / Isolate Errors)
  PlatformDispatcher.instance.onError = (error, stack) {
    _reportCrashToBackend(error, stack);
    return true; // Error als behandelt markieren
  };

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
