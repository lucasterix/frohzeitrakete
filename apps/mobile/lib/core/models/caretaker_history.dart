class CaretakerHistoryEntry {
  final int personId;
  final String name;
  final bool isPrimary;
  final String? startedAt;
  final String? endedAt;

  const CaretakerHistoryEntry({
    required this.personId,
    required this.name,
    required this.isPrimary,
    this.startedAt,
    this.endedAt,
  });

  factory CaretakerHistoryEntry.fromJson(Map<String, dynamic> json) {
    return CaretakerHistoryEntry(
      personId: json['person_id'] as int,
      name: json['name'] as String,
      isPrimary: json['is_primary'] as bool? ?? false,
      startedAt: json['started_at'] as String?,
      endedAt: json['ended_at'] as String?,
    );
  }

  bool get isActive => endedAt == null;

  /// Format "TT.MM.JJJJ" aus ISO-Date, "—" wenn null.
  static String formatDate(String? isoDate) {
    if (isoDate == null) return '—';
    try {
      final d = DateTime.parse(isoDate);
      return '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}.${d.year}';
    } catch (_) {
      return isoDate;
    }
  }
}
