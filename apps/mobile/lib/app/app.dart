import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:local_auth/local_auth.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/offline/connectivity_provider.dart';
import '../core/providers.dart';
import '../features/auth/login_screen.dart';
import '../navigation/main_navigation.dart';
import 'update_dialog.dart';

class CareApp extends StatelessWidget {
  const CareApp({super.key});

  @override
  Widget build(BuildContext context) {
    const primaryGreen = Color(0xFF4F8A5B);
    const lightBackground = Color(0xFFF6F3F7);

    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'FrohZeit',
      locale: const Locale('de', 'DE'),
      supportedLocales: const [Locale('de', 'DE'), Locale('en', 'US')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: lightBackground,
        colorScheme: ColorScheme.fromSeed(
          seedColor: primaryGreen,
          brightness: Brightness.light,
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: lightBackground,
          foregroundColor: Colors.black87,
          elevation: 0,
          centerTitle: false,
        ),
        cardTheme: CardThemeData(
          color: Colors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
        ),
      ),
      home: const _Bootstrap(),
    );
  }
}

/// Bootstrap-Gate: versucht beim App-Start automatisch einzuloggen.
///
/// Ablauf:
/// 1. ApiClient wartet bis PersistCookieJar fertig geladen ist
/// 2. Falls "biometric_auth_enabled" in SharedPreferences → FaceID/TouchID prompt
/// 3. /auth/me call (Cookies sind noch gültig?)
/// 4. → MainNavigation wenn erfolgreich, sonst LoginScreen
class _Bootstrap extends ConsumerStatefulWidget {
  const _Bootstrap();

  @override
  ConsumerState<_Bootstrap> createState() => _BootstrapState();
}

class _BootstrapState extends ConsumerState<_Bootstrap> {
  bool _done = false;
  bool _authed = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _restore());
  }

  Future<void> _restore() async {
    // Cookie-Jar muss geladen sein bevor wir einen Request machen
    final client = ref.read(apiClientProvider);
    await client.ready();

    final hasCookie = await client.hasAuthCookie();
    if (!hasCookie) {
      if (mounted) setState(() => _done = true);
      return;
    }

    // Biometrie prüfen wenn aktiviert
    final prefs = await SharedPreferences.getInstance();
    final biometricEnabled = prefs.getBool('biometric_auth_enabled') ?? false;
    if (biometricEnabled) {
      try {
        final localAuth = LocalAuthentication();
        final canCheck = await localAuth.canCheckBiometrics;
        if (canCheck) {
          final ok = await localAuth.authenticate(
            localizedReason: 'Mit FaceID/TouchID anmelden',
            options: const AuthenticationOptions(
              biometricOnly: false,
              stickyAuth: true,
            ),
          );
          if (!ok) {
            if (mounted) setState(() => _done = true);
            return;
          }
        }
      } catch (_) {}
    }

    // /auth/me mit 5s Timeout — nicht ewig warten, aber auch nicht
    // optimistisch ohne User-Daten in die App springen.
    await ref.read(authControllerProvider.notifier).restoreSession()
        .timeout(const Duration(seconds: 5), onTimeout: () {});
    final user = ref.read(authControllerProvider).valueOrNull;

    if (mounted) {
      final isAuthed = user != null;
      setState(() {
        _authed = isAuthed;
        _done = true;
      });

      if (isAuthed) {
        _checkForUpdate(client);
      }
    }
  }

  /// Prüft die App-Version gegen das Backend und zeigt ggf. den Update-Dialog.
  Future<void> _checkForUpdate(dynamic client) async {
    try {
      final response = await client.dio.get('/mobile/app-version');
      if (response.statusCode != 200 || response.data == null) return;

      final data = response.data as Map<String, dynamic>;
      final minVersion = data['min_version'] as String? ?? '0.0.0';
      final forceUpdate = data['force_update'] as bool? ?? false;
      final message = data['update_message'] as String? ??
          'Eine neue Version ist verfügbar.';
      final iosUrl = data['ios_url'] as String? ?? '';
      final androidUrl = data['android_url'] as String? ?? '';

      final info = await PackageInfo.fromPlatform();
      final currentVersion = info.version; // e.g. "1.0.0"

      if (_isVersionLessThan(currentVersion, minVersion) && mounted) {
        UpdateDialog.show(
          context,
          message: message,
          iosUrl: iosUrl,
          androidUrl: androidUrl,
          forceUpdate: forceUpdate,
        );
      }
    } catch (_) {
      // Version-Check darf die App nicht blockieren
    }
  }

  /// Vergleicht zwei Semver-Strings. Gibt true zurück wenn [a] < [b].
  bool _isVersionLessThan(String a, String b) {
    final partsA = a.split('.').map((e) => int.tryParse(e) ?? 0).toList();
    final partsB = b.split('.').map((e) => int.tryParse(e) ?? 0).toList();
    for (var i = 0; i < 3; i++) {
      final va = i < partsA.length ? partsA[i] : 0;
      final vb = i < partsB.length ? partsB[i] : 0;
      if (va < vb) return true;
      if (va > vb) return false;
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    // Kickoff: sobald wir online sind und ein auth'd User da ist, werden
    // offline gequeuete Einsätze automatisch gesynct.
    if (_authed) {
      ref.watch(offlineSyncKickoffProvider);
    }
    if (!_done) {
      return const Scaffold(
        body: Center(
          child: CircularProgressIndicator(),
        ),
      );
    }
    return _authed ? const MainNavigation() : const LoginScreen();
  }
}
