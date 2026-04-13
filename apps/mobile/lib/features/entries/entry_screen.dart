import 'package:flutter/material.dart';

class EntryScreen extends StatefulWidget {
  final String? preselectedPatient;

  const EntryScreen({super.key, this.preselectedPatient});

  @override
  State<EntryScreen> createState() => _EntryScreenState();
}

class _EntryScreenState extends State<EntryScreen> {
  static const List<String> _patients = [
    'Anna Berger',
    'Heinrich Kaiser',
    'Margarete Huber',
    'Wilhelm Schäfer',
  ];

  // Häufigste Stundenwerte als Quick-Presets
  static const List<double> _hourPresets = [
    0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 6.0,
  ];

  static const List<String> _activities = [
    'Hauswirtschaft',
    'Körperpflege',
    'Arztbegleitung',
    'Gedächtnistraining',
    'Vorlesen',
    'Spaziergang',
    'Gesellschaft',
    'Einkaufen',
    'Kochen',
    'Wäsche',
  ];

  late String _selectedPatient;
  DateTime _selectedDate = DateTime.now();
  double? _hours;
  final Set<String> _selectedActivities = {};
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    _selectedPatient = widget.preselectedPatient ?? _patients[0];
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
    await Future.delayed(const Duration(milliseconds: 600));
    if (!mounted) return;
    setState(() => _isSaving = false);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'Einsatz gespeichert: ${_formatHours(_hours!)} bei $_selectedPatient',
        ),
      ),
    );
    Navigator.of(context).pop();
  }

  bool get _canSave => _hours != null && _selectedActivities.isNotEmpty;

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
                  Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: Colors.black12),
                    ),
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: DropdownButton<String>(
                      value: _selectedPatient,
                      isExpanded: true,
                      underline: const SizedBox.shrink(),
                      style: const TextStyle(
                        fontSize: 17,
                        color: Colors.black87,
                      ),
                      items: _patients
                          .map(
                            (p) => DropdownMenuItem(
                              value: p,
                              child: Text(p),
                            ),
                          )
                          .toList(),
                      onChanged: (v) {
                        if (v != null) setState(() => _selectedPatient = v);
                      },
                    ),
                  ),

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
}
