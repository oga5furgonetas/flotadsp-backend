// Campos privados con parámetros con nombre → no admiten "initializing formals".
// ignore_for_file: prefer_initializing_formals
import 'dart:convert';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/storage/token_storage.dart';
import '../domain/session.dart';

/// Único punto de acceso a la autenticación. La UI nunca habla con la red ni el
/// almacenamiento directamente: pasa por aquí.
class AuthRepository {
  AuthRepository({required ApiClient client, required TokenStorage storage})
      : _client = client,
        _storage = storage;

  final ApiClient _client;
  final TokenStorage _storage;

  /// Inicia sesión contra el backend real y persiste la sesión de forma segura.
  Future<Session> login({required String username, required String password}) async {
    final res = await _client.post<Map<String, dynamic>>(
      '/auth/login',
      data: {'username': username.trim(), 'password': password},
    );
    final data = res.data ?? const {};
    final token = data['access_token'];
    if (token is! String || token.isEmpty) {
      throw const BadRequestException('Respuesta de login inválida.');
    }
    final session = Session.fromLogin(data);
    if (!session.isAdmin) {
      // Esta app es la de GESTIÓN; los conductores usan su propio flujo.
      throw const BadRequestException('Esta app es para cuentas de gestión.');
    }
    await _storage.saveToken(session.token);
    await _storage.saveSession(session.toStorageJson());
    return session;
  }

  /// Restaura la sesión guardada al abrir la app (o null si no hay).
  Future<Session?> restore() async {
    final token = await _storage.readToken();
    final json = await _storage.readSession();
    if (token == null || token.isEmpty || json == null) return null;
    try {
      final map = jsonDecode(json) as Map<String, dynamic>;
      return Session.fromStorage(map, token);
    } catch (_) {
      await _storage.clear();
      return null;
    }
  }

  Future<void> logout() => _storage.clear();
}
