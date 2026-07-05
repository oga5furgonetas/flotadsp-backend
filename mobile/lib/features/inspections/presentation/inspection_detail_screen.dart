import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/util/severity.dart';
import '../../../core/widgets/app_network_image.dart';
import '../../../core/widgets/error_view.dart';
import '../../../core/widgets/photo_viewer.dart';
import '../../../core/widgets/skeleton.dart';
import '../domain/inspection_detail.dart';
import 'inspection_providers.dart';

/// Detalle de una inspección: cabecera, galería de fotos (con zoom y toggle
/// Original/Anotada), resumen, daños y acción de marcar como revisada. Los datos
/// salen del backend real; acepta un [initial] precargado (cola de revisión).
class InspectionDetailScreen extends ConsumerStatefulWidget {
  const InspectionDetailScreen({super.key, required this.inspectionId, this.initial});

  final String inspectionId;
  final InspectionDetail? initial;

  @override
  ConsumerState<InspectionDetailScreen> createState() => _InspectionDetailScreenState();
}

class _InspectionDetailScreenState extends ConsumerState<InspectionDetailScreen> {
  bool _showAnnotated = true;
  bool _marking = false;
  bool _reviewedLocally = false;

  Future<void> _markReviewed() async {
    setState(() => _marking = true);
    HapticFeedback.mediumImpact();
    try {
      await ref.read(inspectionRepositoryProvider).markReviewed(widget.inspectionId);
      ref.invalidate(reviewQueueProvider);
      if (!mounted) return;
      setState(() => _reviewedLocally = true);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Inspección marcada como revisada')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('No se pudo marcar: $e')));
    } finally {
      if (mounted) setState(() => _marking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.initial != null) {
      return _body(widget.initial!, reviewed: _reviewedLocally);
    }
    final async = ref.watch(inspectionDetailProvider(widget.inspectionId));
    return async.when(
      data: (d) => _body(d, reviewed: d.reviewed || _reviewedLocally),
      loading: () => const Scaffold(body: _DetailSkeleton()),
      error: (e, _) => Scaffold(
        appBar: AppBar(title: const Text('Inspección')),
        body: ErrorView(
          message: e.toString(),
          onRetry: () => ref.invalidate(inspectionDetailProvider(widget.inspectionId)),
        ),
      ),
    );
  }

  Widget _body(InspectionDetail d, {required bool reviewed}) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    final sev = SeverityStyle.of(d.severity);
    final hasAnnotated = d.photos.any((p) => p.annotatedUrl != null);
    final urls = d.photos
        .map((p) => (_showAnnotated && p.annotatedUrl != null) ? p.annotatedUrl! : p.url)
        .toList();

    return Scaffold(
      appBar: AppBar(title: Text(d.vehiclePlate ?? 'Inspección')),
      bottomNavigationBar: reviewed
          ? const _ReviewedBar()
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: FilledButton.icon(
                  onPressed: _marking ? null : _markReviewed,
                  icon: _marking
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white))
                      : const Icon(Icons.check_circle_rounded, size: 20),
                  label: const Text('Marcar como revisada'),
                ),
              ),
            ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _HeaderCard(detail: d, sev: sev),
          if (d.plateMismatch) ...[
            const SizedBox(height: 12),
            const _Banner(color: AppTheme.danger, icon: Icons.warning_amber_rounded, text: 'La matrícula leída no coincide con la del vehículo.'),
          ],
          for (final w in d.qualityWarnings) ...[
            const SizedBox(height: 8),
            _Banner(color: AppTheme.warning, icon: Icons.info_outline_rounded, text: w),
          ],
          if (urls.isNotEmpty) ...[
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(child: Text('Fotos (${urls.length})', style: Theme.of(context).textTheme.titleMedium)),
                if (hasAnnotated)
                  SegmentedButton<bool>(
                    style: const ButtonStyle(visualDensity: VisualDensity.compact),
                    segments: const [
                      ButtonSegment(value: true, label: Text('Anotada')),
                      ButtonSegment(value: false, label: Text('Original')),
                    ],
                    selected: {_showAnnotated},
                    onSelectionChanged: (s) => setState(() => _showAnnotated = s.first),
                  ),
              ],
            ),
            const SizedBox(height: 10),
            SizedBox(
              height: 130,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: urls.length,
                separatorBuilder: (_, _) => const SizedBox(width: 10),
                itemBuilder: (context, i) => GestureDetector(
                  onTap: () => PhotoViewerScreen.open(context, urls, i),
                  child: AppNetworkImage(url: urls[i], width: 180, height: 130, radius: 14),
                ),
              ),
            ),
          ],
          if (d.executiveSummary.isNotEmpty) ...[
            const SizedBox(height: 20),
            Text('Resumen', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Card(child: Padding(padding: const EdgeInsets.all(14), child: Text(d.executiveSummary, style: TextStyle(color: muted, height: 1.5)))),
          ],
          const SizedBox(height: 20),
          Text('Daños (${d.damages.length})', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          if (d.damages.isEmpty)
            Padding(padding: const EdgeInsets.symmetric(vertical: 12), child: Text('Sin daños detectados', style: TextStyle(color: muted)))
          else
            for (final dm in d.damages) ...[_DamageCard(damage: dm), const SizedBox(height: 8)],
          const SizedBox(height: 12),
        ],
      ),
    );
  }
}

class _HeaderCard extends StatelessWidget {
  const _HeaderCard({required this.detail, required this.sev});
  final InspectionDetail detail;
  final SeverityStyle sev;

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
                Expanded(child: Text(_fmtDate(detail.date), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700))),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(color: sev.color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(99)),
                  child: Text(sev.label, style: TextStyle(color: sev.color, fontSize: 12, fontWeight: FontWeight.w700)),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              [
                if (detail.driver.isNotEmpty) detail.driver,
                if (detail.center != null) detail.center!,
              ].join(' · '),
              style: TextStyle(color: muted, fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }
}

class _DamageCard extends StatelessWidget {
  const _DamageCard({required this.damage});
  final DamageItem damage;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    final sev = SeverityStyle.of(damage.severity);
    final title = damage.label ?? damage.position ?? 'Daño';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(width: 8, height: 8, margin: const EdgeInsets.only(top: 5), decoration: BoxDecoration(color: sev.color, shape: BoxShape.circle)),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
                  if (damage.notes != null && damage.notes!.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(damage.notes!, style: TextStyle(color: muted, fontSize: 12.5)),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            Text(sev.label, style: TextStyle(color: sev.color, fontSize: 12, fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({required this.color, required this.icon, required this.text});
  final Color color;
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Icon(icon, color: color, size: 18),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: TextStyle(color: color, fontSize: 12.5))),
        ],
      ),
    );
  }
}

class _ReviewedBar extends StatelessWidget {
  const _ReviewedBar();
  @override
  Widget build(BuildContext context) {
    return const SafeArea(
      child: Padding(
        padding: EdgeInsets.all(16),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.check_circle_rounded, color: AppTheme.success, size: 20),
            SizedBox(width: 8),
            Text('Revisada', style: TextStyle(color: AppTheme.success, fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }
}

class _DetailSkeleton extends StatelessWidget {
  const _DetailSkeleton();
  @override
  Widget build(BuildContext context) {
    return Shimmer(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: const [
          SkeletonBox(height: 80, radius: 16),
          SizedBox(height: 20),
          SkeletonBox(width: 120, height: 18),
          SizedBox(height: 10),
          SkeletonBox(height: 130, radius: 14),
          SizedBox(height: 20),
          SkeletonBox(height: 60, radius: 14),
        ],
      ),
    );
  }
}

String _fmtDate(String? iso) {
  if (iso == null || iso.isEmpty) return 'Inspección';
  final d = DateTime.tryParse(iso);
  if (d == null) return iso;
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(d.day)}/${two(d.month)}/${d.year} · ${two(d.hour)}:${two(d.minute)}';
}
