import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/models/entry.dart';
import '../../core/models/mobile_patient.dart';
import '../../core/models/signature_event.dart';
import '../../core/providers.dart';
import '../../shared/widgets/notification_bell.dart';
import '../entries/entry_screen.dart';
import '../entries/entry_detail_screen.dart';
import '../requests/umwandlung_screen.dart';
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
  // VP-Antrag-Status: wird live aus mySignaturesProvider abgeleitet.
  // Lokaler Override nach erfolgreichem Antrag bis der Provider neu gelädt.
  String? _vpStateOverride; // 'signed' wenn gerade signiert
  String? _vpMonthOverride;

  String _formatDateDe(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}.${d.year}';

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
      // Signatur-Cache invalidieren damit Provider neu lädt
      ref.invalidate(mySignaturesProvider);
      setState(() {
        _vpStateOverride = 'signed';
        _vpMonthOverride = '${monthNames[now.month - 1]} ${now.year}';
      });
    }
  }

  /// Ermittelt aus den Signaturen des Users ob ein VP-Antrag für diesen
  /// Patienten läuft, signiert wurde oder vom Patient nicht gewünscht ist.
  ({String state, String month}) _resolveVpState(
    List<SignatureEvent> signatures,
  ) {
    if (_vpStateOverride != null) {
      return (state: _vpStateOverride!, month: _vpMonthOverride ?? '');
    }

    const monthNames = [
      'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
      'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
    ];

    final vpSignatures = signatures
        .where((s) =>
            s.patientId == widget.patient.patientId &&
            s.documentType == DocumentType.vpAntrag)
        .toList()
      ..sort((a, b) => b.signedAt.compareTo(a.signedAt));

    if (vpSignatures.isEmpty) {
      return (state: 'none', month: '');
    }

    final latest = vpSignatures.first;
    if (latest.signerName == 'Nicht gewünscht') {
      return (state: 'not_wanted', month: '');
    }
    final label =
        '${monthNames[latest.signedAt.month - 1]} ${latest.signedAt.year}';
    return (state: 'signed', month: label);
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
    final entriesAsync = ref.watch(
      patientEntriesProvider(
        EntryListParams(
          patientId: patient.patientId,
          year: now.year,
          month: now.month,
        ),
      ),
    );
    final signaturesAsync = ref.watch(mySignaturesProvider);
    final vp = _resolveVpState(signaturesAsync.valueOrNull ?? const []);

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
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(pattiBudgetProvider);
            ref.invalidate(hoursSummaryProvider);
            ref.invalidate(patientEntriesProvider);
            ref.invalidate(mySignaturesProvider);
            try {
              await ref.read(pattiBudgetProvider(
                PattiBudgetParams(
                  patientId: patient.patientId,
                  year: now.year,
                ),
              ).future);
            } catch (_) {}
          },
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
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

              // Warning-Banner für fehlende Stammdaten
              if (patient.hasMissingData)
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
                  child: _buildMissingDataBanner(patient.missingFields),
                ),

              // Reststunden Hero (live aus Patti via Backend)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: _buildBudgetHero(budgetAsync, lockAsync),
              ),

              const SizedBox(height: 24),

              // Anträge
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 20),
                child: Text(
                  'Anträge',
                  style:
                      TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
                ),
              ),
              const SizedBox(height: 12),

              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: _vpAntragCard(vp.state, vp.month),
              ),

              const SizedBox(height: 10),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: pflegegrad < 2
                    ? _documentCard(
                        icon: Icons.folder_outlined,
                        title: 'Pflegeumwandlung',
                        subtitle: 'Nur ab Pflegegrad 2 verfügbar',
                        statusColor: Colors.black38,
                        statusLabel: 'NICHT VERFÜGBAR',
                        onTap: () {},
                        disabled: true,
                      )
                    : _documentCard(
                        icon: Icons.folder_outlined,
                        title: 'Umwandlungsantrag',
                        subtitle:
                            '40% Pflegesachleistung → Betreuungsleistung',
                        statusColor: Colors.black54,
                        statusLabel: 'VERFÜGBAR',
                        onTap: () async {
                          final ok = await Navigator.of(context).push<bool>(
                            MaterialPageRoute(
                              builder: (_) =>
                                  UmwandlungScreen(patient: patient),
                            ),
                          );
                          if (ok == true) {
                            ref.invalidate(mySignaturesProvider);
                          }
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
                child: _buildContactCard(),
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

              _buildRecentEntries(entriesAsync, lockAsync),
            ],
          ),
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
                    'Reststunden · Betreuungsleistung',
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

  Future<void> _launch(Uri uri) async {
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Konnte nicht öffnen: ${uri.toString()}')),
      );
    }
  }

  Future<void> _callPhone(String phone) async {
    final cleaned = phone.replaceAll(RegExp(r'[^0-9+]'), '');
    await _launch(Uri.parse('tel:$cleaned'));
  }

  Future<void> _openMaps(String address) async {
    // Universal Maps-Link: Apple Maps versteht maps.apple.com,
    // Google Maps versteht google.com/maps. Wir nehmen den universellen
    // "https://maps.apple.com/?q=..." auf iOS/macOS und google.com/maps
    // sonst. Flutter's url_launcher öffnet dann die bevorzugte App.
    final encoded = Uri.encodeComponent(address);
    final uri = Theme.of(context).platform == TargetPlatform.iOS ||
            Theme.of(context).platform == TargetPlatform.macOS
        ? Uri.parse('https://maps.apple.com/?q=$encoded')
        : Uri.parse('https://www.google.com/maps/search/?api=1&query=$encoded');
    await _launch(uri);
  }

  Future<void> _copyToClipboard(String value, String label) async {
    await Clipboard.setData(ClipboardData(text: value));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('$label kopiert'),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  Widget _buildMissingDataBanner(List<String> missingFields) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.orange.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.orange.withValues(alpha: 0.5)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(
            Icons.warning_amber_rounded,
            color: Colors.orange,
            size: 22,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Stammdaten unvollständig',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: Colors.orange,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Folgende Daten fehlen und müssen im Büro nachgetragen werden:\n• ${missingFields.join('\n• ')}',
                  style: const TextStyle(
                    fontSize: 13,
                    color: Colors.black87,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildContactCard() {
    const green = Color(0xFF4F8A5B);
    final patient = widget.patient;
    final address = patient.fullAddress;
    final phone = patient.phone;
    final birthday = patient.birthdayDate;
    final daysUntilBd = patient.daysUntilNextBirthday;
    final age = patient.age;

    String birthdayLabel = '—';
    String? birthdaySubtitle;
    if (birthday != null) {
      birthdayLabel =
          '${birthday.day.toString().padLeft(2, '0')}.${birthday.month.toString().padLeft(2, '0')}.${birthday.year}';
      if (daysUntilBd != null) {
        if (daysUntilBd == 0) {
          birthdaySubtitle = '🎉 Hat heute Geburtstag!';
        } else if (daysUntilBd == 1) {
          birthdaySubtitle = 'Morgen ist Geburtstag 🎂';
        } else if (daysUntilBd <= 30) {
          birthdaySubtitle = 'In $daysUntilBd Tagen Geburtstag 🎂';
        } else {
          birthdaySubtitle = age != null ? '$age Jahre alt' : null;
        }
      }
    }

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.black12),
      ),
      child: Column(
        children: [
          if (address != null)
            _contactTile(
              icon: Icons.location_on_outlined,
              label: 'Adresse',
              value: address,
              trailing: const Icon(Icons.map_outlined,
                  color: green, size: 20),
              onTap: () => _openMaps(address),
              onLongPress: () => _copyToClipboard(address, 'Adresse'),
            ),
          if (address != null) const Divider(height: 1, indent: 56),
          if (phone != null)
            _contactTile(
              icon: Icons.phone_iphone_outlined,
              label: patient.phoneLandline != null ? 'Mobil' : 'Telefon',
              value: phone,
              trailing: const Icon(Icons.call, color: green, size: 20),
              onTap: () => _callPhone(phone),
              onLongPress: () => _copyToClipboard(phone, 'Telefonnummer'),
            ),
          if (phone != null) const Divider(height: 1, indent: 56),
          if (patient.phoneLandline != null) ...[
            _contactTile(
              icon: Icons.phone_outlined,
              label: 'Festnetz',
              value: patient.phoneLandline!,
              trailing: const Icon(Icons.call, color: green, size: 20),
              onTap: () => _callPhone(patient.phoneLandline!),
              onLongPress: () =>
                  _copyToClipboard(patient.phoneLandline!, 'Festnetz'),
            ),
            const Divider(height: 1, indent: 56),
          ],
          _contactTile(
            icon: Icons.cake_outlined,
            label: 'Geburtstag',
            value: birthdayLabel,
            subtitle: birthdaySubtitle,
          ),
          const Divider(height: 1, indent: 56),
          _contactTile(
            icon: Icons.account_balance_outlined,
            label: 'Krankenkasse',
            value: patient.insuranceCompanyName ?? '—',
          ),
          const Divider(height: 1, indent: 56),
          _contactTile(
            icon: Icons.badge_outlined,
            label: 'Versichertennummer',
            value: patient.insuranceNumber ?? '—',
            onLongPress: patient.insuranceNumber != null
                ? () => _copyToClipboard(
                      patient.insuranceNumber!,
                      'Versichertennummer',
                    )
                : null,
          ),
        ],
      ),
    );
  }

  Widget _contactTile({
    required IconData icon,
    required String label,
    required String value,
    String? subtitle,
    Widget? trailing,
    VoidCallback? onTap,
    VoidCallback? onLongPress,
  }) {
    return ListTile(
      leading: Icon(icon, color: Colors.black54),
      title: Text(
        label,
        style: const TextStyle(
          fontSize: 13,
          color: Colors.black54,
        ),
      ),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 2),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              value,
              style: TextStyle(
                fontSize: 15,
                color: onTap != null
                    ? const Color(0xFF4F8A5B)
                    : Colors.black87,
                fontWeight: FontWeight.w500,
                decoration: onTap != null
                    ? TextDecoration.underline
                    : TextDecoration.none,
                decorationColor: const Color(0xFF4F8A5B),
              ),
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 2),
              Text(
                subtitle,
                style: const TextStyle(
                  fontSize: 12,
                  color: Colors.black54,
                ),
              ),
            ],
          ],
        ),
      ),
      trailing: trailing,
      onTap: onTap,
      onLongPress: onLongPress,
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

  Widget _buildRecentEntries(
    AsyncValue<List<Entry>> entriesAsync,
    AsyncValue<dynamic> lockAsync,
  ) {
    const green = Color(0xFF4F8A5B);

    return entriesAsync.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(20),
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (e, _) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Colors.black12),
          ),
          child: Row(
            children: [
              const Icon(Icons.cloud_off, color: Colors.black38, size: 20),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  e.toString(),
                  style: const TextStyle(fontSize: 13, color: Colors.black54),
                ),
              ),
            ],
          ),
        ),
      ),
      data: (entries) {
        final currentUser = ref.watch(currentUserProvider);
        if (entries.isEmpty) {
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 28),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Colors.black12),
              ),
              child: const Column(
                children: [
                  Icon(Icons.event_busy, size: 32, color: Colors.black26),
                  SizedBox(height: 8),
                  Text(
                    'Noch keine Einsätze erfasst',
                    style: TextStyle(fontSize: 14, color: Colors.black54),
                  ),
                ],
              ),
            ),
          );
        }

        final locked = lockAsync.valueOrNull?.isLocked == true;

        return Column(
          children: entries.take(10).map((entry) {
            final isMine = entry.userId == currentUser?.id;
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
                          entry: entry,
                          patientName: widget.patient.displayName,
                          monthLocked: locked,
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
                          backgroundColor: green.withValues(alpha: 0.12),
                          child: Icon(
                            locked ? Icons.verified : Icons.event,
                            color: green,
                            size: 20,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Text(
                                    _formatDateDe(entry.entryDate),
                                    style: const TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    _formatHours(entry.hours),
                                    style: const TextStyle(
                                      fontSize: 14,
                                      color: green,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  if (!isMine && entry.userName != null) ...[
                                    const SizedBox(width: 8),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 6,
                                        vertical: 2,
                                      ),
                                      decoration: BoxDecoration(
                                        color: Colors.blue
                                            .withValues(alpha: 0.12),
                                        borderRadius: BorderRadius.circular(4),
                                      ),
                                      child: Text(
                                        'Vertretung',
                                        style: TextStyle(
                                          fontSize: 10,
                                          color: Colors.blue[800],
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                              const SizedBox(height: 2),
                              Text(
                                isMine || entry.userName == null
                                    ? entry.activities.join(', ')
                                    : '${entry.userName} · ${entry.activities.join(', ')}',
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
          }).toList(),
        );
      },
    );
  }

  Widget _vpAntragCard(String vpState, String vpMonth) {
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

    if (vpState == 'not_wanted') {
      return _documentCard(
        icon: Icons.block,
        title: 'Verhinderungspflege',
        subtitle: 'Vom Patienten nicht gewünscht',
        statusColor: Colors.black54,
        statusLabel: 'NICHT GEWÜNSCHT',
        onTap: _openVpAntrag,
      );
    }

    if (vpState == 'signed') {
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
                      'Antrag für $vpMonth',
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

    if (vpState == 'approved') {
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
                      'Antrag für $vpMonth',
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
