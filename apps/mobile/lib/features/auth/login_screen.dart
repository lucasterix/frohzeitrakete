import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/api/api_exception.dart';
import '../../core/providers.dart';
import '../../navigation/main_navigation.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  final _passwordFocusNode = FocusNode();
  bool _obscurePassword = true;
  bool _isLoading = false;
  String? _usernameError;
  String? _passwordError;
  String? _generalError;

  @override
  void dispose() {
    _usernameController.dispose();
    _passwordController.dispose();
    _passwordFocusNode.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    final username = _usernameController.text.trim();
    final password = _passwordController.text;

    setState(() {
      _usernameError = username.isEmpty
          ? 'E-Mail erforderlich'
          : (!username.contains('@') ? 'Ungültige E-Mail' : null);
      _passwordError = password.isEmpty
          ? 'Passwort erforderlich'
          : (password.length < 4 ? 'Mindestens 4 Zeichen' : null);
      _generalError = null;
    });

    if (_usernameError != null || _passwordError != null) return;

    setState(() => _isLoading = true);

    try {
      await ref.read(authControllerProvider.notifier).login(username, password);

      if (!mounted) return;

      // Biometrie anbieten beim ersten Login auf diesem Gerät
      await _maybeOfferBiometric();

      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const MainNavigation()),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _generalError = e.message;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _generalError = 'Unerwarteter Fehler: $e';
      });
    }
  }

  Future<void> _maybeOfferBiometric() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (prefs.getBool('biometric_auth_enabled') == true) return;
      if (prefs.getBool('biometric_offer_dismissed') == true) return;

      final auth = LocalAuthentication();
      final available = await auth.canCheckBiometrics;
      if (!available) return;

      if (!mounted) return;
      final accept = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('Schneller anmelden?'),
          content: const Text(
            'Du kannst beim nächsten App-Start FaceID / TouchID statt '
            'Passwort nutzen. Das geht viel schneller.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Nein, danke'),
            ),
            TextButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Aktivieren'),
            ),
          ],
        ),
      );

      if (accept == true) {
        final ok = await auth.authenticate(
          localizedReason: 'Biometrie aktivieren',
          options: const AuthenticationOptions(stickyAuth: true),
        );
        if (ok) {
          await prefs.setBool('biometric_auth_enabled', true);
        }
      } else {
        await prefs.setBool('biometric_offer_dismissed', true);
      }
    } catch (_) {
      // Biometrie ist optional – Fehler verschlucken
    }
  }

  void _showContactInfo() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Hilfe beim Anmelden'),
        content: const Text(
          'Bei Problemen wende dich an das FrohZeit-Büro.\n\nDein Zugang wird vom Büro verwaltet.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    const green = Color(0xFF4F8A5B);

    return Scaffold(
      backgroundColor: const Color(0xFFF6F3F7),
      // Kein GestureDetector-Wrap mehr: auf macOS/Web schluckt der manchmal
      // die Text-Events. Auf Desktop gibt es kein Software-Keyboard, das wir
      // per "Tap außerhalb" schließen müssten.
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 48),
                Center(
                  child: Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      color: green,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Icon(
                      Icons.favorite_outline,
                      color: Colors.white,
                      size: 36,
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                const Center(
                  child: Text(
                    'FrohZeit',
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                const Center(
                  child: Text(
                    'Bitte melde dich an',
                    style: TextStyle(
                      fontSize: 16,
                      color: Colors.black54,
                    ),
                  ),
                ),
                const SizedBox(height: 48),
                const Text(
                  'E-Mail',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _usernameController,
                  autofocus: true,
                  textInputAction: TextInputAction.next,
                  autocorrect: false,
                  enableSuggestions: false,
                  keyboardType: TextInputType.emailAddress,
                  onSubmitted: (_) => _passwordFocusNode.requestFocus(),
                  onChanged: (_) {
                    if (_usernameError != null) {
                      setState(() => _usernameError = null);
                    }
                  },
                  decoration: InputDecoration(
                    hintText: 'name@frohzeit.de',
                    filled: true,
                    fillColor: Colors.white,
                    errorText: _usernameError,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: BorderSide.none,
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                const Text(
                  'Passwort',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _passwordController,
                  focusNode: _passwordFocusNode,
                  obscureText: _obscurePassword,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _login(),
                  onChanged: (_) {
                    if (_passwordError != null) {
                      setState(() => _passwordError = null);
                    }
                  },
                  decoration: InputDecoration(
                    hintText: '••••••••',
                    filled: true,
                    fillColor: Colors.white,
                    errorText: _passwordError,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: BorderSide.none,
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: BorderSide.none,
                    ),
                    suffixIcon: IconButton(
                      icon: Icon(
                        _obscurePassword
                            ? Icons.visibility_outlined
                            : Icons.visibility_off_outlined,
                      ),
                      onPressed: () {
                        setState(() => _obscurePassword = !_obscurePassword);
                      },
                    ),
                  ),
                ),
                if (_generalError != null) ...[
                  const SizedBox(height: 16),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 12,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.red.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: Colors.red.withValues(alpha: 0.4),
                      ),
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.error_outline,
                          color: Colors.red,
                          size: 20,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            _generalError!,
                            style: const TextStyle(
                              color: Colors.red,
                              fontSize: 14,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 32),
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: ElevatedButton(
                    onPressed: _isLoading ? null : _login,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: green,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    child: _isLoading
                        ? const CircularProgressIndicator(color: Colors.white)
                        : const Text(
                            'Anmelden',
                            style: TextStyle(fontSize: 16),
                          ),
                  ),
                ),
                const SizedBox(height: 24),
                const Center(
                  child: Text(
                    'Probleme beim Anmelden?',
                    style: TextStyle(color: Colors.black54),
                  ),
                ),
                const SizedBox(height: 4),
                Center(
                  child: GestureDetector(
                    onTap: _showContactInfo,
                    child: const Text(
                      'Büro kontaktieren',
                      style: TextStyle(
                        color: green,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
    );
  }
}
