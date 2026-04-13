import 'package:flutter/material.dart';
import '../auth/login_screen.dart';
import '../profile/profile_screen.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

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
                onTap: () {},
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
