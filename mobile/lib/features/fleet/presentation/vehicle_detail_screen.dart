import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/design/motion.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/util/severity.dart';
import '../../../core/widgets/error_view.dart';
import '../../../core/widgets/skeleton.dart';
import '../../inspections/domain/inspection.dart';
import '../../inspections/presentation/inspection_providers.dart';
import '../domain/vehicle.dart';
import '../domain/vehicle_detail.dart';
import 'fleet_providers.dart';

/// Ficha completa de un vehículo: datos técnicos (VIN incluido), vencimientos
/// (ITV/renting), kilómetros y bolsas, conductor asignado, mantenimiento con
/// predicción, documentos e historial de inspecciones. Todo del backend real.
class VehicleDetailScreen extends ConsumerWidget {
  const VehicleDetailScreen({super.key, required this.vehicleId, this.vehicle});

  final String vehicleId;
  final Vehicle? vehicle;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final freshAsync = ref.watch(vehicleByIdProvider(vehicleId));
    // Muestra el vehículo pasado desde la lista al instante; lo sustituye por
    // los datos frescos del backend en cuanto llegan.
    final v = freshAsync.valueOrNull ?? vehicle;

    return Scaffold(
      appBar: AppBar(title: Text(v?.title ?? 'Vehículo')),
      body: v == null
          ? _whenNoVehicle(context, ref, freshAsync)
          : RefreshIndicator(
              color: AppTheme.brand,
              onRefresh: () => Future.wait([
                ref.refresh(vehicleByIdProvider(vehicleId).future),
                ref.refresh(vehicleMaintenanceProvider(vehicleId).future),
                ref.refresh(vehicleDocumentsProvider(vehicleId).future),
                ref.refresh(vehicleDriverProvider(vehicleId).future),
                ref.refresh(vehicleInspectionsProvider(vehicleId).future),
              ]),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
                children: [
                  _HeaderCard(vehicle: v).entrance(),
                  const SizedBox(height: 14),
                  _SpecsCard(vehicle: v).entrance(index: 1),
                  const SizedBox(height: 14),
                  _ExpiriesCard(vehicle: v).entrance(index: 2),
                  const SizedBox(height: 14),
                  _UsageCard(vehicle: v).entrance(index: 3),
                  const SizedBox(height: 14),
                  _DriverSection(vehicleId: vehicleId).entrance(index: 4),
                  const SizedBox(height: 14),
                  _MaintenanceSection(vehicleId: vehicleId).entrance(index: 5),
                  const SizedBox(height: 14),
                  _DocumentsSection(vehicleId: vehicleId).entrance(index: 6),
                  const SizedBox(height: 20),
                  _SectionTitle('Inspecciones'),
                  const SizedBox(height: 10),
                  _InspectionsSection(vehicleId: vehicleId),
                ],
              ),
            ),
    );
  }

  Widget _whenNoVehicle(BuildContext context, WidgetRef ref, AsyncValue<Vehicle> async) {
    return async.when(
      loading: () => const _DetailSkeleton(),
      error: (e, _) => ErrorView(
        message: e.toString(),
        onRetry: () => ref.invalidate(vehicleByIdProvider(vehicleId)),
      ),
      data: (_) => const _DetailSkeleton(),
    );
  }
}

// ─────────────────────────── Cabecera ───────────────────────────

const _statusMeta = {
  'active': ('Disponible', AppTheme.success, Icons.check_circle_rounded),
  'taller': ('En taller', AppTheme.warning, Icons.build_rounded),
  'baja': ('De baja', Color(0xFF64748B), Icons.block_rounded),
};

class _HeaderCard extends StatelessWidget {
  const _HeaderCard({required this.vehicle});
  final Vehicle vehicle;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    final meta = _statusMeta[vehicle.status] ?? ('—', const Color(0xFF64748B), Icons.help_outline_rounded);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    color: AppTheme.brand.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Icon(Icons.local_shipping_rounded, color: AppTheme.brand, size: 26),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(vehicle.title,
                          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, letterSpacing: -0.3)),
                      if (vehicle.subtitle.isNotEmpty)
                        Text(vehicle.subtitle, style: TextStyle(color: muted, fontSize: 13.5)),
                    ],
                  ),
                ),
                _StatusPill(label: meta.$1, color: meta.$2, icon: meta.$3),
              ],
            ),
            if (vehicle.status == 'taller' &&
                (vehicle.workshopReason ?? '').trim().isNotEmpty) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppTheme.warning.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.info_outline_rounded, color: AppTheme.warning, size: 18),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(vehicle.workshopReason!,
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.label, required this.color, required this.icon});
  final String label;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(99)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color, size: 14),
          const SizedBox(width: 5),
          Text(label, style: TextStyle(color: color, fontSize: 11.5, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

// ─────────────────────────── Datos técnicos ───────────────────────────

class _SpecsCard extends StatelessWidget {
  const _SpecsCard({required this.vehicle});
  final Vehicle vehicle;

  static const _fuelLabels = {
    'diesel': 'Diésel',
    'gasolina': 'Gasolina',
    'electrico': 'Eléctrico',
    'eléctrico': 'Eléctrico',
    'hibrido': 'Híbrido',
    'híbrido': 'Híbrido',
    'glp': 'GLP',
  };

  @override
  Widget build(BuildContext context) {
    final fuel = vehicle.fuelType == null
        ? null
        : (_fuelLabels[vehicle.fuelType!.toLowerCase()] ?? vehicle.fuelType);
    return _CardSection(
      title: 'Datos del vehículo',
      icon: Icons.directions_car_rounded,
      children: [
        if (vehicle.vin != null)
          _InfoRow(
            label: 'VIN / Bastidor',
            value: vehicle.vin!,
            mono: true,
            onCopy: () => _copy(context, vehicle.vin!, 'VIN copiado'),
          ),
        _InfoRow(label: 'Matrícula', value: vehicle.licensePlate.isNotEmpty ? vehicle.licensePlate : '—'),
        if (vehicle.brand.isNotEmpty || vehicle.model.isNotEmpty)
          _InfoRow(label: 'Marca / Modelo', value: [vehicle.brand, vehicle.model].where((s) => s.isNotEmpty).join(' ')),
        if (vehicle.year != null) _InfoRow(label: 'Año', value: '${vehicle.year}'),
        if (vehicle.color.isNotEmpty) _InfoRow(label: 'Color', value: vehicle.color),
        if (fuel != null) _InfoRow(label: 'Combustible', value: fuel),
        if ((vehicle.vehicleType ?? '').isNotEmpty) _InfoRow(label: 'Tipo', value: vehicle.vehicleType!),
        _InfoRow(label: 'Centro', value: vehicle.center ?? '—'),
      ],
    );
  }

  void _copy(BuildContext context, String text, String msg) {
    Clipboard.setData(ClipboardData(text: text));
    HapticFeedback.selectionClick();
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(msg)));
  }
}

// ─────────────────────────── Vencimientos ───────────────────────────

class _ExpiriesCard extends StatelessWidget {
  const _ExpiriesCard({required this.vehicle});
  final Vehicle vehicle;

  @override
  Widget build(BuildContext context) {
    final hasRenting = vehicle.isRenting;
    return _CardSection(
      title: 'Vencimientos',
      icon: Icons.event_available_rounded,
      children: [
        _ExpiryRow(label: 'ITV', date: vehicle.itvDate, level: vehicle.itvLevel),
        if (hasRenting) ...[
          if ((vehicle.provider ?? '').isNotEmpty)
            _InfoRow(label: 'Proveedor renting', value: vehicle.provider!),
          _ExpiryRow(label: 'Fin renting', date: vehicle.rentingEndDate, level: vehicle.rentingLevel),
        ],
      ],
    );
  }
}

class _ExpiryRow extends StatelessWidget {
  const _ExpiryRow({required this.label, required this.date, required this.level});
  final String label;
  final String? date;
  final ExpiryLevel level;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    final (color, tag) = switch (level) {
      ExpiryLevel.expired => (AppTheme.danger, 'Caducada'),
      ExpiryLevel.soon => (AppTheme.warning, 'Próxima'),
      ExpiryLevel.ok => (AppTheme.success, 'Al día'),
      ExpiryLevel.none => (muted, ''),
    };
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          SizedBox(width: 130, child: Text(label, style: TextStyle(color: muted, fontSize: 13))),
          Expanded(child: Text(_fmtDate(date), style: const TextStyle(fontWeight: FontWeight.w600))),
          if (level != ExpiryLevel.none)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
              decoration: BoxDecoration(color: color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(99)),
              child: Text(tag, style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w700)),
            ),
        ],
      ),
    );
  }
}

// ─────────────────────────── Uso: km + bolsas ───────────────────────────

class _UsageCard extends StatelessWidget {
  const _UsageCard({required this.vehicle});
  final Vehicle vehicle;

  @override
  Widget build(BuildContext context) {
    return _CardSection(
      title: 'Uso',
      icon: Icons.speed_rounded,
      children: [
        _InfoRow(
          label: 'Kilómetros',
          value: vehicle.mileage != null ? '${_thousands(vehicle.mileage!)} km' : '—',
        ),
        if (vehicle.bagsRemaining != null)
          _InfoRow(label: 'Bolsas', value: '${vehicle.bagsRemaining}'),
      ],
    );
  }
}

// ─────────────────────────── Conductor asignado ───────────────────────────

class _DriverSection extends ConsumerWidget {
  const _DriverSection({required this.vehicleId});
  final String vehicleId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(vehicleDriverProvider(vehicleId));
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    return _CardSection(
      title: 'Conductor asignado',
      icon: Icons.person_rounded,
      children: [
        async.when(
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: SkeletonBox(height: 40, radius: 10),
          ),
          error: (_, _) => Text('No se pudo cargar', style: TextStyle(color: muted)),
          data: (d) => d == null
              ? Text('Sin conductor asignado', style: TextStyle(color: muted))
              : Row(
                  children: [
                    CircleAvatar(
                      radius: 20,
                      backgroundColor: AppTheme.brand.withValues(alpha: 0.14),
                      child: Text(
                        d.name.isNotEmpty ? d.name.characters.first.toUpperCase() : '?',
                        style: const TextStyle(color: AppTheme.brand, fontWeight: FontWeight.w800),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(d.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                          if ((d.center ?? '').isNotEmpty)
                            Text(d.center!, style: TextStyle(color: muted, fontSize: 12.5)),
                        ],
                      ),
                    ),
                    if ((d.phone ?? '').isNotEmpty)
                      IconButton(
                        icon: const Icon(Icons.call_rounded, color: AppTheme.success),
                        onPressed: () => _dial(d.phone!),
                      ),
                  ],
                ),
        ),
      ],
    );
  }

  Future<void> _dial(String phone) async {
    final uri = Uri(scheme: 'tel', path: phone.replaceAll(' ', ''));
    if (await canLaunchUrl(uri)) await launchUrl(uri);
  }
}

// ─────────────────────────── Mantenimiento ───────────────────────────

class _MaintenanceSection extends ConsumerWidget {
  const _MaintenanceSection({required this.vehicleId});
  final String vehicleId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(vehicleMaintenanceProvider(vehicleId));
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    return _CardSection(
      title: 'Mantenimiento',
      icon: Icons.build_circle_rounded,
      children: [
        async.when(
          loading: () => Column(
            children: List.generate(
              2,
              (_) => const Padding(
                padding: EdgeInsets.symmetric(vertical: 6),
                child: SkeletonBox(height: 46, radius: 10),
              ),
            ),
          ),
          error: (_, _) => Text('No se pudo cargar', style: TextStyle(color: muted)),
          data: (m) {
            final items = m.items;
            if (items.isEmpty) {
              return Text('Sin datos de mantenimiento registrados', style: TextStyle(color: muted));
            }
            return Column(
              children: [
                if (m.kmPerDay != null) ...[
                  Row(
                    children: [
                      Icon(Icons.trending_up_rounded, size: 15, color: muted),
                      const SizedBox(width: 6),
                      Text('${m.kmPerDay!.toStringAsFixed(1)} km/día de media',
                          style: TextStyle(color: muted, fontSize: 12.5)),
                    ],
                  ),
                  const SizedBox(height: 8),
                ],
                for (final e in items) ...[
                  _MaintRow(label: e.label, item: e.item),
                  const SizedBox(height: 10),
                ],
              ],
            );
          },
        ),
      ],
    );
  }
}

class _MaintRow extends StatelessWidget {
  const _MaintRow({required this.label, required this.item});
  final String label;
  final MaintItem item;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    final color = item.overdue ? AppTheme.danger : (item.warning ? AppTheme.warning : AppTheme.success);
    final status = item.overdue
        ? 'Vencido'
        : (item.warning ? 'Próximo' : 'OK');
    final detail = item.overdue
        ? 'Pasado ${_thousands(-item.kmUntilChange)} km'
        : 'Faltan ${_thousands(item.kmUntilChange)} km'
            '${item.daysLeftEstimate != null ? ' · ~${item.daysLeftEstimate} días' : ''}';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(child: Text(label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14))),
            Text(status, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w700)),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(99),
          child: LinearProgressIndicator(
            value: item.progress,
            minHeight: 7,
            backgroundColor: muted.withValues(alpha: 0.18),
            valueColor: AlwaysStoppedAnimation(color),
          ),
        ),
        const SizedBox(height: 5),
        Text(detail, style: TextStyle(color: muted, fontSize: 12)),
      ],
    );
  }
}

// ─────────────────────────── Documentos ───────────────────────────

class _DocumentsSection extends ConsumerWidget {
  const _DocumentsSection({required this.vehicleId});
  final String vehicleId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(vehicleDocumentsProvider(vehicleId));
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    return _CardSection(
      title: 'Documentos',
      icon: Icons.folder_rounded,
      children: [
        async.when(
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: SkeletonBox(height: 40, radius: 10),
          ),
          error: (_, _) => Text('No se pudo cargar', style: TextStyle(color: muted)),
          data: (docs) => docs.isEmpty
              ? Text('Sin documentos', style: TextStyle(color: muted))
              : Column(
                  children: [
                    for (final doc in docs) _DocTile(doc: doc),
                  ],
                ),
        ),
      ],
    );
  }
}

class _DocTile extends StatelessWidget {
  const _DocTile({required this.doc});
  final VehicleDocument doc;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    final isPdf = doc.url.toLowerCase().endsWith('.pdf') || doc.name.toLowerCase().endsWith('.pdf');
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: () => _open(context),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: [
            Icon(isPdf ? Icons.picture_as_pdf_rounded : Icons.insert_drive_file_rounded,
                color: AppTheme.brand, size: 22),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(doc.docType.isNotEmpty ? doc.docType : doc.name,
                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                  Text(_fmtDate(doc.uploadedAt), style: TextStyle(color: muted, fontSize: 12)),
                ],
              ),
            ),
            Icon(Icons.open_in_new_rounded, size: 16, color: muted),
          ],
        ),
      ),
    );
  }

  Future<void> _open(BuildContext context) async {
    if (doc.url.isEmpty) return;
    final uri = Uri.tryParse(doc.url);
    if (uri == null) return;
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No se pudo abrir el documento')),
      );
    }
  }
}

// ─────────────────────────── Inspecciones ───────────────────────────

class _InspectionsSection extends ConsumerWidget {
  const _InspectionsSection({required this.vehicleId});
  final String vehicleId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final inspections = ref.watch(vehicleInspectionsProvider(vehicleId));
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    return inspections.when(
      data: (list) => list.isEmpty
          ? Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Center(child: Text('Sin inspecciones registradas', style: TextStyle(color: muted))),
            )
          : Column(
              children: [
                for (var i = 0; i < list.length; i++) ...[
                  _InspectionTile(inspection: list[i]).entrance(index: i.clamp(0, 6)),
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
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push('/inspection/${inspection.id}'),
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
              const SizedBox(width: 6),
              Icon(Icons.chevron_right_rounded, size: 18, color: muted),
            ],
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────── Reutilizables ───────────────────────────

class _CardSection extends StatelessWidget {
  const _CardSection({required this.title, required this.icon, required this.children});
  final String title;
  final IconData icon;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, size: 18, color: muted),
                const SizedBox(width: 8),
                Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
              ],
            ),
            const Divider(height: 22),
            ...children,
          ],
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value, this.mono = false, this.onCopy});
  final String label;
  final String value;
  final bool mono;
  final VoidCallback? onCopy;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 130, child: Text(label, style: TextStyle(color: muted, fontSize: 13))),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                fontWeight: FontWeight.w600,
                fontFeatures: mono ? const [FontFeature.tabularFigures()] : null,
                letterSpacing: mono ? 0.5 : null,
              ),
            ),
          ),
          if (onCopy != null)
            InkWell(
              onTap: onCopy,
              borderRadius: BorderRadius.circular(6),
              child: Padding(
                padding: const EdgeInsets.all(4),
                child: Icon(Icons.copy_rounded, size: 16, color: muted),
              ),
            ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;
  @override
  Widget build(BuildContext context) =>
      Text(text, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800));
}

class _DetailSkeleton extends StatelessWidget {
  const _DetailSkeleton();
  @override
  Widget build(BuildContext context) {
    return Shimmer(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
        children: const [
          SkeletonBox(height: 96, radius: 16),
          SizedBox(height: 14),
          SkeletonBox(height: 180, radius: 16),
          SizedBox(height: 14),
          SkeletonBox(height: 120, radius: 16),
          SizedBox(height: 14),
          SkeletonBox(height: 120, radius: 16),
        ],
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

String _fmtDate(String? iso) {
  if (iso == null || iso.isEmpty) return '—';
  final d = DateTime.tryParse(iso);
  if (d == null) return iso;
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(d.day)}/${two(d.month)}/${d.year}';
}
