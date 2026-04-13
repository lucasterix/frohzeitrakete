import 'package:flutter/material.dart';
import 'patient_detail_screen.dart';
import '../settings/settings_screen.dart';
import '../../shared/widgets/notification_bell.dart';

class PatientsScreen extends StatefulWidget {
  const PatientsScreen({super.key});

  @override
  State<PatientsScreen> createState() => _PatientsScreenState();
}

class _PatientsScreenState extends State<PatientsScreen> {
  final _searchController = TextEditingController();
  String _query = '';

  static const List<Map<String, dynamic>> _patients = [
    {
      'name': 'Anna Berger',
      'city': 'Berlin',
      'status': 'es fehlt Versicherungsnummer',
      'address': 'Musterstraße 12, 10115 Berlin',
      'birthday': '12.03.1948',
      'insuranceNumber': 'fehlt',
      'careInsurance': 'AOK Nordost',
      'phone': '030 12345678',
      'remainingHours': 18.5,
      'usedHours': 11.5,
      'pflegegrad': 3,
      'vpState': 'none', // none | signed | approved
      'vpMonth': '',
    },
    {
      'name': 'Heinrich Kaiser',
      'city': 'Hamburg',
      'status': 'alles vollständig',
      'address': 'Beispielweg 4, 20095 Hamburg',
      'birthday': '01.08.1951',
      'insuranceNumber': '4711 8899 00',
      'careInsurance': 'TK',
      'phone': '040 555123',
      'remainingHours': 9.0,
      'usedHours': 21.0,
      'pflegegrad': 4,
      'vpState': 'signed',
      'vpMonth': 'April 2026',
    },
    {
      'name': 'Margarete Huber',
      'city': 'München',
      'status': 'Dokument fehlt',
      'address': 'Lindenweg 8, 80331 München',
      'birthday': '22.11.1944',
      'insuranceNumber': '5512 7788 01',
      'careInsurance': 'Barmer',
      'phone': '089 777999',
      'remainingHours': 4.0,
      'usedHours': 26.0,
      'pflegegrad': 1,
      'vpState': 'none',
      'vpMonth': '',
    },
    {
      'name': 'Wilhelm Schäfer',
      'city': 'Köln',
      'status': 'alles vollständig',
      'address': 'Rosenstraße 17, 50667 Köln',
      'birthday': '05.06.1939',
      'insuranceNumber': '9988 1122 03',
      'careInsurance': 'AOK Rheinland',
      'phone': '0221 445566',
      'remainingHours': 12.0,
      'usedHours': 18.0,
      'pflegegrad': 5,
      'vpState': 'approved',
      'vpMonth': 'März 2026',
    },
  ];

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  List<Map<String, dynamic>> get _filtered {
    if (_query.isEmpty) return _patients;
    final q = _query.toLowerCase();
    return _patients.where((p) {
      return (p['name'] as String).toLowerCase().contains(q) ||
          (p['city'] as String).toLowerCase().contains(q) ||
          (p['address'] as String).toLowerCase().contains(q);
    }).toList();
  }

  String _formatHours(double h) {
    final full = h.truncate();
    final half = (h - full) >= 0.5;
    return '$full,${half ? '5' : '0'} h';
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Spacer(),
              const NotificationBell(),
              IconButton(
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => const SettingsScreen(),
                    ),
                  );
                },
                icon: const Icon(Icons.settings_outlined),
              ),
            ],
          ),
          const SizedBox(height: 4),
          const Text(
            'Meine Patienten',
            style: TextStyle(
              fontSize: 32,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 18),
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: Colors.black12),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
            child: Row(
              children: [
                const Icon(Icons.search, color: Colors.black54),
                const SizedBox(width: 10),
                Expanded(
                  child: TextField(
                    controller: _searchController,
                    onChanged: (v) => setState(() => _query = v),
                    decoration: const InputDecoration(
                      hintText: 'Patientensuche',
                      border: InputBorder.none,
                    ),
                  ),
                ),
                if (_query.isNotEmpty)
                  IconButton(
                    onPressed: () {
                      _searchController.clear();
                      setState(() => _query = '');
                    },
                    icon: const Icon(Icons.close, color: Colors.black54),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          Expanded(
            child: filtered.isEmpty
                ? const Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.search_off,
                          size: 48,
                          color: Colors.black26,
                        ),
                        SizedBox(height: 12),
                        Text(
                          'Keine Patienten gefunden',
                          style: TextStyle(
                            fontSize: 16,
                            color: Colors.black54,
                          ),
                        ),
                      ],
                    ),
                  )
                : ListView.separated(
                    itemCount: filtered.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 12),
                    itemBuilder: (context, index) {
                      final patient = filtered[index];
                      return _PatientCard(
                        patient: patient,
                        remainingHoursLabel:
                            _formatHours(patient['remainingHours'] as double),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class _PatientCard extends StatelessWidget {
  final Map<String, dynamic> patient;
  final String remainingHoursLabel;

  const _PatientCard({
    required this.patient,
    required this.remainingHoursLabel,
  });

  @override
  Widget build(BuildContext context) {
    const green = Color(0xFF4F8A5B);
    final hasWarning = patient['status'] != 'alles vollständig';
    final pflegegrad = patient['pflegegrad'] as int;
    final vpState = patient['vpState'] as String;
    final vpActive = vpState == 'signed' || vpState == 'approved';
    final name = patient['name'] as String;
    final city = patient['city'] as String;

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: () {
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => PatientDetailScreen(
                name: name,
                address: patient['address'] as String,
                birthday: patient['birthday'] as String,
                insuranceNumber: patient['insuranceNumber'] as String,
                careInsurance: patient['careInsurance'] as String,
                phone: patient['phone'] as String,
                remainingHours: patient['remainingHours'] as double,
                usedHours: patient['usedHours'] as double,
                pflegegrad: pflegegrad,
                vpState: vpState,
                vpMonth: patient['vpMonth'] as String,
              ),
            ),
          );
        },
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: Colors.black12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    radius: 26,
                    backgroundColor: green.withValues(alpha: 0.12),
                    child: Text(
                      name
                          .split(' ')
                          .map((w) => w.isNotEmpty ? w[0] : '')
                          .take(2)
                          .join(),
                      style: const TextStyle(
                        color: green,
                        fontWeight: FontWeight.bold,
                        fontSize: 18,
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          name,
                          style: const TextStyle(
                            fontSize: 19,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Row(
                          children: [
                            const Icon(
                              Icons.location_on_outlined,
                              size: 14,
                              color: Colors.black54,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              city,
                              style: const TextStyle(
                                fontSize: 14,
                                color: Colors.black54,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right, color: Colors.black26),
                ],
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  _chip(
                    label: 'PG $pflegegrad',
                    color: green,
                  ),
                  const SizedBox(width: 8),
                  _chip(
                    label: remainingHoursLabel,
                    color: green,
                    icon: Icons.schedule,
                  ),
                  const SizedBox(width: 8),
                  if (vpActive)
                    _chip(
                      label: 'VP',
                      color: green,
                      icon: Icons.check_circle,
                      filled: true,
                    )
                  else if (hasWarning)
                    _chip(
                      label: 'Prüfen',
                      color: Colors.orange,
                      icon: Icons.warning_amber_rounded,
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _chip({
    required String label,
    required Color color,
    IconData? icon,
    bool filled = false,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: filled ? color : color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(
              icon,
              size: 14,
              color: filled ? Colors.white : color,
            ),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: filled ? Colors.white : color,
            ),
          ),
        ],
      ),
    );
  }
}
