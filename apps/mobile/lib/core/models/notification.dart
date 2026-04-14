class AppNotification {
  final int id;
  final String kind;
  final String title;
  final String? body;
  final int? relatedPatientId;
  final int? relatedEntityId;
  final DateTime? readAt;
  final DateTime createdAt;

  AppNotification({
    required this.id,
    required this.kind,
    required this.title,
    this.body,
    this.relatedPatientId,
    this.relatedEntityId,
    this.readAt,
    required this.createdAt,
  });

  bool get isUnread => readAt == null;

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    return AppNotification(
      id: json['id'] as int,
      kind: json['kind'] as String,
      title: json['title'] as String,
      body: json['body'] as String?,
      relatedPatientId: json['related_patient_id'] as int?,
      relatedEntityId: json['related_entity_id'] as int?,
      readAt: json['read_at'] != null
          ? DateTime.parse(json['read_at'] as String)
          : null,
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }
}
