import 'package:flutter/material.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    const green = Color(0xFF4F8A5B);

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
                    child: const Icon(
                      Icons.person,
                      size: 64,
                      color: green,
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Maria Musterfrau',
                    style: TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Betreuungskraft',
                    style: TextStyle(
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
                  value: 'maria.musterfrau@frohzeit.de',
                ),
                const Divider(height: 1, indent: 56),
                _infoTile(
                  icon: Icons.phone_outlined,
                  label: 'Telefon',
                  value: '+49 170 1234567',
                ),
                const Divider(height: 1, indent: 56),
                _infoTile(
                  icon: Icons.location_on_outlined,
                  label: 'Einsatzgebiet',
                  value: 'Berlin und Umgebung',
                ),
              ],
            ),

            const SizedBox(height: 24),

            _sectionTitle('Anstellung'),
            _card(
              children: [
                _infoTile(
                  icon: Icons.badge_outlined,
                  label: 'Personalnummer',
                  value: 'FZ-1042',
                ),
                const Divider(height: 1, indent: 56),
                _infoTile(
                  icon: Icons.calendar_today_outlined,
                  label: 'Eintrittsdatum',
                  value: '01.09.2023',
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
