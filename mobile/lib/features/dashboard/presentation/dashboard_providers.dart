import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../data/dashboard_repository.dart';
import '../domain/dashboard_stats.dart';

final dashboardRepositoryProvider = Provider<DashboardRepository>(
  (ref) => DashboardRepository(ref.watch(apiClientProvider)),
);

/// Estadísticas del dashboard. `autoDispose` para refrescar con pull-to-refresh
/// (invalidate) y liberar cuando no se ve.
final dashboardStatsProvider = FutureProvider.autoDispose<DashboardStats>(
  (ref) => ref.watch(dashboardRepositoryProvider).fetch(),
);
