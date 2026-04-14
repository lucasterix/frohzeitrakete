/// Typ des Einsatzes. Patient = normaler Betreuungseinsatz, Büro/Fortbildung
/// sind interne Arbeitszeit ohne Patient.
enum EntryType {
  patient('patient', 'Patient', '👤'),
  homeCommute('home_commute', 'Nach Hause', '🏠'),
  office('office', 'Büro', '🏢'),
  training('training', 'Fortbildung', '🎓'),
  other('other', 'Sonstiges', '📋');

  final String apiValue;
  final String label;
  final String icon;
  const EntryType(this.apiValue, this.label, this.icon);

  static EntryType fromApi(String value) {
    for (final t in EntryType.values) {
      if (t.apiValue == value) return t;
    }
    return EntryType.patient;
  }
}

class Entry {
  final int id;
  final int userId;
  final String? userName;
  final int? patientId;
  final EntryType entryType;
  final String? categoryLabel;
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
    this.patientId,
    this.entryType = EntryType.patient,
    this.categoryLabel,
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
      patientId: json['patient_id'] as int?,
      entryType: EntryType.fromApi((json['entry_type'] as String?) ?? 'patient'),
      categoryLabel: json['category_label'] as String?,
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
  bool get isPatientEntry => entryType == EntryType.patient;
}

/// Autocomplete-Vorschlag vom ORS Geocode Service.
class AddressSuggestion {
  final String label;
  final double longitude;
  final double latitude;

  const AddressSuggestion({
    required this.label,
    required this.longitude,
    required this.latitude,
  });

  factory AddressSuggestion.fromJson(Map<String, dynamic> json) {
    return AddressSuggestion(
      label: json['label'] as String,
      longitude: (json['longitude'] as num).toDouble(),
      latitude: (json['latitude'] as num).toDouble(),
    );
  }
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
