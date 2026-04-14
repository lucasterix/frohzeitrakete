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
  final String? postalCode;
  final String? phone;
  final String? phoneLandline;
  final String? birthday; // "YYYY-MM-DD"
  final String? careDegree; // "pg1"-"pg5" vom Patti
  final int careDegreeInt; // vom Backend geparsed, 0 wenn unbekannt
  final String? insuranceNumber;
  final String? insuranceCompanyName;
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
    this.postalCode,
    this.phone,
    this.phoneLandline,
    this.birthday,
    this.careDegree,
    this.careDegreeInt = 0,
    this.insuranceNumber,
    this.insuranceCompanyName,
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
      postalCode: json['postal_code'] as String?,
      phone: json['phone'] as String?,
      phoneLandline: json['phone_landline'] as String?,
      birthday: json['birthday'] as String?,
      careDegree: json['care_degree'] as String?,
      careDegreeInt: (json['care_degree_int'] as int?) ?? 0,
      insuranceNumber: json['insurance_number'] as String?,
      insuranceCompanyName: json['insurance_company_name'] as String?,
      active: json['active'] as bool,
      isPrimary: json['is_primary'] as bool,
      startedAt: json['started_at'] as String?,
    );
  }

  /// Ganze Adresse inkl. PLZ.
  String? get fullAddress {
    final parts = <String>[];
    if (addressLine != null && addressLine!.isNotEmpty) parts.add(addressLine!);
    final cityLine = [
      if (postalCode != null && postalCode!.isNotEmpty) postalCode,
      if (city != null && city!.isNotEmpty) city,
    ].whereType<String>().join(' ');
    if (cityLine.isNotEmpty) parts.add(cityLine);
    return parts.isEmpty ? null : parts.join(', ');
  }

  DateTime? get birthdayDate {
    if (birthday == null) return null;
    return DateTime.tryParse(birthday!);
  }

  /// Tage bis zum nächsten Geburtstag. Null wenn kein Geburtstag hinterlegt.
  int? get daysUntilNextBirthday {
    final bd = birthdayDate;
    if (bd == null) return null;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    var next = DateTime(today.year, bd.month, bd.day);
    if (next.isBefore(today)) {
      next = DateTime(today.year + 1, bd.month, bd.day);
    }
    return next.difference(today).inDays;
  }

  /// true wenn der Patient privat versichert ist (Patti-Company "(Privat)" etc.).
  bool get isPrivat {
    final name = insuranceCompanyName?.toLowerCase() ?? '';
    return name.contains('privat');
  }

  /// Liste fehlender Pflichtfelder, die nachgetragen werden müssen.
  /// Bei Privatversicherten wird die Versichertennummer nicht als Pflicht gezählt.
  List<String> get missingFields {
    final missing = <String>[];
    if (phone == null || phone!.trim().isEmpty) missing.add('Telefonnummer');
    if (birthday == null || birthday!.trim().isEmpty) missing.add('Geburtsdatum');
    if (!isPrivat &&
        (insuranceNumber == null ||
            insuranceNumber!.trim().isEmpty ||
            insuranceNumber!.toLowerCase() == 'fehlt')) {
      missing.add('Versichertennummer');
    }
    if (insuranceCompanyName == null || insuranceCompanyName!.trim().isEmpty) {
      missing.add('Krankenkasse');
    }
    return missing;
  }

  bool get hasMissingData => missingFields.isNotEmpty;

  int? get age {
    final bd = birthdayDate;
    if (bd == null) return null;
    final now = DateTime.now();
    var years = now.year - bd.year;
    if (now.month < bd.month || (now.month == bd.month && now.day < bd.day)) {
      years -= 1;
    }
    return years;
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
