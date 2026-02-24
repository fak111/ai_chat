class User {
  final String id;
  final String email;
  final String? nickname;
  final String? avatarUrl;
  final int avatarChangesLeft;
  final DateTime createdAt;

  User({
    required this.id,
    required this.email,
    this.nickname,
    this.avatarUrl,
    this.avatarChangesLeft = 3,
    required this.createdAt,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] as String,
      email: json['email'] as String,
      nickname: json['nickname'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
      avatarChangesLeft: (json['avatarChangesLeft'] as int?) ?? 3,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'email': email,
      'nickname': nickname,
      'avatarUrl': avatarUrl,
      'avatarChangesLeft': avatarChangesLeft,
      'createdAt': createdAt.toIso8601String(),
    };
  }

  String get displayName => nickname ?? email.split('@').first;
}
