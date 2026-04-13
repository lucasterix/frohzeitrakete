class User {
  final int id;
  final String email;
  final String fullName;
  final String role;
  final bool isActive;
  final int? pattiPersonId;

  const User({
    required this.id,
    required this.email,
    required this.fullName,
    required this.role,
    required this.isActive,
    this.pattiPersonId,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] as int,
      email: json['email'] as String,
      fullName: json['full_name'] as String,
      role: json['role'] as String,
      isActive: json['is_active'] as bool,
      pattiPersonId: json['patti_person_id'] as int?,
    );
  }

  bool get isAdmin => role == 'admin';
}
