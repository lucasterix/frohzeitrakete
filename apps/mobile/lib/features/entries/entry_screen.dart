import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_exception.dart';
import '../../core/models/entry.dart';
import '../../core/offline/connectivity_provider.dart';
import '../../core/offline/offline_queue.dart';
import '../../core/models/mobile_patient.dart';
import '../../core/models/signature_event.dart';
import '../../core/models/user_home.dart';
import '../../core/providers.dart';
import '../../shared/widgets/address_autocomplete.dart';
import '../signatures/signature_screen.dart';

class EntryScreen extends ConsumerStatefulWidget {
  final MobilePatient? preselectedPatient;

  const EntryScreen({super.key, this.preselectedPatient});

  @override
  ConsumerState<EntryScreen> createState() => _EntryScreenState();
}

class _EntryScreenState extends ConsumerState<EntryScreen> {

  // Alle 0.5h-Schritte von 0.5 bis 8.0
  static const List<double> _hourPresets = [
    0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0,
    4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0,
  ];

  static const List<String> _activities = [
    'Alltagshilfe',
    'Gespräche/Aktivierung',
    'Begleitung',
  ];

  EntryType _entryType = EntryType.patient;
  final _categoryLabelCtrl = TextEditingController();
  MobilePatient? _selectedPatient;
  DateTime _selectedDate = DateTime.now();
  double? _hours;
  final Set<String> _selectedActivities = {};
  bool _isSaving = false;

  // Trip tracking state
  bool _isFirstEntryToday = false;
  // _tripInfoLoaded gibt es nicht mehr — die Trip-Sektion rendert sofort
  // und die Daten kommen async per setState rein.
  UserHome? _userHome;
  bool _startFromHome = true;
  String? _startAddress; // confirmed ORS label
  final List<String?> _intermediateStopLabels = []; // confirmed labels

  // Home-Commute-State: nur genutzt wenn _entryType == home_commute.
  String? _homeCommuteStartAddress;

  @override
  void initState() {
    super.initState();
    _selectedPatient = widget.preselectedPatient;
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadTripInfo());
  }

  @override
  void dispose() {
    _categoryLabelCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadTripInfo() async {
    try {
      final repo = ref.read(entryRepositoryProvider);
      // Beide Calls parallel, jeder updated den State sobald er fertig
      // ist — kein Blocking auf das langsamere von beiden.
      unawaited(
        repo.isFirstEntryToday().then((v) {
          if (mounted) setState(() => _isFirstEntryToday = v);
        }),
      );
      unawaited(
        repo.getUserHome().then((v) {
          if (mounted) setState(() => _userHome = v);
        }),
      );
    } catch (_) {
      // ignored — Trip-Section rendert auch ohne diese Daten
    }
  }

  TripInput? _buildTripInput() {
    // Nur für Patient-Einsätze Trip-Info senden
    if (_entryType != EntryType.patient) return null;
    final hasStart = _isFirstEntryToday &&
        (_startFromHome ||
            (_startAddress != null && _startAddress!.isNotEmpty));
    final stops = _intermediateStopLabels
        .where((s) => s != null && s.isNotEmpty)
        .cast<String>()
        .toList();
    if (!hasStart && stops.isEmpty) return null;
    return TripInput(
      startFromHome: _startFromHome,
      startAddress: _startFromHome ? null : _startAddress,
      intermediateStops: stops,
    );
  }

  void _addIntermediateStop() {
    setState(() => _intermediateStopLabels.add(null));
  }

  void _removeIntermediateStop(int index) {
    setState(() {
      _intermediateStopLabels.removeAt(index);
    });
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
    // TEST-MODUS: Vergangenheit und Zukunft erlaubt damit alles
    // durchgespielt werden kann. Vor Live-Betrieb wieder auf "nur
    // heute" zurücksetzen.
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(DateTime.now().year - 2),
      lastDate: DateTime(DateTime.now().year + 2),
    );
    if (picked != null) setState(() => _selectedDate = picked);
  }

  Future<void> _save() async {
    if (_entryType == EntryType.patient) {
      if (_selectedPatient == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Bitte Patient wählen.')),
        );
        return;
      }
    } else if (_entryType == EntryType.homeCommute) {
      if (_homeCommuteStartAddress == null ||
          _homeCommuteStartAddress!.trim().isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Bitte Start-Adresse für die Heimfahrt wählen.'),
          ),
        );
        return;
      }
    } else {
      if (_categoryLabelCtrl.text.trim().isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Bitte Beschreibung angeben (z.B. "${_entryType == EntryType.training ? 'Demenz-Schulung' : 'Monatsmeeting'}")',
            ),
          ),
        );
        return;
      }
    }
    if (_hours == null && _entryType != EntryType.homeCommute) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Bitte Stunden wählen.')),
      );
      return;
    }
    if (_entryType == EntryType.patient && _selectedActivities.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Bitte mindestens eine Tätigkeit.')),
      );
      return;
    }

    // Budget-Check nur für Patient-Einsätze und nicht-Privat
    if (_entryType == EntryType.patient && !_selectedPatient!.isPrivat) {
      final budget = await ref.read(
        pattiBudgetProvider(
          PattiBudgetParams(
            patientId: _selectedPatient!.patientId,
            year: _selectedDate.year,
          ),
        ).future,
      );
      // Budget-Check gegen Gesamt-Reststunden (BL + VP) — der Backend-
      // Sync sucht sich später automatisch den richtigen Topf.
      final remaining = budget.careServiceRemainingHours +
          budget.respiteCareRemainingHours;
      if (_hours! > remaining) {
        final accepted = await _showOverBudgetConfirm(
          remaining: remaining,
          requested: _hours!,
        );
        if (accepted != true) return;
      } else if (remaining - _hours! < 2.0) {
        if (!mounted) return;
        // Restbudget wird nach diesem Einsatz sehr knapp → Info
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Achtung: nur noch ${_formatHours(remaining - _hours!)} Restbudget '
              'nach diesem Einsatz',
            ),
            backgroundColor: Colors.orange,
            duration: const Duration(seconds: 4),
          ),
        );
      }
    }

    setState(() => _isSaving = true);

    try {
      await ref.read(entryRepositoryProvider).createOrUpdateEntry(
            patientId: _entryType == EntryType.patient
                ? _selectedPatient?.patientId
                : null,
            entryType: _entryType,
            categoryLabel: _entryType == EntryType.patient ||
                    _entryType == EntryType.homeCommute
                ? null
                : _categoryLabelCtrl.text.trim(),
            entryDate: _selectedDate,
            hours: _hours ?? 0.0,
            activities: _entryType == EntryType.patient
                ? _selectedActivities.toList()
                : const [],
            trip: _buildTripInput(),
            homeCommuteStartAddress: _entryType == EntryType.homeCommute
                ? _homeCommuteStartAddress
                : null,
          );

      // Alle Provider die jetzt stale sind invalidieren, damit PatientDetail
      // und Home nach Rückkehr die echten neuen Zahlen aus Patti ziehen.
      ref.invalidate(hoursSummaryProvider);
      ref.invalidate(patientEntriesProvider);
      ref.invalidate(myEntriesProvider);
      ref.invalidate(pattiBudgetProvider);
      ref.invalidate(mySignaturesProvider);

      if (!mounted) return;

      // Signatur nur für Patient-Einsätze
      if (_entryType == EntryType.patient) {
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
      } else {
        // Office/Training/Heimfahrt: direkt zurück mit Erfolgs-SnackBar
        Navigator.of(context).pop();
        final msg = _entryType == EntryType.homeCommute
            ? 'Heimfahrt gespeichert'
            : '${_entryType.label} gespeichert: ${_formatHours(_hours ?? 0)}';
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              msg,
            ),
          ),
        );
      }
      return;
    } on ApiException catch (e) {
      if (!mounted) return;
      // Netzwerk-Fehler → Offline-Queue, damit der Einsatz nicht verloren geht.
      // Patient-Einsätze brauchen Signatur, das geht offline nicht — da bleiben
      // wir im Fehler-Modus und bitten den User den Einsatz später nochmal
      // abzusenden sobald Netz da ist.
      if (e.isNetworkError && _entryType != EntryType.patient) {
        final payload = <String, dynamic>{
          'entry_type': _entryType.apiValue,
          'category_label': _categoryLabelCtrl.text.trim(),
          'entry_date':
              '${_selectedDate.year}-${_selectedDate.month.toString().padLeft(2, '0')}-${_selectedDate.day.toString().padLeft(2, '0')}',
          'hours': _hours,
          'activities': const <String>[],
          'note': null,
        }..removeWhere((_, v) => v == null);
        await OfflineQueue.enqueue(payload);
        if (!mounted) return;
        ref.invalidate(pendingOfflineCountProvider);
        setState(() => _isSaving = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Kein Netz — Einsatz offline gespeichert. Wird automatisch '
              'übertragen sobald du wieder online bist.',
            ),
            backgroundColor: Colors.orange,
            duration: Duration(seconds: 4),
          ),
        );
        Navigator.of(context).pop();
        return;
      }
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

  bool get _canSave {
    if (_entryType == EntryType.homeCommute) {
      return _homeCommuteStartAddress != null &&
          _homeCommuteStartAddress!.trim().isNotEmpty;
    }
    if (_hours == null) return false;
    if (_entryType == EntryType.patient) {
      return _selectedPatient != null && _selectedActivities.isNotEmpty;
    }
    return _categoryLabelCtrl.text.trim().isNotEmpty;
  }

  Future<bool?> _showOverBudgetConfirm({
    required double remaining,
    required double requested,
  }) async {
    return showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        icon: const Icon(
          Icons.warning_amber_rounded,
          color: Colors.orange,
          size: 48,
        ),
        title: const Text(
          'Pflegesachleistung aufgebraucht',
          textAlign: TextAlign.center,
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Das Restbudget für ${_selectedPatient!.displayName} beträgt '
              'nur noch ${_formatHours(remaining)}, aber dieser Einsatz '
              'würde ${_formatHours(requested)} dauern.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.orange.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Text(
                'Der Patient muss bestätigen dass er die zusätzlichen '
                'Stunden selbst bezahlen möchte. Die Pflegekasse übernimmt '
                'diese Stunden NICHT.',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Abbrechen'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.orange,
              foregroundColor: Colors.white,
            ),
            child: const Text('Patient hat bestätigt'),
          ),
        ],
      ),
    );
  }

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
                  // Typ-Selector
                  _label('Art des Einsatzes'),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: EntryType.values.map((t) {
                      final selected = _entryType == t;
                      return ChoiceChip(
                        label: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(t.icon),
                            const SizedBox(width: 4),
                            Text(t.label),
                          ],
                        ),
                        selected: selected,
                        onSelected: (_) => setState(() {
                          _entryType = t;
                          if (t != EntryType.patient) {
                            _selectedActivities.clear();
                          }
                        }),
                      );
                    }).toList(),
                  ),

                  const SizedBox(height: 20),

                  // Patient-Dropdown oder Label-Field oder Home-Commute-Picker
                  if (_entryType == EntryType.patient) ...[
                    _label('Patient'),
                    const SizedBox(height: 8),
                    _buildPatientDropdown(),
                  ] else if (_entryType == EntryType.homeCommute) ...[
                    _label('Start-Adresse (Patient oder frei)'),
                    const SizedBox(height: 8),
                    _HomeCommuteStartPicker(
                      initialValue: _homeCommuteStartAddress ?? '',
                      onPicked: (v) =>
                          setState(() => _homeCommuteStartAddress = v),
                    ),
                    const SizedBox(height: 8),
                    if (_userHome != null)
                      Row(
                        children: [
                          const Icon(
                            Icons.flag_outlined,
                            size: 16,
                            color: Colors.black54,
                          ),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              'Ziel: ${_userHome!.addressLine}',
                              style: const TextStyle(
                                fontSize: 12,
                                color: Colors.black54,
                              ),
                            ),
                          ),
                        ],
                      )
                    else
                      const Text(
                        'Home-Adresse nicht gesetzt — bitte in den '
                        'Einstellungen hinterlegen.',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.orange,
                        ),
                      ),
                  ] else ...[
                    _label(_entryType == EntryType.training
                        ? 'Fortbildungs-Titel'
                        : 'Beschreibung'),
                    const SizedBox(height: 8),
                    TextField(
                      controller: _categoryLabelCtrl,
                      onChanged: (_) => setState(() {}),
                      decoration: InputDecoration(
                        hintText: _entryType == EntryType.training
                            ? 'z.B. Demenz verstehen'
                            : _entryType == EntryType.office
                                ? 'z.B. Monats-Teamsitzung'
                                : 'Worum ging es?',
                        filled: true,
                        fillColor: Colors.white,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: BorderSide.none,
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: const BorderSide(color: Colors.black12),
                        ),
                      ),
                    ),
                  ],

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

                  // Stunden-Presets (nicht für Heimfahrt — da geht's nur um km)
                  if (_entryType != EntryType.homeCommute) ...[
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
                  ],

                  if (_entryType == EntryType.patient) ...[
                    const SizedBox(height: 24),
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
                        final selected =
                            _selectedActivities.contains(activity);
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
                            fontWeight: selected
                                ? FontWeight.w600
                                : FontWeight.normal,
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

                    const SizedBox(height: 24),
                    _buildTripSection(),
                  ],
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
                            _entryType == EntryType.homeCommute
                                ? 'Heimfahrt'
                                : _formatHours(_hours ?? 0),
                            style: const TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.bold,
                              color: green,
                              height: 1.0,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            _entryType == EntryType.homeCommute
                                ? (_homeCommuteStartAddress ?? '')
                                : '${_selectedActivities.length} Tätigkeit${_selectedActivities.length == 1 ? '' : 'en'}',
                            style: const TextStyle(
                              fontSize: 12,
                              color: Colors.black54,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
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

  Widget _buildTripSection() {
    const green = Color(0xFF4F8A5B);
    // Kein blockierender Loading-Indicator mehr — die Trip-Sektion
    // rendert sofort. Wenn die Home-Adresse oder isFirstEntryToday
    // noch nicht da sind, läuft der API-Call im Hintergrund weiter
    // und der State wird per setState aktualisiert.

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _label('Fahrtkosten'),
        const SizedBox(height: 10),

        // Start-Adresse – nur beim ersten Einsatz des Tages
        if (_isFirstEntryToday) ...[
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.black12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Wo bist du heute gestartet?',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: ChoiceChip(
                        label: const Text('Zuhause'),
                        selected: _startFromHome,
                        onSelected: (_) =>
                            setState(() => _startFromHome = true),
                        selectedColor: green.withValues(alpha: 0.2),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: ChoiceChip(
                        label: const Text('Andere Adresse'),
                        selected: !_startFromHome,
                        onSelected: (_) =>
                            setState(() => _startFromHome = false),
                        selectedColor: green.withValues(alpha: 0.2),
                      ),
                    ),
                  ],
                ),
                if (_startFromHome && _userHome != null) ...[
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      const Icon(
                        Icons.home_outlined,
                        size: 16,
                        color: Colors.black54,
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          _userHome!.addressLine,
                          style: const TextStyle(
                            fontSize: 13,
                            color: Colors.black54,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
                if (_startFromHome && _userHome == null) ...[
                  const SizedBox(height: 10),
                  const Text(
                    'Home-Adresse nicht bekannt – fällt zurück auf '
                    '"Andere Adresse", bitte manuell eintragen.',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.orange,
                    ),
                  ),
                ],
                if (!_startFromHome) ...[
                  const SizedBox(height: 10),
                  _HomeCommuteStartPicker(
                    initialValue: _startAddress ?? '',
                    onPicked: (label) {
                      setState(
                          () => _startAddress = label.isEmpty ? null : label);
                    },
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 12),
        ],

        // Zwischenfahrten während Einsatz
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Colors.black12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Fahrten während Einsatz',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  TextButton.icon(
                    onPressed: _addIntermediateStop,
                    icon: const Icon(Icons.add, size: 18),
                    label: const Text('Hinzufügen'),
                  ),
                ],
              ),
              const Padding(
                padding: EdgeInsets.only(bottom: 8),
                child: Text(
                  'z.B. Patient zum Arzt fahren. Nur die Hinfahrt wird '
                  'erfasst — für die Rückfahrt legst du ggf. einen neuen '
                  'Eintrag an.',
                  style: TextStyle(fontSize: 12, color: Colors.black54),
                ),
              ),
              if (_intermediateStopLabels.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 6),
                  child: Text(
                    'Keine Zwischenfahrten',
                    style: TextStyle(
                      fontSize: 13,
                      color: Colors.black38,
                      fontStyle: FontStyle.italic,
                    ),
                  ),
                )
              else
                ..._intermediateStopLabels.asMap().entries.map(
                      (e) => Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Row(
                          children: [
                            Expanded(
                              child: AddressAutocomplete(
                                label: 'Ziel ${e.key + 1}',
                                hint: 'Adresse tippen…',
                                initialValue: e.value ?? '',
                                onAddressSelected: (label) {
                                  setState(() {
                                    _intermediateStopLabels[e.key] = label;
                                  });
                                },
                                onCleared: () => setState(() {
                                  _intermediateStopLabels[e.key] = null;
                                }),
                              ),
                            ),
                            IconButton(
                              icon: const Icon(
                                Icons.close,
                                color: Colors.black54,
                                size: 18,
                              ),
                              onPressed: () => _removeIntermediateStop(e.key),
                            ),
                          ],
                        ),
                      ),
                    ),
            ],
          ),
        ),
      ],
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

/// Picker für die Start-Adresse bei Heimfahrt-Einträgen (oder wo sonst eine
/// "andere Adresse" gebraucht wird): zeigt alle Patienten des Users als
/// ChoiceChips an. Tippt der User auf einen Patienten, wird dessen
/// `addressLine` als Wert übernommen. Parallel kann er über das Freitext-
/// Feld eine beliebige Adresse tippen und per Autocomplete bestätigen.
class _HomeCommuteStartPicker extends ConsumerStatefulWidget {
  final String initialValue;
  final void Function(String) onPicked;

  const _HomeCommuteStartPicker({
    required this.initialValue,
    required this.onPicked,
  });

  @override
  ConsumerState<_HomeCommuteStartPicker> createState() =>
      _HomeCommuteStartPickerState();
}

class _HomeCommuteStartPickerState
    extends ConsumerState<_HomeCommuteStartPicker> {
  int? _selectedPatientId;
  String _currentLabel = '';

  @override
  void initState() {
    super.initState();
    _currentLabel = widget.initialValue;
  }

  @override
  Widget build(BuildContext context) {
    const green = Color(0xFF4F8A5B);
    final patientsAsync = ref.watch(patientsProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        patientsAsync.when(
          loading: () => const SizedBox(
            height: 32,
            child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
          ),
          error: (e, _) => Text(
            'Konnte Patienten nicht laden: $e',
            style: const TextStyle(fontSize: 11, color: Colors.red),
          ),
          data: (patients) {
            if (patients.isEmpty) return const SizedBox.shrink();
            return Wrap(
              spacing: 6,
              runSpacing: 6,
              children: patients.map((p) {
                final selected = _selectedPatientId == p.patientId;
                final addr = p.addressLine ?? '';
                final canPick = addr.isNotEmpty;
                return ChoiceChip(
                  label: Text(
                    p.displayName,
                    style: const TextStyle(fontSize: 12),
                  ),
                  selected: selected,
                  selectedColor: green.withValues(alpha: 0.2),
                  onSelected: canPick
                      ? (_) {
                          setState(() {
                            _selectedPatientId = p.patientId;
                            _currentLabel = addr;
                          });
                          widget.onPicked(addr);
                        }
                      : null,
                );
              }).toList(),
            );
          },
        ),
        const SizedBox(height: 10),
        const Text(
          'oder eine freie Adresse eingeben:',
          style: TextStyle(fontSize: 11, color: Colors.black54),
        ),
        const SizedBox(height: 6),
        AddressAutocomplete(
          label: 'Freie Adresse',
          hint: 'z.B. Musterstraße 12, 37073 Göttingen',
          initialValue: _currentLabel,
          onAddressSelected: (label) {
            setState(() {
              _selectedPatientId = null;
              _currentLabel = label;
            });
            widget.onPicked(label);
          },
          onCleared: () {
            setState(() {
              _selectedPatientId = null;
              _currentLabel = '';
            });
            widget.onPicked('');
          },
        ),
      ],
    );
  }
}
