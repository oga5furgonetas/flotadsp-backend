import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/design/motion.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/error_view.dart';
import '../../../core/widgets/skeleton.dart';
import '../domain/dashboard_stats.dart';
import 'dashboard_providers.dart';

/// Contenido de la pestaña "Resumen": estadísticas reales del backend, con
/// skeleton loading, pull-to-refresh y estado de error.
class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(dashboardStatsProvider);
    final name = ref.watch(authControllerProvider).session?.name ?? '';

    return RefreshIndicator(
      color: AppTheme.brand,
      onRefresh: () => ref.refresh(dashboardStatsProvider.future),
      child: async.when(
        data: (stats) => _Content(stats: stats, userName: name),
        loading: () => const _LoadingSkeleton(),
        error: (e, _) => ListView(
          // ListView para que el pull-to-refresh funcione también en error.
          children: [
            SizedBox(
              height: MediaQuery.sizeOf(context).height * 0.6,
              child: ErrorView(
                message: e.toString(),
                onRetry: () => ref.invalidate(dashboardStatsProvider),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Content extends StatelessWidget {
  const _Content({required this.stats, required this.userName});
  final DashboardStats stats;
  final String userName;

  @override
  Widget build(BuildContext context) {
    final cards = [
      _StatData('Furgonetas', stats.totalVehicles, Icons.local_shipping_rounded, AppTheme.info),
      _StatData('Conductores', stats.totalDrivers, Icons.people_alt_rounded, const Color(0xFFA78BFA)),
      _StatData('Inspecciones', stats.totalInspections, Icons.fact_check_rounded, AppTheme.success),
      _StatData('En taller', stats.vehiclesInWorkshop, Icons.build_rounded, AppTheme.warning),
      _StatData('Alertas', stats.unreadAlerts, Icons.notifications_active_rounded, AppTheme.brand),
      _StatData('Incidencias', stats.openIncidents, Icons.report_problem_rounded, AppTheme.danger),
    ];

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        _GreetingHeader(name: userName).entrance(),
        const SizedBox(height: 16),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          childAspectRatio: 1.55,
          children: [
            for (var i = 0; i < cards.length; i++)
              _StatCard(data: cards[i]).entrance(index: i + 1),
          ],
        ),
        const SizedBox(height: 20),
        _SectionTitle('Estado de la flota').entrance(index: 7),
        const SizedBox(height: 10),
        _SeverityBreakdown(severity: stats.severity).entrance(index: 8),
        const SizedBox(height: 20),
        if (stats.weekly.isNotEmpty) ...[
          _SectionTitle('Inspecciones · últimos días').entrance(index: 9),
          const SizedBox(height: 10),
          _WeeklyChart(data: stats.weekly).entrance(index: 10),
        ],
      ],
    );
  }
}

/// Cabecera de bienvenida: saludo según la hora + primer nombre.
class _GreetingHeader extends StatelessWidget {
  const _GreetingHeader({required this.name});
  final String name;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    final hour = DateTime.now().hour;
    final greeting = hour < 6
        ? 'Buenas noches'
        : hour < 13
            ? 'Buenos días'
            : hour < 21
                ? 'Buenas tardes'
                : 'Buenas noches';
    final first = name.trim().split(' ').first;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          first.isEmpty ? greeting : '$greeting, $first',
          style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: -0.5),
        ),
        const SizedBox(height: 2),
        Text('Aquí tienes el estado de tu flota hoy',
            style: TextStyle(color: muted, fontSize: 13.5)),
      ],
    );
  }
}

class _StatData {
  const _StatData(this.label, this.value, this.icon, this.color);
  final String label;
  final int value;
  final IconData icon;
  final Color color;
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.data});
  final _StatData data;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: data.color.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(data.icon, color: data.color, size: 20),
            ),
            Text('${data.value}',
                style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900)),
            Text(data.label, style: TextStyle(color: muted, fontSize: 12.5)),
          ],
        ),
      ),
    );
  }
}

const _sevOrder = ['sin_danos', 'leve', 'moderado', 'grave', 'critico'];
const _sevLabels = {
  'sin_danos': 'Sin daños',
  'leve': 'Leve',
  'moderado': 'Moderado',
  'grave': 'Grave',
  'critico': 'Crítico',
};
const _sevColors = {
  'sin_danos': AppTheme.success,
  'leve': Color(0xFFFBBF24),
  'moderado': AppTheme.warning,
  'grave': Color(0xFFF87171),
  'critico': AppTheme.danger,
};

class _SeverityBreakdown extends StatelessWidget {
  const _SeverityBreakdown({required this.severity});
  final Map<String, int> severity;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    final total = _sevOrder.fold<int>(0, (s, k) => s + (severity[k] ?? 0));
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(99),
              child: SizedBox(
                height: 10,
                child: total == 0
                    ? Container(color: muted.withValues(alpha: 0.2))
                    : Row(
                        children: [
                          for (final k in _sevOrder)
                            if ((severity[k] ?? 0) > 0)
                              Expanded(
                                flex: severity[k]!,
                                child: Container(color: _sevColors[k]),
                              ),
                        ],
                      ),
              ),
            ),
            const SizedBox(height: 14),
            ..._sevOrder.map((k) {
              final v = severity[k] ?? 0;
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(
                  children: [
                    Container(width: 9, height: 9, decoration: BoxDecoration(color: _sevColors[k], shape: BoxShape.circle)),
                    const SizedBox(width: 8),
                    Expanded(child: Text(_sevLabels[k]!, style: TextStyle(color: muted, fontSize: 13))),
                    Text('$v', style: const TextStyle(fontWeight: FontWeight.w700)),
                  ],
                ),
              );
            }),
          ],
        ),
      ),
    );
  }
}

class _WeeklyChart extends StatelessWidget {
  const _WeeklyChart({required this.data});
  final List<DailyActivity> data;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    final maxVal = data.map((d) => d.inspections).fold<int>(1, (a, b) => b > a ? b : a);
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
        child: Column(
          children: [
            SizedBox(
              height: 110,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  for (final d in data)
                    Expanded(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          Text('${d.inspections}', style: TextStyle(color: muted, fontSize: 10)),
                          const SizedBox(height: 4),
                          Container(
                            margin: const EdgeInsets.symmetric(horizontal: 4),
                            height: 78 * (d.inspections / maxVal),
                            decoration: BoxDecoration(
                              gradient: const LinearGradient(
                                colors: [AppTheme.brandLight, AppTheme.brand],
                                begin: Alignment.topCenter,
                                end: Alignment.bottomCenter,
                              ),
                              borderRadius: const BorderRadius.vertical(top: Radius.circular(5)),
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                for (final d in data)
                  Expanded(
                    child: Text(
                      d.date.length >= 10 ? d.date.substring(8, 10) : d.date,
                      textAlign: TextAlign.center,
                      style: TextStyle(color: muted, fontSize: 10),
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;
  @override
  Widget build(BuildContext context) =>
      Text(text, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700));
}

class _LoadingSkeleton extends StatelessWidget {
  const _LoadingSkeleton();
  @override
  Widget build(BuildContext context) {
    return Shimmer(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: 1.55,
            children: List.generate(6, (_) => const SkeletonBox(height: double.infinity, radius: 16)),
          ),
          const SizedBox(height: 20),
          const SkeletonBox(width: 160, height: 18),
          const SizedBox(height: 12),
          const SkeletonBox(height: 150, radius: 16),
        ],
      ),
    );
  }
}
