import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../shared/widgets/info_card.dart';
import '../../shared/widgets/notification_bell.dart';
import '../entries/entry_screen.dart';
import '../settings/settings_screen.dart';
import '../profile/profile_screen.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  Widget _heroStat({required String value, required String label}) {
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 22,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.85),
              fontSize: 13,
            ),
          ),
        ],
      ),
    );
  }

  void _showContact(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Ansprechpartner Büro'),
        content: const Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Einsatzleitung',
              style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
            ),
            SizedBox(height: 4),
            Text('Frau Schmidt'),
            SizedBox(height: 12),
            Row(
              children: [
                Icon(Icons.phone_outlined, size: 18),
                SizedBox(width: 8),
                Text('+49 30 9876543'),
              ],
            ),
            SizedBox(height: 8),
            Row(
              children: [
                Icon(Icons.mail_outline, size: 18),
                SizedBox(width: 8),
                Text('buero@frohzeit.de'),
              ],
            ),
            SizedBox(height: 12),
            Text(
              'Erreichbar Mo–Fr, 08:00–17:00 Uhr',
              style: TextStyle(fontSize: 13, color: Colors.black54),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Schließen'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    const green = Color(0xFF4F8A5B);
    final now = DateTime.now();
    final dateStr =
        '${now.day.toString().padLeft(2, '0')}.${now.month.toString().padLeft(2, '0')}.${now.year}';

    // Eins\u00e4tze des aktuellen Monats laden und clientseitig filtern
    final entriesAsync = ref.watch(
      myEntriesProvider(
        MyEntriesParams(year: now.year, month: now.month),
      ),
    );

    int monthEntriesCount = 0;
    int todayEntriesCount = 0;
    double todayHours = 0;

    final today = DateTime(now.year, now.month, now.day);
    entriesAsync.whenData((entries) {
      monthEntriesCount = entries.length;
      for (final e in entries) {
        final d = DateTime(e.entryDate.year, e.entryDate.month, e.entryDate.day);
        if (d == today) {
          todayEntriesCount += 1;
          todayHours += e.hours;
        }
      }
    });

    String formatHours(double h) {
      final full = h.truncate();
      final half = (h - full) >= 0.5;
      return '$full,${half ? '5' : '0'} h';
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              GestureDetector(
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => const ProfileScreen(),
                    ),
                  );
                },
                child: const CircleAvatar(
                  radius: 18,
                  backgroundColor: Colors.white,
                  child: Icon(Icons.person_outline, color: Colors.black87),
                ),
              ),
              const Spacer(),
              const NotificationBell(),
              IconButton(
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => const SettingsScreen(),
                    ),
                  );
                },
                icon: const Icon(Icons.settings_outlined),
              ),
            ],
          ),
          const SizedBox(height: 16),
          const Text(
            'FrohZeit Aktuell',
            style: TextStyle(
              fontSize: 34,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Heute, $dateStr',
            style: const TextStyle(fontSize: 16, color: Colors.black54),
          ),
          const SizedBox(height: 20),

          // Heute-Zusammenfassung
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  green,
                  green.withValues(alpha: 0.75),
                ],
              ),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(
                      Icons.wb_sunny_outlined,
                      color: Colors.white,
                      size: 22,
                    ),
                    const SizedBox(width: 8),
                    const Text(
                      'Dein Tag',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                if (entriesAsync.isLoading)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 18),
                    child: Center(
                      child: SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          color: Colors.white,
                          strokeWidth: 2.5,
                        ),
                      ),
                    ),
                  )
                else
                  Row(
                    children: [
                      _heroStat(
                        value: '$todayEntriesCount',
                        label: 'Heute',
                      ),
                      Container(
                        width: 1,
                        height: 40,
                        color: Colors.white.withValues(alpha: 0.3),
                      ),
                      _heroStat(
                        value: formatHours(todayHours),
                        label: 'Heute h',
                      ),
                      Container(
                        width: 1,
                        height: 40,
                        color: Colors.white.withValues(alpha: 0.3),
                      ),
                      _heroStat(
                        value: '$monthEntriesCount',
                        label: 'Diesen Monat',
                      ),
                    ],
                  ),
              ],
            ),
          ),

          const SizedBox(height: 18),

          // Schnellzugriff: Neuer Einsatz
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const EntryScreen()),
                );
              },
              icon: const Icon(Icons.add, size: 22),
              label: const Text(
                'Neuer Einsatz erfassen',
                style: TextStyle(fontSize: 17),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: green,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
            ),
          ),

          const SizedBox(height: 20),

          InfoCard(
            title: 'Nachrichten und Informationen',
            subtitle: 'Nächster Fortbildungstermin oder wichtige Hinweise.',
            accentColor: green,
            icon: Icons.article_outlined,
          ),
          const SizedBox(height: 14),
          InfoCard(
            title: 'Erinnerungen',
            subtitle: 'Eigene Erinnerungen aus dem Kalender oder System.',
            accentColor: green,
            icon: Icons.alarm,
          ),
          const SizedBox(height: 14),
          Card(
            child: InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: () => _showContact(context),
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 30,
                      backgroundColor: green.withValues(alpha: 0.15),
                      child: const Icon(
                        Icons.person_outline,
                        size: 30,
                        color: green,
                      ),
                    ),
                    const SizedBox(width: 16),
                    const Expanded(
                      child: Text(
                        'Ansprechpartner\nBüro / Einsatzleitung',
                        style: TextStyle(
                          fontSize: 18,
                          height: 1.4,
                        ),
                      ),
                    ),
                    const Icon(Icons.chevron_right, color: Colors.black38),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 14),
          const Card(
            child: Padding(
              padding: EdgeInsets.all(18),
              child: Text(
                '„Witziger Spruch des heutigen Kontakts"\noder ein motivierender Tageshinweis.',
                style: TextStyle(
                  fontSize: 18,
                  height: 1.5,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
