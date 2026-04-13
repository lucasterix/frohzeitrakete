/// Patient wie vom Mobile-Endpoint zurückgeliefert.
///
/// Backend liefert noch keine Reststunden/VP-Antrag-Status. Diese Felder
/// ergänzen wir als Mock im UI (klar markiert), bis das Backend sie nachzieht.
class MobilePatient {
  final int serviceHistoryId;
  final int patientId;
  final String displayName;
  final String? firstName;
  final String? lastName;
  final String? addressLine;
  final String? city;
  final String? careDegree; // "1"-"5" als String vom Patti
  final bool active;
  final bool isPrimary;
  final String? startedAt;

  const MobilePatient({
    required this.serviceHistoryId,
    required this.patientId,
    required this.displayName,
    this.firstName,
    this.lastName,
    this.addressLine,
    this.city,
    this.careDegree,
    required this.active,
    required this.isPrimary,
    this.startedAt,
  });

  factory MobilePatient.fromJson(Map<String, dynamic> json) {
    return MobilePatient(
      serviceHistoryId: json['service_history_id'] as int,
      patientId: json['patient_id'] as int,
      displayName: json['display_name'] as String,
      firstName: json['first_name'] as String?,
      lastName: json['last_name'] as String?,
      addressLine: json['address_line'] as String?,
      city: json['city'] as String?,
      careDegree: json['care_degree'] as String?,
      active: json['active'] as bool,
      isPrimary: json['is_primary'] as bool,
      startedAt: json['started_at'] as String?,
    );
  }

  /// Pflegegrad als int (1-5). Wenn der Patti-Wert nicht parsbar ist → 0.
  int get pflegegradInt {
    final cd = careDegree;
    if (cd == null) return 0;
    return int.tryParse(cd.replaceAll(RegExp(r'[^0-9]'), '')) ?? 0;
  }

  /// Initialen für Avatar.
  String get initials {
    final parts = displayName.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts.first[0] + parts.last[0]).toUpperCase();
  }
}
