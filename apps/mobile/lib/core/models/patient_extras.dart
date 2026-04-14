class PatientExtras {
  final int patientId;
  final String? emergencyContactName;
  final String? emergencyContactPhone;
  final DateTime? contractSignedAt;
  final bool hasContract;

  const PatientExtras({
    required this.patientId,
    this.emergencyContactName,
    this.emergencyContactPhone,
    this.contractSignedAt,
    required this.hasContract,
  });

  factory PatientExtras.fromJson(Map<String, dynamic> json) {
    final signedRaw = json['contract_signed_at'] as String?;
    return PatientExtras(
      patientId: json['patient_id'] as int,
      emergencyContactName: json['emergency_contact_name'] as String?,
      emergencyContactPhone: json['emergency_contact_phone'] as String?,
      contractSignedAt: signedRaw != null ? DateTime.parse(signedRaw) : null,
      hasContract: json['has_contract'] as bool? ?? false,
    );
  }

  bool get hasEmergencyContact =>
      emergencyContactName != null &&
      emergencyContactName!.isNotEmpty &&
      emergencyContactPhone != null &&
      emergencyContactPhone!.isNotEmpty;
}

/// Gründe für einen Call-Request vom Büro.
enum CallReason {
  rueckfrage('rueckfrage', 'Rückfrage'),
  umzug('umzug', 'Umzug'),
  termin('termin', 'Terminänderung'),
  dokumentation('dokumentation', 'Dokumentation'),
  pflegeaenderung('pflegeaenderung', 'Pflegegrad-Änderung'),
  sonstiges('sonstiges', 'Sonstiges');

  final String apiValue;
  final String label;
  const CallReason(this.apiValue, this.label);
}
