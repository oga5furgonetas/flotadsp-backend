import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../../core/theme/app_theme.dart';

/// Bloque de QR del VIN dentro de la ficha: se ve integrado y, al tocarlo, se
/// abre a pantalla completa para escanearlo o imprimirlo (fondo blanco siempre,
/// para que lea bien incluso en modo oscuro).
class VinQr extends StatelessWidget {
  const VinQr({super.key, required this.vin, this.plate});

  final String vin;
  final String? plate;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).extension<AppColors>()!.muted;
    return Center(
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => _openFull(context),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: const Color(0x14000000)),
              ),
              child: QrImageView(
                data: vin,
                size: 132,
                version: QrVersions.auto,
                backgroundColor: Colors.white,
                // Colores explícitos: negro sobre blanco = máxima legibilidad.
                eyeStyle: const QrEyeStyle(eyeShape: QrEyeShape.square, color: Colors.black),
                dataModuleStyle: const QrDataModuleStyle(
                  dataModuleShape: QrDataModuleShape.square,
                  color: Colors.black,
                ),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.qr_code_2_rounded, size: 14, color: muted),
                const SizedBox(width: 5),
                Text('Toca para ampliar y escanear', style: TextStyle(color: muted, fontSize: 12)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _openFull(BuildContext context) {
    showDialog<void>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.85),
      builder: (ctx) => Dialog(
        backgroundColor: Colors.transparent,
        insetPadding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if ((plate ?? '').isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text(plate!,
                          style: const TextStyle(color: Colors.black, fontSize: 20, fontWeight: FontWeight.w900)),
                    ),
                  QrImageView(
                    data: vin,
                    size: 260,
                    version: QrVersions.auto,
                    backgroundColor: Colors.white,
                    eyeStyle: const QrEyeStyle(eyeShape: QrEyeShape.square, color: Colors.black),
                    dataModuleStyle: const QrDataModuleStyle(
                      dataModuleShape: QrDataModuleShape.square,
                      color: Colors.black,
                    ),
                  ),
                  const SizedBox(height: 14),
                  const Text('VIN', style: TextStyle(color: Colors.black45, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1)),
                  const SizedBox(height: 2),
                  SelectableText(
                    vin,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: Colors.black,
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: () => Navigator.of(ctx).pop(),
              icon: const Icon(Icons.close_rounded),
              label: const Text('Cerrar'),
              style: FilledButton.styleFrom(backgroundColor: AppTheme.brand),
            ),
          ],
        ),
      ),
    );
  }
}
