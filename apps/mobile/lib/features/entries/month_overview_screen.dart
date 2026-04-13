import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/mobile_patient.dart';
import '../../core/models/signature_event.dart';
import '../../core/providers.dart';
import '../signatures/signature_screen.dart';

class MonthOverviewScreen extends ConsumerStatefulWidget {
  final MobilePatient patient;
  final String monthLabel; // Initial-Wert, z.B. "April 2026"

  const MonthOverviewScreen({
    super.key,
    required this.patient,
    required this.monthLabel,
  });

  @override
  ConsumerState<MonthOverviewScreen> createState() =>
      _MonthOverviewScreenState();
}

class _MonthOverviewScreenState extends ConsumerState<MonthOverviewScreen> {
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

  String _formatHours(double h) {
    final full = h.truncate();
    final half = (h - full) >= 0.5;
    return '$full,${half ? '5' : '0'} h';
  }

  String _formatDate(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}.${d.year}';

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

  bool _isLockedByLeistungsnachweis(
    List<SignatureEvent> signatures,
    int year,
    int month,
  ) {
    return signatures.any(
      (s) =>
          s.patientId == widget.patient.patientId &&
          s.documentType == DocumentType.leistungsnachweis &&
          s.signedAt.year == year &&
          s.signedAt.month == month,
    );
  }

  @override
  Widget build(BuildContext context) {
    const green = Color(0xFF4F8A5B);
    final entriesAsync = ref.watch(
      patientEntriesProvider(
        EntryListParams(
          patientId: widget.patient.patientId,
          year: _currentMonth.year,
          month: _currentMonth.month,
        ),
      ),
    );
    final signaturesAsync = ref.watch(mySignaturesProvider);
    final signatures = signaturesAsync.valueOrNull ?? const <SignatureEvent>[];
    final isLocked = _isLockedByLeistungsnachweis(
      signatures,
      _currentMonth.year,
      _currentMonth.month,
    );
    final title = 'Leistungsnachweis $_monthLabel';

    return Scaffold(
      appBar: AppBar(title: const Text('Leistungsnachweis')),
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
            child: entriesAsync.when(
              loading: () =>
                  const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Text(
                    e.toString(),
                    style: const TextStyle(color: Colors.black54),
                    textAlign: TextAlign.center,
                  ),
                ),
              ),
              data: (entries) {
                final totalHours =
                    entries.fold<double>(0.0, (sum, e) => sum + e.hours);

                return SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        widget.patient.displayName,
                        style: const TextStyle(
                          fontSize: 26,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      if (isLocked) ...[
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
                                  'Dieser Monat ist unterschrieben und gesperrt.',
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
                              Icon(Icons.event_busy,
                                  size: 40, color: Colors.black26),
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
                                              _formatDate(entry.entryDate),
                                              style: const TextStyle(
                                                fontSize: 16,
                                                fontWeight: FontWeight.w600,
                                              ),
                                            ),
                                            const SizedBox(height: 3),
                                            Text(
                                              entry.activities.join(', '),
                                              style: const TextStyle(
                                                fontSize: 14,
                                                color: Colors.black54,
                                              ),
                                            ),
                                          ],
                                        ),
                                        const Spacer(),
                                        Text(
                                          _formatHours(entry.hours),
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
                              _formatHours(totalHours),
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
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 32),
            child: SizedBox(
              width: double.infinity,
              height: 54,
              child: ElevatedButton.icon(
                onPressed: (isLocked || (entriesAsync.valueOrNull?.isEmpty ?? true))
                    ? null
                    : () async {
                        final ok = await Navigator.of(context).push<bool>(
                          MaterialPageRoute(
                            builder: (_) => SignatureScreen(
                              patient: widget.patient,
                              documentType: DocumentType.leistungsnachweis,
                              documentTitle: title,
                            ),
                          ),
                        );
                        if (ok == true) {
                          ref.invalidate(mySignaturesProvider);
                          ref.invalidate(hoursSummaryProvider);
                        }
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
