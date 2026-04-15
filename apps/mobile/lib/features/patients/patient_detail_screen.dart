import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_exception.dart';
import '../../core/models/caretaker_history.dart';
import '../../core/models/entry.dart';
import '../../core/models/mobile_patient.dart';
import '../../core/models/patient_extras.dart';
import '../../core/models/signature_event.dart';
import '../../core/providers.dart';
import '../signatures/signature_history_screen.dart';
import '../signatures/signature_screen.dart';
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

  String _birthdayHint(int? days) {
    if (days == null) return '';
    if (days == 0) return '  ·  🎉 Hat heute Geburtstag!';
    if (days == 1) return '  ·  🎂 morgen Geburtstag';
    if (days <= 30) return '  ·  🎂 in $days Tagen Geburtstag';
    return '';
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
      // Signatur-Cache invalidieren damit Provider neu lädt
      ref.invalidate(mySignaturesProvider);
      ref.invalidate(patientSignaturesProvider(widget.patient.patientId));
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
    // Wenn die Krankenkasse den Antrag bestätigt hat, zeigen wir einen
    // eigenen state damit die Card grün statt orange gefärbt wird.
    if (latest.approvedByKk) {
      return (state: 'approved', month: label);
    }
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
    // patientSignaturesProvider liefert alle Unterschriften (auch von
    // Kolleg:innen im Vertretungs-Fall), deswegen bevorzugt. Fällt auf
    // mySignaturesProvider zurück solange der erste Request läuft.
    final signaturesAsync =
        ref.watch(patientSignaturesProvider(patient.patientId));
    final vp = _resolveVpState(signaturesAsync.valueOrNull ?? const []);
    final extrasAsync = ref.watch(patientExtrasProvider(patient.patientId));

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
            ref.invalidate(patientSignaturesProvider(patient.patientId));
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
                          if (patient.age != null) ...[
                            const SizedBox(height: 2),
                            Text(
                              '${patient.age} Jahre${_birthdayHint(patient.daysUntilNextBirthday)}',
                              style: const TextStyle(
                                fontSize: 13,
                                color: Colors.black54,
                              ),
                            ),
                          ],
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
                            ref.invalidate(
                              patientSignaturesProvider(patient.patientId),
                            );
                          }
                        },
                      ),
              ),

              const SizedBox(height: 10),

              // Betreuungsvertrag-Card
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: _buildContractCard(extrasAsync),
              ),

              const SizedBox(height: 16),

              // Büro anrufen lassen
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: OutlinedButton.icon(
                  onPressed: () => _requestOfficeCall(),
                  icon: const Icon(Icons.phone_in_talk_outlined, size: 18),
                  label: const Text('Büro soll anrufen'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.blue[700],
                    side: BorderSide(color: Colors.blue.withValues(alpha: 0.4)),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                    minimumSize: const Size.fromHeight(50),
                  ),
                ),
              ),

              const SizedBox(height: 10),

              // Unterschriften-Historie für diesen Patient
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: OutlinedButton.icon(
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => SignatureHistoryScreen(
                          patientId: widget.patient.patientId,
                          patientName: widget.patient.displayName,
                        ),
                      ),
                    );
                  },
                  icon: const Icon(Icons.draw_outlined, size: 18),
                  label: const Text('Unterschriften ansehen'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFF4F8A5B),
                    side: BorderSide(
                      color: const Color(0xFF4F8A5B).withValues(alpha: 0.4),
                    ),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                    minimumSize: const Size.fromHeight(50),
                  ),
                ),
              ),

              const SizedBox(height: 28),

              // Notfallkontakt
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 20),
                child: Text(
                  'Notfallkontakt',
                  style:
                      TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
                ),
              ),
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: _buildEmergencyContactCard(extrasAsync),
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

              const SizedBox(height: 28),

              // Betreuer-Historie (collapsible, per default zu)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: _buildCaretakerHistory(),
              ),
            ],
          ),
          ),
        ),
      ),
    );
  }

  Widget _buildCaretakerHistory() {
    final historyAsync = ref.watch(
      caretakerHistoryProvider(widget.patient.patientId),
    );

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.black12),
      ),
      child: Theme(
        data: Theme.of(context).copyWith(
          dividerColor: Colors.transparent,
        ),
        child: ExpansionTile(
          leading: const Icon(
            Icons.history,
            color: Colors.black54,
            size: 22,
          ),
          title: const Text(
            'Betreuer-Historie',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
            ),
          ),
          subtitle: const Text(
            'Wer hat vorher betreut?',
            style: TextStyle(fontSize: 12, color: Colors.black54),
          ),
          childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          children: [
            historyAsync.when(
              loading: () => const Padding(
                padding: EdgeInsets.all(16),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (e, _) => Padding(
                padding: const EdgeInsets.all(8),
                child: Text(
                  e.toString(),
                  style: const TextStyle(fontSize: 12, color: Colors.black54),
                ),
              ),
              data: (entries) {
                if (entries.isEmpty) {
                  return const Padding(
                    padding: EdgeInsets.all(12),
                    child: Text(
                      'Keine Historie verfügbar',
                      style: TextStyle(fontSize: 13, color: Colors.black54),
                    ),
                  );
                }
                return Column(
                  children: entries
                      .map((e) => _buildHistoryRow(e))
                      .toList(),
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHistoryRow(CaretakerHistoryEntry e) {
    const green = Color(0xFF4F8A5B);
    final from = CaretakerHistoryEntry.formatDate(e.startedAt);
    final to = e.isActive
        ? 'heute'
        : CaretakerHistoryEntry.formatDate(e.endedAt);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(
              color: e.isActive ? green : Colors.black26,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        e.name,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    if (e.isPrimary)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: green.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Text(
                          'Haupt',
                          style: TextStyle(
                            fontSize: 9,
                            color: green,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  '$from – $to',
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
        // Gesamt-Reststunden über alle Töpfe — der Betreuer braucht
        // nur EINE Zahl. BL + VP zusammengezogen.
        final blRemaining = budget.careServiceRemainingHours as double;
        final blUsed = budget.careServiceUsedHours as double;
        final respiteHours = budget.respiteCareRemainingHours as double;
        final remaining = blRemaining + respiteHours;
        final used = blUsed; // BL-Verbrauch — VP wird selten verbraucht
        final total = remaining + used;
        final progress =
            total > 0 ? (used / total).clamp(0.0, 1.0) : 0.0;
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
                    'Reststunden · Gesamt',
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
              // Aufschlüsselung BL/VP nur als kleine Hilfslinie — die
              // Hauptzahl oben ist die Summe.
              const SizedBox(height: 8),
              Text(
                'Davon Betreuungsleistung: ${_formatHours(blRemaining)} · '
                'Verhinderungspflege: ${_formatHours(respiteHours)}',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.75),
                  fontSize: 11,
                ),
              ),
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

  // --- Betreuungsvertrag ---

  Widget _buildContractCard(AsyncValue<PatientExtras> extrasAsync) {
    const green = Color(0xFF4F8A5B);

    return extrasAsync.when(
      loading: () => _contractSkeleton(),
      error: (_, _) => _contractSkeleton(),
      data: (extras) {
        final signed = extras.hasContract;
        return Material(
          color: signed
              ? green.withValues(alpha: 0.06)
              : Colors.orange.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(14),
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: signed ? null : () => _signBetreuungsvertrag(),
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: signed
                      ? green.withValues(alpha: 0.4)
                      : Colors.orange.withValues(alpha: 0.5),
                ),
              ),
              child: Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: signed ? green : Colors.orange,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      signed ? Icons.check : Icons.warning_amber_rounded,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Betreuungsvertrag',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          signed
                              ? 'Unterschrieben am ${_formatDateDe(extras.contractSignedAt!)}'
                              : 'Noch nicht unterschrieben – zum Unterschreiben tippen',
                          style: TextStyle(
                            fontSize: 13,
                            color: signed ? green : Colors.orange[800],
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (!signed)
                    const Icon(Icons.chevron_right, color: Colors.orange),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _contractSkeleton() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.black12),
      ),
      child: const Row(
        children: [
          SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          SizedBox(width: 12),
          Text('Vertragsstatus wird geladen…'),
        ],
      ),
    );
  }

  Future<void> _signBetreuungsvertrag() async {
    final ok = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => SignatureScreen(
          patient: widget.patient,
          documentType: DocumentType.betreuungsvertrag,
          documentTitle: 'Betreuungsvertrag',
        ),
      ),
    );
    if (ok == true && mounted) {
      ref.invalidate(patientExtrasProvider);
      ref.invalidate(mySignaturesProvider);
      ref.invalidate(patientSignaturesProvider(widget.patient.patientId));
    }
  }

  // --- Notfallkontakt ---

  Widget _buildEmergencyContactCard(AsyncValue<PatientExtras> extrasAsync) {
    return extrasAsync.when(
      loading: () => _contractSkeleton(),
      error: (e, _) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Colors.black12),
        ),
        child: Text(
          e.toString(),
          style: const TextStyle(fontSize: 12, color: Colors.black54),
        ),
      ),
      data: (extras) {
        final missing = !extras.hasEmergencyContact;
        return Material(
          color: missing ? Colors.orange.withValues(alpha: 0.08) : Colors.white,
          borderRadius: BorderRadius.circular(14),
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: () => _editEmergencyContact(extras),
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: missing
                      ? Colors.orange.withValues(alpha: 0.5)
                      : Colors.black12,
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    missing
                        ? Icons.warning_amber_rounded
                        : Icons.contact_phone_outlined,
                    color: missing ? Colors.orange : const Color(0xFF4F8A5B),
                    size: 28,
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: missing
                          ? [
                              Text(
                                'Notfallkontakt fehlt',
                                style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w600,
                                  color: Colors.orange[800],
                                ),
                              ),
                              const SizedBox(height: 2),
                              const Text(
                                'Bitte Name und Telefonnummer eintragen',
                                style: TextStyle(
                                  fontSize: 13,
                                  color: Colors.black54,
                                ),
                              ),
                            ]
                          : [
                              Text(
                                extras.emergencyContactName!,
                                style: const TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                extras.emergencyContactPhone!,
                                style: const TextStyle(
                                  fontSize: 13,
                                  color: Colors.black54,
                                ),
                              ),
                            ],
                    ),
                  ),
                  if (!missing)
                    IconButton(
                      icon: const Icon(
                        Icons.call,
                        color: Color(0xFF4F8A5B),
                      ),
                      onPressed: () =>
                          _callPhone(extras.emergencyContactPhone!),
                    ),
                  Icon(
                    Icons.edit_outlined,
                    color: missing ? Colors.orange : Colors.black38,
                    size: 18,
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Future<void> _editEmergencyContact(PatientExtras extras) async {
    final nameCtrl =
        TextEditingController(text: extras.emergencyContactName ?? '');
    final phoneCtrl =
        TextEditingController(text: extras.emergencyContactPhone ?? '');
    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Notfallkontakt'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameCtrl,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(
                labelText: 'Name',
                hintText: 'z.B. Anna Engelhardt (Tochter)',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: phoneCtrl,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: 'Telefonnummer',
                hintText: 'z.B. 0175 1234567',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Abbrechen'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Speichern'),
          ),
        ],
      ),
    );
    nameCtrl.dispose();
    phoneCtrl.dispose();
    if (saved != true || !mounted) return;

    try {
      await ref.read(patientRepositoryProvider).updatePatientExtras(
            patientId: widget.patient.patientId,
            emergencyContactName: nameCtrl.text,
            emergencyContactPhone: phoneCtrl.text,
          );
      ref.invalidate(patientExtrasProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Notfallkontakt gespeichert')),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.message),
          backgroundColor: Colors.red,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Fehler: $e'), backgroundColor: Colors.red),
      );
    }
  }

  // --- Büro-Anruf-Request ---

  Future<void> _requestOfficeCall() async {
    CallReason? selected;
    final noteCtrl = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSt) => AlertDialog(
          title: const Text('Büro soll anrufen'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Grund auswählen:',
                style: TextStyle(
                  fontSize: 13,
                  color: Colors.black54,
                ),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: CallReason.values.map((r) {
                  final isSelected = selected == r;
                  return ChoiceChip(
                    label: Text(r.label),
                    selected: isSelected,
                    onSelected: (_) => setSt(() => selected = r),
                  );
                }).toList(),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: noteCtrl,
                minLines: 2,
                maxLines: 4,
                decoration: const InputDecoration(
                  labelText: 'Notiz (optional)',
                  hintText: 'Was soll das Büro wissen?',
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Abbrechen'),
            ),
            TextButton(
              onPressed: selected == null
                  ? null
                  : () => Navigator.of(ctx).pop(true),
              child: const Text('Senden'),
            ),
          ],
        ),
      ),
    );
    if (confirmed != true || selected == null || !mounted) {
      noteCtrl.dispose();
      return;
    }

    try {
      await ref.read(patientRepositoryProvider).requestOfficeCall(
            patientId: widget.patient.patientId,
            reason: selected!.apiValue,
            note: noteCtrl.text.trim(),
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Rückruf angefragt (${selected!.label}) · Büro wird sich melden',
          ),
        ),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message), backgroundColor: Colors.red),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Fehler: $e'), backgroundColor: Colors.red),
      );
    } finally {
      noteCtrl.dispose();
    }
  }

  Future<void> _savePatientField({
    String? phone,
    String? insuranceNumber,
    String? birthday,
  }) async {
    try {
      await ref.read(patientRepositoryProvider).updatePatient(
            patientId: widget.patient.patientId,
            phone: phone,
            insuranceNumber: insuranceNumber,
            birthday: birthday,
          );
      // Patients neu laden damit die Werte aktualisiert sind
      ref.invalidate(patientsProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Gespeichert · an Patti übermittelt'),
          duration: Duration(seconds: 2),
        ),
      );
      // Nach dem Refetch muss der Screen mit dem neuen Patient geschlossen
      // und neu geöffnet werden, weil wir das Patient-Objekt als widget.patient
      // übergeben haben. Einfacher: Pop so dass die Liste neu lädt.
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.message),
          backgroundColor: Colors.red,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Fehler: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Future<void> _editPhone() async {
    final newValue = await _promptText(
      title: 'Telefonnummer',
      hint: 'z.B. 0175 1234567',
      initial: widget.patient.phone ?? '',
      keyboard: TextInputType.phone,
    );
    if (newValue == null) return;
    await _savePatientField(phone: newValue.trim());
  }

  Future<void> _editInsuranceNumber() async {
    final newValue = await _promptText(
      title: 'Versichertennummer',
      hint: 'z.B. R818892525',
      initial: widget.patient.insuranceNumber ?? '',
    );
    if (newValue == null) return;
    await _savePatientField(insuranceNumber: newValue.trim());
  }

  Future<void> _editBirthday() async {
    final initial = widget.patient.birthdayDate ??
        DateTime(DateTime.now().year - 70, 1, 1);
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(1900),
      lastDate: DateTime.now(),
      helpText: 'Geburtstag wählen',
    );
    if (picked == null) return;
    final iso =
        '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
    await _savePatientField(birthday: iso);
  }

  Future<String?> _promptText({
    required String title,
    required String hint,
    required String initial,
    TextInputType? keyboard,
  }) async {
    final controller = TextEditingController(text: initial);
    final result = await showDialog<String?>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: controller,
          autofocus: true,
          keyboardType: keyboard,
          decoration: InputDecoration(hintText: hint),
          onSubmitted: (v) => Navigator.of(ctx).pop(v),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Abbrechen'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(controller.text),
            child: const Text('Speichern'),
          ),
        ],
      ),
    );
    controller.dispose();
    return result;
  }

  void _showEditOrActionSheet({
    required String currentValue,
    required String label,
    required VoidCallback onEdit,
    required VoidCallback onCall,
    required VoidCallback onCopy,
  }) {
    showModalBottomSheet<void>(
      context: context,
      builder: (_) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.call, color: Color(0xFF4F8A5B)),
              title: Text('$currentValue anrufen'),
              onTap: () {
                Navigator.of(context).pop();
                onCall();
              },
            ),
            ListTile(
              leading: const Icon(Icons.edit_outlined),
              title: Text('$label bearbeiten'),
              onTap: () {
                Navigator.of(context).pop();
                onEdit();
              },
            ),
            ListTile(
              leading: const Icon(Icons.content_copy),
              title: const Text('Kopieren'),
              onTap: () {
                Navigator.of(context).pop();
                onCopy();
              },
            ),
          ],
        ),
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
    final phoneMissing = phone == null || phone.trim().isEmpty;
    final birthday = patient.birthdayDate;
    final daysUntilBd = patient.daysUntilNextBirthday;
    final age = patient.age;

    String birthdayLabel = 'fehlt – zum Eintragen tippen';
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

    final insuranceNumberMissing = patient.insuranceNumber == null ||
        patient.insuranceNumber!.trim().isEmpty ||
        patient.insuranceNumber!.toLowerCase() == 'fehlt';

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

          // Telefon – immer anzeigen, bei fehlend gelb mit Tap-to-edit
          _contactTile(
            icon: Icons.phone_iphone_outlined,
            label: patient.phoneLandline != null ? 'Mobil' : 'Telefon',
            value: phoneMissing ? 'fehlt – zum Eintragen tippen' : phone,
            missing: phoneMissing,
            trailing: phoneMissing
                ? const Icon(Icons.edit, color: Colors.orange, size: 18)
                : const Icon(Icons.call, color: green, size: 20),
            onTap: phoneMissing
                ? () => _editPhone()
                : () => _callPhone(phone),
            onLongPress: phoneMissing
                ? null
                : () {
                    _showEditOrActionSheet(
                      currentValue: phone,
                      label: 'Telefonnummer',
                      onEdit: () => _editPhone(),
                      onCall: () => _callPhone(phone),
                      onCopy: () =>
                          _copyToClipboard(phone, 'Telefonnummer'),
                    );
                  },
          ),
          const Divider(height: 1, indent: 56),

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

          // Geburtstag – immer, bei fehlend gelb
          _contactTile(
            icon: Icons.cake_outlined,
            label: 'Geburtstag',
            value: birthdayLabel,
            subtitle: birthdaySubtitle,
            missing: birthday == null,
            trailing: birthday == null
                ? const Icon(Icons.edit, color: Colors.orange, size: 18)
                : null,
            onTap: birthday == null ? () => _editBirthday() : null,
          ),
          const Divider(height: 1, indent: 56),

          // Krankenkasse – read-only (wird vom Büro zugewiesen)
          _contactTile(
            icon: Icons.account_balance_outlined,
            label: 'Krankenkasse',
            value: patient.insuranceCompanyName ?? 'fehlt – bitte Büro',
            missing: patient.insuranceCompanyName == null,
          ),
          const Divider(height: 1, indent: 56),

          // Versichertennummer – nicht bei privat, sonst editable
          if (!patient.isPrivat)
            _contactTile(
              icon: Icons.badge_outlined,
              label: 'Versichertennummer',
              value: insuranceNumberMissing
                  ? 'fehlt – zum Eintragen tippen'
                  : patient.insuranceNumber!,
              missing: insuranceNumberMissing,
              trailing: insuranceNumberMissing
                  ? const Icon(Icons.edit, color: Colors.orange, size: 18)
                  : null,
              onTap: insuranceNumberMissing
                  ? () => _editInsuranceNumber()
                  : null,
              onLongPress: insuranceNumberMissing
                  ? null
                  : () => _copyToClipboard(
                        patient.insuranceNumber!,
                        'Versichertennummer',
                      ),
            )
          else
            _contactTile(
              icon: Icons.verified_outlined,
              label: 'Versicherung',
              value: 'Privat versichert',
              subtitle: 'Keine Versichertennummer erforderlich',
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
    bool missing = false,
  }) {
    final valueColor = missing
        ? Colors.orange[800]
        : (onTap != null ? const Color(0xFF4F8A5B) : Colors.black87);
    final tileBg = missing ? Colors.orange.withValues(alpha: 0.08) : null;
    return Material(
      color: tileBg ?? Colors.transparent,
      child: ListTile(
        leading: Icon(
          icon,
          color: missing ? Colors.orange : Colors.black54,
        ),
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
                  color: valueColor,
                  fontWeight: FontWeight.w500,
                  decoration: (onTap != null && !missing)
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
      // Unterschrieben, aber noch nicht von der KK bestätigt → orange
      const amber = Colors.orange;
      return Material(
        color: amber.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: amber.withValues(alpha: 0.4)),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: const BoxDecoration(
                  color: amber,
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.hourglass_top, color: Colors.white),
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
                        Icon(Icons.hourglass_empty, color: amber, size: 20),
                      ],
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'Unterschrieben · warte auf KK-Genehmigung',
                      style: TextStyle(
                        fontSize: 13,
                        color: Color(0xFFC97A00),
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
