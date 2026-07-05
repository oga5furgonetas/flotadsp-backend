import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../data/auth_repository.dart';
import '../domain/session.dart';

enum AuthStatus { unknown, unauthenticated, authenticating, authenticated }

/// Estado inmutable de la autenticación. `unknown` = aún restaurando sesión
/// (evita parpadeos entre login y home al arrancar).
class AuthState {
  const AuthState({required this.status, this.session, this.error});

  final AuthStatus status;
  final Session? session;
  final String? error;

  bool get isAuthenticated => status == AuthStatus.authenticated;
  bool get isBusy => status == AuthStatus.authenticating;

  AuthState copyWith({AuthStatus? status, Session? session, String? error}) => AuthState(
        status: status ?? this.status,
        session: session ?? this.session,
        error: error,
      );
}

class AuthController extends StateNotifier<AuthState> {
  AuthController(this._repo) : super(const AuthState(status: AuthStatus.unknown));

  final AuthRepository _repo;

  /// Restaura la sesión guardada al arrancar.
  Future<void> restore() async {
    final session = await _repo.restore();
    state = session == null
        ? const AuthState(status: AuthStatus.unauthenticated)
        : AuthState(status: AuthStatus.authenticated, session: session);
  }

  Future<void> login({required String username, required String password}) async {
    state = const AuthState(status: AuthStatus.authenticating);
    try {
      final session = await _repo.login(username: username, password: password);
      state = AuthState(status: AuthStatus.authenticated, session: session);
    } on ApiException catch (e) {
      state = AuthState(status: AuthStatus.unauthenticated, error: e.message);
    } catch (_) {
      state = const AuthState(
        status: AuthStatus.unauthenticated,
        error: 'Ha ocurrido un error inesperado.',
      );
    }
  }

  Future<void> logout() async {
    await _repo.logout();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  /// Llamado por el interceptor al recibir 401 en cualquier petición.
  void forceLogout() {
    _repo.logout();
    state = const AuthState(
      status: AuthStatus.unauthenticated,
      error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
    );
  }
}
