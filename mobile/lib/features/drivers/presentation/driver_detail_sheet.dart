import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_theme.dart';
import '../domain/driver_profile.dart';
import 'drivers_screen.dart';

/// Abre la ficha editable de un conductor.
Future<void> showDriverDetailSheet(BuildContext context, {required String driverId, String? name}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => _DriverDetailSheet(driverId: driverId, fallbackName: name),
  );
}

class _DriverDetailSheet extends ConsumerStatefulWidget {
  const _DriverDetailSheet({required this.driverId, this.fallbackName});
  final String driverId;
  final String? fallbackName;

  @override
  ConsumerState<_DriverDetailSheet> createState() => _DriverDetailSheetState();
}

class _DriverDetailSheetState extends ConsumerState<_DriverDetailSheet> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _center = TextEditingController();
  final _dni = TextEditingController();
  final _zona = TextEditingController();
  final _notas = TextEditingController();
  String? _contrato;
  String? _nivel;
  bool _active = true;
  bool _ready = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_name, _phone, _email, _center, _dni, _zona, _notas]) {
      c.dispose();
    }
    super.dispose();
  }

  void _fill(DriverProfile p) {
    _name.text = p.name;
    _phone.text = p.phone ?? '';
    _email.text = p.email ?? '';
    _center.text = p.center ?? '';
    _dni.text = p.dni ?? '';
    _zona.text = p.zona ?? '';
    _notas.text = p.notas ?? '';
    _contrato = p.contrato;
    _nivel = p.nivel;
    _active = p.active;
    _ready = true;
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    final fields = <String, dynamic>{
      'name': _name.text.trim(),
      'phone': _phone.text.trim(),
      'email': _email.text.trim(),
      'center': _center.text.trim(),
      'dni': _dni.text.trim(),
      'zona': _zona.text.trim(),
      'notas': _notas.text.trim(),
      'active': _active,
      if (_contrato != null) 'contrato': _contrato,
      if (_nivel != null) 'nivel': _nivel,
    };
    try {
      await ref.read(driversRepoProvider).update(widget.driverId, fields);
      ref.invalidate(driversListProvider);
      ref.invalidate(driversRankingProvider);
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Conductor actualizado')));
    } catch (e) {
      if (mounted) setState(() => _error = e is ApiException ? e.message : 'No se pudo guardar');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _dial() async {
    final phone = _phone.text.trim();
    if (phone.isEmpty) return;
    final uri = Uri(scheme: 'tel', path: phone.replaceAll(' ', ''));
    if (await canLaunchUrl(uri)) await launchUrl(uri);
  }

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    final async = ref.watch(driversListProvider);

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: async.when(
        loading: () => const SizedBox(height: 220, child: Center(child: CircularProgressIndicator())),
        error: (_, _) => SizedBox(
          height: 200,
          child: Center(child: Text('No se pudo cargar', style: TextStyle(color: muted))),
        ),
        data: (list) {
          DriverProfile? profile;
          for (final d in list) {
            if (d.id == widget.driverId) {
              profile = d;
              break;
            }
          }
          if (profile == null) {
            return SizedBox(
              height: 200,
              child: Center(child: Text('Conductor no encontrado', style: TextStyle(color: muted))),
            );
          }
          if (!_ready) _fill(profile);

          return SingleChildScrollView(
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
                  Row(
                    children: [
                      CircleAvatar(
                        radius: 22,
                        backgroundColor: AppTheme.brand.withValues(alpha: 0.15),
                        child: Text(
                          profile.name.isNotEmpty ? profile.name[0].toUpperCase() : '?',
                          style: const TextStyle(color: AppTheme.brand, fontWeight: FontWeight.w800, fontSize: 18),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(profile.name.isNotEmpty ? profile.name : 'Conductor',
                            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                      ),
                      if (_phone.text.trim().isNotEmpty)
                        IconButton(
                          icon: const Icon(Icons.call_rounded, color: AppTheme.success),
                          onPressed: _dial,
                        ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  _field(_name, 'Nombre'),
                  _field(_phone, 'Teléfono', keyboard: TextInputType.phone),
                  _field(_email, 'Email', keyboard: TextInputType.emailAddress),
                  _field(_center, 'Centro'),
                  _field(_dni, 'DNI'),
                  Row(
                    children: [
                      Expanded(
                        child: DropdownButtonFormField<String>(
                          initialValue: _contrato,
                          isExpanded: true,
                          decoration: const InputDecoration(labelText: 'Contrato'),
                          items: const [
                            DropdownMenuItem(value: 'empresa', child: Text('Empresa')),
                            DropdownMenuItem(value: 'ett', child: Text('ETT')),
                          ],
                          onChanged: (v) => setState(() => _contrato = v),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: DropdownButtonFormField<String>(
                          initialValue: _nivel,
                          isExpanded: true,
                          decoration: const InputDecoration(labelText: 'Nivel'),
                          items: const [
                            DropdownMenuItem(value: 'pleno', child: Text('Pleno')),
                            DropdownMenuItem(value: 'L1', child: Text('L1')),
                            DropdownMenuItem(value: 'L2', child: Text('L2')),
                            DropdownMenuItem(value: 'L3', child: Text('L3')),
                          ],
                          onChanged: (v) => setState(() => _nivel = v),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  _field(_zona, 'Zona'),
                  _field(_notas, 'Notas', maxLines: 3),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Activo'),
                    value: _active,
                    activeThumbColor: AppTheme.brand,
                    onChanged: (v) => setState(() => _active = v),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 6),
                    Text(_error!, style: const TextStyle(color: AppTheme.danger, fontSize: 12.5)),
                  ],
                  const SizedBox(height: 14),
                  FilledButton(
                    onPressed: _busy ? null : _save,
                    child: _busy
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white))
                        : const Text('Guardar cambios'),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _field(TextEditingController c, String label, {TextInputType? keyboard, int maxLines = 1}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        controller: c,
        keyboardType: keyboard,
        maxLines: maxLines,
        decoration: InputDecoration(labelText: label),
      ),
    );
  }
}
