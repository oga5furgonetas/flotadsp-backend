import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../dashboard/presentation/dashboard_providers.dart';
import '../domain/inspection_detail.dart';
import 'inspection_providers.dart';

/// Hoja modal para revisar rápidamente una inspección: alternar el estado
/// revisada/pendiente y añadir notas administrativas. Al guardar invalida
/// los providers de detalle, dashboard y flota para que los contadores
/// reflejen el cambio en toda la app.
class ReviewSheet extends ConsumerStatefulWidget {
  const ReviewSheet._({required this.detail});

  final InspectionDetail detail;

  /// Abre la hoja y resuelve `true` si el usuario guardó cambios.
  static Future<bool?> show(BuildContext context, InspectionDetail detail) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => Padding(
        // Espacio para el teclado cuando aparece el TextField.
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
        child: ReviewSheet._(detail: detail),
      ),
    );
  }

  @override
  ConsumerState<ReviewSheet> createState() => _ReviewSheetState();
}

class _ReviewSheetState extends ConsumerState<ReviewSheet> {
  late bool _reviewed = widget.detail.reviewed;
  late final TextEditingController _notesCtrl =
      TextEditingController(text: widget.detail.adminNotes ?? '');
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final repo = ref.read(inspectionRepositoryProvider);
      final notes = _notesCtrl.text.trim();
      await repo.markReviewed(
        widget.detail.id,
        reviewed: _reviewed,
        adminNotes: notes.isEmpty ? null : notes,
      );
      // Refresca detalle + resumen + inspecciones del vehículo.
      ref.invalidate(inspectionDetailProvider(widget.detail.id));
      ref.invalidate(dashboardStatsProvider);
      final vId = widget.detail.vehicleId;
      if (vId != null && vId.isNotEmpty) {
        ref.invalidate(vehicleInspectionsProvider(vId));
      }
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = e.toString();
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.rate_review_rounded, color: AppTheme.brand),
              const SizedBox(width: 10),
              Text('Revisión rápida', style: Theme.of(context).textTheme.titleLarge),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'Marca la inspección como revisada y añade notas para el equipo.',
            style: TextStyle(color: muted, fontSize: 13),
          ),
          const SizedBox(height: 18),
          Card(
            margin: EdgeInsets.zero,
            child: SwitchListTile(
              value: _reviewed,
              onChanged: _saving ? null : (v) => setState(() => _reviewed = v),
              title: const Text('Marcada como revisada'),
              subtitle: Text(
                _reviewed ? 'Aparecerá como cerrada en el resumen' : 'Sigue pendiente de revisar',
                style: TextStyle(color: muted, fontSize: 12.5),
              ),
              secondary: Icon(
                _reviewed ? Icons.check_circle_rounded : Icons.schedule_rounded,
                color: _reviewed ? AppTheme.success : muted,
              ),
            ),
          ),
          const SizedBox(height: 14),
          Text(
            'Notas administrativas',
            style: TextStyle(color: muted, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.6),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _notesCtrl,
            enabled: !_saving,
            maxLines: 4,
            minLines: 3,
            textInputAction: TextInputAction.newline,
            decoration: const InputDecoration(
              hintText: 'Opcional. Ej.: "Enviado a taller el 06/07"',
              border: OutlineInputBorder(),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppTheme.danger.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                children: [
                  const Icon(Icons.error_outline_rounded, color: AppTheme.danger, size: 18),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(_error!, style: const TextStyle(color: AppTheme.danger, fontSize: 13)),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: _saving ? null : () => Navigator.of(context).pop(false),
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                  child: const Text('Cancelar'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton.icon(
                  onPressed: _saving ? null : _save,
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                  icon: _saving
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.check_rounded, size: 18),
                  label: Text(_saving ? 'Guardando…' : 'Guardar'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
