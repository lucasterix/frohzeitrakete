class User {
  final int id;
  final String email;
  final String fullName;
  final String role;
  final bool isActive;
  final int? pattiPersonId;
  final double? overtimeBalanceHours;
  final double? targetHoursPerDay;
  final double? targetHoursPerWeek;

  const User({
    required this.id,
    required this.email,
    required this.fullName,
    required this.role,
    required this.isActive,
    this.pattiPersonId,
    this.overtimeBalanceHours,
    this.targetHoursPerDay,
    this.targetHoursPerWeek,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    double? n(dynamic v) => v == null ? null : (v as num).toDouble();
    return User(
      id: json['id'] as int,
      email: json['email'] as String,
      fullName: json['full_name'] as String,
      role: json['role'] as String,
      isActive: json['is_active'] as bool,
      pattiPersonId: json['patti_person_id'] as int?,
      overtimeBalanceHours: n(json['overtime_balance_hours']),
      targetHoursPerDay: n(json['target_hours_per_day']),
      targetHoursPerWeek: n(json['target_hours_per_week']),
    );
  }

  bool get isAdmin => role == 'admin';
}
