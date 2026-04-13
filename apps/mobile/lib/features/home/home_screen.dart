import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../shared/widgets/notification_bell.dart';
import '../entries/entry_screen.dart';
import '../profile/profile_screen.dart';
import '../settings/settings_screen.dart';

/// Motivierende Sprüche, die zufällig auf der Startseite rotieren.
const List<String> _motivationalQuotes = [
  'Jede Minute deiner Arbeit macht den Tag eines Menschen heller. ☀️',
  'Kleine Gesten, große Wirkung — du machst das großartig!',
  'Heute ist ein guter Tag um etwas Gutes zu tun.',
  'Du bist das Lächeln im Alltag von jemandem.',
  'Wer anderen hilft, wächst mit jeder Stunde.',
  'Kaffee ☕ intus? Dann kann der Tag starten!',
  'Warmherzigkeit kann man nicht messen — aber man spürt sie.',
  'Ein Einsatz mehr = ein Lächeln mehr.',
  'Dein Job ist kein Job, er ist eine Haltung.',
  'Heute ist ein perfekter Tag um jemanden glücklich zu machen.',
  'Wer Pflege macht, macht die Welt etwas besser — und das bist du.',
  'Alltagshilfe heute, Dankbarkeit für immer.',
  'Manchmal ist ein Gespräch die beste Medizin.',
  'Wenn du den Tag gut anfängst, wird alles andere leichter.',
  'Ein Spaziergang mit dir ist oft das Highlight des Tages.',
  'Zeit ist Gold — die, die du schenkst, sogar Platin.',
  'Selbst der beste Kaffee ersetzt dein Lächeln nicht.',
  'Pflege ist Liebe in Arbeitskleidung.',
  'Du bringst Licht in jedes Wohnzimmer das du betrittst.',
  'Danke, dass du da bist — auch wenn das Wetter mies ist.',
];

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
            Text('FrohZeit Büro'),
            SizedBox(height: 12),
            Row(
              children: [
                Icon(Icons.phone_outlined, size: 18),
                SizedBox(width: 8),
                Text('+49 551 28879514'),
              ],
            ),
            SizedBox(height: 8),
            Row(
              children: [
                Icon(Icons.mail_outline, size: 18),
                SizedBox(width: 8),
                Text('daniel.rupp@froehlichdienste.de'),
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

    // Einsätze des aktuellen Monats
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

    // Deterministischer Spruch des Tages (wechselt jeden Tag)
    final quoteIndex =
        (now.year * 1000 + now.month * 31 + now.day) % _motivationalQuotes.length;
    final quoteOfDay = _motivationalQuotes[quoteIndex];

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(myEntriesProvider);
        ref.invalidate(patientsProvider);
        ref.invalidate(mySignaturesProvider);
        try {
          await ref.read(
            myEntriesProvider(
              MyEntriesParams(year: now.year, month: now.month),
            ).future,
          );
        } catch (_) {}
      },
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
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
            style: TextStyle(fontSize: 34, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 6),
          Text(
            'Heute, $dateStr',
            style: const TextStyle(fontSize: 16, color: Colors.black54),
          ),
          const SizedBox(height: 20),

          // Dein Tag – Hero
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [green, green.withValues(alpha: 0.75)],
              ),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(
                      Icons.wb_sunny_outlined,
                      color: Colors.white,
                      size: 22,
                    ),
                    SizedBox(width: 8),
                    Text(
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

          // Neuer Einsatz
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

          // Spruch des Tages
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: green.withValues(alpha: 0.25),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: green.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(
                        Icons.auto_awesome,
                        color: green,
                        size: 18,
                      ),
                    ),
                    const SizedBox(width: 10),
                    const Text(
                      'Spruch des Tages',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: Colors.black54,
                        letterSpacing: 0.3,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Text(
                  quoteOfDay,
                  style: const TextStyle(
                    fontSize: 17,
                    height: 1.4,
                    fontWeight: FontWeight.w500,
                    color: Colors.black87,
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 14),

          // Ansprechpartner Büro
          Card(
            child: InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: () => _showContact(context),
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 26,
                      backgroundColor: green.withValues(alpha: 0.15),
                      child: const Icon(
                        Icons.support_agent,
                        size: 26,
                        color: green,
                      ),
                    ),
                    const SizedBox(width: 14),
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Ansprechpartner Büro',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          SizedBox(height: 2),
                          Text(
                            'Mo–Fr, 08:00–17:00 Uhr',
                            style: TextStyle(
                              fontSize: 13,
                              color: Colors.black54,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const Icon(Icons.chevron_right, color: Colors.black38),
                  ],
                ),
              ),
            ),
          ),
        ],
        ),
      ),
    );
  }
}
