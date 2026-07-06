import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/design/motion.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/error_view.dart';
import '../../../core/widgets/skeleton.dart';
import '../data/drivers_repository.dart';
import '../domain/driver_rank.dart';

final _driversRepoProvider = Provider<DriversRepository>((ref) => DriversRepository(ref.watch(apiClientProvider)));
final driversRankingProvider = FutureProvider.autoDispose<List<DriverRank>>((ref) => ref.watch(_driversRepoProvider).ranking());

/// Ranking de conductores por puntuación (página completa).
class DriversScreen extends ConsumerWidget {
  const DriversScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(driversRankingProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Conductores')),
      body: RefreshIndicator(
        color: AppTheme.brand,
        onRefresh: () => ref.refresh(driversRankingProvider.future),
        child: async.when(
          data: (list) => list.isEmpty
              ? _empty(context)
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                  itemCount: list.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 10),
                  itemBuilder: (context, i) =>
                      _DriverCard(rank: i + 1, driver: list[i]).entrance(index: i.clamp(0, 6)),
                ),
          loading: () => Shimmer(
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              itemCount: 8,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (_, _) => const SkeletonBox(height: 64, radius: 14),
            ),
          ),
          error: (e, _) => ErrorView(message: e.toString(), onRetry: () => ref.invalidate(driversRankingProvider)),
        ),
      ),
    );
  }

  Widget _empty(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    return ListView(children: [
      SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.6,
        child: Center(child: Text('Sin conductores', style: TextStyle(color: muted))),
      ),
    ]);
  }
}

class _DriverCard extends StatelessWidget {
  const _DriverCard({required this.rank, required this.driver});
  final int rank;
  final DriverRank driver;

  Color get _scoreColor => driver.score >= 85
      ? AppTheme.success
      : driver.score >= 60
          ? AppTheme.warning
          : AppTheme.danger;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    final medal = rank <= 3;
    final medalColor = [const Color(0xFFFFD700), const Color(0xFFC0C0C0), const Color(0xFFCD7F32)];
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            SizedBox(
              width: 34,
              child: medal
                  ? Icon(Icons.emoji_events_rounded, color: medalColor[rank - 1], size: 26)
                  : Text('$rank', textAlign: TextAlign.center, style: TextStyle(color: muted, fontWeight: FontWeight.w700, fontSize: 16)),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(driver.name.isNotEmpty ? driver.name : 'Conductor', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                  if (driver.center != null || driver.inspections != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      [
                        if (driver.center != null) driver.center!,
                        if (driver.inspections != null) '${driver.inspections} inspecciones',
                      ].join(' · '),
                      style: TextStyle(color: muted, fontSize: 12.5),
                    ),
                  ],
                ],
              ),
            ),
            Container(
              width: 46, height: 46,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: _scoreColor.withValues(alpha: 0.14), shape: BoxShape.circle),
              child: Text('${driver.score}', style: TextStyle(color: _scoreColor, fontWeight: FontWeight.w900, fontSize: 16)),
            ),
          ],
        ),
      ),
    );
  }
}
