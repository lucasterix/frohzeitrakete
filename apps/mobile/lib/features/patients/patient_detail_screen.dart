import 'package:flutter/material.dart';
import '../../shared/widgets/detail_line.dart';
import '../../shared/widgets/notification_bell.dart';
import '../requests/document_detail_screen.dart';
import '../entries/entry_screen.dart';
import '../entries/entry_detail_screen.dart';
import '../entries/month_overview_screen.dart';
import '../settings/settings_screen.dart';
import '../vp_antrag/vp_antrag_screen.dart';

class PatientDetailScreen extends StatefulWidget {
  final String name;
  final String address;
  final String birthday;
  final String insuranceNumber;
  final String careInsurance;
  final String phone;
  final double remainingHours;
  final double usedHours;
  final int pflegegrad;
  final String vpState; // none | signed | approved
  final String vpMonth;

  const PatientDetailScreen({
    super.key,
    required this.name,
    required this.address,
    required this.birthday,
    required this.insuranceNumber,
    required this.careInsurance,
    required this.phone,
    required this.remainingHours,
    required this.usedHours,
    required this.pflegegrad,
    required this.vpState,
    required this.vpMonth,
  });

  @override
  State<PatientDetailScreen> createState() => _PatientDetailScreenState();
}

class _PatientDetailScreenState extends State<PatientDetailScreen> {
  late String _vpState;
  late String _vpMonth;

  @override
  void initState() {
    super.initState();
    _vpState = widget.vpState;
    _vpMonth = widget.vpMonth;
  }

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

  String _formatHours(double h) {
    final full = h.truncate();
    final half = (h - full) >= 0.5;
    return '$full,${half ? '5' : '0'} h';
  }

  String _initials() {
    return widget.name
        .split(' ')
        .map((w) => w.isNotEmpty ? w[0] : '')
        .take(2)
        .join();
  }

  Future<void> _openVpAntrag() async {
    if (widget.pflegegrad < 2) return;
    final result = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => VpAntragScreen(
          patientName: widget.name,
          pflegegrad: widget.pflegegrad,
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
    final totalHours = widget.remainingHours + widget.usedHours;
    final progress =
        totalHours == 0 ? 0.0 : widget.usedHours / totalHours;

    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => EntryScreen(preselectedPatient: widget.name),
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
              // Header
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

              // Hero: Avatar + Name + Pflegegrad
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 0),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
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
                          _initials(),
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
                            widget.name,
                            style: const TextStyle(
                              fontSize: 24,
                              fontWeight: FontWeight.bold,
                              height: 1.2,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Row(
                            children: [
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
                                  'Pflegegrad ${widget.pflegegrad}',
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: green,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 6),
                              Flexible(
                                child: Text(
                                  '• ${widget.birthday}',
                                  style: const TextStyle(
                                    fontSize: 13,
                                    color: Colors.black54,
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 20),

              // Reststunden-Hero
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Container(
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
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(
                            Icons.schedule,
                            color: Colors.white,
                            size: 20,
                          ),
                          const SizedBox(width: 8),
                          const Text(
                            'Reststunden diesen Monat',
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
                        _formatHours(widget.remainingHours),
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
                          backgroundColor:
                              Colors.white.withValues(alpha: 0.25),
                          valueColor: const AlwaysStoppedAnimation(
                            Colors.white,
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        '${_formatHours(widget.usedHours)} von ${_formatHours(totalHours)} genutzt',
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.85),
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 24),

              // Dokumente
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 20),
                child: Text(
                  'Dokumente',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                  ),
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
                          patientName: widget.name,
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
                        builder: (_) => const DocumentDetailScreen(
                          title: 'Pflegeumwandlung',
                          status: 'bereit',
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
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(height: 12),

              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Container(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: Colors.black12),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      DetailLine(
                        'Adresse:',
                        widget.address,
                        copyable: true,
                        icon: Icons.content_copy,
                      ),
                      DetailLine(
                        'Telefon:',
                        widget.phone,
                        copyable: true,
                        icon: Icons.content_copy,
                      ),
                      DetailLine(
                        'Versicherung:',
                        widget.careInsurance,
                      ),
                      DetailLine(
                        'Versichertennr.:',
                        widget.insuranceNumber,
                        copyable: true,
                        icon: Icons.content_copy,
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 28),

              // Letzte Einsätze
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 20),
                child: Text(
                  'Letzte Einsätze',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                  ),
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
                              patientName: widget.name,
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
                              color: disabled
                                  ? Colors.black38
                                  : Colors.black87,
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

    if (widget.pflegegrad < 2) {
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
                        Icon(
                          Icons.verified,
                          color: green,
                          size: 20,
                        ),
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
                child: const Icon(
                  Icons.check_circle,
                  color: Colors.white,
                ),
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

    // none
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
