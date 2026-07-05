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
