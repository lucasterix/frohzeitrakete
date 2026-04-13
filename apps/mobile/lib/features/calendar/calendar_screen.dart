import 'package:flutter/material.dart';
import '../entries/entry_detail_screen.dart';

class CalendarScreen extends StatelessWidget {
  const CalendarScreen({super.key});

  static const List<Map<String, dynamic>> _entries = [
    {
      'date': '13.04.2026',
      'time': '08:00',
      'patient': 'Patient Nr. 1',
      'city': 'Berlin',
      'hours': 2.5,
      'activities': ['Hauswirtschaft'],
      'signed': false,
    },
    {
      'date': '13.04.2026',
      'time': '14:30',
      'patient': 'Patient Nr. 2',
      'city': 'Hamburg',
      'hours': 1.5,
      'activities': ['Körperpflege'],
      'signed': false,
    },
    {
      'date': '12.04.2026',
      'time': '09:00',
      'patient': 'Patient Nr. 3',
      'city': 'München',
      'hours': 3.0,
      'activities': ['Begleitung bei Arztbesuchen'],
      'signed': true,
    },
    {
      'date': '10.04.2026',
      'time': '11:00',
      'patient': 'Patient Nr. 1',
      'city': 'Berlin',
      'hours': 1.0,
      'activities': ['Vorlesen'],
      'signed': true,
    },
  ];

  static String _formatHours(double h) {
    final full = h.truncate();
    final half = (h - full) >= 0.5;
    return '$full,${half ? '5' : '0'} h';
  }

  @override
  Widget build(BuildContext context) {
    const green = Color(0xFF4F8A5B);
    final now = DateTime.now();
    final todayStr =
        '${now.day.toString().padLeft(2, '0')}.${now.month.toString().padLeft(2, '0')}.${now.year}';

    // Einträge nach Datum gruppieren
    final grouped = <String, List<Map<String, dynamic>>>{};
    for (final entry in _entries) {
      final date = entry['date'] as String;
      grouped.putIfAbsent(date, () => []).add(entry);
    }
    final sortedDates = grouped.keys.toList()
      ..sort((a, b) => b.compareTo(a));

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
            child: ListView.builder(
              itemCount: sortedDates.length,
              itemBuilder: (context, groupIndex) {
                final date = sortedDates[groupIndex];
                final dayEntries = grouped[date]!;
                final isToday = date == todayStr;

                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8, top: 4),
                      child: Row(
                        children: [
                          Text(
                            date,
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                              color: isToday ? green : Colors.black54,
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
                                color: green.withValues(alpha: 0.12),
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
                      final hours = entry['hours'] as double;
                      final activities =
                          (entry['activities'] as List).cast<String>();
                      final patient = entry['patient'] as String;
                      final city = entry['city'] as String;
                      final time = entry['time'] as String;
                      final signed = entry['signed'] as bool;

                      return Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: Card(
                          child: ListTile(
                            leading: CircleAvatar(
                              backgroundColor: green.withValues(alpha: 0.12),
                              child: Text(
                                time.substring(0, 2),
                                style: const TextStyle(
                                  color: green,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 14,
                                ),
                              ),
                            ),
                            title: Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    'Einsatz bei $patient',
                                    style: const TextStyle(fontSize: 16),
                                  ),
                                ),
                                if (signed)
                                  const Icon(
                                    Icons.verified,
                                    color: green,
                                    size: 18,
                                  ),
                              ],
                            ),
                            subtitle: Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: Text(
                                '$city  •  ${_formatHours(hours)}  •  ${activities.join(', ')}',
                                style: const TextStyle(fontSize: 14),
                              ),
                            ),
                            trailing: const Icon(Icons.chevron_right),
                            onTap: () {
                              Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (_) => EntryDetailScreen(
                                    patientName: patient,
                                    date: entry['date'] as String,
                                    hours: hours,
                                    activities: activities,
                                    isSigned: signed,
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
          ),
        ],
      ),
    );
  }
}
