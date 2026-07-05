import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/util/severity.dart';
import '../../../core/widgets/error_view.dart';
import '../../../core/widgets/skeleton.dart';
import '../data/incidents_repository.dart';
import '../domain/incident.dart';

final _incidentsRepoProvider = Provider<IncidentsRepository>((ref) => IncidentsRepository(ref.watch(apiClientProvider)));
final incidentsProvider = FutureProvider.autoDispose<List<Incident>>((ref) => ref.watch(_incidentsRepoProvider).all());

/// Incidencias de la flota (página completa): abiertas primero.
class IncidentsScreen extends ConsumerWidget {
  const IncidentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(incidentsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Incidencias')),
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
              itemBuilder: (context, i) => _IncidentCard(incident: sorted[i]),
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
  const _IncidentCard({required this.incident});
  final Incident incident;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    final sev = SeverityStyle.of(incident.severity);
    final open = incident.isOpen;
    return Card(
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
    );
  }
}
