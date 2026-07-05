import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Guarda el JWT y la sesión de forma CIFRADA (Keychain en iOS, Keystore en
/// Android). Nunca en texto plano ni en SharedPreferences.
class TokenStorage {
  TokenStorage([FlutterSecureStorage? storage])
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
              iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
            );

  final FlutterSecureStorage _storage;

  static const _kToken = 'flotadsp_token';
  static const _kSession = 'flotadsp_session';

  Future<void> saveToken(String token) => _storage.write(key: _kToken, value: token);
  Future<String?> readToken() => _storage.read(key: _kToken);

  Future<void> saveSession(String json) => _storage.write(key: _kSession, value: json);
  Future<String?> readSession() => _storage.read(key: _kSession);

  Future<void> clear() async {
    await _storage.delete(key: _kToken);
    await _storage.delete(key: _kSession);
  }
}
