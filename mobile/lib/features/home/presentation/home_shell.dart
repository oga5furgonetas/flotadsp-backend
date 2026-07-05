import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../dashboard/presentation/dashboard_providers.dart';
import '../../dashboard/presentation/dashboard_screen.dart';
import '../../fleet/presentation/fleet_screen.dart';
import '../../settings/presentation/settings_screen.dart';

/// Shell principal tras el login: navegación por pestañas (bottom nav).
/// Cada pestaña conserva su estado (IndexedStack).
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _index = 0;

  static const _titles = ['Resumen', 'Flota', 'Ajustes'];

  @override
  Widget build(BuildContext context) {
    // Escuchamos las stats para mostrar la burbuja de alertas sin leer sobre
    // la pestaña "Resumen". Comparte cache con DashboardScreen (no hay doble fetch).
    final unread = ref.watch(dashboardStatsProvider).asData?.value.unreadAlerts ?? 0;

    return Scaffold(
      appBar: AppBar(title: Text(_titles[_index])),
      body: IndexedStack(
        index: _index,
        children: const [
          DashboardScreen(),
          FleetScreen(),
          SettingsScreen(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          NavigationDestination(
            icon: _WithBadge(
              count: unread,
              child: const Icon(Icons.dashboard_outlined),
            ),
            selectedIcon: _WithBadge(
              count: unread,
              child: const Icon(Icons.dashboard_rounded),
            ),
            label: 'Resumen',
          ),
          const NavigationDestination(
            icon: Icon(Icons.local_shipping_outlined),
            selectedIcon: Icon(Icons.local_shipping_rounded),
            label: 'Flota',
          ),
          const NavigationDestination(
            icon: Icon(Icons.settings_outlined),
            selectedIcon: Icon(Icons.settings_rounded),
            label: 'Ajustes',
          ),
        ],
      ),
    );
  }
}

/// Envuelve un icono con una burbuja numérica si `count > 0`. Muestra `99+`
/// cuando el valor supera 99 para no romper la maquetación del NavigationBar.
class _WithBadge extends StatelessWidget {
  const _WithBadge({required this.child, required this.count});
  final Widget child;
  final int count;

  @override
  Widget build(BuildContext context) {
    if (count <= 0) return child;
    return Badge(
      label: Text(count > 99 ? '99+' : '$count'),
      child: child,
    );
  }
}
