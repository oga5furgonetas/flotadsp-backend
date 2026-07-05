import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/util/severity.dart';
import '../../../core/widgets/error_view.dart';
import '../../../core/widgets/skeleton.dart';
import '../../inspections/domain/inspection.dart';
import '../../inspections/presentation/inspection_providers.dart';
import '../domain/vehicle.dart';

/// Ficha de un vehículo: datos + historial de inspecciones reales.
class VehicleDetailScreen extends ConsumerWidget {
  const VehicleDetailScreen({super.key, required this.vehicleId, this.vehicle});

  final String vehicleId;
  final Vehicle? vehicle;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final v = vehicle;
    final inspections = ref.watch(vehicleInspectionsProvider(vehicleId));
    final muted = Theme.of(context).extension<AppColors>()!.muted;

    return Scaffold(
      appBar: AppBar(title: Text(v?.title ?? 'Vehículo')),
      body: RefreshIndicator(
        color: AppTheme.brand,
        onRefresh: () => ref.refresh(vehicleInspectionsProvider(vehicleId).future),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (v != null) _HeaderCard(vehicle: v),
            const SizedBox(height: 20),
            Text('Inspecciones', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 10),
            inspections.when(
              data: (list) => list.isEmpty
                  ? Padding(
                      padding: const EdgeInsets.symmetric(vertical: 24),
                      child: Center(
                        child: Text('Sin inspecciones registradas', style: TextStyle(color: muted)),
                      ),
                    )
                  : Column(
                      children: [
                        for (final insp in list) ...[
                          _InspectionTile(inspection: insp),
                          const SizedBox(height: 10),
                        ],
                      ],
                    ),
              loading: () => Shimmer(
                child: Column(
                  children: List.generate(
                    4,
                    (_) => const Padding(
                      padding: EdgeInsets.only(bottom: 10),
                      child: SkeletonBox(height: 64, radius: 14),
                    ),
                  ),
                ),
              ),
              error: (e, _) => ErrorView(
                message: e.toString(),
                onRetry: () => ref.invalidate(vehicleInspectionsProvider(vehicleId)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

const _statusMeta = {
  'active': ('Disponible', AppTheme.success),
  'taller': ('En taller', AppTheme.warning),
  'baja': ('Baja', Color(0xFF64748B)),
};

class _HeaderCard extends StatelessWidget {
  const _HeaderCard({required this.vehicle});
  final Vehicle vehicle;

  @override
  Widget build(BuildContext context) {
    final meta = _statusMeta[vehicle.status] ?? ('—', const Color(0xFF64748B));
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(vehicle.title,
                      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
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
            if (vehicle.subtitle.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(vehicle.subtitle,
                  style: TextStyle(color: Theme.of(context).extension<AppColors>()!.muted)),
            ],
            const Divider(height: 24),
            _InfoRow(label: 'Centro', value: vehicle.center ?? '—'),
            _InfoRow(label: 'ITV', value: _fmtDate(vehicle.itvDate)),
            _InfoRow(
              label: 'Kilómetros',
              value: vehicle.mileage != null ? '${vehicle.mileage} km' : '—',
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          SizedBox(width: 100, child: Text(label, style: TextStyle(color: muted, fontSize: 13))),
          Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w600))),
        ],
      ),
    );
  }
}

class _InspectionTile extends StatelessWidget {
  const _InspectionTile({required this.inspection});
  final InspectionSummary inspection;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    final sev = SeverityStyle.of(inspection.severity);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: sev.color.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(Icons.fact_check_rounded, color: sev.color, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(_fmtDate(inspection.date), style: const TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 2),
                  Text(
                    [
                      if (inspection.driver.isNotEmpty) inspection.driver,
                      '${inspection.photoCount} fotos',
                      if (inspection.damageCount > 0) '${inspection.damageCount} daños',
                    ].join(' · '),
                    style: TextStyle(color: muted, fontSize: 12.5),
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(sev.label, style: TextStyle(color: sev.color, fontSize: 12, fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Icon(
                  inspection.reviewed ? Icons.check_circle_rounded : Icons.schedule_rounded,
                  size: 15,
                  color: inspection.reviewed ? AppTheme.success : muted,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

String _fmtDate(String? iso) {
  if (iso == null || iso.isEmpty) return '—';
  final d = DateTime.tryParse(iso);
  if (d == null) return iso;
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(d.day)}/${two(d.month)}/${d.year}';
}
