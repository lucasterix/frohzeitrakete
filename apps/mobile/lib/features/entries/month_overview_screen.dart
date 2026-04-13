import 'package:flutter/material.dart';
import '../signatures/signature_screen.dart';

class MonthOverviewScreen extends StatefulWidget {
  final String patientName;
  final String monthLabel; // z.B. "April 2026"

  const MonthOverviewScreen({
    super.key,
    required this.patientName,
    required this.monthLabel,
  });

  @override
  State<MonthOverviewScreen> createState() => _MonthOverviewScreenState();
}

class _MonthOverviewScreenState extends State<MonthOverviewScreen> {
  static const List<String> _monthNames = [
    'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
  ];

  late DateTime _currentMonth;
  final DateTime _now = DateTime.now();

  @override
  void initState() {
    super.initState();
    _currentMonth = DateTime(_now.year, _now.month);
  }

  String get _monthLabel =>
      '${_monthNames[_currentMonth.month - 1]} ${_currentMonth.year}';

  bool get _isCurrentMonth =>
      _currentMonth.year == _now.year && _currentMonth.month == _now.month;

  bool get _isFutureMonth =>
      _currentMonth.isAfter(DateTime(_now.year, _now.month));

  // Monate vor dem aktuellen Monat sind gesperrt (Büro-Workflow)
  bool get _isLocked => _currentMonth.isBefore(DateTime(_now.year, _now.month));

  // Mock-Daten je Monat
  List<Map<String, dynamic>> get _entries {
    if (_isFutureMonth) return [];
    if (_isCurrentMonth) {
      return const [
        {
          'date': '05.04.2026',
          'hours': 3.0,
          'activities': 'Begleitung bei Arztbesuchen',
        },
        {
          'date': '09.04.2026',
          'hours': 1.5,
          'activities': 'Körperpflege, Gesellschaft leisten',
        },
        {
          'date': '12.04.2026',
          'hours': 2.5,
          'activities': 'Hauswirtschaft, Vorlesen',
        },
        {
          'date': '13.04.2026',
          'hours': 2.0,
          'activities': 'Spaziergänge, Gedächtnistraining',
        },
      ];
    }
    // Vorheriger Monat (gesperrt) – Beispieldaten
    return const [
      {
        'date': '03.03.2026',
        'hours': 2.0,
        'activities': 'Hauswirtschaft',
      },
      {
        'date': '10.03.2026',
        'hours': 3.0,
        'activities': 'Körperpflege, Vorlesen',
      },
      {
        'date': '17.03.2026',
        'hours': 1.5,
        'activities': 'Spaziergänge',
      },
    ];
  }

  double get _totalHours =>
      _entries.fold(0.0, (sum, e) => sum + (e['hours'] as double));

  String _formatHours(double h) {
    final full = h.truncate();
    final half = (h - full) >= 0.5;
    return '$full,${half ? '5' : '0'} h';
  }

  void _prevMonth() {
    setState(() {
      _currentMonth = DateTime(_currentMonth.year, _currentMonth.month - 1);
    });
  }

  void _nextMonth() {
    if (_isCurrentMonth) return;
    setState(() {
      _currentMonth = DateTime(_currentMonth.year, _currentMonth.month + 1);
    });
  }

  @override
  Widget build(BuildContext context) {
    const green = Color(0xFF4F8A5B);
    final entries = _entries;
    final title = 'Leistungsnachweis $_monthLabel';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Leistungsnachweis'),
      ),
      body: Column(
        children: [
          // Monats-Navigation
          Container(
            margin: const EdgeInsets.fromLTRB(20, 16, 20, 0),
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.black12),
            ),
            child: Row(
              children: [
                IconButton(
                  onPressed: _prevMonth,
                  icon: const Icon(Icons.chevron_left),
                ),
                Expanded(
                  child: Center(
                    child: Text(
                      _monthLabel,
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
                IconButton(
                  onPressed: _isCurrentMonth ? null : _nextMonth,
                  icon: const Icon(Icons.chevron_right),
                ),
              ],
            ),
          ),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.patientName,
                    style: const TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.bold,
                    ),
                  ),

                  if (_isLocked) ...[
                    const SizedBox(height: 14),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.orange.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Row(
                        children: [
                          Icon(Icons.lock_outline,
                              color: Colors.orange, size: 20),
                          SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              'Dieser Monat ist abgeschlossen und gesperrt.',
                              style: TextStyle(
                                fontSize: 14,
                                color: Colors.orange,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],

                  const SizedBox(height: 24),

                  const Text(
                    'Einsätze',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 10),

                  if (entries.isEmpty)
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(vertical: 40),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: Colors.black12),
                      ),
                      child: const Column(
                        children: [
                          Icon(
                            Icons.event_busy,
                            size: 40,
                            color: Colors.black26,
                          ),
                          SizedBox(height: 10),
                          Text(
                            'Keine Einsätze in diesem Monat',
                            style: TextStyle(
                              fontSize: 15,
                              color: Colors.black54,
                            ),
                          ),
                        ],
                      ),
                    )
                  else
                    Container(
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: Colors.black12),
                      ),
                      child: Column(
                        children: entries.asMap().entries.map((e) {
                          final entry = e.value;
                          final isLast = e.key == entries.length - 1;
                          return Column(
                            children: [
                              Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 16,
                                  vertical: 14,
                                ),
                                child: Row(
                                  children: [
                                    Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          entry['date'] as String,
                                          style: const TextStyle(
                                            fontSize: 16,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                        const SizedBox(height: 3),
                                        Text(
                                          entry['activities'] as String,
                                          style: const TextStyle(
                                            fontSize: 14,
                                            color: Colors.black54,
                                          ),
                                        ),
                                      ],
                                    ),
                                    const Spacer(),
                                    Text(
                                      _formatHours(entry['hours'] as double),
                                      style: const TextStyle(
                                        fontSize: 18,
                                        fontWeight: FontWeight.bold,
                                        color: green,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              if (!isLast)
                                const Divider(height: 1, indent: 16),
                            ],
                          );
                        }).toList(),
                      ),
                    ),

                  const SizedBox(height: 16),

                  Container(
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      color: green.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: green.withValues(alpha: 0.3),
                      ),
                    ),
                    child: Row(
                      children: [
                        const Text(
                          'Gesamtstunden',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const Spacer(),
                        Text(
                          _formatHours(_totalHours),
                          style: const TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.bold,
                            color: green,
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 8),
                  const Text(
                    'Patient unterschreibt den Leistungsnachweis persönlich.',
                    style: TextStyle(fontSize: 13, color: Colors.black45),
                  ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 32),
            child: SizedBox(
              width: double.infinity,
              height: 54,
              child: ElevatedButton.icon(
                onPressed: (_isLocked || entries.isEmpty)
                    ? null
                    : () {
                        Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) =>
                                SignatureScreen(documentTitle: title),
                          ),
                        );
                      },
                icon: const Icon(Icons.draw),
                label: const Text(
                  'Patient unterschreiben lassen',
                  style: TextStyle(fontSize: 17),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: green,
                  foregroundColor: Colors.white,
                  disabledBackgroundColor: Colors.black12,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
