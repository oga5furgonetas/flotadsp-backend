import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/presentation/auth_controller.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/chat/presentation/chat_screen.dart';
import '../../features/drivers/presentation/drivers_screen.dart';
import '../../features/fleet/domain/vehicle.dart';
import '../../features/fleet/presentation/vehicle_detail_screen.dart';
import '../../features/home/presentation/home_shell.dart';
import '../../features/incidents/presentation/incidents_screen.dart';
import '../../features/inspections/domain/inspection_detail.dart';
import '../../features/inspections/presentation/inspection_detail_screen.dart';
import '../../features/maintenance/presentation/maintenance_alerts_screen.dart';
import '../../features/settings/presentation/settings_screen.dart';
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
      GoRoute(
        path: '/vehicle/:id',
        name: 'vehicle',
        builder: (context, state) => VehicleDetailScreen(
          vehicleId: state.pathParameters['id']!,
          vehicle: state.extra is Vehicle ? state.extra as Vehicle : null,
        ),
      ),
      GoRoute(
        path: '/inspection/:id',
        name: 'inspection',
        builder: (context, state) => InspectionDetailScreen(
          inspectionId: state.pathParameters['id']!,
          initial: state.extra is InspectionDetail ? state.extra as InspectionDetail : null,
        ),
      ),
      GoRoute(path: '/drivers', name: 'drivers', builder: (_, _) => const DriversScreen()),
      GoRoute(path: '/incidents', name: 'incidents', builder: (_, _) => const IncidentsScreen()),
      GoRoute(path: '/maintenance', name: 'maintenance', builder: (_, _) => const MaintenanceAlertsScreen()),
      GoRoute(path: '/chat', name: 'chat', builder: (_, _) => const ChatScreen()),
      GoRoute(
        path: '/settings',
        name: 'settings',
        builder: (_, _) => Scaffold(
          appBar: AppBar(title: const Text('Ajustes')),
          body: const SettingsScreen(),
        ),
      ),
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
