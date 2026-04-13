/// Live-Budget eines Patienten, wie das Backend es aus Patti zieht.
///
/// Quelle: GET /mobile/patients/{id}/patti-budget?year=Y
class PatientBudget {
  final int patientId;
  final int year;

  /// Pflegesachleistung / Entlastungsbetrag
  final double careServiceRemainingHours;
  final double careServiceUsedHours;
  final int careServiceRemainingMoneyCents;

  /// Verhinderungspflege
  final double respiteCareRemainingHours;
  final int respiteCareRemainingMoneyCents;

  const PatientBudget({
    required this.patientId,
    required this.year,
    required this.careServiceRemainingHours,
    required this.careServiceUsedHours,
    required this.careServiceRemainingMoneyCents,
    required this.respiteCareRemainingHours,
    required this.respiteCareRemainingMoneyCents,
  });

  factory PatientBudget.fromJson(Map<String, dynamic> json) {
    return PatientBudget(
      patientId: json['patient_id'] as int,
      year: json['year'] as int,
      careServiceRemainingHours:
          (json['care_service_remaining_hours'] as num).toDouble(),
      careServiceUsedHours:
          (json['care_service_used_hours'] as num).toDouble(),
      careServiceRemainingMoneyCents:
          json['care_service_remaining_money_cents'] as int,
      respiteCareRemainingHours:
          (json['respite_care_remaining_hours'] as num).toDouble(),
      respiteCareRemainingMoneyCents:
          json['respite_care_remaining_money_cents'] as int,
    );
  }

  double get careServiceTotalHours =>
      careServiceRemainingHours + careServiceUsedHours;

  double get careServiceProgress {
    final total = careServiceTotalHours;
    if (total <= 0) return 0.0;
    return (careServiceUsedHours / total).clamp(0.0, 1.0);
  }
}
