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
  final String? careDegree; // "pg1"-"pg5" vom Patti
  final int careDegreeInt; // vom Backend geparsed, 0 wenn unbekannt
  final String? insuranceNumber;
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
    this.careDegreeInt = 0,
    this.insuranceNumber,
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
      careDegreeInt: (json['care_degree_int'] as int?) ?? 0,
      insuranceNumber: json['insurance_number'] as String?,
      active: json['active'] as bool,
      isPrimary: json['is_primary'] as bool,
      startedAt: json['started_at'] as String?,
    );
  }

  /// Pflegegrad als int – bevorzugt backend-seitig geparsed, Fallback parse.
  int get pflegegradInt {
    if (careDegreeInt > 0) return careDegreeInt;
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
