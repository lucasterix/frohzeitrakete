import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/entry.dart';
import '../../core/models/signature_event.dart';
import '../../core/providers.dart';
import '../entries/entry_detail_screen.dart';

class CalendarScreen extends ConsumerWidget {
  const CalendarScreen({super.key});

  String _formatHours(double h) {
    final full = h.truncate();
    final half = (h - full) >= 0.5;
    return '$full,${half ? '5' : '0'} h';
  }

  String _formatDate(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}.${d.year}';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    const green = Color(0xFF4F8A5B);
    final now = DateTime.now();

    // Aktuellen Monat + Vormonat laden für einen sinnvollen Kalender-Überblick
    final currentAsync = ref.watch(
      myEntriesProvider(
        MyEntriesParams(year: now.year, month: now.month),
      ),
    );
    final patientsAsync = ref.watch(patientsProvider);
    final signaturesAsync = ref.watch(mySignaturesProvider);

    final todayStr = _formatDate(DateTime(now.year, now.month, now.day));

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Kalender',
            style: TextStyle(fontSize: 34, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 18),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  const Icon(Icons.today, size: 28, color: green),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Text(
                      'Heute, $todayStr',
                      style: const TextStyle(fontSize: 18),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Expanded(
            child: currentAsync.when(
              loading: () =>
                  const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        Icons.cloud_off,
                        size: 48,
                        color: Colors.black26,
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'Einsätze konnten nicht geladen werden',
                        style: const TextStyle(
                          fontSize: 16,
                          color: Colors.black54,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 6),
                      Text(
                        e.toString(),
                        style: const TextStyle(
                          fontSize: 12,
                          color: Colors.black45,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
              ),
              data: (entries) {
                if (entries.isEmpty) {
                  return RefreshIndicator(
                    onRefresh: () async {
                      ref.invalidate(myEntriesProvider);
                      await ref.read(
                        myEntriesProvider(
                          MyEntriesParams(year: now.year, month: now.month),
                        ).future,
                      );
                    },
                    child: ListView(
                      children: const [
                        SizedBox(height: 60),
                        Center(
                          child: Column(
                            children: [
                              Icon(
                                Icons.event_busy,
                                size: 52,
                                color: Colors.black26,
                              ),
                              SizedBox(height: 12),
                              Text(
                                'Noch keine Einsätze diesen Monat',
                                style: TextStyle(
                                  fontSize: 16,
                                  color: Colors.black54,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  );
                }

                // Einträge nach Datum gruppieren, neueste zuerst
                final grouped = <DateTime, List<Entry>>{};
                for (final entry in entries) {
                  final key = DateTime(
                    entry.entryDate.year,
                    entry.entryDate.month,
                    entry.entryDate.day,
                  );
                  grouped.putIfAbsent(key, () => []).add(entry);
                }
                final sortedDates = grouped.keys.toList()
                  ..sort((a, b) => b.compareTo(a));

                final patients = patientsAsync.valueOrNull ?? const [];
                final signatures =
                    signaturesAsync.valueOrNull ?? const <SignatureEvent>[];

                String patientName(int id) {
                  final match = patients.where((p) => p.patientId == id);
                  return match.isEmpty
                      ? 'Patient #$id'
                      : match.first.displayName;
                }

                bool isMonthLocked(Entry e) {
                  return signatures.any((s) =>
                      s.patientId == e.patientId &&
                      s.documentType == DocumentType.leistungsnachweis &&
                      s.signedAt.year == e.entryDate.year &&
                      s.signedAt.month == e.entryDate.month);
                }

                return RefreshIndicator(
                  onRefresh: () async {
                    ref.invalidate(myEntriesProvider);
                    await ref.read(
                      myEntriesProvider(
                        MyEntriesParams(year: now.year, month: now.month),
                      ).future,
                    );
                  },
                  child: ListView.builder(
                    padding: const EdgeInsets.only(bottom: 24),
                    itemCount: sortedDates.length,
                    itemBuilder: (context, groupIndex) {
                      final date = sortedDates[groupIndex];
                      final dayEntries = grouped[date]!;
                      final isToday = _formatDate(date) == todayStr;

                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8, top: 4),
                            child: Row(
                              children: [
                                Text(
                                  _formatDate(date),
                                  style: TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w600,
                                    color:
                                        isToday ? green : Colors.black54,
                                  ),
                                ),
                                if (isToday) ...[
                                  const SizedBox(width: 8),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 8,
                                      vertical: 2,
                                    ),
                                    decoration: BoxDecoration(
                                      color:
                                          green.withValues(alpha: 0.12),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: const Text(
                                      'Heute',
                                      style: TextStyle(
                                        fontSize: 13,
                                        color: green,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                          ...dayEntries.map((entry) {
                            final signed = isMonthLocked(entry);
                            final name = patientName(entry.patientId);
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: Card(
                                child: ListTile(
                                  leading: CircleAvatar(
                                    backgroundColor:
                                        green.withValues(alpha: 0.12),
                                    child: Icon(
                                      signed
                                          ? Icons.verified
                                          : Icons.event,
                                      color: green,
                                      size: 18,
                                    ),
                                  ),
                                  title: Text(
                                    name,
                                    style: const TextStyle(fontSize: 16),
                                  ),
                                  subtitle: Padding(
                                    padding:
                                        const EdgeInsets.only(top: 4),
                                    child: Text(
                                      '${_formatHours(entry.hours)}  •  ${entry.activities.join(', ')}',
                                      style: const TextStyle(fontSize: 14),
                                    ),
                                  ),
                                  trailing: const Icon(Icons.chevron_right),
                                  onTap: () {
                                    Navigator.of(context).push(
                                      MaterialPageRoute(
                                        builder: (_) => EntryDetailScreen(
                                          entry: entry,
                                          patientName: name,
                                          monthLocked: signed,
                                        ),
                                      ),
                                    );
                                  },
                                ),
                              ),
                            );
                          }),
                          const SizedBox(height: 8),
                        ],
                      );
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
