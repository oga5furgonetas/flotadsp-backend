import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_theme.dart';
import '../domain/vehicle.dart';
import 'fleet_providers.dart';

// ─────────────────────────── API pública ───────────────────────────

Future<void> showUpdateMileageSheet(BuildContext context, {required String vehicleId, int? currentKm}) {
  return _showSheet(context, _MileageSheet(vehicleId: vehicleId, currentKm: currentKm));
}

Future<void> showRegisterMaintenanceSheet(
  BuildContext context, {
  required String vehicleId,
  required String kind,
  required String label,
  int? currentKm,
}) {
  return _showSheet(
    context,
    _MaintenanceSheet(vehicleId: vehicleId, kind: kind, label: label, currentKm: currentKm),
  );
}

Future<void> showEditVehicleSheet(BuildContext context, {required Vehicle vehicle}) {
  return _showSheet(context, _EditVehicleSheet(vehicle: vehicle));
}

Future<void> showUploadDocumentSheet(BuildContext context, {required String vehicleId}) {
  return _showSheet(context, _UploadDocumentSheet(vehicleId: vehicleId));
}

// ─────────────────────────── Infra compartida ───────────────────────────

Future<void> _showSheet(BuildContext context, Widget child) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => child,
  );
}

class _SheetShell extends StatelessWidget {
  const _SheetShell({required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
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
              Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              const SizedBox(height: 16),
              ...children,
            ],
          ),
        ),
      ),
    );
  }
}

void _toast(BuildContext context, String msg) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(msg)));
}

String _errText(Object e) => e is ApiException ? e.message : 'No se pudo completar la operación.';

// ─────────────────────────── Actualizar km ───────────────────────────

class _MileageSheet extends ConsumerStatefulWidget {
  const _MileageSheet({required this.vehicleId, this.currentKm});
  final String vehicleId;
  final int? currentKm;

  @override
  ConsumerState<_MileageSheet> createState() => _MileageSheetState();
}

class _MileageSheetState extends ConsumerState<_MileageSheet> {
  late final _controller = TextEditingController(text: widget.currentKm?.toString() ?? '');
  bool _busy = false;
  bool _reading = false;
  String? _hint;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _readFromCamera() async {
    setState(() {
      _reading = true;
      _hint = null;
    });
    try {
      final img = await ImagePicker().pickImage(source: ImageSource.camera, imageQuality: 85);
      if (img == null) return;
      final bytes = await img.readAsBytes();
      final read = await ref
          .read(fleetRepositoryProvider)
          .readOdometerPhoto(widget.vehicleId, bytes, img.name);
      if (!mounted) return;
      if (read.success && read.km != null) {
        _controller.text = read.km.toString();
        setState(() => _hint = 'Leído por IA: ${read.km} km'
            '${read.warning != null ? ' · ${read.warning}' : ''}');
      } else {
        setState(() => _hint = read.warning ?? 'No se pudo leer. Introdúcelo a mano.');
      }
    } catch (e) {
      if (mounted) setState(() => _hint = _errText(e));
    } finally {
      if (mounted) setState(() => _reading = false);
    }
  }

  Future<void> _save() async {
    final km = int.tryParse(_controller.text.trim());
    if (km == null || km <= 0) {
      setState(() => _hint = 'Introduce un número de km válido');
      return;
    }
    setState(() => _busy = true);
    try {
      await ref.read(fleetRepositoryProvider).updateMileage(widget.vehicleId, km);
      ref.invalidate(vehicleByIdProvider(widget.vehicleId));
      ref.invalidate(vehicleMaintenanceProvider(widget.vehicleId));
      ref.invalidate(vehiclesProvider);
      if (!mounted) return;
      Navigator.of(context).pop();
      _toast(context, 'Kilómetros actualizados');
    } catch (e) {
      if (mounted) setState(() => _hint = _errText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    return _SheetShell(
      title: 'Actualizar kilómetros',
      children: [
        TextField(
          controller: _controller,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          autofocus: true,
          decoration: const InputDecoration(labelText: 'Kilómetros', suffixText: 'km'),
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: _reading ? null : _readFromCamera,
          icon: _reading
              ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.camera_alt_rounded),
          label: Text(_reading ? 'Leyendo…' : 'Leer con la cámara (IA)'),
          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
        ),
        if (_hint != null) ...[
          const SizedBox(height: 10),
          Text(_hint!, style: TextStyle(color: muted, fontSize: 12.5)),
        ],
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _busy ? null : _save,
          child: _busy
              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white))
              : const Text('Guardar'),
        ),
      ],
    );
  }
}

// ─────────────────────────── Registrar mantenimiento ───────────────────────────

class _MaintenanceSheet extends ConsumerStatefulWidget {
  const _MaintenanceSheet({required this.vehicleId, required this.kind, required this.label, this.currentKm});
  final String vehicleId;
  final String kind;
  final String label;
  final int? currentKm;

  @override
  ConsumerState<_MaintenanceSheet> createState() => _MaintenanceSheetState();
}

class _MaintenanceSheetState extends ConsumerState<_MaintenanceSheet> {
  late final _kmController = TextEditingController(text: widget.currentKm?.toString() ?? '');
  bool _busy = false;
  String? _hint;

  @override
  void dispose() {
    _kmController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final km = int.tryParse(_kmController.text.trim());
    if (km == null || km <= 0) {
      setState(() => _hint = 'Introduce los km del cambio');
      return;
    }
    setState(() => _busy = true);
    try {
      await ref.read(fleetRepositoryProvider).registerMaintenance(widget.vehicleId, widget.kind, km: km);
      ref.invalidate(vehicleMaintenanceProvider(widget.vehicleId));
      ref.invalidate(vehicleByIdProvider(widget.vehicleId));
      if (!mounted) return;
      Navigator.of(context).pop();
      _toast(context, '${widget.label}: cambio registrado');
    } catch (e) {
      if (mounted) setState(() => _hint = _errText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    return _SheetShell(
      title: 'Registrar ${widget.label.toLowerCase()}',
      children: [
        Text('Kilómetros a los que se hizo el cambio', style: TextStyle(color: muted, fontSize: 13)),
        const SizedBox(height: 8),
        TextField(
          controller: _kmController,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          autofocus: true,
          decoration: const InputDecoration(labelText: 'Kilómetros del cambio', suffixText: 'km'),
        ),
        if (_hint != null) ...[
          const SizedBox(height: 10),
          Text(_hint!, style: const TextStyle(color: AppTheme.danger, fontSize: 12.5)),
        ],
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _busy ? null : _save,
          child: _busy
              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white))
              : const Text('Registrar cambio'),
        ),
      ],
    );
  }
}

// ─────────────────────────── Editar vehículo ───────────────────────────

class _EditVehicleSheet extends ConsumerStatefulWidget {
  const _EditVehicleSheet({required this.vehicle});
  final Vehicle vehicle;

  @override
  ConsumerState<_EditVehicleSheet> createState() => _EditVehicleSheetState();
}

class _EditVehicleSheetState extends ConsumerState<_EditVehicleSheet> {
  late String _status = widget.vehicle.status;
  late final _centerController = TextEditingController(text: widget.vehicle.center ?? '');
  late final _providerController = TextEditingController(text: widget.vehicle.provider ?? '');
  late final _reasonController = TextEditingController(text: widget.vehicle.workshopReason ?? '');
  late DateTime? _itv = _parse(widget.vehicle.itvDate);
  late DateTime? _renting = _parse(widget.vehicle.rentingEndDate);
  bool _busy = false;
  String? _hint;

  static DateTime? _parse(String? iso) => iso == null ? null : DateTime.tryParse(iso);

  @override
  void dispose() {
    _centerController.dispose();
    _providerController.dispose();
    _reasonController.dispose();
    super.dispose();
  }

  Future<void> _pickDate(bool itv) async {
    final now = DateTime.now();
    final initial = (itv ? _itv : _renting) ?? now;
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(now.year - 5),
      lastDate: DateTime(now.year + 15),
    );
    if (picked != null) setState(() => itv ? _itv = picked : _renting = picked);
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    final fields = <String, dynamic>{
      'status': _status,
      'center': _centerController.text.trim(),
      'provider': _providerController.text.trim(),
      'workshop_reason': _status == 'taller' ? _reasonController.text.trim() : '',
      if (_itv != null) 'itv_date': _iso(_itv!),
      if (_renting != null) 'renting_end_date': _iso(_renting!),
    };
    try {
      await ref.read(fleetRepositoryProvider).patchVehicle(widget.vehicle.id, fields);
      ref.invalidate(vehicleByIdProvider(widget.vehicle.id));
      ref.invalidate(vehiclesProvider);
      if (!mounted) return;
      Navigator.of(context).pop();
      _toast(context, 'Vehículo actualizado');
    } catch (e) {
      if (mounted) setState(() => _hint = _errText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  static String _iso(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    return _SheetShell(
      title: 'Editar ${widget.vehicle.title}',
      children: [
        DropdownButtonFormField<String>(
          initialValue: _status,
          decoration: const InputDecoration(labelText: 'Estado'),
          items: const [
            DropdownMenuItem(value: 'active', child: Text('Disponible')),
            DropdownMenuItem(value: 'taller', child: Text('En taller')),
            DropdownMenuItem(value: 'baja', child: Text('De baja')),
          ],
          onChanged: (v) => setState(() => _status = v ?? _status),
        ),
        if (_status == 'taller') ...[
          const SizedBox(height: 12),
          TextField(
            controller: _reasonController,
            decoration: const InputDecoration(labelText: 'Motivo del taller'),
          ),
        ],
        const SizedBox(height: 12),
        TextField(
          controller: _centerController,
          decoration: const InputDecoration(labelText: 'Centro'),
        ),
        const SizedBox(height: 12),
        _DateField(label: 'ITV (caducidad)', value: _itv, onTap: () => _pickDate(true)),
        const SizedBox(height: 12),
        TextField(
          controller: _providerController,
          decoration: const InputDecoration(labelText: 'Proveedor de renting'),
        ),
        const SizedBox(height: 12),
        _DateField(label: 'Fin de renting', value: _renting, onTap: () => _pickDate(false)),
        if (_hint != null) ...[
          const SizedBox(height: 10),
          Text(_hint!, style: const TextStyle(color: AppTheme.danger, fontSize: 12.5)),
        ],
        const SizedBox(height: 18),
        FilledButton(
          onPressed: _busy ? null : _save,
          child: _busy
              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white))
              : const Text('Guardar cambios'),
        ),
      ],
    );
  }
}

class _DateField extends StatelessWidget {
  const _DateField({required this.label, required this.value, required this.onTap});
  final String label;
  final DateTime? value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final text = value == null
        ? 'Sin fecha'
        : '${value!.day.toString().padLeft(2, '0')}/${value!.month.toString().padLeft(2, '0')}/${value!.year}';
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: InputDecorator(
        decoration: InputDecoration(labelText: label, suffixIcon: const Icon(Icons.calendar_today_rounded, size: 18)),
        child: Text(text),
      ),
    );
  }
}

// ─────────────────────────── Subir documento ───────────────────────────

class _UploadDocumentSheet extends ConsumerStatefulWidget {
  const _UploadDocumentSheet({required this.vehicleId});
  final String vehicleId;

  @override
  ConsumerState<_UploadDocumentSheet> createState() => _UploadDocumentSheetState();
}

class _UploadDocumentSheetState extends ConsumerState<_UploadDocumentSheet> {
  final _typeController = TextEditingController();
  bool _busy = false;
  String? _hint;
  PlatformFile? _file;

  static const _presets = ['Permiso de circulación', 'Ficha técnica', 'Seguro', 'ITV', 'Contrato renting'];

  @override
  void dispose() {
    _typeController.dispose();
    super.dispose();
  }

  Future<void> _pick() async {
    final res = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['pdf', 'jpg', 'jpeg', 'png', 'webp'],
      withData: true,
    );
    if (res != null && res.files.isNotEmpty) {
      setState(() {
        _file = res.files.single;
        _hint = null;
      });
    }
  }

  Future<void> _save() async {
    final type = _typeController.text.trim();
    if (type.isEmpty) {
      setState(() => _hint = 'Indica el tipo de documento');
      return;
    }
    if (_file == null || _file!.bytes == null) {
      setState(() => _hint = 'Selecciona un archivo');
      return;
    }
    setState(() => _busy = true);
    try {
      await ref.read(fleetRepositoryProvider).uploadDocument(
            widget.vehicleId,
            type,
            _file!.bytes!,
            _file!.name,
          );
      ref.invalidate(vehicleDocumentsProvider(widget.vehicleId));
      if (!mounted) return;
      Navigator.of(context).pop();
      _toast(context, 'Documento subido');
    } catch (e) {
      if (mounted) setState(() => _hint = _errText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    return _SheetShell(
      title: 'Subir documento',
      children: [
        TextField(
          controller: _typeController,
          decoration: const InputDecoration(labelText: 'Tipo de documento'),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final p in _presets)
              ActionChip(label: Text(p), onPressed: () => setState(() => _typeController.text = p)),
          ],
        ),
        const SizedBox(height: 14),
        OutlinedButton.icon(
          onPressed: _pick,
          icon: const Icon(Icons.attach_file_rounded),
          label: Text(_file?.name ?? 'Seleccionar archivo (PDF/imagen)'),
          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
        ),
        if (_hint != null) ...[
          const SizedBox(height: 10),
          Text(_hint!, style: TextStyle(color: muted, fontSize: 12.5)),
        ],
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _busy ? null : _save,
          child: _busy
              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white))
              : const Text('Subir'),
        ),
      ],
    );
  }
}
