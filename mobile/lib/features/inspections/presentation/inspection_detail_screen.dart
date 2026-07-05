import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/util/severity.dart';
import '../../../core/util/url.dart';
import '../../../core/widgets/authed_image.dart';
import '../../../core/widgets/error_view.dart';
import '../../../core/widgets/skeleton.dart';
import '../domain/inspection_detail.dart';
import 'inspection_providers.dart';
import 'review_sheet.dart';

/// Detalle de una inspección: cabecera, galería de fotos (con zoom a pantalla
/// completa y toggle Original/Anotada) y lista de daños detectados. Todo el
/// contenido se obtiene del backend real vía Riverpod (pull-to-refresh incluido).
class InspectionDetailScreen extends ConsumerWidget {
  const InspectionDetailScreen({super.key, required this.inspectionId});

  final String inspectionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(inspectionDetailProvider(inspectionId));
    final loaded = detail.asData?.value;

    return Scaffold(
      appBar: AppBar(title: const Text('Inspección')),
      floatingActionButton: loaded == null
          ? null
          : FloatingActionButton.extended(
              onPressed: () => _openReview(context, loaded),
              backgroundColor: loaded.reviewed ? AppTheme.success : AppTheme.brand,
              foregroundColor: Colors.white,
              icon: Icon(
                loaded.reviewed ? Icons.check_circle_rounded : Icons.rate_review_rounded,
              ),
              label: Text(loaded.reviewed ? 'Revisada' : 'Revisar'),
            ),
      body: RefreshIndicator(
        color: AppTheme.brand,
        onRefresh: () async {
          ref.invalidate(inspectionDetailProvider(inspectionId));
          ref.invalidate(inspectionAnnotatedProvider(inspectionId));
          await ref.read(inspectionDetailProvider(inspectionId).future);
        },
        child: detail.when(
          loading: () => const _LoadingSkeleton(),
          error: (e, _) => ListView(
            children: [
              SizedBox(
                height: MediaQuery.sizeOf(context).height * 0.6,
                child: ErrorView(
                  message: e.toString(),
                  onRetry: () => ref.invalidate(inspectionDetailProvider(inspectionId)),
                ),
              ),
            ],
          ),
          data: (d) => _Content(inspectionId: inspectionId, detail: d),
        ),
      ),
    );
  }

  Future<void> _openReview(BuildContext context, InspectionDetail detail) async {
    final saved = await ReviewSheet.show(context, detail);
    if (saved == true && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Row(
            children: [
              const Icon(Icons.check_circle_rounded, color: Colors.white, size: 18),
              const SizedBox(width: 8),
              Text(detail.reviewed
                  ? 'Inspección actualizada'
                  : 'Marcada como revisada'),
            ],
          ),
          duration: const Duration(seconds: 2),
        ),
      );
    }
  }
}

class _Content extends ConsumerStatefulWidget {
  const _Content({required this.inspectionId, required this.detail});
  final String inspectionId;
  final InspectionDetail detail;

  @override
  ConsumerState<_Content> createState() => _ContentState();
}

class _ContentState extends ConsumerState<_Content> {
  bool _showAnnotated = false;

  @override
  Widget build(BuildContext context) {
    final d = widget.detail;
    final annotatedAsync = ref.watch(inspectionAnnotatedProvider(widget.inspectionId));
    final annotated = annotatedAsync.asData?.value ?? const <String>[];
    final hasAnnotated = annotated.isNotEmpty;
    // Si el toggle está activo pero aún no hay datos, mostramos originales.
    final effectiveAnnotated = hasAnnotated && _showAnnotated;
    final resolvedOriginals = d.photos.map((p) => resolveImageUrl(p.url)).toList();
    final resolvedAnnotated = annotated.map(resolveImageUrl).toList();
    final galleryUrls = effectiveAnnotated ? resolvedAnnotated : resolvedOriginals;
    final galleryLabels = effectiveAnnotated
        ? List<String?>.filled(resolvedAnnotated.length, null)
        : d.photos.map((p) => p.label).toList();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _HeaderCard(detail: d),
        const SizedBox(height: 20),
        _SectionHeader(
          title: 'Fotos',
          trailing: hasAnnotated
              ? _AnnotatedToggle(
                  value: _showAnnotated,
                  onChanged: (v) => setState(() => _showAnnotated = v),
                )
              : null,
        ),
        const SizedBox(height: 10),
        _PhotoGallery(urls: galleryUrls, labels: galleryLabels),
        const SizedBox(height: 22),
        _SectionHeader(
          title: 'Daños',
          trailing: d.damages.isNotEmpty
              ? _CountPill(count: d.damages.length, color: AppTheme.brand)
              : null,
        ),
        const SizedBox(height: 10),
        if (d.damages.isEmpty)
          _EmptyBanner(
            icon: Icons.verified_rounded,
            text: 'Sin daños registrados en esta inspección.',
            color: AppTheme.success,
          )
        else
          Column(
            children: [
              for (final dmg in d.damages) ...[
                _DamageCard(damage: dmg),
                const SizedBox(height: 10),
              ],
            ],
          ),
        if ((d.notes ?? '').isNotEmpty) ...[
          const SizedBox(height: 22),
          _SectionHeader(title: 'Observaciones'),
          const SizedBox(height: 10),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Text(
                d.notes!,
                style: const TextStyle(fontSize: 14, height: 1.45),
              ),
            ),
          ),
        ],
        if ((d.adminNotes ?? '').isNotEmpty || d.reviewedBy != null || d.reviewedAt != null) ...[
          const SizedBox(height: 22),
          _SectionHeader(title: 'Revisión'),
          const SizedBox(height: 10),
          _ReviewCard(detail: d),
        ],
        // Espacio final generoso para que el FAB no tape la última tarjeta.
        const SizedBox(height: 96),
      ],
    );
  }
}

// ─── Cabecera ────────────────────────────────────────────────────────────────

class _HeaderCard extends StatelessWidget {
  const _HeaderCard({required this.detail});
  final InspectionDetail detail;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    final sev = SeverityStyle.of(detail.severity);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    _fmtDate(detail.date),
                    style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: sev.color.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(99),
                  ),
                  child: Text(
                    sev.label,
                    style: TextStyle(color: sev.color, fontSize: 11, fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ),
            if (detail.driver.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(detail.driver, style: TextStyle(color: muted)),
            ],
            const Divider(height: 24),
            if ((detail.vehiclePlate ?? '').isNotEmpty)
              _InfoRow(label: 'Vehículo', value: detail.vehiclePlate!),
            if ((detail.center ?? '').isNotEmpty)
              _InfoRow(label: 'Centro', value: detail.center!),
            _InfoRow(label: 'Fotos', value: '${detail.photos.length}'),
            _InfoRow(label: 'Daños nuevos', value: '${detail.newDamagesCount}'),
            _InfoRow(
              label: 'Revisada',
              value: detail.reviewed ? 'Sí' : 'Pendiente',
              icon: detail.reviewed ? Icons.check_circle_rounded : Icons.schedule_rounded,
              iconColor: detail.reviewed ? AppTheme.success : muted,
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.label,
    required this.value,
    this.icon,
    this.iconColor,
  });

  final String label;
  final String value;
  final IconData? icon;
  final Color? iconColor;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          SizedBox(width: 120, child: Text(label, style: TextStyle(color: muted, fontSize: 13))),
          Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w600))),
          if (icon != null) Icon(icon, size: 15, color: iconColor),
        ],
      ),
    );
  }
}

// ─── Galería ─────────────────────────────────────────────────────────────────

class _PhotoGallery extends StatefulWidget {
  const _PhotoGallery({required this.urls, required this.labels});
  final List<String> urls;
  final List<String?> labels;

  @override
  State<_PhotoGallery> createState() => _PhotoGalleryState();
}

class _PhotoGalleryState extends State<_PhotoGallery> {
  final PageController _pc = PageController(viewportFraction: 0.94);
  int _index = 0;

  @override
  void dispose() {
    _pc.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.urls.isEmpty) {
      return const _EmptyBanner(
        icon: Icons.photo_library_outlined,
        text: 'Sin fotos disponibles.',
        color: AppTheme.info,
      );
    }
    final borderColor = Theme.of(context).extension<AppColors>()!.border;
    final muted = Theme.of(context).extension<AppColors>()!.muted;

    return Column(
      children: [
        SizedBox(
          height: 240,
          child: PageView.builder(
            controller: _pc,
            itemCount: widget.urls.length,
            onPageChanged: (i) => setState(() => _index = i),
            itemBuilder: (context, i) {
              final url = widget.urls[i];
              final label = widget.labels.length > i ? widget.labels[i] : null;
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(14),
                  child: Container(
                    color: borderColor,
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        GestureDetector(
                          onTap: () => _openFullscreen(context, i),
                          child: Hero(
                            tag: 'inspection-photo-$i-$url',
                            child: AuthedImage(url: url, fit: BoxFit.cover),
                          ),
                        ),
                        if ((label ?? '').isNotEmpty)
                          Positioned(
                            left: 10,
                            bottom: 10,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                              decoration: BoxDecoration(
                                color: Colors.black.withValues(alpha: 0.55),
                                borderRadius: BorderRadius.circular(99),
                              ),
                              child: Text(
                                _humanize(label!),
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ),
                        Positioned(
                          top: 10,
                          right: 10,
                          child: Container(
                            padding: const EdgeInsets.all(6),
                            decoration: BoxDecoration(
                              color: Colors.black.withValues(alpha: 0.55),
                              borderRadius: BorderRadius.circular(99),
                            ),
                            child: const Icon(
                              Icons.zoom_out_map_rounded,
                              size: 14,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 10),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            for (int i = 0; i < widget.urls.length; i++)
              AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                width: i == _index ? 20 : 6,
                height: 6,
                margin: const EdgeInsets.symmetric(horizontal: 3),
                decoration: BoxDecoration(
                  color: i == _index ? AppTheme.brand : muted.withValues(alpha: 0.35),
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          '${_index + 1} / ${widget.urls.length}',
          style: TextStyle(color: muted, fontSize: 12),
        ),
      ],
    );
  }

  void _openFullscreen(BuildContext context, int initial) {
    Navigator.of(context).push(
      PageRouteBuilder<void>(
        opaque: false,
        barrierColor: Colors.black,
        transitionDuration: const Duration(milliseconds: 220),
        pageBuilder: (_, _, _) => _FullscreenGallery(
          urls: widget.urls,
          labels: widget.labels,
          initialIndex: initial,
        ),
        transitionsBuilder: (_, anim, _, child) => FadeTransition(opacity: anim, child: child),
      ),
    );
  }
}

class _FullscreenGallery extends StatefulWidget {
  const _FullscreenGallery({
    required this.urls,
    required this.labels,
    required this.initialIndex,
  });

  final List<String> urls;
  final List<String?> labels;
  final int initialIndex;

  @override
  State<_FullscreenGallery> createState() => _FullscreenGalleryState();
}

class _FullscreenGalleryState extends State<_FullscreenGallery> {
  late final PageController _pc = PageController(initialPage: widget.initialIndex);
  late int _i = widget.initialIndex;

  @override
  void dispose() {
    _pc.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        foregroundColor: Colors.white,
        elevation: 0,
        title: Text('${_i + 1} / ${widget.urls.length}'),
      ),
      body: PageView.builder(
        controller: _pc,
        itemCount: widget.urls.length,
        onPageChanged: (i) => setState(() => _i = i),
        itemBuilder: (context, i) {
          final url = widget.urls[i];
          return InteractiveViewer(
            minScale: 1,
            maxScale: 5,
            child: Center(
              child: Hero(
                tag: 'inspection-photo-$i-$url',
                child: AuthedImage(url: url, fit: BoxFit.contain),
              ),
            ),
          );
        },
      ),
    );
  }
}

// ─── Daños ───────────────────────────────────────────────────────────────────

class _DamageCard extends StatelessWidget {
  const _DamageCard({required this.damage});
  final DamageItem damage;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    final sev = SeverityStyle.of(damage.severity);
    final title = _humanize(damage.label).isNotEmpty
        ? _humanize(damage.label)
        : (damage.position != null ? _humanize(damage.position) : 'Daño');
    final subtitle = <String>[
      if ((damage.label ?? '').isNotEmpty && (damage.position ?? '').isNotEmpty)
        _humanize(damage.position),
      if (damage.confidence != null)
        '${(damage.confidence! * 100).round()}% confianza',
      if (!damage.isNew) 'Preexistente',
    ].join(' · ');

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: sev.color.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(Icons.report_problem_rounded, color: sev.color, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
                  if (subtitle.isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Text(subtitle, style: TextStyle(color: muted, fontSize: 12.5)),
                  ],
                  if ((damage.notes ?? '').isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text(
                      damage.notes!,
                      style: const TextStyle(fontSize: 13, height: 1.4),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 10),
            Text(
              sev.label,
              style: TextStyle(color: sev.color, fontSize: 12, fontWeight: FontWeight.w700),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Revisión (notas del admin) ──────────────────────────────────────────────

class _ReviewCard extends StatelessWidget {
  const _ReviewCard({required this.detail});
  final InspectionDetail detail;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    final subtitleParts = <String>[
      if (detail.reviewedBy != null && detail.reviewedBy!.isNotEmpty) detail.reviewedBy!,
      if (detail.reviewedAt != null && detail.reviewedAt!.isNotEmpty) _fmtDate(detail.reviewedAt),
    ];

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: AppTheme.success.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.rate_review_rounded, color: AppTheme.success, size: 18),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        detail.reviewed ? 'Revisada' : 'Pendiente de revisar',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      if (subtitleParts.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(subtitleParts.join(' · '),
                            style: TextStyle(color: muted, fontSize: 12.5)),
                      ],
                    ],
                  ),
                ),
              ],
            ),
            if ((detail.adminNotes ?? '').isNotEmpty) ...[
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Theme.of(context).extension<AppColors>()!.border,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  detail.adminNotes!,
                  style: const TextStyle(fontSize: 13.5, height: 1.45),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// ─── Secciones auxiliares ────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, this.trailing});
  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: Text(title, style: Theme.of(context).textTheme.titleMedium)),
        ?trailing,
      ],
    );
  }
}

class _AnnotatedToggle extends StatelessWidget {
  const _AnnotatedToggle({required this.value, required this.onChanged});
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text('Anotadas', style: TextStyle(color: muted, fontSize: 12.5)),
        const SizedBox(width: 6),
        Switch(
          value: value,
          onChanged: onChanged,
        ),
      ],
    );
  }
}

class _CountPill extends StatelessWidget {
  const _CountPill({required this.count, required this.color});
  final int count;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(
        '$count',
        style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w800),
      ),
    );
  }
}

class _EmptyBanner extends StatelessWidget {
  const _EmptyBanner({required this.icon, required this.text, required this.color});
  final IconData icon;
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: color, size: 18),
            ),
            const SizedBox(width: 12),
            Expanded(child: Text(text, style: TextStyle(color: muted))),
          ],
        ),
      ),
    );
  }
}

class _LoadingSkeleton extends StatelessWidget {
  const _LoadingSkeleton();
  @override
  Widget build(BuildContext context) {
    return Shimmer(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: const [
          SkeletonBox(height: 140, radius: 16),
          SizedBox(height: 20),
          SkeletonBox(width: 90, height: 18),
          SizedBox(height: 12),
          SkeletonBox(height: 240, radius: 14),
          SizedBox(height: 22),
          SkeletonBox(width: 90, height: 18),
          SizedBox(height: 12),
          SkeletonBox(height: 72, radius: 14),
          SizedBox(height: 10),
          SkeletonBox(height: 72, radius: 14),
        ],
      ),
    );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

String _fmtDate(String? iso) {
  if (iso == null || iso.isEmpty) return '—';
  final d = DateTime.tryParse(iso);
  if (d == null) return iso;
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(d.day)}/${two(d.month)}/${d.year} · ${two(d.hour)}:${two(d.minute)}';
}

String _humanize(String? s) {
  if (s == null || s.isEmpty) return '';
  final clean = s.replaceAll('_', ' ').trim();
  if (clean.isEmpty) return '';
  return clean[0].toUpperCase() + clean.substring(1);
}
