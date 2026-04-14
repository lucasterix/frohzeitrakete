import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_exception.dart';
import '../../core/providers.dart';

/// Zwei-Schritt-Flow:
///   1. E-Mail eingeben → Backend generiert Token und mailt ihn (oder loggt ihn)
///   2. Token + neues Passwort eingeben → Backend setzt Passwort
class PasswordResetScreen extends ConsumerStatefulWidget {
  const PasswordResetScreen({super.key});

  @override
  ConsumerState<PasswordResetScreen> createState() =>
      _PasswordResetScreenState();
}

class _PasswordResetScreenState extends ConsumerState<PasswordResetScreen> {
  final _emailCtrl = TextEditingController();
  final _tokenCtrl = TextEditingController();
  final _newPasswordCtrl = TextEditingController();

  int _step = 0; // 0 = request, 1 = confirm
  bool _busy = false;
  String? _error;
  String? _info;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _tokenCtrl.dispose();
    _newPasswordCtrl.dispose();
    super.dispose();
  }

  Future<void> _requestReset() async {
    final email = _emailCtrl.text.trim();
    if (email.isEmpty) {
      setState(() => _error = 'E-Mail bitte angeben');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _info = null;
    });
    try {
      await ref.read(authRepositoryProvider).requestPasswordReset(email: email);
      if (!mounted) return;
      setState(() {
        _step = 1;
        _info =
            'Wir haben einen Reset-Link an $email gesendet (falls die Adresse bei uns registriert ist). Der Code aus der Mail gehört unten ins Feld.';
      });
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = 'Unbekannter Fehler: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirmReset() async {
    final token = _tokenCtrl.text.trim();
    final pw = _newPasswordCtrl.text;
    if (token.isEmpty) {
      setState(() => _error = 'Code aus der Mail eingeben');
      return;
    }
    if (pw.length < 8) {
      setState(() => _error = 'Passwort muss mindestens 8 Zeichen haben');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _info = null;
    });
    try {
      await ref
          .read(authRepositoryProvider)
          .confirmPasswordReset(token: token, newPassword: pw);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Passwort geändert. Bitte jetzt einloggen.'),
          backgroundColor: Color(0xFF4F8A5B),
        ),
      );
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = 'Unbekannter Fehler: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    const green = Color(0xFF4F8A5B);

    return Scaffold(
      appBar: AppBar(title: const Text('Passwort vergessen')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_step == 0) ...[
                const Text(
                  'Gib deine E-Mail-Adresse ein. Wir schicken dir einen Link bzw. Code, mit dem du dein Passwort neu setzen kannst.',
                  style: TextStyle(height: 1.4),
                ),
                const SizedBox(height: 20),
                TextField(
                  controller: _emailCtrl,
                  keyboardType: TextInputType.emailAddress,
                  autocorrect: false,
                  decoration: const InputDecoration(
                    labelText: 'E-Mail',
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 20),
                FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: green,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  onPressed: _busy ? null : _requestReset,
                  child: Text(_busy ? 'Sende …' : 'Reset-Link anfordern'),
                ),
                TextButton(
                  onPressed: _busy
                      ? null
                      : () => setState(() {
                            _step = 1;
                            _error = null;
                            _info = null;
                          }),
                  child: const Text('Ich habe bereits einen Code'),
                ),
              ] else ...[
                Text(
                  _info ??
                      'Code aus der Reset-Mail und dein neues Passwort eingeben.',
                  style: const TextStyle(height: 1.4),
                ),
                const SizedBox(height: 20),
                TextField(
                  controller: _tokenCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Code aus der Mail',
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _newPasswordCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'Neues Passwort (mind. 8 Zeichen)',
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 20),
                FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: green,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  onPressed: _busy ? null : _confirmReset,
                  child: Text(_busy ? 'Speichere …' : 'Passwort setzen'),
                ),
                TextButton(
                  onPressed: _busy
                      ? null
                      : () => setState(() {
                            _step = 0;
                            _error = null;
                            _info = null;
                          }),
                  child: const Text('Zurück zur E-Mail-Eingabe'),
                ),
              ],
              if (_error != null) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.red.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: Colors.red.withValues(alpha: 0.3),
                    ),
                  ),
                  child: Text(
                    _error!,
                    style: const TextStyle(color: Colors.red),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
