import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/auth/data/auth_repository.dart';
import '../features/auth/presentation/auth_controller.dart';
import 'network/api_client.dart';
import 'storage/token_storage.dart';

/// Inyección de dependencias de la app (Riverpod). Grafo:
/// TokenStorage → ApiClient → AuthRepository → AuthController.
// Tipos explícitos en las variables para romper el ciclo de inferencia
// (apiClient ↔ authController vía la callback de 401, que es lazy en runtime).
final Provider<TokenStorage> tokenStorageProvider =
    Provider<TokenStorage>((ref) => TokenStorage());

final Provider<ApiClient> apiClientProvider = Provider<ApiClient>((ref) {
  final storage = ref.watch(tokenStorageProvider);
  return ApiClient(
    storage: storage,
    // Si CUALQUIER petición devuelve 401 → cerrar sesión al momento.
    onUnauthorized: () => ref.read(authControllerProvider.notifier).forceLogout(),
  );
});

final Provider<AuthRepository> authRepositoryProvider =
    Provider<AuthRepository>((ref) => AuthRepository(
          client: ref.watch(apiClientProvider),
          storage: ref.watch(tokenStorageProvider),
        ));

final StateNotifierProvider<AuthController, AuthState> authControllerProvider =
    StateNotifierProvider<AuthController, AuthState>((ref) {
  return AuthController(ref.watch(authRepositoryProvider))..restore();
});

/// Modo de tema (claro/oscuro/sistema). Por defecto sigue al sistema.
final themeModeProvider = StateProvider<ThemeMode>((ref) => ThemeMode.system);

/// Cabeceras HTTP con el token Bearer para peticiones fuera de [ApiClient]
/// (p. ej. `Image.network` a rutas del backend que exigen sesión). Se lee el
/// token del almacenamiento cifrado una sola vez y se cachea vía Riverpod.
/// Si la lectura falla (p. ej. plugin no disponible en tests), devuelve mapa
/// vacío en vez de propagar el error.
final authHeadersProvider = FutureProvider<Map<String, String>>((ref) async {
  try {
    final token = await ref.watch(tokenStorageProvider).readToken();
    if (token == null || token.isEmpty) return const <String, String>{};
    return {'Authorization': 'Bearer $token'};
  } catch (_) {
    return const <String, String>{};
  }
});
