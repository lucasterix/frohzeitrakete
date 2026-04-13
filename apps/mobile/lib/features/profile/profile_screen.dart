import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    const green = Color(0xFF4F8A5B);
    final user = ref.watch(currentUserProvider);

    final displayName = user?.fullName ?? 'Nicht eingeloggt';
    final roleLabel = switch (user?.role) {
      'admin' => 'Administrator',
      'caretaker' => 'Betreuungskraft',
      _ => user?.role ?? '',
    };
    final email = user?.email ?? '—';
    final initials = _initials(displayName);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Profil'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 40),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Avatar + Name
            Center(
              child: Column(
                children: [
                  CircleAvatar(
                    radius: 56,
                    backgroundColor: green.withValues(alpha: 0.15),
                    child: Text(
                      initials,
                      style: const TextStyle(
                        fontSize: 36,
                        color: green,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    displayName,
                    style: const TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.bold,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    roleLabel,
                    style: const TextStyle(
                      fontSize: 16,
                      color: Colors.black54,
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 32),

            _sectionTitle('Kontaktdaten'),
            _card(
              children: [
                _infoTile(
                  icon: Icons.mail_outline,
                  label: 'E-Mail',
                  value: email,
                ),
                const Divider(height: 1, indent: 56),
                _infoTile(
                  icon: Icons.badge_outlined,
                  label: 'User-ID',
                  value: user != null ? '#${user.id}' : '—',
                ),
                if (user?.pattiPersonId != null) ...[
                  const Divider(height: 1, indent: 56),
                  _infoTile(
                    icon: Icons.link,
                    label: 'Patti-Verknüpfung',
                    value: 'Person #${user!.pattiPersonId}',
                  ),
                ],
              ],
            ),

            const SizedBox(height: 24),

            _sectionTitle('Status'),
            _card(
              children: [
                _infoTile(
                  icon: user?.isActive == true
                      ? Icons.check_circle_outline
                      : Icons.block,
                  label: 'Konto',
                  value: user?.isActive == true ? 'Aktiv' : 'Deaktiviert',
                ),
              ],
            ),

            const SizedBox(height: 32),

            SizedBox(
              width: double.infinity,
              height: 50,
              child: OutlinedButton.icon(
                onPressed: () {},
                icon: const Icon(Icons.edit_outlined),
                label: const Text(
                  'Profil bearbeiten',
                  style: TextStyle(fontSize: 16),
                ),
                style: OutlinedButton.styleFrom(
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts.first[0] + parts.last[0]).toUpperCase();
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

  Widget _infoTile({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return ListTile(
      leading: Icon(icon),
      title: Text(
        label,
        style: const TextStyle(fontSize: 13, color: Colors.black54),
      ),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 2),
        child: Text(
          value,
          style: const TextStyle(fontSize: 16, color: Colors.black87),
        ),
      ),
    );
  }
}
