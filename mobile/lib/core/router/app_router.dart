import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/presentation/auth_controller.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/home/presentation/home_shell.dart';
import '../providers.dart';
import '../widgets/splash_screen.dart';

/// Navegación centralizada con guard de sesión. Deep links preparados
/// (rutas nombradas). Redirige según el estado de autenticación.
final routerProvider = Provider<GoRouter>((ref) {
  // Puente entre el estado de auth (Riverpod) y go_router (Listenable).
  final refresh = ValueNotifier<int>(0);
  ref.listen(authControllerProvider, (_, _) => refresh.value++);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: '/splash',
    refreshListenable: refresh,
    routes: [
      GoRoute(path: '/splash', name: 'splash', builder: (_, _) => const SplashScreen()),
      GoRoute(path: '/login', name: 'login', builder: (_, _) => const LoginScreen()),
      GoRoute(path: '/home', name: 'home', builder: (_, _) => const HomeShell()),
    ],
    redirect: (context, state) {
      final status = ref.read(authControllerProvider).status;
      final loc = state.matchedLocation;

      // Aún restaurando sesión → splash.
      if (status == AuthStatus.unknown) {
        return loc == '/splash' ? null : '/splash';
      }
      final authed = status == AuthStatus.authenticated;
      if (!authed) return loc == '/login' ? null : '/login';
      // Autenticado: fuera de splash/login.
      if (loc == '/login' || loc == '/splash') return '/home';
      return null;
    },
  );
});
