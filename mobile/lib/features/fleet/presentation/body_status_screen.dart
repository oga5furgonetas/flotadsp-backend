import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/design/motion.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/util/severity.dart';
import '../../../core/widgets/error_view.dart';
import '../../../core/widgets/skeleton.dart';
import '../domain/damage_ledger.dart';
import 'fleet_providers.dart';

/// Gemelo digital (versión móvil): estado de la carrocería. Esquema de la
/// furgoneta con las zonas coloreadas por severidad de daño + lista de daños
/// abiertos y reparados. Datos reales del ledger del backend.
class BodyStatusScreen extends ConsumerWidget {
  const BodyStatusScreen({super.key, required this.vehicleId, this.title});

  final String vehicleId;
  final String? title;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(vehicleLedgerProvider(vehicleId));
    return Scaffold(
      appBar: AppBar(title: Text(title == null ? 'Carrocería' : 'Carrocería · $title')),
      body: RefreshIndicator(
        color: AppTheme.brand,
        onRefresh: () => ref.refresh(vehicleLedgerProvider(vehicleId).future),
        child: async.when(
          loading: () => Shimmer(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: const [
                SkeletonBox(height: 260, radius: 18),
                SizedBox(height: 16),
                SkeletonBox(height: 72, radius: 14),
                SizedBox(height: 10),
                SkeletonBox(height: 72, radius: 14),
              ],
            ),
          ),
          error: (e, _) => ErrorView(
            message: e.toString(),
            onRetry: () => ref.invalidate(vehicleLedgerProvider(vehicleId)),
          ),
          data: (ledger) => _Content(ledger: ledger),
        ),
      ),
    );
  }
}

class _Content extends StatelessWidget {
  const _Content({required this.ledger});
  final DamageLedger ledger;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    // Peor severidad por región (solo daños abiertos colorean el esquema).
    final regions = <BodyRegion, String>{};
    for (final e in ledger.open) {
      for (final r in _regionsFor(e.zone)) {
        final cur = regions[r];
        if (cur == null || _rank(e.severity) > _rank(cur)) regions[r] = e.severity;
      }
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 18, 16, 12),
            child: Column(
              children: [
                AspectRatio(
                  aspectRatio: 0.82,
                  child: CustomPaint(painter: _VanPainter(regions: regions, context: context)),
                ),
                const SizedBox(height: 12),
                const _Legend(),
              ],
            ),
          ),
        ).entrance(),
        const SizedBox(height: 18),
        Row(
          children: [
            const Icon(Icons.report_problem_rounded, size: 18, color: AppTheme.warning),
            const SizedBox(width: 8),
            Text('Daños abiertos', style: Theme.of(context).textTheme.titleMedium),
            const Spacer(),
            Text('${ledger.open.length}', style: TextStyle(color: muted, fontWeight: FontWeight.w700)),
          ],
        ),
        const SizedBox(height: 10),
        if (ledger.open.isEmpty)
          _EmptyLine(icon: Icons.verified_rounded, text: 'Sin daños abiertos', color: AppTheme.success)
        else
          for (var i = 0; i < ledger.open.length; i++) ...[
            _DamageTile(entry: ledger.open[i]).entrance(index: i.clamp(0, 6)),
            const SizedBox(height: 10),
          ],
        if (ledger.repaired.isNotEmpty) ...[
          const SizedBox(height: 18),
          Row(
            children: [
              const Icon(Icons.build_circle_rounded, size: 18, color: AppTheme.success),
              const SizedBox(width: 8),
              Text('Reparados', style: Theme.of(context).textTheme.titleMedium),
              const Spacer(),
              Text('${ledger.repaired.length}', style: TextStyle(color: muted, fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 10),
          for (final e in ledger.repaired) ...[
            _DamageTile(entry: e, repaired: true),
            const SizedBox(height: 10),
          ],
        ],
      ],
    );
  }
}

int _rank(String sev) => switch (sev) {
      'critico' => 4,
      'grave' => 3,
      'moderado' => 2,
      'leve' => 1,
      _ => 0,
    };

List<BodyRegion> _regionsFor(BodyZone z) => switch (z) {
      BodyZone.front => [BodyRegion.front],
      BodyZone.rear => [BodyRegion.rear],
      BodyZone.left => [BodyRegion.left],
      BodyZone.right => [BodyRegion.right],
      BodyZone.roof => [BodyRegion.center],
      BodyZone.body => [BodyRegion.center],
      BodyZone.frontLeft => [BodyRegion.front, BodyRegion.left],
      BodyZone.frontRight => [BodyRegion.front, BodyRegion.right],
      BodyZone.rearLeft => [BodyRegion.rear, BodyRegion.left],
      BodyZone.rearRight => [BodyRegion.rear, BodyRegion.right],
    };

enum BodyRegion { front, rear, left, right, center }

class _VanPainter extends CustomPainter {
  _VanPainter({required this.regions, required this.context});
  final Map<BodyRegion, String> regions;
  final BuildContext context;

  @override
  void paint(Canvas canvas, Size size) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    final base = Theme.of(context).extension<AppColors>()!.border;
    final w = size.width, h = size.height;
    final gap = w * 0.02;

    // Cuerpo de la furgoneta (vista cenital), esquinas redondeadas.
    final body = RRect.fromRectAndRadius(
      Rect.fromLTWH(w * 0.14, h * 0.03, w * 0.72, h * 0.94),
      Radius.circular(w * 0.10),
    );
    canvas.drawRRect(body, Paint()..color = base.withValues(alpha: 0.6));
    canvas.drawRRect(
      body,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5
        ..color = muted.withValues(alpha: 0.5),
    );

    final left = w * 0.14, right = w * 0.86, top = h * 0.03, bottom = h * 0.97;
    final innerW = right - left, innerH = bottom - top;
    final frontH = innerH * 0.24, rearH = innerH * 0.24;
    final sideW = innerW * 0.30;

    Rect region(BodyRegion r) {
      switch (r) {
        case BodyRegion.front:
          return Rect.fromLTWH(left + gap, top + gap, innerW - gap * 2, frontH - gap);
        case BodyRegion.rear:
          return Rect.fromLTWH(left + gap, bottom - rearH + gap * 0.5, innerW - gap * 2, rearH - gap * 1.5);
        case BodyRegion.left:
          return Rect.fromLTWH(left + gap, top + frontH + gap, sideW - gap, innerH - frontH - rearH - gap * 2);
        case BodyRegion.right:
          return Rect.fromLTWH(right - sideW + gap, top + frontH + gap, sideW - gap, innerH - frontH - rearH - gap * 2);
        case BodyRegion.center:
          return Rect.fromLTWH(left + sideW + gap, top + frontH + gap, innerW - sideW * 2 - gap * 2,
              innerH - frontH - rearH - gap * 2);
      }
    }

    const labels = {
      BodyRegion.front: 'Frontal',
      BodyRegion.rear: 'Trasera',
      BodyRegion.left: 'Izq.',
      BodyRegion.right: 'Der.',
      BodyRegion.center: 'Techo',
    };

    for (final r in BodyRegion.values) {
      final rect = region(r);
      final sev = regions[r];
      final color = sev == null ? muted.withValues(alpha: 0.10) : SeverityStyle.of(sev).color.withValues(alpha: 0.30);
      final borderC = sev == null ? muted.withValues(alpha: 0.25) : SeverityStyle.of(sev).color;
      final rr = RRect.fromRectAndRadius(rect, Radius.circular(w * 0.03));
      canvas.drawRRect(rr, Paint()..color = color);
      canvas.drawRRect(
        rr,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = sev == null ? 1 : 2
          ..color = borderC,
      );
      _text(canvas, rect, labels[r]!, muted, w);
    }

    // Indicador de "frente" (morro).
    final nose = Paint()..color = muted.withValues(alpha: 0.5);
    final noseY = top - h * 0.005;
    canvas.drawCircle(Offset(w * 0.5, noseY + h * 0.02), w * 0.012, nose);
  }

  void _text(Canvas canvas, Rect rect, String label, Color color, double w) {
    final tp = TextPainter(
      text: TextSpan(
        text: label,
        style: TextStyle(color: color, fontSize: w * 0.045, fontWeight: FontWeight.w700),
      ),
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: rect.width);
    tp.paint(canvas, Offset(rect.center.dx - tp.width / 2, rect.center.dy - tp.height / 2));
  }

  @override
  bool shouldRepaint(covariant _VanPainter old) => old.regions != regions;
}

class _Legend extends StatelessWidget {
  const _Legend();
  @override
  Widget build(BuildContext context) {
    const sevs = ['leve', 'moderado', 'grave', 'critico'];
    return Wrap(
      alignment: WrapAlignment.center,
      spacing: 14,
      runSpacing: 6,
      children: [
        for (final s in sevs)
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(width: 10, height: 10, decoration: BoxDecoration(color: SeverityStyle.of(s).color, shape: BoxShape.circle)),
              const SizedBox(width: 5),
              Text(SeverityStyle.of(s).label, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600)),
            ],
          ),
      ],
    );
  }
}

class _DamageTile extends StatelessWidget {
  const _DamageTile({required this.entry, this.repaired = false});
  final DamageEntry entry;
  final bool repaired;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    final sev = SeverityStyle.of(entry.severity);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: (repaired ? AppTheme.success : sev.color).withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(
                repaired ? Icons.check_rounded : Icons.warning_amber_rounded,
                color: repaired ? AppTheme.success : sev.color,
                size: 20,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(_cap(entry.label), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
                  const SizedBox(height: 2),
                  Text(
                    [
                      if (!repaired) sev.label else 'Reparado',
                      if (entry.firstSeen != null) 'desde ${_fmt(entry.firstSeen)}',
                    ].join(' · '),
                    style: TextStyle(color: muted, fontSize: 12.5),
                  ),
                ],
              ),
            ),
            if (!repaired)
              Container(
                width: 10, height: 10,
                decoration: BoxDecoration(color: sev.color, shape: BoxShape.circle),
              ),
          ],
        ),
      ),
    );
  }

  static String _cap(String s) => s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);
  static String _fmt(String? iso) {
    if (iso == null || iso.isEmpty) return '';
    final d = DateTime.tryParse(iso);
    if (d == null) return iso;
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(d.day)}/${two(d.month)}/${d.year}';
  }
}

class _EmptyLine extends StatelessWidget {
  const _EmptyLine({required this.icon, required this.text, required this.color});
  final IconData icon;
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(width: 12),
            Text(text, style: const TextStyle(fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}
