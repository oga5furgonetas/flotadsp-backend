import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../dashboard/presentation/dashboard_providers.dart';
import '../../dashboard/presentation/dashboard_screen.dart';
import '../../fleet/presentation/fleet_screen.dart';
import '../../review/presentation/review_screen.dart';
import 'home_tab.dart';
import 'more_screen.dart';

/// Shell principal tras el login: navegación por pestañas (bottom nav).
/// Cada pestaña conserva su estado (IndexedStack).
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  static const _titles = ['Resumen', 'Flota', 'Revisión', 'Más'];

  void _select(int i) {
    if (i == ref.read(homeTabProvider)) return;
    HapticFeedback.selectionClick();
    ref.read(homeTabProvider.notifier).state = i;
  }

  @override
  Widget build(BuildContext context) {
    final index = ref.watch(homeTabProvider);
    // Burbuja de alertas sin necesidad de estar en "Resumen" (comparte caché con
    // DashboardScreen, no hay doble fetch).
    final unread = ref.watch(dashboardStatsProvider).asData?.value.unreadAlerts ?? 0;

    return Scaffold(
      appBar: AppBar(title: Text(_titles[index])),
      body: IndexedStack(
        index: index,
        children: const [
          DashboardScreen(),
          FleetScreen(),
          ReviewScreen(),
          MoreScreen(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: _select,
        destinations: [
          NavigationDestination(
            icon: _WithBadge(count: unread, child: const Icon(Icons.dashboard_outlined)),
            selectedIcon: _WithBadge(count: unread, child: const Icon(Icons.dashboard_rounded)),
            label: 'Resumen',
          ),
          const NavigationDestination(
            icon: Icon(Icons.local_shipping_outlined),
            selectedIcon: Icon(Icons.local_shipping_rounded),
            label: 'Flota',
          ),
          const NavigationDestination(
            icon: Icon(Icons.fact_check_outlined),
            selectedIcon: Icon(Icons.fact_check_rounded),
            label: 'Revisión',
          ),
          const NavigationDestination(
            icon: Icon(Icons.grid_view_outlined),
            selectedIcon: Icon(Icons.grid_view_rounded),
            label: 'Más',
          ),
        ],
      ),
    );
  }
}

/// Envuelve un icono con una burbuja numérica si `count > 0`.
class _WithBadge extends StatelessWidget {
  const _WithBadge({required this.child, required this.count});
  final Widget child;
  final int count;

  @override
  Widget build(BuildContext context) {
    if (count <= 0) return child;
    return Badge(label: Text(count > 99 ? '99+' : '$count'), child: child);
  }
}
