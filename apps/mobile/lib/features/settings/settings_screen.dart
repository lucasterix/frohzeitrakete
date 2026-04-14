import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/api/api_exception.dart';
import '../../core/providers.dart';
import '../auth/login_screen.dart';
import '../profile/profile_screen.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  bool _biometricEnabled = false;
  bool _biometricAvailable = false;

  @override
  void initState() {
    super.initState();
    _loadBiometricState();
  }

  Future<void> _loadBiometricState() async {
    final prefs = await SharedPreferences.getInstance();
    bool available = false;
    try {
      final auth = LocalAuthentication();
      available = await auth.canCheckBiometrics;
    } catch (_) {
      available = false;
    }
    if (!mounted) return;
    setState(() {
      _biometricEnabled = prefs.getBool('biometric_auth_enabled') ?? false;
      _biometricAvailable = available;
    });
  }

  Future<void> _toggleBiometric(bool enable) async {
    final prefs = await SharedPreferences.getInstance();
    if (enable) {
      try {
        final auth = LocalAuthentication();
        final ok = await auth.authenticate(
          localizedReason: 'Biometrische Anmeldung aktivieren',
          options: const AuthenticationOptions(
            biometricOnly: false,
            stickyAuth: true,
          ),
        );
        if (!ok) return;
      } catch (e) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Biometrie nicht verfügbar: $e')),
        );
        return;
      }
    }
    await prefs.setBool('biometric_auth_enabled', enable);
    if (!mounted) return;
    setState(() => _biometricEnabled = enable);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          enable
              ? 'Biometrische Anmeldung aktiviert'
              : 'Biometrische Anmeldung deaktiviert',
        ),
      ),
    );
  }

  Future<void> _openChangePassword() async {
    final current = TextEditingController();
    final newPw = TextEditingController();
    final confirmPw = TextEditingController();
    String? error;
    bool saving = false;

    await showDialog<void>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setSt) => AlertDialog(
            title: const Text('Passwort ändern'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: current,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'Aktuelles Passwort',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: newPw,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'Neues Passwort',
                    helperText: 'Mindestens 8 Zeichen',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: confirmPw,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'Neues Passwort wiederholen',
                  ),
                ),
                if (error != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    error!,
                    style: const TextStyle(color: Colors.red, fontSize: 13),
                  ),
                ],
              ],
            ),
            actions: [
              TextButton(
                onPressed: saving ? null : () => Navigator.of(ctx).pop(),
                child: const Text('Abbrechen'),
              ),
              TextButton(
                onPressed: saving
                    ? null
                    : () async {
                        if (newPw.text != confirmPw.text) {
                          setSt(() => error = 'Passwörter stimmen nicht überein');
                          return;
                        }
                        if (newPw.text.length < 8) {
                          setSt(() => error = 'Mindestens 8 Zeichen');
                          return;
                        }
                        setSt(() {
                          saving = true;
                          error = null;
                        });
                        try {
                          await ref
                              .read(authRepositoryProvider)
                              .changePassword(
                                currentPassword: current.text,
                                newPassword: newPw.text,
                              );
                          if (!ctx.mounted) return;
                          Navigator.of(ctx).pop();
                          if (!mounted) return;
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('Passwort geändert'),
                            ),
                          );
                        } on ApiException catch (e) {
                          setSt(() {
                            saving = false;
                            error = e.message;
                          });
                        } catch (e) {
                          setSt(() {
                            saving = false;
                            error = 'Fehler: $e';
                          });
                        }
                      },
                child: saving
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Speichern'),
              ),
            ],
          ),
        );
      },
    );

    current.dispose();
    newPw.dispose();
    confirmPw.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const green = Color(0xFF4F8A5B);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Einstellungen'),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 40),
        children: [
          _sectionTitle('Konto'),
          _card(
            children: [
              _tile(
                icon: Icons.person_outline,
                title: 'Profil anzeigen',
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => const ProfileScreen(),
                    ),
                  );
                },
              ),
              const Divider(height: 1, indent: 56),
              _tile(
                icon: Icons.lock_outline,
                title: 'Passwort ändern',
                onTap: _openChangePassword,
              ),
            ],
          ),

          const SizedBox(height: 24),
          _sectionTitle('Sicherheit'),
          _card(
            children: [
              SwitchListTile(
                value: _biometricEnabled,
                onChanged:
                    _biometricAvailable ? _toggleBiometric : null,
                activeThumbColor: green,
                secondary: const Icon(Icons.fingerprint),
                title: const Text('FaceID / TouchID'),
                subtitle: Text(
                  _biometricAvailable
                      ? 'Schneller Login beim App-Start'
                      : 'Nicht auf diesem Gerät verfügbar',
                  style: const TextStyle(fontSize: 12),
                ),
              ),
            ],
          ),

          const SizedBox(height: 24),
          _sectionTitle('Benachrichtigungen'),
          _card(
            children: [
              SwitchListTile(
                value: true,
                onChanged: (_) {},
                activeThumbColor: green,
                secondary: const Icon(Icons.notifications_outlined),
                title: const Text('Push-Benachrichtigungen'),
              ),
              const Divider(height: 1, indent: 56),
              SwitchListTile(
                value: false,
                onChanged: (_) {},
                activeThumbColor: green,
                secondary: const Icon(Icons.mail_outline),
                title: const Text('E-Mail-Erinnerungen'),
              ),
            ],
          ),

          const SizedBox(height: 24),
          _sectionTitle('App'),
          _card(
            children: [
              _tile(
                icon: Icons.info_outline,
                title: 'Version',
                trailing: const Text(
                  '1.0.0',
                  style: TextStyle(color: Colors.black54),
                ),
              ),
              const Divider(height: 1, indent: 56),
              _tile(
                icon: Icons.description_outlined,
                title: 'Datenschutz',
                onTap: () {},
              ),
              const Divider(height: 1, indent: 56),
              _tile(
                icon: Icons.gavel_outlined,
                title: 'Impressum',
                onTap: () {},
              ),
            ],
          ),

          const SizedBox(height: 32),

          // Abmelden
          SizedBox(
            width: double.infinity,
            height: 52,
            child: OutlinedButton.icon(
              onPressed: () => _confirmLogout(context),
              icon: const Icon(Icons.logout, color: Colors.red),
              label: const Text(
                'Abmelden',
                style: TextStyle(
                  fontSize: 17,
                  color: Colors.red,
                  fontWeight: FontWeight.w600,
                ),
              ),
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: Colors.red),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmLogout(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Abmelden?'),
        content: const Text('Möchtest du dich wirklich abmelden?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Abbrechen'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text(
              'Abmelden',
              style: TextStyle(color: Colors.red),
            ),
          ),
        ],
      ),
    );

    if (confirmed == true && context.mounted) {
      // Biometric-Flag auch zurücksetzen
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool('biometric_auth_enabled', false);

      await ref.read(authControllerProvider.notifier).logout();
      if (!context.mounted) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const LoginScreen()),
        (_) => false,
      );
    }
  }

  Widget _sectionTitle(String text) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 8),
      child: Text(
        text.toUpperCase(),
        style: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: Colors.black54,
          letterSpacing: 0.8,
        ),
      ),
    );
  }

  Widget _card({required List<Widget> children}) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.black12),
      ),
      child: Column(children: children),
    );
  }

  Widget _tile({
    required IconData icon,
    required String title,
    VoidCallback? onTap,
    Widget? trailing,
  }) {
    return ListTile(
      leading: Icon(icon),
      title: Text(title, style: const TextStyle(fontSize: 16)),
      trailing: trailing ??
          (onTap != null ? const Icon(Icons.chevron_right) : null),
      onTap: onTap,
    );
  }
}
