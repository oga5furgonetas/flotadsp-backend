import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/design/motion.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/error_view.dart';
import '../../../core/widgets/skeleton.dart';
import '../data/maintenance_repository.dart';
import '../domain/maintenance_alert.dart';

final _maintenanceRepoProvider =
    Provider<MaintenanceRepository>((ref) => MaintenanceRepository(ref.watch(apiClientProvider)));

final maintenanceAlertsProvider = FutureProvider.autoDispose<List<MaintenanceAlert>>(
  (ref) => ref.watch(_maintenanceRepoProvider).alerts(),
);

/// Avisos de mantenimiento de toda la flota: furgonetas con aceite/ruedas/
/// pastillas vencidos o próximos, ordenadas por urgencia.
class MaintenanceAlertsScreen extends ConsumerWidget {
  const MaintenanceAlertsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(maintenanceAlertsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Avisos de mantenimiento')),
      body: RefreshIndicator(
        color: AppTheme.brand,
        onRefresh: () => ref.refresh(maintenanceAlertsProvider.future),
        child: async.when(
          data: (list) => list.isEmpty
              ? _empty(context)
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                  itemCount: list.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 10),
                  itemBuilder: (context, i) =>
                      _AlertCard(alert: list[i]).entrance(index: i.clamp(0, 6)),
                ),
          loading: () => Shimmer(
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              itemCount: 6,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (_, _) => const SkeletonBox(height: 72, radius: 14),
            ),
          ),
          error: (e, _) => ErrorView(
            message: e.toString(),
            onRetry: () => ref.invalidate(maintenanceAlertsProvider),
          ),
        ),
      ),
    );
  }

  Widget _empty(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    return ListView(children: [
      SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.6,
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.verified_rounded, size: 46, color: AppTheme.success),
              const SizedBox(height: 12),
              Text('Toda la flota al día', style: TextStyle(color: muted, fontSize: 15)),
            ],
          ),
        ),
      ),
    ]);
  }
}

const _kindIcons = {
  'oil': Icons.opacity_rounded,
  'ruedas': Icons.trip_origin_rounded,
  'pastillas': Icons.disc_full_rounded,
};

class _AlertCard extends StatelessWidget {
  const _AlertCard({required this.alert});
  final MaintenanceAlert alert;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    final color = alert.overdue ? AppTheme.danger : AppTheme.warning;
    final status = alert.overdue ? 'Vencido' : 'Próximo';
    final detail = alert.overdue
        ? 'Pasado ${_thousands(-alert.kmUntilChange)} km'
        : 'Faltan ${_thousands(alert.kmUntilChange)} km';
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push('/vehicle/${alert.vehicleId}'),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(color: color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(12)),
                child: Icon(_kindIcons[alert.kind] ?? Icons.build_rounded, color: color, size: 22),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      alert.licensePlate.isNotEmpty ? alert.licensePlate : alert.brand,
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      [
                        alert.label,
                        if ((alert.center ?? '').isNotEmpty) alert.center!,
                        detail,
                      ].join(' · '),
                      style: TextStyle(color: muted, fontSize: 12.5),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(color: color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(99)),
                child: Text(status, style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w700)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

String _thousands(int n) {
  final s = n.abs().toString();
  final buf = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) buf.write('.');
    buf.write(s[i]);
  }
  return '${n < 0 ? '-' : ''}$buf';
}
