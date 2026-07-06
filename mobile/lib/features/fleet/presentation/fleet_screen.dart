import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/design/motion.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/error_view.dart';
import '../../../core/widgets/skeleton.dart';
import '../domain/vehicle.dart';
import 'fleet_providers.dart';

/// Contenido de la pestaña "Flota": vehículos reales con filtro por centro y
/// búsqueda, skeleton loading, pull-to-refresh y estado de error/vacío.
class FleetScreen extends ConsumerWidget {
  const FleetScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(authControllerProvider).session;
    final centers = ['Todos', ...?session?.centers];
    final selected = ref.watch(fleetCenterProvider);
    final result = ref.watch(filteredVehiclesProvider);

    return Column(
      children: [
        if (centers.length > 1)
          SizedBox(
            height: 46,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              itemCount: centers.length,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (context, i) {
                final c = centers[i];
                return ChoiceChip(
                  label: Text(c),
                  selected: selected == c,
                  onSelected: (_) => ref.read(fleetCenterProvider.notifier).state = c,
                );
              },
            ),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
          child: TextField(
            onChanged: (v) => ref.read(fleetSearchProvider.notifier).state = v,
            decoration: const InputDecoration(
              hintText: 'Buscar por matrícula, marca o modelo',
              prefixIcon: Icon(Icons.search_rounded),
              isDense: true,
            ),
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            color: AppTheme.brand,
            onRefresh: () => ref.refresh(vehiclesProvider.future),
            child: result.when(
              data: (list) => list.isEmpty
                  ? _empty(context)
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 20),
                      itemCount: list.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 10),
                      itemBuilder: (context, i) => _VehicleTile(
                        vehicle: list[i],
                        onTap: () => context.push('/vehicle/${list[i].id}', extra: list[i]),
                      ).entrance(index: i.clamp(0, 6)),
                    ),
              loading: () => const _LoadingList(),
              error: (e, _) => ListView(
                children: [
                  SizedBox(
                    height: MediaQuery.sizeOf(context).height * 0.5,
                    child: ErrorView(
                      message: e.toString(),
                      onRetry: () => ref.invalidate(vehiclesProvider),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _empty(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    return ListView(
      children: [
        SizedBox(
          height: MediaQuery.sizeOf(context).height * 0.5,
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.local_shipping_outlined, size: 40, color: muted),
                const SizedBox(height: 12),
                Text('No hay vehículos que mostrar', style: TextStyle(color: muted)),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

const _statusMeta = {
  'active': ('Disponible', AppTheme.success),
  'taller': ('En taller', AppTheme.warning),
  'baja': ('Baja', Color(0xFF64748B)),
};

class _VehicleTile extends StatelessWidget {
  const _VehicleTile({required this.vehicle, this.onTap});
  final Vehicle vehicle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    final meta = _statusMeta[vehicle.status] ?? ('—', muted);

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: AppTheme.brand.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.local_shipping_rounded, color: AppTheme.brand, size: 22),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(vehicle.title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 2),
                  Text(
                    [
                      if (vehicle.subtitle.isNotEmpty) vehicle.subtitle,
                      if (vehicle.center != null) vehicle.center!,
                    ].join(' · '),
                    style: TextStyle(color: muted, fontSize: 12.5),
                  ),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: meta.$2.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(99),
              ),
              child: Text(meta.$1,
                  style: TextStyle(color: meta.$2, fontSize: 11, fontWeight: FontWeight.w700)),
            ),
          ],
          ),
        ),
      ),
    );
  }
}

class _LoadingList extends StatelessWidget {
  const _LoadingList();
  @override
  Widget build(BuildContext context) {
    return Shimmer(
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 20),
        itemCount: 8,
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (_, _) => const SkeletonBox(height: 72, radius: 16),
      ),
    );
  }
}
