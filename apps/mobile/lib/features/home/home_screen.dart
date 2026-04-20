import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/offline/connectivity_provider.dart';
import '../../core/providers.dart';
import '../entries/entry_screen.dart';
import '../entries/my_entries_screen.dart';
import '../office_requests/office_requests_screen.dart';
import '../patients/patient_intake_screen.dart';
import '../profile/profile_screen.dart';
import '../settings/settings_screen.dart';
import '../vacation/vacation_screen.dart';

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

  Widget _buildTasksSection(WidgetRef ref) {
    final asyncTrainings = ref.watch(trainingsProvider);

    String fmt(DateTime dt) {
      final d = dt.toLocal();
      return '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}.${d.year} · '
          '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')} Uhr';
    }

    final tasks = asyncTrainings.maybeWhen(
      data: (items) => items.map((t) {
        final starts = DateTime.parse(t['starts_at'] as String);
        final loc = (t['location'] as String?) ?? '';
        return {
          'icon': Icons.school_outlined,
          'title': t['title'] as String,
          'subtitle': loc.isEmpty ? fmt(starts) : '${fmt(starts)} · $loc',
          'color': Colors.blue,
        };
      }).toList(),
      orElse: () => <Map<String, dynamic>>[],
    );

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.black12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.orange.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(
                  Icons.task_alt,
                  color: Colors.orange,
                  size: 18,
                ),
              ),
              const SizedBox(width: 10),
              const Text(
                'Aufgaben & Termine',
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
          if (tasks.isEmpty)
            const Text(
              'Keine anstehenden Fortbildungen.',
              style: TextStyle(fontSize: 13, color: Colors.black54),
            ),
          ...tasks.asMap().entries.map((entry) {
            final isLast = entry.key == tasks.length - 1;
            final t = entry.value;
            return Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : 12),
              child: Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: (t['color'] as Color).withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(
                      t['icon'] as IconData,
                      color: t['color'] as Color,
                      size: 20,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          t['title'] as String,
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          t['subtitle'] as String,
                          style: const TextStyle(
                            fontSize: 12,
                            color: Colors.black54,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }

  void _showContact(BuildContext context, WidgetRef ref) {
    showDialog<void>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Ansprechpartner Büro'),
        content: Consumer(
          builder: (context, ref, _) {
            final asyncContact = ref.watch(orgContactProvider);
            return asyncContact.when(
              loading: () => const SizedBox(
                height: 80,
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (e, _) => Text(
                'Konnte Kontakt nicht laden:\n$e',
                style: const TextStyle(color: Colors.red),
              ),
              data: (c) => Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    (c['name'] as String?) ?? '—',
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 16,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text((c['org'] as String?) ?? ''),
                  const SizedBox(height: 12),
                  if ((c['phone'] as String?)?.isNotEmpty ?? false)
                    Row(
                      children: [
                        const Icon(Icons.phone_outlined, size: 18),
                        const SizedBox(width: 8),
                        Text(c['phone'] as String),
                      ],
                    ),
                  const SizedBox(height: 8),
                  if ((c['email'] as String?)?.isNotEmpty ?? false)
                    Row(
                      children: [
                        const Icon(Icons.mail_outline, size: 18),
                        const SizedBox(width: 8),
                        Text(c['email'] as String),
                      ],
                    ),
                  const SizedBox(height: 12),
                  if ((c['hours'] as String?)?.isNotEmpty ?? false)
                    Text(
                      c['hours'] as String,
                      style: const TextStyle(
                        fontSize: 13,
                        color: Colors.black54,
                      ),
                    ),
                ],
              ),
            );
          },
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
          _OfflineBanner(),
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
                      Builder(builder: (_) {
                        final st = ref.watch(monthStatsProvider);
                        final h = st.maybeWhen(
                          data: (s) => (s['total_hours_credited'] as num?)?.toDouble(),
                          orElse: () => null,
                        );
                        return _heroStat(
                          value: h != null ? '${h.toStringAsFixed(1)}' : '$monthEntriesCount',
                          label: h != null ? 'Monat h' : 'Diesen Monat',
                        );
                      }),
                    ],
                  ),
              ],
            ),
          ),

          const SizedBox(height: 12),

          // Monatsstatistik + Saldo aus Backend
          Builder(builder: (ctx) {
            final asyncStats = ref.watch(monthStatsProvider);
            return asyncStats.when(
              loading: () => const SizedBox.shrink(),
              error: (_, __) => const SizedBox.shrink(),
              data: (s) {
                if (s.isEmpty) return const SizedBox.shrink();
                final bal = (s['overtime_balance'] as num?)?.toDouble();
                final balLabel = (s['overtime_label'] as String?) ?? '';
                final balPositive = bal != null && bal >= 0;
                final totalH = (s['total_hours_credited'] as num?)?.toDouble() ?? 0;
                final avg = (s['avg_per_workday'] as num?)?.toDouble() ?? 0;
                final proj = (s['month_projection'] as num?)?.toDouble() ?? 0;
                final tgt = (s['target_hours_per_day'] as num?)?.toDouble();
                final monthName = (s['month_name'] as String?) ?? '';
                final wdElapsed = s['workdays_elapsed'] as int? ?? 0;
                final wdTotal = s['workdays_total'] as int? ?? 0;

                return _ExpandableMonthStats(
                  s: s,
                  bal: bal,
                  balLabel: balLabel,
                  balPositive: balPositive,
                  totalH: totalH,
                  avg: avg,
                  proj: proj,
                  tgt: tgt,
                  monthName: monthName,
                  wdElapsed: wdElapsed,
                  wdTotal: wdTotal,
                );
              },
            );
          }),

          const SizedBox(height: 18),

          // Aktionen: Neuer Einsatz + Meine Einsätze
          Row(
            children: [
              Expanded(
                flex: 3,
                child: SizedBox(
                  height: 54,
                  child: ElevatedButton.icon(
                    onPressed: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => const EntryScreen()),
                      );
                    },
                    icon: const Icon(Icons.add, size: 22),
                    label: const Text(
                      'Neuer Einsatz',
                      style: TextStyle(fontSize: 15),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: green,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                flex: 2,
                child: SizedBox(
                  height: 54,
                  child: OutlinedButton.icon(
                    onPressed: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => const MyEntriesScreen(),
                        ),
                      );
                    },
                    icon: const Icon(Icons.history, size: 20),
                    label: const Text(
                      'Historie',
                      style: TextStyle(fontSize: 15),
                    ),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: green,
                      side: const BorderSide(color: green),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: 10),

          // Urlaub-Schnellzugriff
          GestureDetector(
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const VacationScreen()),
              );
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFEF3C7),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.beach_access,
                        color: Color(0xFFD97706), size: 20),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Mein Urlaub',
                            style: TextStyle(
                                fontSize: 14, fontWeight: FontWeight.w600)),
                        Text('Übersicht & Antrag stellen',
                            style: TextStyle(
                                fontSize: 12, color: Color(0xFF64748B))),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right, color: Color(0xFF94A3B8)),
                ],
              ),
            ),
          ),

          const SizedBox(height: 20),

          _TodayStatusBanner(),
          _AnnouncementsSection(),
          // Aufgaben & Termine
          _MonthlySummaryCard(year: now.year, month: now.month),
          const SizedBox(height: 14),
          _buildOfficeRequestsTile(context),
          const SizedBox(height: 14),
          _buildVertretungsplanTile(context),
          const SizedBox(height: 14),
          _buildTasksSection(ref),

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

          // Patient neu aufnehmen – digitales Intake-Formular ans Büro
          Card(
            color: Colors.blue.withValues(alpha: 0.04),
            child: InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => const PatientIntakeScreen(),
                  ),
                );
              },
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 26,
                      backgroundColor: Colors.blue.withValues(alpha: 0.15),
                      child: const Icon(
                        Icons.person_add_alt_1,
                        size: 26,
                        color: Colors.blue,
                      ),
                    ),
                    const SizedBox(width: 14),
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Patient neu aufnehmen',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          SizedBox(height: 2),
                          Text(
                            'Stammdaten direkt ans Büro senden',
                            style: TextStyle(
                              fontSize: 13,
                              color: Colors.black54,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const Icon(Icons.arrow_forward_ios, color: Colors.blue),
                  ],
                ),
              ),
            ),
          ),

          const SizedBox(height: 14),

          // Ansprechpartner Büro
          Card(
            child: InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: () => _showContact(context, ref),
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
                            'Mo–Fr, 09:00–16:00 Uhr',
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

class _OfflineBanner extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final online = ref.watch(connectivityStreamProvider).maybeWhen(
          data: (o) => o,
          orElse: () => true,
        );
    final pending = ref.watch(pendingOfflineCountProvider).maybeWhen(
          data: (c) => c,
          orElse: () => 0,
        );

    if (online && pending == 0) {
      return const SizedBox.shrink();
    }

    final isOffline = !online;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: (isOffline ? Colors.red : Colors.orange)
              .withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: (isOffline ? Colors.red : Colors.orange)
                .withValues(alpha: 0.4),
          ),
        ),
        child: Row(
          children: [
            Icon(
              isOffline ? Icons.wifi_off : Icons.sync_problem,
              size: 18,
              color: isOffline ? Colors.red : Colors.orange[800],
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                isOffline
                    ? (pending > 0
                        ? 'Offline — $pending Einsatz/Einsätze warten auf Sync'
                        : 'Du bist offline')
                    : '$pending Einsatz/Einsätze werden übertragen …',
                style: TextStyle(
                  fontSize: 13,
                  color: isOffline ? Colors.red[800] : Colors.orange[900],
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MonthlySummaryCard extends ConsumerWidget {
  final int year;
  final int month;

  const _MonthlySummaryCard({required this.year, required this.month});

  static const _monthNames = [
    'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
  ];

  String _fmt(double h) {
    final full = h.truncate();
    final rest = ((h - full) * 10).round();
    return '$full,$rest h';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    const green = Color(0xFF4F8A5B);
    final async = ref.watch(userMonthlySummaryProvider(MonthParams(year, month)));

    return async.when(
      loading: () => const SizedBox(
        height: 120,
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (e, _) => const SizedBox.shrink(),
      data: (data) {
        final patientHours = (data['patient_hours'] as num?)?.toDouble() ?? 0;
        final nonPatient =
            (data['non_patient_hours'] as num?)?.toDouble() ?? 0;
        final withBonus =
            (data['patient_hours_with_bonus'] as num?)?.toDouble() ?? 0;
        final billable = (data['billable_hours'] as num?)?.toDouble() ?? 0;
        final totalKm = (data['total_km'] as num?)?.toDouble() ?? 0;
        final bonusPct = (data['bonus_pct'] as num?)?.toDouble() ?? 10;

        return Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: Colors.black12),
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
                      Icons.bar_chart,
                      color: green,
                      size: 18,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    '${_monthNames[month - 1]} $year',
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: Colors.black54,
                      letterSpacing: 0.3,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Abrechenbar',
                        style: TextStyle(fontSize: 11, color: Colors.black54),
                      ),
                      Text(
                        _fmt(billable),
                        style: const TextStyle(
                          fontSize: 30,
                          fontWeight: FontWeight.bold,
                          color: green,
                        ),
                      ),
                    ],
                  ),
                  const Spacer(),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      const Text(
                        'Km',
                        style: TextStyle(fontSize: 11, color: Colors.black54),
                      ),
                      Text(
                        totalKm.toStringAsFixed(1),
                        style: const TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                'Patient: ${_fmt(patientHours)} · +${bonusPct.toStringAsFixed(0)}% Aufschlag = '
                '${_fmt(withBonus)} · Büro/Fortbildung: ${_fmt(nonPatient)}',
                style: const TextStyle(fontSize: 11, color: Colors.black54),
              ),
            ],
          ),
        );
      },
    );
  }
}

const String _vertretungsplanUrl =
    'https://docs.google.com/forms/d/e/1FAIpQLSfrNkLBHK8i1Av_7A_1tgCjthleQi3WssYBLWlJQhikWuPyiA/viewform';

Widget _buildVertretungsplanTile(BuildContext context) {
  return Card(
    color: Colors.blue.withValues(alpha: 0.04),
    child: InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () async {
        final uri = Uri.parse(_vertretungsplanUrl);
        if (await canLaunchUrl(uri)) {
          await launchUrl(uri, mode: LaunchMode.externalApplication);
        } else {
          if (!context.mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Link konnte nicht geöffnet werden.'),
            ),
          );
        }
      },
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Row(
          children: [
            CircleAvatar(
              radius: 26,
              backgroundColor: Colors.blue.withValues(alpha: 0.15),
              child: const Icon(
                Icons.swap_horiz,
                size: 26,
                color: Colors.blue,
              ),
            ),
            const SizedBox(width: 14),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Vertretung übermitteln',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  SizedBox(height: 2),
                  Text(
                    'Öffnet das Vertretungs-Formular',
                    style: TextStyle(
                      fontSize: 13,
                      color: Colors.black54,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.open_in_new, color: Colors.blue),
          ],
        ),
      ),
    ),
  );
}

Widget _buildOfficeRequestsTile(BuildContext context) {
  const green = Color(0xFF4F8A5B);
  return Card(
    color: green.withValues(alpha: 0.04),
    child: InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => const OfficeRequestsScreen(),
          ),
        );
      },
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Row(
          children: [
            CircleAvatar(
              radius: 26,
              backgroundColor: green.withValues(alpha: 0.15),
              child: const Icon(
                Icons.forward_to_inbox_outlined,
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
                    'Anfrage ans Büro',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  SizedBox(height: 2),
                  Text(
                    'Urlaub, Krankmeldung, HR-Anliegen',
                    style: TextStyle(
                      fontSize: 13,
                      color: Colors.black54,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.arrow_forward_ios, color: green),
          ],
        ),
      ),
    ),
  );
}

class _TodayStatusBanner extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(todayStatusProvider);
    return async.maybeWhen(
      data: (data) {
        final onVacation = data['on_vacation'] == true;
        final isSick = data['is_sick'] == true;
        if (!onVacation && !isSick) return const SizedBox.shrink();
        final label = onVacation ? 'Du hast heute Urlaub' : 'Du bist heute krankgemeldet';
        final until = onVacation
            ? (data['vacation_until'] as String?)
            : (data['sick_until'] as String?);
        final color = onVacation ? Colors.blue : Colors.red;
        return Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: color.withValues(alpha: 0.4)),
            ),
            child: Row(
              children: [
                Icon(
                  onVacation ? Icons.beach_access : Icons.sick_outlined,
                  color: color,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        label,
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          color: color,
                        ),
                      ),
                      if (until != null)
                        Text(
                          'bis ${_fmtIso(until)}',
                          style: TextStyle(
                            fontSize: 12,
                            color: color.withValues(alpha: 0.8),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
      orElse: () => const SizedBox.shrink(),
    );
  }
}

class _AnnouncementsSection extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(announcementsProvider);
    return async.maybeWhen(
      data: (items) {
        if (items.isEmpty) return const SizedBox.shrink();
        return Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: items.map<Widget>((a) {
              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.amber.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: Colors.amber.withValues(alpha: 0.4),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(
                          Icons.campaign_outlined,
                          size: 18,
                          color: Colors.amber,
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            (a['title'] as String?) ?? '',
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 14,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      (a['body'] as String?) ?? '',
                      style: const TextStyle(fontSize: 13),
                    ),
                  ],
                ),
              );
            }).toList(),
          ),
        );
      },
      orElse: () => const SizedBox.shrink(),
    );
  }
}

String _fmtIso(String iso) {
  final parts = iso.split('-');
  if (parts.length != 3) return iso;
  return '${parts[2]}.${parts[1]}.${parts[0]}';
}

class _ExpandableMonthStats extends StatefulWidget {
  final Map<String, dynamic> s;
  final double? bal;
  final String balLabel;
  final bool balPositive;
  final double totalH;
  final double avg;
  final double proj;
  final double? tgt;
  final String monthName;
  final int wdElapsed;
  final int wdTotal;

  const _ExpandableMonthStats({
    required this.s,
    required this.bal,
    required this.balLabel,
    required this.balPositive,
    required this.totalH,
    required this.avg,
    required this.proj,
    required this.tgt,
    required this.monthName,
    required this.wdElapsed,
    required this.wdTotal,
  });

  @override
  State<_ExpandableMonthStats> createState() => _ExpandableMonthStatsState();
}

class _ExpandableMonthStatsState extends State<_ExpandableMonthStats> {
  bool _expanded = false;

  Widget _statRow(String label, String value, {Color? color}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label,
              style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
          Text(value,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: color ?? const Color(0xFF0F172A),
              )),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.s;
    final isVacation = s['today_is_vacation'] == true;
    final isHoliday = s['today_is_holiday'] == true;
    final holidayName = s['today_holiday_name'] as String?;

    return GestureDetector(
      onTap: () => setState(() => _expanded = !_expanded),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        margin: const EdgeInsets.only(bottom: 6),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Urlaubs-/Feiertags-Hinweis (immer sichtbar)
            if (isVacation)
              _infoBox('🏖️', 'Urlaubstag — Tagessoll wird angerechnet.',
                  const Color(0xFFFEF3C7), const Color(0xFF92400E)),
            if (isHoliday && holidayName != null)
              _infoBox('🎉', '$holidayName — Tagessoll wird angerechnet.',
                  const Color(0xFFF5F3FF), const Color(0xFF5B21B6)),

            // Kompakte Zusammenfassung (immer sichtbar)
            Row(
              children: [
                if (widget.bal != null) ...[
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(widget.balLabel,
                          style: const TextStyle(
                              fontSize: 9,
                              color: Color(0xFF94A3B8),
                              fontWeight: FontWeight.w600)),
                      Text(
                        '${widget.balPositive ? "+" : ""}${widget.bal!.toStringAsFixed(1)} h',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: widget.balPositive
                              ? const Color(0xFF059669)
                              : const Color(0xFFDC2626),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(width: 16),
                ],
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${widget.monthName} · Tag ${widget.wdElapsed}/${widget.wdTotal}',
                        style: const TextStyle(
                            fontSize: 9, color: Color(0xFF94A3B8), fontWeight: FontWeight.w600)),
                    Row(
                      children: [
                        Text('${widget.totalH.toStringAsFixed(1)} h',
                            style: const TextStyle(
                                fontSize: 20, fontWeight: FontWeight.bold, color: Color(0xFF0F172A))),
                        const SizedBox(width: 8),
                        Text('→ ${widget.proj.toStringAsFixed(0)} h',
                            style: const TextStyle(
                                fontSize: 14, fontWeight: FontWeight.w600, color: Color(0xFF2563EB))),
                      ],
                    ),
                  ],
                ),
                const Spacer(),
                Icon(
                  _expanded ? Icons.expand_less : Icons.expand_more,
                  color: const Color(0xFF94A3B8),
                ),
              ],
            ),

            // Detail (nur wenn expandiert)
            if (_expanded) ...[
              const Divider(height: 18),
              Builder(builder: (_) {
                final patRaw = (s['patient_hours_raw'] as num?)?.toDouble() ?? 0;
                final otherRaw = (s['other_hours_raw'] as num?)?.toDouble() ?? 0;
                final holidayH = (s['holiday_hours'] as num?)?.toDouble() ?? 0;
                final vacH = (s['vacation_hours'] as num?)?.toDouble() ?? 0;
                return Column(children: [
                  _statRow('Betreuung',
                      '${patRaw.toStringAsFixed(1)} + 10% = ${(patRaw * 1.1).toStringAsFixed(1)} h'),
                  if (otherRaw > 0)
                    _statRow('Sonstige', '${otherRaw.toStringAsFixed(1)} h'),
                  if (holidayH > 0)
                    _statRow('Feiertage', '${holidayH.toStringAsFixed(1)} h',
                        color: const Color(0xFF7C3AED)),
                  if (vacH > 0)
                    _statRow('Urlaub', '${vacH.toStringAsFixed(1)} h',
                        color: const Color(0xFFD97706)),
                  _statRow('Gesamt', '${widget.totalH.toStringAsFixed(1)} h'),
                ]);
              }),
              const Divider(height: 14),
              if (widget.tgt != null)
                _statRow('Soll / Tag', '${widget.tgt!.toStringAsFixed(1)} h'),
              _statRow('Ø pro Tag', '${widget.avg.toStringAsFixed(1)} h'),
              _statRow('Prognose', '${widget.proj.toStringAsFixed(0)} h',
                  color: const Color(0xFF2563EB)),
              Text('(Ø ${widget.avg.toStringAsFixed(1)} × 5 × 4,33)',
                  style: const TextStyle(fontSize: 10, color: Color(0xFF94A3B8))),
            ],
          ],
        ),
      ),
    );
  }

  Widget _infoBox(String emoji, String text, Color bg, Color fg) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(children: [
        Text(emoji, style: const TextStyle(fontSize: 16)),
        const SizedBox(width: 8),
        Expanded(child: Text(text, style: TextStyle(fontSize: 12, color: fg))),
      ]),
    );
  }
}
