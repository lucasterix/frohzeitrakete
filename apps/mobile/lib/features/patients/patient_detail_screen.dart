import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/mobile_patient.dart';
import '../../core/providers.dart';
import '../../shared/widgets/notification_bell.dart';
import '../entries/entry_screen.dart';
import '../entries/entry_detail_screen.dart';
import '../entries/month_overview_screen.dart';
import '../requests/document_detail_screen.dart';
import '../settings/settings_screen.dart';
import '../vp_antrag/vp_antrag_screen.dart';

class PatientDetailScreen extends ConsumerStatefulWidget {
  final MobilePatient patient;

  const PatientDetailScreen({super.key, required this.patient});

  @override
  ConsumerState<PatientDetailScreen> createState() =>
      _PatientDetailScreenState();
}

class _PatientDetailScreenState extends ConsumerState<PatientDetailScreen> {
  // MOCK: VP-Antrag-Status kommt weiterhin aus lokalem Mock-State.
  // Reststunden + verbrauchte Stunden kommen jetzt live aus Patti via
  // pattiBudgetProvider (Pflegesachleistung + Verhinderungspflege).
  late String _vpState; // none | signed | approved
  late String _vpMonth;

  static const List<Map<String, dynamic>> _mockEntries = [
    {
      'date': '13.04.2026',
      'hours': 2.0,
      'activities': ['Spaziergänge', 'Gedächtnistraining'],
      'signed': false,
    },
    {
      'date': '12.04.2026',
      'hours': 2.5,
      'activities': ['Hauswirtschaft', 'Vorlesen'],
      'signed': true,
    },
    {
      'date': '09.04.2026',
      'hours': 1.5,
      'activities': ['Körperpflege', 'Gesellschaft leisten'],
      'signed': false,
    },
  ];

  @override
  void initState() {
    super.initState();
    // Deterministisches VP-State-Mock aus patient_id (bis Backend diese Info liefert)
    final seed = widget.patient.patientId;
    final vpStates = ['none', 'signed', 'approved', 'none'];
    _vpState = widget.patient.pflegegradInt >= 2
        ? vpStates[seed % vpStates.length]
        : 'none';
    _vpMonth = _vpState != 'none' ? 'April 2026' : '';
  }

  String _formatHours(double h) {
    final full = h.truncate();
    final half = (h - full) >= 0.5;
    return '$full,${half ? '5' : '0'} h';
  }

  Future<void> _openVpAntrag() async {
    if (widget.patient.pflegegradInt < 2) return;
    final result = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => VpAntragScreen(
          patient: widget.patient,
        ),
      ),
    );
    if (result == true && mounted) {
      final now = DateTime.now();
      const monthNames = [
        'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
        'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
      ];
      setState(() {
        _vpState = 'signed';
        _vpMonth = '${monthNames[now.month - 1]} ${now.year}';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    const green = Color(0xFF4F8A5B);
    final patient = widget.patient;
    final pflegegrad = patient.pflegegradInt;
    final now = DateTime.now();
    final budgetAsync = ref.watch(
      pattiBudgetProvider(
        PattiBudgetParams(
          patientId: patient.patientId,
          year: now.year,
        ),
      ),
    );
    final lockAsync = ref.watch(
      hoursSummaryProvider(
        HoursSummaryParams(
          patientId: patient.patientId,
          year: now.year,
          month: now.month,
        ),
      ),
    );

    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => EntryScreen(preselectedPatient: patient),
            ),
          );
        },
        icon: const Icon(Icons.add),
        label: const Text('Einsatz erfassen'),
        backgroundColor: green,
        foregroundColor: Colors.white,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(0, 0, 0, 100),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                child: Row(
                  children: [
                    const BackButton(),
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
              ),

              // Hero Avatar + Name
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 0),
                child: Row(
                  children: [
                    Container(
                      width: 72,
                      height: 72,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [green, green.withValues(alpha: 0.7)],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Center(
                        child: Text(
                          patient.initials,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 26,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            patient.displayName,
                            style: const TextStyle(
                              fontSize: 24,
                              fontWeight: FontWeight.bold,
                              height: 1.2,
                            ),
                          ),
                          const SizedBox(height: 6),
                          if (pflegegrad > 0)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 4,
                              ),
                              decoration: BoxDecoration(
                                color: green.withValues(alpha: 0.12),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                'Pflegegrad $pflegegrad',
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: green,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 20),

              // Reststunden Hero (live aus Patti via Backend)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: _buildBudgetHero(budgetAsync, lockAsync),
              ),

              const SizedBox(height: 24),

              // Dokumente
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 20),
                child: Text(
                  'Dokumente',
                  style:
                      TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
                ),
              ),
              const SizedBox(height: 12),

              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: _documentCard(
                  icon: Icons.description_outlined,
                  title: 'Leistungsnachweis',
                  subtitle: 'Aktueller Monat · bereit zur Unterschrift',
                  statusColor: green,
                  statusLabel: 'OFFEN',
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => MonthOverviewScreen(
                          patient: patient,
                          monthLabel: 'April 2026',
                        ),
                      ),
                    );
                  },
                ),
              ),

              const SizedBox(height: 10),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: _vpAntragCard(),
              ),

              const SizedBox(height: 10),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: _documentCard(
                  icon: Icons.folder_outlined,
                  title: 'Pflegeumwandlung',
                  subtitle: 'Antrag auf Umwandlung von Pflegeleistungen',
                  statusColor: Colors.black54,
                  statusLabel: 'VERFÜGBAR',
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => DocumentDetailScreen(
                          title: 'Pflegeumwandlung',
                          status: 'bereit',
                          patient: patient,
                        ),
                      ),
                    );
                  },
                ),
              ),

              const SizedBox(height: 28),

              // Kontaktdaten
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 20),
                child: Text(
                  'Kontaktdaten',
                  style:
                      TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
                ),
              ),
              const SizedBox(height: 12),

              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: Colors.black12),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _kvRow(
                        label: 'Adresse',
                        value: patient.addressLine ?? '—',
                      ),
                      if (patient.city != null) ...[
                        const SizedBox(height: 8),
                        _kvRow(label: 'Stadt', value: patient.city!),
                      ],
                      const SizedBox(height: 8),
                      _kvRow(
                        label: 'Patient-ID',
                        value: '${patient.patientId}',
                      ),
                      if (patient.startedAt != null) ...[
                        const SizedBox(height: 8),
                        _kvRow(
                          label: 'Betreuung seit',
                          value: patient.startedAt!.split('T').first,
                        ),
                      ],
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 28),

              // Letzte Einsätze (MOCK)
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 20),
                child: Text(
                  'Letzte Einsätze',
                  style:
                      TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
                ),
              ),
              const SizedBox(height: 12),

              ..._mockEntries.map((entry) {
                final hours = entry['hours'] as double;
                final activities =
                    (entry['activities'] as List).cast<String>();
                final signed = entry['signed'] as bool;
                return Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
                  child: Material(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(14),
                      onTap: () {
                        Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => EntryDetailScreen(
                              patientName: patient.displayName,
                              date: entry['date'] as String,
                              hours: hours,
                              activities: activities,
                              isSigned: signed,
                            ),
                          ),
                        );
                      },
                      child: Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: Colors.black12),
                        ),
                        child: Row(
                          children: [
                            CircleAvatar(
                              radius: 20,
                              backgroundColor:
                                  green.withValues(alpha: 0.12),
                              child: Icon(
                                signed ? Icons.verified : Icons.event,
                                color: green,
                                size: 20,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment:
                                    CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Text(
                                        entry['date'] as String,
                                        style: const TextStyle(
                                          fontSize: 15,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      Text(
                                        _formatHours(hours),
                                        style: const TextStyle(
                                          fontSize: 14,
                                          color: green,
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    activities.join(', '),
                                    style: const TextStyle(
                                      fontSize: 13,
                                      color: Colors.black54,
                                    ),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ],
                              ),
                            ),
                            const Icon(
                              Icons.chevron_right,
                              color: Colors.black26,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              }),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBudgetHero(
    AsyncValue<dynamic> budgetAsync,
    AsyncValue<dynamic> lockAsync,
  ) {
    return budgetAsync.when(
      loading: () => _heroShell(
        child: const SizedBox(
          height: 90,
          child: Center(
            child: SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(
                color: Colors.white,
                strokeWidth: 2.5,
              ),
            ),
          ),
        ),
      ),
      error: (e, _) => _heroShell(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.cloud_off, color: Colors.white, size: 20),
                SizedBox(width: 8),
                Text(
                  'Reststunden',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Text(
              'Offline',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.9),
                fontSize: 26,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              e.toString(),
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.75),
                fontSize: 12,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
      data: (budget) {
        final remaining = budget.careServiceRemainingHours as double;
        final used = budget.careServiceUsedHours as double;
        final total = remaining + used;
        final progress = total > 0 ? (used / total).clamp(0.0, 1.0) : 0.0;
        final respiteHours = budget.respiteCareRemainingHours as double;
        final respiteMoney = budget.respiteCareRemainingMoneyCents as int;
        final locked = lockAsync.valueOrNull?.isLocked == true;

        return _heroShell(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.schedule, color: Colors.white, size: 20),
                  const SizedBox(width: 8),
                  const Text(
                    'Reststunden · Pflegesachleistung',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const Spacer(),
                  if (locked)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.lock, color: Colors.white, size: 12),
                          SizedBox(width: 4),
                          Text(
                            'GESPERRT',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                              letterSpacing: 0.5,
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 14),
              Text(
                _formatHours(remaining),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 38,
                  fontWeight: FontWeight.bold,
                  height: 1.0,
                ),
              ),
              const SizedBox(height: 12),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: progress,
                  minHeight: 6,
                  backgroundColor: Colors.white.withValues(alpha: 0.25),
                  valueColor: const AlwaysStoppedAnimation(Colors.white),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                '${_formatHours(used)} von ${_formatHours(total)} genutzt · Stand ${now()}',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.85),
                  fontSize: 12,
                ),
              ),
              if (respiteHours > 0) ...[
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 10,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    children: [
                      const Icon(
                        Icons.assignment_outlined,
                        color: Colors.white,
                        size: 18,
                      ),
                      const SizedBox(width: 10),
                      const Expanded(
                        child: Text(
                          'Verhinderungspflege',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      Text(
                        '${_formatHours(respiteHours)} · ${(respiteMoney / 100).toStringAsFixed(0)} €',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  String now() {
    final n = DateTime.now();
    return '${n.day.toString().padLeft(2, '0')}.${n.month.toString().padLeft(2, '0')}.${n.year}';
  }

  Widget _heroShell({required Widget child}) {
    const green = Color(0xFF4F8A5B);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [green, green.withValues(alpha: 0.75)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
      ),
      child: child,
    );
  }

  Widget _kvRow({required String label, required String value}) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 120,
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: Colors.black54,
            ),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: const TextStyle(fontSize: 15, color: Colors.black87),
          ),
        ),
      ],
    );
  }

  Widget _documentCard({
    required IconData icon,
    required String title,
    required String subtitle,
    required Color statusColor,
    required String statusLabel,
    required VoidCallback onTap,
    bool disabled = false,
  }) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: disabled ? null : onTap,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Colors.black12),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: disabled
                      ? Colors.black.withValues(alpha: 0.04)
                      : statusColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  icon,
                  color: disabled ? Colors.black26 : statusColor,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            title,
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                              color:
                                  disabled ? Colors.black38 : Colors.black87,
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
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            statusLabel,
                            style: TextStyle(
                              fontSize: 10,
                              color: statusColor,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.4,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: TextStyle(
                        fontSize: 13,
                        color: disabled ? Colors.black26 : Colors.black54,
                      ),
                    ),
                  ],
                ),
              ),
              if (!disabled)
                const Icon(Icons.chevron_right, color: Colors.black26),
            ],
          ),
        ),
      ),
    );
  }

  Widget _vpAntragCard() {
    const green = Color(0xFF4F8A5B);

    if (widget.patient.pflegegradInt < 2) {
      return _documentCard(
        icon: Icons.assignment_outlined,
        title: 'Verhinderungspflege',
        subtitle: 'Nur ab Pflegegrad 2 verfügbar',
        statusColor: Colors.black38,
        statusLabel: 'NICHT VERFÜGBAR',
        onTap: () {},
        disabled: true,
      );
    }

    if (_vpState == 'signed') {
      return Material(
        color: green.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: green.withValues(alpha: 0.4)),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: const BoxDecoration(
                  color: green,
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.check, color: Colors.white),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Row(
                      children: [
                        Expanded(
                          child: Text(
                            'Verhinderungspflege',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        Icon(Icons.verified, color: green, size: 20),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Unterschrieben · bei Krankenkasse eingereicht',
                      style: TextStyle(
                        fontSize: 13,
                        color: green.withValues(alpha: 0.9),
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Antrag für $_vpMonth',
                      style: const TextStyle(
                        fontSize: 12,
                        color: Colors.black54,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    }

    if (_vpState == 'approved') {
      return Material(
        color: green.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: green.withValues(alpha: 0.4)),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: const BoxDecoration(
                  color: green,
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.check_circle, color: Colors.white),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Verhinderungspflege',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Von Krankenkasse genehmigt',
                      style: TextStyle(
                        fontSize: 13,
                        color: green.withValues(alpha: 0.9),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Antrag für $_vpMonth',
                      style: const TextStyle(
                        fontSize: 12,
                        color: Colors.black54,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    }

    return _documentCard(
      icon: Icons.assignment_outlined,
      title: 'Verhinderungspflege',
      subtitle: 'Antrag erstellen und unterschreiben lassen',
      statusColor: Colors.orange,
      statusLabel: 'ERSTELLEN',
      onTap: _openVpAntrag,
    );
  }
}
