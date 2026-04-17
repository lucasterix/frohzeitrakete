import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/providers.dart';

final _vacationOverviewProvider =
    FutureProvider<Map<String, dynamic>>((ref) async {
  final auth = ref.watch(authControllerProvider);
  if (auth.valueOrNull == null) return {};
  final client = ref.watch(apiClientProvider);
  final res = await client.dio.get('/mobile/me/vacation-overview');
  return (res.data as Map).cast<String, dynamic>();
});

final _myVacationRequestsProvider =
    FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final auth = ref.watch(authControllerProvider);
  if (auth.valueOrNull == null) return [];
  final client = ref.watch(apiClientProvider);
  final res = await client.dio.get('/mobile/vacation-requests');
  final list = res.data as List;
  return list.map((e) => (e as Map).cast<String, dynamic>()).toList();
});

class VacationScreen extends ConsumerStatefulWidget {
  const VacationScreen({super.key});

  @override
  ConsumerState<VacationScreen> createState() => _VacationScreenState();
}

class _VacationScreenState extends ConsumerState<VacationScreen> {
  DateTimeRange? _selectedRange;
  String _note = '';
  bool _submitting = false;

  Future<void> _submitRequest() async {
    if (_selectedRange == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Bitte Zeitraum wählen.')),
      );
      return;
    }
    setState(() => _submitting = true);
    try {
      final client = ref.read(apiClientProvider);
      await client.dio.post('/mobile/vacation-requests', data: {
        'from_date': DateFormat('yyyy-MM-dd').format(_selectedRange!.start),
        'to_date': DateFormat('yyyy-MM-dd').format(_selectedRange!.end),
        'note': _note.trim().isEmpty ? null : _note.trim(),
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Urlaubsantrag eingereicht! Das Büro wird benachrichtigt.'),
            backgroundColor: Color(0xFF059669),
          ),
        );
        setState(() {
          _selectedRange = null;
          _note = '';
        });
        ref.invalidate(_myVacationRequestsProvider);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Fehler: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final overview = ref.watch(_vacationOverviewProvider);
    final requests = ref.watch(_myVacationRequestsProvider);
    final df = DateFormat('dd.MM.yyyy');

    return Scaffold(
      appBar: AppBar(title: const Text('Mein Urlaub')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          // Neuen Urlaub beantragen
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Urlaub beantragen',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Wähle den Zeitraum und reiche deinen Antrag ein. '
                  'Das Büro wird automatisch benachrichtigt.',
                  style: TextStyle(fontSize: 13, color: Color(0xFF64748B)),
                ),
                const SizedBox(height: 14),
                GestureDetector(
                  onTap: () async {
                    final now = DateTime.now();
                    final picked = await showDateRangePicker(
                      context: context,
                      firstDate: now,
                      lastDate: DateTime(now.year + 1, 12, 31),
                      locale: const Locale('de', 'DE'),
                    );
                    if (picked != null) setState(() => _selectedRange = picked);
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFFE2E8F0)),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.calendar_today,
                            size: 18, color: Color(0xFF64748B)),
                        const SizedBox(width: 10),
                        Text(
                          _selectedRange != null
                              ? '${df.format(_selectedRange!.start)} – ${df.format(_selectedRange!.end)}'
                              : 'Zeitraum wählen …',
                          style: TextStyle(
                            fontSize: 14,
                            color: _selectedRange != null
                                ? const Color(0xFF0F172A)
                                : const Color(0xFF94A3B8),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  onChanged: (v) => _note = v,
                  decoration: const InputDecoration(
                    hintText: 'Bemerkung (optional)',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.all(Radius.circular(12)),
                    ),
                    contentPadding:
                        EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    isDense: true,
                  ),
                  style: const TextStyle(fontSize: 14),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _submitting ? null : _submitRequest,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF4F8A5B),
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    child: _submitting
                        ? const SizedBox(
                            height: 18,
                            width: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Text('Antrag einreichen',
                            style: TextStyle(fontWeight: FontWeight.w600)),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Meine Anträge
          requests.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Text('Fehler: $e'),
            data: (reqs) {
              if (reqs.isEmpty) {
                return const SizedBox.shrink();
              }
              return Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: const Color(0xFFE2E8F0)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Meine Anträge',
                        style: TextStyle(
                            fontSize: 16, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 10),
                    ...reqs.map((r) {
                      final status = r['status'] as String? ?? 'open';
                      Color statusColor;
                      String statusLabel;
                      switch (status) {
                        case 'approved':
                          statusColor = const Color(0xFF059669);
                          statusLabel = 'Genehmigt';
                        case 'rejected':
                          statusColor = const Color(0xFFDC2626);
                          statusLabel = 'Abgelehnt';
                        case 'partially_approved':
                          statusColor = const Color(0xFFD97706);
                          statusLabel = 'Teilweise genehmigt';
                        default:
                          statusColor = const Color(0xFF64748B);
                          statusLabel = 'Offen';
                      }
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Row(
                          children: [
                            Expanded(
                              child: Text(
                                '${r['from_date']} – ${r['to_date']}',
                                style: const TextStyle(fontSize: 13),
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: statusColor.withValues(alpha: 0.1),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                statusLabel,
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: statusColor,
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    }),
                  ],
                ),
              );
            },
          ),
          const SizedBox(height: 20),

          // Genehmigte Urlaubstage (aus Sheet)
          overview.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Text('Fehler: $e'),
            data: (data) {
              final dates = (data['vacation_dates'] as List?)
                      ?.map((d) => DateTime.parse(d as String))
                      .toList() ??
                  [];
              final total = data['total_days'] as int? ?? 0;
              if (dates.isEmpty) {
                return Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                  ),
                  child: const Text(
                    'Noch keine genehmigten Urlaubstage in der Übersicht.',
                    style: TextStyle(fontSize: 13, color: Color(0xFF94A3B8)),
                  ),
                );
              }
              // Gruppiere nach Monat
              final byMonth = <int, List<DateTime>>{};
              for (final d in dates) {
                byMonth.putIfAbsent(d.month, () => []).add(d);
              }
              final months = byMonth.keys.toList()..sort();
              final monthNames = [
                '', 'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
                'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez',
              ];
              return Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: const Color(0xFFE2E8F0)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Genehmigter Urlaub 2026 · $total Tage',
                      style: const TextStyle(
                          fontSize: 16, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 10),
                    ...months.map((m) {
                      final days = byMonth[m]!;
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SizedBox(
                              width: 36,
                              child: Text(
                                monthNames[m],
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: Color(0xFF64748B),
                                ),
                              ),
                            ),
                            Expanded(
                              child: Wrap(
                                spacing: 4,
                                runSpacing: 4,
                                children: days.map((d) {
                                  final past = d.isBefore(DateTime.now());
                                  return Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: past
                                          ? const Color(0xFFE2E8F0)
                                          : const Color(0xFFFEF3C7),
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                    child: Text(
                                      '${d.day}.',
                                      style: TextStyle(
                                        fontSize: 11,
                                        color: past
                                            ? const Color(0xFF94A3B8)
                                            : const Color(0xFF92400E),
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  );
                                }).toList(),
                              ),
                            ),
                          ],
                        ),
                      );
                    }),
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}
