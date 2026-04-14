class Entry {
  final int id;
  final int userId;
  final String? userName;
  final int patientId;
  final DateTime entryDate;
  final double hours;
  final List<String> activities;
  final String? note;
  final int? signatureEventId;
  final DateTime createdAt;
  final DateTime updatedAt;

  const Entry({
    required this.id,
    required this.userId,
    this.userName,
    required this.patientId,
    required this.entryDate,
    required this.hours,
    required this.activities,
    this.note,
    this.signatureEventId,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Entry.fromJson(Map<String, dynamic> json) {
    return Entry(
      id: json['id'] as int,
      userId: json['user_id'] as int,
      userName: json['user_name'] as String?,
      patientId: json['patient_id'] as int,
      entryDate: DateTime.parse(json['entry_date'] as String),
      hours: (json['hours'] as num).toDouble(),
      activities: (json['activities'] as List).cast<String>(),
      note: json['note'] as String?,
      signatureEventId: json['signature_event_id'] as int?,
      createdAt: DateTime.parse(json['created_at'] as String),
      updatedAt: DateTime.parse(json['updated_at'] as String),
    );
  }

  bool get isLocked => signatureEventId != null;
}

class PatientHoursSummary {
  final int patientId;
  final int year;
  final int month;
  final double usedHours;
  final int entriesCount;
  final bool isLocked;

  const PatientHoursSummary({
    required this.patientId,
    required this.year,
    required this.month,
    required this.usedHours,
    required this.entriesCount,
    required this.isLocked,
  });

  factory PatientHoursSummary.fromJson(Map<String, dynamic> json) {
    return PatientHoursSummary(
      patientId: json['patient_id'] as int,
      year: json['year'] as int,
      month: json['month'] as int,
      usedHours: (json['used_hours'] as num).toDouble(),
      entriesCount: json['entries_count'] as int,
      isLocked: json['is_locked'] as bool,
    );
  }
}
