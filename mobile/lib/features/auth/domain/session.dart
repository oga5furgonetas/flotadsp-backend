import 'dart:convert';

/// Sesión del usuario autenticado. Se construye desde la respuesta de
/// `POST /auth/login` y se persiste (sin el token, que va aparte y cifrado).
class Session {
  const Session({
    required this.token,
    required this.id,
    required this.name,
    required this.role,
    this.accountType,
    this.slug,
    this.superAdmin = false,
    this.centers = const [],
  });

  final String token;
  final String id;
  final String name;
  final String role; // admin | driver | …
  final String? accountType;
  final String? slug;
  final bool superAdmin;
  final List<String> centers;

  bool get isAdmin => role == 'admin';

  /// Desde la respuesta del login (incluye el access_token).
  factory Session.fromLogin(Map<String, dynamic> json) {
    return Session(
      token: (json['access_token'] ?? '') as String,
      id: (json['id'] ?? '').toString(),
      name: (json['name'] ?? '') as String,
      role: (json['role'] ?? 'admin') as String,
      accountType: json['account_type'] as String?,
      slug: json['slug'] as String?,
      superAdmin: (json['super_admin'] ?? false) as bool,
      centers: _stringList(json['centers']),
    );
  }

  /// Reconstruye desde el almacenamiento (token cifrado se pasa aparte).
  factory Session.fromStorage(Map<String, dynamic> json, String token) {
    return Session(
      token: token,
      id: (json['id'] ?? '').toString(),
      name: (json['name'] ?? '') as String,
      role: (json['role'] ?? 'admin') as String,
      accountType: json['account_type'] as String?,
      slug: json['slug'] as String?,
      superAdmin: (json['super_admin'] ?? false) as bool,
      centers: _stringList(json['centers']),
    );
  }

  /// JSON persistido (sin token).
  String toStorageJson() => jsonEncode({
        'id': id,
        'name': name,
        'role': role,
        'account_type': accountType,
        'slug': slug,
        'super_admin': superAdmin,
        'centers': centers,
      });

  static List<String> _stringList(Object? v) =>
      v is List ? v.map((e) => e.toString()).toList() : const [];
}
