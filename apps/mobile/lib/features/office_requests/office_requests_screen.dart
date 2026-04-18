import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_exception.dart';
import '../../core/providers.dart';

const _green = Color(0xFF4F8A5B);

/// Vereinigte Screen für alle Anfragen/Mitteilungen an das Büro:
/// Urlaub, Krankmeldung, HR-Anfragen. Jeder Tab zeigt die laufenden
/// Anfragen des Users (mit Status und Antworten vom Büro) und einen
/// "Neu"-Button am unteren Rand.
class OfficeRequestsScreen extends ConsumerStatefulWidget {
  const OfficeRequestsScreen({super.key});

  @override
  ConsumerState<OfficeRequestsScreen> createState() =>
      _OfficeRequestsScreenState();
}

class _OfficeRequestsScreenState extends ConsumerState<OfficeRequestsScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tab;

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 4, vsync: this);
  }

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Anfragen ans Büro'),
        bottom: TabBar(
          controller: _tab,
          labelColor: _green,
          unselectedLabelColor: Colors.black54,
          indicatorColor: _green,
          isScrollable: true,
          tabs: const [
            Tab(icon: Icon(Icons.flight_takeoff), text: 'Urlaub'),
            Tab(icon: Icon(Icons.sick_outlined), text: 'Krank'),
            Tab(icon: Icon(Icons.inbox_outlined), text: 'HR / Sonstige'),
            Tab(icon: Icon(Icons.description_outlined), text: 'Dokumente'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tab,
        children: const [
          _VacationTab(),
          _SickTab(),
          _HrTab(),
          _DocumentTab(),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Vacation tab
// ---------------------------------------------------------------------------

class _VacationTab extends ConsumerWidget {
  const _VacationTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(myVacationRequestsProvider);

    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: _green,
        onPressed: () async {
          final ok = await showDialog<bool>(
            context: context,
            builder: (_) => const _VacationRequestDialog(),
          );
          if (ok == true) {
            ref.invalidate(myVacationRequestsProvider);
          }
        },
        icon: const Icon(Icons.add),
        label: const Text('Urlaub beantragen'),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Fehler: $e')),
        data: (items) {
          if (items.isEmpty) {
            return const _EmptyState(
              icon: Icons.flight_takeoff,
              text: 'Noch keine Urlaubsanträge gestellt',
            );
          }
          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(myVacationRequestsProvider);
              await ref.read(myVacationRequestsProvider.future);
            },
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 80),
              itemCount: items.length,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (_, i) => _VacationCard(item: items[i]),
            ),
          );
        },
      ),
    );
  }
}

class _VacationCard extends StatelessWidget {
  final Map<String, dynamic> item;
  const _VacationCard({required this.item});

  String _fmtDate(String iso) {
    final parts = iso.split('-');
    return '${parts[2]}.${parts[1]}.${parts[0]}';
  }

  @override
  Widget build(BuildContext context) {
    final status = (item['status'] as String?) ?? 'open';
    final from = _fmtDate(item['from_date'] as String);
    final to = _fmtDate(item['to_date'] as String);
    final kuerzel = item['handler_kuerzel'] as String?;
    final response = item['response_text'] as String?;
    final approvedFrom = item['approved_from_date'] as String?;
    final approvedTo = item['approved_to_date'] as String?;

    final (statusLabel, statusColor) = switch (status) {
      'approved' => ('Genehmigt', Colors.green),
      'partially_approved' => ('Teilweise genehmigt', Colors.orange),
      'rejected' => ('Abgelehnt', Colors.red),
      _ => ('Offen', Colors.blueGrey),
    };

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.black12),
      ),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '$from – $to',
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
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
          if (approvedFrom != null && approvedTo != null) ...[
            const SizedBox(height: 6),
            Text(
              'Genehmigter Zeitraum: ${_fmtDate(approvedFrom)} – ${_fmtDate(approvedTo)}',
              style: const TextStyle(fontSize: 12),
            ),
          ],
          if (response != null && response.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              'Antwort Büro: $response',
              style: const TextStyle(fontSize: 12, color: Colors.black87),
            ),
          ],
          if (kuerzel != null) ...[
            const SizedBox(height: 4),
            Text(
              'Bearbeitet von: $kuerzel',
              style: const TextStyle(
                fontSize: 11,
                color: Colors.black45,
                fontStyle: FontStyle.italic,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _VacationRequestDialog extends ConsumerStatefulWidget {
  const _VacationRequestDialog();

  @override
  ConsumerState<_VacationRequestDialog> createState() =>
      _VacationRequestDialogState();
}

class _VacationRequestDialogState
    extends ConsumerState<_VacationRequestDialog> {
  DateTime? _from;
  DateTime? _to;
  final _noteCtrl = TextEditingController();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _noteCtrl.dispose();
    super.dispose();
  }

  Future<void> _pick(bool isFrom) async {
    final initial = isFrom
        ? (DateTime.now().add(const Duration(days: 31)))
        : (_from ?? DateTime.now().add(const Duration(days: 31)));
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime.now().add(const Duration(days: 30)),
      lastDate: DateTime.now().add(const Duration(days: 365 * 2)),
    );
    if (picked == null) return;
    setState(() {
      if (isFrom) {
        _from = picked;
        if (_to != null && _to!.isBefore(picked)) _to = picked;
      } else {
        _to = picked;
      }
    });
  }

  Future<void> _submit() async {
    if (_from == null || _to == null) {
      setState(() => _error = 'Bitte Zeitraum auswählen');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref
          .read(officeWorkflowRepositoryProvider)
          .createVacationRequest(
            fromDate: _from!,
            toDate: _to!,
            note: _noteCtrl.text.trim().isEmpty ? null : _noteCtrl.text.trim(),
          );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = 'Fehler: $e');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String _label(DateTime? d) => d == null
      ? 'Datum wählen'
      : '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}.${d.year}';

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Urlaub beantragen'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Urlaub muss mindestens 30 Tage im Voraus beantragt werden.',
              style: TextStyle(fontSize: 12, color: Colors.black54),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: _saving ? null : () => _pick(true),
              icon: const Icon(Icons.event),
              label: Text('Von: ${_label(_from)}'),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: _saving ? null : () => _pick(false),
              icon: const Icon(Icons.event),
              label: Text('Bis: ${_label(_to)}'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _noteCtrl,
              decoration: const InputDecoration(
                labelText: 'Notiz (optional)',
                isDense: true,
              ),
              minLines: 1,
              maxLines: 3,
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(
                _error!,
                style: const TextStyle(color: Colors.red, fontSize: 12),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _saving ? null : () => Navigator.of(context).pop(false),
          child: const Text('Abbrechen'),
        ),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: _green),
          onPressed: _saving ? null : _submit,
          child: Text(_saving ? 'Sende …' : 'Senden'),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Sick leave tab
// ---------------------------------------------------------------------------

class _SickTab extends ConsumerWidget {
  const _SickTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(mySickLeavesProvider);

    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: Colors.red,
        onPressed: () async {
          final ok = await showDialog<bool>(
            context: context,
            builder: (_) => const _SickLeaveDialog(),
          );
          if (ok == true) ref.invalidate(mySickLeavesProvider);
        },
        icon: const Icon(Icons.sick_outlined),
        label: const Text('Krank melden'),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Fehler: $e')),
        data: (items) {
          if (items.isEmpty) {
            return const _EmptyState(
              icon: Icons.sick_outlined,
              text: 'Noch keine Krankmeldungen',
            );
          }
          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(mySickLeavesProvider);
              await ref.read(mySickLeavesProvider.future);
            },
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 80),
              itemCount: items.length,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (_, i) {
                final item = items[i];
                final from = item['from_date'] as String;
                final to = item['to_date'] as String;
                final ack = item['acknowledged_at'] as String?;
                final kuerzel = item['handler_kuerzel'] as String?;
                final response = item['response_text'] as String?;
                final statusColor = ack != null ? Colors.green : Colors.orange;
                final statusLabel = ack != null ? 'Gesichtet' : 'Gemeldet';
                return Container(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: Colors.black12),
                  ),
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              '${_fmtIso(from)} – ${_fmtIso(to)}',
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 3,
                            ),
                            decoration: BoxDecoration(
                              color: statusColor.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(10),
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
                      if (response != null && response.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(
                          'Antwort Büro: $response',
                          style: const TextStyle(fontSize: 12),
                        ),
                      ],
                      if (kuerzel != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          'Bearbeitet von: $kuerzel',
                          style: const TextStyle(
                            fontSize: 11,
                            color: Colors.black45,
                            fontStyle: FontStyle.italic,
                          ),
                        ),
                      ],
                    ],
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}

class _SickLeaveDialog extends ConsumerStatefulWidget {
  const _SickLeaveDialog();

  @override
  ConsumerState<_SickLeaveDialog> createState() => _SickLeaveDialogState();
}

class _SickLeaveDialogState extends ConsumerState<_SickLeaveDialog> {
  DateTime _from = DateTime.now();
  DateTime _to = DateTime.now();
  final _noteCtrl = TextEditingController();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _noteCtrl.dispose();
    super.dispose();
  }

  Future<void> _pick(bool isFrom) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: isFrom ? _from : _to,
      firstDate: DateTime.now().subtract(const Duration(days: 7)),
      lastDate: DateTime.now().add(const Duration(days: 60)),
    );
    if (picked == null) return;
    setState(() {
      if (isFrom) {
        _from = picked;
        if (_to.isBefore(picked)) _to = picked;
      } else {
        _to = picked;
      }
    });
  }

  Future<void> _submit() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(officeWorkflowRepositoryProvider).createSickLeave(
            fromDate: _from,
            toDate: _to,
            note: _noteCtrl.text.trim().isEmpty ? null : _noteCtrl.text.trim(),
          );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = 'Fehler: $e');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String _fmt(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}.${d.year}';

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Krank melden'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            OutlinedButton.icon(
              onPressed: _saving ? null : () => _pick(true),
              icon: const Icon(Icons.event),
              label: Text('Von: ${_fmt(_from)}'),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: _saving ? null : () => _pick(false),
              icon: const Icon(Icons.event),
              label: Text('Bis: ${_fmt(_to)}'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _noteCtrl,
              decoration: const InputDecoration(
                labelText: 'Notiz (optional)',
                isDense: true,
              ),
              minLines: 1,
              maxLines: 3,
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(
                _error!,
                style: const TextStyle(color: Colors.red, fontSize: 12),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _saving ? null : () => Navigator.of(context).pop(false),
          child: const Text('Abbrechen'),
        ),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: Colors.red),
          onPressed: _saving ? null : _submit,
          child: Text(_saving ? 'Sende …' : 'Senden'),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// HR tab
// ---------------------------------------------------------------------------

const _hrCategories = <({String value, String label})>[
  (value: 'overtime_payout', label: 'Überstundenauszahlung'),
  (value: 'income_certificate', label: 'Verdienstbescheinigung'),
  (value: 'salary_advance', label: 'Gehaltsvorschuss'),
  (value: 'address_change', label: 'Neue Adresse'),
  (value: 'side_job_certificate', label: 'Nebenverdienstbescheinigung'),
  (value: 'care_contract_copy', label: 'Betreuungsvertrag-Kopie'),
  (value: 'certificate', label: 'Bescheinigung'),
  (value: 'other_documents', label: 'Sonstige Unterlagen'),
  (value: 'other', label: 'Sonstiges'),
];

String _hrCategoryLabel(String value) {
  for (final c in _hrCategories) {
    if (c.value == value) return c.label;
  }
  return value;
}

class _HrTab extends ConsumerWidget {
  const _HrTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(myHrRequestsProvider);

    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: _green,
        onPressed: () async {
          final ok = await showDialog<bool>(
            context: context,
            builder: (_) => const _HrRequestDialog(),
          );
          if (ok == true) ref.invalidate(myHrRequestsProvider);
        },
        icon: const Icon(Icons.add),
        label: const Text('Neue Anfrage'),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Fehler: $e')),
        data: (items) {
          if (items.isEmpty) {
            return const _EmptyState(
              icon: Icons.inbox_outlined,
              text: 'Noch keine Anfragen an das Büro',
            );
          }
          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(myHrRequestsProvider);
              await ref.read(myHrRequestsProvider.future);
            },
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 80),
              itemCount: items.length,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (_, i) {
                final item = items[i];
                final status = (item['status'] as String?) ?? 'open';
                final kuerzel = item['handler_kuerzel'] as String?;
                final response = item['response_text'] as String?;
                final (statusLabel, statusColor) = switch (status) {
                  'done' => ('Erledigt', Colors.green),
                  'rejected' => ('Abgelehnt', Colors.red),
                  _ => ('Offen', Colors.orange),
                };
                return Container(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: Colors.black12),
                  ),
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              _hrCategoryLabel(item['category'] as String),
                              style: const TextStyle(
                                fontSize: 11,
                                color: Colors.black54,
                                fontWeight: FontWeight.w600,
                                letterSpacing: 0.3,
                              ),
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 3,
                            ),
                            decoration: BoxDecoration(
                              color: statusColor.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(10),
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
                      const SizedBox(height: 4),
                      Text(
                        item['subject'] as String,
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if (item['body'] != null &&
                          (item['body'] as String).isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          item['body'] as String,
                          style: const TextStyle(fontSize: 13),
                        ),
                      ],
                      if (response != null && response.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: _green.withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            'Antwort Büro: $response',
                            style: const TextStyle(fontSize: 12),
                          ),
                        ),
                      ],
                      if (kuerzel != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          'Bearbeitet von: $kuerzel',
                          style: const TextStyle(
                            fontSize: 11,
                            color: Colors.black45,
                            fontStyle: FontStyle.italic,
                          ),
                        ),
                      ],
                    ],
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}

class _HrRequestDialog extends ConsumerStatefulWidget {
  const _HrRequestDialog();

  @override
  ConsumerState<_HrRequestDialog> createState() => _HrRequestDialogState();
}

class _HrRequestDialogState extends ConsumerState<_HrRequestDialog> {
  String _category = 'overtime_payout';
  final _subjectCtrl = TextEditingController();
  final _bodyCtrl = TextEditingController();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _subjectCtrl.dispose();
    _bodyCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_subjectCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Bitte kurze Zusammenfassung eintragen');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(officeWorkflowRepositoryProvider).createHrRequest(
            category: _category,
            subject: _subjectCtrl.text.trim(),
            body: _bodyCtrl.text.trim().isEmpty ? null : _bodyCtrl.text.trim(),
          );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = 'Fehler: $e');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Anfrage ans Büro'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            DropdownButtonFormField<String>(
              initialValue: _category,
              decoration: const InputDecoration(
                labelText: 'Art der Anfrage',
                isDense: true,
              ),
              items: _hrCategories
                  .map(
                    (c) => DropdownMenuItem(
                      value: c.value,
                      child: Text(c.label),
                    ),
                  )
                  .toList(),
              onChanged: (v) => setState(() => _category = v ?? 'other'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _subjectCtrl,
              decoration: const InputDecoration(
                labelText: 'Kurze Zusammenfassung *',
                isDense: true,
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _bodyCtrl,
              decoration: const InputDecoration(
                labelText: 'Details (optional)',
                isDense: true,
              ),
              minLines: 2,
              maxLines: 4,
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(
                _error!,
                style: const TextStyle(color: Colors.red, fontSize: 12),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _saving ? null : () => Navigator.of(context).pop(false),
          child: const Text('Abbrechen'),
        ),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: _green),
          onPressed: _saving ? null : _submit,
          child: Text(_saving ? 'Sende …' : 'Senden'),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Document request tab
// ---------------------------------------------------------------------------

const _docCategories = <({String value, String label})>[
  (value: 'care_contract_copy', label: 'Betreuungsvertrag-Kopie'),
  (value: 'certificate', label: 'Bescheinigung'),
  (value: 'other_documents', label: 'Sonstige Unterlagen'),
];

class _DocumentTab extends ConsumerWidget {
  const _DocumentTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(myHrRequestsProvider);

    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: _green,
        onPressed: () async {
          final ok = await showDialog<bool>(
            context: context,
            builder: (_) => const _DocumentRequestDialog(),
          );
          if (ok == true) ref.invalidate(myHrRequestsProvider);
        },
        icon: const Icon(Icons.add),
        label: const Text('Dokument anfordern'),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Fehler: $e')),
        data: (items) {
          final docItems = items
              .where((item) => _docCategories.any((c) => c.value == item['category']))
              .toList();
          if (docItems.isEmpty) {
            return const _EmptyState(
              icon: Icons.description_outlined,
              text: 'Noch keine Dokumenten-Anfragen',
            );
          }
          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(myHrRequestsProvider);
              await ref.read(myHrRequestsProvider.future);
            },
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 80),
              itemCount: docItems.length,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (_, i) {
                final item = docItems[i];
                final status = (item['status'] as String?) ?? 'open';
                final kuerzel = item['handler_kuerzel'] as String?;
                final response = item['response_text'] as String?;
                final (statusLabel, statusColor) = switch (status) {
                  'done' => ('Erledigt', Colors.green),
                  'rejected' => ('Abgelehnt', Colors.red),
                  _ => ('Offen', Colors.orange),
                };
                return Container(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: Colors.black12),
                  ),
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              _hrCategoryLabel(item['category'] as String),
                              style: const TextStyle(
                                fontSize: 11,
                                color: Colors.black54,
                                fontWeight: FontWeight.w600,
                                letterSpacing: 0.3,
                              ),
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 3,
                            ),
                            decoration: BoxDecoration(
                              color: statusColor.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(10),
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
                      const SizedBox(height: 4),
                      Text(
                        item['subject'] as String,
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if (item['body'] != null &&
                          (item['body'] as String).isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          item['body'] as String,
                          style: const TextStyle(fontSize: 13),
                        ),
                      ],
                      if (response != null && response.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: _green.withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            'Antwort Büro: $response',
                            style: const TextStyle(fontSize: 12),
                          ),
                        ),
                      ],
                      if (kuerzel != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          'Bearbeitet von: $kuerzel',
                          style: const TextStyle(
                            fontSize: 11,
                            color: Colors.black45,
                            fontStyle: FontStyle.italic,
                          ),
                        ),
                      ],
                    ],
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}

class _DocumentRequestDialog extends ConsumerStatefulWidget {
  const _DocumentRequestDialog();

  @override
  ConsumerState<_DocumentRequestDialog> createState() =>
      _DocumentRequestDialogState();
}

class _DocumentRequestDialogState
    extends ConsumerState<_DocumentRequestDialog> {
  String _category = 'care_contract_copy';
  final _subjectCtrl = TextEditingController();
  final _bodyCtrl = TextEditingController();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _subjectCtrl.dispose();
    _bodyCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_subjectCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Bitte kurze Beschreibung eintragen');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(officeWorkflowRepositoryProvider).createHrRequest(
            category: _category,
            subject: _subjectCtrl.text.trim(),
            body: _bodyCtrl.text.trim().isEmpty ? null : _bodyCtrl.text.trim(),
          );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = 'Fehler: $e');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Dokument anfordern'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            DropdownButtonFormField<String>(
              initialValue: _category,
              decoration: const InputDecoration(
                labelText: 'Dokumentenart',
                isDense: true,
              ),
              items: _docCategories
                  .map(
                    (c) => DropdownMenuItem(
                      value: c.value,
                      child: Text(c.label),
                    ),
                  )
                  .toList(),
              onChanged: (v) =>
                  setState(() => _category = v ?? 'care_contract_copy'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _subjectCtrl,
              decoration: const InputDecoration(
                labelText: 'Kurze Beschreibung *',
                isDense: true,
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _bodyCtrl,
              decoration: const InputDecoration(
                labelText: 'Details (optional)',
                isDense: true,
              ),
              minLines: 2,
              maxLines: 4,
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(
                _error!,
                style: const TextStyle(color: Colors.red, fontSize: 12),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _saving ? null : () => Navigator.of(context).pop(false),
          child: const Text('Abbrechen'),
        ),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: _green),
          onPressed: _saving ? null : _submit,
          child: Text(_saving ? 'Sende …' : 'Senden'),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

String _fmtIso(String iso) {
  final parts = iso.split('-');
  if (parts.length != 3) return iso;
  return '${parts[2]}.${parts[1]}.${parts[0]}';
}

class _EmptyState extends StatelessWidget {
  final IconData icon;
  final String text;
  const _EmptyState({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 56, color: Colors.black26),
          const SizedBox(height: 12),
          Text(text, style: const TextStyle(color: Colors.black54)),
        ],
      ),
    );
  }
}
