import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:table_calendar/table_calendar.dart';

import '../../core/models/entry.dart';
import '../../core/providers.dart';
import 'entry_detail_screen.dart';

/// Kalender-/History-Übersicht aller eigenen Einsätze mit Monats-Navigation.
class MyEntriesScreen extends ConsumerStatefulWidget {
  const MyEntriesScreen({super.key});

  @override
  ConsumerState<MyEntriesScreen> createState() => _MyEntriesScreenState();
}

enum _ViewMode { list, calendar }

class _MyEntriesScreenState extends ConsumerState<MyEntriesScreen> {
  static const _monthNames = [
    'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
  ];

  _ViewMode _mode = _ViewMode.list;
  late DateTime _currentMonth;
  DateTime? _selectedDay;
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

  void _prev() => setState(() =>
      _currentMonth = DateTime(_currentMonth.year, _currentMonth.month - 1));

  void _next() {
    if (_isCurrentMonth) return;
    setState(() =>
        _currentMonth = DateTime(_currentMonth.year, _currentMonth.month + 1));
  }

  String _fmtHours(double h) {
    final full = h.truncate();
    final half = (h - full) >= 0.5;
    return '$full,${half ? '5' : '0'} h';
  }

  String _fmtDate(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}.${d.year}';

  @override
  Widget build(BuildContext context) {
    const green = Color(0xFF4F8A5B);
    final entriesAsync = ref.watch(
      myEntriesProvider(
        MyEntriesParams(
          year: _currentMonth.year,
          month: _currentMonth.month,
        ),
      ),
    );
    final patientsAsync = ref.watch(patientsProvider);

    String patientName(int id) {
      final patients = patientsAsync.valueOrNull ?? const [];
      final match = patients.where((p) => p.patientId == id);
      return match.isEmpty ? 'Patient #$id' : match.first.displayName;
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Meine Einsätze'),
        actions: [
          IconButton(
            tooltip: _mode == _ViewMode.list
                ? 'Kalender-Ansicht'
                : 'Listen-Ansicht',
            icon: Icon(
              _mode == _ViewMode.list
                  ? Icons.calendar_month
                  : Icons.view_list,
            ),
            onPressed: () {
              setState(() {
                _mode = _mode == _ViewMode.list
                    ? _ViewMode.calendar
                    : _ViewMode.list;
              });
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // Monats-Navigation
          Container(
            margin: const EdgeInsets.fromLTRB(20, 12, 20, 0),
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.black12),
            ),
            child: Row(
              children: [
                IconButton(
                  onPressed: _prev,
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
                  onPressed: _isCurrentMonth ? null : _next,
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
                  padding: const EdgeInsets.all(24),
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
                        e.toString(),
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Colors.black54,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              data: (entries) {
                if (_mode == _ViewMode.calendar) {
                  return _buildCalendarView(entries, patientName);
                }
                final totalHours = entries.fold<double>(
                  0.0,
                  (sum, e) => sum + e.hours,
                );

                return RefreshIndicator(
                  onRefresh: () async {
                    ref.invalidate(myEntriesProvider);
                    try {
                      await ref.read(
                        myEntriesProvider(
                          MyEntriesParams(
                            year: _currentMonth.year,
                            month: _currentMonth.month,
                          ),
                        ).future,
                      );
                    } catch (_) {}
                  },
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
                    children: [
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: green.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(
                            color: green.withValues(alpha: 0.3),
                          ),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.summarize, color: green),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    '${entries.length} Einsätze',
                                    style: const TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  Text(
                                    'im $_monthLabel',
                                    style: const TextStyle(
                                      fontSize: 13,
                                      color: Colors.black54,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Text(
                              _fmtHours(totalHours),
                              style: const TextStyle(
                                fontSize: 22,
                                fontWeight: FontWeight.bold,
                                color: green,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 18),
                      if (entries.isEmpty)
                        Container(
                          padding: const EdgeInsets.all(40),
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
                        ..._groupedEntries(entries, patientName),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCalendarView(
    List<Entry> entries,
    String Function(int) patientName,
  ) {
    const green = Color(0xFF4F8A5B);

    // entries nach Tag gruppieren für den Event-Loader
    final byDay = <DateTime, List<Entry>>{};
    for (final e in entries) {
      final k = DateTime(e.entryDate.year, e.entryDate.month, e.entryDate.day);
      byDay.putIfAbsent(k, () => []).add(e);
    }

    List<Entry> eventsFor(DateTime day) {
      final k = DateTime(day.year, day.month, day.day);
      return byDay[k] ?? const [];
    }

    final selected = _selectedDay ?? _now;
    final selectedEntries = eventsFor(selected);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
          child: Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.black12),
            ),
            child: TableCalendar<Entry>(
              firstDay: DateTime(2020),
              lastDay: _now,
              focusedDay: _currentMonth,
              locale: 'de_DE',
              selectedDayPredicate: (d) => isSameDay(d, selected),
              eventLoader: eventsFor,
              headerVisible: false,
              startingDayOfWeek: StartingDayOfWeek.monday,
              calendarStyle: CalendarStyle(
                outsideDaysVisible: false,
                todayDecoration: BoxDecoration(
                  color: green.withValues(alpha: 0.2),
                  shape: BoxShape.circle,
                ),
                todayTextStyle: const TextStyle(
                  color: Colors.black87,
                  fontWeight: FontWeight.bold,
                ),
                selectedDecoration: const BoxDecoration(
                  color: green,
                  shape: BoxShape.circle,
                ),
                markerDecoration: const BoxDecoration(
                  color: green,
                  shape: BoxShape.circle,
                ),
                markersMaxCount: 3,
              ),
              onDaySelected: (selectedDay, _) {
                setState(() {
                  _selectedDay = selectedDay;
                  _currentMonth = DateTime(selectedDay.year, selectedDay.month);
                });
              },
              onPageChanged: (focusedDay) {
                setState(() {
                  _currentMonth = DateTime(focusedDay.year, focusedDay.month);
                });
              },
            ),
          ),
        ),
        const SizedBox(height: 12),
        Expanded(
          child: selectedEntries.isEmpty
              ? Center(
                  child: Text(
                    'Keine Einsätze am ${_fmtDate(selected)}',
                    style: const TextStyle(
                      fontSize: 14,
                      color: Colors.black54,
                    ),
                  ),
                )
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                  itemCount: selectedEntries.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (context, i) {
                    final entry = selectedEntries[i];
                    final name = patientName(entry.patientId);
                    return Material(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(12),
                        onTap: () {
                          Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => EntryDetailScreen(
                                entry: entry,
                                patientName: name,
                              ),
                            ),
                          );
                        },
                        child: Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: Colors.black12),
                          ),
                          child: Row(
                            children: [
                              CircleAvatar(
                                radius: 18,
                                backgroundColor:
                                    green.withValues(alpha: 0.12),
                                child: const Icon(
                                  Icons.event,
                                  color: green,
                                  size: 18,
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      name,
                                      style: const TextStyle(
                                        fontSize: 15,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      entry.activities.join(', '),
                                      style: const TextStyle(
                                        fontSize: 13,
                                        color: Colors.black54,
                                      ),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ],
                                ),
                              ),
                              Text(
                                _fmtHours(entry.hours),
                                style: const TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.bold,
                                  color: green,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }

  List<Widget> _groupedEntries(
    List<Entry> entries,
    String Function(int) patientName,
  ) {
    const green = Color(0xFF4F8A5B);

    final grouped = <DateTime, List<Entry>>{};
    for (final e in entries) {
      final key = DateTime(e.entryDate.year, e.entryDate.month, e.entryDate.day);
      grouped.putIfAbsent(key, () => []).add(e);
    }
    final sortedDates = grouped.keys.toList()..sort((a, b) => b.compareTo(a));
    final todayKey = DateTime(_now.year, _now.month, _now.day);

    final widgets = <Widget>[];
    for (final date in sortedDates) {
      final dayEntries = grouped[date]!;
      final isToday = date == todayKey;
      final dayTotal =
          dayEntries.fold<double>(0.0, (sum, e) => sum + e.hours);

      widgets.add(
        Padding(
          padding: const EdgeInsets.only(bottom: 8, top: 4),
          child: Row(
            children: [
              Text(
                _fmtDate(date),
                style: TextStyle(
                  fontSize: 14,
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
                      fontSize: 12,
                      color: green,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
              const Spacer(),
              Text(
                _fmtHours(dayTotal),
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: green,
                ),
              ),
            ],
          ),
        ),
      );
      for (final entry in dayEntries) {
        final name = patientName(entry.patientId);
        widgets.add(
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Material(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => EntryDetailScreen(
                        entry: entry,
                        patientName: name,
                      ),
                    ),
                  );
                },
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.black12),
                  ),
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 18,
                        backgroundColor: green.withValues(alpha: 0.12),
                        child: const Icon(
                          Icons.event,
                          color: green,
                          size: 18,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              name,
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              entry.activities.join(', '),
                              style: const TextStyle(
                                fontSize: 13,
                                color: Colors.black54,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        _fmtHours(entry.hours),
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                          color: green,
                        ),
                      ),
                      const SizedBox(width: 4),
                      const Icon(
                        Icons.chevron_right,
                        color: Colors.black26,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      }
      widgets.add(const SizedBox(height: 6));
    }
    return widgets;
  }
}
