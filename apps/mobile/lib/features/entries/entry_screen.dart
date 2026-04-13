import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_exception.dart';
import '../../core/models/mobile_patient.dart';
import '../../core/models/signature_event.dart';
import '../../core/providers.dart';
import '../signatures/signature_screen.dart';

class EntryScreen extends ConsumerStatefulWidget {
  final MobilePatient? preselectedPatient;

  const EntryScreen({super.key, this.preselectedPatient});

  @override
  ConsumerState<EntryScreen> createState() => _EntryScreenState();
}

class _EntryScreenState extends ConsumerState<EntryScreen> {

  // Häufigste Stundenwerte als Quick-Presets
  static const List<double> _hourPresets = [
    0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 6.0,
  ];

  static const List<String> _activities = [
    'Alltagshilfe',
    'Gespräche/Aktivierung',
    'Begleitung',
  ];

  MobilePatient? _selectedPatient;
  DateTime _selectedDate = DateTime.now();
  double? _hours;
  final Set<String> _selectedActivities = {};
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    _selectedPatient = widget.preselectedPatient;
  }

  String _formatHours(double h) {
    final full = h.truncate();
    final half = (h - full) >= 0.5;
    return '$full,${half ? '5' : '0'} h';
  }

  String _formatDate(DateTime d) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final picked = DateTime(d.year, d.month, d.day);
    final diff = today.difference(picked).inDays;
    final date =
        '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}.${d.year}';
    if (diff == 0) return 'Heute, $date';
    if (diff == 1) return 'Gestern, $date';
    return date;
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(DateTime.now().year - 1),
      lastDate: DateTime.now(),
    );
    if (picked != null) setState(() => _selectedDate = picked);
  }

  Future<void> _save() async {
    if (_selectedPatient == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Bitte Patient wählen.')),
      );
      return;
    }
    if (_hours == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Bitte Stunden wählen.')),
      );
      return;
    }
    if (_selectedActivities.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Bitte mindestens eine Tätigkeit.')),
      );
      return;
    }

    setState(() => _isSaving = true);

    try {
      await ref.read(entryRepositoryProvider).createOrUpdateEntry(
            patientId: _selectedPatient!.patientId,
            entryDate: _selectedDate,
            hours: _hours!,
            activities: _selectedActivities.toList(),
          );

      // Alle Provider die jetzt stale sind invalidieren, damit PatientDetail
      // und Home nach Rückkehr die echten neuen Zahlen aus Patti ziehen.
      ref.invalidate(hoursSummaryProvider);
      ref.invalidate(patientEntriesProvider);
      ref.invalidate(myEntriesProvider);
      ref.invalidate(pattiBudgetProvider);
      ref.invalidate(mySignaturesProvider);

      if (!mounted) return;

      // Direkt zur Unterschrift – der Patient unterschreibt jeden einzelnen Einsatz.
      final patient = _selectedPatient!;
      final dateStr =
          '${_selectedDate.day.toString().padLeft(2, '0')}.${_selectedDate.month.toString().padLeft(2, '0')}.${_selectedDate.year}';
      final signed = await Navigator.of(context).pushReplacement<bool, void>(
        MaterialPageRoute(
          builder: (_) => SignatureScreen(
            patient: patient,
            documentType: DocumentType.leistungsnachweis,
            documentTitle:
                'Einsatz vom $dateStr · ${_formatHours(_hours!)}',
          ),
        ),
      );

      if (signed == true) {
        ref.invalidate(mySignaturesProvider);
      }
      return;
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _isSaving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.message),
          backgroundColor: Colors.red,
          duration: const Duration(seconds: 5),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _isSaving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Unerwarteter Fehler: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  bool get _canSave =>
      _selectedPatient != null &&
      _hours != null &&
      _selectedActivities.isNotEmpty;

  @override
  Widget build(BuildContext context) {
    const green = Color(0xFF4F8A5B);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Einsatz erfassen'),
      ),
      body: Column(
        children: [
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Patient
                  _label('Patient'),
                  const SizedBox(height: 8),
                  _buildPatientDropdown(),

                  const SizedBox(height: 20),

                  // Datum mit Heute-Shortcut
                  Row(
                    children: [
                      _label('Datum'),
                      const Spacer(),
                      TextButton.icon(
                        onPressed: () {
                          setState(() => _selectedDate = DateTime.now());
                        },
                        icon: const Icon(Icons.today, size: 16),
                        label: const Text('Heute'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  GestureDetector(
                    onTap: _pickDate,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 14,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: Colors.black12),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.calendar_today,
                            color: green,
                            size: 20,
                          ),
                          const SizedBox(width: 12),
                          Text(
                            _formatDate(_selectedDate),
                            style: const TextStyle(fontSize: 17),
                          ),
                          const Spacer(),
                          const Icon(
                            Icons.chevron_right,
                            color: Colors.black38,
                          ),
                        ],
                      ),
                    ),
                  ),

                  const SizedBox(height: 24),

                  // Stunden-Presets
                  _label('Stunden'),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: _hourPresets.map((h) {
                      final selected = _hours == h;
                      return GestureDetector(
                        onTap: () => setState(() => _hours = h),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 150),
                          width: 72,
                          height: 56,
                          decoration: BoxDecoration(
                            color: selected ? green : Colors.white,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                              color: selected ? green : Colors.black12,
                              width: selected ? 2 : 1,
                            ),
                          ),
                          child: Center(
                            child: Text(
                              _formatHours(h),
                              style: TextStyle(
                                fontSize: 17,
                                fontWeight: FontWeight.bold,
                                color:
                                    selected ? Colors.white : Colors.black87,
                              ),
                            ),
                          ),
                        ),
                      );
                    }).toList(),
                  ),

                  const SizedBox(height: 24),

                  // Aktivitäten als Chips
                  Row(
                    children: [
                      _label('Tätigkeiten'),
                      if (_selectedActivities.isNotEmpty) ...[
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
                          child: Text(
                            '${_selectedActivities.length}',
                            style: const TextStyle(
                              fontSize: 12,
                              color: green,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: _activities.map((activity) {
                      final selected = _selectedActivities.contains(activity);
                      return FilterChip(
                        label: Text(activity),
                        selected: selected,
                        onSelected: (v) {
                          setState(() {
                            if (v) {
                              _selectedActivities.add(activity);
                            } else {
                              _selectedActivities.remove(activity);
                            }
                          });
                        },
                        selectedColor: green.withValues(alpha: 0.2),
                        checkmarkColor: green,
                        labelStyle: TextStyle(
                          color: selected ? green : Colors.black87,
                          fontWeight:
                              selected ? FontWeight.w600 : FontWeight.normal,
                        ),
                        backgroundColor: Colors.white,
                        side: BorderSide(
                          color: selected
                              ? green.withValues(alpha: 0.5)
                              : Colors.black12,
                        ),
                      );
                    }).toList(),
                  ),
                ],
              ),
            ),
          ),

          // Sticky Save-Bar mit Live-Summary
          Container(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border(
                top: BorderSide(
                  color: Colors.black.withValues(alpha: 0.06),
                ),
              ),
            ),
            child: SafeArea(
              top: false,
              child: Row(
                children: [
                  if (_canSave)
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            _formatHours(_hours!),
                            style: const TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.bold,
                              color: green,
                              height: 1.0,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${_selectedActivities.length} Tätigkeit${_selectedActivities.length == 1 ? '' : 'en'}',
                            style: const TextStyle(
                              fontSize: 12,
                              color: Colors.black54,
                            ),
                          ),
                        ],
                      ),
                    )
                  else
                    const Expanded(
                      child: Text(
                        'Stunden und Tätigkeiten wählen',
                        style: TextStyle(
                          fontSize: 14,
                          color: Colors.black45,
                        ),
                      ),
                    ),
                  const SizedBox(width: 12),
                  SizedBox(
                    height: 52,
                    child: ElevatedButton.icon(
                      onPressed: (_isSaving || !_canSave) ? null : _save,
                      icon: _isSaving
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Icon(Icons.check),
                      label: const Text(
                        'Speichern',
                        style: TextStyle(fontSize: 16),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: green,
                        foregroundColor: Colors.white,
                        disabledBackgroundColor: Colors.black12,
                        padding: const EdgeInsets.symmetric(horizontal: 22),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _label(String text) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 15,
        fontWeight: FontWeight.w600,
        color: Colors.black54,
      ),
    );
  }

  Widget _buildPatientDropdown() {
    final patientsAsync = ref.watch(patientsProvider);

    return patientsAsync.when(
      loading: () => _selectBoxPlaceholder(
        const SizedBox(
          height: 20,
          width: 20,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      ),
      error: (e, _) => _selectBoxPlaceholder(
        Text(
          'Patienten konnten nicht geladen werden',
          style: TextStyle(color: Colors.red[700]),
        ),
      ),
      data: (patients) {
        if (patients.isEmpty) {
          return _selectBoxPlaceholder(
            const Text(
              'Keine Patienten verfügbar',
              style: TextStyle(color: Colors.black54),
            ),
          );
        }

        // Fallback: wenn preselected patient nicht in Liste ist, ersten nehmen
        final selected = _selectedPatient != null &&
                patients.any((p) => p.patientId == _selectedPatient!.patientId)
            ? patients.firstWhere(
                (p) => p.patientId == _selectedPatient!.patientId,
              )
            : patients.first;

        // Einmalig synchronisieren
        if (_selectedPatient?.patientId != selected.patientId) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) setState(() => _selectedPatient = selected);
          });
        }

        return Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Colors.black12),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: DropdownButton<int>(
            value: selected.patientId,
            isExpanded: true,
            underline: const SizedBox.shrink(),
            style: const TextStyle(fontSize: 17, color: Colors.black87),
            items: patients
                .map(
                  (p) => DropdownMenuItem(
                    value: p.patientId,
                    child: Text(p.displayName),
                  ),
                )
                .toList(),
            onChanged: (id) {
              if (id != null) {
                setState(() {
                  _selectedPatient =
                      patients.firstWhere((p) => p.patientId == id);
                });
              }
            },
          ),
        );
      },
    );
  }

  Widget _selectBoxPlaceholder(Widget child) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.black12),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      child: child,
    );
  }
}
