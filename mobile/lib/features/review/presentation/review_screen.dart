import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/design/motion.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/util/severity.dart';
import '../../../core/widgets/error_view.dart';
import '../../../core/widgets/skeleton.dart';
import '../../inspections/domain/inspection_detail.dart';
import '../../inspections/presentation/inspection_providers.dart';

/// Pestaña "Revisión": cola de inspecciones pendientes de revisar. Al tocar una
/// se abre su detalle (ya precargado, sin petición extra) para validarla.
class ReviewScreen extends ConsumerWidget {
  const ReviewScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(authControllerProvider).session;
    final centers = ['Todos', ...?session?.centers];
    final selected = ref.watch(reviewCenterProvider);
    final queue = ref.watch(reviewQueueProvider);

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
                  onSelected: (_) => ref.read(reviewCenterProvider.notifier).state = c,
                );
              },
            ),
          ),
        Expanded(
          child: RefreshIndicator(
            color: AppTheme.brand,
            onRefresh: () => ref.refresh(reviewQueueProvider.future),
            child: queue.when(
              data: (list) => list.isEmpty ? _AllDone() : _List(items: list),
              loading: () => const _LoadingList(),
              error: (e, _) => ListView(children: [
                SizedBox(
                  height: MediaQuery.sizeOf(context).height * 0.6,
                  child: ErrorView(message: e.toString(), onRetry: () => ref.invalidate(reviewQueueProvider)),
                ),
              ]),
            ),
          ),
        ),
      ],
    );
  }
}

class _List extends StatelessWidget {
  const _List({required this.items});
  final List<InspectionDetail> items;

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
      itemCount: items.length,
      separatorBuilder: (_, _) => const SizedBox(height: 10),
      itemBuilder: (context, i) => _ReviewCard(item: items[i]).entrance(index: i.clamp(0, 6)),
    );
  }
}

class _ReviewCard extends StatelessWidget {
  const _ReviewCard({required this.item});
  final InspectionDetail item;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    final sev = SeverityStyle.of(item.severity);
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push('/inspection/${item.id}', extra: item),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 44, height: 44,
                decoration: BoxDecoration(color: sev.color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(12)),
                child: Icon(Icons.fact_check_rounded, color: sev.color, size: 22),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(item.vehiclePlate ?? '—', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                        if (item.plateMismatch) ...[
                          const SizedBox(width: 6),
                          const Icon(Icons.warning_amber_rounded, color: AppTheme.danger, size: 15),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      [
                        if (item.driver.isNotEmpty) item.driver,
                        _fmtDate(item.date),
                        if (item.newDamagesCount > 0) '${item.newDamagesCount} daños',
                      ].join(' · '),
                      style: TextStyle(color: muted, fontSize: 12.5),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(color: sev.color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(99)),
                child: Text(sev.label, style: TextStyle(color: sev.color, fontSize: 11, fontWeight: FontWeight.w700)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AllDone extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
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
              Text('Todo revisado', style: TextStyle(color: muted, fontSize: 15)),
            ],
          ),
        ),
      ),
    ]);
  }
}

class _LoadingList extends StatelessWidget {
  const _LoadingList();
  @override
  Widget build(BuildContext context) {
    return Shimmer(
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
        itemCount: 7,
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (_, _) => const SkeletonBox(height: 72, radius: 16),
      ),
    );
  }
}

String _fmtDate(String? iso) {
  if (iso == null || iso.isEmpty) return '';
  final d = DateTime.tryParse(iso);
  if (d == null) return iso;
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(d.day)}/${two(d.month)}';
}
