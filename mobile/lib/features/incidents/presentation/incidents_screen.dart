import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/design/motion.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/util/severity.dart';
import '../../../core/widgets/error_view.dart';
import '../../../core/widgets/skeleton.dart';
import '../../fleet/domain/vehicle.dart';
import '../../fleet/presentation/fleet_providers.dart';
import '../data/incidents_repository.dart';
import '../domain/incident.dart';

final incidentsRepoProvider = Provider<IncidentsRepository>((ref) => IncidentsRepository(ref.watch(apiClientProvider)));
final incidentsProvider = FutureProvider.autoDispose<List<Incident>>((ref) => ref.watch(incidentsRepoProvider).all());

/// Incidencias de la flota (página completa): abiertas primero.
class IncidentsScreen extends ConsumerWidget {
  const IncidentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(incidentsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Incidencias')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => showModalBottomSheet<void>(
          context: context,
          isScrollControlled: true,
          useSafeArea: true,
          builder: (_) => const _NewIncidentSheet(),
        ),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Nueva'),
      ),
      body: RefreshIndicator(
        color: AppTheme.brand,
        onRefresh: () => ref.refresh(incidentsProvider.future),
        child: async.when(
          data: (list) {
            if (list.isEmpty) return _empty(context);
            final sorted = [...list]..sort((a, b) {
                if (a.isOpen != b.isOpen) return a.isOpen ? -1 : 1;
                return (b.createdAt ?? '').compareTo(a.createdAt ?? '');
              });
            return ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              itemCount: sorted.length,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (context, i) =>
                  _IncidentCard(
                    incident: sorted[i],
                    onToggle: () => _toggleStatus(context, ref, sorted[i]),
                  ).entrance(index: i.clamp(0, 6)),
            );
          },
          loading: () => Shimmer(
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              itemCount: 6,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (_, _) => const SkeletonBox(height: 78, radius: 14),
            ),
          ),
          error: (e, _) => ErrorView(message: e.toString(), onRetry: () => ref.invalidate(incidentsProvider)),
        ),
      ),
    );
  }

  Future<void> _toggleStatus(BuildContext context, WidgetRef ref, Incident incident) async {
    final resolving = incident.isOpen;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(resolving ? 'Resolver incidencia' : 'Reabrir incidencia'),
        content: Text(resolving
            ? '¿Marcar «${incident.title}» como resuelta?'
            : '¿Reabrir «${incident.title}»?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton(
            style: FilledButton.styleFrom(
                backgroundColor: resolving ? AppTheme.success : AppTheme.warning),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(resolving ? 'Resolver' : 'Reabrir'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(incidentsRepoProvider).setStatus(incident.id, resolved: resolving);
      ref.invalidate(incidentsProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(resolving ? 'Incidencia resuelta' : 'Incidencia reabierta')),
        );
      }
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('No se pudo actualizar')));
      }
    }
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
              const Icon(Icons.check_circle_outline_rounded, size: 44, color: AppTheme.success),
              const SizedBox(height: 12),
              Text('Sin incidencias abiertas', style: TextStyle(color: muted)),
            ],
          ),
        ),
      ),
    ]);
  }
}

class _IncidentCard extends StatelessWidget {
  const _IncidentCard({required this.incident, this.onToggle});
  final Incident incident;
  final VoidCallback? onToggle;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    final sev = SeverityStyle.of(incident.severity);
    final open = incident.isOpen;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onToggle,
        child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(incident.title, style: const TextStyle(fontWeight: FontWeight.w700), maxLines: 1, overflow: TextOverflow.ellipsis)),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                  decoration: BoxDecoration(
                    color: (open ? AppTheme.warning : AppTheme.success).withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(99),
                  ),
                  child: Text(open ? 'Abierta' : 'Resuelta',
                      style: TextStyle(color: open ? AppTheme.warning : AppTheme.success, fontSize: 11, fontWeight: FontWeight.w700)),
                ),
              ],
            ),
            if (incident.description.isNotEmpty && incident.description != incident.title) ...[
              const SizedBox(height: 4),
              Text(incident.description, style: TextStyle(color: muted, fontSize: 13), maxLines: 2, overflow: TextOverflow.ellipsis),
            ],
            const SizedBox(height: 8),
            Row(
              children: [
                Container(width: 8, height: 8, decoration: BoxDecoration(color: sev.color, shape: BoxShape.circle)),
                const SizedBox(width: 6),
                Text(sev.label, style: TextStyle(color: sev.color, fontSize: 12, fontWeight: FontWeight.w600)),
                const Spacer(),
                if (incident.createdBy != null)
                  Text(incident.createdBy!, style: TextStyle(color: muted, fontSize: 12)),
              ],
            ),
          ],
        ),
        ),
      ),
    );
  }
}

/// Formulario para crear una incidencia (selección de vehículo + severidad).
class _NewIncidentSheet extends ConsumerStatefulWidget {
  const _NewIncidentSheet();

  @override
  ConsumerState<_NewIncidentSheet> createState() => _NewIncidentSheetState();
}

class _NewIncidentSheetState extends ConsumerState<_NewIncidentSheet> {
  final _titleController = TextEditingController();
  final _descController = TextEditingController();
  String? _vehicleId;
  String _severity = 'leve';
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _titleController.dispose();
    _descController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_vehicleId == null) {
      setState(() => _error = 'Selecciona un vehículo');
      return;
    }
    final desc = _descController.text.trim();
    if (desc.isEmpty) {
      setState(() => _error = 'Describe la incidencia');
      return;
    }
    setState(() => _busy = true);
    try {
      await ref.read(incidentsRepoProvider).create(
            vehicleId: _vehicleId!,
            description: desc,
            title: _titleController.text.trim(),
            severity: _severity,
          );
      ref.invalidate(incidentsProvider);
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Incidencia creada')));
    } catch (e) {
      if (mounted) {
        setState(() => _error = e is Exception ? e.toString().replaceFirst('Exception: ', '') : 'No se pudo crear');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    final vehiclesAsync = ref.watch(vehiclesProvider);
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 40, height: 4,
                  decoration: BoxDecoration(color: muted.withValues(alpha: 0.4), borderRadius: BorderRadius.circular(99)),
                ),
              ),
              const SizedBox(height: 16),
              const Text('Nueva incidencia', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              const SizedBox(height: 16),
              vehiclesAsync.when(
                loading: () => const LinearProgressIndicator(),
                error: (_, _) => Text('No se pudieron cargar los vehículos', style: TextStyle(color: muted)),
                data: (vehicles) => DropdownButtonFormField<String>(
                  initialValue: _vehicleId,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Vehículo'),
                  items: [
                    for (final Vehicle v in vehicles)
                      DropdownMenuItem(value: v.id, child: Text(v.title, overflow: TextOverflow.ellipsis)),
                  ],
                  onChanged: (v) => setState(() => _vehicleId = v),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _titleController,
                decoration: const InputDecoration(labelText: 'Título (opcional)'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _descController,
                minLines: 2,
                maxLines: 4,
                decoration: const InputDecoration(labelText: 'Descripción'),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _severity,
                decoration: const InputDecoration(labelText: 'Gravedad'),
                items: const [
                  DropdownMenuItem(value: 'leve', child: Text('Leve')),
                  DropdownMenuItem(value: 'moderado', child: Text('Moderada')),
                  DropdownMenuItem(value: 'grave', child: Text('Grave')),
                  DropdownMenuItem(value: 'critico', child: Text('Crítica')),
                ],
                onChanged: (v) => setState(() => _severity = v ?? _severity),
              ),
              if (_error != null) ...[
                const SizedBox(height: 10),
                Text(_error!, style: const TextStyle(color: AppTheme.danger, fontSize: 12.5)),
              ],
              const SizedBox(height: 18),
              FilledButton(
                onPressed: _busy ? null : _save,
                child: _busy
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white))
                    : const Text('Crear incidencia'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
